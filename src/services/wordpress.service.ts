import axios, { type AxiosInstance } from 'axios';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { logger } from '../utils/logger.js';
import { WordPressError } from '../types/errors.js';
import type { BlogContent, PublishedPost, MediaUploadResult, ExistingPost, AuthorProfile } from '../types/index.js';
import { NICHE_AUTHOR_PROFILES, NICHE_DISCLAIMERS, CONTENT_FRESHNESS_MAP } from '../types/index.js';
import type { ContentType } from '../types/index.js';

const POSTS_CACHE_FILE = join(dirname(new URL(import.meta.url).pathname), '../../.cache/posts-cache.json');
const POSTS_CACHE_TTL_MS = 1 * 60 * 60 * 1000; // 1 hour

export class WordPressService {
  private api: AxiosInstance;
  private wpUrl: string;
  private siteOwner: string;
  private authorLinkedin: string;
  private authorTwitter: string;
  private authorWebsite: string;
  private authorCredentials: string;
  private adsensePubId: string;
  private cachedUserId: number | null = null;

  constructor(wpUrl: string, username: string, appPassword: string, siteOwner?: string, authorLinks?: { linkedin?: string; twitter?: string; website?: string; credentials?: string }, adsensePubId?: string) {
    this.wpUrl = wpUrl.replace(/\/+$/, '');
    this.siteOwner = siteOwner || '';
    this.authorLinkedin = authorLinks?.linkedin || '';
    this.authorTwitter = authorLinks?.twitter || '';
    this.authorWebsite = authorLinks?.website || '';
    this.authorCredentials = authorLinks?.credentials || '';
    this.adsensePubId = adsensePubId || '';
    const token = Buffer.from(`${username}:${appPassword}`).toString('base64');
    this.api = axios.create({
      baseURL: `${this.wpUrl}/wp-json/wp/v2`,
      headers: {
        Authorization: `Basic ${token}`,
      },
      timeout: 30000,
    });
  }

  /** Fetch the authenticated user's ID (cached after first call). */
  async getCurrentUserId(): Promise<number> {
    if (this.cachedUserId !== null) return this.cachedUserId;
    try {
      const { data } = await this.api.get('/users/me', { params: { _fields: 'id' } });
      this.cachedUserId = data.id as number;
      return this.cachedUserId;
    } catch (err) {
      logger.warn('Failed to fetch current user ID, author field will be omitted');
      return 0;
    }
  }

  async getRecentPosts(count: number = 50): Promise<ExistingPost[]> {
    // Check local cache first (1-hour TTL)
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

      // Validate Discover eligibility
      const discoverCheck = this.validateDiscoverImage(imageBuffer);
      if (!discoverCheck.valid) {
        logger.warn(`Discover image check: ${discoverCheck.reason}`);
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
        // WordPress's wp_filter_content_tags() auto-adds srcset from attachment metadata
        const srcUrl = inlineImages[i].url;
        const tooltipTitle = `Image ${i + 1}: ${this.escapeHtml(baseCaption.slice(0, 60))}`;
        const titleAttr = `title="${tooltipTitle}"`;
        const figureHtml =
          `<figure style="margin:30px 0; text-align:center;">` +
          `<img src="${srcUrl}" alt="${altText}" ${titleAttr} width="1200" height="675" sizes="(max-width: 768px) 100vw, 760px" loading="${loadingAttr}"${fetchPriority} decoding="async" style="max-width:100%; width:100%; height:auto; border-radius:8px; box-shadow:0 2px 8px rgba(0,0,0,0.1); aspect-ratio:16/9; object-fit:cover;" />` +
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

  /**
   * Validate image meets Google Discover requirements.
   * Discover requires images >= 1200px wide for max-image-preview:large eligibility.
   */
  private validateDiscoverImage(imageBuffer: Buffer): { valid: boolean; reason?: string } {
    // Check file size (minimum 50KB for quality, max 5MB)
    const sizeKB = imageBuffer.length / 1024;
    if (sizeKB < 50) return { valid: false, reason: `Image too small: ${sizeKB.toFixed(0)}KB (min 50KB for Discover)` };
    if (sizeKB > 5120) return { valid: false, reason: `Image too large: ${(sizeKB/1024).toFixed(1)}MB (max 5MB)` };

    // WebP/AVIF header check for minimum dimensions
    // WebP: bytes 24-27 = width (little-endian), 28-31 = height
    if (imageBuffer.length > 30) {
      const isWebP = imageBuffer.toString('ascii', 0, 4) === 'RIFF' && imageBuffer.toString('ascii', 8, 12) === 'WEBP';
      if (isWebP && imageBuffer.toString('ascii', 12, 16) === 'VP8 ') {
        // VP8 lossy format
        const width = imageBuffer.readUInt16LE(26) & 0x3FFF;
        if (width > 0 && width < 1200) {
          return { valid: false, reason: `Image width ${width}px < 1200px minimum for Google Discover` };
        }
      }
    }

    return { valid: true };
  }

  /** Source registry: maps cite data-source keys to verified URLs */
  private static readonly SOURCE_REGISTRY: Record<string, { domain: string; paths: Record<string, string>; label: string }> = {
    // Korean institutions
    bok:    { domain: 'https://www.bok.or.kr', paths: { default: '/eng/', 'monetary-policy': '/eng/monetary/policyDecisions.do', research: '/eng/research/economicReport.do', rates: '/eng/monetary/baseRate.do', statistics: '/eng/statistics/publicationList.do' }, label: 'Bank of Korea' },
    krx:    { domain: 'https://www.krx.co.kr', paths: { default: '/eng/main/', market: '/eng/main/marketdata/', statistics: '/eng/statistics/', listing: '/eng/main/listing/' }, label: 'Korea Exchange' },
    dart:   { domain: 'https://dart.fss.or.kr', paths: { default: '/', filings: '/dsaf001/main.do', reports: '/dsab007/main.do' }, label: 'DART' },
    kosis:  { domain: 'https://kosis.kr', paths: { default: '/eng/', statistics: '/eng/statisticsList/', gdp: '/eng/statisticsList/statisticsList_01.do', trade: '/eng/statisticsList/statisticsList_02.do' }, label: 'KOSIS' },
    fsc:    { domain: 'https://www.fsc.go.kr', paths: { default: '/eng/', policy: '/eng/po/scpolicies/', press: '/eng/pr/pressReleases/', regulations: '/eng/po/regulations/' }, label: 'Financial Services Commission' },
    ftc:    { domain: 'https://www.ftc.go.kr', paths: { default: '/eng/', decisions: '/eng/policyDecisions/', reports: '/eng/annualReports/' }, label: 'Fair Trade Commission' },
    msit:   { domain: 'https://www.msit.go.kr', paths: { default: '/eng/', policy: '/eng/bbs/list.do?sCode=eng&mId=4&mPid=2', press: '/eng/bbs/list.do?sCode=eng&mId=6&mPid=5' }, label: 'Ministry of Science and ICT' },
    kotra:  { domain: 'https://www.kotra.or.kr', paths: { default: '/eng/', invest: '/eng/invest/', reports: '/eng/reports/' }, label: 'KOTRA' },
    kisa:   { domain: 'https://www.kisa.or.kr', paths: { default: '/eng/', reports: '/eng/usefulreport/', cybersecurity: '/eng/cybersecurity/' }, label: 'KISA' },
    kocca:  { domain: 'https://www.kocca.kr', paths: { default: '/en/', reports: '/en/contents/report/', industry: '/en/contents/industry/' }, label: 'KOCCA' },
    // Korean companies
    samsung:  { domain: 'https://www.samsung.com', paths: { default: '/', ir: '/global/ir/', semiconductors: '/semiconductor/', mobile: '/galaxy/', earnings: '/global/ir/financial-information/' }, label: 'Samsung' },
    hyundai:  { domain: 'https://www.hyundai.com', paths: { default: '/', ir: '/worldwide/en/company/ir/', ev: '/worldwide/en/eco/electric/' }, label: 'Hyundai' },
    lg:       { domain: 'https://www.lgcorp.com', paths: { default: '/', ir: '/en/ir/', sustainability: '/en/sustainability/' }, label: 'LG Corporation' },
    skhynix:  { domain: 'https://www.skhynix.com', paths: { default: '/', products: '/products/', ir: '/ir/', hbm: '/products/hbm/' }, label: 'SK Hynix' },
    naver:    { domain: 'https://www.navercorp.com', paths: { default: '/', ir: '/en/ir/', press: '/en/pr/' }, label: 'Naver' },
    kakao:    { domain: 'https://www.kakaocorp.com', paths: { default: '/', ir: '/en/ir/', service: '/en/service/' }, label: 'Kakao' },
    coupang:  { domain: 'https://www.coupang.com', paths: { default: '/', ir: '/ir/' }, label: 'Coupang' },
    // News/Data
    bloomberg: { domain: 'https://www.bloomberg.com', paths: { default: '/', markets: '/markets/', technology: '/technology/', asia: '/asia/', crypto: '/crypto/', economics: '/economics/' }, label: 'Bloomberg' },
    reuters:   { domain: 'https://www.reuters.com', paths: { default: '/', markets: '/markets/', technology: '/technology/', asia: '/world/asia-pacific/', business: '/business/' }, label: 'Reuters' },
    nikkei:    { domain: 'https://asia.nikkei.com', paths: { default: '/', business: '/Business/', economy: '/Economy/', tech: '/Business/Tech/', markets: '/Business/Markets/' }, label: 'Nikkei Asia' },
    statista:  { domain: 'https://www.statista.com', paths: { default: '/', korea: '/topics/5730/south-korea/', ai: '/topics/3104/artificial-intelligence-ai/', semiconductors: '/topics/3617/semiconductor-industry/' }, label: 'Statista' },
    worldbank: { domain: 'https://www.worldbank.org', paths: { default: '/', data: '/en/country/korea/', indicators: '/en/data/', research: '/en/research/' }, label: 'World Bank' },
    // Entertainment
    hybe:              { domain: 'https://www.hybecorp.com', paths: { default: '/', ir: '/eng/ir/', artists: '/eng/artists/', earnings: '/eng/ir/financial/' }, label: 'HYBE' },
    'sm-entertainment': { domain: 'https://www.smentertainment.com', paths: { default: '/', artists: '/artists/', ir: '/ir/' }, label: 'SM Entertainment' },
    jyp:               { domain: 'https://www.jype.com', paths: { default: '/', artists: '/artists/', ir: '/ir/' }, label: 'JYP Entertainment' },
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
    // Korean institutions
    'bok.or.kr', 'krx.co.kr', 'dart.fss.or.kr', 'kosis.kr',
    'fsc.go.kr', 'ftc.go.kr', 'msit.go.kr', 'kotra.or.kr', 'kisa.or.kr', 'kocca.kr',
    'kdi.re.kr', 'kiep.go.kr', 'visitkorea.or.kr',
    // Korean companies
    'samsung.com', 'hyundai.com', 'lgcorp.com', 'skhynix.com',
    'navercorp.com', 'kakaocorp.com', 'coupang.com',
    // Korean media
    'koreaherald.com', 'koreajoongangdaily.joins.com', 'mk.co.kr', 'hankyung.com',
    // Global media & news
    'bloomberg.com', 'reuters.com', 'asia.nikkei.com', 'statista.com', 'worldbank.org',
    'cnbc.com', 'ft.com', 'wsj.com', 'techcrunch.com', 'imf.org', 'mckinsey.com',
    // Entertainment
    'hybecorp.com', 'smentertainment.com', 'jype.com',
    // Niche-specific
    'cosmeticsdesign-asia.com', 'lonelyplanet.com',
    // Social & general
    'twitter.com', 'x.com', 'linkedin.com', 'facebook.com',
    'google.com', 'youtube.com', 'wikipedia.org',
  ]);

  /** Domain-level URL validation cache (72h TTL — domains rarely go offline) */
  private static domainValidationCache = new Map<string, { valid: boolean; timestamp: number }>();
  private static readonly DOMAIN_CACHE_TTL_MS = 72 * 60 * 60 * 1000;

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

        // Strip fabricated deep paths (7+ segments) but allow up to 6 segment paths for E-E-A-T
        // e.g., reuters.com/markets/asia/technology/article-slug/ is OK, deep fabricated paths are trimmed
        const pathSegments = parsed.pathname.split('/').filter(Boolean);
        if (pathSegments.length > 6) {
          // Keep up to 6 segments for specific article/data page links
          const safePath = '/' + pathSegments.slice(0, 6).join('/') + '/';
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

    // Check links with concurrency limit of 5 to avoid overwhelming servers
    const CONCURRENCY = 5;
    const allResults: Array<{ full: string; url: string; text: string; ok: boolean }> = [];
    for (let i = 0; i < remainingLinks.length; i += CONCURRENCY) {
      const batch = remainingLinks.slice(i, i + CONCURRENCY);
      const results = await Promise.allSettled(
        batch.map(async (link) => {
          // Check domain-level cache first
          try {
            const domain = new URL(link.url).hostname.replace(/^www\./, '');
            const cached = WordPressService.domainValidationCache.get(domain);
            if (cached && Date.now() - cached.timestamp < WordPressService.DOMAIN_CACHE_TTL_MS) {
              return { ...link, ok: cached.valid };
            }
          } catch { /* continue to HEAD check */ }

          try {
            await axios.head(link.url, { timeout: 3000, maxRedirects: 3 });
            this.cacheDomainValidation(link.url, true);
            return { ...link, ok: true };
          } catch (headErr) {
            if (axios.isAxiosError(headErr) && !headErr.response) {
              this.cacheDomainValidation(link.url, true);
              return { ...link, ok: true }; // Timeout = likely valid
            }
            try {
              await axios.get(link.url, { timeout: 3000, maxRedirects: 3, headers: { Range: 'bytes=0-0' } });
              this.cacheDomainValidation(link.url, true);
              return { ...link, ok: true };
            } catch (getErr) {
              if (axios.isAxiosError(getErr) && getErr.response && getErr.response.status >= 400) {
                this.cacheDomainValidation(link.url, false);
                return { ...link, ok: false };
              }
              this.cacheDomainValidation(link.url, true);
              return { ...link, ok: true };
            }
          }
        }),
      );
      for (const result of results) {
        if (result.status === 'fulfilled') allResults.push(result.value);
      }
    }

    for (const result of allResults) {
      if (!result.ok) {
        const { full, text, url } = result;
        logger.warn(`Broken external link removed: ${url}`);
        updatedHtml = updatedHtml.replace(full, text);
      }
    }

    return updatedHtml;
  }

  /**
   * Check if a slug already exists and return a unique one.
   */
  /** Cache domain validation result for HEAD check deduplication */
  private cacheDomainValidation(url: string, valid: boolean): void {
    try {
      const domain = new URL(url).hostname.replace(/^www\./, '');
      WordPressService.domainValidationCache.set(domain, { valid, timestamp: Date.now() });
    } catch { /* ignore invalid URLs */ }
  }

  async ensureUniqueSlug(slug: string): Promise<string> {
    try {
      const { data } = await this.api.get('/posts', {
        params: { slug, status: 'publish,draft,pending,future', _fields: 'id,slug' },
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
html{scroll-behavior:smooth;scroll-padding-top:60px}
.entry-content{max-width:760px;margin:0 auto;padding:0 20px;font-family:'Noto Sans KR',sans-serif;color:#333;line-height:1.7;font-size:16px}
.entry-content p{margin:0 0 20px 0;line-height:1.8;color:#333;font-size:16px}
.entry-content h2{border-left:5px solid #0066FF;padding-left:15px;font-size:22px;color:#222;margin:40px 0 20px 0}
.entry-content h3{font-size:18px;color:#444;margin:30px 0 15px 0;padding-bottom:8px;border-bottom:1px solid #eee}
.entry-content a{color:#0066FF;text-decoration:underline}
.entry-content a[target="_blank"]{color:#0066FF;text-decoration:underline}
.entry-content blockquote{border-left:4px solid #0066FF;margin:24px 0;padding:16px 24px;background:#f8f9fa;font-style:italic;color:#555;line-height:1.7}
.entry-content hr{border:none;height:1px;background:linear-gradient(to right,#ddd,#eee,#ddd);margin:36px 0}
.entry-content figure{margin:30px 0;text-align:center}
.entry-content figure img{max-width:100%;width:100%;height:auto;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,0.1);aspect-ratio:16/9;object-fit:cover}
.entry-content figcaption{margin-top:10px;font-size:13px;color:#888;line-height:1.5}
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
.ab-pros-label{margin:0 0 8px 0;font-weight:700;color:#22543d}
.ab-cons-label{margin:0 0 8px 0;font-weight:700;color:#742a2a}
.ab-step h3{margin:0;font-size:18px;color:#222}
.ab-back-top{text-align:center;margin:20px 0 0 0}
.ab-back-top a{font-size:14px;color:#0066FF}
.ab-table-wrap{overflow-x:auto;-webkit-overflow-scrolling:touch;margin:24px 0;position:relative}
.ab-table-wrap::after{content:'';position:absolute;right:0;top:0;bottom:0;width:20px;background:linear-gradient(to left,rgba(255,255,255,0.8),transparent);pointer-events:none}
@media(min-width:769px){.ab-table-wrap::after{display:none}}
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
.ab-author-bio{margin:30px 0;padding:24px;background:#f8f9fa;border-radius:12px;border:1px solid #e5e7eb}
.ab-disclaimer-finance,.ab-disclaimer-beauty{margin:0 0 24px 0;padding:16px 20px;border-radius:8px;font-size:13px;color:#666;line-height:1.6}
.ab-what-changed{margin:0 0 24px 0;padding:16px 20px;background:#f0fff4;border:1px solid #c6f6d5;border-radius:8px;font-size:14px;color:#555;line-height:1.6}
.ab-series-nav{margin:24px 0;padding:16px 20px;background:#f8f9fa;border:1px solid #e5e7eb;border-radius:10px}
.ab-affiliate-disclosure{margin:0 0 20px 0;padding:12px 16px;background:#fff8e1;border:1px solid #ffe082;border-radius:8px;font-size:12px;color:#666;line-height:1.5}
.ab-progress{position:fixed;top:0;left:0;width:0;height:3px;background:linear-gradient(90deg,#0052CC,#0066FF);z-index:99999;transition:width 0.1s linear}
.ab-data-chart{margin:24px 0;text-align:center}
.ab-data-chart svg{max-width:100%;height:auto;border-radius:8px}
.ab-lead-magnet{margin:24px 0;padding:20px 24px;background:linear-gradient(135deg,#f0f4ff,#e8f0fe);border:2px solid #0066FF;border-radius:12px;text-align:center}
.ab-breadcrumb{margin:0 0 16px 0;font-size:13px;color:#888;line-height:1.5}
.ab-breadcrumb a{color:#0066FF;text-decoration:none}
.ab-breadcrumb a:hover{text-decoration:underline}
.ab-breadcrumb span.ab-bc-sep{margin:0 6px;color:#ccc}
.ab-related,.ab-author-bio,.ab-faq,.ab-cta-share{content-visibility:auto;contain-intrinsic-size:auto 300px}
.ab-header{margin:0 0 30px 0;padding-bottom:20px;border-bottom:1px solid #eee}
.ab-header time{font-size:13px;color:#888}
.ab-faq details{margin:0 0 12px 0;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden}
.ab-faq summary{padding:14px 20px;font-weight:600;font-size:16px;color:#222;cursor:pointer;background:#f8f9fa;list-style:none;min-height:44px}
.ab-faq .faq-answer{padding:14px 20px}
@media(min-width:1024px){.ab-toc{position:sticky;top:70px;z-index:10;max-height:80vh;overflow-y:auto}}
@media(max-width:768px){.ab-proscons{grid-template-columns:1fr}.ab-cta-newsletter form{flex-direction:column}.ab-cta-newsletter input[type="email"]{width:100%!important;max-width:100%!important;box-sizing:border-box}.ab-cta-newsletter button{width:100%}}
@media(prefers-color-scheme:dark){
.entry-content{background:#1a1a2e!important;color:#e0e0e0!important}
.entry-content p,.entry-content li,.entry-content td{color:#e0e0e0!important}
.entry-content a{color:#6db8ff!important}
.entry-content h2,.entry-content h3{color:#f0f0f0!important}
.entry-content blockquote{background:#2a2a3e!important;color:#c0c0c0!important}
.ab-toc{background:#2a2a3e!important}
.ab-toc summary{color:#6db8ff!important}
.ab-cta-engagement{background:linear-gradient(135deg,#1a1a3e 0%,#2a2a4e 100%)}
.ab-cta-engagement p{color:#e0e0e0!important}
.ab-cta-share{background:#2a2a3e!important}
.ab-cta-share p{color:#e0e0e0!important}
.ab-related{background:#2a2a3e!important}
.ab-related-card{background:#1a1a2e!important;border-color:#3a3a5e!important}
.ab-related-card p{color:#e0e0e0!important}
.ab-tag{background:#2a2a4e!important;color:#6db8ff!important}
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
.ab-pros-label{color:#68d391!important}
.ab-cons-label{color:#fc8181!important}
.ab-step h3{color:#f0f0f0!important}
.ab-back-top a{color:#6db8ff!important}
.ab-faq details{border-color:#3a3a5e!important}
.ab-faq summary{background:#2a2a3e!important;color:#e0e0e0!important}
.ab-breadcrumb{color:#b0b0b0!important}
.ab-breadcrumb a{color:#6db8ff!important}
.ab-breadcrumb span.ab-bc-sep{color:#777!important}
.ab-header{border-color:#3a3a5e!important}
.ab-disclaimer{border-color:#3a3a5e!important;color:#b0b0b0!important}
.ab-author-bio{background:#2a2a3e!important;border-color:#3a3a5e!important}
.ab-author-bio p{color:#e0e0e0!important}
.ab-disclaimer-finance,.ab-disclaimer-beauty{background:#2a2a1e!important;border-color:#665500!important;color:#d4d4d4!important}
.ab-what-changed{background:#1a2e1a!important;border-color:#2e5e2e!important;color:#d4d4d4!important}
.ab-ai-disclosure{background:#2a2a3e!important;border-color:#3a3a5e!important;color:#b0b0b0!important}
.ab-ai-disclosure a{color:#6db8ff!important}
.ab-comment-prompt{background:#2a2a3e!important;border-color:#4a4aff!important}
.ab-comment-prompt p{color:#e0e0e0!important}
.ab-comment-prompt a{color:#6db8ff!important}
.ab-series-nav{background:#2a2a3e!important;border-color:#3a3a5e!important;color:#e0e0e0!important}
.ab-affiliate-disclosure{background:#2a2a1e!important;border-color:#665500!important;color:#d4d4d4!important}
.ab-ad-slot{background:transparent!important}
div[style*="background:#f0f8ff"]{background:#1a2a3e!important;border-color:#3a4a6e!important;color:#e0e0e0!important}
div[style*="background:#f0fff4"]:not(.ab-pros):not(.ab-what-changed){background:#1a2e1a!important;border-color:#2e5e2e!important;color:#d4d4d4!important}
div[style*="background:#fffbeb"]{background:#2a2a1e!important;border-color:#665500!important;color:#d4d4d4!important}
.entry-content table{border-color:#3a3a5e!important}
.entry-content th{background:#2a2a3e!important;color:#e0e0e0!important}
.entry-content td{border-color:#3a3a5e!important}
.entry-content tr:nth-child(even){background:#222238!important}
.entry-content strong{color:#f0f0f0!important}
div[style*="background:#fff"]{background:#2a2a3e!important;border-color:#3a3a5e!important}
div[style*="background:#f8f9fa"]{background:#2a2a3e!important;border-color:#3a3a5e!important}
.entry-content svg rect[fill="#f0f4ff"]{fill:#2a2a3e}
.entry-content svg text[fill="#666"],.entry-content svg text[fill="#999"]{fill:#b0b0b0}
.entry-content svg text[fill="#0052CC"]{fill:#6db8ff}
.entry-content img{box-shadow:0 2px 8px rgba(0,0,0,0.3)!important}
}
</style>`;
  }

  /**
   * Build visible breadcrumb navigation HTML.
   * Complements the BreadcrumbList JSON-LD with a user-visible nav element.
   */
  private buildBreadcrumbNav(category: string, title: string, subNiche?: string): string {
    const truncatedTitle = title.length > 50 ? title.slice(0, 47) + '...' : title;
    const categorySlug = category.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

    // Enhanced breadcrumb: Home > Category > SubTopic > Post (reflects topic cluster hierarchy)
    let breadcrumb = `<nav class="ab-breadcrumb" aria-label="Breadcrumb"><a href="${this.wpUrl}/">Home</a><span class="ab-bc-sep" aria-hidden="true">›</span><a href="${this.wpUrl}/category/${categorySlug}/">${this.escapeHtml(category)}</a>`;

    if (subNiche) {
      const subNicheLabel = subNiche
        .replace(/-/g, ' ')
        .replace(/\b\w/g, c => c.toUpperCase());
      const subNicheSlug = subNiche.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      breadcrumb += `<span class="ab-bc-sep" aria-hidden="true">›</span><a href="${this.wpUrl}/category/${categorySlug}/?topic=${subNicheSlug}">${this.escapeHtml(subNicheLabel)}</a>`;
    }

    breadcrumb += `<span class="ab-bc-sep" aria-hidden="true">›</span><span aria-current="page">${this.escapeHtml(truncatedTitle)}</span></nav>`;
    return breadcrumb;
  }

  /**
   * Cross-niche relationship map for discovering relevant content across categories.
   * Key = category, Values = related categories that share audience overlap.
   */
  private static readonly CROSS_NICHE_MAP: Record<string, string[]> = {
    'Korean Tech': ['Korean Finance', 'K-Entertainment'],
    'Korean Finance': ['Korean Tech', 'Korea Travel'],
    'K-Beauty': ['Korea Travel', 'K-Entertainment'],
    'Korea Travel': ['K-Beauty', 'K-Entertainment', 'Korean Finance'],
    'K-Entertainment': ['K-Beauty', 'Korea Travel', 'Korean Tech'],
  };

  /**
   * Build Related Posts HTML section as card grid.
   * Shows 3 same-category + 1 cross-niche post for internal link diversity.
   */
  private buildRelatedPostsHtml(
    existingPosts: ExistingPost[],
    currentCategory: string,
    currentTitle: string,
    clusterRelatedPosts?: ExistingPost[],
  ): string {
    let related: ExistingPost[];

    // Prefer cluster-based related posts when available (topic cluster proximity)
    if (clusterRelatedPosts && clusterRelatedPosts.length > 0) {
      related = clusterRelatedPosts.filter(p => p.title !== currentTitle).slice(0, 4);
    } else {
      // Fallback: category-based selection
      const sameCat = existingPosts
        .filter(p =>
          p.category.toLowerCase() === currentCategory.toLowerCase() &&
          p.title !== currentTitle,
        )
        .sort((a, b) => {
          const dateA = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
          const dateB = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
          return dateB - dateA;
        })
        .slice(0, 3);

      const crossNicheCategories = WordPressService.CROSS_NICHE_MAP[currentCategory] || [];
      const crossNichePost = crossNicheCategories.length > 0
        ? existingPosts.find(p =>
            crossNicheCategories.some(c => p.category.toLowerCase() === c.toLowerCase()) &&
            p.title !== currentTitle &&
            !sameCat.some(s => s.url === p.url),
          )
        : undefined;

      related = crossNichePost ? [...sameCat, crossNichePost] : sameCat.slice(0, 4);
    }
    if (related.length === 0) return '';

    const cards = related
      .map(p => {
        const shortTitle = p.title.length > 60 ? p.title.slice(0, 57) + '...' : p.title;
        const categoryLabel = this.escapeHtml(p.category);
        const isCrossNiche = p.category.toLowerCase() !== currentCategory.toLowerCase();
        const badge = isCrossNiche ? '<span style="display:inline-block;padding:1px 6px;background:#e8f5e9;color:#2e7d32;border-radius:4px;font-size:10px;margin-left:4px;">Related</span>' : '';
        const dateStr = p.publishedAt
          ? new Date(p.publishedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
          : '';
        const dateLine = dateStr ? `<p style="margin:6px 0 0 0; font-size:11px; color:#999;">${dateStr}</p>` : '';
        return `<a href="${p.url}" class="ab-related-card">
<p style="margin:0 0 6px 0; font-size:11px; font-weight:600; color:#0066FF; text-transform:uppercase; letter-spacing:0.5px;">${categoryLabel}${badge}</p>
<p style="margin:0; font-size:15px; font-weight:600; color:#222; line-height:1.4;">${this.escapeHtml(shortTitle)}</p>${dateLine}</a>`;
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
    // Build prev/next navigation for series
    const allInSeries = existingPosts
      .filter(p => p.subNiche === subNiche)
      .sort((a, b) => {
        const dateA = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
        const dateB = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
        return dateA - dateB;
      });
    const currentIdx = allInSeries.findIndex(p => p.title === currentTitle);
    const prevPost = currentIdx > 0 ? allInSeries[currentIdx - 1] : null;
    const nextPost = currentIdx >= 0 && currentIdx < allInSeries.length - 1 ? allInSeries[currentIdx + 1] : null;

    let prevNextHtml = '';
    if (prevPost || nextPost) {
      const prevLink = prevPost
        ? `<a href="${prevPost.url}" style="color:#0066FF; text-decoration:none; font-weight:500;">&larr; ${this.escapeHtml(prevPost.title)}</a>`
        : '<span></span>';
      const nextLink = nextPost
        ? `<a href="${nextPost.url}" style="color:#0066FF; text-decoration:none; font-weight:500;">${this.escapeHtml(nextPost.title)} &rarr;</a>`
        : '<span></span>';
      prevNextHtml = `\n<div class="ab-series-nav" style="display:flex; justify-content:space-between; gap:16px; flex-wrap:wrap;">
<div style="flex:1; min-width:0;">${prevLink}</div>
<div style="flex:1; min-width:0; text-align:right;">${nextLink}</div></div>`;
    }

    // Insert series list after first H2 paragraph, prev/next before disclaimer
    let result = html.slice(0, insertPos) + '\n' + block + '\n' + html.slice(insertPos);
    if (prevNextHtml) {
      const disclaimerMatch = result.match(/<p\s+(?:class="ab-disclaimer"|style="margin:40px 0 0 0; padding-top:20px; border-top:1px solid #eee; font-size:13px; color:#999;)/);
      if (disclaimerMatch && disclaimerMatch.index !== undefined) {
        result = result.slice(0, disclaimerMatch.index) + prevNextHtml + '\n' + result.slice(disclaimerMatch.index);
      } else {
        result += prevNextHtml;
      }
    }
    return result;
  }

  /**
   * Build follow/explore CTA section (honest about what's available).
   */
  private buildNewsletterCtaHtml(category: string, newsletterFormUrl?: string): string {
    const safeCategory = this.escapeHtml(category);
    const categorySlug = category.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

    // If newsletter form URL is configured, show email capture form
    if (newsletterFormUrl) {
      const leadMagnet = WordPressService.NICHE_LEAD_MAGNETS[category];
      const leadMagnetHtml = leadMagnet
        ? `<p style="margin:0 0 12px 0; padding:8px 14px; background:rgba(255,255,255,0.15); border-radius:6px; font-size:13px; color:rgba(255,255,255,0.95); line-height:1.5;"><strong>${this.escapeHtml(leadMagnet.title)}</strong> — ${this.escapeHtml(leadMagnet.description)}</p>`
        : '';
      return `<div class="ab-cta ab-cta-newsletter">
<p style="margin:0 0 8px 0; font-size:20px; font-weight:700;">Get ${safeCategory} Insights Weekly</p>
${leadMagnetHtml}<p style="margin:0 0 14px 0; font-size:14px; color:rgba(255,255,255,0.85); line-height:1.5;">Join readers who get our latest Korea analysis delivered to their inbox. No spam, unsubscribe anytime.</p>
<form action="${this.escapeHtml(newsletterFormUrl)}" method="POST" target="_blank" rel="noopener noreferrer" style="display:flex; flex-wrap:wrap; justify-content:center; gap:8px;">
<input type="email" name="email" placeholder="your@email.com" required style="padding:10px 16px; border:none; border-radius:6px; font-size:15px; width:60%; max-width:280px;">
<input type="hidden" name="source" value="${safeCategory}">
<input type="hidden" name="category" value="${safeCategory}">
<input type="hidden" name="content_type" value="inline_cta">
<input type="hidden" name="source_post" value="">
<button type="submit" style="padding:10px 24px; background:#fff; color:#0066FF; border:none; border-radius:6px; font-weight:700; font-size:15px; cursor:pointer;">Subscribe Free</button>
</form>
<p style="margin:8px 0 0 0; font-size:11px; color:rgba(255,255,255,0.5);">We respect your privacy. Unsubscribe at any time.</p></div>`;
    }

    // Fallback: browse category CTA
    return `<div class="ab-cta ab-cta-newsletter">
<p style="margin:0 0 8px 0; font-size:20px; font-weight:700;">Explore More ${safeCategory} Insights</p>
<p style="margin:0 0 16px 0; font-size:14px; color:rgba(255,255,255,0.85); line-height:1.5;">We publish in-depth analysis on Korean trends, markets, and culture every week. Bookmark this site or follow us on social media to stay updated.</p>
<a href="${this.wpUrl}/category/${categorySlug}/" style="display:inline-block; padding:12px 32px; background:#fff; color:#0066FF; font-weight:700; font-size:15px; border-radius:8px; text-decoration:none;">Browse All ${safeCategory} Posts</a>
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
      'K-Beauty': [
        (kw) => `What's your skin type, and has ${kw} worked for you? Drop your mini-review below — it helps other readers!`,
        (kw) => `How does ${kw} fit into your current skincare routine? Share your experience in the comments.`,
        (kw) => `Have you compared ${kw} with Western alternatives? We'd love to hear which you prefer and why.`,
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
<p style="margin:0; font-size:15px; color:#555; line-height:1.6;">${this.escapeHtml(question)}</p>
<p style="margin:8px 0 0 0;"><a href="#respond" style="color:#0066FF; font-weight:600; text-decoration:none;">Leave a comment below &darr;</a></p></div>`;
  }

  /**
   * Build social share CTA section.
   */
  /**
   * Build visible author bio HTML section for E-E-A-T compliance.
   * Displays author credentials, expertise, and social links prominently.
   */
  private buildAuthorBioHtml(category: string, selectedPersona?: AuthorProfile): string {
    const profile = selectedPersona || NICHE_AUTHOR_PROFILES[category];
    if (!profile) return '';

    const authorName = this.siteOwner || profile.name || 'TrendHunt Editorial';
    const expertiseTags = profile.expertise.slice(0, 4)
      .map(e => `<span style="display:inline-block; padding:3px 10px; margin:2px 4px 2px 0; background:#f0f4ff; color:#0066FF; border-radius:12px; font-size:12px;">${this.escapeHtml(e)}</span>`)
      .join('');
    const credentialsList = profile.credentials
      .map(c => `<li style="margin:2px 0; font-size:13px; color:#555;">${this.escapeHtml(c)}</li>`)
      .join('');
    const socialLinks: string[] = [];
    if (this.authorLinkedin) socialLinks.push(`<a href="${this.authorLinkedin}" target="_blank" rel="noopener noreferrer" style="color:#0077B5; text-decoration:none; font-size:13px; font-weight:600;">LinkedIn</a>`);
    if (this.authorTwitter) socialLinks.push(`<a href="${this.authorTwitter}" target="_blank" rel="noopener noreferrer" style="color:#1DA1F2; text-decoration:none; font-size:13px; font-weight:600;">X / Twitter</a>`);
    if (this.authorWebsite) socialLinks.push(`<a href="${this.authorWebsite}" target="_blank" rel="noopener noreferrer" style="color:#0066FF; text-decoration:none; font-size:13px; font-weight:600;">Website</a>`);
    const socialHtml = socialLinks.length > 0
      ? `<p style="margin:8px 0 0 0; font-size:13px; color:#888;">Follow: ${socialLinks.join(' · ')}</p>`
      : '';

    return `<div class="ab-author-bio" style="margin:30px 0; padding:24px; background:#f8f9fa; border-radius:12px; border:1px solid #e5e7eb;">
<div style="display:flex; align-items:flex-start; gap:16px; flex-wrap:wrap;">
<div style="width:64px; height:64px; background:linear-gradient(135deg,#0052CC,#0066FF); border-radius:50%; display:flex; align-items:center; justify-content:center; color:#fff; font-size:24px; font-weight:700; flex-shrink:0;">${authorName.charAt(0).toUpperCase()}</div>
<div style="flex:1; min-width:200px;">
<p style="margin:0 0 2px 0; font-size:17px; font-weight:700; color:#222;">${this.escapeHtml(authorName)}</p>
<p style="margin:0 0 8px 0; font-size:14px; font-weight:600; color:#0066FF;">${this.escapeHtml(profile.title)}</p>
<p style="margin:0 0 10px 0; font-size:14px; color:#555; line-height:1.6;">${this.escapeHtml(profile.bio)}</p>
<div style="margin:0 0 8px 0;">${expertiseTags}</div>
<ul style="margin:0; padding:0 0 0 16px; list-style:disc;">${credentialsList}</ul>
${socialHtml}
</div></div></div>`;
  }

  /**
   * Build niche-specific disclaimer HTML (finance, beauty, etc.).
   */
  private buildNicheDisclaimer(category: string): string {
    return NICHE_DISCLAIMERS[category] || '';
  }

  /**
   * Inject lead magnet callout at approximately 60% of the content.
   * Uses the niche-specific lead magnets from NICHE_LEAD_MAGNETS.
   */
  injectLeadMagnetMention(html: string, category: string): string {
    const leadMagnet = WordPressService.NICHE_LEAD_MAGNETS[category];
    if (!leadMagnet) return html;

    const calloutHtml = `<div class="ab-lead-magnet" style="margin:24px 0; padding:20px 24px; background:linear-gradient(135deg,#f0f4ff,#e8f0fe); border:2px solid #0066FF; border-radius:12px; text-align:center;">
<p style="margin:0 0 8px 0; font-size:18px; font-weight:700; color:#0052CC;">📥 ${this.escapeHtml(leadMagnet.title)}</p>
<p style="margin:0; font-size:14px; color:#555; line-height:1.6;">${this.escapeHtml(leadMagnet.description)}</p></div>`;

    // Insert at approximately 60% of the content (find nearest H2 boundary)
    const h2Positions = this.findH2SectionEnds(html);
    if (h2Positions.length >= 3) {
      const targetIdx = Math.floor(h2Positions.length * 0.6);
      const insertPos = h2Positions[Math.min(targetIdx, h2Positions.length - 1)];
      return html.slice(0, insertPos) + '\n' + calloutHtml + '\n' + html.slice(insertPos);
    }
    return html;
  }

  /**
   * Inject SVG data chart into Finance category posts before the first H2.
   */
  injectDataChart(html: string, chartSvg: string, category: string): string {
    if (!chartSvg || !['Korean Finance', 'Korean Tech'].includes(category)) return html;

    const chartHtml = `<div class="ab-data-chart" style="margin:24px 0; text-align:center;">${chartSvg}</div>`;
    const firstH2 = html.indexOf('<h2');
    if (firstH2 > 0) {
      return html.slice(0, firstH2) + chartHtml + '\n' + html.slice(firstH2);
    }
    return chartHtml + '\n' + html;
  }

  /**
   * Inject an engagement poll widget into post HTML.
   * Uses the poll question generated by Claude or creates a default one.
   */
  injectEngagementPoll(
    html: string,
    pollQuestion?: { question: string; options: string[] },
    keyword?: string,
    category?: string,
  ): string {
    const question = pollQuestion?.question || `What aspect of ${keyword || 'this topic'} interests you most?`;
    const options = pollQuestion?.options || ['Technology & Innovation', 'Investment Opportunities', 'Cultural Impact'];

    const optionsHtml = options.map((opt, i) => {
      const colors = ['#0066FF', '#00CC66', '#FF6B35', '#9B59B6'];
      const color = colors[i % colors.length];
      return `<button type="button" onclick="this.style.background='${color}';this.style.color='#fff';this.parentElement.querySelectorAll('button').forEach(b=>{if(b!==this)b.style.opacity='0.5'});if(typeof gtag==='function'){gtag('event','poll_vote',{event_category:'engagement',event_label:'${this.escapeHtml(opt).replace(/'/g, '')}',value:${i}})}" style="display:block;width:100%;margin:6px 0;padding:12px 16px;border:2px solid ${color};background:#fff;color:${color};border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;text-align:left;transition:all 0.2s;">${this.escapeHtml(opt)}</button>`;
    }).join('\n');

    const pollHtml = `<div style="margin:24px 0; padding:20px 24px; background:linear-gradient(135deg,#f0f4ff,#f8f9fa); border:2px solid #e2e8f0; border-radius:12px;">
<p style="margin:0 0 14px 0; font-size:17px; font-weight:700; color:#222;">Quick Poll</p>
<p style="margin:0 0 12px 0; font-size:15px; color:#555; line-height:1.6;">${this.escapeHtml(question)}</p>
<div>${optionsHtml}</div>
<p style="margin:10px 0 0 0; font-size:12px; color:#999;">Share your choice — results help us create better content for you.</p>
</div>`;

    // Insert before the engagement question CTA or before the disclaimer
    const engagementIdx = html.indexOf('class="ab-cta ab-cta-engagement"');
    if (engagementIdx !== -1) {
      const divStart = html.lastIndexOf('<div', engagementIdx);
      if (divStart !== -1) {
        return html.slice(0, divStart) + pollHtml + '\n' + html.slice(divStart);
      }
    }

    // Fallback: insert before disclaimer
    const disclaimerIdx = html.indexOf('<p class="ab-disclaimer"');
    if (disclaimerIdx !== -1) {
      return html.slice(0, disclaimerIdx) + pollHtml + '\n' + html.slice(disclaimerIdx);
    }

    return html + pollHtml;
  }

  /**
   * Inject a simple interactive calculator for specific categories.
   * Finance: ROI/investment calculator. Beauty: routine time estimator.
   */
  injectInteractiveCalculator(html: string, category: string): string {
    let calcHtml = '';

    if (category === 'Korean Finance') {
      calcHtml = `<div style="margin:24px 0; padding:20px 24px; background:#f8f9fa; border:1px solid #e5e7eb; border-radius:12px;">
<p style="margin:0 0 12px 0; font-size:17px; font-weight:700; color:#222;">Quick ROI Calculator</p>
<div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:12px;">
<div><label style="font-size:13px; color:#666; display:block; margin-bottom:4px;">Investment (USD)</label>
<input type="number" id="ab-calc-invest" value="1000" style="width:100%; padding:8px 12px; border:1px solid #ddd; border-radius:6px; font-size:14px;" oninput="document.getElementById('ab-calc-result').textContent='$'+(this.value*(1+document.getElementById('ab-calc-rate').value/100)).toFixed(2)"></div>
<div><label style="font-size:13px; color:#666; display:block; margin-bottom:4px;">Expected Return (%)</label>
<input type="number" id="ab-calc-rate" value="8" style="width:100%; padding:8px 12px; border:1px solid #ddd; border-radius:6px; font-size:14px;" oninput="document.getElementById('ab-calc-result').textContent='$'+(document.getElementById('ab-calc-invest').value*(1+this.value/100)).toFixed(2)"></div>
</div>
<p style="margin:0; font-size:15px; color:#333;">Projected Value: <strong id="ab-calc-result" style="color:#0066FF; font-size:18px;">$1,080.00</strong></p>
<p style="margin:8px 0 0 0; font-size:11px; color:#999;">For illustration only. Past returns do not guarantee future results.</p>
</div>`;
    } else if (category === 'K-Beauty') {
      calcHtml = `<div style="margin:24px 0; padding:20px 24px; background:#f0fff4; border:1px solid #c6f6d5; border-radius:12px;">
<p style="margin:0 0 12px 0; font-size:17px; font-weight:700; color:#222;">Routine Time Estimator</p>
<div style="margin-bottom:12px;">
<label style="font-size:13px; color:#666; display:block; margin-bottom:4px;">Number of Steps</label>
<input type="range" id="ab-routine-steps" min="3" max="12" value="7" style="width:100%;" oninput="document.getElementById('ab-routine-time').textContent=Math.round(this.value*2.5)+' minutes';document.getElementById('ab-routine-count').textContent=this.value+' steps'">
<div style="display:flex; justify-content:space-between; font-size:12px; color:#888; margin-top:4px;"><span>3 steps</span><span>12 steps</span></div>
</div>
<p style="margin:0; font-size:15px; color:#333;">Your routine: <strong id="ab-routine-count" style="color:#22543d;">7 steps</strong> = <strong id="ab-routine-time" style="color:#22543d;">18 minutes</strong></p>
<p style="margin:8px 0 0 0; font-size:11px; color:#999;">Average time per step: ~2.5 minutes (varies by product).</p>
</div>`;
    }

    if (!calcHtml) return html;

    // Insert at ~70% of content (near end but before conclusion)
    const h2Positions = this.findH2SectionEnds(html);
    if (h2Positions.length >= 3) {
      const targetIdx = Math.floor(h2Positions.length * 0.7);
      const insertPos = h2Positions[Math.min(targetIdx, h2Positions.length - 1)];
      return html.slice(0, insertPos) + '\n' + calcHtml + '\n' + html.slice(insertPos);
    }

    return html;
  }

  /**
   * Build a product comparison table with affiliate links.
   * Generates an HTML table from product data with optional affiliate URLs.
   */
  buildComparisonTable(
    products: Array<{ name: string; category: string }>,
    affiliateMap: Record<string, string>,
  ): string {
    if (products.length === 0) return '';

    const rows = products.map((p, i) => {
      const affiliateUrl = affiliateMap[p.category] || affiliateMap[p.name.toLowerCase()];
      const nameCell = affiliateUrl
        ? `<a href="${this.escapeHtml(affiliateUrl)}" target="_blank" rel="noopener noreferrer sponsored" style="color:#0066FF; text-decoration:underline; font-weight:600;">${this.escapeHtml(p.name)}</a>`
        : `<strong>${this.escapeHtml(p.name)}</strong>`;
      const bgColor = i % 2 === 0 ? '#fff' : '#f8f9fa';
      return `<tr style="background:${bgColor};"><td style="padding:12px 16px; border:1px solid #eee;">${nameCell}</td><td style="padding:12px 16px; border:1px solid #eee;">${this.escapeHtml(p.category)}</td></tr>`;
    }).join('\n');

    return `<div class="ab-table-wrap"><table style="width:100%; border-collapse:collapse; margin:24px 0; font-size:14px;">
<tr style="background:#0066FF; color:#fff;"><th style="padding:12px 16px; text-align:left;">Product</th><th style="padding:12px 16px; text-align:left;">Category</th></tr>
${rows}
</table></div>`;
  }

  /**
   * Auto-detect product mentions in HTML and wrap with affiliate links.
   * Scans for known product names and inserts affiliate URLs contextually.
   */
  /** Built-in product keyword → affiliate URL mappings for auto-matching */
  private static readonly PRODUCT_AFFILIATE_DB: Record<string, { keywords: string[]; defaultUrl: string }> = {
    'Korean Tech': {
      keywords: ['Samsung', 'Galaxy', 'SK Hynix', 'LG', 'Naver', 'Kakao', 'NVIDIA', 'MacBook', 'iPad', 'iPhone'],
      defaultUrl: 'https://www.amazon.com/s?k=korean+tech&tag=trendhunt-20',
    },
    'Korean Finance': {
      keywords: ['ETF', 'brokerage', 'trading platform', 'investing app', 'financial advisor'],
      defaultUrl: 'https://www.amazon.com/s?k=investing+korean+market&tag=trendhunt-20',
    },
    'K-Beauty': {
      keywords: ['COSRX', 'Laneige', 'Innisfree', 'Sulwhasoo', 'Beauty of Joseon', 'Missha', 'Etude', 'SKIN1004', 'Anua', 'Torriden', 'sunscreen', 'serum', 'moisturizer', 'toner', 'cleanser', 'sheet mask'],
      defaultUrl: 'https://www.amazon.com/s?k=korean+skincare&tag=trendhunt-20',
    },
    'Korea Travel': {
      keywords: ['T-money', 'SIM card', 'WiFi egg', 'travel adapter', 'luggage', 'backpack', 'guidebook'],
      defaultUrl: 'https://www.amazon.com/s?k=korea+travel+essentials&tag=trendhunt-20',
    },
    'K-Entertainment': {
      keywords: ['album', 'lightstick', 'photocard', 'BTS', 'BLACKPINK', 'Stray Kids', 'SEVENTEEN', 'aespa', 'NewJeans'],
      defaultUrl: 'https://www.amazon.com/s?k=kpop+merchandise&tag=trendhunt-20',
    },
  };

  injectContextualAffiliateLinks(
    html: string,
    category: string,
    affiliateMap: Record<string, string>,
  ): string {
    // Merge manual affiliate map with auto-product database
    const categoryAffiliateUrl = affiliateMap[category];
    const productDb = WordPressService.PRODUCT_AFFILIATE_DB[category];
    if (!categoryAffiliateUrl && !productDb) return html;

    let injectedCount = 0;
    const maxInjections = 4;
    let result = html;

    // Phase 1: Auto-match known product names from built-in database
    if (productDb) {
      for (const keyword of productDb.keywords) {
        if (injectedCount >= maxInjections) break;
        // Match keyword not already inside an <a> tag, case-insensitive
        const escapedKw = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const pattern = new RegExp(
          `(?<!</?a[^>]*>)\\b(${escapedKw})\\b(?![^<]*</a>)`,
          'i',
        );
        const match = pattern.exec(result);
        if (match) {
          const url = affiliateMap[keyword.toLowerCase()] || categoryAffiliateUrl || productDb.defaultUrl;
          const replacement = `<a href="${this.escapeHtml(url)}" target="_blank" rel="noopener noreferrer sponsored" style="color:#0066FF; text-decoration:underline;">${match[1]}</a>`;
          result = result.slice(0, match.index) + replacement + result.slice(match.index + match[0].length);
          injectedCount++;
        }
      }
    }

    // Phase 2: Generic product-like pattern matching (capitalized names with product suffixes)
    if (injectedCount < maxInjections && categoryAffiliateUrl) {
      const productPattern = /(?<![<a][^>]*>)(?<!\w)((?:[A-Z][a-z]+\s){1,3}(?:Pro|Plus|Max|Ultra|Edition|Series|X|SE|Air)?)(?!\w)(?![^<]*<\/a>)/g;
      result = result.replace(productPattern, (match) => {
        if (injectedCount >= maxInjections) return match;
        injectedCount++;
        return `<a href="${this.escapeHtml(categoryAffiliateUrl)}" target="_blank" rel="noopener noreferrer sponsored" style="color:#0066FF; text-decoration:underline;">${match}</a>`;
      });
    }

    if (injectedCount > 0) {
      logger.debug(`Affiliate links: ${injectedCount} product match(es) injected for ${category}`);
    }
    return result;
  }

  /**
   * Build "Cite This Article" box for link building and credibility.
   * Provides a ready-to-copy citation + embed code for other sites.
   */
  private buildCiteThisArticleHtml(postUrl: string, title: string, category: string): string {
    const escapedTitle = this.escapeHtml(title);
    const year = new Date().getFullYear();
    const siteName = this.siteOwner || 'TrendHunt';
    const citation = `${escapedTitle}. ${siteName}, ${year}. Available at: ${postUrl}`;

    return `<details style="margin:24px 0; border:1px solid #e5e7eb; border-radius:8px; overflow:hidden;">
<summary style="padding:12px 20px; font-weight:600; font-size:14px; color:#555; cursor:pointer; background:#f8f9fa; list-style:none;">Cite This Article</summary>
<div style="padding:16px 20px;">
<p style="margin:0 0 12px 0; font-size:13px; color:#666; line-height:1.6;"><strong>APA:</strong> ${escapedTitle}. (${year}). <em>${siteName}</em>. ${postUrl}</p>
<p style="margin:0 0 12px 0; font-size:13px; color:#666; line-height:1.6;"><strong>Plain text:</strong> ${citation}</p>
<p style="margin:0; font-size:12px; color:#999;">Copy and paste the citation above to reference this article in your work.</p>
</div></details>`;
  }

  /**
   * Build comment engagement CTA to encourage UGC for E-E-A-T "Experience" signals.
   * Includes topic-specific question prompts to drive meaningful discussions.
   */
  private buildCommentEngagementCta(category: string, keyword?: string): string {
    const prompts: Record<string, string[]> = {
      'Korean Tech': ['What Korean tech company do you think will lead AI innovation?', 'Have you used any Korean tech products? Share your experience!', 'What Samsung or SK Hynix news surprised you most recently?'],
      'Korean Finance': ['Are you investing in Korean stocks? What\'s your strategy?', 'What do you think about the Korea Discount — will it close?', 'Share your experience with Korean brokerage accounts!'],
      'K-Beauty': ['What\'s your favorite K-beauty product? Drop your recommendation below!', 'Have you tried a Korean skincare routine? What results did you see?', 'What K-beauty brand should we review next?'],
      'Korea Travel': ['What\'s your favorite spot in Korea? Share your tips!', 'Planning a trip to Korea? Ask your questions below!', 'What surprised you most about visiting Seoul?'],
      'K-Entertainment': ['Who\'s your bias? Drop your K-pop opinions below!', 'What K-drama are you watching right now?', 'Which K-entertainment company do you think has the best strategy?'],
    };
    const categoryPrompts = prompts[category] || ['What are your thoughts on this topic? Share in the comments below!'];
    const prompt = categoryPrompts[Math.floor(Math.random() * categoryPrompts.length)];

    return `<div style="margin:24px 0; padding:20px 24px; background:linear-gradient(135deg,#f0f4ff,#e8f4f8); border:2px solid #bee3f8; border-radius:12px; text-align:center;">
<p style="margin:0 0 8px 0; font-size:18px; font-weight:700; color:#222;">Join the Discussion</p>
<p style="margin:0 0 14px 0; font-size:15px; color:#555; line-height:1.6;">${this.escapeHtml(prompt)}</p>
<a href="#respond" style="display:inline-block; padding:10px 28px; background:#0066FF; color:#fff; text-decoration:none; border-radius:8px; font-weight:600; font-size:14px;">Leave a Comment</a>
<p style="margin:12px 0 0 0; font-size:12px; color:#999;">Your insights help other readers and improve our coverage.</p>
</div>`;
  }

  private buildShareCtaHtml(postUrl: string, title: string): string {
    const encodedUrl = encodeURIComponent(postUrl);
    const encodedTitle = encodeURIComponent(title);
    return `<div class="ab-cta-share">
<p style="margin:0 0 12px 0; font-size:16px; font-weight:700; color:#333;">Found this useful? Share it!</p>
<div>
<a href="https://twitter.com/intent/tweet?url=${encodedUrl}&text=${encodedTitle}" target="_blank" rel="noopener noreferrer" class="ab-share-btn" style="background:#1DA1F2;">X / Twitter</a>
<a href="https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}" target="_blank" rel="noopener noreferrer" class="ab-share-btn" style="background:#0077B5;">LinkedIn</a>
<a href="https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}" target="_blank" rel="noopener noreferrer" class="ab-share-btn" style="background:#4267B2;">Facebook</a>
</div>
<div style="margin:16px 0 0 0; padding:12px 16px; background:#f8f9fa; border-radius:8px; text-align:center;">
<p style="margin:0 0 8px 0; font-size:14px; color:#555;">Was this helpful?</p>
<span class="ab-feedback-btn" onclick="if(typeof gtag==='function'){gtag('event','feedback',{event_category:'engagement',event_label:'helpful',value:1})};this.parentElement.innerHTML='<p style=\\'margin:0;color:#22543d;font-weight:600;\\'>Thanks for your feedback!</p>'" style="display:inline-block;padding:6px 16px;margin:0 4px;border-radius:6px;border:1px solid #c6f6d5;background:#f0fff4;color:#22543d;cursor:pointer;font-size:13px;">👍 Yes</span>
<span class="ab-feedback-btn" onclick="if(typeof gtag==='function'){gtag('event','feedback',{event_category:'engagement',event_label:'not_helpful',value:0})};this.parentElement.innerHTML='<p style=\\'margin:0;color:#555;\\'>Thanks! We\\'ll improve this article.</p>'" style="display:inline-block;padding:6px 16px;margin:0 4px;border-radius:6px;border:1px solid #fed7d7;background:#fff5f5;color:#742a2a;cursor:pointer;font-size:13px;">👎 No</span>
</div>
</div>`;
  }

  /**
   * Build email newsletter subscription CTA with form.
   */
  /** Niche-specific lead magnet descriptions for newsletter CTA */
  private static readonly NICHE_LEAD_MAGNETS: Record<string, { title: string; description: string }> = {
    'Korean Tech': { title: 'Free: Korean Tech Investment Cheat Sheet', description: 'Get our curated list of top Korean tech companies, key metrics, and analyst picks — updated monthly.' },
    'Korean Finance': { title: 'Free: KOSPI Investor Starter Kit', description: 'Download our guide to investing in Korean stocks: brokerage comparison, tax tips, and top ETF picks.' },
    'K-Beauty': { title: 'Free: K-Beauty Routine Builder Guide', description: 'Get our step-by-step skincare routine builder with product recommendations for your skin type.' },
    'Korea Travel': { title: 'Free: Korea Travel Planning Checklist', description: 'Download our comprehensive Korea trip checklist: visa, budget, itinerary templates, and insider tips.' },
    'K-Entertainment': { title: 'Free: K-Pop Industry Map', description: 'Get our visual guide to the K-pop business ecosystem: agencies, revenue streams, and market data.' },
  };

  private buildEmailNewsletterCta(category: string, formUrl: string): string {
    const safeCategory = this.escapeHtml(category);
    const leadMagnet = WordPressService.NICHE_LEAD_MAGNETS[category];
    const leadMagnetHtml = leadMagnet
      ? `<p style="margin:0 0 12px 0; padding:10px 16px; background:rgba(255,255,255,0.15); border-radius:6px; font-size:13px; color:rgba(255,255,255,0.95); line-height:1.5;">🎁 <strong>${this.escapeHtml(leadMagnet.title)}</strong> — ${this.escapeHtml(leadMagnet.description)}</p>`
      : '';

    // GA4 event tracking: gtag conversion event on form submit
    const ga4TrackingScript = `<script>document.querySelector('.ab-newsletter-form')?.addEventListener('submit',function(){if(typeof gtag==='function'){gtag('event','newsletter_signup',{event_category:'engagement',event_label:'${safeCategory}',value:1})}});</script>`;

    return `<div class="ab-newsletter-cta">
<p style="margin:0 0 8px 0; font-size:20px; font-weight:700;">Get ${safeCategory} Insights Weekly</p>
${leadMagnetHtml}<p style="margin:0 0 16px 0; font-size:14px; color:rgba(255,255,255,0.85); line-height:1.5;">Join readers who get our latest Korea analysis delivered to their inbox every week. No spam, unsubscribe anytime.</p>
<form class="ab-newsletter-form" action="${this.escapeHtml(formUrl)}" method="POST" target="_blank" rel="noopener noreferrer" style="display:flex; flex-wrap:wrap; justify-content:center; gap:8px;">
<input type="email" name="email" placeholder="your@email.com" required style="padding:10px 16px; border:none; border-radius:6px; font-size:15px; width:60%; max-width:300px;">
<input type="hidden" name="source" value="${safeCategory}">
<input type="hidden" name="category" value="${safeCategory}">
<input type="hidden" name="content_type" value="newsletter_cta">
<input type="hidden" name="source_post" value="">
<button type="submit" style="padding:10px 24px; background:#fff; color:#0066FF; border:none; border-radius:6px; font-weight:700; font-size:15px; cursor:pointer;">Subscribe Free</button>
</form>
<p style="margin:10px 0 0 0; font-size:11px; color:rgba(255,255,255,0.5);">We respect your privacy. Unsubscribe at any time.</p></div>
${ga4TrackingScript}`;
  }

  /**
   * Category-based default affiliate keywords.
   * These are auto-applied when the content matches a category, providing affiliate
   * opportunities even without manual AFFILIATE_MAP configuration.
   * Placeholder URLs — replace with actual affiliate links in AFFILIATE_MAP env var.
   */
  private static readonly CATEGORY_AFFILIATE_KEYWORDS: Record<string, Record<string, string>> = {
    'K-Beauty': {
      'Olive Young': 'https://global.oliveyoung.com/',
      'YesStyle': 'https://www.yesstyle.com/',
      'StyleKorean': 'https://www.stylekorean.com/',
      'COSRX': 'https://www.cosrx.com/',
      'Innisfree': 'https://www.innisfree.com/',
    },
    'Korea Travel': {
      'Klook': 'https://www.klook.com/',
      'KKday': 'https://www.kkday.com/',
      'Agoda': 'https://www.agoda.com/',
      'T-money': 'https://www.t-money.co.kr/eng/',
      'Airalo': 'https://www.airalo.com/',
    },
    'Korean Food': {
      'Maangchi': 'https://www.maangchi.com/',
      'Korean grocery': '',
      'gochugaru': '',
    },
    'Korean Finance': {
      'Interactive Brokers': 'https://www.interactivebrokers.com/',
      'Webull': 'https://www.webull.com/',
      'Tiger Brokers': 'https://www.tigerbrokers.com/',
    },
    'Korean Tech': {
      'Samsung Galaxy': 'https://www.samsung.com/global/galaxy/',
      'LG OLED': 'https://www.lg.com/us/tvs/oled-tvs/',
    },
    'Korean Language': {
      'Talk To Me In Korean': 'https://talktomeinkorean.com/',
      'LingoDeer': 'https://www.lingodeer.com/',
      'italki': 'https://www.italki.com/',
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
        const replacement = `<a href="${affiliateUrl}" target="_blank" rel="noopener noreferrer sponsored" data-affiliate="true" style="color:#0066FF; text-decoration:underline;">${match[1]}</a>`;
        result = result.slice(0, match.index) + replacement + result.slice(match.index + match[0].length);
        injectedCount++;
        logger.debug(`Affiliate link injected for "${keyword}"`);
      }
    }

    if (injectedCount > 0) {
      logger.info(`Injected ${injectedCount} affiliate link(s)`);
      // Add FTC disclosure at top of content (required when affiliate links are present)
      const disclosure = `<p class="ab-affiliate-disclosure" style="margin:0 0 20px 0; padding:12px 16px; background:#fff8e1; border:1px solid #ffe082; border-radius:8px; font-size:12px; color:#666; line-height:1.5;"><strong>Disclosure:</strong> This article contains affiliate links. If you make a purchase through these links, we may earn a small commission at no extra cost to you. This helps support our content. <a href="/privacy-policy/" style="color:#0066FF;">Learn more</a>.</p>`;
      // Insert after the Last Updated banner or at the very start
      const lastUpdatedEnd = result.indexOf('</div>', result.indexOf('Last Updated:'));
      if (lastUpdatedEnd !== -1) {
        const insertPos = lastUpdatedEnd + '</div>'.length;
        result = result.slice(0, insertPos) + '\n' + disclosure + '\n' + result.slice(insertPos);
      } else {
        result = disclosure + '\n' + result;
      }
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
      selectedPersona?: AuthorProfile;
      isNewPublisher?: boolean;
      clusterRelatedPosts?: ExistingPost[];
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

    // Inject visible breadcrumb navigation with topic cluster hierarchy
    const breadcrumbNav = this.buildBreadcrumbNav(content.category, content.title, options?.subNiche);
    const firstH2Bc = htmlEn.indexOf('<h2');
    if (firstH2Bc > 0) {
      htmlEn = htmlEn.slice(0, firstH2Bc) + breadcrumbNav + '\n' + htmlEn.slice(firstH2Bc);
    } else {
      htmlEn = breadcrumbNav + '\n' + htmlEn;
    }

    // Inject "Last Updated" date banner + reading time at top of content
    const publishDate = options?.scheduledDate
      ? new Date(options.scheduledDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
      : new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    const bannerWordCount = htmlEn.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;
    const bannerImageCount = (htmlEn.match(/<img\s/gi) || []).length;
    // Category-specific WPM: technical/finance content reads slower, casual content reads faster
    const categoryWpm: Record<string, number> = {
      'Korean Tech': 200, 'Korean Finance': 200,
      'K-Beauty': 238, 'K-Entertainment': 250, 'Korea Travel': 250,
    };
    const wpm = categoryWpm[content.category] || 238;
    const readingTimeMin = Math.max(1, Math.ceil(bannerWordCount / wpm + bannerImageCount * 0.2));
    const lastUpdatedBanner = `<div style="background:#f0f8ff; border-left:4px solid #0066FF; padding:12px 20px; margin:0 0 24px 0; border-radius:0 8px 8px 0; font-size:14px; color:#555; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;"><span><span style="display:inline-block; padding:2px 8px; background:#0066FF; color:#fff; border-radius:4px; font-size:11px; font-weight:700; margin-right:8px; vertical-align:middle;">UPDATED</span><strong>Last Updated:</strong> ${publishDate}</span><span style="color:#0066FF; font-weight:600;">${readingTimeMin} min read</span></div>`;
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
    const newsletterCta = this.buildNewsletterCtaHtml(content.category, options?.newsletterFormUrl);

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

    // Inject AI content transparency label (FTC/EU AI Act compliance)
    const aiDisclosure = `<div class="ab-ai-disclosure" style="margin:0 0 16px 0; padding:10px 16px; background:#f8f9fa; border:1px solid #e5e7eb; border-radius:8px; font-size:11px; color:#888; line-height:1.5;"><strong>Transparency:</strong> This article was created with AI assistance and editorially reviewed. Sources include Korean-language primary data. <a href="/disclaimer/" style="color:#0066FF;">Learn more</a>.</div>`;
    // Insert after the Last Updated banner, or at the beginning of the post as fallback
    const lastUpdatedIdx = htmlEn.indexOf('Last Updated:');
    if (lastUpdatedIdx !== -1) {
      const aiDisclosureInsertIdx = htmlEn.indexOf('</div>', lastUpdatedIdx);
      if (aiDisclosureInsertIdx !== -1) {
        const aiInsertPos = aiDisclosureInsertIdx + '</div>'.length;
        htmlEn = htmlEn.slice(0, aiInsertPos) + '\n' + aiDisclosure + '\n' + htmlEn.slice(aiInsertPos);
      }
    } else {
      // Fallback: insert at the very beginning of the post content
      htmlEn = aiDisclosure + '\n' + htmlEn;
    }

    // Inject AdSense manual ad placements (niche-aware density: RPM tier drives max ads and word gap)
    htmlEn = this.injectAdPlacements(htmlEn, content.category, options?.isNewPublisher);

    // Inject end-of-article comment engagement prompt
    const commentPromptHtml = `<div class="ab-comment-prompt" style="margin:32px 0; padding:20px 24px; background:#f8f9fa; border-left:4px solid #0066FF; border-radius:0 8px 8px 0;">
<p style="margin:0 0 8px 0; font-size:17px; font-weight:700; color:#222;">💬 Your Turn</p>
<p style="margin:0; font-size:14px; color:#555; line-height:1.6;">What's your take on this? Share your experience or questions in the comments — we read and respond to every one.</p>
<p style="margin:8px 0 0 0;"><a href="#respond" style="color:#0066FF; font-weight:600; text-decoration:none; font-size:14px;">Jump to comments &darr;</a></p></div>`;
    // Insert before Related Posts or Disclaimer
    const commentInsertIdx = htmlEn.indexOf('class="ab-related-posts"') !== -1
      ? htmlEn.lastIndexOf('<', htmlEn.indexOf('class="ab-related-posts"'))
      : htmlEn.lastIndexOf('class="ab-disclaimer"') !== -1
        ? htmlEn.lastIndexOf('<', htmlEn.indexOf('class="ab-disclaimer"'))
        : -1;
    if (commentInsertIdx > 0) {
      htmlEn = htmlEn.slice(0, commentInsertIdx) + commentPromptHtml + '\n' + htmlEn.slice(commentInsertIdx);
    } else {
      htmlEn += '\n' + commentPromptHtml;
    }

    // Inject Related Posts section
    if (options?.existingPosts && options.existingPosts.length > 0) {
      const relatedHtml = this.buildRelatedPostsHtml(options.existingPosts, content.category, content.title, options.clusterRelatedPosts);
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

    // Inject inline internal links (anchor text in body paragraphs)
    if (options?.existingPosts && options.existingPosts.length > 0) {
      htmlEn = this.injectInlineInternalLinks(htmlEn, options.existingPosts, content.title);
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

    // Inject visible author bio for E-E-A-T (before disclaimer section)
    const authorBio = this.buildAuthorBioHtml(content.category, options?.selectedPersona);
    if (authorBio) {
      const disclaimerPos = htmlEn.match(/<p\s+(?:class="ab-disclaimer"|style="margin:40px 0 0 0; padding-top:20px; border-top:1px solid #eee; font-size:13px; color:#999;)/);
      if (disclaimerPos && disclaimerPos.index !== undefined) {
        htmlEn = htmlEn.slice(0, disclaimerPos.index) + authorBio + '\n' + htmlEn.slice(disclaimerPos.index);
      } else {
        htmlEn += '\n' + authorBio;
      }
    }

    // Inject niche-specific disclaimer (finance, beauty, etc.) after Last Updated banner
    const nicheDisclaimer = this.buildNicheDisclaimer(content.category);
    if (nicheDisclaimer) {
      const lastUpdatedEnd = htmlEn.indexOf('</div>', htmlEn.indexOf('Last Updated:'));
      if (lastUpdatedEnd !== -1) {
        const insertPos = lastUpdatedEnd + '</div>'.length;
        htmlEn = htmlEn.slice(0, insertPos) + '\n' + nicheDisclaimer + '\n' + htmlEn.slice(insertPos);
      } else {
        // Fallback: insert at top
        htmlEn = nicheDisclaimer + '\n' + htmlEn;
      }
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
      ...(this.siteOwner ? (() => {
        const authorProfile = NICHE_AUTHOR_PROFILES[content.category];
        const sameAsLinks = [this.authorLinkedin, this.authorTwitter, this.authorWebsite].filter(Boolean);
        return {
          author: {
            '@type': 'Person',
            name: this.siteOwner,
            url: `${this.wpUrl}/about/`,
            jobTitle: authorProfile?.title || 'Korea Market & Trends Analyst',
            description: authorProfile?.bio || 'Korea Market & Trends Analyst covering Korean tech, entertainment, and financial markets for a global audience.',
            knowsAbout: authorProfile?.expertise || ['Korean technology', 'K-pop industry', 'Korean stock market', 'KOSPI', 'South Korean economy'],
            ...(sameAsLinks.length > 0 ? { sameAs: sameAsLinks } : {}),
            ...(this.authorCredentials ? { hasCredential: { '@type': 'EducationalOccupationalCredential', credentialCategory: this.authorCredentials } } : {}),
          },
          about: content.tags.slice(0, 3).map(tag => ({
            '@type': 'Thing',
            name: tag,
          })),
        };
      })() : {}),
      publisher: {
        '@type': 'Organization',
        name: this.siteOwner || 'TrendHunt',
        url: this.wpUrl,
        ...(options?.featuredImageUrl ? { logo: { '@type': 'ImageObject', url: options.featuredImageUrl } } : {}),
      },
      mainEntityOfPage: { '@type': 'WebPage', '@id': content.slug ? `${this.wpUrl}/${content.slug}/` : this.wpUrl },
      // InteractionCounter for social proof signals (updated by GA4 data in refresh cycles)
      interactionStatistic: [
        {
          '@type': 'InteractionCounter',
          interactionType: { '@type': 'ReadAction' },
          userInteractionCount: 0, // Updated post-publish via refresh service
        },
      ],
      speakable: {
        '@type': 'SpeakableSpecification',
        cssSelector: ['.entry-content > p:first-of-type', '.entry-content h2'],
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

    // ItemList schema (listicle, best-x-for-y content types)
    if (options?.contentType === 'listicle' || options?.contentType === 'best-x-for-y') {
      const listItems = this.extractListItems(htmlEn);
      if (listItems.length >= 3) {
        jsonLdSchemas.push({
          '@context': 'https://schema.org',
          '@type': 'ItemList',
          name: content.title,
          description: validatedExcerpt,
          numberOfItems: listItems.length,
          itemListElement: listItems.map((item, idx) => ({
            '@type': 'ListItem',
            position: idx + 1,
            name: item.name,
            ...(item.url ? { url: item.url } : {}),
          })),
        });
        logger.debug(`ItemList schema: ${listItems.length} items prepared`);
      }
    }

    // Review schema (product-review content type)
    if (options?.contentType === 'product-review') {
      const reviewData = this.extractReviewData(htmlEn, content.title);
      if (reviewData) {
        jsonLdSchemas.push({
          '@context': 'https://schema.org',
          '@type': 'Review',
          name: content.title,
          description: validatedExcerpt,
          author: {
            '@type': 'Person',
            name: this.siteOwner || 'TrendHunt',
          },
          itemReviewed: {
            '@type': 'Product',
            name: reviewData.productName,
            ...(reviewData.brand ? { brand: { '@type': 'Brand', name: reviewData.brand } } : {}),
          },
          ...(reviewData.rating ? {
            reviewRating: {
              '@type': 'Rating',
              ratingValue: reviewData.rating,
              bestRating: 10,
              worstRating: 1,
            },
          } : {}),
          datePublished: nowIso,
        });
        logger.debug(`Review schema prepared for "${reviewData.productName}"`);
      }
    }

    // Pros/Cons structured data for x-vs-y content (enhances comparison rich snippets)
    if (options?.contentType === 'x-vs-y' || options?.contentType === 'product-review') {
      const prosConsData = this.extractProsConsData(htmlEn);
      if (prosConsData && (prosConsData.pros.length > 0 || prosConsData.cons.length > 0)) {
        // Add positiveNotes/negativeNotes to existing Review schema or create standalone
        const existingReviewIdx = jsonLdSchemas.findIndex((s: any) => s['@type'] === 'Review');
        if (existingReviewIdx >= 0) {
          const reviewSchema = jsonLdSchemas[existingReviewIdx] as Record<string, unknown>;
          if (prosConsData.pros.length > 0) {
            reviewSchema.positiveNotes = {
              '@type': 'ItemList',
              itemListElement: prosConsData.pros.map((p, i) => ({
                '@type': 'ListItem', position: i + 1, name: p,
              })),
            };
          }
          if (prosConsData.cons.length > 0) {
            reviewSchema.negativeNotes = {
              '@type': 'ItemList',
              itemListElement: prosConsData.cons.map((c, i) => ({
                '@type': 'ListItem', position: i + 1, name: c,
              })),
            };
          }
        }
        logger.debug(`Pros/Cons schema: ${prosConsData.pros.length} pros, ${prosConsData.cons.length} cons`);
      }
    }

    // NewsArticle schema (news-explainer content type — enables Google News rich results)
    if (options?.contentType === 'news-explainer') {
      jsonLdSchemas.push({
        '@context': 'https://schema.org',
        '@type': 'NewsArticle',
        headline: content.title,
        description: validatedExcerpt,
        datePublished: nowIso,
        dateModified: nowIso,
        articleSection: content.category,
        inLanguage: 'en',
        ...(options?.featuredImageUrl ? {
          image: {
            '@type': 'ImageObject',
            url: options.featuredImageUrl,
            width: 1200,
            height: 675,
          },
        } : {}),
        ...(this.siteOwner ? {
          author: { '@type': 'Person', name: this.siteOwner, url: `${this.wpUrl}/about/` },
        } : {}),
        publisher: {
          '@type': 'Organization',
          name: this.siteOwner || 'TrendHunt',
          url: this.wpUrl,
        },
      });
      logger.debug('NewsArticle schema prepared for news-explainer content');
    }

    // VideoObject schema (auto-detected from YouTube embeds in content)
    const ytEmbeds = [...htmlEn.matchAll(/<iframe[^>]*src="https?:\/\/(?:www\.)?youtube\.com\/embed\/([^"?]+)[^"]*"[^>]*>/gi)];
    for (const ytMatch of ytEmbeds.slice(0, 3)) {
      const videoId = ytMatch[1];
      jsonLdSchemas.push({
        '@context': 'https://schema.org',
        '@type': 'VideoObject',
        name: content.title,
        description: validatedExcerpt,
        thumbnailUrl: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
        uploadDate: nowIso,
        embedUrl: `https://www.youtube.com/embed/${videoId}`,
        contentUrl: `https://www.youtube.com/watch?v=${videoId}`,
      });
    }
    if (ytEmbeds.length > 0) {
      logger.debug(`VideoObject schema: ${Math.min(ytEmbeds.length, 3)} YouTube embed(s) detected`);
    }

    // Product schema for best-x-for-y and product-review content (rich results for product searches)
    if (options?.contentType === 'best-x-for-y' || options?.contentType === 'product-review') {
      const productItems = this.extractProductItems(htmlEn);
      if (productItems.length >= 2) {
        jsonLdSchemas.push({
          '@context': 'https://schema.org',
          '@type': 'ItemList',
          name: content.title,
          description: validatedExcerpt,
          numberOfItems: productItems.length,
          itemListElement: productItems.map((item, idx) => ({
            '@type': 'ListItem',
            position: idx + 1,
            item: {
              '@type': 'Product',
              name: item.name,
              description: item.description,
              ...(item.brand ? { brand: { '@type': 'Brand', name: item.brand } } : {}),
              ...(item.rating ? {
                aggregateRating: {
                  '@type': 'AggregateRating',
                  ratingValue: item.rating,
                  bestRating: 10,
                  ratingCount: 1,
                },
              } : {}),
              ...(item.price ? {
                offers: {
                  '@type': 'AggregateOffer',
                  priceCurrency: 'USD',
                  lowPrice: item.price,
                  availability: 'https://schema.org/InStock',
                },
              } : {}),
            },
          })),
        });
        logger.debug(`Product schema: ${productItems.length} products prepared for rich results (${content.category})`);
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
    // ImageObject schemas for inline images (Google Image Search ranking for all images)
    if (inlineImages && inlineImages.length > 0) {
      for (const img of inlineImages) {
        jsonLdSchemas.push({
          '@context': 'https://schema.org',
          '@type': 'ImageObject',
          contentUrl: img.url,
          url: img.url,
          name: img.caption,
          width: 1200,
          height: 675,
          encodingFormat: img.url.endsWith('.avif') ? 'image/avif' : 'image/webp',
        });
      }
    }

    // BreadcrumbList schema with topic cluster hierarchy
    const breadcrumbItems = [
      { '@type': 'ListItem', position: 1, name: 'Home', item: this.wpUrl },
      { '@type': 'ListItem', position: 2, name: content.category, item: `${this.wpUrl}/category/${content.category.toLowerCase().replace(/\s+/g, '-')}/` },
    ];
    if (options?.subNiche) {
      const subLabel = options.subNiche.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      breadcrumbItems.push({
        '@type': 'ListItem', position: 3, name: subLabel,
        item: `${this.wpUrl}/category/${content.category.toLowerCase().replace(/\s+/g, '-')}/?topic=${options.subNiche}`,
      });
      breadcrumbItems.push({
        '@type': 'ListItem', position: 4, name: content.title,
        item: content.slug ? `${this.wpUrl}/${content.slug}/` : this.wpUrl,
      });
    } else {
      breadcrumbItems.push({
        '@type': 'ListItem', position: 3, name: content.title,
        item: content.slug ? `${this.wpUrl}/${content.slug}/` : this.wpUrl,
      });
    }
    jsonLdSchemas.push({
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: breadcrumbItems,
    });

    // Validate JSON-LD before storing
    const jsonLdValidation = this.validateJsonLdSchemas(jsonLdSchemas);
    if (!jsonLdValidation.valid) {
      logger.warn(`JSON-LD has ${jsonLdValidation.errors.length} validation issue(s) — publishing anyway with warnings`);
    }

    // JSON-LD stored in post meta and output via wp_head (not in post body)
    const jsonLdString = JSON.stringify(jsonLdSchemas);

    const categoryId = await this.getOrCreateCategory(content.category);
    const tagIds = await this.getOrCreateTags(content.tags);

    logger.info(`Creating post: "${content.title}"`);

    // Fetch authenticated user ID for correct author attribution
    const authorId = await this.getCurrentUserId();

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
          comment_status: 'open',
          ...(authorId ? { author: authorId } : {}),
          featured_media: featuredImageId ?? 0,
          meta: {
            rank_math_description: content.ctrMetaDescription || content.metaDescription || validatedExcerpt,
            rank_math_focus_keyword: options?.keyword || '',
            rank_math_title: content.title,
            rank_math_canonical_url: content.slug ? `${this.wpUrl}/${content.slug}/` : '',
            rank_math_facebook_title: content.ogTitle || content.title,
            rank_math_facebook_description: content.metaDescription || validatedExcerpt,
            rank_math_facebook_image: options?.ogImageUrl || options?.featuredImageUrl || '',
            rank_math_twitter_title: content.title,
            rank_math_twitter_description: content.metaDescription || validatedExcerpt,
            rank_math_twitter_image: options?.ogImageUrl || options?.featuredImageUrl || '',
            rank_math_twitter_use_facebook_data: '1',
            rank_math_twitter_card_type: 'summary_large_image',
            rank_math_og_type: 'article',
            // Google Discover optimization: max-image-preview + max-snippet for rich cards
            rank_math_advanced_robots: JSON.stringify({
              'max-snippet': '-1',
              'max-image-preview': 'large',
              'max-video-preview': '-1',
            }),
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

        // Set _autoblog_* custom meta separately (may fail if register_post_meta snippet not installed)
        try {
          const autoblogMeta: Record<string, string> = {
            _autoblog_jsonld: jsonLdString,
            _autoblog_published_time: nowIso,
            _autoblog_modified_time: nowIso,
            _autoblog_freshness_class: options?.contentType
              ? (CONTENT_FRESHNESS_MAP[options.contentType as ContentType] || 'seasonal')
              : 'seasonal',
            ...(options?.titleCandidates?.length ? {
              _autoblog_title_candidates: JSON.stringify(options.titleCandidates),
              _autoblog_title_test_start: nowIso,
            } : {}),
            ...(options?.subNiche ? { _autoblog_cluster_id: options.subNiche } : {}),
          };
          await this.api.post(`/posts/${post.postId}`, { meta: autoblogMeta });
        } catch (metaErr) {
          logger.warn(`Failed to set _autoblog meta for post ${post.postId} (non-fatal): ${metaErr instanceof Error ? metaErr.message : metaErr}`);
        }

        // Social meta verification
        const socialMeta = {
          ogType: 'article',
          ogTitle: content.title,
          ogImage: options?.ogImageUrl || options?.featuredImageUrl || 'none',
          twitterCard: 'summary_large_image',
        };
        logger.debug(`Social meta: OG type=${socialMeta.ogType}, title="${socialMeta.ogTitle.slice(0, 40)}...", image=${socialMeta.ogImage ? 'set' : 'missing'}, twitter=${socialMeta.twitterCard}`);

        // Post-publish updates: JSON-LD URLs, share CTA, cite box, canonical fix
        try {
          // Inject share CTA + Cite This Article (with actual post URL) before tags section
          const shareCta = this.buildShareCtaHtml(post.url, content.title);
          const citeBox = this.buildCiteThisArticleHtml(post.url, content.title, content.category);
          const commentCta = this.buildCommentEngagementCta(content.category, options?.keyword);
          let updatedHtml = html.replace(
            /(<div style="margin:30px 0 0 0; padding-top:20px; border-top:1px solid #eee;"><p style="[^"]*font-weight:600[^"]*">Tags<\/p>)/,
            commentCta + '\n' + shareCta + '\n' + citeBox + '\n$1',
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
          // Fix canonical URL with actual URL — strip UTM/ref params for clean canonical
          const cleanCanonical = post.url.split('?')[0].split('#')[0];
          if (cleanCanonical !== `${this.wpUrl}/${content.slug}/`) {
            postMeta.rank_math_canonical_url = cleanCanonical;
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
   * Update social proof signals (InteractionCounter) in JSON-LD with real GA4 pageview data.
   * Call periodically (e.g., weekly) to keep reader count signals fresh.
   */
  async updateSocialProofSignals(
    postPerformance: Array<{ postId: number; pageviews: number; shares?: number }>,
  ): Promise<number> {
    let updated = 0;
    for (const { postId, pageviews, shares } of postPerformance.slice(0, 50)) {
      if (pageviews < 10) continue; // Only show social proof for posts with meaningful traffic
      try {
        const { data } = await this.api.get(`/posts/${postId}`, {
          params: { _fields: 'id,meta,comment_count' },
        });
        const commentCount = typeof (data as Record<string, unknown>).comment_count === 'number'
          ? (data as Record<string, unknown>).comment_count as number : 0;
        const existingJsonLd = (data.meta as Record<string, string>)?._autoblog_jsonld;
        if (!existingJsonLd) continue;

        const jsonLdArr = JSON.parse(existingJsonLd);
        if (!Array.isArray(jsonLdArr)) continue;

        let changed = false;
        for (const schema of jsonLdArr) {
          if (schema.interactionStatistic && Array.isArray(schema.interactionStatistic)) {
            for (const stat of schema.interactionStatistic) {
              if (stat.interactionType?.['@type'] === 'ReadAction') {
                stat.userInteractionCount = pageviews;
                changed = true;
              }
            }
            // Add/update CommentAction counter from WP comment count
            if (commentCount > 0) {
              const commentStat = schema.interactionStatistic.find(
                (s: Record<string, unknown>) => (s.interactionType as Record<string, string>)?.['@type'] === 'CommentAction',
              );
              if (commentStat) {
                commentStat.userInteractionCount = commentCount;
              } else {
                schema.interactionStatistic.push({
                  '@type': 'InteractionCounter',
                  interactionType: { '@type': 'CommentAction' },
                  userInteractionCount: commentCount,
                });
              }
              changed = true;
            }
            // Add/update ShareAction counter if share data available
            if (shares && shares > 0) {
              const shareStat = schema.interactionStatistic.find(
                (s: Record<string, unknown>) => (s.interactionType as Record<string, string>)?.['@type'] === 'ShareAction',
              );
              if (shareStat) {
                shareStat.userInteractionCount = shares;
              } else {
                schema.interactionStatistic.push({
                  '@type': 'InteractionCounter',
                  interactionType: { '@type': 'ShareAction' },
                  userInteractionCount: shares,
                });
              }
              changed = true;
            }
          }
        }

        if (changed) {
          await this.api.post(`/posts/${postId}`, {
            meta: { _autoblog_jsonld: JSON.stringify(jsonLdArr) },
          });
          updated++;
        }
      } catch {
        // Non-fatal, skip
      }
    }
    if (updated > 0) {
      logger.info(`Social proof: Updated InteractionCounter for ${updated} post(s) with GA4 pageview + comment/share data`);
    }
    return updated;
  }

  /**
   * Revert a published post to draft status (rollback for quality issues).
   * Used when post-publish quality checks fail.
   */
  async revertToDraft(postId: number, reason: string): Promise<boolean> {
    try {
      await this.api.post(`/posts/${postId}`, { status: 'draft' });
      logger.warn(`Post ${postId} reverted to draft: ${reason}`);
      return true;
    } catch (error) {
      logger.error(`Failed to revert post ${postId}: ${error instanceof Error ? error.message : error}`);
      return false;
    }
  }

  /**
   * Delete a post (permanent removal for critically low quality).
   */
  async deletePost(postId: number, reason: string): Promise<boolean> {
    try {
      await this.api.delete(`/posts/${postId}`, { params: { force: false } });
      logger.warn(`Post ${postId} trashed: ${reason}`);
      return true;
    } catch (error) {
      logger.error(`Failed to trash post ${postId}: ${error instanceof Error ? error.message : error}`);
      return false;
    }
  }

  /**
   * Fetch posts that have a specific meta key with a non-empty value.
   * Used for deferred social posting and syndication scheduling.
   */
  async getPostsByMeta(metaKey: string, limit: number = 10): Promise<Array<{ postId: number; url: string; title: string; meta: Record<string, string> }>> {
    try {
      const { data } = await this.api.get('/posts', {
        params: {
          per_page: limit,
          status: 'publish',
          meta_key: metaKey,
          _fields: 'id,link,title,meta',
        },
      });
      const posts = data as Array<{ id: number; link: string; title: { rendered: string }; meta?: Record<string, string> }>;
      return posts
        .filter(p => p.meta?.[metaKey] && p.meta[metaKey] !== '')
        .map(p => ({
          postId: p.id,
          url: p.link,
          title: p.title.rendered,
          meta: p.meta || {},
        }));
    } catch (error) {
      logger.debug(`getPostsByMeta(${metaKey}) failed: ${error instanceof Error ? error.message : error}`);
      return [];
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
          `<summary style="padding:14px 20px; font-weight:600; font-size:16px; color:#222; cursor:pointer; background:#f8f9fa; list-style:none; min-height:44px;">${question}</summary>` +
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

  /** Extract list items from HTML for ItemList schema (numbered items in H2/H3 headings) */
  private extractListItems(html: string): Array<{ name: string; url?: string }> {
    const items: Array<{ name: string; url?: string }> = [];
    // Match numbered headings: "1. Item Name", "#1 Item Name", "1) Item Name"
    const regex = /<h[23][^>]*>(?:\d+[.):\s]+|#\d+[:\s]+)(.*?)<\/h[23]>/gi;
    let match;
    while ((match = regex.exec(html)) !== null && items.length < 20) {
      const name = match[1].replace(/<[^>]+>/g, '').trim();
      if (name.length > 3) {
        // Check if there's a link in the heading
        const linkMatch = /<a\s+[^>]*href="([^"]+)"[^>]*>/i.exec(match[0]);
        items.push({ name, url: linkMatch?.[1] });
      }
    }
    // Fallback: try H2/H3 headings without numbers (for headings that are list items)
    if (items.length < 3) {
      items.length = 0;
      const h2Regex = /<h2[^>]*>(.*?)<\/h2>/gi;
      while ((match = h2Regex.exec(html)) !== null && items.length < 20) {
        const name = match[1].replace(/<[^>]+>/g, '').trim();
        // Skip structural headings
        if (/FAQ|Table of Contents|Key Takeaways|Conclusion|Global Context/i.test(name)) continue;
        if (name.length > 5) items.push({ name });
      }
    }
    return items;
  }

  /** Extract review data from HTML for Review schema */
  private extractReviewData(html: string, title: string): { productName: string; brand?: string; rating?: number } | null {
    // Try to extract product name from title (e.g., "Samsung Galaxy S26 Review" → "Samsung Galaxy S26")
    const reviewMatch = title.match(/^(.+?)(?:\s+Review|\s+Analysis|\s+vs\.?\s)/i);
    const productName = reviewMatch ? reviewMatch[1].trim() : title.replace(/\s*(?:Review|Comparison|Analysis).*$/i, '').trim();
    if (!productName || productName.length < 3) return null;

    // Extract brand from known Korean brands
    const brands = ['Samsung', 'Hyundai', 'LG', 'SK', 'Kia', 'Naver', 'Kakao', 'Coupang', 'HYBE', 'Amorepacific', 'Innisfree', 'COSRX', 'Sulwhasoo', 'Laneige'];
    const brand = brands.find(b => productName.toLowerCase().includes(b.toLowerCase()));

    // Extract rating if present (e.g., "8/10", "Rating: 4.5/5")
    const ratingMatch = html.match(/(?:rating|score)[^<]*?(\d+(?:\.\d+)?)\s*(?:\/\s*(\d+))?/i);
    let rating: number | undefined;
    if (ratingMatch) {
      const value = parseFloat(ratingMatch[1]);
      const max = ratingMatch[2] ? parseFloat(ratingMatch[2]) : 10;
      rating = max === 5 ? value * 2 : max === 100 ? value / 10 : value; // Normalize to /10
      if (rating > 10 || rating < 1) rating = undefined;
    }

    return { productName, brand, rating };
  }

  /**
   * Extract pros/cons from HTML content for x-vs-y and product-review types.
   * Returns structured pros and cons for enhanced rich snippets.
   */
  private extractProsConsData(html: string): { pros: string[]; cons: string[] } | null {
    const pros: string[] = [];
    const cons: string[] = [];

    // Match ab-pros and ab-cons sections
    const prosMatch = html.match(/<div[^>]*class="ab-pros"[^>]*>([\s\S]*?)<\/div>/i);
    const consMatch = html.match(/<div[^>]*class="ab-cons"[^>]*>([\s\S]*?)<\/div>/i);

    if (prosMatch) {
      const liMatches = prosMatch[1].matchAll(/<li[^>]*>(.*?)<\/li>/gi);
      for (const m of liMatches) pros.push(m[1].replace(/<[^>]+>/g, '').trim());
    }
    if (consMatch) {
      const liMatches = consMatch[1].matchAll(/<li[^>]*>(.*?)<\/li>/gi);
      for (const m of liMatches) cons.push(m[1].replace(/<[^>]+>/g, '').trim());
    }

    // Fallback: look for heading-based pros/cons
    if (pros.length === 0) {
      const prosHeading = html.match(/(?:Pros|Advantages|Benefits|Strengths)[^<]*<\/h[23]>([\s\S]*?)(?=<h[23]|$)/i);
      if (prosHeading) {
        const items = prosHeading[1].matchAll(/<li[^>]*>(.*?)<\/li>/gi);
        for (const m of items) pros.push(m[1].replace(/<[^>]+>/g, '').trim());
      }
    }
    if (cons.length === 0) {
      const consHeading = html.match(/(?:Cons|Disadvantages|Drawbacks|Weaknesses)[^<]*<\/h[23]>([\s\S]*?)(?=<h[23]|$)/i);
      if (consHeading) {
        const items = consHeading[1].matchAll(/<li[^>]*>(.*?)<\/li>/gi);
        for (const m of items) cons.push(m[1].replace(/<[^>]+>/g, '').trim());
      }
    }

    return (pros.length > 0 || cons.length > 0) ? { pros, cons } : null;
  }

  /**
   * Extract product items from K-Beauty content for Product schema.
   * Looks for product mentions in H2/H3 headings with associated details.
   */
  private extractProductItems(html: string): Array<{
    name: string;
    description: string;
    brand?: string;
    rating?: number;
    price?: string;
  }> {
    const products: Array<{ name: string; description: string; brand?: string; rating?: number; price?: string }> = [];
    // Match numbered headings that likely contain product names
    const regex = /<h[23][^>]*>(?:\d+[.):\s]+|#\d+[:\s]+)?(.*?)<\/h[23]>([\s\S]*?)(?=<h[23]|$)/gi;
    const knownBrands = [
      // K-Beauty
      'COSRX', 'Innisfree', 'Sulwhasoo', 'Laneige', 'Amorepacific', 'Etude', 'Missha',
      'Klairs', 'Some By Mi', 'Banila Co', 'Tony Moly', 'Heimish', "I'm From", 'Anua',
      'Beauty of Joseon', 'SKIN1004', 'Purito', 'Benton', 'Pyunkang Yul', 'Needly',
      'Mediheal', 'Dr. Jart', 'Mamonde', 'Hera', 'The Face Shop', 'Nature Republic',
      // Korean Tech
      'Samsung', 'LG', 'SK Hynix', 'Naver', 'Kakao', 'Hyundai', 'Coupang',
      // Korean Finance
      'Interactive Brokers', 'Webull', 'Tiger Brokers', 'Kiwoom', 'Mirae Asset',
      // Korea Travel
      'Klook', 'KKday', 'Agoda', 'Korean Air', 'Asiana',
      // K-Entertainment
      'HYBE', 'SM Entertainment', 'JYP', 'YG Entertainment',
    ];
    let match;
    while ((match = regex.exec(html)) !== null && products.length < 15) {
      const name = match[1].replace(/<[^>]+>/g, '').trim();
      const section = match[2];
      // Skip structural headings
      if (/FAQ|Table of Contents|Key Takeaways|Conclusion|How We|Bottom Line/i.test(name)) continue;
      if (name.length < 4 || name.length > 100) continue;

      // Extract first paragraph as description
      const paraMatch = /<p[^>]*>([\s\S]*?)<\/p>/i.exec(section);
      const description = paraMatch
        ? paraMatch[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200)
        : '';
      if (description.length < 10) continue;

      // Detect brand
      const brand = knownBrands.find(b => name.toLowerCase().includes(b.toLowerCase()));

      // Extract rating (e.g., "8.5/10", "4.5/5", "Overall: 9/10")
      const ratingMatch = section.match(/(?:rating|score|overall)[^<]*?(\d+(?:\.\d+)?)\s*(?:\/\s*(\d+))?/i);
      let rating: number | undefined;
      if (ratingMatch) {
        const value = parseFloat(ratingMatch[1]);
        const max = ratingMatch[2] ? parseFloat(ratingMatch[2]) : 10;
        rating = max === 5 ? value * 2 : value;
        if (rating > 10 || rating < 1) rating = undefined;
      }

      // Extract price (e.g., "$15", "₩18,000", "$12-25")
      const priceMatch = section.match(/\$(\d+(?:\.\d{2})?)/);
      const price = priceMatch ? priceMatch[1] : undefined;

      products.push({ name, description, brand, rating, price });
    }
    return products;
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
  /**
   * Strategic AdSense ad placement for maximum RPM without hurting UX.
   *
   * Placement strategy (based on AdSense best practices):
   * 1. After TOC (above-the-fold for returning visitors)
   * 2. After every 2nd H2 section (mid-content, high viewability)
   * 3. Before conclusion/FAQ (engaged readers = higher CTR)
   *
   * Rules:
   * - Minimum 300 words between ad units (avoid ad-stacking penalty)
   * - Never inside tables, blockquotes, or code blocks
   * - Maximum 4 in-content ad units per post (AdSense policy)
   * - New publishers (< threshold): max 3 ads for conservative density
   * - Responsive format only (auto-sizing for mobile)
   */
  private injectAdPlacements(html: string, category?: string, isNewPublisher?: boolean): string {
    const h2Regex = /<h2\s/gi;
    const h2Positions: number[] = [];
    let match;
    while ((match = h2Regex.exec(html)) !== null) {
      h2Positions.push(match.index);
    }

    if (h2Positions.length < 3) return html;

    // Derive RPM tier from category for niche-specific ad density
    const RPM_CONFIG: Record<string, { maxAds: number; minWordGap: number }> = {
      'high': { maxAds: 5, minWordGap: 200 },
      'medium': { maxAds: 4, minWordGap: 250 },
      'low': { maxAds: 3, minWordGap: 300 },
    };
    const categoryToRpm: Record<string, string> = {
      'Korean Tech': 'high', 'Korean Finance': 'high',
      'K-Beauty': 'medium', 'K-Entertainment': 'medium',
      'Korea Travel': 'low',
    };
    const rpmTier = (category ? categoryToRpm[category] : undefined) || 'medium';
    let { maxAds, minWordGap } = RPM_CONFIG[rpmTier];

    // New publishers: cap at 3 ads for conservative density (AdSense approval safety)
    if (isNewPublisher && maxAds > 3) {
      maxAds = 3;
    }

    // Long posts (>3000 words): reduce gap by 20% for better ad density
    const totalWords = html.replace(/<[^>]+>/g, '').split(/\s+/).length;
    if (totalWords > 3000) {
      minWordGap = Math.round(minWordGap * 0.8);
    }

    // Ad unit HTML — uses responsive auto format with publisher ID
    // If ADSENSE_PUB_ID is not set, ads render as placeholders (Auto Ads will still work via header script)
    const pubAttr = this.adsensePubId ? ` data-ad-client="${this.adsensePubId}"` : '';
    const adUnit = (slot: string, format: string = 'auto') =>
      `<div class="ab-ad" style="margin:32px 0; padding:16px 0; text-align:center; min-height:90px; clear:both;">` +
      `<ins class="adsbygoogle" style="display:block"${pubAttr} data-ad-slot="${slot}" data-ad-format="${format}" data-full-width-responsive="true"></ins>` +
      `<script>(adsbygoogle = window.adsbygoogle || []).push({});</script>` +
      `</div>`;

    // 1. Identify strategic insertion points
    const insertPoints: Array<{ pos: number; type: string; format: string }> = [];

    // After TOC (if exists) — highest viewability position
    const tocEnd = html.indexOf('</details>');
    if (tocEnd !== -1) {
      const afterToc = tocEnd + '</details>'.length;
      // Skip if a cluster nav or other element is right after
      const nextContent = html.slice(afterToc, afterToc + 100);
      if (!nextContent.includes('ab-ad')) {
        insertPoints.push({ pos: afterToc, type: 'after-toc', format: 'auto' });
      }
    }

    // Between H2 sections — every 2nd section
    let midContentAds = 0;
    const maxMidAds = maxAds - (insertPoints.length > 0 ? 1 : 0);
    for (let i = 1; i < h2Positions.length && midContentAds < maxMidAds; i++) {
      if ((i + 1) % 2 === 0) { // After sections 2, 4, 6
        const lastAdPos = insertPoints.length > 0 ? insertPoints[insertPoints.length - 1].pos : 0;
        const textBetween = html.slice(lastAdPos, h2Positions[i]).replace(/<[^>]+>/g, '');
        const wordsBetween = textBetween.split(/\s+/).length;
        if (wordsBetween >= minWordGap) {
          // Use in-feed format for listicle content in high RPM niches
          const isListicle = /<ol|<ul/.test(html.slice(h2Positions[i - 1] || 0, h2Positions[i]));
          const format = (rpmTier === 'high' && isListicle) ? 'fluid' : 'auto';
          insertPoints.push({ pos: h2Positions[i], type: `mid-h2-${i}`, format });
          midContentAds++;
        }
      }
    }

    // Before first H2 — high viewability above-the-fold for returning visitors
    if (h2Positions.length > 0 && insertPoints.length < maxAds) {
      const firstH2Pos = h2Positions[0];
      const textBefore = html.slice(0, firstH2Pos).replace(/<[^>]+>/g, '');
      const wordsBefore = textBefore.split(/\s+/).length;
      // Only if there's enough intro text (at least 100 words before first H2)
      if (wordsBefore >= 100) {
        const lastAdPos = insertPoints.length > 0 ? insertPoints[insertPoints.length - 1].pos : 0;
        if (firstH2Pos - lastAdPos > 200) {
          insertPoints.push({ pos: firstH2Pos, type: 'before-first-h2', format: 'auto' });
        }
      }
    }

    // Pre-FAQ ad slot — high viewability position (readers scrolling through content)
    const faqHeadingMatch = /<h[23][^>]*>[^<]*(?:FAQ|Frequently Asked)[^<]*<\/h[23]>/i.exec(html);
    if (faqHeadingMatch && insertPoints.length < maxAds) {
      const lastAdPos = insertPoints.length > 0 ? insertPoints[insertPoints.length - 1].pos : 0;
      const textBetween = html.slice(lastAdPos, faqHeadingMatch.index).replace(/<[^>]+>/g, '');
      const wordsBetween = textBetween.split(/\s+/).length;
      if (wordsBetween >= minWordGap) {
        insertPoints.push({ pos: faqHeadingMatch.index, type: 'pre-faq', format: 'auto' });
      }
    }

    // After conclusion — catches engaged readers who read the full article
    const conclusionMatch = /<h2[^>]*>[^<]*(?:Conclusion|Final Thoughts|Takeaway|Summary|Bottom Line|Key Takeaways)[^<]*<\/h2>/i.exec(html);
    if (conclusionMatch && insertPoints.length < maxAds) {
      // Find end of conclusion section (next H2 or end of content)
      const conclusionStart = conclusionMatch.index + conclusionMatch[0].length;
      const nextH2After = html.indexOf('<h2', conclusionStart);
      const conclusionEnd = nextH2After !== -1 ? nextH2After : html.length;
      const lastAdPos = insertPoints.length > 0 ? insertPoints[insertPoints.length - 1].pos : 0;
      const textBetween = html.slice(lastAdPos, conclusionEnd).replace(/<[^>]+>/g, '');
      if (textBetween.split(/\s+/).length >= minWordGap) {
        insertPoints.push({ pos: conclusionEnd, type: 'after-conclusion', format: 'auto' });
      }
    }

    // Sidebar sticky ad placeholder (rendered via CSS sticky positioning)
    // Only for long-form content (>2500 words) in high-RPM niches
    if (totalWords > 2500 && rpmTier === 'high' && insertPoints.length < maxAds + 1) {
      // Insert sidebar ad anchor near the middle of content
      const midPos = h2Positions[Math.floor(h2Positions.length / 2)] || 0;
      if (midPos > 0) {
        insertPoints.push({ pos: midPos, type: 'sidebar-sticky', format: 'vertical' });
      }
    }

    const finalInserts = insertPoints.slice(0, maxAds);

    // Insert in reverse order to preserve positions
    let result = html;
    for (let i = finalInserts.length - 1; i >= 0; i--) {
      const { pos, type, format } = finalInserts[i];
      // Find clean insertion point (after </p> or </details>)
      const preceding = result.slice(0, pos);
      const lastP = preceding.lastIndexOf('</p>');
      const lastDetails = preceding.lastIndexOf('</details>');
      const bestEnd = Math.max(lastP !== -1 ? lastP + '</p>'.length : 0, lastDetails !== -1 ? lastDetails + '</details>'.length : 0);
      const insertAt = bestEnd > 0 && pos - bestEnd < 200 ? bestEnd : pos;
      result = result.slice(0, insertAt) + '\n' + adUnit(type, format) + '\n' + result.slice(insertAt);
    }

    logger.debug(`Injected ${finalInserts.length} AdSense ad placement(s) [${rpmTier} RPM, ${minWordGap}w gap]: ${finalInserts.map(p => `${p.type}(${p.format})`).join(', ')}`);
    return result;
  }

  /**
   * Calculate optimal ad positions based on content structure.
   * Uses heading distribution and word count per section for balanced placement.
   */
  private calculateAdPositions(html: string, maxAds: number = 4): number[] {
    const h2Matches = [...html.matchAll(/<h2[^>]*>/gi)];
    if (h2Matches.length < 2) return []; // Not enough sections for ads

    const positions: number[] = [];
    const totalLength = html.length;

    // First ad: after TOC (approximately 15-20% of content)
    const tocEndNav = html.indexOf('</nav>');
    const tocEndDiv = html.indexOf('ab-toc') !== -1 ? html.indexOf('</div>', html.indexOf('ab-toc')) : -1;
    const tocEnd = tocEndNav > 0 ? tocEndNav : tocEndDiv;
    if (tocEnd > 0) {
      positions.push(tocEnd + 6);
    }

    // Distribute remaining ads evenly between H2 sections (min 250 words between ads)
    const sectionStarts = h2Matches.map(m => m.index!);
    const targetGap = Math.max(2, Math.floor(sectionStarts.length / (maxAds - 1)));

    for (let i = targetGap; i < sectionStarts.length && positions.length < maxAds; i += targetGap) {
      const pos = sectionStarts[i];
      // Verify minimum word distance from last ad
      const lastAdPos = positions[positions.length - 1] || 0;
      const textBetween = html.slice(lastAdPos, pos).replace(/<[^>]+>/g, ' ');
      const wordCount = textBetween.split(/\s+/).filter(Boolean).length;
      if (wordCount >= 250) {
        positions.push(pos);
      }
    }

    return positions;
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
   * Inject inline internal links by matching existing post keywords/titles in body text.
   * Finds keyword mentions in <p> tags and converts first occurrence to anchor links.
   * Max 5 inline links per post (3 same-category + 2 cross-niche for topical authority).
   */
  private injectInlineInternalLinks(html: string, existingPosts: ExistingPost[], currentTitle: string): string {
    if (existingPosts.length === 0) return html;

    // Anchor text type distribution to avoid over-optimization:
    // exact-match (keyword): ~10%, phrase-match (title phrase): ~20%, generic: ~20%, branded (full title): ~50%
    const GENERIC_ANCHORS = ['read more about this', 'learn more here', 'explore this topic', 'see our guide', 'check out this analysis'];

    // Build linkable terms with anchor text type diversity
    const linkCandidates: Array<{ term: string; url: string; priority: number; anchorType: 'exact' | 'phrase' | 'generic' | 'branded' }> = [];
    for (const post of existingPosts) {
      if (post.title === currentTitle) continue;
      // Exact match: use keyword directly (~10% of anchors)
      if (post.keyword && post.keyword.length >= 8 && post.keyword.length <= 60) {
        linkCandidates.push({ term: post.keyword, url: post.url, priority: 3, anchorType: 'exact' });
      }
      // Phrase match: extract 3-4 word phrases from title (~20%)
      const titleWords = post.title.replace(/[^\w\s]/g, '').split(/\s+/).filter(w => w.length > 3);
      if (titleWords.length >= 3) {
        const phrase = titleWords.slice(0, 4).join(' ');
        if (phrase.length >= 10) {
          linkCandidates.push({ term: phrase, url: post.url, priority: 2, anchorType: 'phrase' });
        }
      }
      // Branded: use full title as anchor text (~50%)
      if (post.title.length >= 15 && post.title.length <= 80) {
        linkCandidates.push({ term: post.title, url: post.url, priority: 1, anchorType: 'branded' });
      }
    }

    // Sort by priority (exact > phrase > branded), then by term length (longer = more specific)
    linkCandidates.sort((a, b) => b.priority - a.priority || b.term.length - a.term.length);

    let result = html;
    let injected = 0;
    const linkedUrls = new Set<string>();
    // Track anchor type counts for distribution enforcement
    const anchorTypeCounts: Record<string, number> = { exact: 0, phrase: 0, generic: 0, branded: 0 };
    // Target distribution per 5 links: exact=1, phrase=1, generic=1, branded=2
    const anchorTypeMax: Record<string, number> = { exact: 1, phrase: 1, generic: 1, branded: 2 };

    for (const candidate of linkCandidates) {
      if (injected >= 5) break;
      if (linkedUrls.has(candidate.url)) continue;
      // Enforce anchor type distribution
      if (anchorTypeCounts[candidate.anchorType] >= anchorTypeMax[candidate.anchorType]) continue;

      // Only match within <p> tag content (not in headings, links, or HTML attributes)
      const termEscaped = candidate.term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pattern = new RegExp(
        `(<p[^>]*>(?:(?!<\/p>).)*?)\\b(${termEscaped})\\b((?:(?!<\/p>).)*?<\/p>)`,
        'is',
      );

      const match = pattern.exec(result);
      if (!match) continue;

      // Skip if the match is already inside an <a> tag
      const beforeMatch = match[1];
      const lastOpenA = beforeMatch.lastIndexOf('<a ');
      const lastCloseA = beforeMatch.lastIndexOf('</a>');
      if (lastOpenA > lastCloseA) continue; // Inside an unclosed <a> tag

      const link = `<a href="${candidate.url}" style="color:#0066FF; text-decoration:underline;">${match[2]}</a>`;
      result = result.slice(0, match.index) +
        match[1] + link + match[3] +
        result.slice(match.index + match[0].length);

      linkedUrls.add(candidate.url);
      anchorTypeCounts[candidate.anchorType]++;
      injected++;
      logger.debug(`Inline internal link injected [${candidate.anchorType}]: "${candidate.term}" → ${candidate.url}`);
    }

    // Fill remaining slots with generic anchor text links (natural link profile)
    if (injected < 5 && anchorTypeCounts.generic < anchorTypeMax.generic) {
      for (const post of existingPosts) {
        if (injected >= 5) break;
        if (linkedUrls.has(post.url) || post.title === currentTitle) continue;

        // Find any sentence mentioning a keyword fragment from this post
        const kwFragment = (post.keyword || post.title).split(/\s+/).find(w => w.length > 5);
        if (!kwFragment) continue;
        const fragEscaped = kwFragment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const sentencePattern = new RegExp(
          `(<p[^>]*>(?:(?!<\/p>).)*?)(${fragEscaped}[^<.]*\\.)((?:(?!<\/p>).)*?<\/p>)`,
          'is',
        );
        const sMatch = sentencePattern.exec(result);
        if (!sMatch) continue;
        const beforeS = sMatch[1];
        const lastOpenAS = beforeS.lastIndexOf('<a ');
        const lastCloseAS = beforeS.lastIndexOf('</a>');
        if (lastOpenAS > lastCloseAS) continue;

        const genericText = GENERIC_ANCHORS[injected % GENERIC_ANCHORS.length];
        const genericLink = ` <a href="${post.url}" style="color:#0066FF; text-decoration:underline;">${genericText}</a>`;
        // Insert generic link after the sentence
        const sentenceEnd = sMatch.index + sMatch[1].length + sMatch[2].length;
        result = result.slice(0, sentenceEnd) + genericLink + result.slice(sentenceEnd);

        linkedUrls.add(post.url);
        anchorTypeCounts.generic++;
        injected++;
        logger.debug(`Inline internal link injected [generic]: "${genericText}" → ${post.url}`);
      }
    }

    if (injected > 0) {
      logger.info(`Injected ${injected} inline internal link(s) in body text`);
    }
    return result;
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

  /**
   * Validate JSON-LD schemas before publishing.
   * Checks required fields per schema type to prevent rich snippet errors.
   */
  private validateJsonLdSchemas(schemas: object[]): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    const REQUIRED_FIELDS: Record<string, string[]> = {
      'BlogPosting': ['headline', 'datePublished', 'author'],
      'FAQPage': ['mainEntity'],
      'HowTo': ['name', 'step'],
      'ItemList': ['name', 'itemListElement'],
      'Review': ['name', 'itemReviewed', 'author'],
      'NewsArticle': ['headline', 'datePublished'],
      'VideoObject': ['name', 'thumbnailUrl', 'uploadDate'],
      'BreadcrumbList': ['itemListElement'],
      'ImageObject': ['contentUrl'],
      'Product': ['name'],
    };

    for (const schema of schemas) {
      const s = schema as Record<string, unknown>;
      const type = (s['@type'] as string) || 'Unknown';
      const required = REQUIRED_FIELDS[type];
      if (!required) continue;

      for (const field of required) {
        if (!s[field] && s[field] !== 0) {
          errors.push(`${type}: missing required field "${field}"`);
        }
      }

      // Type-specific validations
      if (type === 'BlogPosting' || type === 'NewsArticle') {
        const headline = s['headline'] as string;
        if (headline && headline.length > 110) {
          errors.push(`${type}: headline exceeds 110 chars (${headline.length})`);
        }
        if (s['datePublished'] && !/^\d{4}-\d{2}-\d{2}/.test(s['datePublished'] as string)) {
          errors.push(`${type}: datePublished not in ISO format`);
        }
      }

      if (type === 'FAQPage') {
        const mainEntity = s['mainEntity'] as unknown[];
        if (Array.isArray(mainEntity) && mainEntity.length < 2) {
          errors.push(`FAQPage: requires at least 2 questions (found ${mainEntity.length})`);
        }
      }

      if (type === 'Review') {
        const rating = (s['reviewRating'] as Record<string, unknown>)?.['ratingValue'];
        if (rating !== undefined && (typeof rating !== 'number' || rating < 1 || rating > 10)) {
          errors.push(`Review: ratingValue must be 1-10 (got ${rating})`);
        }
      }
    }

    if (errors.length > 0) {
      for (const err of errors) {
        logger.warn(`JSON-LD validation: ${err}`);
      }
    }

    return { valid: errors.length === 0, errors };
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
  /** Track used anchor texts to avoid repetition across orphan linking */
  private usedAnchorTexts = new Map<string, Set<string>>();

  /**
   * Generate diverse anchor text variants for a post.
   * Rotates selection based on target postId hash to avoid repetition.
   */
  private generateAnchorVariants(post: ExistingPost): string[] {
    const title = post.title;
    const keyword = post.keyword || '';
    const category = post.category;
    const titleWords = title.split(/\s+/);

    const variants: string[] = [
      title, // Full title
      keyword || title, // Primary keyword
      `${category}: ${titleWords.slice(0, 4).join(' ')}`, // Category + partial title
      titleWords.slice(0, Math.ceil(titleWords.length / 2)).join(' '), // Partial title (first half)
    ];

    return variants.filter(Boolean);
  }

  /**
   * Select an anchor text variant for a target post, avoiding repetition.
   */
  private selectAnchorText(orphan: ExistingPost, targetPostId: number): string {
    const variants = this.generateAnchorVariants(orphan);
    const usedForTarget = this.usedAnchorTexts.get(String(targetPostId)) || new Set<string>();

    // Rotate selection based on target postId hash
    let hash = 0;
    const key = `${orphan.postId || 0}:${targetPostId}`;
    for (let i = 0; i < key.length; i++) {
      hash = ((hash << 5) - hash + key.charCodeAt(i)) | 0;
    }

    // Try to find an unused variant
    const startIdx = Math.abs(hash) % variants.length;
    for (let i = 0; i < variants.length; i++) {
      const idx = (startIdx + i) % variants.length;
      if (!usedForTarget.has(variants[idx])) {
        usedForTarget.add(variants[idx]);
        this.usedAnchorTexts.set(String(targetPostId), usedForTarget);
        return variants[idx];
      }
    }

    return variants[startIdx]; // Fallback to hash-based selection
  }

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

          // Use diversified anchor text
          const anchorText = this.selectAnchorText(orphan, target.postId);

          const alsoReadHtml = `\n<p style="margin:20px 0; padding:12px 16px; background:#f8f9fa; border-radius:8px; font-size:14px;">` +
            `<strong>Also read:</strong> <a href="${orphan.url}" style="color:#0066FF; text-decoration:none;">${this.escapeHtml(anchorText)}</a></p>`;

          // Append before the last closing tag or at end
          const updatedContent = currentContent + alsoReadHtml;

          await this.api.post(`/posts/${target.postId}`, {
            content: updatedContent,
          });
          linkedCount++;
          logger.info(`Auto-linked orphan "${orphan.title}" from "${target.title}" (anchor: "${anchorText}")`);
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

  /**
   * Insert reverse internal links: after publishing a new post,
   * find related existing posts (same cluster + cross-niche) and inject a contextual link.
   * Uses context-based limit: same-niche (up to 4) + cross-niche (up to 2).
   */
  async insertReverseLinks(
    newPostUrl: string,
    newPostTitle: string,
    newPostKeyword: string,
    nicheId: string,
    existingPosts: ExistingPost[],
    limit: number = 5,
  ): Promise<number> {
    // Find same-niche posts to link from
    const sameNicheCandidates = existingPosts
      .filter(p => p.postId && p.subNiche === nicheId && !p.url.includes(newPostUrl.replace(/\/$/, '')))
      .slice(0, 20);

    // Cross-niche candidates from related categories
    const postCategory = existingPosts.find(p => p.subNiche === nicheId)?.category;
    const crossNicheCategories = postCategory ? (WordPressService.CROSS_NICHE_MAP[postCategory] || []) : [];
    const crossNicheCandidates = crossNicheCategories.length > 0
      ? existingPosts
          .filter(p => p.postId && crossNicheCategories.includes(p.category) && !p.url.includes(newPostUrl.replace(/\/$/, '')))
          .slice(0, 10)
      : [];

    const candidates = [...sameNicheCandidates, ...crossNicheCandidates];

    if (candidates.length === 0) return 0;

    // Score by keyword overlap for relevance
    const kwWords = new Set(newPostKeyword.toLowerCase().split(/\s+/).filter(w => w.length > 3));
    const scored = candidates.map(p => {
      const titleWords = p.title.toLowerCase().split(/\s+/);
      const overlap = titleWords.filter(w => kwWords.has(w)).length;
      return { post: p, relevance: overlap };
    }).filter(s => s.relevance > 0)
      .sort((a, b) => b.relevance - a.relevance)
      .slice(0, limit);

    if (scored.length === 0) {
      // Fallback: use most recent same-niche posts
      scored.push(...candidates.slice(0, limit).map(p => ({ post: p, relevance: 0 })));
    }

    let linked = 0;
    for (const { post } of scored.slice(0, limit)) {
      if (!post.postId) continue;
      try {
        const { data } = await this.api.get(`/posts/${post.postId}`, {
          params: { _fields: 'id,content' },
        });
        const content = (data.content?.rendered || '') as string;

        // Skip if already links to the new post
        if (content.includes(newPostUrl.replace(/\/$/, ''))) continue;

        // Find a suitable insertion point: before the last H2 or before disclaimer
        const anchorText = newPostTitle.length > 60 ? newPostTitle.slice(0, 57) + '...' : newPostTitle;
        const linkHtml = `\n<div class="ab-related-inline" style="margin:20px 0; padding:14px 18px; background:linear-gradient(135deg,#f0f4ff,#f8f9fa); border-left:3px solid #0066FF; border-radius:0 8px 8px 0; font-size:14px;">` +
          `<strong>Related:</strong> <a href="${newPostUrl}" style="color:#0066FF; text-decoration:underline;">${this.escapeHtml(anchorText)}</a></div>\n`;

        // Insert before the last H2 heading for natural flow
        const lastH2Idx = content.lastIndexOf('<h2');
        let updatedContent: string;
        if (lastH2Idx > content.length * 0.5) {
          updatedContent = content.slice(0, lastH2Idx) + linkHtml + content.slice(lastH2Idx);
        } else {
          // Fallback: append before disclaimer
          const disclaimerIdx = content.indexOf('ab-disclaimer');
          if (disclaimerIdx !== -1) {
            const insertIdx = content.lastIndexOf('<p', disclaimerIdx);
            updatedContent = content.slice(0, insertIdx) + linkHtml + content.slice(insertIdx);
          } else {
            updatedContent = content + linkHtml;
          }
        }

        await this.api.post(`/posts/${post.postId}`, { content: updatedContent });
        linked++;
        logger.info(`Reverse link: Added "${newPostTitle.slice(0, 40)}..." link to "${post.title.slice(0, 40)}..."`);
      } catch (error) {
        logger.warn(`Reverse link failed for post ${post.postId}: ${error instanceof Error ? error.message : error}`);
      }
    }

    if (linked > 0) {
      logger.info(`Reverse links: Inserted ${linked} backlink(s) to new post`);
    }
    return linked;
  }

  /**
   * Inject contextual internal links into post body content.
   * Scans paragraphs for keyword matches against existing posts and wraps first occurrence as a link.
   * Max 3 links injected, min 1 paragraph apart to avoid over-linking.
   */
  static injectContextualInternalLinks(
    html: string,
    existingPosts: ExistingPost[],
    currentKeyword: string,
    wpUrl: string,
    maxLinks: number = 3,
  ): string {
    if (existingPosts.length === 0) return html;

    // Build candidate list from existing posts with keyword/title words
    const currentKwWords = new Set(currentKeyword.toLowerCase().split(/\s+/).filter(w => w.length > 3));
    const candidates = existingPosts
      .filter(p => p.url && p.title && p.keyword)
      .map(p => {
        const kwWords = (p.keyword || p.title).toLowerCase().split(/\s+/).filter(w => w.length > 3);
        return { post: p, anchorWords: kwWords };
      })
      .filter(c => {
        // Don't link to self — skip if keyword overlap is too high
        const overlap = c.anchorWords.filter(w => currentKwWords.has(w)).length;
        return overlap < currentKwWords.size * 0.7;
      })
      .slice(0, 20);

    if (candidates.length === 0) return html;

    // Split HTML by paragraphs to inject links naturally
    const paragraphs = html.split(/(<\/p>)/i);
    let injected = 0;
    let lastInjectedIdx = -3; // Ensure min 2 paragraphs between links
    const usedUrls = new Set<string>();

    for (let i = 0; i < paragraphs.length && injected < maxLinks; i++) {
      const part = paragraphs[i];
      if (!part.startsWith('<p') && !part.includes('<p ') && !part.includes('<p>')) continue;
      if (i - lastInjectedIdx < 4) continue; // Space links out

      const plainText = part.replace(/<[^>]+>/g, ' ').toLowerCase();
      // Skip very short paragraphs
      if (plainText.split(/\s+/).length < 15) continue;
      // Skip paragraphs that already have links
      if (part.includes('<a ')) continue;

      for (const candidate of candidates) {
        if (usedUrls.has(candidate.post.url)) continue;
        // Check if any anchor word appears in this paragraph
        const matchWord = candidate.anchorWords.find(w => plainText.includes(w));
        if (!matchWord) continue;

        // Find the word in HTML and wrap first occurrence as link
        const wordRegex = new RegExp(`\\b(${matchWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\w{0,5})\\b`, 'i');
        const match = part.match(wordRegex);
        if (!match || !match.index) continue;

        // Don't inject inside an existing tag
        const before = part.slice(0, match.index);
        if ((before.match(/</g) || []).length > (before.match(/>/g) || []).length) continue;

        const anchorText = candidate.post.title.length > 50
          ? candidate.post.title.slice(0, 47) + '...'
          : candidate.post.title;
        const link = `<a href="${candidate.post.url}" title="${anchorText.replace(/"/g, '&quot;')}">${match[0]}</a>`;
        paragraphs[i] = part.slice(0, match.index) + link + part.slice(match.index + match[0].length);

        usedUrls.add(candidate.post.url);
        injected++;
        lastInjectedIdx = i;
        break;
      }
    }

    if (injected > 0) {
      logger.info(`Contextual internal links: injected ${injected} link(s) in post body`);
    }
    return paragraphs.join('');
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

  /**
   * Re-scan existing posts for new internal linking opportunities.
   * Finds keyword matches between posts and injects links where missing.
   * Max 7 internal links per post. Runs weekly (checks last run timestamp).
   */
  async rescanInternalLinks(existingPosts: ExistingPost[], maxLinksPerPost: number = 7): Promise<number> {
    const RESCAN_CACHE_FILE = join(dirname(new URL(import.meta.url).pathname), '../../.cache/rescan-links-last.json');
    const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

    // Check if we ran within the last week
    try {
      if (existsSync(RESCAN_CACHE_FILE)) {
        const cached = JSON.parse(readFileSync(RESCAN_CACHE_FILE, 'utf-8')) as { lastRun: number };
        if (Date.now() - cached.lastRun < ONE_WEEK_MS) {
          logger.debug(`Internal link rescan: skipped (last run ${((Date.now() - cached.lastRun) / 3600000).toFixed(0)}h ago)`);
          return 0;
        }
      }
    } catch { /* proceed */ }

    if (existingPosts.length < 5) return 0;

    let totalLinksAdded = 0;
    const postsToUpdate: Array<{ postId: number; content: string }> = [];

    // Build keyword-to-URL map from existing posts
    const linkMap: Array<{ term: string; url: string; postId: number }> = [];
    for (const post of existingPosts) {
      if (!post.postId || !post.url) continue;
      if (post.keyword && post.keyword.length >= 8) {
        linkMap.push({ term: post.keyword, url: post.url, postId: post.postId });
      }
    }

    if (linkMap.length < 3) return 0;

    // Fetch content for each post and check for missing links
    for (const post of existingPosts.slice(0, 50)) {
      if (!post.postId) continue;

      try {
        const { data } = await this.api.get(`/posts/${post.postId}`, {
          params: { _fields: 'id,content' },
        });
        let content = (data.content?.rendered || '') as string;
        if (!content || content.length < 200) continue;

        // Count existing internal links
        const existingLinkCount = (content.match(new RegExp(`href="${this.wpUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'gi')) || []).length;
        if (existingLinkCount >= maxLinksPerPost) continue;

        let linksAdded = 0;
        const maxNew = maxLinksPerPost - existingLinkCount;

        for (const candidate of linkMap) {
          if (linksAdded >= maxNew) break;
          if (candidate.postId === post.postId) continue;
          // Skip if already linked to this URL
          if (content.includes(candidate.url)) continue;

          const termEscaped = candidate.term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const pattern = new RegExp(
            `(<p[^>]*>(?:(?!<\\/p>).)*?)\\b(${termEscaped})\\b((?:(?!<\\/p>).)*?<\\/p>)`,
            'is',
          );
          const match = pattern.exec(content);
          if (!match) continue;

          // Skip if inside an <a> tag
          const before = match[1];
          if (before.lastIndexOf('<a ') > before.lastIndexOf('</a>')) continue;

          const link = `<a href="${candidate.url}" style="color:#0066FF; text-decoration:underline;">${match[2]}</a>`;
          content = content.slice(0, match.index) + match[1] + link + match[3] + content.slice(match.index + match[0].length);
          linksAdded++;
        }

        if (linksAdded > 0) {
          postsToUpdate.push({ postId: post.postId, content });
          totalLinksAdded += linksAdded;
        }
      } catch {
        // Skip individual post failures
      }
    }

    // Batch update posts
    for (const update of postsToUpdate.slice(0, 10)) {
      try {
        await this.api.post(`/posts/${update.postId}`, { content: update.content });
        logger.debug(`Rescan: added links to post ${update.postId}`);
      } catch {
        logger.debug(`Rescan: failed to update post ${update.postId}`);
      }
    }

    // Update last run timestamp
    try {
      const cacheDir = dirname(RESCAN_CACHE_FILE);
      if (!existsSync(cacheDir)) mkdirSync(cacheDir, { recursive: true });
      writeFileSync(RESCAN_CACHE_FILE, JSON.stringify({ lastRun: Date.now() }));
    } catch { /* non-fatal */ }

    if (totalLinksAdded > 0) {
      logger.info(`Internal link rescan: added ${totalLinksAdded} new link(s) across ${postsToUpdate.length} post(s)`);
    }
    return totalLinksAdded;
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

  /**
   * Detect redirect chains among internal links.
   * A redirect chain is A → B → C (or longer), which wastes crawl budget
   * and dilutes link equity. Logs warnings for chains found.
   *
   * @param urls List of internal URLs to check (e.g., from existing posts)
   * @returns Array of detected redirect chains with recommendations
   */
  async detectRedirectChains(urls: string[]): Promise<Array<{
    originalUrl: string;
    chain: string[];
    finalUrl: string;
    hops: number;
    recommendation: string;
  }>> {
    const chains: Array<{
      originalUrl: string;
      chain: string[];
      finalUrl: string;
      hops: number;
      recommendation: string;
    }> = [];

    // Only check a sample to avoid overwhelming the server
    const sample = urls.slice(0, 50);

    const results = await Promise.allSettled(
      sample.map(async (url) => {
        try {
          const response = await axios.get(url, {
            maxRedirects: 0,
            validateStatus: (status) => status >= 200 && status < 400,
            timeout: 5000,
          });
          // No redirect — URL is clean
          return { url, status: response.status, redirectUrl: null };
        } catch (error) {
          if (axios.isAxiosError(error) && error.response && [301, 302, 307, 308].includes(error.response.status)) {
            const redirectUrl = error.response.headers.location;
            return { url, status: error.response.status, redirectUrl: redirectUrl as string };
          }
          return { url, status: 0, redirectUrl: null };
        }
      }),
    );

    // Build redirect map
    const redirectMap = new Map<string, string>();
    for (const result of results) {
      if (result.status === 'fulfilled' && result.value.redirectUrl) {
        redirectMap.set(result.value.url, result.value.redirectUrl);
      }
    }

    // Detect chains (follow redirects through the map)
    for (const [startUrl, firstRedirect] of redirectMap) {
      const chain = [startUrl, firstRedirect];
      let current = firstRedirect;
      const visited = new Set([startUrl]);

      while (redirectMap.has(current) && !visited.has(current)) {
        visited.add(current);
        current = redirectMap.get(current)!;
        chain.push(current);
      }

      if (chain.length > 2) {
        // This is a chain (2+ hops)
        chains.push({
          originalUrl: startUrl,
          chain,
          finalUrl: chain[chain.length - 1],
          hops: chain.length - 1,
          recommendation: `Update links pointing to "${startUrl}" to point directly to "${chain[chain.length - 1]}" (saves ${chain.length - 2} redirect hop(s))`,
        });
      }
    }

    if (chains.length > 0) {
      logger.warn(`=== Redirect Chain Alert: ${chains.length} chain(s) detected ===`);
      for (const c of chains.slice(0, 10)) {
        logger.warn(`  [${c.hops} hops] ${c.chain.join(' → ')}`);
      }
    }

    return chains;
  }

  /**
   * Build FAQ JSON-LD schema from extracted FAQ items in content.
   * Targets Google's FAQ rich result for SERP area expansion.
   */
  static buildFaqJsonLd(faqItems: Array<{ question: string; answer: string }>): string {
    if (!faqItems || faqItems.length === 0) return '';

    const schema = {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: faqItems.slice(0, 10).map(item => ({
        '@type': 'Question',
        name: item.question,
        acceptedAnswer: {
          '@type': 'Answer',
          text: item.answer,
        },
      })),
    };

    return `<script type="application/ld+json">${JSON.stringify(schema)}</script>`;
  }

  /**
   * Build HowTo JSON-LD schema from extracted steps in how-to content.
   * Targets Google's HowTo rich result with step-by-step display.
   */
  static buildHowToJsonLd(
    title: string,
    steps: Array<{ name: string; text: string }>,
    description?: string,
  ): string {
    if (!steps || steps.length === 0) return '';

    const schema = {
      '@context': 'https://schema.org',
      '@type': 'HowTo',
      name: title,
      ...(description ? { description } : {}),
      step: steps.map((step, i) => ({
        '@type': 'HowToStep',
        position: i + 1,
        name: step.name,
        text: step.text,
      })),
    };

    return `<script type="application/ld+json">${JSON.stringify(schema)}</script>`;
  }

  /**
   * Extract FAQ items from generated HTML content.
   * Looks for FAQ section H3 question headings and their answer paragraphs.
   */
  static extractFaqItems(html: string): Array<{ question: string; answer: string }> {
    const faqItems: Array<{ question: string; answer: string }> = [];

    // Find FAQ section
    const faqSectionMatch = html.match(/<h2[^>]*>(?:.*?FAQ|.*?Frequently Asked|.*?Questions).*?<\/h2>([\s\S]*?)(?=<h2|<div class="ab-|$)/i);
    if (!faqSectionMatch) return faqItems;

    const faqSection = faqSectionMatch[1];
    // Extract H3 questions and their answer paragraphs
    const questionRegex = /<h3[^>]*>(.*?)<\/h3>([\s\S]*?)(?=<h3|$)/gi;
    let match;

    while ((match = questionRegex.exec(faqSection)) !== null) {
      const question = match[1].replace(/<[^>]+>/g, '').trim();
      // Get answer text from paragraphs after the H3
      const answerHtml = match[2];
      const answer = answerHtml
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 500);

      if (question && answer && question.length > 10) {
        faqItems.push({ question, answer });
      }
    }

    return faqItems.slice(0, 10);
  }

  /**
   * Extract HowTo steps from how-to content HTML.
   * Looks for numbered steps in ordered lists or step-by-step H3 headings.
   */
  static extractHowToSteps(html: string): Array<{ name: string; text: string }> {
    const steps: Array<{ name: string; text: string }> = [];

    // Try ordered list extraction first (most common how-to format)
    const olMatch = html.match(/<ol[^>]*>([\s\S]*?)<\/ol>/i);
    if (olMatch) {
      const listItems = olMatch[1].match(/<li[^>]*>([\s\S]*?)<\/li>/gi) || [];
      for (const li of listItems.slice(0, 15)) {
        const text = li.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        // Try to split on "—" or ":" to get step name vs description
        const dashSplit = text.match(/^(.+?)(?:\s*[—–:]\s*)(.+)$/);
        if (dashSplit) {
          steps.push({ name: dashSplit[1].trim(), text: dashSplit[2].trim() });
        } else if (text.length > 20) {
          const name = text.slice(0, 60).replace(/\s\S*$/, '').trim();
          steps.push({ name, text });
        }
      }
      if (steps.length >= 3) return steps;
    }

    // Fallback: extract from H3 step headings
    const stepRegex = /<h3[^>]*>(?:Step\s+\d+[.:]\s*)?(.+?)<\/h3>([\s\S]*?)(?=<h3|<h2|$)/gi;
    let match;
    while ((match = stepRegex.exec(html)) !== null) {
      const name = match[1].replace(/<[^>]+>/g, '').trim();
      const text = match[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 300);
      if (name && text) {
        steps.push({ name, text });
      }
    }

    return steps.slice(0, 15);
  }

  /**
   * Inject YouTube video embed into content at optimal position.
   * Places video after the first H2 section for engagement.
   */
  static injectYouTubeEmbed(html: string, videoUrl: string, videoTitle: string): string {
    if (!videoUrl) return html;

    // Extract video ID from URL
    const videoIdMatch = videoUrl.match(/(?:v=|youtu\.be\/|embed\/)([a-zA-Z0-9_-]{11})/);
    if (!videoIdMatch) return html;

    const videoId = videoIdMatch[1];
    const embedHtml = `<div class="ab-video-embed" style="margin:24px 0; position:relative; padding-bottom:56.25%; height:0; overflow:hidden; border-radius:12px; box-shadow:0 2px 8px rgba(0,0,0,0.1);">
<iframe src="https://www.youtube.com/embed/${videoId}" title="${videoTitle.replace(/"/g, '&quot;')}" style="position:absolute; top:0; left:0; width:100%; height:100%; border:none;" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>
</div>
<p style="margin:8px 0 24px 0; font-size:13px; color:#888; text-align:center;">Video: ${videoTitle}</p>`;

    // Insert after first H2 section's first paragraph
    const firstH2End = html.indexOf('</h2>');
    if (firstH2End > 0) {
      const afterH2 = html.indexOf('</p>', firstH2End);
      if (afterH2 > 0) {
        const insertPos = afterH2 + 4;
        return html.slice(0, insertPos) + '\n' + embedHtml + '\n' + html.slice(insertPos);
      }
    }

    // Fallback: insert at beginning
    return embedHtml + '\n' + html;
  }

  /**
   * Build content-specific upgrade CTA (higher conversion than generic lead magnets).
   * Creates a download offer directly related to the article topic.
   */
  buildContentUpgradeCta(keyword: string, category: string, contentType: string): string {
    // Generate content-specific upgrade based on content type
    const upgrades: Record<string, { title: string; description: string }> = {
      'how-to': { title: `${keyword} — Quick Reference Checklist`, description: 'Get a printable step-by-step checklist for this guide' },
      'best-x-for-y': { title: `${keyword} — Comparison Spreadsheet`, description: 'Download our detailed comparison spreadsheet with ratings and prices' },
      'analysis': { title: `${keyword} — Full Data Report`, description: 'Get the complete data analysis with charts and projections' },
      'product-review': { title: `${keyword} — Buyer\'s Decision Matrix`, description: 'Download our scoring matrix to make your purchase decision' },
      'deep-dive': { title: `${keyword} — Executive Summary PDF`, description: 'Get a concise 2-page executive summary of this deep dive' },
      'x-vs-y': { title: `${keyword} — Side-by-Side Comparison PDF`, description: 'Download the full comparison table with all features and specs' },
    };
    const upgrade = upgrades[contentType] || { title: `${keyword} — Resource Guide`, description: 'Get additional resources and references for this topic' };

    return `<div class="ab-content-upgrade" style="margin:24px 0; padding:24px; background:linear-gradient(135deg,#f0f4ff,#e8f0fe); border:2px dashed #0066FF; border-radius:12px; text-align:center;">
<p style="margin:0 0 4px 0; font-size:11px; font-weight:700; color:#0066FF; text-transform:uppercase; letter-spacing:1px;">FREE RESOURCE</p>
<p style="margin:0 0 8px 0; font-size:18px; font-weight:700; color:#222;">${this.escapeHtml(upgrade.title)}</p>
<p style="margin:0 0 16px 0; font-size:14px; color:#555; line-height:1.6;">${this.escapeHtml(upgrade.description)}</p>
<a href="#respond" onclick="if(typeof gtag==='function'){gtag('event','content_upgrade_click',{event_category:'conversion',event_label:'${this.escapeHtml(contentType)}',value:1})}" style="display:inline-block; padding:12px 32px; background:#0066FF; color:#fff; text-decoration:none; border-radius:8px; font-weight:700; font-size:15px;">Get Free Download</a>
<p style="margin:10px 0 0 0; font-size:11px; color:#999;">No signup required — instant access</p></div>`;
  }

  /**
   * Build enhanced lead magnet CTA with download link and category-specific offer.
   */
  injectEnhancedLeadMagnet(
    html: string,
    category: string,
    leadMagnetUrl: string,
    leadMagnetTitle: string,
  ): string {
    if (!leadMagnetUrl) return html;

    const magnet = WordPressService.NICHE_LEAD_MAGNETS[category];
    const title = leadMagnetTitle || magnet?.title || 'Free Download';
    const description = magnet?.description || 'Get our exclusive guide — free for our readers.';

    const ctaHtml = `<div class="ab-lead-magnet-enhanced" style="margin:32px 0; padding:24px; background:linear-gradient(135deg,#0052CC,#0066FF); border-radius:12px; text-align:center; color:#fff;">
<p style="margin:0 0 8px 0; font-size:20px; font-weight:700; color:#fff;">${this.escapeHtml(title)}</p>
<p style="margin:0 0 16px 0; font-size:14px; color:rgba(255,255,255,0.85); line-height:1.6;">${this.escapeHtml(description)}</p>
<a href="${this.escapeHtml(leadMagnetUrl)}" target="_blank" rel="noopener noreferrer" style="display:inline-block; padding:12px 32px; background:#fff; color:#0066FF; border-radius:8px; font-weight:700; font-size:15px; text-decoration:none;">Download Free Guide</a>
<p style="margin:12px 0 0 0; font-size:11px; color:rgba(255,255,255,0.5);">No signup required. Instant download.</p>
</div>`;

    // Insert at approximately 40% of content
    const h2Positions = this.findH2SectionEnds(html);
    if (h2Positions.length >= 3) {
      const targetIdx = Math.floor(h2Positions.length * 0.4);
      const insertPos = h2Positions[Math.min(targetIdx, h2Positions.length - 1)];
      return html.slice(0, insertPos) + '\n' + ctaHtml + '\n' + html.slice(insertPos);
    }
    return html;
  }
}
