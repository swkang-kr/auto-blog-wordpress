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

  /** Send email notification with niche segment for targeted campaigns */
  async sendSegmentedNotification(postData: {
    title: string;
    url: string;
    excerpt: string;
    category: string;
    contentType?: string;
  }, segment?: string): Promise<void> {
    // Include segment/tag in webhook payload for email provider filtering
    const payload = {
      ...postData,
      segment: segment || postData.category,
      tags: [postData.category, postData.contentType].filter(Boolean),
      timestamp: new Date().toISOString(),
    };

    // Send to main webhook with segment data
    await this.triggerWebhook(payload);
  }

  /** Trigger webhook with arbitrary payload */
  private async triggerWebhook(payload: Record<string, unknown>): Promise<void> {
    try {
      await axios.post(
        this.webhookUrl,
        payload,
        {
          headers: { 'Content-Type': 'application/json' },
          timeout: 10000,
        },
      );
      logger.info(`Email webhook: Segmented notification sent`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.warn(`Email webhook (segmented) failed: ${msg}`);
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
