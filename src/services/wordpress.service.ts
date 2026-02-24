import axios, { type AxiosInstance } from 'axios';
import { logger } from '../utils/logger.js';
import { WordPressError } from '../types/errors.js';
import type { BlogContent, PublishedPost } from '../types/index.js';

export class WordPressService {
  private api: AxiosInstance;

  constructor(wpUrl: string, username: string, appPassword: string) {
    const token = Buffer.from(`${username}:${appPassword}`).toString('base64');
    this.api = axios.create({
      baseURL: `${wpUrl.replace(/\/+$/, '')}/wp-json/wp/v2`,
      headers: {
        Authorization: `Basic ${token}`,
      },
      timeout: 30000,
    });
  }

  async uploadMedia(imageBuffer: Buffer, filename: string): Promise<number> {
    logger.debug(`Uploading media: ${filename}`);
    try {
      const response = await this.api.post('/media', imageBuffer, {
        headers: {
          'Content-Type': 'image/png',
          'Content-Disposition': `attachment; filename="${filename}"`,
        },
      });
      const mediaId = response.data.id as number;
      logger.info(`Media uploaded: ID=${mediaId}`);
      return mediaId;
    } catch (error) {
      throw new WordPressError(`Failed to upload media: ${filename}`, error);
    }
  }

  async createPost(
    content: BlogContent,
    featuredImageId?: number,
    inlineImageUrls?: string[],
  ): Promise<PublishedPost> {
    // Insert inline images into HTML
    let html = content.html;
    if (inlineImageUrls && inlineImageUrls.length > 0) {
      const imgTags = inlineImageUrls
        .map((url) => `<figure><img src="${url}" alt="${content.title}" /></figure>`)
        .join('\n');
      // Insert after first </h2> to place images after the first section
      const firstH2End = html.indexOf('</h2>');
      if (firstH2End !== -1) {
        const insertPos = html.indexOf('</h2>', firstH2End + 5);
        if (insertPos !== -1) {
          html = html.slice(0, insertPos + 5) + '\n' + imgTags + '\n' + html.slice(insertPos + 5);
        }
      }
    }

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
      throw new WordPressError(`Failed to create post: "${content.title}"`, error);
    }
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
