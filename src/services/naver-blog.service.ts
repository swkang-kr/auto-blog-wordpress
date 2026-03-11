import axios from 'axios';
import { logger } from '../utils/logger.js';
import type { BlogContent, PublishedPost } from '../types/index.js';

/**
 * Naver Blog auto-seeding service.
 * Posts excerpts to Naver Blog with backlinks to WordPress Korean posts.
 * Drives Korean organic traffic from Naver search to WordPress.
 */
export class NaverBlogService {
  private blogId: string;
  private clientId: string;
  private clientSecret: string;
  private accessToken: string | null = null;

  constructor(blogId: string, clientId: string, clientSecret: string) {
    this.blogId = blogId;
    this.clientId = clientId;
    this.clientSecret = clientSecret;
  }

  /**
   * Post a teaser excerpt to Naver Blog with a "Read more" link to WordPress.
   */
  async seedPost(
    content: BlogContent,
    post: PublishedPost,
    koreanTitle?: string,
    koreanExcerpt?: string,
  ): Promise<string | null> {
    try {
      const token = await this.getAccessToken();
      if (!token) {
        logger.warn('Naver Blog: No access token available');
        return null;
      }

      const title = koreanTitle || content.title;
      // Build Naver Blog post with excerpt + "Read full article" CTA
      const excerpt = (koreanExcerpt || content.excerpt).slice(0, 500);
      const naverContent = this.buildNaverPostContent(title, excerpt, post.url, content.category, content.tags);

      const { data } = await axios.post(
        'https://openapi.naver.com/blog/writePost.json',
        new URLSearchParams({
          blogId: this.blogId,
          title,
          contents: naverContent,
        }),
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          timeout: 15000,
        },
      );

      const naverUrl = data.result?.postUrl || null;
      if (naverUrl) {
        logger.info(`Naver Blog: Seeded "${title}" → ${naverUrl}`);
      }
      return naverUrl as string | null;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (axios.isAxiosError(error)) {
        logger.warn(`Naver Blog API error: ${error.response?.status} ${JSON.stringify(error.response?.data || msg)}`);
      } else {
        logger.warn(`Naver Blog seeding failed: ${msg}`);
      }
      return null;
    }
  }

  /**
   * Build Naver Blog post HTML with excerpt and backlink.
   */
  private buildNaverPostContent(
    title: string,
    excerpt: string,
    wpUrl: string,
    category: string,
    tags: string[],
  ): string {
    const categoryLabel = category || 'Korea';
    const tagStr = tags.slice(0, 5).map(t => `#${t.replace(/\s+/g, '')}`).join(' ');

    return `<div style="font-family: 'Noto Sans KR', sans-serif; line-height: 1.8; max-width: 680px;">
<p style="font-size: 16px; color: #333; margin-bottom: 20px;">${this.escapeHtml(excerpt)}</p>
<div style="background: #f0f4ff; padding: 20px; border-radius: 12px; margin: 24px 0; text-align: center;">
<p style="margin: 0 0 12px 0; font-size: 15px; color: #555;">Full article available on our website:</p>
<a href="${wpUrl}" target="_blank" rel="noopener" style="display: inline-block; padding: 12px 32px; background: #0066FF; color: #fff; text-decoration: none; border-radius: 8px; font-weight: 700; font-size: 15px;">Read Full Article →</a>
</div>
<p style="font-size: 13px; color: #999; margin-top: 20px;">${categoryLabel} | ${tagStr}</p>
</div>`;
  }

  /**
   * Get Naver OAuth access token.
   */
  private async getAccessToken(): Promise<string | null> {
    if (this.accessToken) return this.accessToken;

    try {
      const { data } = await axios.post(
        'https://nid.naver.com/oauth2.0/token',
        new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: this.clientId,
          client_secret: this.clientSecret,
        }),
        { timeout: 10000 },
      );
      this.accessToken = data.access_token as string;
      return this.accessToken;
    } catch (error) {
      logger.warn(`Naver OAuth failed: ${error instanceof Error ? error.message : error}`);
      return null;
    }
  }

  private escapeHtml(text: string): string {
    return text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
}
