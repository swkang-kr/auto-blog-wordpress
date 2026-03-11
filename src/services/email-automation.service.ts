import axios from 'axios';
import { logger } from '../utils/logger.js';
import type { BlogContent, PublishedPost } from '../types/index.js';

/**
 * Email automation webhook service.
 * Triggers webhook on new post publish for email marketing platforms
 * (Mailchimp, ConvertKit, Zapier, Make, etc.)
 */
export class EmailAutomationService {
  private webhookUrl: string;

  constructor(webhookUrl: string) {
    this.webhookUrl = webhookUrl;
  }

  /**
   * Send a new-post webhook payload to trigger email automation sequences.
   */
  async notifyNewPost(content: BlogContent, post: PublishedPost): Promise<void> {
    try {
      await axios.post(
        this.webhookUrl,
        {
          event: 'new_post',
          post: {
            id: post.postId,
            url: post.url,
            title: content.title,
            excerpt: content.excerpt,
            category: content.category,
            tags: content.tags,
            featuredImageId: post.featuredImageId,
            publishedAt: new Date().toISOString(),
          },
        },
        {
          headers: { 'Content-Type': 'application/json' },
          timeout: 10000,
        },
      );
      logger.info(`Email webhook: Notified for "${content.title}"`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.warn(`Email webhook failed: ${msg}`);
    }
  }

  /**
   * Send a weekly digest webhook with top-performing posts.
   */
  async sendDigestWebhook(posts: Array<{ title: string; url: string; category: string }>): Promise<void> {
    try {
      await axios.post(
        this.webhookUrl,
        {
          event: 'weekly_digest',
          posts,
          sentAt: new Date().toISOString(),
        },
        {
          headers: { 'Content-Type': 'application/json' },
          timeout: 10000,
        },
      );
      logger.info(`Email webhook: Weekly digest sent with ${posts.length} posts`);
    } catch (error) {
      logger.warn(`Email digest webhook failed: ${error instanceof Error ? error.message : error}`);
    }
  }
}
