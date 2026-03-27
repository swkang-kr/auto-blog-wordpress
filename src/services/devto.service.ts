import axios from 'axios';
import { logger } from '../utils/logger.js';
import { htmlToMarkdown } from '../utils/html-to-markdown.js';
import { buildUtmUrl, extractSlugFromUrl } from '../utils/utm.js';
import type { BlogContent, PublishedPost } from '../types/index.js';

const DEVTO_API = 'https://dev.to/api';

/** DEV.to syndicates tech-relevant content + lifestyle niches with tech-curious audiences */
const DEVTO_ALLOWED_CATEGORIES = new Set([
  'Korean-Stock', 'AI-Trading',
]);

export class DevToService {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async syndicateBlogPost(content: BlogContent, post: PublishedPost): Promise<void> {
    try {
      // Only syndicate tech-relevant content to DEV.to
      if (!DEVTO_ALLOWED_CATEGORIES.has(content.category)) {
        logger.debug(`DEV.to syndication skipped: "${content.category}" not a tech category`);
        return;
      }

      // Validate canonical URL before syndication
      if (!post.url || !post.url.startsWith('http')) {
        logger.warn(`DEV.to syndication skipped: invalid canonical URL "${post.url}"`);
        return;
      }

      const tags = content.tags
        .slice(0, 4)
        .map((tag) => tag.replace(/\s+/g, '').toLowerCase().substring(0, 30));

      const utmUrl = buildUtmUrl(post.url, 'devto', 'syndication', extractSlugFromUrl(post.url));
      const bodyMarkdown = htmlToMarkdown(content.html) +
        `\n\n---\n*Originally published at [${new URL(post.url).hostname}](${utmUrl})*`;

      const response = await axios.post(
        `${DEVTO_API}/articles`,
        {
          article: {
            title: content.title,
            body_markdown: bodyMarkdown,
            published: true,
            canonical_url: post.url,
            tags,
            description: content.excerpt.substring(0, 256),
          },
        },
        { headers: this.headers() },
      );

      const articleUrl = response.data.url ?? response.data.id;
      logger.info(`DEV.to article published: ${articleUrl} (canonical: ${post.url})`);

      // Verify canonical URL was set correctly
      if (response.data.canonical_url && response.data.canonical_url !== post.url) {
        logger.warn(`DEV.to canonical URL mismatch: expected "${post.url}", got "${response.data.canonical_url}"`);
      }
    } catch (error) {
      logger.warn(`DEV.to syndication failed (non-critical): ${error instanceof Error ? error.message : error}`);
    }
  }

  private headers() {
    return {
      'api-key': this.apiKey,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
  }
}
