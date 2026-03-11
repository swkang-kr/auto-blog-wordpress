import axios from 'axios';
import { logger } from '../utils/logger.js';
import type { BlogContent, PublishedPost } from '../types/index.js';
import { htmlToMarkdown } from '../utils/html-to-markdown.js';

export class MediumService {
  private token: string;
  private userId: string | null = null;

  constructor(token: string) {
    this.token = token;
  }

  /**
   * Get the authenticated user's Medium ID.
   */
  private async getUserId(): Promise<string> {
    if (this.userId) return this.userId;

    const { data } = await axios.get('https://api.medium.com/v1/me', {
      headers: { Authorization: `Bearer ${this.token}` },
      timeout: 10000,
    });
    this.userId = data.data.id as string;
    return this.userId;
  }

  /**
   * Cross-post a blog article to Medium with canonical URL pointing back to WordPress.
   */
  async syndicate(content: BlogContent, post: PublishedPost): Promise<string | null> {
    try {
      const userId = await this.getUserId();

      // Convert HTML to Markdown for better Medium rendering
      const markdown = htmlToMarkdown(content.html);

      // Build tags (Medium allows max 5 tags)
      const tags = content.tags
        .map(t => t.replace(/[^a-zA-Z0-9\s-]/g, '').trim())
        .filter(t => t.length > 0)
        .slice(0, 5);

      const { data } = await axios.post(
        `https://api.medium.com/v1/users/${userId}/posts`,
        {
          title: content.title,
          contentFormat: 'markdown',
          content: markdown,
          canonicalUrl: post.url,
          tags,
          publishStatus: 'public',
        },
        {
          headers: {
            Authorization: `Bearer ${this.token}`,
            'Content-Type': 'application/json',
          },
          timeout: 30000,
        },
      );

      const mediumUrl = data.data.url as string;
      logger.info(`Medium: Syndicated "${content.title}" → ${mediumUrl}`);
      return mediumUrl;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (axios.isAxiosError(error)) {
        logger.warn(`Medium API error: ${error.response?.status} ${JSON.stringify(error.response?.data || msg)}`);
      } else {
        logger.warn(`Medium syndication failed: ${msg}`);
      }
      return null;
    }
  }
}
