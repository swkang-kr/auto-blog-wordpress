import axios from 'axios';
import { logger } from '../utils/logger.js';
import { buildUtmUrl, extractSlugFromUrl, resolvePostUrl } from '../utils/utm.js';
import type { BlogContent, PublishedPost } from '../types/index.js';

const THREADS_API = 'https://graph.threads.net/v1.0';

/**
 * Meta Threads API integration.
 * Flow: create text container → publish container.
 * Ref: https://developers.facebook.com/docs/threads/posts
 */
export class ThreadsService {
  constructor(
    private readonly accessToken: string,
    private readonly userId: string,
  ) {}

  /**
   * Post blog article to Threads.
   *
   * Always uses media_type=TEXT with the blog URL in the body.
   * Threads automatically renders the URL as a clickable rich link preview card
   * (pulling OG:image, title, description from the blog page).
   * Clicking the preview image/card navigates to the blog post.
   *
   * Note: media_type=IMAGE posts do NOT support click-through links — the image
   * is non-interactive. The link preview approach is the correct pattern for
   * blog promotion on Threads.
   *
   * @param _imageUrl - ignored (kept for API compatibility; OG image is used automatically)
   */
  async promoteBlogPost(content: BlogContent, post: PublishedPost, _imageUrl?: string): Promise<string | null> {
    const resolvedUrl = resolvePostUrl(post);
    const isUnresolved = resolvedUrl.includes('?p=') || resolvedUrl.includes('&p=');
    if (isUnresolved) {
      logger.warn(`Threads: skipping post ${post.postId} — cannot resolve pretty URL (post may be scheduled)`);
      return null;
    }

    const slug = extractSlugFromUrl(resolvedUrl);
    const utmUrl = buildUtmUrl(resolvedUrl, {
      source: 'threads',
      medium: 'social',
      campaign: slug,
      content: 'thread-post',
      term: content.tags[0] || '',
    });

    const text = this.buildThreadText(content, utmUrl);

    try {
      const threadId = await this.publishTextPost(text);
      if (threadId) logger.info(`Threads post published: ${threadId} — "${content.title}" [link preview]`);
      return threadId;
    } catch (error) {
      const msg = axios.isAxiosError(error)
        ? JSON.stringify(error.response?.data)
        : String(error);
      logger.warn(`Threads post failed (non-critical): ${msg}`);
      return null;
    }
  }

  /** Publish a TEXT container. The URL in the text renders as a clickable link preview card. */
  private async publishTextPost(text: string): Promise<string | null> {
    const creationId = await this.createContainer({ media_type: 'TEXT', text });
    return creationId ? this.publishContainer(creationId) : null;
  }

  /** Step 1: Create a Threads media container. Returns creation_id. */
  private async createContainer(params: Record<string, string>): Promise<string | null> {
    const res = await axios.post(
      `${THREADS_API}/${this.userId}/threads`,
      null,
      {
        params: { ...params, access_token: this.accessToken },
        timeout: 15000,
      },
    );
    const creationId: string = res.data?.id;
    if (!creationId) logger.warn('Threads: container creation returned no ID');
    return creationId || null;
  }

  /**
   * Step 1.5: Poll container status until FINISHED (required before publish).
   * Threads API requires this especially for image/video, but also for text.
   * Ref: https://developers.facebook.com/docs/threads/posts#step-3--check-the-status-of-the-threads-media-container
   */
  private async waitForContainer(creationId: string, maxWaitMs = 30000): Promise<boolean> {
    const interval = 2000;
    const start = Date.now();
    while (Date.now() - start < maxWaitMs) {
      await new Promise(r => setTimeout(r, interval));
      try {
        const res = await axios.get(`${THREADS_API}/${creationId}`, {
          params: { fields: 'status,error_message', access_token: this.accessToken },
          timeout: 10000,
        });
        const status: string = res.data?.status;
        logger.debug(`Threads container ${creationId} status: ${status}`);
        if (status === 'FINISHED') return true;
        if (status === 'ERROR' || status === 'EXPIRED') {
          logger.warn(`Threads container ${creationId} failed with status: ${status} — ${res.data?.error_message || ''}`);
          return false;
        }
        // IN_PROGRESS → keep polling
      } catch {
        // ignore transient errors during polling
      }
    }
    logger.warn(`Threads container ${creationId} did not finish within ${maxWaitMs}ms`);
    return false;
  }

  /** Step 2: Publish a container by creation_id. Returns published thread ID. */
  private async publishContainer(creationId: string): Promise<string | null> {
    const ready = await this.waitForContainer(creationId);
    if (!ready) return null;

    const res = await axios.post(
      `${THREADS_API}/${this.userId}/threads_publish`,
      null,
      {
        params: { creation_id: creationId, access_token: this.accessToken },
        timeout: 15000,
      },
    );
    return res.data?.id || null;
  }

  /**
   * Build thread text within the 500-character Threads limit.
   * Format: emoji + title + excerpt snippet + hashtags + url
   */
  private buildThreadText(content: BlogContent, url: string): string {
    const emoji = this.nicheEmoji(content.category);
    const hashtags = [
      ...content.tags.slice(0, 3).map(t => `#${t.replace(/\s+/g, '')}`),
      `#${content.category.replace(/\s+/g, '')}`,
      '#TrendHunt',
    ].join(' ');

    // Threads hard limit: 500 chars
    const suffix = `\n\n${hashtags}\n\n${url}`;
    const maxBodyLen = 500 - suffix.length - emoji.length - 1; // 1 = " " separator
    const body = (content.excerpt || content.title).slice(0, Math.max(0, maxBodyLen));

    let text = `${emoji} ${body}${suffix}`;

    // Safety: if still over 500 (e.g. long URL or emoji width miscalculation), trim body
    if (text.length > 500) {
      const excess = text.length - 500;
      const trimmedBody = body.slice(0, Math.max(0, body.length - excess - 3));
      text = `${emoji} ${trimmedBody}…${suffix}`;
    }

    return text;
  }

  private nicheEmoji(category: string): string {
    const map: Record<string, string> = {
      '시장분석': '📊',
      '업종분석': '🏭',
      '테마분석': '🔍',
      '종목분석': '📈',
    };
    return map[category] || '📝';
  }
}
