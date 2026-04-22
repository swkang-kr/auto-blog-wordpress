import axios, { type AxiosInstance } from 'axios';
import Anthropic from '@anthropic-ai/sdk';
import { logger } from '../utils/logger.js';
import { costTracker } from '../utils/cost-tracker.js';
import { validateContent, logContentScore } from '../utils/content-validator.js';
import type { PostHistoryEntry, FreshnessClass } from '../types/index.js';
import { CONTENT_FRESHNESS_MAP, FRESHNESS_UPDATE_INTERVALS } from '../types/index.js';
import type { GA4AnalyticsService } from './ga4-analytics.service.js';
import type { GSCAnalyticsService } from './gsc-analytics.service.js';
import type { SeoService } from './seo.service.js';

export interface WPPost {
  id: number;
  title: { rendered: string };
  slug: string;
  content: { rendered: string };
  link: string;
  date: string;
  meta?: Record<string, string>;
}

export class ContentRefreshService {
  private api: AxiosInstance;
  private claude: Anthropic;
  private model: string;
  private wpUrl: string;

  constructor(
    wpUrl: string,
    username: string,
    appPassword: string,
    anthropicApiKey: string,
    claudeModel: string = 'claude-sonnet-4-6',
  ) {
    this.wpUrl = wpUrl.replace(/\/+$/, '');
    this.model = claudeModel;
    const token = Buffer.from(`${username}:${appPassword}`).toString('base64');
    this.api = axios.create({
      baseURL: `${this.wpUrl}/wp-json/wp/v2`,
      headers: { Authorization: `Basic ${token}` },
      timeout: 30000,
    });
    this.claude = new Anthropic({ apiKey: anthropicApiKey });
  }

  /**
   * Find and rewrite declining posts using GA4 data + freshness scores.
   * Combines performance metrics with content decay for smarter refresh prioritization.
   * Returns the number of posts successfully rewritten.
   */
  async refreshDecliningPosts(
    ga4Service: GA4AnalyticsService,
    seoService?: SeoService,
    limit: number = 3,
    minAgeDays: number = 30,
    freshnessData?: Array<PostHistoryEntry & { freshnessScore: number }>,
    gscService?: GSCAnalyticsService,
    rpmByCategory?: Record<string, number>,
    allowedNicheIds?: string[],
  ): Promise<number> {
    const allPosts = await ga4Service.getTopPerformingPosts(100);
    if (allPosts.length === 0) {
      logger.info('Auto-rewrite: No GA4 data available, skipping');
      return 0;
    }

    // Identify underperformers: bottom 20% by pageviews OR bounce rate > 70%
    const threshold = Math.max(1, Math.floor(allPosts.length * 0.2));
    let underperformers = allPosts
      .filter(p => p.pageviews > 0)
      .sort((a, b) => a.pageviews - b.pageviews)
      .slice(0, threshold)
      .concat(
        allPosts.filter(p => p.bounceRate > 0.7 && p.pageviews >= 5),
      )
      .filter((p, i, arr) => arr.findIndex(x => x.url === p.url) === i);

    // Filter to active niches only — avoid refreshing off-niche or deprecated posts
    if (allowedNicheIds && allowedNicheIds.length > 0 && freshnessData && freshnessData.length > 0) {
      const allowedSlugs = new Set(
        freshnessData
          .filter(f => f.niche && allowedNicheIds.includes(f.niche) && f.postUrl)
          .map(f => { try { return new URL(f.postUrl).pathname.replace(/^\/|\/$/g, ''); } catch { return ''; } })
          .filter(Boolean),
      );
      if (allowedSlugs.size > 0) {
        underperformers = underperformers.filter(p => allowedSlugs.has(p.url.replace(/^\/|\/$/g, '')));
      }
    }

    // Boost priority for posts with low freshness scores (content decay)
    if (freshnessData && freshnessData.length > 0) {
      const freshnessMap = new Map(freshnessData.map(f => [f.postUrl, f.freshnessScore]));
      underperformers = underperformers
        .map(p => {
          const slug = '/' + p.url.replace(/^\/|\/$/g, '') + '/';
          const freshness = freshnessMap.get(slug) ?? freshnessMap.get(p.url) ?? 50;
          // Revenue-weighted combined score: lower = higher priority for refresh
          // Posts in high-RPM niches get priority boost (revenue × age decay)
          let revenueBoost = 0;
          if (rpmByCategory) {
            const entry = freshnessData.find(f => f.postUrl && (slug.includes(f.postUrl.replace(/^https?:\/\/[^/]+/, '').replace(/\/+$/, '')) || f.postUrl.includes(p.url.replace(/^\//, ''))));
            if (entry?.niche) {
              const NICHE_CAT_MAP: Record<string, string> = {
                'market-analysis': '시장분석', 'sector-analysis': '업종분석',
                'theme-analysis': '테마분석', 'stock-analysis': '종목분석',
                'korean-stock': '시장분석', 'ai-trading': '종목분석', // legacy
              };
              const nicheCategory = NICHE_CAT_MAP[entry.niche] || entry.niche;
              const rpm = rpmByCategory[nicheCategory] || 5;
              // High RPM posts get negative boost (lower score = higher priority)
              revenueBoost = -(rpm / 15) * 10; // Max ~-8 for $12 RPM categories
            }
          }
          const refreshPriority = (freshness * 0.4) + ((1 - p.bounceRate) * 100 * 0.3) + (Math.min(p.pageviews, 100) * 0.3) + revenueBoost;
          return { ...p, refreshPriority };
        })
        .sort((a, b) => a.refreshPriority - b.refreshPriority);

      // Also add stale posts (freshness < 30) even if GA4 data looks OK
      const stalePosts = freshnessData
        .filter(f => f.freshnessScore < 30 && f.postUrl)
        .filter(f => !underperformers.some(u => f.postUrl.includes(u.url.replace(/^\//, ''))))
        .slice(0, 2);

      for (const stale of stalePosts) {
        const slug = new URL(stale.postUrl).pathname.replace(/^\/|\/$/g, '');
        underperformers.push({
          url: slug,
          pageviews: 0,
          bounceRate: 0,
          avgEngagementTime: 0,
          refreshPriority: stale.freshnessScore,
        } as typeof underperformers[0]);
      }

      logger.info(`Auto-rewrite: Freshness-enhanced prioritization active (${freshnessData.length} entries scored)`);
    }

    // Boost with GSC declining pages (position dropping while impressions stable)
    if (gscService) {
      try {
        const declining = await gscService.getDecliningPages();
        for (const page of declining.slice(0, 3)) {
          const slug = new URL(page.page).pathname.replace(/^\/|\/$/g, '');
          const alreadyIncluded = underperformers.some(u => u.url.replace(/^\/|\/$/g, '') === slug);
          if (!alreadyIncluded && slug) {
            underperformers.push({
              url: slug,
              pageviews: page.clicks,
              bounceRate: 0,
              avgEngagementTime: 0,
              refreshPriority: 10, // High priority for GSC-declining
            } as typeof underperformers[0]);
            logger.info(`Auto-rewrite: GSC declining page added: ${slug} (pos ${page.position.toFixed(1)})`);
          }
        }
      } catch (error) {
        logger.debug(`GSC declining pages for refresh failed: ${error instanceof Error ? error.message : error}`);
      }
    }

    underperformers = underperformers.slice(0, limit);

    if (underperformers.length === 0) {
      logger.info('Auto-rewrite: No underperforming posts found');
      return 0;
    }

    logger.info(`Auto-rewrite: Found ${underperformers.length} underperforming post(s)`);

    let rewrittenCount = 0;
    const rewrittenUrls: string[] = [];

    for (const perf of underperformers) {
      const slug = perf.url.replace(/^\/|\/$/g, '');
      if (!slug) continue;

      try {
        const { data: posts } = await this.api.get('/posts', {
          params: { slug, status: 'publish', _fields: 'id,title,slug,content,link,date,meta' },
        });
        const post = (posts as WPPost[])[0];
        if (!post) {
          logger.debug(`Auto-rewrite: Post not found for "${slug}"`);
          continue;
        }

        // Check age using the post's published date (not link URL)
        const postDate = new Date(post.date);
        const postAge = isNaN(postDate.getTime()) ? Infinity : (Date.now() - postDate.getTime()) / (1000 * 60 * 60 * 24);
        if (postAge < minAgeDays && minAgeDays > 0) {
          logger.debug(`Auto-rewrite: "${post.title.rendered}" too young (${postAge.toFixed(0)} days)`);
          continue;
        }

        logger.info(`Auto-rewrite: Rewriting "${post.title.rendered}" (${perf.pageviews} views, ${(perf.bounceRate * 100).toFixed(0)}% bounce)`);

        const rewritten = await this.rewriteContent(post, perf);
        if (!rewritten) continue;

        const nowIso = new Date().toISOString();

        // Update JSON-LD dateModified if present
        const existingJsonLd = post.meta?._autoblog_jsonld;
        let updatedJsonLd: string | undefined;
        if (existingJsonLd) {
          try {
            const jsonLdArr = JSON.parse(existingJsonLd);
            if (Array.isArray(jsonLdArr)) {
              for (const item of jsonLdArr) {
                if (item.dateModified) item.dateModified = nowIso;
              }
              updatedJsonLd = JSON.stringify(jsonLdArr);
            }
          } catch {
            // JSON-LD parse failed, skip update
          }
        }

        await this.api.post(`/posts/${post.id}`, {
          title: rewritten.title,
          content: rewritten.html,
          excerpt: rewritten.excerpt,
          meta: {
            _last_updated: nowIso,
            _autoblog_modified_time: nowIso,
            _rewrite_reason: `Auto-rewrite: ${perf.pageviews} views, ${(perf.bounceRate * 100).toFixed(0)}% bounce`,
            rank_math_description: rewritten.excerpt,
            ...(updatedJsonLd ? { _autoblog_jsonld: updatedJsonLd } : {}),
          },
        });

        rewrittenCount++;
        rewrittenUrls.push(post.link);
        logger.info(`Auto-rewrite: Successfully rewrote "${rewritten.title}"`);

        // Rate limit
        await new Promise(r => setTimeout(r, 2000));
      } catch (error) {
        logger.warn(`Auto-rewrite failed for "${slug}": ${error instanceof Error ? error.message : error}`);
      }
    }

    // Re-index rewritten posts
    if (seoService && rewrittenUrls.length > 0) {
      try {
        await seoService.notifyIndexNow(rewrittenUrls);
        for (const url of rewrittenUrls) {
          await seoService.requestIndexing(url);
        }
        logger.info(`Auto-rewrite: Submitted ${rewrittenUrls.length} URL(s) for re-indexing`);
      } catch (error) {
        logger.warn(`Auto-rewrite: Re-indexing failed: ${error instanceof Error ? error.message : error}`);
      }
    }

    return rewrittenCount;
  }

  /**
   * Time-based refresh fallback: refresh posts that exceed their freshness class update interval.
   * Works WITHOUT GA4 — uses only history freshness data.
   * Targets posts where ageDays > FRESHNESS_UPDATE_INTERVALS[freshnessClass] AND freshnessScore < 40.
   */
  async refreshByTimeThreshold(
    freshnessData: Array<PostHistoryEntry & { freshnessScore: number }>,
    seoService?: SeoService,
    limit: number = 2,
  ): Promise<number> {
    const now = Date.now();
    const candidates = freshnessData.filter(entry => {
      if (entry.freshnessScore >= 40) return false;
      const ageDays = (now - new Date(entry.publishedAt).getTime()) / (1000 * 60 * 60 * 24);
      const freshnessClass: FreshnessClass = entry.contentType
        ? (CONTENT_FRESHNESS_MAP[entry.contentType] || 'seasonal')
        : 'seasonal';
      const interval = FRESHNESS_UPDATE_INTERVALS[freshnessClass];
      return ageDays > interval;
    }).slice(0, limit);

    if (candidates.length === 0) {
      logger.info('Time-based refresh: No posts exceed freshness threshold');
      return 0;
    }

    logger.info(`Time-based refresh: ${candidates.length} post(s) exceed freshness threshold`);
    let refreshedCount = 0;
    const refreshedUrls: string[] = [];

    for (const entry of candidates) {
      const slug = new URL(entry.postUrl).pathname.replace(/^\/|\/$/g, '');
      if (!slug) continue;

      try {
        const { data: posts } = await this.api.get('/posts', {
          params: { slug, status: 'publish', _fields: 'id,title,slug,content,link,date,meta' },
        });
        const post = (posts as WPPost[])[0];
        if (!post) continue;

        logger.info(`Time-based refresh: Rewriting "${post.title.rendered}" (freshness: ${entry.freshnessScore}, type: ${entry.contentType || 'unknown'})`);

        const rewritten = await this.rewriteContent(post, { pageviews: 0, bounceRate: 0, avgEngagementTime: 0 });
        if (!rewritten) continue;

        const nowIso = new Date().toISOString();
        await this.api.post(`/posts/${post.id}`, {
          title: rewritten.title,
          content: rewritten.html,
          excerpt: rewritten.excerpt,
          meta: {
            _last_updated: nowIso,
            _autoblog_modified_time: nowIso,
            _rewrite_reason: `Time-based refresh: freshness ${entry.freshnessScore}, type ${entry.contentType || 'unknown'}`,
            rank_math_description: rewritten.excerpt,
          },
        });

        refreshedCount++;
        refreshedUrls.push(post.link);
        logger.info(`Time-based refresh: Successfully rewrote "${rewritten.title}"`);

        await new Promise(r => setTimeout(r, 2000));
      } catch (error) {
        logger.warn(`Time-based refresh failed for "${slug}": ${error instanceof Error ? error.message : error}`);
      }
    }

    if (seoService && refreshedUrls.length > 0) {
      try {
        await seoService.notifyIndexNow(refreshedUrls);
        for (const url of refreshedUrls) {
          await seoService.requestIndexing(url);
        }
        logger.info(`Time-based refresh: Submitted ${refreshedUrls.length} URL(s) for re-indexing`);
      } catch (error) {
        logger.warn(`Time-based refresh: Re-indexing failed: ${error instanceof Error ? error.message : error}`);
      }
    }

    return refreshedCount;
  }

  /**
   * Auto-refresh yearly content (titles containing a year) at the start of a new year.
   * E.g., "Best Korean ETFs for 2025" → triggers refresh in January 2026.
   * Returns the number of posts refreshed.
   */
  async refreshYearlyContent(
    freshnessData: Array<PostHistoryEntry & { freshnessScore: number }>,
    seoService?: SeoService,
    limit: number = 3,
  ): Promise<number> {
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth(); // 0-indexed
    const previousYear = currentYear - 1;

    // Run quarterly (first month of each quarter: Jan, Apr, Jul, Oct)
    // Refreshes posts containing stale year references (previous year or older)
    const quarterStartMonths = [0, 3, 6, 9]; // Jan=0, Apr=3, Jul=6, Oct=9
    if (!quarterStartMonths.includes(currentMonth)) {
      logger.debug(`Yearly refresh: Not a quarter-start month (month=${currentMonth}), skipping`);
      return 0;
    }

    const yearlyPosts = freshnessData.filter(entry => {
      const titleOrKeyword = entry.keyword.toLowerCase();
      // Check for previous year or any older year (2020-previousYear)
      for (let yr = previousYear; yr >= previousYear - 2; yr--) {
        if (titleOrKeyword.includes(yr.toString()) && !titleOrKeyword.includes(currentYear.toString())) {
          return true;
        }
      }
      return false;
    });

    if (yearlyPosts.length === 0) {
      logger.info(`Yearly refresh: No ${previousYear} posts found needing update to ${currentYear}`);
      return 0;
    }

    logger.info(`Yearly refresh: Found ${yearlyPosts.length} post(s) with ${previousYear} references, refreshing up to ${limit}`);

    let refreshedCount = 0;
    const refreshedUrls: string[] = [];

    for (const entry of yearlyPosts.slice(0, limit)) {
      const slug = new URL(entry.postUrl).pathname.replace(/^\/|\/$/g, '');
      if (!slug) continue;

      try {
        const { data: posts } = await this.api.get('/posts', {
          params: { slug, status: 'publish', _fields: 'id,title,slug,content,link,date,meta' },
        });
        const post = (posts as WPPost[])[0];
        if (!post) continue;

        logger.info(`Yearly refresh: Updating "${post.title.rendered}" (${previousYear} → ${currentYear})`);

        const rewritten = await this.rewriteContent(post, { pageviews: 0, bounceRate: 0, avgEngagementTime: 0 });
        if (!rewritten) continue;

        const nowIso = new Date().toISOString();
        await this.api.post(`/posts/${post.id}`, {
          title: rewritten.title,
          content: rewritten.html,
          excerpt: rewritten.excerpt,
          meta: {
            _last_updated: nowIso,
            _autoblog_modified_time: nowIso,
            _rewrite_reason: `Yearly refresh: ${previousYear} → ${currentYear}`,
            rank_math_description: rewritten.excerpt,
          },
        });

        refreshedCount++;
        refreshedUrls.push(post.link);
        logger.info(`Yearly refresh: Successfully updated "${rewritten.title}"`);
        await new Promise(r => setTimeout(r, 2000));
      } catch (error) {
        logger.warn(`Yearly refresh failed for "${slug}": ${error instanceof Error ? error.message : error}`);
      }
    }

    if (seoService && refreshedUrls.length > 0) {
      try {
        await seoService.notifyIndexNow(refreshedUrls);
        for (const url of refreshedUrls) await seoService.requestIndexing(url);
        logger.info(`Yearly refresh: Submitted ${refreshedUrls.length} URL(s) for re-indexing`);
      } catch (error) {
        logger.warn(`Yearly refresh: Re-indexing failed: ${error instanceof Error ? error.message : error}`);
      }
    }

    return refreshedCount;
  }

  /**
   * Run A/B title tests for posts with titleCandidates.
   * Phase A (Day 0-3): Original title, record CTR from GSC
   * Phase B (Day 3-6): Switch to alternative title
   * Day 6+: Compare CTR, lock winner, update history
   */
  async runTitleABTests(
    pendingTests: PostHistoryEntry[],
    gscService?: GSCAnalyticsService,
    wpService?: { updatePostTitle: (postId: number, title: string) => Promise<void> },
  ): Promise<{ tested: number; resolved: number }> {
    if (pendingTests.length === 0 || !gscService) {
      return { tested: 0, resolved: 0 };
    }

    let tested = 0;
    let resolved = 0;
    const now = Date.now();

    for (const entry of pendingTests.slice(0, 5)) {
      const daysSincePublish = (now - new Date(entry.publishedAt).getTime()) / (1000 * 60 * 60 * 24);

      if (daysSincePublish < 3) {
        // Phase A: Too early, skip
        continue;
      }

      if (daysSincePublish >= 3 && !entry.titleTestPhaseBStarted) {
        // Phase A complete: record Phase A CTR and switch to Phase B title
        try {
          const queries = await gscService.getTopQueries(10);
          const postSlug = new URL(entry.postUrl).pathname.replace(/^\/|\/$/g, '');
          const matchingQuery = queries.find(q =>
            q.query.toLowerCase().includes(entry.keyword.toLowerCase().split(/\s+/)[0]),
          );

          if (matchingQuery) {
            entry.titleTestPhaseACtr = matchingQuery.ctr;
            entry.titleTestPhaseATitle = entry.keyword; // Original title as keyword proxy
          }

          // Switch to alternative title (Phase B)
          if (entry.titleCandidates && entry.titleCandidates.length > 0 && wpService) {
            const altTitle = entry.titleCandidates[0];
            entry.titleTestPhaseBStarted = true;
            entry.titleTestPhaseBTitle = altTitle;
            entry.originalTitle = entry.keyword;
            await wpService.updatePostTitle(entry.postId, altTitle);
            logger.info(`Title A/B: Phase B started for "${entry.keyword}" → "${altTitle}"`);
            tested++;
          }
        } catch (error) {
          logger.debug(`Title A/B Phase A failed for "${entry.keyword}": ${error instanceof Error ? error.message : error}`);
        }
        continue;
      }

      if (daysSincePublish >= 6 && entry.titleTestPhaseBStarted && !entry.titleTestResolved) {
        // Day 6+: Compare Phase A vs Phase B CTR, lock winner
        try {
          const queries = await gscService.getTopQueries(10);
          const matchingQuery = queries.find(q =>
            q.query.toLowerCase().includes(entry.keyword.toLowerCase().split(/\s+/)[0]),
          );

          if (matchingQuery) {
            entry.titleTestPhaseBCtr = matchingQuery.ctr;
          }

          const phaseACtr = entry.titleTestPhaseACtr || 0;
          const phaseBCtr = entry.titleTestPhaseBCtr || 0;

          if (phaseBCtr > phaseACtr * 1.1) {
            // Phase B wins (10%+ improvement)
            entry.titleTestWinner = entry.titleTestPhaseBTitle || '';
            logger.info(`Title A/B resolved: Phase B WINS for "${entry.keyword}" (CTR: ${(phaseACtr * 100).toFixed(1)}% → ${(phaseBCtr * 100).toFixed(1)}%)`);
          } else {
            // Phase A wins or no significant difference — revert
            entry.titleTestWinner = entry.originalTitle || entry.keyword;
            if (wpService && entry.originalTitle) {
              await wpService.updatePostTitle(entry.postId, entry.originalTitle);
            }
            logger.info(`Title A/B resolved: Phase A WINS for "${entry.keyword}" (CTR: ${(phaseACtr * 100).toFixed(1)}% vs ${(phaseBCtr * 100).toFixed(1)}%)`);
          }

          entry.titleTestResolved = true;
          resolved++;
        } catch (error) {
          logger.debug(`Title A/B resolution failed for "${entry.keyword}": ${error instanceof Error ? error.message : error}`);
        }
      }
    }

    if (tested > 0 || resolved > 0) {
      logger.info(`Title A/B testing: ${tested} started, ${resolved} resolved`);
    }

    return { tested, resolved };
  }

  /**
   * Get posts scheduled for proactive refresh based on their freshness class.
   * Seasonal: due every 60 days, evergreen: every 180 days.
   * Returns posts due for refresh with their freshness context.
   */
  static getScheduledRefreshes(
    historyEntries: PostHistoryEntry[],
    limit: number = 5,
  ): Array<PostHistoryEntry & { refreshReason: string; daysSinceRefresh: number; freshnessClass: FreshnessClass }> {
    const now = Date.now();
    const candidates: Array<PostHistoryEntry & { refreshReason: string; daysSinceRefresh: number; freshnessClass: FreshnessClass }> = [];

    for (const entry of historyEntries) {
      const lastRefresh = entry.lastRefreshedAt
        ? new Date(entry.lastRefreshedAt).getTime()
        : new Date(entry.publishedAt).getTime();
      const daysSinceRefresh = (now - lastRefresh) / (1000 * 60 * 60 * 24);

      const freshnessClass: FreshnessClass = entry.contentType
        ? (CONTENT_FRESHNESS_MAP[entry.contentType] || 'seasonal')
        : 'seasonal';
      const interval = FRESHNESS_UPDATE_INTERVALS[freshnessClass];

      if (daysSinceRefresh >= interval) {
        const overdueDays = Math.round(daysSinceRefresh - interval);
        candidates.push({
          ...entry,
          refreshReason: `${freshnessClass} content overdue by ${overdueDays} days (interval: ${interval}d)`,
          daysSinceRefresh: Math.round(daysSinceRefresh),
          freshnessClass,
        });
      }
    }

    // Sort by most overdue first
    candidates.sort((a, b) => b.daysSinceRefresh - a.daysSinceRefresh);

    if (candidates.length > 0) {
      logger.info(`Proactive refresh calendar: ${candidates.length} post(s) due for refresh`);
      for (const c of candidates.slice(0, 5)) {
        logger.info(`  - "${c.keyword}" (${c.freshnessClass}, ${c.daysSinceRefresh}d since refresh): ${c.refreshReason}`);
      }
    }

    return candidates.slice(0, limit);
  }

  /**
   * Perform a partial refresh: update specific sections of a post (stats, dates, links)
   * instead of a full rewrite. Lighter-weight than full rewrite.
   */
  async partialRefresh(
    postId: number,
    sections: ('stats' | 'dates' | 'links')[],
  ): Promise<boolean> {
    try {
      const { data: posts } = await this.api.get('/posts', {
        params: { include: postId, _fields: 'id,title,content,meta' },
      });
      const post = (posts as WPPost[])[0];
      if (!post) return false;

      let html = post.content.rendered;
      const currentYear = new Date().getFullYear();
      const previousYear = currentYear - 1;

      if (sections.includes('dates')) {
        // Update year references
        html = html.replace(new RegExp(String(previousYear), 'g'), String(currentYear));
        // Update "Updated:" date
        const dateFormatted = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
        html = html.replace(
          /(<span class="ab-updated">Updated:\s*)[^<]+/,
          `$1${dateFormatted}`,
        );
      }

      if (sections.includes('stats')) {
        // Add "Last Updated" banner if not present
        if (!html.includes('ab-what-changed')) {
          const dateFormatted = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
          const banner = `<div class="ab-what-changed"><strong>Last Updated:</strong> ${dateFormatted} — Statistics and data points refreshed.</div>`;
          const firstH2 = html.indexOf('<h2');
          if (firstH2 > 0) {
            html = html.slice(0, firstH2) + banner + '\n' + html.slice(firstH2);
          }
        }
      }

      const nowIso = new Date().toISOString();
      await this.api.post(`/posts/${postId}`, {
        content: html,
        meta: {
          _last_updated: nowIso,
          _autoblog_modified_time: nowIso,
          _rewrite_reason: `Partial refresh: ${sections.join(', ')}`,
        },
      });

      logger.info(`Partial refresh completed for post ${postId}: ${sections.join(', ')}`);
      return true;
    } catch (error) {
      logger.warn(`Partial refresh failed for post ${postId}: ${error instanceof Error ? error.message : error}`);
      return false;
    }
  }

  /**
   * Monitor and report evergreen content ratio.
   * Logs a warning if evergreen ratio drops below 70% of total content.
   * Returns { evergreenPct, seasonalPct, timeSensitivePct }.
   */
  static checkEvergreenRatio(
    historyEntries: Array<PostHistoryEntry>,
  ): { evergreenPct: number; seasonalPct: number; timeSensitivePct: number; healthy: boolean } {
    if (historyEntries.length === 0) return { evergreenPct: 100, seasonalPct: 0, timeSensitivePct: 0, healthy: true };

    const counts = { evergreen: 0, seasonal: 0, 'time-sensitive': 0 };
    for (const entry of historyEntries) {
      const freshClass = entry.contentType
        ? (CONTENT_FRESHNESS_MAP[entry.contentType] || 'seasonal')
        : 'seasonal';
      counts[freshClass]++;
    }

    const total = historyEntries.length;
    const evergreenPct = Math.round((counts.evergreen / total) * 100);
    const seasonalPct = Math.round((counts.seasonal / total) * 100);
    const timeSensitivePct = Math.round((counts['time-sensitive'] / total) * 100);
    const healthy = evergreenPct >= 50; // Target 50%+, ideal 70%

    if (!healthy) {
      logger.warn(
        `Evergreen ratio alert: ${evergreenPct}% evergreen (target: 50%+). ` +
        `Distribution: ${evergreenPct}% evergreen, ${seasonalPct}% seasonal, ${timeSensitivePct}% time-sensitive. ` +
        `Consider prioritizing how-to, deep-dive, and case-study content types.`,
      );
    } else {
      logger.info(`Evergreen ratio: ${evergreenPct}% (healthy). Distribution: ${evergreenPct}%/${seasonalPct}%/${timeSensitivePct}%`);
    }

    return { evergreenPct, seasonalPct, timeSensitivePct, healthy };
  }

  /**
   * Lightweight title+meta-only refresh for posts where position is stable/rising but CTR is declining.
   * Instead of full rewrite, only updates title, meta description, and A/B test candidates.
   * Returns number of posts refreshed.
   */
  async refreshDecliningCtrPosts(
    gscService: GSCAnalyticsService,
    seoService?: SeoService,
    limit: number = 3,
    allowedUrls?: Set<string>,
  ): Promise<number> {
    try {
      // Get page performance for CTR analysis
      const [recentPages, previousPages] = await Promise.all([
        this.fetchGscPageData(gscService, -7, -1),
        this.fetchGscPageData(gscService, -28, -8),
      ]);

      if (recentPages.length === 0 || previousPages.length === 0) {
        logger.info('CTR refresh: Insufficient GSC data, skipping');
        return 0;
      }

      const previousMap = new Map(previousPages.map(r => [r.page, r]));
      const candidates: Array<{
        page: string;
        currentPosition: number;
        previousPosition: number;
        currentCtr: number;
        previousCtr: number;
        impressions: number;
      }> = [];

      for (const recent of recentPages) {
        const prev = previousMap.get(recent.page);
        if (!prev || prev.impressions < 10) continue;

        // Filter to active-niche URLs only
        if (allowedUrls && allowedUrls.size > 0) {
          const slug = recent.page.replace(/^https?:\/\/[^/]+/, '').replace(/^\/|\/$/g, '');
          if (!allowedUrls.has(slug)) continue;
        }

        // Position stable or improving (delta <= 2 positions) but CTR dropped 30%+
        const positionDelta = recent.position - prev.position;
        const ctrDrop = prev.ctr > 0 ? (prev.ctr - recent.ctr) / prev.ctr : 0;

        if (positionDelta <= 2 && ctrDrop >= 0.3 && recent.impressions >= 10) {
          candidates.push({
            page: recent.page,
            currentPosition: recent.position,
            previousPosition: prev.position,
            currentCtr: recent.ctr,
            previousCtr: prev.ctr,
            impressions: recent.impressions,
          });
        }
      }

      if (candidates.length === 0) {
        logger.info('CTR refresh: No posts with position-stable but CTR-declining pattern found');
        return 0;
      }

      // Sort by impression volume (highest first) — biggest CTR gains
      candidates.sort((a, b) => b.impressions - a.impressions);
      logger.info(`CTR refresh: Found ${candidates.length} post(s) with stable position but declining CTR`);

      let refreshedCount = 0;
      const refreshedUrls: string[] = [];

      for (const candidate of candidates.slice(0, limit)) {
        try {
          const urlPath = new URL(candidate.page).pathname.replace(/^\/|\/$/g, '');
          if (!urlPath) continue;

          const { data: posts } = await this.api.get('/posts', {
            params: { slug: urlPath, status: 'publish', _fields: 'id,title,slug,content,link,meta' },
          });
          const post = (posts as WPPost[])[0];
          if (!post) continue;

          logger.info(`CTR refresh: Optimizing title/meta for "${post.title.rendered}" (pos ${candidate.currentPosition.toFixed(1)}, CTR ${(candidate.currentCtr * 100).toFixed(1)}% → was ${(candidate.previousCtr * 100).toFixed(1)}%)`);

          const focusKeyword = post.meta?.rank_math_focus_keyword || '';
          const currentYear = new Date().getFullYear();

          const prompt = `You are a search engine CTR optimization specialist. A blog post has stable search ranking but declining CTR — this means the title and meta description need improvement to earn more clicks.

CURRENT TITLE: ${post.title.rendered}
PRIMARY KEYWORD: ${focusKeyword}
CURRENT POSITION: ${candidate.currentPosition.toFixed(1)}
CTR: ${(candidate.currentCtr * 100).toFixed(1)}% (was ${(candidate.previousCtr * 100).toFixed(1)}%)
IMPRESSIONS: ${candidate.impressions}

Generate an improved title and meta description optimized for CTR. Also provide 2 alternative titles for A/B testing.

TITLE RULES:
- 50-65 characters (Google SERP sweet spot)
- Must contain the primary keyword or close variant
- Include a year reference (${currentYear}) for freshness
- Use power words, numbers, or brackets for CTR
- Patterns that boost CTR: [Year], numbers, "Best", "How to", brackets [Updated], parenthetical (Guide)
- AVOID: clickbait, misleading claims, "game-changer", "revolutionary"

META DESCRIPTION RULES:
- 145-158 characters exactly
- Start with the primary keyword
- Include one concrete benefit/outcome
- End with a subtle call-to-action
- Use "you"/"your" at least once

Return JSON only: {"title":"new title","metaDescription":"new meta description","titleCandidates":["alt title A","alt title B"]}`;

          const response = await this.claude.messages.create({
            model: this.model,
            max_tokens: 1000,
            temperature: 0.8,
            messages: [{ role: 'user', content: prompt }],
          });

          costTracker.addClaudeCall(this.model, response.usage?.input_tokens || 0, response.usage?.output_tokens || 0);

          const text = response.content[0].type === 'text' ? response.content[0].text : '';
          const cleaned = text.replace(/```(?:json)?\s*/g, '').replace(/```\s*$/g, '').trim();
          const jsonStart = cleaned.indexOf('{');
          const jsonEnd = cleaned.lastIndexOf('}');
          if (jsonStart === -1 || jsonEnd === -1) continue;

          const result = JSON.parse(cleaned.slice(jsonStart, jsonEnd + 1)) as {
            title: string;
            metaDescription: string;
            titleCandidates?: string[];
          };

          // Validate title length
          if (result.title.length < 30 || result.title.length > 80) {
            logger.warn(`CTR refresh: Generated title length out of range (${result.title.length}), skipping`);
            continue;
          }

          const nowIso = new Date().toISOString();
          await this.api.post(`/posts/${post.id}`, {
            title: result.title,
            excerpt: result.metaDescription,
            meta: {
              rank_math_description: result.metaDescription,
              rank_math_title: result.title,
              rank_math_facebook_title: result.title,
              rank_math_facebook_description: result.metaDescription,
              rank_math_twitter_title: result.title,
              rank_math_twitter_description: result.metaDescription,
              _autoblog_modified_time: nowIso,
              _rewrite_reason: `CTR refresh: pos ${candidate.currentPosition.toFixed(1)} stable, CTR ${(candidate.currentCtr * 100).toFixed(1)}% → was ${(candidate.previousCtr * 100).toFixed(1)}%`,
              ...(result.titleCandidates?.length ? {
                _autoblog_title_candidates: JSON.stringify(result.titleCandidates),
                _autoblog_title_test_start: nowIso,
              } : {}),
            },
          });

          refreshedCount++;
          refreshedUrls.push(post.link);
          logger.info(`CTR refresh: Title/meta updated for "${result.title}"`);
          await new Promise(r => setTimeout(r, 1500));
        } catch (error) {
          logger.warn(`CTR refresh failed for "${candidate.page}": ${error instanceof Error ? error.message : error}`);
        }
      }

      // Re-index updated posts
      if (seoService && refreshedUrls.length > 0) {
        try {
          await seoService.notifyIndexNow(refreshedUrls);
          logger.info(`CTR refresh: Submitted ${refreshedUrls.length} URL(s) for re-indexing`);
        } catch (error) {
          logger.warn(`CTR refresh re-indexing failed: ${error instanceof Error ? error.message : error}`);
        }
      }

      return refreshedCount;
    } catch (error) {
      logger.warn(`CTR refresh failed: ${error instanceof Error ? error.message : error}`);
      return 0;
    }
  }

  /** Fetch GSC page data for a date range (helper for CTR refresh) */
  private async fetchGscPageData(
    gscService: GSCAnalyticsService,
    startDaysOffset: number,
    endDaysOffset: number,
  ): Promise<Array<{ page: string; clicks: number; impressions: number; ctr: number; position: number }>> {
    try {
      // Use public getPagePerformance for recent data
      if (startDaysOffset === -7 && endDaysOffset === -1) {
        return gscService.getPagePerformance(100);
      }
      // For previous period, use getDecliningPages data indirectly or fall back to page performance
      return gscService.getPagePerformance(100);
    } catch {
      return [];
    }
  }

  private async rewriteContent(
    post: WPPost,
    perf: { pageviews: number; bounceRate: number; avgEngagementTime: number },
  ): Promise<{ title: string; html: string; excerpt: string } | null> {
    const existingContent = post.content.rendered.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const wordCount = existingContent.split(/\s+/).length;

    // Send up to 30000 chars for full context awareness (Claude handles it fine)
    const contentPreview = existingContent.slice(0, 30000);
    const isTruncated = existingContent.length > 30000;

    // Extract primary keyword from Rank Math meta if available
    const focusKeyword = post.meta?.rank_math_focus_keyword || '';

    const currentYear = new Date().getFullYear();
    const dateFormatted = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    const monthYear = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

    // Detect niche from title and content for context-aware rewrite instructions
    const titleAndContent = (post.title.rendered + ' ' + contentPreview).toLowerCase();
    const isMarketAnalysis = ['kospi', 'kosdaq', '시장분석', 'fomc', 'bok', '금리', '환율', 'vix', 'gdp'].some(t => titleAndContent.includes(t));
    const isSectorAnalysis = ['반도체', '2차전지', '배터리', '전기차', '바이오', '방산', '조선', '섹터', '업종분석'].some(t => titleAndContent.includes(t));
    const isThemeAnalysis = ['테마주', '테마분석', 'ai 관련주', '로봇', '수소', '우주', 'smr'].some(t => titleAndContent.includes(t));
    const isStockPick = ['종목분석', 'rsi', 'macd', '볼린저', '기술적 분석', '워치리스트', '수급'].some(t => titleAndContent.includes(t));

    const nicheRewriteRules = isMarketAnalysis ? `
NICHE-SPECIFIC RULES — 시장분석:
- Update KOSPI/KOSDAQ index levels and percentage changes with "as of [Month Year]" qualifier
- Cite recent FOMC or BOK rate decisions with exact dates and basis point changes
- Include exchange rate (USD/KRW) context where relevant
- Reference institutional net buy/sell data from KRX statistics
- Cite sources: BOK (bok.or.kr), KRX, KOSIS, DART for credibility` : isSectorAnalysis ? `
NICHE-SPECIFIC RULES — 업종분석:
- Update individual stock price levels with "as of [Month Year]" qualifier
- Include consensus target price and analyst ratings where available
- Update Q/Q and Y/Y earnings data (EPS, revenue) with latest quarterly results
- Note any recent material events: earnings beat/miss, product launches, partnerships
- Cite sources: DART disclosures, Bloomberg, Naver Finance` : isThemeAnalysis ? `
NICHE-SPECIFIC RULES — 테마분석:
- Update related stock list with current market cap and YTD performance
- Check if any theme stocks have been added/removed from major indices
- Reference policy developments or industry events that support the theme
- Add risk factors: theme stocks carry higher volatility than blue chips
- Cite sources: industry reports, MSIT, government policy announcements` : isStockPick ? `
NICHE-SPECIFIC RULES — 종목분석:
- Update technical indicator readings (RSI, MACD) — these change daily; note data date
- Refresh watchlist with current price action context
- Note any DART disclosures since original publish date that affect the analysis
- Emphasize that technical analysis is for reference only, not investment advice
- Add investment disclaimer if missing` : '';


    const prompt = `You are rewriting an underperforming blog post to improve reader engagement and reduce bounce rate. The post exists at ${post.link} and must keep its URL/slug unchanged.

CURRENT TITLE: ${post.title.rendered}
${focusKeyword ? `PRIMARY KEYWORD: ${focusKeyword}\n` : ''}CURRENT WORD COUNT: ${wordCount}
CURRENT CONTENT (plain text): ${contentPreview}${isTruncated ? '...' : ''}

PERFORMANCE DATA: ${perf.pageviews} views, ${(perf.bounceRate * 100).toFixed(0)}% bounce rate, ${perf.avgEngagementTime.toFixed(0)}s avg engagement
${nicheRewriteRules}
REWRITE RULES:
1. Keep the same topic and primary keyword
2. Add a much stronger opening hook — start with a surprising stat, bold claim, or provocative question. NEVER start with "In today's..." or "In this guide..."
3. CRITICAL READABILITY: Every paragraph MUST be 3-4 sentences MAX. Break ALL long paragraphs ruthlessly. Mix short punchy sentences (5-8 words) with longer ones (20-30 words). Include at least 2 sentence fragments for natural rhythm.
4. Add more subheadings (H2/H3) every 200-300 words — EACH section must start with a self-contained answer sentence
5. Include more specific data points and Korean market context — target 3+ data points per 500 words (numbers, percentages, dates, rankings)
6. Add a compelling FAQ section (3-5 questions) if missing
7. Target 2,500+ words
7b. MANDATORY: Include at least 2 <cite data-source="KEY" data-topic="TOPIC"> external source citations for E-E-A-T scoring
7c. NEVER repeat the same sentence-opening pattern more than twice in the entire article. Vary sentence structure aggressively.
8. Use the same inline CSS styling as the original
9. Include "Last Updated: ${dateFormatted}" banner at top
10. Add a "What Changed in This Update" section right after the Last Updated banner using this format:
    <div class="ab-what-changed" style="margin:0 0 24px 0; padding:16px 20px; background:#f0fff4; border:1px solid #c6f6d5; border-radius:8px; font-size:14px; color:#555; line-height:1.6;">
    <strong>What Changed in This Update (${monthYear}):</strong>
    <ul style="margin:8px 0 0 0; padding-left:20px;">
    <li>Updated data and statistics for ${currentYear}</li>
    <li>Improved analysis with latest market insights</li>
    <li>Enhanced readability and structure</li>
    </ul></div>
11. Write a CTR-optimized meta description: [Benefit] + [Primary Keyword] + [Call-to-Action], 145-158 chars
12. TITLE UPDATE RULES (freshness signal for CTR):
    - If the title does NOT contain a year, append "(${currentYear} Guide)" or "(Updated ${currentYear})" — pick what fits naturally
    - If the title contains an older year (e.g., 2024, 2025), replace it with ${currentYear}
    - If the title already contains ${currentYear}, keep it as-is
    - Keep the title 50-65 characters (SERP sweet spot)
13. EXCERPT/META DESCRIPTION update: Must reference "${currentYear}" or "latest" for freshness signal
14. AFFILIATE LINK RENEWAL: Check all product links, affiliate links (rel="sponsored"), and external URLs in the content.
    - If any link text references an old year (e.g., "2024 model", "2025 edition"), update the text to ${currentYear}
    - If any product name includes discontinued models, keep the link but note "(discontinued)" and suggest current alternatives
    - Ensure all rel="sponsored" and data-affiliate="true" attributes are preserved on affiliate links

Return JSON: {"title":"improved title","html":"full HTML content","excerpt":"compelling 145-158 char meta description"}
Return pure JSON only. No markdown.`;

    try {
      // Use streaming to avoid Anthropic SDK timeout for long-running requests
      const stream = this.claude.messages.stream({
        model: this.model,
        max_tokens: 32000,
        temperature: 0.7,
        messages: [{ role: 'user', content: prompt }],
      });
      const response = await stream.finalMessage();

      costTracker.addClaudeCall(this.model, response.usage?.input_tokens || 0, response.usage?.output_tokens || 0);

      const text = response.content[0].type === 'text' ? response.content[0].text : '';
      const cleaned = text.replace(/```(?:json)?\s*/g, '').replace(/```\s*$/g, '').trim();

      const startIdx = cleaned.indexOf('{');
      if (startIdx === -1) return null;

      let depth = 0;
      let endIdx = -1;
      for (let i = startIdx; i < cleaned.length; i++) {
        const ch = cleaned[i];
        if (ch === '\\') { i++; continue; }
        if (ch === '"') { i++; while (i < cleaned.length && cleaned[i] !== '"') { if (cleaned[i] === '\\') i++; i++; } continue; }
        if (ch === '{') depth++;
        if (ch === '}') { depth--; if (depth === 0) { endIdx = i; break; } }
      }

      if (endIdx === -1) return null;
      const rawJson = cleaned.slice(startIdx, endIdx + 1);
      let result: { title: string; html: string; excerpt: string };
      try {
        result = JSON.parse(rawJson);
      } catch {
        // JSON parse failed — try jsonrepair for malformed Claude output
        const { jsonrepair } = await import('jsonrepair');
        result = JSON.parse(jsonrepair(rawJson));
      }

      const newWordCount = result.html.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;
      if (newWordCount < 2000) {
        logger.warn(`Auto-rewrite too short (${newWordCount} words, min 2000), skipping`);
        return null;
      }

      // Ensure "Last Updated" visible banner is present for content freshness signal
      if (!result.html.includes('Last Updated:') && !result.html.includes('ab-last-updated')) {
        const updatedBanner = `<div class="ab-last-updated" style="margin:0 0 20px 0; padding:10px 16px; background:#f8f9fa; border-left:3px solid #0066CC; border-radius:0 6px 6px 0; font-size:13px; color:#666;"><strong>Last Updated:</strong> ${dateFormatted}</div>`;
        result.html = updatedBanner + result.html;
      }

      // Quality gate: validate rewritten content before accepting
      const score = validateContent(
        result.html, result.title, result.excerpt,
        post.title.rendered, 'analysis', this.wpUrl,
      );
      logContentScore(score, result.title);
      if (score.total < 55) {
        logger.warn(`Auto-rewrite quality too low (${score.total}/100, min 55), skipping`);
        return null;
      }

      return result;
    } catch (error) {
      logger.warn(`Claude rewrite failed: ${error instanceof Error ? error.message : error}`);
      return null;
    }
  }

  /**
   * Partial content refresh: update only data tables, prices, and year references
   * WITHOUT rewriting the entire article. Much cheaper (smaller Claude call) and
   * preserves the original writing voice. Ideal for evergreen posts with stale data.
   * Returns number of posts partially refreshed.
   */
  async partialRefreshDataSections(
    freshnessData: Array<PostHistoryEntry & { freshnessScore: number }>,
    seoService?: SeoService,
    limit: number = 3,
  ): Promise<number> {
    const currentYear = new Date().getFullYear();
    const previousYear = currentYear - 1;
    const monthYear = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

    // Target: posts with freshnessScore 20-60 (stale but not bad enough for full rewrite)
    const candidates = freshnessData
      .filter(entry => entry.freshnessScore >= 20 && entry.freshnessScore < 60 && entry.postUrl)
      .sort((a, b) => a.freshnessScore - b.freshnessScore)
      .slice(0, limit);

    if (candidates.length === 0) {
      logger.info('Partial refresh: No candidates in 20-60 freshness range');
      return 0;
    }

    logger.info(`Partial refresh: ${candidates.length} candidate(s) for data section update`);
    let refreshedCount = 0;
    const refreshedUrls: string[] = [];

    for (const entry of candidates) {
      const slug = new URL(entry.postUrl).pathname.replace(/^\/|\/$/g, '');
      if (!slug) continue;

      try {
        const { data: posts } = await this.api.get('/posts', {
          params: { slug, status: 'publish', _fields: 'id,title,slug,content,link,date,meta' },
        });
        const post = (posts as WPPost[])[0];
        if (!post) continue;

        const content = post.content.rendered;

        // Detect what needs updating
        const hasTables = /<table[\s>]/i.test(content);
        const hasOldYear = content.includes(String(previousYear));
        const hasPrices = /\$[\d,]+|\₩[\d,]+|KRW\s*[\d,]+|USD\s*[\d,]+/i.test(content);

        if (!hasTables && !hasOldYear && !hasPrices) {
          logger.debug(`Partial refresh: "${post.title.rendered}" has no updatable sections, skipping`);
          continue;
        }

        // Extract only the sections needing update (tables + surrounding context)
        const sectionsToUpdate: string[] = [];
        if (hasTables) {
          const tableMatches = content.match(/<table[\s\S]*?<\/table>/gi) || [];
          sectionsToUpdate.push(...tableMatches.map(t => t.slice(0, 2000)));
        }
        if (hasOldYear) sectionsToUpdate.push(`Contains references to ${previousYear} that need updating to ${currentYear}`);
        if (hasPrices) sectionsToUpdate.push('Contains price/cost data that may be outdated');

        const focusKeyword = post.meta?.rank_math_focus_keyword || '';

        const prompt = `You are updating SPECIFIC DATA SECTIONS of a blog post — NOT rewriting the entire article.
The post is about: "${post.title.rendered}"${focusKeyword ? ` (keyword: "${focusKeyword}")` : ''}

SECTIONS NEEDING UPDATE:
${sectionsToUpdate.join('\n---\n')}

RULES:
1. Update year references from ${previousYear} to ${currentYear}
2. Update any price/cost data to reflect ${currentYear} estimates (add 2-5% inflation adjustment if exact data unknown)
3. If tables exist, regenerate them with current ${currentYear} data and add any missing entries
4. Keep ALL existing HTML structure and CSS classes identical
5. Do NOT rewrite prose sections — only update factual data points
6. If a statistic mentions a specific source, keep the source reference

Return JSON: {
  "yearReplacements": [{"old": "text with ${previousYear}", "new": "text with ${currentYear}"}],
  "tableReplacements": [{"old": "old table HTML (first 100 chars for matching)", "new": "updated table HTML"}],
  "priceReplacements": [{"old": "old price text", "new": "updated price text"}],
  "whatChanged": ["bullet point 1", "bullet point 2"]
}
Return pure JSON only.`;

        const response = await this.claude.messages.create({
          model: this.model,
          max_tokens: 4000,
          temperature: 0.3,
          messages: [{ role: 'user', content: prompt }],
        });

        costTracker.addClaudeCall(this.model, response.usage?.input_tokens || 0, response.usage?.output_tokens || 0);

        const text = response.content[0].type === 'text' ? response.content[0].text : '';
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) continue;

        const { jsonrepair } = await import('jsonrepair');
        const updates = JSON.parse(jsonrepair(jsonMatch[0])) as {
          yearReplacements?: Array<{ old: string; new: string }>;
          tableReplacements?: Array<{ old: string; new: string }>;
          priceReplacements?: Array<{ old: string; new: string }>;
          whatChanged?: string[];
        };

        let updatedContent = content;
        let changeCount = 0;

        // Apply year replacements
        if (updates.yearReplacements) {
          for (const r of updates.yearReplacements) {
            if (updatedContent.includes(r.old)) {
              updatedContent = updatedContent.replace(r.old, r.new);
              changeCount++;
            }
          }
        }

        // Apply simple year swap as fallback
        if (hasOldYear && changeCount === 0) {
          updatedContent = updatedContent.replace(new RegExp(String(previousYear), 'g'), String(currentYear));
          changeCount++;
        }

        // Apply table replacements (match by first 100 chars)
        if (updates.tableReplacements) {
          for (const r of updates.tableReplacements) {
            const matchKey = r.old.slice(0, 100);
            const tableIdx = updatedContent.indexOf(matchKey);
            if (tableIdx !== -1) {
              const tableEnd = updatedContent.indexOf('</table>', tableIdx);
              if (tableEnd !== -1) {
                updatedContent = updatedContent.slice(0, tableIdx) + r.new + updatedContent.slice(tableEnd + '</table>'.length);
                changeCount++;
              }
            }
          }
        }

        // Apply price replacements
        if (updates.priceReplacements) {
          for (const r of updates.priceReplacements) {
            if (updatedContent.includes(r.old)) {
              updatedContent = updatedContent.replace(r.old, r.new);
              changeCount++;
            }
          }
        }

        if (changeCount === 0) {
          logger.debug(`Partial refresh: No applicable changes for "${post.title.rendered}"`);
          continue;
        }

        // Update "What Changed" section if present, or add one
        const whatChangedBullets = (updates.whatChanged || [`Updated data and statistics for ${currentYear}`])
          .map(b => `<li>${b}</li>`).join('\n');
        const whatChangedHtml = `<div class="ab-what-changed" style="margin:0 0 24px 0; padding:16px 20px; background:#f0fff4; border:1px solid #c6f6d5; border-radius:8px; font-size:14px; color:#555; line-height:1.6;">` +
          `<strong>What Changed in This Update (${monthYear}):</strong>` +
          `<ul style="margin:8px 0 0 0; padding-left:20px;">${whatChangedBullets}</ul></div>`;

        // Replace existing what-changed or insert after Last Updated banner
        if (updatedContent.includes('ab-what-changed')) {
          updatedContent = updatedContent.replace(
            /<div class="ab-what-changed"[\s\S]*?<\/div>/i,
            whatChangedHtml,
          );
        } else {
          const lastUpdatedEnd = updatedContent.indexOf('</div>', updatedContent.indexOf('Last Updated:'));
          if (lastUpdatedEnd !== -1) {
            const insertPos = lastUpdatedEnd + '</div>'.length;
            updatedContent = updatedContent.slice(0, insertPos) + '\n' + whatChangedHtml + '\n' + updatedContent.slice(insertPos);
          }
        }

        // Update Last Updated date
        const dateFormatted = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
        updatedContent = updatedContent.replace(
          /(<strong>Last Updated:<\/strong>\s*)[\w\s,]+/,
          `$1${dateFormatted}`,
        );

        const nowIso = new Date().toISOString();
        await this.api.post(`/posts/${post.id}`, {
          content: updatedContent,
          meta: {
            _last_updated: nowIso,
            _autoblog_modified_time: nowIso,
            _rewrite_reason: `Partial refresh: ${changeCount} data section(s) updated for ${currentYear}`,
          },
        });

        refreshedCount++;
        refreshedUrls.push(post.link);
        logger.info(`Partial refresh: ${changeCount} section(s) updated in "${post.title.rendered}"`);
        await new Promise(r => setTimeout(r, 1500));
      } catch (error) {
        logger.warn(`Partial refresh failed for "${slug}": ${error instanceof Error ? error.message : error}`);
      }
    }

    if (seoService && refreshedUrls.length > 0) {
      try {
        await seoService.notifyIndexNow(refreshedUrls);
        logger.info(`Partial refresh: Submitted ${refreshedUrls.length} URL(s) for re-indexing`);
      } catch (error) {
        logger.warn(`Partial refresh re-indexing failed: ${error instanceof Error ? error.message : error}`);
      }
    }

    return refreshedCount;
  }

  /**
   * Content lifecycle: noindex stale time-sensitive content.
   * Marks old news-explainer posts (>6 months) as noindex to protect crawl budget.
   * Returns number of posts noindexed.
   */
  async noindexStaleContent(
    historyEntries: Array<PostHistoryEntry>,
    maxAge: number = 180, // days
  ): Promise<number> {
    const now = Date.now();
    const stalePosts = historyEntries.filter(entry => {
      if (!entry.contentType || !entry.publishedAt) return false;
      const freshClass = CONTENT_FRESHNESS_MAP[entry.contentType];
      if (freshClass !== 'time-sensitive') return false;
      const ageMs = now - new Date(entry.publishedAt).getTime();
      const ageDays = ageMs / (24 * 60 * 60 * 1000);
      return ageDays > maxAge;
    });

    if (stalePosts.length === 0) return 0;

    let noindexed = 0;
    for (const post of stalePosts.slice(0, 5)) {
      if (!post.postId) continue;
      try {
        // Set noindex via Rank Math meta or WordPress post meta
        await this.api.post(`/posts/${post.postId}`, {
          meta: {
            rank_math_robots: 'noindex',
            _autoblog_noindexed: 'true',
            _autoblog_noindex_reason: `Stale time-sensitive content (published ${post.publishedAt})`,
          },
        });
        noindexed++;
        logger.info(`Noindexed stale post: "${post.keyword}" (ID ${post.postId}, published ${post.publishedAt})`);
      } catch (error) {
        logger.debug(`Failed to noindex post ${post.postId}: ${error instanceof Error ? error.message : error}`);
      }
    }

    if (noindexed > 0) {
      logger.info(`Content lifecycle: Noindexed ${noindexed} stale time-sensitive post(s) (>${maxAge} days old)`);
    }
    return noindexed;
  }

  /**
   * Content lifecycle: detect posts that should be merged.
   * Finds pairs of posts with high keyword overlap that compete with each other.
   * Returns merge candidates for manual review (doesn't auto-merge).
   */
  static detectMergeCandidates(
    historyEntries: Array<PostHistoryEntry>,
  ): Array<{ postA: PostHistoryEntry; postB: PostHistoryEntry; similarity: number; recommendation: string }> {
    const candidates: Array<{ postA: PostHistoryEntry; postB: PostHistoryEntry; similarity: number; recommendation: string }> = [];

    for (let i = 0; i < historyEntries.length; i++) {
      for (let j = i + 1; j < historyEntries.length; j++) {
        const a = historyEntries[i];
        const b = historyEntries[j];
        if (!a.keyword || !b.keyword) continue;
        if (a.niche !== b.niche) continue;

        // Word-level similarity
        const wordsA = new Set(a.keyword.toLowerCase().split(/\s+/).filter(w => w.length > 3));
        const wordsB = new Set(b.keyword.toLowerCase().split(/\s+/).filter(w => w.length > 3));
        if (wordsA.size === 0 || wordsB.size === 0) continue;

        const intersection = [...wordsA].filter(w => wordsB.has(w)).length;
        const union = new Set([...wordsA, ...wordsB]).size;
        const similarity = union > 0 ? intersection / union : 0;

        if (similarity >= 0.6) {
          // Determine which post is weaker (lower engagement or older)
          const aScore = a.engagementScore ?? 0;
          const bScore = b.engagementScore ?? 0;
          const stronger = aScore >= bScore ? a : b;
          const weaker = aScore >= bScore ? b : a;

          candidates.push({
            postA: stronger,
            postB: weaker,
            similarity,
            recommendation: `Merge "${weaker.keyword}" into "${stronger.keyword}" (${(similarity * 100).toFixed(0)}% overlap). ` +
              `Redirect ${weaker.postUrl} → ${stronger.postUrl}`,
          });
        }
      }
    }

    candidates.sort((a, b) => b.similarity - a.similarity);

    if (candidates.length > 0) {
      logger.info(`=== Content Merge Candidates: ${candidates.length} pair(s) ===`);
      for (const c of candidates.slice(0, 5)) {
        logger.info(`  [${(c.similarity * 100).toFixed(0)}%] ${c.recommendation}`);
      }
    }

    return candidates.slice(0, 10);
  }

  /**
   * Content Pruning: auto-archive (draft + noindex) posts with near-zero engagement.
   * Criteria:
   *   - Published > 6 months ago
   *   - Time-sensitive content type (news-explainer) older than 6 months
   *   - Engagement score < 5 (near-zero pageviews, high bounce, low time-on-page)
   *   - No GSC impressions (no organic search value)
   *
   * Pruning improves crawl budget allocation and prevents thin/stale content
   * from diluting site quality signals (Google HCU).
   *
   * @param maxPrune Maximum posts to prune per batch (safety limit)
   * @returns Number of pruned posts
   */
  async pruneStaleContent(
    historyEntries: PostHistoryEntry[],
    ga4Service?: GA4AnalyticsService,
    gscService?: GSCAnalyticsService,
    maxPrune: number = 3,
  ): Promise<number> {
    const SIX_MONTHS_MS = 180 * 24 * 60 * 60 * 1000;
    const now = Date.now();
    let prunedCount = 0;

    // 1. Find old time-sensitive posts with low engagement
    const candidates = historyEntries.filter(entry => {
      if (!entry.publishedAt || !entry.postId) return false;
      const age = now - new Date(entry.publishedAt).getTime();
      if (age < SIX_MONTHS_MS) return false;

      // Time-sensitive content (news-explainer) is the primary prune target
      const isTimeSensitive = entry.contentType === 'news-explainer';
      // Very low engagement score
      const isLowEngagement = (entry.engagementScore ?? 0) < 5;
      // No ranking history or last position is very bad
      const isNoRanking = !entry.lastPosition || entry.lastPosition > 50;
      // CTR < 1% AND ranking position > 30 (deep pages with no click potential)
      const lastRanking = entry.rankingHistory?.slice(-1)[0];
      const isLowCtrDeepRank = lastRanking &&
        lastRanking.impressions > 0 &&
        (lastRanking.clicks / lastRanking.impressions) < 0.01 &&
        entry.lastPosition && entry.lastPosition > 30;

      return (isTimeSensitive && isLowEngagement) || (isLowEngagement && isNoRanking) || isLowCtrDeepRank;
    });

    if (candidates.length === 0) {
      logger.debug('Content pruning: no stale posts to archive');
      return 0;
    }

    // 2. Verify with GSC — skip posts that still get impressions
    let impressionMap = new Map<string, number>();
    if (gscService) {
      try {
        const pages = await gscService.getPagePerformance(200);
        for (const p of pages) {
          impressionMap.set(p.page, p.impressions);
        }
      } catch {
        logger.debug('Content pruning: GSC data unavailable, using history data only');
      }
    }

    // 3. Sort by lowest engagement first
    const sortedCandidates = candidates
      .filter(entry => {
        // Skip if post still gets GSC impressions
        if (entry.postUrl && impressionMap.size > 0) {
          const impressions = impressionMap.get(entry.postUrl) ?? 0;
          if (impressions > 10) return false; // Still has search value
        }
        return true;
      })
      .sort((a, b) => (a.engagementScore ?? 0) - (b.engagementScore ?? 0))
      .slice(0, maxPrune);

    if (sortedCandidates.length === 0) {
      logger.debug('Content pruning: all candidates still have search impressions, skipping');
      return 0;
    }

    logger.info(`=== Content Pruning: ${sortedCandidates.length} post(s) to archive ===`);

    for (const entry of sortedCandidates) {
      try {
        // Find best redirect target: related post in same niche with highest engagement
        let redirectUrl: string | undefined;
        const sameNichePosts = historyEntries.filter(e =>
          e.niche === entry.niche && e.postId !== entry.postId &&
          (e.engagementScore ?? 0) > 10 && e.postUrl,
        );
        if (sameNichePosts.length > 0) {
          const bestTarget = sameNichePosts.sort((a, b) =>
            (b.engagementScore ?? 0) - (a.engagementScore ?? 0),
          )[0];
          redirectUrl = bestTarget.postUrl;
        }

        // Set to draft (unpublish) + optional 301 redirect to better content
        const metaUpdate: Record<string, string> = {
          rank_math_robots: 'noindex',
          _autoblog_pruned: new Date().toISOString(),
          _autoblog_prune_reason: `Low engagement (score: ${entry.engagementScore ?? 0}), ` +
            `age: ${Math.round((now - new Date(entry.publishedAt!).getTime()) / (24 * 60 * 60 * 1000))}d, ` +
            `type: ${entry.contentType || 'unknown'}`,
        };
        if (redirectUrl) {
          metaUpdate.rank_math_redirection_url_to = redirectUrl;
          metaUpdate.rank_math_redirection_header_code = '301';
        }
        await this.api.post(`/posts/${entry.postId}`, { status: 'draft', meta: metaUpdate });

        logger.info(
          `Pruned: "${entry.keyword}" (ID=${entry.postId}, engagement=${entry.engagementScore ?? 0}, ` +
          `type=${entry.contentType || 'unknown'}, age=${Math.round((now - new Date(entry.publishedAt!).getTime()) / (24 * 60 * 60 * 1000))}d)`,
        );
        prunedCount++;
      } catch (error) {
        logger.warn(`Failed to prune post ID=${entry.postId}: ${error instanceof Error ? error.message : error}`);
      }
    }

    if (prunedCount > 0) {
      logger.info(`Content pruning complete: ${prunedCount} post(s) archived (set to draft + noindex)`);
    }

    return prunedCount;
  }

  /**
   * Periodic broken external link checker.
   * Scans published posts for external links and HEAD-checks them.
   * Removes broken links (keeps anchor text) and logs results.
   * Run weekly to prevent 404 link accumulation.
   */
  async checkBrokenExternalLinks(limit: number = 30): Promise<{ checked: number; broken: number; fixed: number }> {
    let checked = 0;
    let broken = 0;
    let fixed = 0;

    try {
      const { data: posts } = await this.api.get('/posts', {
        params: { per_page: limit, status: 'publish', _fields: 'id,content,title', orderby: 'modified', order: 'asc' },
      });

      if (!Array.isArray(posts) || posts.length === 0) {
        logger.info('Broken link check: no posts to scan');
        return { checked: 0, broken: 0, fixed: 0 };
      }

      for (const post of posts as Array<{ id: number; content: { rendered: string }; title: { rendered: string } }>) {
        const content = post.content?.rendered || '';
        const extLinkRegex = /<a\s+[^>]*href="(https?:\/\/[^"]+)"[^>]*target="_blank"[^>]*>(.*?)<\/a>/gi;
        const links: Array<{ full: string; url: string; text: string }> = [];
        let match;
        while ((match = extLinkRegex.exec(content)) !== null) {
          links.push({ full: match[0], url: match[1], text: match[2] });
        }

        if (links.length === 0) continue;

        let updatedContent = content;
        let postFixed = false;

        // Domains that block bot HEAD/GET requests (false positives)
        const BOT_BLOCKED_DOMAINS = ['amazon.com', 'amazon.co', 'kocca.kr', 'instagram.com', 'facebook.com', 'tiktok.com', 'bloomberg.com', 'dart.fss.or.kr', 'reuters.com', 'ft.com', 'wsj.com', 'nytimes.com', 'krx.co.kr', 'linkedin.com'];
        for (const link of links) {
          checked++;
          try {
            const linkHost = new URL(link.url).hostname;
            if (BOT_BLOCKED_DOMAINS.some(d => linkHost.includes(d))) continue;
            const headResp = await axios.head(link.url, {
              timeout: 5000, maxRedirects: 3, validateStatus: () => true,
              headers: { 'User-Agent': 'Mozilla/5.0 (compatible; TrendHuntBot/1.0; +https://trendhunt.net)' },
            });
            // Retry with GET for HEAD-blocking servers (403/405/503)
            if ([403, 405, 503].includes(headResp.status)) {
              const getResp = await axios.get(link.url, {
                timeout: 5000, maxRedirects: 3, validateStatus: () => true,
                headers: { 'User-Agent': 'Mozilla/5.0 (compatible; TrendHuntBot/1.0; +https://trendhunt.net)' },
                maxContentLength: 50000,
              });
              if (getResp.status >= 400 && ![403, 503].includes(getResp.status)) {
                updatedContent = updatedContent.replace(link.full, link.text);
                broken++;
                postFixed = true;
                logger.warn(`Broken link removed from "${post.title.rendered.slice(0, 40)}...": ${link.url} (${getResp.status})`);
              }
            } else if (headResp.status >= 400) {
              updatedContent = updatedContent.replace(link.full, link.text);
              broken++;
              postFixed = true;
              logger.warn(`Broken link removed from "${post.title.rendered.slice(0, 40)}...": ${link.url} (${headResp.status})`);
            }
          } catch {
            // Timeout/network errors = likely valid, skip
          }
        }

        if (postFixed) {
          try {
            await this.api.post(`/posts/${post.id}`, { content: updatedContent });
            fixed++;
          } catch {
            logger.warn(`Failed to update post ${post.id} after broken link removal`);
          }
        }
      }
    } catch (error) {
      logger.warn(`Broken link check failed: ${error instanceof Error ? error.message : error}`);
    }

    if (broken > 0) {
      logger.info(`Broken link check: scanned ${checked} links, found ${broken} broken, fixed ${fixed} post(s)`);
    } else {
      logger.info(`Broken link check: scanned ${checked} links, all healthy`);
    }

    return { checked, broken, fixed };
  }

  /**
   * Public wrapper for rewriteContent — used by manual rewrite script.
   */
  async rewriteSinglePost(
    post: WPPost,
    perf?: { pageviews: number; bounceRate: number; avgEngagementTime: number },
  ): Promise<{ title: string; html: string; excerpt: string } | null> {
    return this.rewriteContent(post, perf ?? { pageviews: 0, bounceRate: 1.0, avgEngagementTime: 0 });
  }

  /**
   * Fix broken internal links (404 self-referencing URLs and hallucinated category/guide pages).
   * Strips <a> tags but keeps anchor text for internal links returning 404.
   * Also removes hallucinated /category/ and /guide-.../ URLs that don't exist.
   */
  async fixBrokenInternalLinks(limit: number = 50): Promise<{ checked: number; broken: number; fixed: number }> {
    let checked = 0;
    let broken = 0;
    let fixed = 0;

    try {
      const { data: posts } = await this.api.get('/posts', {
        params: { per_page: limit, status: 'publish', _fields: 'id,content,title', orderby: 'modified', order: 'asc' },
      });

      if (!Array.isArray(posts) || posts.length === 0) return { checked: 0, broken: 0, fixed: 0 };

      // Build a set of all valid internal URLs for fast lookup
      const { data: allPosts } = await this.api.get('/posts', {
        params: { per_page: 100, status: 'publish', _fields: 'link,slug' },
      });
      const validSlugs = new Set(
        (allPosts as Array<{ link: string; slug: string }>).map(p => `/${p.slug}/`),
      );

      const siteHost = new URL(this.wpUrl).hostname;

      for (const post of posts as Array<{ id: number; content: { rendered: string }; title: { rendered: string } }>) {
        const content = post.content?.rendered || '';
        // Match internal links (same domain, no target="_blank")
        const internalLinkRegex = new RegExp(
          `<a\\s+[^>]*href="(https?://[^"]*${siteHost.replace(/\./g, '\\.')}[^"]*)"[^>]*>(.*?)</a>`,
          'gi',
        );
        const links: Array<{ full: string; url: string; text: string; path: string }> = [];
        let match;
        while ((match = internalLinkRegex.exec(content)) !== null) {
          try {
            const urlObj = new URL(match[1]);
            links.push({ full: match[0], url: match[1], text: match[2], path: urlObj.pathname });
          } catch { /* invalid URL, skip */ }
        }

        if (links.length === 0) continue;

        let updatedContent = content;
        let postFixed = false;

        for (const link of links) {
          checked++;
          // Check for hallucinated category/guide/author pages
          const isHallucinatedPage = /^\/(category|guide-|author|tag)\//i.test(link.path);
          // Check if path matches a known post slug
          const normalizedPath = link.path.endsWith('/') ? link.path : `${link.path}/`;
          const isKnownPost = validSlugs.has(normalizedPath) || normalizedPath === '/';

          if (isHallucinatedPage || !isKnownPost) {
            // Verify it's actually 404 by checking (skip hallucinated pages — they're always broken)
            if (isHallucinatedPage) {
              updatedContent = updatedContent.replace(link.full, link.text);
              broken++;
              postFixed = true;
              logger.warn(`Broken internal link removed from "${post.title.rendered.slice(0, 50)}": ${link.path} (hallucinated page)`);
            } else {
              // HEAD check to confirm 404
              try {
                const resp = await axios.head(link.url, { timeout: 5000, validateStatus: () => true });
                if (resp.status === 404) {
                  updatedContent = updatedContent.replace(link.full, link.text);
                  broken++;
                  postFixed = true;
                  logger.warn(`Broken internal link removed from "${post.title.rendered.slice(0, 50)}": ${link.path} (404)`);
                }
              } catch { /* network error, skip */ }
            }
          }
        }

        if (postFixed) {
          try {
            await this.api.post(`/posts/${post.id}`, { content: updatedContent });
            fixed++;
          } catch {
            logger.warn(`Failed to update post ${post.id} after internal link fix`);
          }
        }
      }
    } catch (error) {
      logger.warn(`Internal link fix failed: ${error instanceof Error ? error.message : error}`);
    }

    if (broken > 0) {
      logger.info(`Internal link fix: checked ${checked}, found ${broken} broken, fixed ${fixed} post(s)`);
    }

    return { checked, broken, fixed };
  }

  /**
   * Optimize existing posts for Featured Snippet capture.
   * Targets queries at positions 2-10 with 20+ impressions from GSC data.
   * Inserts optimized content structures based on snippet type:
   * - paragraph: 40-60 word concise answer in <div class="ab-snippet">
   * - list: restructures content into <ol>/<ul> format
   * - table: reformats comparison data into <table>
   * Max 2 posts per batch.
   */
  async optimizeForFeaturedSnippets(
    gscService: GSCAnalyticsService,
    seoService?: SeoService,
    limit: number = 2,
  ): Promise<number> {
    try {
      const opportunities = await gscService.getFeaturedSnippetOpportunities();
      if (opportunities.length === 0) {
        logger.info('Featured snippet optimization: No opportunities found');
        return 0;
      }

      // Filter: position 2-10, 20+ impressions
      const targets = opportunities
        .filter(o => o.position >= 2 && o.position <= 10 && o.impressions >= 20)
        .slice(0, limit);

      if (targets.length === 0) {
        logger.info('Featured snippet optimization: No qualifying opportunities (need pos 2-10, 20+ imp)');
        return 0;
      }

      let optimized = 0;
      const optimizedUrls: string[] = [];

      for (const target of targets) {
        try {
          // Use the page URL that actually ranks for this specific query
          const slug = new URL(target.page).pathname.replace(/^\/|\/$/g, '');
          if (!slug) continue;

          const { data: posts } = await this.api.get('/posts', {
            params: { slug, status: 'publish', _fields: 'id,title,content,link,meta' },
          });
          const post = (posts as WPPost[])[0];
          if (!post) continue;

          let content = post.content.rendered;
          const focusKeyword = post.meta?.rank_math_focus_keyword || target.query;

          logger.info(`Featured snippet: Optimizing "${post.title.rendered}" for "${target.query}" (pos ${target.position.toFixed(1)}, type: ${target.snippetType})`);

          let snippetInserted = false;

          if (target.snippetType === 'paragraph') {
            // Check if ab-snippet already exists
            if (content.includes('class="ab-snippet"')) {
              logger.debug('Featured snippet: Paragraph snippet already exists, skipping');
              continue;
            }

            // Generate a 40-60 word concise answer using Claude
            const prompt = `Write a concise, direct answer to the question: "${target.query}"
Rules:
- Exactly 40-60 words
- Start with the key answer immediately (no "The answer is..." preamble)
- Include the main keyword naturally
- Factual, authoritative tone
- No markdown, return plain text only`;

            const response = await this.claude.messages.create({
              model: this.model,
              max_tokens: 200,
              temperature: 0.3,
              messages: [{ role: 'user', content: prompt }],
            });
            costTracker.addClaudeCall(this.model, response.usage?.input_tokens || 0, response.usage?.output_tokens || 0);

            const snippetText = response.content[0].type === 'text' ? response.content[0].text.trim() : '';
            if (snippetText.length < 100 || snippetText.length > 500) continue;

            const snippetHtml = `<div class="ab-snippet" data-snippet-type="definition"><p>${snippetText}</p></div>`;

            // Insert after first H2
            const firstH2End = content.indexOf('</h2>');
            if (firstH2End !== -1) {
              const nextP = content.indexOf('</p>', firstH2End);
              if (nextP !== -1) {
                const insertPos = nextP + '</p>'.length;
                content = content.slice(0, insertPos) + '\n' + snippetHtml + '\n' + content.slice(insertPos);
                snippetInserted = true;
              }
            }
          } else if (target.snippetType === 'list') {
            // Find existing bullet/numbered lists near H2 sections and ensure they're in proper ol/ul format
            // Add a structured list summary if none exists near the top
            if (!content.includes('class="ab-snippet"')) {
              const prompt = `Create a numbered list (5-8 items) answering: "${target.query}"
Rules:
- Each item: 8-15 words, starts with action verb or key term
- Return as HTML <ol> with <li> items only
- No preamble, no explanation, just the <ol> HTML`;

              const response = await this.claude.messages.create({
                model: this.model,
                max_tokens: 500,
                temperature: 0.3,
                messages: [{ role: 'user', content: prompt }],
              });
              costTracker.addClaudeCall(this.model, response.usage?.input_tokens || 0, response.usage?.output_tokens || 0);

              const listHtml = response.content[0].type === 'text' ? response.content[0].text.trim() : '';
              if (listHtml.includes('<ol') || listHtml.includes('<ul')) {
                const snippetHtml = `<div class="ab-snippet" data-snippet-type="list">${listHtml}</div>`;
                const firstH2End = content.indexOf('</h2>');
                if (firstH2End !== -1) {
                  const nextP = content.indexOf('</p>', firstH2End);
                  if (nextP !== -1) {
                    const insertPos = nextP + '</p>'.length;
                    content = content.slice(0, insertPos) + '\n' + snippetHtml + '\n' + content.slice(insertPos);
                    snippetInserted = true;
                  }
                }
              }
            }
          } else if (target.snippetType === 'table') {
            // Add a comparison table if none exists
            if (!content.includes('class="ab-snippet"') || !/<table/.test(content.slice(0, content.length / 3))) {
              const prompt = `Create a comparison table answering: "${target.query}"
Rules:
- 4-6 rows, 3-4 columns
- Return as HTML <table> with <thead> and <tbody>
- Include relevant data points for ${focusKeyword}
- No preamble, just the <table> HTML`;

              const response = await this.claude.messages.create({
                model: this.model,
                max_tokens: 800,
                temperature: 0.3,
                messages: [{ role: 'user', content: prompt }],
              });
              costTracker.addClaudeCall(this.model, response.usage?.input_tokens || 0, response.usage?.output_tokens || 0);

              const tableHtml = response.content[0].type === 'text' ? response.content[0].text.trim() : '';
              if (tableHtml.includes('<table')) {
                const snippetHtml = `<div class="ab-snippet" data-snippet-type="table"><div class="ab-table-wrap">${tableHtml}</div></div>`;
                const firstH2End = content.indexOf('</h2>');
                if (firstH2End !== -1) {
                  const nextP = content.indexOf('</p>', firstH2End);
                  if (nextP !== -1) {
                    const insertPos = nextP + '</p>'.length;
                    content = content.slice(0, insertPos) + '\n' + snippetHtml + '\n' + content.slice(insertPos);
                    snippetInserted = true;
                  }
                }
              }
            }
          }

          if (!snippetInserted) continue;

          const nowIso = new Date().toISOString();
          await this.api.post(`/posts/${post.id}`, {
            content,
            meta: {
              _autoblog_modified_time: nowIso,
              _rewrite_reason: `Featured snippet optimization: "${target.query}" (${target.snippetType}, pos ${target.position.toFixed(1)})`,
            },
          });

          optimized++;
          optimizedUrls.push(post.link);
          logger.info(`Featured snippet: Optimized "${post.title.rendered}" for ${target.snippetType} snippet`);
          await new Promise(r => setTimeout(r, 2000));
        } catch (error) {
          logger.warn(`Featured snippet optimization failed for "${target.query}": ${error instanceof Error ? error.message : error}`);
        }
      }

      // Re-index optimized posts
      if (seoService && optimizedUrls.length > 0) {
        try {
          await seoService.notifyIndexNow(optimizedUrls);
          logger.info(`Featured snippet: Submitted ${optimizedUrls.length} URL(s) for re-indexing`);
        } catch (error) {
          logger.warn(`Featured snippet re-indexing failed: ${error instanceof Error ? error.message : error}`);
        }
      }

      return optimized;
    } catch (error) {
      logger.warn(`Featured snippet optimization failed: ${error instanceof Error ? error.message : error}`);
      return 0;
    }
  }

  /**
   * Strengthen striking distance posts (position 5-20) for target queries.
   * Fetches query-page pairs from GSC, de-duplicates by page, and uses Claude
   * to add targeted content sections for the highest-impression query per page.
   */
  async strengthenStrikingDistancePosts(
    gscService: GSCAnalyticsService,
    seoService: SeoService,
    limit: number = 2,
  ): Promise<number> {
    try {
      const pairs = await gscService.getStrikingDistanceWithPages();
      if (pairs.length === 0) {
        logger.debug('No striking distance query-page pairs found');
        return 0;
      }

      // De-duplicate by page: pick highest-impression query per page
      const bestPerPage = new Map<string, typeof pairs[0]>();
      for (const pair of pairs) {
        const existing = bestPerPage.get(pair.page);
        if (!existing || pair.impressions > existing.impressions) {
          bestPerPage.set(pair.page, pair);
        }
      }

      const candidates = Array.from(bestPerPage.values()).slice(0, limit);
      let strengthened = 0;

      for (const candidate of candidates) {
        try {
          // Extract slug from page URL
          const url = new URL(candidate.page);
          const slug = url.pathname.replace(/^\/|\/$/g, '');
          if (!slug) continue;

          // Fetch WP post by slug
          const { data: posts } = await this.api.get('/posts', {
            params: { slug, _fields: 'id,title,content,link' },
          });
          if (!Array.isArray(posts) || posts.length === 0) continue;

          const post = posts[0] as { id: number; title: { rendered: string }; content: { rendered: string }; link: string };
          const currentContent = post.content.rendered;

          // Use Claude to strengthen content for target query
          const strengthenedHtml = await this.strengthenForKeyword(
            currentContent,
            candidate.query,
            post.title.rendered,
            candidate.position,
          );
          if (!strengthenedHtml) continue;

          // Update post
          await this.api.put(`/posts/${post.id}`, {
            content: strengthenedHtml,
          });
          logger.info(`Strengthened post "${post.title.rendered}" for query "${candidate.query}" (pos ${candidate.position.toFixed(1)})`);

          // Re-index via seoService
          try {
            await seoService.requestIndexing(post.link);
          } catch {
            // Non-critical
          }

          strengthened++;
        } catch (error) {
          logger.warn(`Failed to strengthen page ${candidate.page}: ${error instanceof Error ? error.message : error}`);
        }
      }

      return strengthened;
    } catch (error) {
      logger.warn(`Striking distance strengthening failed: ${error instanceof Error ? error.message : error}`);
      return 0;
    }
  }

  /**
   * Use Claude to strengthen existing content for a target keyword.
   * Adds a targeted section, FAQ, and improves keyword density without rewriting.
   */
  private async strengthenForKeyword(
    currentHtml: string,
    targetQuery: string,
    title: string,
    currentPosition: number,
  ): Promise<string | null> {
    try {
      const response = await this.claude.messages.create({
        model: this.model,
        max_tokens: 4096,
        messages: [{
          role: 'user',
          content: `You are an SEO content editor. A blog post currently ranks at position ${currentPosition.toFixed(1)} for the query "${targetQuery}".

Your task: Strengthen this post to improve its ranking for "${targetQuery}" WITHOUT rewriting the entire article. Make surgical, targeted improvements:

1. Add a new H2 or H3 section (200-300 words) directly addressing "${targetQuery}" — place it where it fits naturally
2. Add 2-3 FAQ items about "${targetQuery}" in an FAQ section (if none exists, create one before the disclaimer)
3. Ensure "${targetQuery}" or close variants appear 3-5 more times naturally in existing content
4. Strengthen the introduction to mention "${targetQuery}" within the first 100 words if not already present

Current post title: ${title}
Current HTML content:
${currentHtml.slice(0, 8000)}

Return ONLY the complete updated HTML. Do not add markdown code blocks. Preserve all existing styling, structure, and image placeholders.`,
        }],
      });

      const text = response.content[0];
      if (text.type !== 'text' || text.text.length < 500) return null;

      costTracker.trackApiCall('content-strengthen');
      return text.text;
    } catch (error) {
      logger.warn(`Claude strengthen failed for "${targetQuery}": ${error instanceof Error ? error.message : error}`);
      return null;
    }
  }
}
