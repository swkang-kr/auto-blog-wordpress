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

  /** Post blog article to Threads (text post with UTM link embedded). */
  async promoteBlogPost(content: BlogContent, post: PublishedPost): Promise<string | null> {
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
      // Step 1: Create media container
      const createRes = await axios.post(
        `${THREADS_API}/${this.userId}/threads`,
        null,
        {
          params: {
            media_type: 'TEXT',
            text,
            access_token: this.accessToken,
          },
          timeout: 15000,
        },
      );
      const creationId: string = createRes.data?.id;
      if (!creationId) {
        logger.warn('Threads: container creation returned no ID');
        return null;
      }

      // Step 2: Publish the container
      const publishRes = await axios.post(
        `${THREADS_API}/${this.userId}/threads_publish`,
        null,
        {
          params: {
            creation_id: creationId,
            access_token: this.accessToken,
          },
          timeout: 15000,
        },
      );
      const threadId: string = publishRes.data?.id;
      logger.info(`Threads post published: ${threadId} — "${content.title}"`);
      return threadId;
    } catch (error) {
      const msg = axios.isAxiosError(error)
        ? JSON.stringify(error.response?.data)
        : String(error);
      logger.warn(`Threads post failed (non-critical): ${msg}`);
      return null;
    }
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
    const maxBodyLen = 500 - suffix.length - emoji.length - 3; // 3 = " " + "\n\n"
    const body = (content.excerpt || content.title).slice(0, maxBodyLen);

    return `${emoji} ${body}${suffix}`;
  }

  private nicheEmoji(category: string): string {
    const map: Record<string, string> = {
      'K-Beauty': '✨',
      'K-Entertainment': '🎵',
    };
    return map[category] || '📝';
  }
}
