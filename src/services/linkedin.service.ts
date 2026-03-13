import axios from 'axios';
import { logger } from '../utils/logger.js';
import { buildUtmUrl, extractSlugFromUrl } from '../utils/utm.js';

export class LinkedInService {
  private accessToken: string;
  private personId: string;

  constructor(accessToken: string, personId: string) {
    this.accessToken = accessToken;
    this.personId = personId;
  }

  /**
   * Share a blog post to LinkedIn as UGC Post with professional formatting.
   * Uses LinkedIn Marketing API v2 UGC Posts endpoint.
   */
  async promoteBlogPost(title: string, excerpt: string, url: string, imageUrl?: string): Promise<void> {
    const utmUrl = buildUtmUrl(url, 'linkedin', 'social', extractSlugFromUrl(url));
    const commentary = this.buildProfessionalCommentary(title, excerpt, utmUrl);

    const shareContent: Record<string, unknown> = {
      author: `urn:li:person:${this.personId}`,
      lifecycleState: 'PUBLISHED',
      specificContent: {
        'com.linkedin.ugc.ShareContent': {
          shareCommentary: { text: commentary },
          shareMediaCategory: 'ARTICLE',
          media: [
            {
              status: 'READY',
              originalUrl: utmUrl,
              title: { text: title },
              description: { text: excerpt.split('.')[0].trim() },
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

  /**
   * Build a professional LinkedIn commentary with key takeaways.
   * LinkedIn algorithm favors longer-form, structured posts with engagement hooks.
   */
  private buildProfessionalCommentary(title: string, excerpt: string, url: string): string {
    const sentences = excerpt.split(/[.!?]+/).map(s => s.trim()).filter(s => s.length > 20);
    const keyTakeaway = sentences[0] || excerpt.slice(0, 200);
    const secondPoint = sentences[1] || '';

    const parts: string[] = [
      title,
      '',
      keyTakeaway + '.',
    ];

    if (secondPoint) {
      parts.push('', secondPoint + '.');
    }

    parts.push(
      '',
      'Key takeaways:',
      ...sentences.slice(0, 3).map(s => `- ${s}`),
      '',
      `Read the full analysis: ${url}`,
      '',
      '#Korea #SouthKorea #Insights',
    );

    // LinkedIn max 3000 chars for commentary
    return parts.join('\n').slice(0, 3000);
  }
}
