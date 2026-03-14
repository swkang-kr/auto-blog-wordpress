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
   * Share a blog post to LinkedIn using the Posts API (v202501+).
   * Migrated from deprecated ugcPosts endpoint (removed 2024).
   */
  async promoteBlogPost(title: string, excerpt: string, url: string, imageUrl?: string): Promise<string | null> {
    const utmUrl = buildUtmUrl(url, 'linkedin', 'social', extractSlugFromUrl(url));
    const commentary = this.buildProfessionalCommentary(title, excerpt, utmUrl);

    const postBody: Record<string, unknown> = {
      author: `urn:li:person:${this.personId}`,
      commentary,
      visibility: 'PUBLIC',
      distribution: {
        feedDistribution: 'MAIN_FEED',
        targetEntities: [],
        thirdPartyDistributionChannels: [],
      },
      content: {
        article: {
          source: utmUrl,
          title,
          description: excerpt.split('.')[0].trim(),
          ...(imageUrl ? { thumbnail: imageUrl } : {}),
        },
      },
      lifecycleState: 'PUBLISHED',
      isReshareDisabledByAuthor: false,
    };

    try {
      const { data } = await axios.post(
        'https://api.linkedin.com/v2/posts',
        postBody,
        {
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json',
            'LinkedIn-Version': '202501',
            'X-Restli-Protocol-Version': '2.0.0',
          },
          timeout: 15000,
        },
      );
      // Posts API returns the post URN in the x-linkedin-id header; body may be empty
      const postId = (data as { id?: string }).id
        || 'unknown';
      logger.info(`LinkedIn post shared (id: ${postId}): "${title}"`);
      return postId;
    } catch (error) {
      const msg = axios.isAxiosError(error)
        ? `${error.response?.status} ${JSON.stringify(error.response?.data ?? error.message)}`
        : (error instanceof Error ? error.message : String(error));
      logger.warn(`LinkedIn share failed (non-critical): ${msg}`);
      return null;
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
