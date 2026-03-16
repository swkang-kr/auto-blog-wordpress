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
      const msg = axios.isAxiosError(error)
        ? JSON.stringify(error.response?.data)
        : String(error);
      logger.warn(`Facebook post failed (non-critical): ${msg}`);
      return null;
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
      'K-Beauty': '✨',
      'K-Entertainment': '🎵',
    };
    return map[category] || '📝';
  }
}
