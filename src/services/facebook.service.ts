import axios from 'axios';
import { logger } from '../utils/logger.js';
import { buildUtmUrl, extractSlugFromUrl, resolvePostUrl, type UtmParams } from '../utils/utm.js';
import type { BlogContent, PublishedPost } from '../types/index.js';

const GRAPH_API_VERSION = process.env.FACEBOOK_GRAPH_API_VERSION || 'v22.0';
const GRAPH_API = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

export class FacebookService {
  constructor(
    private readonly accessToken: string,
    private readonly pageId: string,
  ) {}

  /** Post blog article to Facebook Page with link preview + caption */
  async promoteBlogPost(content: BlogContent, post: PublishedPost): Promise<string | null> {
    // Resolve pretty permalink — ?p=ID URLs are not publicly accessible (scheduled posts)
    const resolvedUrl = resolvePostUrl(post);
    const isUnresolved = resolvedUrl.includes('?p=') || resolvedUrl.includes('&p=');
    if (isUnresolved) {
      logger.warn(`Facebook: skipping post ${post.postId} — cannot resolve pretty URL (post may be scheduled)`);
      return null;
    }
    const slug = extractSlugFromUrl(resolvedUrl);
    const utmParams: UtmParams = {
      source: 'facebook',
      medium: 'social',
      campaign: slug,
      content: 'page-post',
      term: content.tags[0] || '',
    };
    const utmUrl = buildUtmUrl(resolvedUrl, utmParams);
    const message = this.buildCaption(content, utmUrl);

    try {
      // Force Facebook to scrape/refresh OG tags before posting the link.
      // Without this, newly published posts may appear without an image
      // because Facebook's OG cache hasn't fetched the page yet.
      await this.scrapeUrl(resolvedUrl);

      const res = await axios.post(
        `${GRAPH_API}/${this.pageId}/feed`,
        {
          message,
          link: utmUrl,
        },
        {
          params: { access_token: this.accessToken },
        },
      );
      const postId: string = res.data.id;
      logger.info(`Facebook post published: ${postId} — "${content.title}"`);
      return postId;
    } catch (error) {
      const status = axios.isAxiosError(error) ? error.response?.status : 0;
      const msg = axios.isAxiosError(error) ? JSON.stringify(error.response?.data) : String(error);
      // Retry once on transient errors (503, 429, network timeout)
      if (status === 503 || status === 429 || msg.includes('ETIMEDOUT') || msg.includes('ECONNRESET')) {
        logger.info('Facebook: Retrying after transient error...');
        await new Promise(r => setTimeout(r, 5000));
        try {
          const retryRes = await axios.post(`${GRAPH_API}/${this.pageId}/feed`, { message, link: utmUrl }, { params: { access_token: this.accessToken } });
          const retryId: string = retryRes.data.id;
          logger.info(`Facebook post published (retry): ${retryId} — "${content.title}"`);
          return retryId;
        } catch { /* retry failed, fall through */ }
      }
      logger.warn(`Facebook post failed (non-critical): ${msg}`);
      return null;
    }
  }

  /**
   * Force Facebook to scrape/refresh OG metadata for a URL.
   * Uses the Graph API sharing debugger endpoint.
   */
  private async scrapeUrl(url: string): Promise<void> {
    try {
      await axios.post(
        `${GRAPH_API}/`,
        null,
        {
          params: {
            id: url,
            scrape: true,
            access_token: this.accessToken,
          },
        },
      );
      logger.debug(`Facebook OG scrape refreshed for: ${url}`);
    } catch (error) {
      // Non-fatal — the post may still work with cached/stale OG data
      logger.debug(`Facebook OG scrape failed (non-fatal): ${axios.isAxiosError(error) ? error.response?.status : error}`);
    }
  }

  private buildCaption(content: BlogContent, url: string): string {
    const emoji = this.nicheEmoji(content.category);
    const hashtags = [
      ...content.tags.slice(0, 3).map(t => `#${t.replace(/\s+/g, '')}`),
      `#${content.category.replace(/\s+/g, '')}`,
      '#TrendHunt',
    ].join(' ');

    return `${emoji} ${content.title}\n\n${content.excerpt || ''}\n\n🔗 ${url}\n\n${hashtags}`;
  }

  private nicheEmoji(category: string): string {
    const map: Record<string, string> = {
      'Korean-Stock': '✨',
      'AI-Trading': '🎵',
    };
    return map[category] || '📝';
  }
}
