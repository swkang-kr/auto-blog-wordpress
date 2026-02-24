import axios, { type AxiosInstance } from 'axios';
import { logger } from '../utils/logger.js';
import { WordPressError } from '../types/errors.js';
import type { BlogContent, PublishedPost, MediaUploadResult } from '../types/index.js';

export class WordPressService {
  private api: AxiosInstance;
  private wpUrl: string;
  private siteOwner: string;

  constructor(wpUrl: string, username: string, appPassword: string, siteOwner?: string) {
    this.wpUrl = wpUrl.replace(/\/+$/, '');
    this.siteOwner = siteOwner || '';
    const token = Buffer.from(`${username}:${appPassword}`).toString('base64');
    this.api = axios.create({
      baseURL: `${this.wpUrl}/wp-json/wp/v2`,
      headers: {
        Authorization: `Basic ${token}`,
      },
      timeout: 30000,
    });
  }

  async uploadMedia(imageBuffer: Buffer, filename: string): Promise<MediaUploadResult> {
    logger.debug(`Uploading media: ${filename}`);
    try {
      const response = await this.api.post('/media', imageBuffer, {
        headers: {
          'Content-Type': 'image/png',
          'Content-Disposition': `attachment; filename="${filename}"`,
        },
      });
      const mediaId = response.data.id as number;
      const sourceUrl = (response.data.source_url ?? response.data.guid?.rendered ?? '') as string;
      logger.info(`Media uploaded: ID=${mediaId}, URL=${sourceUrl}`);
      return { mediaId, sourceUrl };
    } catch (error) {
      throw new WordPressError(`Failed to upload media: ${filename}`, error);
    }
  }

  private replaceImagePlaceholders(
    html: string,
    inlineImages?: Array<{ url: string; caption: string }>,
  ): string {
    if (inlineImages && inlineImages.length > 0) {
      for (let i = 0; i < inlineImages.length; i++) {
        const placeholder = `<!--IMAGE_PLACEHOLDER_${i + 1}-->`;
        const figureHtml =
          `<figure style="margin:30px 0; text-align:center;">` +
          `<img src="${inlineImages[i].url}" alt="${inlineImages[i].caption}" style="max-width:100%; height:auto; border-radius:8px; box-shadow:0 2px 8px rgba(0,0,0,0.1);" />` +
          `<figcaption style="margin-top:10px; font-size:13px; color:#888; line-height:1.5;">${inlineImages[i].caption}</figcaption>` +
          `</figure>`;

        if (html.includes(placeholder)) {
          html = html.replace(placeholder, figureHtml);
        } else {
          logger.warn(`Placeholder ${placeholder} not found, using fallback insertion`);
          html = this.insertImageAfterNthHeading(html, figureHtml, i + 1);
        }
      }
    }

    // Remove any remaining unused placeholders
    html = html.replace(/<!--IMAGE_PLACEHOLDER_\d+-->/g, '');

    // Strip emoji/symbol characters that WordPress converts to low-quality SVG images
    html = html.replace(/[\u{1F300}-\u{1FFFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{2300}-\u{23FF}\u{25A0}-\u{25FF}\u{2B50}-\u{2B55}\u{FE00}-\u{FE0F}\u{200D}]/gu, '');

    return html;
  }

  async createPost(
    content: BlogContent,
    featuredImageId?: number,
    inlineImages?: Array<{ url: string; caption: string }>,
  ): Promise<PublishedPost> {
    // Replace image placeholders in both English and Korean HTML
    const htmlEn = this.replaceImagePlaceholders(content.html, inlineImages);
    const htmlKr = this.replaceImagePlaceholders(content.htmlKr, inlineImages);

    // Assemble bilingual toggle UI
    const toggleButton = `<div style="text-align:right; margin:0 0 20px 0;">` +
      `<button onclick="(function(b){var p=b.closest('.bilingual-post');var en=p.querySelector('.content-en');var kr=p.querySelector('.content-kr');if(en.style.display!=='none'){en.style.display='none';kr.style.display='block';b.textContent='Read in English';}else{en.style.display='block';kr.style.display='none';b.textContent='\\ud55c\\uad6d\\uc5b4\\ub85c \\ubcf4\\uae30';}})(this)" ` +
      `style="padding:8px 20px; background:#0066FF; color:#fff; border:none; border-radius:20px; cursor:pointer; font-size:14px;">` +
      `한국어로 보기</button></div>`;

    let html = `<div class="bilingual-post">` +
      toggleButton +
      `<div class="content-en" style="display:block">${htmlEn}</div>` +
      `<div class="content-kr" style="display:none">${htmlKr}</div>` +
      `</div>`;

    // Inject JSON-LD structured data (BlogPosting schema)
    const jsonLd = {
      '@context': 'https://schema.org',
      '@type': 'BlogPosting',
      headline: content.title,
      description: content.excerpt,
      datePublished: new Date().toISOString(),
      dateModified: new Date().toISOString(),
      ...(this.siteOwner ? {
        author: {
          '@type': 'Person',
          name: this.siteOwner,
        },
      } : {}),
      publisher: {
        '@type': 'Organization',
        name: this.siteOwner || 'TrendHunt',
      },
      mainEntityOfPage: {
        '@type': 'WebPage',
        '@id': this.wpUrl,
      },
    };
    const jsonLdScript = `<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>\n`;
    html = jsonLdScript + html;

    const categoryId = await this.getOrCreateCategory(content.category);
    const tagIds = await this.getOrCreateTags(content.tags);

    logger.info(`Creating post: "${content.title}"`);
    try {
      const response = await this.api.post('/posts', {
        title: content.title,
        content: html,
        excerpt: content.excerpt,
        status: 'publish',
        categories: [categoryId],
        tags: tagIds,
        featured_media: featuredImageId ?? 0,
      });

      const post: PublishedPost = {
        postId: response.data.id,
        url: response.data.link,
        title: content.title,
        featuredImageId: featuredImageId ?? 0,
      };

      logger.info(`Post published: ID=${post.postId} URL=${post.url}`);
      return post;
    } catch (error) {
      const detail = axios.isAxiosError(error)
        ? `${error.response?.status} ${JSON.stringify(error.response?.data ?? error.message)}`
        : (error instanceof Error ? error.message : String(error));
      throw new WordPressError(`Failed to create post: "${content.title}" - ${detail}`, error);
    }
  }

  private insertImageAfterNthHeading(html: string, imgHtml: string, n: number): string {
    const headingEndRegex = /<\/h[23]>/gi;
    let match: RegExpExecArray | null;
    let count = 0;

    while ((match = headingEndRegex.exec(html)) !== null) {
      count++;
      if (count === n) {
        const afterHeading = html.indexOf('</p>', match.index + match[0].length);
        if (afterHeading !== -1) {
          const insertPos = afterHeading + 4;
          return html.slice(0, insertPos) + '\n' + imgHtml + '\n' + html.slice(insertPos);
        }
        const insertPos = match.index + match[0].length;
        return html.slice(0, insertPos) + '\n' + imgHtml + '\n' + html.slice(insertPos);
      }
    }

    // Not enough headings — insert before closing div
    const lastDiv = html.lastIndexOf('</div>');
    if (lastDiv !== -1) {
      return html.slice(0, lastDiv) + '\n' + imgHtml + '\n' + html.slice(lastDiv);
    }
    return html + '\n' + imgHtml;
  }

  async getOrCreateCategory(name: string): Promise<number> {
    try {
      const search = await this.api.get('/categories', { params: { search: name } });
      const categories = search.data as { id: number; name: string }[];
      const existing = categories.find(
        (c) => c.name.toLowerCase() === name.toLowerCase(),
      );
      if (existing) return existing.id;
    } catch {
      // continue to create
    }

    const response = await this.api.post('/categories', { name });
    return response.data.id as number;
  }

  async getOrCreateTags(names: string[]): Promise<number[]> {
    const ids: number[] = [];
    for (const name of names) {
      try {
        const search = await this.api.get('/tags', { params: { search: name } });
        const tags = search.data as { id: number; name: string }[];
        const existing = tags.find(
          (t) => t.name.toLowerCase() === name.toLowerCase(),
        );
        if (existing) {
          ids.push(existing.id);
          continue;
        }
      } catch {
        // continue to create
      }

      try {
        const response = await this.api.post('/tags', { name });
        ids.push(response.data.id as number);
      } catch (error) {
        logger.warn(`Failed to create tag "${name}": ${error instanceof Error ? error.message : error}`);
      }
    }
    return ids;
  }
}
