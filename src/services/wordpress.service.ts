import axios, { type AxiosInstance } from 'axios';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { logger } from '../utils/logger.js';
import { WordPressError } from '../types/errors.js';
import type { BlogContent, PublishedPost, MediaUploadResult, ExistingPost } from '../types/index.js';

const POSTS_CACHE_FILE = join(dirname(new URL(import.meta.url).pathname), '../../.cache/posts-cache.json');
const POSTS_CACHE_TTL_MS = 1 * 60 * 60 * 1000; // 1 hour

export class WordPressService {
  private api: AxiosInstance;
  private wpUrl: string;
  private siteOwner: string;
  private authorLinkedin: string;
  private authorTwitter: string;

  constructor(wpUrl: string, username: string, appPassword: string, siteOwner?: string, authorLinks?: { linkedin?: string; twitter?: string }) {
    this.wpUrl = wpUrl.replace(/\/+$/, '');
    this.siteOwner = siteOwner || '';
    this.authorLinkedin = authorLinks?.linkedin || '';
    this.authorTwitter = authorLinks?.twitter || '';
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
    // Check local cache first (6-hour TTL)
    try {
      if (existsSync(POSTS_CACHE_FILE)) {
        const cached = JSON.parse(readFileSync(POSTS_CACHE_FILE, 'utf-8')) as { timestamp: number; count: number; posts: ExistingPost[] };
        if (Date.now() - cached.timestamp < POSTS_CACHE_TTL_MS && cached.count >= count) {
          logger.info(`Using cached posts (${cached.posts.length} posts, age: ${((Date.now() - cached.timestamp) / 60000).toFixed(0)} min)`);
          return cached.posts;
        }
      }
    } catch {
      // Cache read failed, fetch fresh
    }

    try {
      const allPosts: Array<{ id: number; title: { rendered: string }; link: string; slug: string; categories: number[]; date: string; meta?: Record<string, string> }> = [];
      let page = 1;
      const perPage = 100;

      // Paginate to fetch all published posts (up to count)
      while (allPosts.length < count) {
        const { data, headers } = await this.api.get('/posts', {
          params: { per_page: Math.min(perPage, count - allPosts.length), page, status: 'publish', _fields: 'id,title,link,slug,categories,date,meta' },
        });
        const posts = data as Array<{ id: number; title: { rendered: string }; link: string; slug: string; categories: number[]; date: string; meta?: Record<string, string> }>;
        allPosts.push(...posts);
        const totalPages = parseInt(headers['x-wp-totalpages'] || '1');
        if (page >= totalPages) break;
        page++;
      }

      // Fetch category names
      const catIds = [...new Set(allPosts.flatMap((p) => p.categories))];
      const catMap = new Map<number, string>();
      if (catIds.length > 0) {
        // Fetch categories in batches of 100
        for (let i = 0; i < catIds.length; i += 100) {
          const batch = catIds.slice(i, i + 100);
          const { data: cats } = await this.api.get('/categories', {
            params: { include: batch.join(','), per_page: 100, _fields: 'id,name' },
          });
          for (const c of cats as Array<{ id: number; name: string }>) {
            catMap.set(c.id, c.name);
          }
        }
      }

      const posts = allPosts.map((p) => ({
        title: p.title.rendered.replace(/&#8217;/g, "'").replace(/&#8211;/g, '-').replace(/&amp;/g, '&'),
        url: p.link,
        slug: p.slug,
        category: catMap.get(p.categories[0]) || 'Uncategorized',
        keyword: p.meta?.rank_math_focus_keyword || undefined,
        postId: p.id,
        publishedAt: p.date,
      }));

      // Write to local cache
      try {
        const cacheDir = dirname(POSTS_CACHE_FILE);
        if (!existsSync(cacheDir)) mkdirSync(cacheDir, { recursive: true });
        writeFileSync(POSTS_CACHE_FILE, JSON.stringify({ timestamp: Date.now(), count, posts }));
        logger.debug(`Posts cache updated: ${posts.length} posts`);
      } catch {
        logger.debug('Failed to write posts cache');
      }

      return posts;
    } catch (error) {
      logger.warn(`Failed to fetch existing posts: ${error instanceof Error ? error.message : error}`);
      return [];
    }
  }

  async uploadMedia(imageBuffer: Buffer, filename: string, altText?: string): Promise<MediaUploadResult> {
    const contentType = filename.endsWith('.avif') ? 'image/avif'
      : filename.endsWith('.webp') ? 'image/webp'
      : 'image/png';
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

  /**
   * Generate SEO-optimized alt text for images.
   * Combines caption with keyword context for image search discoverability.
   */
  private generateSeoAltText(caption: string, keyword?: string, imageIndex?: number): string {
    const captionLower = caption.toLowerCase();
    const kw = keyword?.toLowerCase() || '';
    const kwWords = kw.split(/\s+/).filter(w => w.length > 3);

    // If caption already contains keyword fragments, use it as-is
    if (kwWords.length > 0 && kwWords.some(w => captionLower.includes(w))) {
      return caption;
    }

    // Add contextual keyword suffix based on image position
    if (keyword && imageIndex !== undefined) {
      const suffixes = [
        ` — ${keyword}`,
        ` in South Korea`,
        ` — Korean perspective`,
        ` overview`,
      ];
      const suffix = suffixes[Math.min(imageIndex, suffixes.length - 1)];
      const combined = caption + suffix;
      // Keep alt text under 125 chars for accessibility best practices
      return combined.length > 125 ? caption.slice(0, 122) + '...' : combined;
    }

    return caption;
  }

  private replaceImagePlaceholders(
    html: string,
    inlineImages?: Array<{ url: string; caption: string }>,
    options?: { keyword?: string; category?: string },
  ): string {
    if (inlineImages && inlineImages.length > 0) {
      for (let i = 0; i < inlineImages.length; i++) {
        const placeholder = `<!--IMAGE_PLACEHOLDER_${i + 1}-->`;
        // SEO-optimized alt text: keyword-enriched captions for image search
        const baseCaption = inlineImages[i].caption;
        const altText = this.escapeHtml(this.generateSeoAltText(baseCaption, options?.keyword, i));
        // First inline image uses eager loading for LCP; rest use lazy loading
        const loadingAttr = i === 0 ? 'eager' : 'lazy';
        const fetchPriority = i === 0 ? ' fetchpriority="high"' : '';
        // Include width/height attributes to prevent CLS (Cumulative Layout Shift)
        // WordPress auto-generates thumbnails at 300w, 768w, 1024w from 1200w uploads
        const srcUrl = inlineImages[i].url;
        const srcsetUrl = srcUrl.replace(/(\.\w+)$/, '');
        const ext = srcUrl.match(/(\.\w+)$/)?.[1] || '.webp';
        const srcsetAttr = `srcset="${srcsetUrl}-300x169${ext} 300w, ${srcsetUrl}-768x432${ext} 768w, ${srcsetUrl}-1024x576${ext} 1024w, ${srcUrl} 1200w"`;
        const sizesAttr = `sizes="(max-width: 768px) 100vw, (max-width: 1200px) 768px, 1200px"`;
        const titleAttr = `title="${altText}"`;
        const figureHtml =
          `<figure style="margin:30px 0; text-align:center;">` +
          `<img src="${srcUrl}" ${srcsetAttr} ${sizesAttr} alt="${altText}" ${titleAttr} width="1200" height="675" loading="${loadingAttr}"${fetchPriority} decoding="async" style="max-width:100%; width:100%; height:auto; border-radius:8px; box-shadow:0 2px 8px rgba(0,0,0,0.1); aspect-ratio:16/9; object-fit:cover;" />` +
          `<figcaption style="margin-top:10px; font-size:13px; color:#888; line-height:1.5;">${this.escapeHtml(baseCaption)}</figcaption>` +
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
    // Exclude currency symbols (₩ U+20A9, € U+20AC, £ U+00A3) and useful symbols (⌘, ⏰)
    html = html.replace(/[\u{1F300}-\u{1FFFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{25A0}-\u{25FF}\u{2B50}-\u{2B55}\u{FE00}-\u{FE0F}\u{200D}]/gu, '');

    return html;
  }

  /** Source registry: maps cite data-source keys to verified URLs */
  private static readonly SOURCE_REGISTRY: Record<string, { domain: string; paths: Record<string, string>; label: string }> = {
    // Korean institutions
    bok:    { domain: 'https://www.bok.or.kr', paths: { default: '/', 'monetary-policy': '/eng/monetary/', research: '/eng/research/' }, label: 'Bank of Korea' },
    krx:    { domain: 'https://www.krx.co.kr', paths: { default: '/', market: '/eng/main/', statistics: '/eng/statistics/' }, label: 'Korea Exchange' },
    dart:   { domain: 'https://dart.fss.or.kr', paths: { default: '/' }, label: 'DART' },
    kosis:  { domain: 'https://kosis.kr', paths: { default: '/', statistics: '/eng/' }, label: 'KOSIS' },
    fsc:    { domain: 'https://www.fsc.go.kr', paths: { default: '/eng/', policy: '/eng/po/' }, label: 'Financial Services Commission' },
    ftc:    { domain: 'https://www.ftc.go.kr', paths: { default: '/eng/' }, label: 'Fair Trade Commission' },
    msit:   { domain: 'https://www.msit.go.kr', paths: { default: '/eng/' }, label: 'Ministry of Science and ICT' },
    kotra:  { domain: 'https://www.kotra.or.kr', paths: { default: '/eng/' }, label: 'KOTRA' },
    kisa:   { domain: 'https://www.kisa.or.kr', paths: { default: '/eng/' }, label: 'KISA' },
    kocca:  { domain: 'https://www.kocca.kr', paths: { default: '/en/' }, label: 'KOCCA' },
    // Korean companies
    samsung:  { domain: 'https://www.samsung.com', paths: { default: '/', ir: '/global/ir/' }, label: 'Samsung' },
    hyundai:  { domain: 'https://www.hyundai.com', paths: { default: '/' }, label: 'Hyundai' },
    lg:       { domain: 'https://www.lgcorp.com', paths: { default: '/' }, label: 'LG Corporation' },
    skhynix:  { domain: 'https://www.skhynix.com', paths: { default: '/' }, label: 'SK Hynix' },
    naver:    { domain: 'https://www.navercorp.com', paths: { default: '/' }, label: 'Naver' },
    kakao:    { domain: 'https://www.kakaocorp.com', paths: { default: '/' }, label: 'Kakao' },
    coupang:  { domain: 'https://www.coupang.com', paths: { default: '/' }, label: 'Coupang' },
    // News/Data
    bloomberg: { domain: 'https://www.bloomberg.com', paths: { default: '/', markets: '/markets/', technology: '/technology/', asia: '/asia/' }, label: 'Bloomberg' },
    reuters:   { domain: 'https://www.reuters.com', paths: { default: '/', markets: '/markets/', technology: '/technology/', asia: '/world/asia-pacific/' }, label: 'Reuters' },
    nikkei:    { domain: 'https://asia.nikkei.com', paths: { default: '/', business: '/Business/', economy: '/Economy/' }, label: 'Nikkei Asia' },
    statista:  { domain: 'https://www.statista.com', paths: { default: '/' }, label: 'Statista' },
    worldbank: { domain: 'https://www.worldbank.org', paths: { default: '/', data: '/en/country/korea/' }, label: 'World Bank' },
    // Entertainment
    hybe:              { domain: 'https://www.hybecorp.com', paths: { default: '/', ir: '/eng/ir/' }, label: 'HYBE' },
    'sm-entertainment': { domain: 'https://www.smentertainment.com', paths: { default: '/' }, label: 'SM Entertainment' },
    jyp:               { domain: 'https://www.jype.com', paths: { default: '/' }, label: 'JYP Entertainment' },
    // General
    wikipedia: { domain: 'https://en.wikipedia.org', paths: { default: '/' }, label: 'Wikipedia' },
  };

  /**
   * Resolve <cite data-source="..."> tags to proper <a href> links.
   * Uses SOURCE_REGISTRY for safe, verified URL resolution.
   */
  private resolveSourceCitations(html: string): string {
    return html.replace(
      /<cite\s+data-source="([^"]+)"(?:\s+data-topic="([^"]*)")?\s*>(.*?)<\/cite>/gi,
      (_match, source: string, topic: string | undefined, displayText: string) => {
        const entry = WordPressService.SOURCE_REGISTRY[source.toLowerCase()];
        if (!entry) {
          logger.warn(`Unknown cite source "${source}", keeping as plain text`);
          return displayText;
        }
        const path = (topic && entry.paths[topic]) || entry.paths.default || '/';
        const url = entry.domain + path;
        return `<a href="${url}" target="_blank" rel="noopener noreferrer" style="color:#0066FF; text-decoration:underline;">${displayText}</a>`;
      },
    );
  }

  /** Approved external link domains (domain root only) */
  private static readonly APPROVED_DOMAINS = new Set([
    'bok.or.kr', 'krx.co.kr', 'dart.fss.or.kr', 'kosis.kr',
    'fsc.go.kr', 'ftc.go.kr', 'msit.go.kr', 'kotra.or.kr', 'kisa.or.kr', 'kocca.kr',
    'samsung.com', 'hyundai.com', 'lgcorp.com', 'skhynix.com',
    'navercorp.com', 'kakaocorp.com', 'coupang.com',
    'bloomberg.com', 'reuters.com', 'asia.nikkei.com', 'statista.com', 'worldbank.org',
    'hybecorp.com', 'smentertainment.com', 'jype.com',
    'twitter.com', 'x.com', 'linkedin.com', 'facebook.com',
    'google.com', 'youtube.com', 'wikipedia.org',
  ]);

  /**
   * Validate external links in HTML content:
   * 1. Strip deep paths to domain root (prevent fabricated URLs)
   * 2. Remove links to non-whitelisted domains
   * 3. HEAD-check remaining links
   */
  private async validateExternalLinks(html: string): Promise<string> {
    const extLinkRegex = /<a\s+[^>]*href="(https?:\/\/[^"]+)"[^>]*target="_blank"[^>]*>(.*?)<\/a>/gi;
    const links: Array<{ full: string; url: string; text: string }> = [];
    let match;
    while ((match = extLinkRegex.exec(html)) !== null) {
      links.push({ full: match[0], url: match[1], text: match[2] });
    }

    if (links.length === 0) return html;

    let updatedHtml = html;

    for (const link of links) {
      try {
        const parsed = new URL(link.url);
        const domain = parsed.hostname.replace(/^www\./, '');

        // Check if domain is in approved whitelist
        const isApproved = WordPressService.APPROVED_DOMAINS.has(domain) ||
          [...WordPressService.APPROVED_DOMAINS].some(d => domain.endsWith('.' + d));

        if (!isApproved) {
          // Remove link, keep text
          logger.warn(`External link removed (non-whitelisted domain): ${link.url}`);
          updatedHtml = updatedHtml.replace(link.full, link.text);
          continue;
        }

        // Strip fabricated deep paths (5+ segments) but allow up to 4 segment paths for E-E-A-T
        // e.g., bloomberg.com/markets/asia/ is OK, deep fabricated article paths are trimmed
        const pathSegments = parsed.pathname.split('/').filter(Boolean);
        if (pathSegments.length > 4) {
          // Keep up to 4 segments for specific article/data page links
          const safePath = '/' + pathSegments.slice(0, 4).join('/') + '/';
          const safeUrl = parsed.origin + safePath;
          const fixedLink = link.full.replace(link.url, safeUrl);
          logger.warn(`Deep path trimmed: ${link.url} → ${safeUrl}`);
          updatedHtml = updatedHtml.replace(link.full, fixedLink);
        }
      } catch {
        // Invalid URL — remove link, keep text
        logger.warn(`Removing invalid external link: ${link.url}`);
        updatedHtml = updatedHtml.replace(link.full, link.text);
      }
    }

    // HEAD-check remaining external links
    const remainingRegex = /<a\s+[^>]*href="(https?:\/\/[^"]+)"[^>]*target="_blank"[^>]*>(.*?)<\/a>/gi;
    const remainingLinks: Array<{ full: string; url: string; text: string }> = [];
    while ((match = remainingRegex.exec(updatedHtml)) !== null) {
      remainingLinks.push({ full: match[0], url: match[1], text: match[2] });
    }

    const results = await Promise.allSettled(
      remainingLinks.map(async (link) => {
        try {
          await axios.head(link.url, { timeout: 3000, maxRedirects: 3 });
          return { ...link, ok: true };
        } catch (headErr) {
          if (axios.isAxiosError(headErr) && !headErr.response) {
            return { ...link, ok: true }; // Timeout = likely valid
          }
          try {
            await axios.get(link.url, { timeout: 3000, maxRedirects: 3, headers: { Range: 'bytes=0-0' } });
            return { ...link, ok: true };
          } catch (getErr) {
            if (axios.isAxiosError(getErr) && getErr.response && getErr.response.status >= 400) {
              return { ...link, ok: false };
            }
            return { ...link, ok: true };
          }
        }
      }),
    );

    for (const result of results) {
      if (result.status === 'fulfilled' && !result.value.ok) {
        const { full, text, url } = result.value;
        logger.warn(`Broken external link removed: ${url}`);
        updatedHtml = updatedHtml.replace(full, text);
      }
    }

    return updatedHtml;
  }

  /**
   * Check if a slug already exists and return a unique one.
   */
  async ensureUniqueSlug(slug: string): Promise<string> {
    try {
      const { data } = await this.api.get('/posts', {
        params: { slug, status: 'publish,draft,pending', _fields: 'id,slug' },
      });
      if (Array.isArray(data) && data.length > 0) {
        // Avoid double-year: check if slug already ends with a year (e.g., -2026)
        const yearSuffix = new Date().getFullYear().toString();
        const alreadyHasYear = slug.endsWith(`-${yearSuffix}`);
        const newSlug = alreadyHasYear ? `${slug}-v2` : `${slug}-${yearSuffix}`;
        logger.warn(`Slug "${slug}" already exists (post ID ${data[0].id}), using "${newSlug}"`);
        return newSlug;
      }
    } catch {
      // If check fails, proceed with original slug
    }
    return slug;
  }

  /**
   * Build consolidated CSS style block to reduce inline CSS repetition.
   * Injected once per post, reducing HTML size by ~30%.
   */
  private buildConsolidatedStyleBlock(): string {
    return `<style>
.post-content{max-width:760px;margin:0 auto;padding:0 20px;font-family:'Noto Sans KR',sans-serif;color:#333;line-height:1.7;font-size:16px}
.post-content p{margin:0 0 20px 0;line-height:1.8;color:#333;font-size:16px}
.post-content h2{border-left:5px solid #0066FF;padding-left:15px;font-size:22px;color:#222;margin:40px 0 20px 0}
.post-content h3{font-size:18px;color:#444;margin:30px 0 15px 0;padding-bottom:8px;border-bottom:1px solid #eee}
.post-content a{color:#0066FF;text-decoration:underline}
.post-content a[target="_blank"]{color:#0066FF;text-decoration:underline}
.post-content blockquote{border-left:4px solid #0066FF;margin:24px 0;padding:16px 24px;background:#f8f9fa;font-style:italic;color:#555;line-height:1.7}
.post-content hr{border:none;height:1px;background:linear-gradient(to right,#ddd,#eee,#ddd);margin:36px 0}
.post-content figure{margin:30px 0;text-align:center}
.post-content figure img{max-width:100%;width:100%;height:auto;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,0.1);aspect-ratio:16/9;object-fit:cover}
.post-content figcaption{margin-top:10px;font-size:13px;color:#888;line-height:1.5}
.ab-toc{background:#f0f4ff;padding:16px 20px;border-radius:12px;margin:24px 0 36px 0}
.ab-toc summary{font-weight:700;font-size:17px;margin:0 0 12px 0;color:#0066FF;cursor:pointer;list-style:none}
.ab-toc ol{margin:0;padding-left:20px;line-height:2.0;color:#555}
.ab-toc a{color:#0066FF;text-decoration:none}
.ab-takeaways{background:#f0f4ff;border:2px solid #0066FF;padding:20px 24px;border-radius:12px;margin:0 0 36px 0}
.ab-snippet{background:#f8f9fa;border:1px solid #e2e8f0;padding:20px;border-radius:8px;margin:0 0 24px 0}
.ab-snippet p{margin:0;font-size:16px;line-height:1.7;color:#333}
.ab-highlight{background:#f8f9fa;border-left:4px solid #0066FF;padding:20px 24px;margin:24px 0;border-radius:0 8px 8px 0}
.ab-highlight p{margin:0;line-height:1.7;color:#555}
.ab-keypoint{background:#fff8e1;border:1px solid #ffe082;padding:20px 24px;border-radius:8px;margin:24px 0}
.ab-metrics{display:flex;flex-wrap:wrap;gap:12px;margin:24px 0}
.ab-metrics>div{flex:1;min-width:140px;padding:16px;background:#f0f4ff;border-radius:10px;text-align:center}
.ab-step{display:flex;align-items:center;gap:12px;margin:30px 0 15px 0}
.ab-step-num{width:36px;height:36px;background:#0066FF;border-radius:50%;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:16px;flex-shrink:0}
.ab-proscons{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:24px 0}
.ab-pros{padding:16px;background:#f0fff4;border-radius:10px;border:1px solid #c6f6d5}
.ab-cons{padding:16px;background:#fff5f5;border-radius:10px;border:1px solid #fed7d7}
.ab-table-wrap{overflow-x:auto;-webkit-overflow-scrolling:touch;margin:24px 0}
.ab-cta{margin:30px 0;border-radius:12px;text-align:center}
.ab-cta-newsletter{padding:28px 24px;background:linear-gradient(135deg,#0052CC 0%,#0066FF 100%);color:#fff}
.ab-cta-newsletter p{color:#fff}
.ab-cta-engagement{padding:24px;background:linear-gradient(135deg,#f0f4ff 0%,#e8f0fe 100%)}
.ab-cta-share{margin:24px 0;padding:20px 24px;background:#f0f4ff;border-radius:12px;text-align:center}
.ab-related{margin:30px 0;padding:24px;background:#f8f9fa;border-radius:12px}
.ab-related-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:12px}
.ab-related-card{text-decoration:none;display:block;background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:16px;transition:box-shadow 0.2s}
.ab-related-card:hover{box-shadow:0 4px 12px rgba(0,0,0,0.1)}
.ab-tag{display:inline-block;padding:4px 12px;margin:0 6px 6px 0;background:#f0f4ff;color:#0066FF;border-radius:14px;font-size:13px;text-decoration:none}
.ab-byline{margin:30px 0 0 0;padding:20px 24px;background:#f8f9fa;border-radius:8px;display:flex;align-items:center;gap:16px}
.ab-share-btn{display:inline-block;padding:8px 16px;margin:0 8px 8px 0;border-radius:6px;text-decoration:none;font-size:14px;font-weight:600;color:#fff}
.ab-disclaimer{margin:40px 0 0 0;padding-top:20px;border-top:1px solid #eee;font-size:13px;color:#999;line-height:1.6}
.ab-header{margin:0 0 30px 0;padding-bottom:20px;border-bottom:1px solid #eee}
.ab-header time{font-size:13px;color:#888}
.ab-faq details{margin:0 0 12px 0;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden}
.ab-faq summary{padding:14px 20px;font-weight:600;font-size:16px;color:#222;cursor:pointer;background:#f8f9fa;list-style:none}
.ab-faq .faq-answer{padding:14px 20px}
@media(max-width:768px){.ab-proscons{grid-template-columns:1fr}}
@media(prefers-color-scheme:dark){
.post-content{background:#1a1a2e!important;color:#e0e0e0!important}
.post-content p,.post-content li,.post-content td{color:#e0e0e0!important}
.post-content a{color:#4da6ff!important}
.post-content h2,.post-content h3{color:#f0f0f0!important}
.post-content blockquote{background:#2a2a3e!important;color:#c0c0c0!important}
.ab-toc{background:#2a2a3e!important}
.ab-toc summary{color:#4da6ff!important}
.ab-cta-engagement{background:linear-gradient(135deg,#1a1a3e 0%,#2a2a4e 100%)}
.ab-cta-engagement p{color:#e0e0e0!important}
.ab-cta-share{background:#2a2a3e!important}
.ab-cta-share p{color:#e0e0e0!important}
.ab-related{background:#2a2a3e!important}
.ab-related-card{background:#1a1a2e!important;border-color:#3a3a5e!important}
.ab-related-card p{color:#e0e0e0!important}
.ab-tag{background:#2a2a4e!important;color:#4da6ff!important}
.ab-byline{background:#2a2a3e!important}
.ab-byline p{color:#e0e0e0!important}
.ab-takeaways{background:#1a1a3e!important;border-color:#4a4aff!important}
.ab-takeaways p,.ab-takeaways li{color:#e0e0e0!important}
.ab-snippet{background:#2a2a3e!important;border-color:#3a3a5e!important}
.ab-snippet p,.ab-snippet li{color:#e0e0e0!important}
.ab-highlight{background:#2a2a3e!important;border-color:#4a4aff!important}
.ab-highlight p{color:#e0e0e0!important}
.ab-keypoint{background:#2a2a1e!important;border-color:#665500!important}
.ab-keypoint p{color:#e0e0e0!important}
.ab-metrics>div{background:#1a1a3e!important}
.ab-metrics p{color:#e0e0e0!important}
.ab-pros{background:#1a2e1a!important;border-color:#2e5e2e!important}
.ab-cons{background:#2e1a1a!important;border-color:#5e2e2e!important}
.ab-faq details{border-color:#3a3a5e!important}
.ab-faq summary{background:#2a2a3e!important;color:#e0e0e0!important}
.ab-header{border-color:#3a3a5e!important}
.ab-disclaimer{border-color:#3a3a5e!important;color:#888!important}
}
</style>`;
  }

  /**
   * Build Related Posts HTML section as card grid from existing posts in same category.
   */
  private buildRelatedPostsHtml(
    existingPosts: ExistingPost[],
    currentCategory: string,
    currentTitle: string,
  ): string {
    const related = existingPosts
      .filter(p =>
        p.category.toLowerCase() === currentCategory.toLowerCase() &&
        p.title !== currentTitle,
      )
      .slice(0, 4); // 4 cards for 2x2 grid

    if (related.length === 0) return '';

    const cards = related
      .map(p => {
        const shortTitle = p.title.length > 60 ? p.title.slice(0, 57) + '...' : p.title;
        const categoryLabel = this.escapeHtml(p.category);
        return `<a href="${p.url}" class="ab-related-card">
<p style="margin:0 0 6px 0; font-size:11px; font-weight:600; color:#0066FF; text-transform:uppercase; letter-spacing:0.5px;">${categoryLabel}</p>
<p style="margin:0; font-size:15px; font-weight:600; color:#222; line-height:1.4;">${this.escapeHtml(shortTitle)}</p></a>`;
      })
      .join('\n');

    return `<div class="ab-related">
<p style="margin:0 0 16px 0; font-weight:700; font-size:17px; color:#222;">You Might Also Like</p>
<div class="ab-related-grid">${cards}</div></div>`;
  }

  /**
   * Inject "Related in this series" spoke-to-spoke links for same sub-niche posts.
   * Inserts after the first H2 section to strengthen topic cluster internal linking.
   */
  private injectTopicClusterLinks(html: string, existingPosts: ExistingPost[], subNiche: string, currentTitle: string): string {
    const sameSeries = existingPosts
      .filter(p => p.subNiche === subNiche && p.title !== currentTitle)
      .sort((a, b) => {
        // Sort by publish date for chronological series order
        const dateA = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
        const dateB = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
        return dateA - dateB;
      })
      .slice(0, 5);

    if (sameSeries.length === 0) return html;

    // Build numbered series navigation
    const seriesLabel = subNiche.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    const links = sameSeries
      .map((p, i) => {
        const isCurrent = p.title === currentTitle;
        const style = isCurrent
          ? 'color:#333; font-weight:700; text-decoration:none;'
          : 'color:#0066FF; text-decoration:none; font-weight:500;';
        const prefix = `<span style="color:#0066FF; font-weight:700; margin-right:6px;">${i + 1}.</span>`;
        return isCurrent
          ? `<li style="margin:4px 0;">${prefix}<span style="${style}">${this.escapeHtml(p.title)} (You're here)</span></li>`
          : `<li style="margin:4px 0;">${prefix}<a href="${p.url}" style="${style}">${this.escapeHtml(p.title)}</a></li>`;
      })
      .join('\n');

    const block = `<div class="ab-series-nav">
<p style="margin:0 0 10px 0; font-size:13px; font-weight:700; color:#666; text-transform:uppercase; letter-spacing:0.5px;">${this.escapeHtml(seriesLabel)} Series</p>
<ol style="margin:0; padding:0 0 0 4px; list-style:none; line-height:1.8;">${links}</ol></div>`;

    // Insert after the first H2 section's first paragraph
    const firstH2End = html.indexOf('</h2>');
    if (firstH2End === -1) return html;
    const nextP = html.indexOf('</p>', firstH2End);
    if (nextP === -1) return html;
    const insertPos = nextP + '</p>'.length;
    return html.slice(0, insertPos) + '\n' + block + '\n' + html.slice(insertPos);
  }

  /**
   * Build follow/explore CTA section (honest about what's available).
   */
  private buildNewsletterCtaHtml(category: string): string {
    return `<div class="ab-cta ab-cta-newsletter">
<p style="margin:0 0 8px 0; font-size:20px; font-weight:700;">Explore More ${this.escapeHtml(category)} Insights</p>
<p style="margin:0 0 16px 0; font-size:14px; color:rgba(255,255,255,0.85); line-height:1.5;">We publish in-depth analysis on Korean trends, markets, and culture every week. Bookmark this site or follow us on social media to stay updated.</p>
<a href="${this.wpUrl}/category/${category.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}/" style="display:inline-block; padding:12px 32px; background:#fff; color:#0066FF; font-weight:700; font-size:15px; border-radius:8px; text-decoration:none;">Browse All ${this.escapeHtml(category)} Posts</a>
<p style="margin:10px 0 0 0; font-size:12px; color:rgba(255,255,255,0.6);">New articles published weekly.</p></div>`;
  }

  /**
   * Build engagement question section to encourage comments.
   * Generates keyword-aware dynamic questions instead of static templates.
   */
  private buildEngagementQuestionHtml(keyword: string, category: string): string {
    // Dynamic question patterns that incorporate the actual topic
    const dynamicPatterns: Record<string, Array<(kw: string) => string>> = {
      'Korean Tech': [
        (kw) => `What's your experience with ${kw}? Have you found better alternatives? Share below!`,
        (kw) => `How do you think ${kw} compares to similar options outside Korea? We'd love to hear your take.`,
        (kw) => `Are you currently using or considering ${kw}? What factors matter most to you?`,
      ],
      'K-Entertainment': [
        (kw) => `What's your perspective on ${kw}? Has it changed how you view the Korean entertainment industry?`,
        (kw) => `How has ${kw} influenced your interest in Korean culture? Share your story below.`,
        (kw) => `What do you think the future holds for ${kw}? Drop your predictions in the comments.`,
      ],
      'Korean Finance': [
        (kw) => `Are you factoring ${kw} into your investment strategy? What's your approach?`,
        (kw) => `How do you evaluate ${kw} compared to similar opportunities in other markets?`,
        (kw) => `What's the biggest risk or opportunity you see with ${kw}? Share your analysis below.`,
      ],
      'Korean Food': [
        (kw) => `Have you tried ${kw}? What was your experience like? Share your tips below!`,
        (kw) => `What's your go-to approach for ${kw}? Any local secrets you've discovered?`,
        (kw) => `How does ${kw} compare to similar food experiences in your country? Tell us in the comments.`,
      ],
      'Korea Travel': [
        (kw) => `Have you experienced ${kw} firsthand? What tips would you give first-timers?`,
        (kw) => `What surprised you most about ${kw}? Share your travel stories below!`,
        (kw) => `Planning to explore ${kw}? What questions do you have? Our community can help.`,
      ],
      'Korean Language': [
        (kw) => `How's your progress with ${kw}? What study methods work best for you?`,
        (kw) => `What's the trickiest part of ${kw} for you? Let's help each other in the comments.`,
        (kw) => `Any resources for ${kw} that you'd recommend to fellow learners? Share below!`,
      ],
    };

    const patterns = dynamicPatterns[category] || [
      (kw: string) => `What are your thoughts on ${kw}? Share your perspective in the comments below.`,
    ];
    // Deterministic selection based on keyword hash (consistent across builds/cache-clears)
    let hash = 0;
    for (let i = 0; i < keyword.length; i++) {
      hash = ((hash << 5) - hash + keyword.charCodeAt(i)) | 0;
    }
    const question = patterns[Math.abs(hash) % patterns.length](keyword);

    return `<div class="ab-cta ab-cta-engagement">
<p style="margin:0 0 8px 0; font-size:18px; font-weight:700; color:#222;">Join the Discussion</p>
<p style="margin:0; font-size:15px; color:#555; line-height:1.6;">${this.escapeHtml(question)}</p></div>`;
  }

  /**
   * Build social share CTA section.
   */
  private buildShareCtaHtml(postUrl: string, title: string): string {
    const encodedUrl = encodeURIComponent(postUrl);
    const encodedTitle = encodeURIComponent(title);
    return `<div class="ab-cta-share">
<p style="margin:0 0 12px 0; font-size:16px; font-weight:700; color:#333;">Found this useful? Share it!</p>
<div>
<a href="https://twitter.com/intent/tweet?url=${encodedUrl}&text=${encodedTitle}" target="_blank" rel="noopener noreferrer" class="ab-share-btn" style="background:#1DA1F2;">X / Twitter</a>
<a href="https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}" target="_blank" rel="noopener noreferrer" class="ab-share-btn" style="background:#0077B5;">LinkedIn</a>
<a href="https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}" target="_blank" rel="noopener noreferrer" class="ab-share-btn" style="background:#4267B2;">Facebook</a>
</div></div>`;
  }

  /**
   * Build email newsletter subscription CTA with form.
   */
  private buildEmailNewsletterCta(category: string, formUrl: string): string {
    const safeCategory = this.escapeHtml(category);
    return `<div class="ab-newsletter-cta">
<p style="margin:0 0 8px 0; font-size:20px; font-weight:700;">Get ${safeCategory} Insights Weekly</p>
<p style="margin:0 0 16px 0; font-size:14px; color:rgba(255,255,255,0.85); line-height:1.5;">Join readers who get our latest Korea analysis delivered to their inbox every week. No spam, unsubscribe anytime.</p>
<form action="${this.escapeHtml(formUrl)}" method="POST" target="_blank" rel="noopener noreferrer" style="display:flex; flex-wrap:wrap; justify-content:center; gap:8px;">
<input type="email" name="email" placeholder="your@email.com" required style="padding:10px 16px; border:none; border-radius:6px; font-size:15px; width:60%; max-width:300px;">
<button type="submit" style="padding:10px 24px; background:#fff; color:#0066FF; border:none; border-radius:6px; font-weight:700; font-size:15px; cursor:pointer;">Subscribe Free</button>
</form>
<p style="margin:10px 0 0 0; font-size:11px; color:rgba(255,255,255,0.5);">We respect your privacy. Unsubscribe at any time.</p></div>`;
  }

  /**
   * Category-based default affiliate keywords.
   * These are auto-applied when the content matches a category, providing affiliate
   * opportunities even without manual AFFILIATE_MAP configuration.
   * Placeholder URLs — replace with actual affiliate links in AFFILIATE_MAP env var.
   */
  private static readonly CATEGORY_AFFILIATE_KEYWORDS: Record<string, Record<string, string>> = {
    'K-Beauty': {
      'Olive Young': '',
      'YesStyle': '',
      'StyleKorean': '',
      'COSRX': '',
      'Innisfree': '',
    },
    'Korea Travel': {
      'Klook': '',
      'KKday': '',
      'Agoda': '',
      'T-money': '',
      'Airalo': '',
    },
    'Korean Food': {
      'Maangchi': '',
      'Korean grocery': '',
      'gochugaru': '',
    },
    'Korean Finance': {
      'Interactive Brokers': '',
      'Webull': '',
      'Tiger Brokers': '',
    },
    'Korean Tech': {
      'Samsung Galaxy': '',
      'LG OLED': '',
    },
    'Korean Language': {
      'Talk To Me In Korean': '',
      'LingoDeer': '',
      'italki': '',
    },
  };

  /**
   * Get merged affiliate map: user-provided AFFILIATE_MAP overrides + category defaults.
   * Only includes entries with non-empty URLs.
   */
  private getMergedAffiliateMap(userMap: Record<string, string>, category?: string): Record<string, string> {
    const merged: Record<string, string> = {};
    // Add category defaults (only those with URLs)
    if (category) {
      const categoryDefaults = WordPressService.CATEGORY_AFFILIATE_KEYWORDS[category];
      if (categoryDefaults) {
        for (const [kw, url] of Object.entries(categoryDefaults)) {
          if (url) merged[kw] = url;
        }
      }
    }
    // User overrides take priority
    for (const [kw, url] of Object.entries(userMap)) {
      if (url) merged[kw] = url;
    }
    return merged;
  }

  /**
   * Inject affiliate links for known products/brands mentioned in content.
   * Uses AFFILIATE_MAP env var: JSON object mapping keyword patterns to affiliate URLs.
   * Also applies category-based default affiliate keywords when URLs are configured.
   * Example: {"coupang":"https://link.coupang.com/aff?id=xxx","Olive Young":"https://oliveyoung.com/aff?ref=xxx"}
   */
  private injectAffiliateLinks(html: string, affiliateMap: Record<string, string>): string {
    if (Object.keys(affiliateMap).length === 0) return html;

    let result = html;
    let injectedCount = 0;

    for (const [keyword, affiliateUrl] of Object.entries(affiliateMap)) {
      // Only replace first occurrence of keyword that isn't already linked
      const pattern = new RegExp(
        `(?<![">])\\b(${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})\\b(?![^<]*<\\/a>)`,
        'i',
      );
      const match = pattern.exec(result);
      if (match && injectedCount < 3) { // Max 3 affiliate links per post
        const replacement = `<a href="${affiliateUrl}" target="_blank" rel="noopener noreferrer sponsored" style="color:#0066FF; text-decoration:underline;">${match[1]}</a>`;
        result = result.slice(0, match.index) + replacement + result.slice(match.index + match[0].length);
        injectedCount++;
        logger.debug(`Affiliate link injected for "${keyword}"`);
      }
    }

    if (injectedCount > 0) {
      logger.info(`Injected ${injectedCount} affiliate link(s)`);
    }
    return result;
  }

  async createPost(
    content: BlogContent,
    featuredImageId?: number,
    inlineImages?: Array<{ url: string; caption: string }>,
    options?: {
      contentType?: string;
      keyword?: string;
      featuredImageUrl?: string;
      ogImageUrl?: string;
      publishStatus?: 'publish' | 'draft';
      existingPosts?: ExistingPost[];
      scheduledDate?: string;
      pillarPageUrl?: string;
      subNiche?: string;
      skipInlineCss?: boolean;
      newsletterFormUrl?: string;
      titleCandidates?: string[];
      clusterNavHtml?: string;
      affiliateMap?: Record<string, string>;
    },
  ): Promise<PublishedPost> {
    // Ensure unique slug before publishing
    if (content.slug) {
      content.slug = await this.ensureUniqueSlug(content.slug);
    }

    // EN 콘텐츠만 포함 (KR 콘텐츠는 별도 URL로 분리 — 중복 콘텐츠 방지)
    let htmlEn = this.replaceImagePlaceholders(content.html, inlineImages, {
      keyword: options?.keyword,
      category: content.category,
    });

    // Wrap FAQ Q&A pairs as collapsible <details> elements
    htmlEn = this.wrapFaqAsDetails(htmlEn);

    // Inject cluster navigation link if pillar page URL is provided
    if (options?.pillarPageUrl) {
      const clusterNav = `<div style="margin:0 0 24px 0; padding:12px 20px; background:#f0f4ff; border-radius:8px; font-size:14px;">` +
        `<span style="color:#666;">Part of our </span>` +
        `<a href="${options.pillarPageUrl}" style="color:#0066FF; text-decoration:none; font-weight:600;">${this.escapeHtml(content.category)} Guide</a>` +
        `<span style="color:#666;"> series</span></div>`;
      // Insert after TOC
      const tocEndIdx = htmlEn.indexOf('</details>');
      if (tocEndIdx !== -1) {
        const insertPos = tocEndIdx + '</details>'.length;
        htmlEn = htmlEn.slice(0, insertPos) + '\n' + clusterNav + '\n' + htmlEn.slice(insertPos);
      }
    }

    // Inject "Last Updated" date banner at top of content for freshness signal
    const publishDate = options?.scheduledDate
      ? new Date(options.scheduledDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
      : new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    const lastUpdatedBanner = `<div style="background:#f0f8ff; border-left:4px solid #0066FF; padding:12px 20px; margin:0 0 24px 0; border-radius:0 8px 8px 0; font-size:14px; color:#555;"><strong>Last Updated:</strong> ${publishDate}</div>`;
    // Insert after the first heading or date div
    const firstH2 = htmlEn.indexOf('<h2');
    if (firstH2 > 0) {
      htmlEn = htmlEn.slice(0, firstH2) + lastUpdatedBanner + '\n' + htmlEn.slice(firstH2);
    } else {
      htmlEn = lastUpdatedBanner + '\n' + htmlEn;
    }

    // Excerpt already validated by ContentGeneratorService — use as-is
    const validatedExcerpt = content.excerpt;

    // Add doc-toc ARIA role to Table of Contents (supports both <div> and <details>)
    htmlEn = htmlEn.replace(
      /<details(\s+open)?(\s*style="background:#f0f4ff;[^"]*")>/,
      '<details$1 role="doc-toc" aria-label="Table of Contents"$2>',
    );
    // Also match details without open attribute (new default for mobile-friendly collapsed TOC)
    if (!htmlEn.includes('role="doc-toc"')) {
      htmlEn = htmlEn.replace(
        /<details(\s*style="background:#f0f4ff;[^"]*")>/,
        '<details role="doc-toc" aria-label="Table of Contents"$1>',
      );
    }
    // Fallback for legacy <div> TOC
    htmlEn = htmlEn.replace(
      /<div(\s*style="background:#f0f4ff;[^"]*")>(\s*<p[^>]*>Table of Contents<\/p>)/,
      '<div role="doc-toc" aria-label="Table of Contents"$1>$2',
    );

    // Build tag pills HTML
    const tagsEnHtml = content.tags.map((t) => `<span class="ab-tag">${this.escapeHtml(t)}</span>`).join('');
    const tagSection = (label: string, pills: string) =>
      `<div style="margin:30px 0 0 0; padding-top:20px; border-top:1px solid #eee;"><p style="margin:0 0 8px 0; font-size:14px; font-weight:600; color:#666;">${label}</p><div>${pills}</div></div>`;

    // Inject CTAs after H2 headings (structure-aware, avoids breaking tables/blockquotes)
    const h2Positions = this.findH2SectionEnds(htmlEn);
    const engagementCta = this.buildEngagementQuestionHtml(
      options?.keyword || content.title,
      content.category,
    );
    const newsletterCta = this.buildNewsletterCtaHtml(content.category);

    if (h2Positions.length >= 4) {
      // Insert engagement CTA after ~75% of H2 sections, newsletter after ~40%
      const engagementIdx = Math.min(Math.floor(h2Positions.length * 0.75), h2Positions.length - 1);
      const newsletterIdx = Math.min(Math.floor(h2Positions.length * 0.4), h2Positions.length - 1);
      // Sort insertion positions descending to preserve earlier indices
      const insertions = [
        { pos: h2Positions[engagementIdx], html: engagementCta },
        { pos: h2Positions[newsletterIdx], html: newsletterCta },
      ].sort((a, b) => b.pos - a.pos);
      for (const ins of insertions) {
        htmlEn = htmlEn.slice(0, ins.pos) + '\n' + ins.html + '\n' + htmlEn.slice(ins.pos);
      }
    } else if (h2Positions.length >= 2) {
      // Fewer sections: engagement after 2nd, newsletter after 1st
      const insertions = [
        { pos: h2Positions[Math.min(1, h2Positions.length - 1)], html: engagementCta },
        { pos: h2Positions[0], html: newsletterCta },
      ].sort((a, b) => b.pos - a.pos);
      for (const ins of insertions) {
        htmlEn = htmlEn.slice(0, ins.pos) + '\n' + ins.html + '\n' + htmlEn.slice(ins.pos);
      }
    }

    // Inject email newsletter subscription CTA (if configured)
    if (options?.newsletterFormUrl) {
      const emailCta = this.buildEmailNewsletterCta(content.category, options.newsletterFormUrl);
      // Insert before the disclaimer section
      const disclaimerIdx = htmlEn.indexOf('class="ab-disclaimer"');
      if (disclaimerIdx !== -1) {
        const insertAt = htmlEn.lastIndexOf('<p', disclaimerIdx);
        if (insertAt !== -1) {
          htmlEn = htmlEn.slice(0, insertAt) + '\n' + emailCta + '\n' + htmlEn.slice(insertAt);
        }
      }
    }

    // Inject AdSense manual ad placements (every 2 H2 sections, only if 4+ H2s)
    htmlEn = this.injectAdPlacements(htmlEn);

    // Inject Related Posts section
    if (options?.existingPosts && options.existingPosts.length > 0) {
      const relatedHtml = this.buildRelatedPostsHtml(options.existingPosts, content.category, content.title);
      if (relatedHtml) {
        htmlEn = htmlEn.replace(
          /(<p\s+(?:class="ab-disclaimer"|style="margin:40px 0 0 0; padding-top:20px; border-top:1px solid #eee; font-size:13px; color:#999;))/,
          relatedHtml + '\n$1',
        );
      }
    }

    // Inject spoke-to-spoke topic cluster links
    if (options?.subNiche && options?.existingPosts) {
      htmlEn = this.injectTopicClusterLinks(htmlEn, options.existingPosts, options.subNiche, content.title);
    }

    // Inject affiliate links for product/brand mentions (merged: user map + category defaults)
    const mergedAffiliateMap = this.getMergedAffiliateMap(options?.affiliateMap || {}, content.category);
    if (Object.keys(mergedAffiliateMap).length > 0) {
      htmlEn = this.injectAffiliateLinks(htmlEn, mergedAffiliateMap);
    }

    // Deduplicate internal links (same URL should only appear once)
    htmlEn = this.deduplicateInternalLinks(htmlEn);

    // Resolve <cite data-source> tags to verified external links
    htmlEn = this.resolveSourceCitations(htmlEn);

    // Validate external links BEFORE publish to prevent broken links from being exposed
    htmlEn = await this.validateExternalLinks(htmlEn);

    // Inject cluster navigation (related articles in the same topic cluster)
    if (options?.clusterNavHtml) {
      htmlEn += '\n' + options.clusterNavHtml;
    }

    // Skip inline CSS when site-wide snippet is active (saves ~3KB per post)
    const cssBlock = options?.skipInlineCss ? '' : this.buildConsolidatedStyleBlock() + '\n';
    let html = cssBlock + htmlEn + tagSection('Tags', tagsEnHtml);

    // Build JSON-LD structured data (stored in post meta, output via wp_head PHP snippet)
    const wordCount = htmlEn.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;
    const nowIso = new Date().toISOString();
    const jsonLdSchemas: object[] = [];

    // BlogPosting schema (enhanced with speakable, full ImageObject, keywords)
    jsonLdSchemas.push({
      '@context': 'https://schema.org',
      '@type': 'BlogPosting',
      headline: content.title,
      description: validatedExcerpt,
      inLanguage: 'en',
      articleSection: content.category,
      wordCount,
      datePublished: nowIso,
      dateModified: nowIso,
      keywords: content.tags.join(', '),
      ...(options?.featuredImageUrl ? {
        image: {
          '@type': 'ImageObject',
          url: options.featuredImageUrl,
          width: 1200,
          height: 675,
          description: content.imageCaptions?.[0] || content.title,
        },
        thumbnailUrl: options.featuredImageUrl,
      } : {}),
      ...(this.siteOwner ? {
        author: {
          '@type': 'Person',
          name: this.siteOwner,
          url: `${this.wpUrl}/about/`,
          description: 'Korea Market & Trends Analyst covering Korean tech, entertainment, and financial markets for a global audience.',
          knowsAbout: ['Korean technology', 'K-pop industry', 'Korean stock market', 'KOSPI', 'South Korean economy'],
          ...(this.authorLinkedin || this.authorTwitter ? {
            sameAs: [this.authorLinkedin, this.authorTwitter].filter(Boolean),
          } : {}),
        },
      } : {}),
      publisher: {
        '@type': 'Organization',
        name: this.siteOwner || 'TrendHunt',
        url: this.wpUrl,
        ...(options?.featuredImageUrl ? { logo: { '@type': 'ImageObject', url: options.featuredImageUrl } } : {}),
      },
      mainEntityOfPage: { '@type': 'WebPage', '@id': content.slug ? `${this.wpUrl}/${content.slug}/` : this.wpUrl },
      speakable: {
        '@type': 'SpeakableSpecification',
        cssSelector: ['.post-content > p:first-of-type', '.post-content h2'],
      },
    });

    // FAQ schema (auto-extracted from question headings)
    const faqItems = this.extractFaqItems(htmlEn);
    if (faqItems.length >= 2) {
      jsonLdSchemas.push({
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: faqItems.map(({ question, answer }) => ({
          '@type': 'Question',
          name: question,
          acceptedAnswer: { '@type': 'Answer', text: answer },
        })),
      });
      logger.debug(`FAQ schema: ${faqItems.length} questions prepared`);
    }

    // HowTo schema (how-to content type only)
    if (options?.contentType === 'how-to') {
      const steps = this.extractHowToSteps(htmlEn);
      if (steps.length >= 2) {
        jsonLdSchemas.push({
          '@context': 'https://schema.org',
          '@type': 'HowTo',
          name: content.title,
          description: validatedExcerpt,
          step: steps.map(({ name, text }) => ({
            '@type': 'HowToStep',
            name,
            text,
          })),
        });
        logger.debug(`HowTo schema: ${steps.length} steps prepared`);
      }
    }

    // ImageObject schema for featured image (improves Google Image Search ranking)
    if (options?.featuredImageUrl) {
      jsonLdSchemas.push({
        '@context': 'https://schema.org',
        '@type': 'ImageObject',
        contentUrl: options.featuredImageUrl,
        url: options.featuredImageUrl,
        name: `${content.title} - Featured Image`,
        description: content.excerpt,
        width: 1200,
        height: 675,
        encodingFormat: options.featuredImageUrl.endsWith('.avif') ? 'image/avif' : 'image/webp',
        creator: { '@type': 'Organization', name: 'TrendHunt' },
        copyrightNotice: `© ${new Date().getFullYear()} TrendHunt`,
      });
    }

    // BreadcrumbList schema for navigation
    jsonLdSchemas.push({
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: this.wpUrl },
        { '@type': 'ListItem', position: 2, name: content.category, item: `${this.wpUrl}/category/${content.category.toLowerCase().replace(/\s+/g, '-')}/` },
        { '@type': 'ListItem', position: 3, name: content.title, item: content.slug ? `${this.wpUrl}/${content.slug}/` : this.wpUrl },
      ],
    });

    // JSON-LD stored in post meta and output via wp_head (not in post body)
    const jsonLdString = JSON.stringify(jsonLdSchemas);

    const categoryId = await this.getOrCreateCategory(content.category);
    const tagIds = await this.getOrCreateTags(content.tags);

    logger.info(`Creating post: "${content.title}"`);

    // Retry post creation up to 3 times with exponential backoff
    let lastError: unknown;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const publishStatus = options?.publishStatus || 'publish';
        const postData: Record<string, unknown> = {
          title: content.title,
          content: html,
          excerpt: validatedExcerpt,
          status: publishStatus === 'draft' ? 'draft' : (options?.scheduledDate ? 'future' : 'publish'),
          categories: [categoryId],
          tags: tagIds,
          featured_media: featuredImageId ?? 0,
          meta: {
            rank_math_description: content.metaDescription || validatedExcerpt,
            rank_math_focus_keyword: options?.keyword || '',
            rank_math_title: content.title,
            rank_math_canonical_url: content.slug ? `${this.wpUrl}/${content.slug}/` : '',
            rank_math_facebook_title: content.title,
            rank_math_facebook_description: content.metaDescription || validatedExcerpt,
            rank_math_facebook_image: options?.ogImageUrl || options?.featuredImageUrl || '',
            rank_math_twitter_title: content.title,
            rank_math_twitter_description: content.metaDescription || validatedExcerpt,
            rank_math_twitter_image: options?.ogImageUrl || options?.featuredImageUrl || '',
            rank_math_twitter_use_facebook_data: '1',
            rank_math_twitter_card_type: 'summary_large_image',
            _autoblog_jsonld: jsonLdString,
            _autoblog_published_time: nowIso,
            _autoblog_modified_time: nowIso,
            ...(options?.titleCandidates?.length ? {
              _autoblog_title_candidates: JSON.stringify(options.titleCandidates),
              _autoblog_title_test_start: nowIso,
            } : {}),
          },
        };
        if (content.slug) {
          postData.slug = content.slug;
        }
        if (options?.scheduledDate) {
          postData.date = options.scheduledDate;
        }
        const response = await this.api.post('/posts', postData);

        const post: PublishedPost = {
          postId: response.data.id,
          url: response.data.link,
          title: content.title,
          featuredImageId: featuredImageId ?? 0,
        };

        logger.info(`Post published: ID=${post.postId} URL=${post.url}`);

        // Post-publish updates: JSON-LD URLs, share CTA, canonical fix, external link validation
        try {
          // Inject share CTA (with actual post URL) before tags section
          const shareCta = this.buildShareCtaHtml(post.url, content.title);
          let updatedHtml = html.replace(
            /(<div style="margin:30px 0 0 0; padding-top:20px; border-top:1px solid #eee;"><p style="[^"]*font-weight:600[^"]*">Tags<\/p>)/,
            shareCta + '\n$1',
          );

          // Fix JSON-LD mainEntityOfPage and breadcrumb with actual post URL
          let fixedJsonLd = jsonLdString.replace(
            /"mainEntityOfPage":\{"@type":"WebPage","@id":"[^"]*"\}/,
            `"mainEntityOfPage":{"@type":"WebPage","@id":"${post.url}"}`,
          );
          fixedJsonLd = fixedJsonLd.replace(
            /"position":3,"name":"[^"]*"\}/,
            `"position":3,"name":"${content.title.replace(/"/g, '\\"')}","item":"${post.url}"}`,
          );

          const postMeta: Record<string, string> = {
            _autoblog_jsonld: fixedJsonLd,
          };
          // Fix canonical URL with actual URL (in case WP changed the slug)
          if (post.url !== `${this.wpUrl}/${content.slug}/`) {
            postMeta.rank_math_canonical_url = post.url;
          }

          const updates: Record<string, unknown> = { meta: postMeta };
          if (updatedHtml !== html) updates.content = updatedHtml;
          await this.api.post(`/posts/${post.postId}`, updates);
          logger.debug(`Post updated with actual URL, share CTA, JSON-LD fix: ${post.url}`);
        } catch {
          logger.warn(`Failed to update post-publish data for post ${post.postId}`);
        }

        return post;
      } catch (error) {
        lastError = error;
        if (attempt < 3) {
          const delay = attempt * 3000; // 3s, 6s
          logger.warn(`Post creation attempt ${attempt}/3 failed, retrying in ${delay / 1000}s...`);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    {
      const detail = axios.isAxiosError(lastError)
        ? `${lastError.response?.status} ${JSON.stringify(lastError.response?.data ?? lastError.message)}`
        : (lastError instanceof Error ? lastError.message : String(lastError));
      throw new WordPressError(`Failed to create post after 3 attempts: "${content.title}" - ${detail}`, lastError);
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

  /**
   * Wrap FAQ question/answer pairs in collapsible <details> elements.
   */
  private wrapFaqAsDetails(html: string): string {
    // Find FAQ section (h2 or h3 containing "FAQ" or "Frequently Asked")
    const faqSectionRegex = /<h[23][^>]*>[^<]*(?:FAQ|Frequently Asked)[^<]*<\/h[23]>/i;
    const faqMatch = faqSectionRegex.exec(html);
    if (!faqMatch) return html;

    const faqStart = faqMatch.index + faqMatch[0].length;
    // Find next H2 or end of content to determine FAQ section boundary
    const nextH2Match = /<h2\b/i.exec(html.slice(faqStart));
    const faqEnd = nextH2Match ? faqStart + nextH2Match.index : html.length;
    const faqSection = html.slice(faqStart, faqEnd);

    // Replace Q&A pattern: h3 ending with ? followed by p tags
    const wrappedFaq = faqSection.replace(
      /<h3[^>]*>(.*?\?)<\/h3>([\s\S]*?)(?=<h3|<h2|$)/gi,
      (_, question, answer) => {
        const cleanAnswer = answer.trim();
        if (!cleanAnswer) return _;
        return `<details style="margin:0 0 12px 0; border:1px solid #e5e7eb; border-radius:8px; overflow:hidden;">` +
          `<summary style="padding:14px 20px; font-weight:600; font-size:16px; color:#222; cursor:pointer; background:#f8f9fa; list-style:none;">${question}</summary>` +
          `<div style="padding:14px 20px;">${cleanAnswer}</div></details>`;
      },
    );

    return html.slice(0, faqStart) + wrappedFaq + html.slice(faqEnd);
  }

  /** Extract FAQ Q&A pairs from HTML (h2/h3 headings ending with '?') */
  private extractFaqItems(html: string): Array<{ question: string; answer: string }> {
    const items: Array<{ question: string; answer: string }> = [];
    const regex = /<h[23][^>]*>(.*?)<\/h[23]>([\s\S]*?)(?=<h[23]|$)/gi;
    let match;
    while ((match = regex.exec(html)) !== null && items.length < 8) {
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

  /**
   * Find positions after the last </p> before each <h2> (safe CTA insertion points).
   */
  /**
   * Inject AdSense ad unit placeholders every 2 H2 sections.
   * Only activates when there are 4+ H2 headings to avoid cluttering short posts.
   * Inserts a responsive ad unit div before the H2 heading.
   */
  private injectAdPlacements(html: string): string {
    const h2Regex = /<h2\s/gi;
    const h2Positions: number[] = [];
    let match;
    while ((match = h2Regex.exec(html)) !== null) {
      h2Positions.push(match.index);
    }

    if (h2Positions.length < 4) return html;

    // Insert ad units before every 2nd H2 (positions 2, 4, 6, ...)
    const adHtml =
      `<div class="ab-ad" style="margin:30px 0; padding:20px 0; text-align:center; min-height:90px; border-top:1px solid #eee; border-bottom:1px solid #eee;">` +
      `<ins class="adsbygoogle" style="display:block" data-ad-format="auto" data-full-width-responsive="true"></ins>` +
      `<script>(adsbygoogle = window.adsbygoogle || []).push({});</script>` +
      `</div>`;

    // Collect insertion points (before the H2), work backwards to preserve indices
    const insertPositions: number[] = [];
    for (let i = 1; i < h2Positions.length; i++) {
      if ((i + 1) % 2 === 0) { // After sections 2, 4, 6... (zero-indexed: 1, 3, 5...)
        insertPositions.push(h2Positions[i]);
      }
    }

    // Insert in reverse order
    let result = html;
    for (let i = insertPositions.length - 1; i >= 0; i--) {
      const pos = insertPositions[i];
      // Find the last </p> before this H2 for cleaner insertion
      const preceding = result.slice(0, pos);
      const lastP = preceding.lastIndexOf('</p>');
      const insertAt = lastP !== -1 && pos - lastP < 200 ? lastP + '</p>'.length : pos;
      result = result.slice(0, insertAt) + '\n' + adHtml + '\n' + result.slice(insertAt);
    }

    logger.debug(`Injected ${insertPositions.length} AdSense ad placement(s)`);
    return result;
  }

  private findH2SectionEnds(html: string): number[] {
    const positions: number[] = [];
    const h2Regex = /<h2\b/gi;
    let match;
    while ((match = h2Regex.exec(html)) !== null) {
      // Find the last </p> before this H2
      const beforeH2 = html.slice(0, match.index);
      const lastPEnd = beforeH2.lastIndexOf('</p>');
      if (lastPEnd !== -1) {
        positions.push(lastPEnd + 4);
      }
    }
    return positions;
  }

  /**
   * Remove duplicate internal links — keep the first occurrence of each URL.
   */
  private deduplicateInternalLinks(html: string): string {
    const internalLinkRegex = new RegExp(
      `<a\\s+[^>]*href="(${this.wpUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^"]*)"[^>]*>(.*?)<\\/a>`,
      'gi',
    );
    const seenUrls = new Set<string>();
    return html.replace(internalLinkRegex, (match, url, text) => {
      const normalized = url.replace(/\/+$/, '');
      if (seenUrls.has(normalized)) {
        logger.debug(`Duplicate internal link removed: ${url}`);
        return text; // Keep anchor text, remove link
      }
      seenUrls.add(normalized);
      return match;
    });
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

  /**
   * Detect orphan pages: published posts with zero inbound internal links.
   * Uses pre-fetched content map to avoid duplicate API calls.
   */
  async detectOrphanPages(existingPosts: ExistingPost[]): Promise<ExistingPost[]> {
    if (existingPosts.length < 5) return []; // Too few posts to detect orphans

    // Fetch content for recent posts (limit to avoid API overload)
    const postsToCheck = existingPosts.slice(0, 100);
    const contentMap = new Map<number, string>();
    const urlSet = new Set(postsToCheck.map(p => p.url));

    for (const post of postsToCheck) {
      if (!post.postId) continue;
      try {
        const { data } = await this.api.get(`/posts/${post.postId}`, {
          params: { _fields: 'id,content' },
        });
        contentMap.set(post.postId, (data.content?.rendered || '') as string);
      } catch {
        // Skip posts we can't fetch
      }
    }

    // Count inbound internal links per URL
    const inboundCount = new Map<string, number>();
    for (const url of urlSet) inboundCount.set(url, 0);

    for (const [, content] of contentMap) {
      const linkRegex = /href="(https?:\/\/[^"]+)"/gi;
      let match;
      while ((match = linkRegex.exec(content)) !== null) {
        const linkedUrl = match[1].replace(/\/$/, '');
        for (const url of urlSet) {
          if (url.replace(/\/$/, '') === linkedUrl) {
            inboundCount.set(url, (inboundCount.get(url) || 0) + 1);
          }
        }
      }
    }

    // Report orphans (0 inbound links, excluding the newest 3 posts)
    const orphans = postsToCheck
      .slice(3) // Skip newest 3 (they haven't had time to get links)
      .filter(p => inboundCount.get(p.url) === 0);

    if (orphans.length > 0) {
      logger.warn(`\n=== Orphan Pages: ${orphans.length} post(s) with zero inbound internal links ===`);
      for (const orphan of orphans.slice(0, 10)) {
        logger.warn(`  🔗 "${orphan.title}" → ${orphan.url}`);
      }
      if (orphans.length > 10) {
        logger.warn(`  ... and ${orphans.length - 10} more`);
      }
    } else {
      logger.info('Orphan page check: all posts have inbound internal links');
    }

    // Share content map for link integrity checking
    this._cachedContentMap = contentMap;
    return orphans;
  }

  /**
   * Auto-link orphan pages by inserting "Also read" links into same-category recent posts.
   * Processes up to 3 orphans per batch to avoid excessive API calls.
   */
  async autoLinkOrphans(orphans: ExistingPost[], existingPosts: ExistingPost[]): Promise<number> {
    const MAX_BATCH = 3;
    let linkedCount = 0;

    for (const orphan of orphans.slice(0, MAX_BATCH)) {
      if (!orphan.postId) continue;

      // Find 2 recent same-category posts that are not orphans themselves
      const targets = existingPosts
        .filter(p =>
          p.postId &&
          p.postId !== orphan.postId &&
          p.category.toLowerCase() === orphan.category.toLowerCase() &&
          !orphans.some(o => o.postId === p.postId),
        )
        .slice(0, 2);

      if (targets.length === 0) continue;

      for (const target of targets) {
        if (!target.postId) continue;
        try {
          const { data } = await this.api.get(`/posts/${target.postId}`, {
            params: { _fields: 'id,content' },
          });
          const currentContent = (data.content?.rendered || '') as string;

          // Skip if already links to this orphan
          if (currentContent.includes(orphan.url.replace(/\/$/, ''))) continue;

          const alsoReadHtml = `\n<p style="margin:20px 0; padding:12px 16px; background:#f8f9fa; border-radius:8px; font-size:14px;">` +
            `<strong>Also read:</strong> <a href="${orphan.url}" style="color:#0066FF; text-decoration:none;">${this.escapeHtml(orphan.title)}</a></p>`;

          // Append before the last closing tag or at end
          const updatedContent = currentContent + alsoReadHtml;

          await this.api.post(`/posts/${target.postId}`, {
            content: updatedContent,
          });
          linkedCount++;
          logger.info(`Auto-linked orphan "${orphan.title}" from "${target.title}"`);
        } catch (error) {
          logger.warn(`Failed to auto-link orphan "${orphan.title}": ${error instanceof Error ? error.message : error}`);
        }
      }
    }

    if (linkedCount > 0) {
      logger.info(`Auto-linked ${linkedCount} orphan page connections`);
    }
    return linkedCount;
  }

  /** Cached post content from detectOrphanPages for reuse */
  private _cachedContentMap?: Map<number, string>;

  /**
   * Check internal links for 404s and attempt to fix via slug similarity.
   * Reuses content fetched by detectOrphanPages to avoid duplicate API calls.
   */
  async checkAndFixInternalLinks(existingPosts: ExistingPost[]): Promise<void> {
    const contentMap = this._cachedContentMap;
    if (!contentMap || contentMap.size === 0) return;

    const slugMap = new Map<string, ExistingPost>();
    for (const post of existingPosts) {
      if (post.slug) slugMap.set(post.slug, post);
    }

    let brokenCount = 0;
    let fixedCount = 0;

    for (const [postId, content] of contentMap) {
      const internalLinkRegex = new RegExp(
        `href="(${this.wpUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/[^"]+)"`,
        'gi',
      );
      let match;
      const brokenLinks: Array<{ original: string; replacement?: string }> = [];

      while ((match = internalLinkRegex.exec(content)) !== null) {
        const linkUrl = match[1];
        // Extract slug from URL
        const slug = linkUrl.replace(this.wpUrl, '').replace(/^\/|\/$/g, '');
        if (!slug || slug.includes('?') || slug.startsWith('wp-')) continue;

        // Check if this URL exists in our post list
        const exists = existingPosts.some(p =>
          p.url.replace(/\/$/, '') === linkUrl.replace(/\/$/, ''),
        );
        if (exists) continue;

        // Try to find similar slug (Levenshtein-like matching)
        brokenCount++;
        let bestMatch: ExistingPost | undefined;
        let bestSimilarity = 0;

        for (const [existingSlug, post] of slugMap) {
          const similarity = this.slugSimilarity(slug, existingSlug);
          if (similarity > bestSimilarity && similarity > 0.6) {
            bestSimilarity = similarity;
            bestMatch = post;
          }
        }

        if (bestMatch) {
          brokenLinks.push({ original: linkUrl, replacement: bestMatch.url });
        } else {
          brokenLinks.push({ original: linkUrl });
          logger.warn(`Broken internal link in post ${postId}: ${linkUrl} (no similar slug found)`);
        }
      }

      // Apply fixes
      if (brokenLinks.some(l => l.replacement)) {
        let fixedContent = content;
        for (const link of brokenLinks) {
          if (link.replacement) {
            fixedContent = fixedContent.replace(link.original, link.replacement);
            fixedCount++;
          }
        }

        try {
          await this.api.post(`/posts/${postId}`, { content: fixedContent });
          logger.info(`Fixed ${brokenLinks.filter(l => l.replacement).length} broken link(s) in post ${postId}`);
        } catch (error) {
          logger.warn(`Failed to fix links in post ${postId}: ${error instanceof Error ? error.message : error}`);
        }
      }
    }

    if (brokenCount > 0) {
      logger.info(`Internal link check: ${brokenCount} broken, ${fixedCount} auto-fixed`);
    } else {
      logger.debug('Internal link check: no broken links found');
    }

    // Clear cached content
    this._cachedContentMap = undefined;
  }

  /** Simple word-overlap similarity for slugs (0-1). */
  private slugSimilarity(a: string, b: string): number {
    const wordsA = a.split('-').filter(w => w.length > 2);
    const wordsB = new Set(b.split('-').filter(w => w.length > 2));
    if (wordsA.length === 0 || wordsB.size === 0) return 0;
    const overlap = wordsA.filter(w => wordsB.has(w)).length;
    return overlap / Math.max(wordsA.length, wordsB.size);
  }

  /**
   * Refresh stale posts that contain outdated year references.
   * Lightweight version for main pipeline — updates up to `limit` posts per batch.
   */
  async refreshStalePosts(existingPosts: ExistingPost[], limit: number = 2): Promise<number> {
    const currentYear = new Date().getFullYear();
    const staleYears = Array.from({ length: currentYear - 2024 }, (_, i) => 2024 + i);
    if (staleYears.length === 0) return 0;

    let refreshed = 0;

    for (const post of existingPosts) {
      if (refreshed >= limit) break;
      if (!post.postId) continue;

      const combined = `${post.title} ${post.slug || ''}`;
      const hasStaleYear = staleYears.some(y => combined.includes(String(y)));
      if (!hasStaleYear) continue;

      try {
        // Fetch full post content
        const { data } = await this.api.get(`/posts/${post.postId}`, {
          params: { _fields: 'id,title,slug,content,excerpt,meta' },
        });
        const fullContent = (data.content?.rendered || '') as string;
        const fullExcerpt = (data.excerpt?.rendered || '') as string;
        const titleText = (data.title?.rendered || '') as string;

        const updates: Record<string, unknown> = {};
        const nowIso = new Date().toISOString();
        const dateFormatted = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

        // Replace stale years
        for (const year of staleYears) {
          const yearRegex = new RegExp(`\\b${year}\\b(?![-/]\\d)`, 'g');
          const yearStr = String(currentYear);

          if (yearRegex.test(titleText)) {
            updates.title = titleText.replace(yearRegex, yearStr);
          }
          if (yearRegex.test(fullContent)) {
            let newContent = fullContent.replace(yearRegex, yearStr);
            // Update the "Updated:" date in the article header if present
            newContent = newContent.replace(
              /<span class="ab-updated">Updated: [^<]+<\/span>/,
              `<span class="ab-updated">Updated: ${dateFormatted}</span>`,
            );
            // Inject "Last Updated" banner if not present
            if (!newContent.includes('Last Updated:')) {
              const banner = `<div style="background:#f0f8ff; border-left:4px solid #0066FF; padding:12px 20px; margin:0 0 24px 0; border-radius:0 8px 8px 0; font-size:14px; color:#555;"><strong>Last Updated:</strong> ${dateFormatted} — Updated with the latest information for ${currentYear}.</div>`;
              const headerEnd = newContent.indexOf('border-bottom:1px solid #eee;');
              if (headerEnd !== -1) {
                const closingDiv = newContent.indexOf('</div>', headerEnd);
                if (closingDiv !== -1) {
                  const pos = closingDiv + 6;
                  newContent = newContent.slice(0, pos) + '\n' + banner + '\n' + newContent.slice(pos);
                }
              }
            }
            updates.content = newContent;
          }
          if (yearRegex.test(fullExcerpt)) {
            updates.excerpt = fullExcerpt.replace(yearRegex, yearStr);
          }
        }

        if (Object.keys(updates).length === 0) continue;

        updates.meta = {
          _autoblog_modified_time: nowIso,
          ...(updates.title ? { rank_math_title: updates.title } : {}),
          ...(updates.excerpt ? { rank_math_description: updates.excerpt } : {}),
        };

        await this.api.post(`/posts/${post.postId}`, updates);
        refreshed++;
        logger.info(`Refreshed stale post: "${post.title}" (ID=${post.postId}) — years updated to ${currentYear}`);
      } catch (error) {
        logger.warn(`Failed to refresh post "${post.title}": ${error instanceof Error ? error.message : error}`);
      }
    }

    return refreshed;
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
      const response = await this.api.post('/categories', {
        name,
        description: `Explore in-depth guides, tips, and analysis on ${name}. Updated regularly with trending topics.`,
      });
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
    // Parallelize tag lookup/creation for better performance
    const results = await Promise.allSettled(
      names.map(async (name) => {
        try {
          const search = await this.api.get('/tags', { params: { search: name } });
          const tags = search.data as { id: number; name: string }[];
          const existing = tags.find(
            (t) => this.decodeHtmlEntities(t.name).toLowerCase() === name.toLowerCase(),
          );
          if (existing) return existing.id;
        } catch {
          // continue to create
        }

        try {
          const response = await this.api.post('/tags', { name });
          return response.data.id as number;
        } catch (error) {
          if (axios.isAxiosError(error) && error.response?.status === 400) {
            const termId = error.response.data?.data?.term_id;
            if (termId) return termId as number;
          }
          logger.warn(`Failed to create tag "${name}": ${error instanceof Error ? error.message : error}`);
          return null;
        }
      }),
    );

    return results
      .filter((r): r is PromiseFulfilledResult<number | null> => r.status === 'fulfilled')
      .map((r) => r.value)
      .filter((id): id is number => id !== null);
  }
}
