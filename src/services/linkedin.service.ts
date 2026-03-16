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
   * Upload an image to LinkedIn via the Images API.
   * Returns the image URN (urn:li:image:xxx) for use as article thumbnail.
   */
  private async uploadImage(imageUrl: string): Promise<string | null> {
    try {
      // 1. Initialize upload — register the image with LinkedIn
      const initRes = await axios.post(
        'https://api.linkedin.com/rest/images?action=initializeUpload',
        {
          initializeUploadRequest: {
            owner: `urn:li:person:${this.personId}`,
          },
        },
        {
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json',
            'LinkedIn-Version': '202602',
            'X-Restli-Protocol-Version': '2.0.0',
          },
          timeout: 15000,
        },
      );

      const uploadUrl: string = initRes.data?.value?.uploadUrl;
      const imageUrn: string = initRes.data?.value?.image;

      if (!uploadUrl || !imageUrn) {
        logger.debug('LinkedIn image init: missing uploadUrl or image URN');
        return null;
      }

      // 2. Download the image from our site
      const imgRes = await axios.get(imageUrl, {
        responseType: 'arraybuffer',
        timeout: 20000,
        headers: { 'User-Agent': 'TrendHunt-Bot/1.0' },
      });

      // 3. Upload binary to LinkedIn's upload URL
      await axios.put(uploadUrl, imgRes.data, {
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'Content-Type': imgRes.headers['content-type'] || 'image/jpeg',
        },
        timeout: 30000,
      });

      logger.debug(`LinkedIn image uploaded: ${imageUrn}`);
      return imageUrn;
    } catch (error) {
      const msg = axios.isAxiosError(error)
        ? `${error.response?.status} ${JSON.stringify(error.response?.data ?? error.message)}`
        : (error instanceof Error ? error.message : String(error));
      logger.debug(`LinkedIn image upload failed (non-critical): ${msg}`);
      return null;
    }
  }

  /**
   * Share a blog post to LinkedIn using the Posts API (v202501+).
   * Migrated from deprecated ugcPosts endpoint (removed 2024).
   */
  async promoteBlogPost(title: string, excerpt: string, url: string, imageUrl?: string): Promise<string | null> {
    const utmUrl = buildUtmUrl(url, 'linkedin', 'social', extractSlugFromUrl(url));
    const commentary = this.buildProfessionalCommentary(title, excerpt, utmUrl);

    // Upload thumbnail image if provided
    let thumbnailUrn: string | null = null;
    if (imageUrl) {
      thumbnailUrn = await this.uploadImage(imageUrl);
    }

    const articleContent: Record<string, unknown> = {
      source: utmUrl,
      title,
      description: excerpt.split('.')[0].trim(),
    };
    if (thumbnailUrn) {
      articleContent.thumbnail = thumbnailUrn;
    }

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
        article: articleContent,
      },
      lifecycleState: 'PUBLISHED',
      isReshareDisabledByAuthor: false,
    };

    try {
      const res = await axios.post(
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
      // v2/posts returns URN in x-restli-id header (body is empty on 201 Created)
      const postId = (res.headers['x-restli-id'] as string)
        || (res.data as { id?: string })?.id
        || 'unknown';
      logger.info(`LinkedIn post shared (id: ${postId}): "${title}"${thumbnailUrn ? ' [with image]' : ''}`);
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
