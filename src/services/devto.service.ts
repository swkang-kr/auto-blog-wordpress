import axios from 'axios';
import { logger } from '../utils/logger.js';
import type { BlogContent, PublishedPost } from '../types/index.js';

const DEVTO_API = 'https://dev.to/api';

export class DevToService {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async syndicateBlogPost(content: BlogContent, post: PublishedPost): Promise<void> {
    try {
      const tags = content.tags
        .slice(0, 4)
        .map((tag) => tag.replace(/\s+/g, '').toLowerCase().substring(0, 30));

      const response = await axios.post(
        `${DEVTO_API}/articles`,
        {
          article: {
            title: content.title,
            body_markdown: content.html,
            published: true,
            canonical_url: post.url,
            tags,
            description: content.excerpt.substring(0, 256),
          },
        },
        { headers: this.headers() },
      );

      logger.info(`DEV.to article published: ${response.data.url ?? response.data.id}`);
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
