import axios from 'axios';
import { logger } from '../utils/logger.js';

export class LinkedInService {
  private accessToken: string;
  private personId: string;

  constructor(accessToken: string, personId: string) {
    this.accessToken = accessToken;
    this.personId = personId;
  }

  /**
   * Share a blog post to LinkedIn as UGC Post.
   * Uses LinkedIn Marketing API v2 UGC Posts endpoint.
   */
  async promoteBlogPost(title: string, excerpt: string, url: string, imageUrl?: string): Promise<void> {
    const summary = excerpt.split('.')[0].trim();

    const shareContent: Record<string, unknown> = {
      author: `urn:li:person:${this.personId}`,
      lifecycleState: 'PUBLISHED',
      specificContent: {
        'com.linkedin.ugc.ShareContent': {
          shareCommentary: { text: `${title}\n\n${summary}.\n\nRead more: ${url}` },
          shareMediaCategory: imageUrl ? 'ARTICLE' : 'ARTICLE',
          media: [
            {
              status: 'READY',
              originalUrl: url,
              title: { text: title },
              description: { text: summary },
              ...(imageUrl ? { thumbnails: [{ url: imageUrl }] } : {}),
            },
          ],
        },
      },
      visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
    };

    try {
      const { data } = await axios.post(
        'https://api.linkedin.com/v2/ugcPosts',
        shareContent,
        {
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json',
            'X-Restli-Protocol-Version': '2.0.0',
          },
          timeout: 15000,
        },
      );
      const postId = (data as { id?: string }).id || 'unknown';
      logger.info(`LinkedIn post shared (id: ${postId}): "${title}"`);
    } catch (error) {
      const msg = axios.isAxiosError(error)
        ? `${error.response?.status} ${JSON.stringify(error.response?.data ?? error.message)}`
        : (error instanceof Error ? error.message : String(error));
      logger.warn(`LinkedIn share failed (non-critical): ${msg}`);
    }
  }
}
