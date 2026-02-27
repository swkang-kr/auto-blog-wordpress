import axios, { type AxiosInstance } from 'axios';
import { logger } from '../utils/logger.js';
import { WordPressError } from '../types/errors.js';
import type { BlogContent, PublishedPost, MediaUploadResult, ExistingPost } from '../types/index.js';

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

  async getRecentPosts(count: number = 50): Promise<ExistingPost[]> {
    try {
      const { data } = await this.api.get('/posts', {
        params: { per_page: count, status: 'publish', _fields: 'title,link,categories' },
      });

      const posts = data as Array<{ title: { rendered: string }; link: string; categories: number[] }>;

      // Fetch category names
      const catIds = [...new Set(posts.flatMap((p) => p.categories))];
      const catMap = new Map<number, string>();
      if (catIds.length > 0) {
        const { data: cats } = await this.api.get('/categories', {
          params: { include: catIds.join(','), per_page: 100, _fields: 'id,name' },
        });
        for (const c of cats as Array<{ id: number; name: string }>) {
          catMap.set(c.id, c.name);
        }
      }

      return posts.map((p) => ({
        title: p.title.rendered.replace(/&#8217;/g, "'").replace(/&#8211;/g, '-').replace(/&amp;/g, '&'),
        url: p.link,
        category: catMap.get(p.categories[0]) || 'Uncategorized',
      }));
    } catch (error) {
      logger.warn(`Failed to fetch existing posts: ${error instanceof Error ? error.message : error}`);
      return [];
    }
  }

  async uploadMedia(imageBuffer: Buffer, filename: string, altText?: string): Promise<MediaUploadResult> {
    const isWebP = filename.endsWith('.webp');
    const contentType = isWebP ? 'image/webp' : 'image/png';
    logger.debug(`Uploading media: ${filename} (${contentType}, ${(imageBuffer.length / 1024).toFixed(0)}KB)`);
    try {
      const response = await this.api.post('/media', imageBuffer, {
        headers: {
          'Content-Type': contentType,
          'Content-Disposition': `attachment; filename="${filename}"`,
        },
      });
      const mediaId = response.data.id as number;
      const sourceUrl = (response.data.source_url ?? response.data.guid?.rendered ?? '') as string;

      // Set ALT text for SEO
      if (altText) {
        try {
          await this.api.post(`/media/${mediaId}`, { alt_text: altText });
        } catch {
          logger.warn(`Failed to set ALT text for media ${mediaId}`);
        }
      }

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
          `<img src="${inlineImages[i].url}" alt="${inlineImages[i].caption}" loading="lazy" width="760" height="428" decoding="async" style="max-width:100%; height:auto; border-radius:8px; box-shadow:0 2px 8px rgba(0,0,0,0.1);" />` +
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
    options?: { contentType?: string; keyword?: string; featuredImageUrl?: string },
  ): Promise<PublishedPost> {
    // Replace image placeholders in both English and Korean HTML
    let htmlEn = this.replaceImagePlaceholders(content.html, inlineImages);
    let htmlKr = this.replaceImagePlaceholders(content.htmlKr, inlineImages);

    // Validate and trim excerpt for SEO (120-160 chars)
    const validatedExcerpt = content.excerpt.length > 160
      ? content.excerpt.slice(0, 157) + '...'
      : content.excerpt;
    if (content.excerpt.length > 160) logger.warn(`Excerpt trimmed to 160 chars: "${content.title}"`);

    // Add doc-toc ARIA role to Table of Contents div
    htmlEn = htmlEn.replace(
      /<div(\s*style="background:#f0f4ff;[^"]*")>(\s*<p[^>]*>Table of Contents<\/p>)/,
      '<div role="doc-toc" aria-label="Table of Contents"$1>$2',
    );
    htmlKr = htmlKr.replace(
      /<div(\s*style="background:#f0f4ff;[^"]*")>(\s*<p[^>]*>(?:목차|Table of Contents)<\/p>)/,
      '<div role="doc-toc" aria-label="목차"$1>$2',
    );

    // Build tag pills HTML
    const tagStyle = `display:inline-block; padding:4px 12px; margin:0 6px 6px 0; background:#f0f4ff; color:#0066FF; border-radius:14px; font-size:13px; text-decoration:none;`;
    const tagsEnHtml = content.tags.map((t) => `<span style="${tagStyle}">${this.escapeHtml(t)}</span>`).join('');
    const tagsKrHtml = (content.tagsKr || content.tags).map((t) => `<span style="${tagStyle}">${this.escapeHtml(t)}</span>`).join('');
    const tagSection = (label: string, pills: string) =>
      `<div style="margin:30px 0 0 0; padding-top:20px; border-top:1px solid #eee;"><p style="margin:0 0 8px 0; font-size:14px; font-weight:600; color:#666;">${label}</p><div>${pills}</div></div>`;

    // Assemble bilingual toggle UI
    const escapedTitleEn = this.escapeHtml(content.title);
    const escapedTitleKr = this.escapeHtml(content.titleKr || content.title);

    const toggleButton = `<div style="text-align:right; margin:0 0 20px 0;">` +
      `<button onclick="(function(b){var p=b.closest('.bilingual-post');var en=p.querySelector('.content-en');var kr=p.querySelector('.content-kr');var t=document.querySelector('.entry-title')||document.querySelector('h1.wp-block-post-title')||document.querySelector('h1');if(en.style.display!=='none'){en.style.display='none';kr.style.display='block';b.textContent='Read in English';if(t)t.textContent=p.dataset.titleKr;document.title=p.dataset.titleKr;}else{en.style.display='block';kr.style.display='none';b.textContent='\\ud55c\\uad6d\\uc5b4\\ub85c \\ubcf4\\uae30';if(t)t.textContent=p.dataset.titleEn;document.title=p.dataset.titleEn;}})(this)" ` +
      `style="padding:8px 20px; background:#0066FF; color:#fff; border:none; border-radius:20px; cursor:pointer; font-size:14px;">` +
      `한국어로 보기</button></div>`;

    let html = `<div class="bilingual-post" data-title-en="${escapedTitleEn}" data-title-kr="${escapedTitleKr}">` +
      toggleButton +
      `<div class="content-en" lang="en" style="display:block">${htmlEn}${tagSection('Tags', tagsEnHtml)}</div>` +
      `<div class="content-kr" lang="ko" style="display:none">${htmlKr}${tagSection('태그', tagsKrHtml)}</div>` +
      `<noscript><div lang="ko"><h2>${escapedTitleKr}</h2>${htmlKr}${tagSection('태그', tagsKrHtml)}</div></noscript>` +
      `</div>`;

    // Inject JSON-LD structured data (BlogPosting schema)
    const wordCount = htmlEn.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;
    const nowIso = new Date().toISOString();
    const jsonLd = {
      '@context': 'https://schema.org',
      '@type': 'BlogPosting',
      headline: content.title,
      description: validatedExcerpt,
      inLanguage: 'en',
      articleSection: content.category,
      wordCount,
      datePublished: nowIso,
      dateModified: nowIso,
      ...(options?.featuredImageUrl ? {
        image: {
          '@type': 'ImageObject',
          url: options.featuredImageUrl,
          description: content.imageCaptions?.[0] || content.title,
        },
      } : {}),
      ...(this.siteOwner ? {
        author: { '@type': 'Person', name: this.siteOwner },
      } : {}),
      publisher: { '@type': 'Organization', name: this.siteOwner || 'TrendHunt' },
      mainEntityOfPage: { '@type': 'WebPage', '@id': this.wpUrl },
    };

    // FAQ schema (auto-extracted from question headings)
    let additionalSchemas = '';
    const faqItems = this.extractFaqItems(htmlEn);
    if (faqItems.length >= 2) {
      const faqSchema = {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: faqItems.map(({ question, answer }) => ({
          '@type': 'Question',
          name: question,
          acceptedAnswer: { '@type': 'Answer', text: answer },
        })),
      };
      additionalSchemas += `<script type="application/ld+json">${JSON.stringify(faqSchema)}</script>\n`;
      logger.debug(`FAQ schema: ${faqItems.length} questions injected`);
    }

    // HowTo schema (how-to content type only)
    if (options?.contentType === 'how-to') {
      const steps = this.extractHowToSteps(htmlEn);
      if (steps.length >= 2) {
        const howToSchema = {
          '@context': 'https://schema.org',
          '@type': 'HowTo',
          name: content.title,
          description: validatedExcerpt,
          step: steps.map(({ name, text }) => ({
            '@type': 'HowToStep',
            name,
            text,
          })),
        };
        additionalSchemas += `<script type="application/ld+json">${JSON.stringify(howToSchema)}</script>\n`;
        logger.debug(`HowTo schema: ${steps.length} steps injected`);
      }
    }

    const jsonLdScript = `<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>\n` + additionalSchemas;
    html = jsonLdScript + html;

    const categoryId = await this.getOrCreateCategory(content.category);
    const tagIds = await this.getOrCreateTags(content.tags);

    logger.info(`Creating post: "${content.title}"`);
    try {
      const postData: Record<string, unknown> = {
        title: content.title,
        content: html,
        excerpt: validatedExcerpt,
        status: 'publish',
        categories: [categoryId],
        tags: tagIds,
        featured_media: featuredImageId ?? 0,
        meta: {
          rank_math_description: validatedExcerpt,
          rank_math_focus_keyword: options?.keyword || '',
          rank_math_title: content.title,
        },
      };
      if (content.slug) {
        postData.slug = content.slug;
      }
      const response = await this.api.post('/posts', postData);

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

  /**
   * Create a standalone Korean post with its own slug, linked to the EN post via hreflang.
   */
  async createKoreanPost(
    content: BlogContent,
    featuredImageId: number,
    inlineImages: Array<{ url: string; caption: string }>,
    enPostUrl: string,
  ): Promise<PublishedPost> {
    // Replace image placeholders in Korean HTML (same inline images)
    const htmlKr = this.replaceImagePlaceholders(content.htmlKr, inlineImages);

    // Build Korean tag pills
    const tagStyle = `display:inline-block; padding:4px 12px; margin:0 6px 6px 0; background:#f0f4ff; color:#0066FF; border-radius:14px; font-size:13px; text-decoration:none;`;
    const tagsKrHtml = (content.tagsKr || content.tags).map((t) => `<span style="${tagStyle}">${this.escapeHtml(t)}</span>`).join('');
    const tagSection = `<div style="margin:30px 0 0 0; padding-top:20px; border-top:1px solid #eee;"><p style="margin:0 0 8px 0; font-size:14px; font-weight:600; color:#666;">태그</p><div>${tagsKrHtml}</div></div>`;

    // "Read in English" button at the top
    const enLinkButton = `<div style="text-align:right; margin:0 0 20px 0;">` +
      `<a href="${this.escapeHtml(enPostUrl)}" style="display:inline-block; padding:8px 20px; background:#0066FF; color:#fff; border-radius:20px; font-size:14px; text-decoration:none;">Read in English</a></div>`;

    let html = enLinkButton + htmlKr + tagSection;

    // JSON-LD for Korean post
    const jsonLd = {
      '@context': 'https://schema.org',
      '@type': 'BlogPosting',
      headline: content.titleKr,
      description: content.excerptKr || content.excerpt,
      inLanguage: 'ko',
      datePublished: new Date().toISOString(),
      dateModified: new Date().toISOString(),
      ...(this.siteOwner ? {
        author: { '@type': 'Person', name: this.siteOwner },
      } : {}),
      publisher: {
        '@type': 'Organization',
        name: this.siteOwner || 'TrendHunt',
      },
      mainEntityOfPage: { '@type': 'WebPage', '@id': this.wpUrl },
    };
    html = `<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>\n` + html;

    const categoryId = await this.getOrCreateCategory(content.category);
    const tagIds = await this.getOrCreateTags(content.tagsKr || content.tags);

    const krSlug = (content.slug || 'post') + '-kr';
    const krTitle = content.titleKr || content.title;

    logger.info(`Creating Korean post: "${krTitle}" (slug: ${krSlug})`);
    try {
      const postData: Record<string, unknown> = {
        title: krTitle,
        content: html,
        excerpt: content.excerptKr || content.excerpt,
        status: 'publish',
        slug: krSlug,
        categories: [categoryId],
        tags: tagIds,
        featured_media: featuredImageId,
        meta: { hreflang_en: enPostUrl },
      };
      const response = await this.api.post('/posts', postData);

      const post: PublishedPost = {
        postId: response.data.id,
        url: response.data.link,
        title: krTitle,
        featuredImageId,
      };

      logger.info(`Korean post published: ID=${post.postId} URL=${post.url}`);
      return post;
    } catch (error) {
      const detail = axios.isAxiosError(error)
        ? `${error.response?.status} ${JSON.stringify(error.response?.data ?? error.message)}`
        : (error instanceof Error ? error.message : String(error));
      throw new WordPressError(`Failed to create Korean post: "${krTitle}" - ${detail}`, error);
    }
  }

  /**
   * Update post meta fields (e.g., hreflang_ko, hreflang_en).
   */
  async updatePostMeta(postId: number, meta: Record<string, string>): Promise<void> {
    try {
      await this.api.post(`/posts/${postId}`, { meta });
      logger.info(`Post meta updated: ID=${postId}, keys=${Object.keys(meta).join(',')}`);
    } catch (error) {
      const detail = axios.isAxiosError(error)
        ? `${error.response?.status} ${JSON.stringify(error.response?.data ?? error.message)}`
        : (error instanceof Error ? error.message : String(error));
      logger.warn(`Failed to update post meta for ID=${postId}: ${detail}`);
    }
  }

  /** Extract FAQ Q&A pairs from HTML (h2/h3 headings ending with '?') */
  private extractFaqItems(html: string): Array<{ question: string; answer: string }> {
    const items: Array<{ question: string; answer: string }> = [];
    const regex = /<h[23][^>]*>(.*?)<\/h[23]>([\s\S]*?)(?=<h[23]|$)/gi;
    let match;
    while ((match = regex.exec(html)) !== null && items.length < 6) {
      const question = match[1].replace(/<[^>]+>/g, '').trim();
      if (!question.endsWith('?')) continue;
      const paraMatch = /<p[^>]*>([\s\S]*?)<\/p>/i.exec(match[2]);
      if (!paraMatch) continue;
      const answer = paraMatch[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 300);
      if (answer.length > 20) items.push({ question, answer });
    }
    return items;
  }

  /** Extract HowTo steps from HTML (h3 headings with "Step N:" prefix) */
  private extractHowToSteps(html: string): Array<{ name: string; text: string }> {
    const steps: Array<{ name: string; text: string }> = [];
    const regex = /<h3[^>]*>(?:Step\s+\d+[:\s]+|\d+\.\s+)(.*?)<\/h3>([\s\S]*?)(?=<h[23]|$)/gi;
    let match;
    while ((match = regex.exec(html)) !== null && steps.length < 10) {
      const name = match[1].replace(/<[^>]+>/g, '').trim();
      const paraMatch = /<p[^>]*>([\s\S]*?)<\/p>/i.exec(match[2]);
      const text = paraMatch
        ? paraMatch[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200)
        : name;
      if (name.length > 0) steps.push({ name, text });
    }
    return steps;
  }

  private escapeHtml(text: string): string {
    return text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  private decodeHtmlEntities(text: string): string {
    return text
      .replace(/&#8217;/g, "'")
      .replace(/&#8216;/g, "'")
      .replace(/&#8211;/g, '-')
      .replace(/&#8212;/g, '--')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&#039;/g, "'");
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
        (c) => this.decodeHtmlEntities(c.name).toLowerCase() === name.toLowerCase(),
      );
      if (existing) return existing.id;
    } catch {
      // continue to create
    }

    try {
      const response = await this.api.post('/categories', { name });
      return response.data.id as number;
    } catch (error) {
      // WordPress returns 400 term_exists with the existing term_id
      if (axios.isAxiosError(error) && error.response?.status === 400) {
        const termId = error.response.data?.data?.term_id;
        if (termId) {
          logger.debug(`Category "${name}" already exists (term_id=${termId})`);
          return termId as number;
        }
      }
      throw error;
    }
  }

  async getOrCreateTags(names: string[]): Promise<number[]> {
    const ids: number[] = [];
    for (const name of names) {
      try {
        const search = await this.api.get('/tags', { params: { search: name } });
        const tags = search.data as { id: number; name: string }[];
        const existing = tags.find(
          (t) => this.decodeHtmlEntities(t.name).toLowerCase() === name.toLowerCase(),
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
        // WordPress returns 400 term_exists with the existing term_id
        if (axios.isAxiosError(error) && error.response?.status === 400) {
          const termId = error.response.data?.data?.term_id;
          if (termId) {
            ids.push(termId as number);
            continue;
          }
        }
        logger.warn(`Failed to create tag "${name}": ${error instanceof Error ? error.message : error}`);
      }
    }
    return ids;
  }
}
