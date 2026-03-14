import fs from 'node:fs/promises';
import path from 'node:path';
import axios from 'axios';
import { loadConfig } from './config/env.js';
import { NICHES, getSeasonallyOrderedNiches, getSeasonalContentSuggestions } from './config/niches.js';
import { KeywordResearchService } from './services/keyword-research.service.js';
import { ContentGeneratorService } from './services/content-generator.service.js';
import { ImageGeneratorService } from './services/image-generator.service.js';
import { WordPressService } from './services/wordpress.service.js';
import { PagesService } from './services/pages.service.js';
import { SeoService } from './services/seo.service.js';
import { TwitterService } from './services/twitter.service.js';
import { DevToService } from './services/devto.service.js';
import { HashnodeService } from './services/hashnode.service.js';
import { PinterestService } from './services/pinterest.service.js';
import { GA4AnalyticsService } from './services/ga4-analytics.service.js';
import { GSCAnalyticsService } from './services/gsc-analytics.service.js';
import { PostHistory } from './utils/history.js';
import { sendBatchSummary, sendQualityAlert, sendDecayAlert, sendHealthCheck, sendTelegramAlert, sendEarlyDecayAlert } from './utils/alerting.js';
import { DataVisualizationService } from './services/data-visualization.service.js';
import { costTracker, CostTracker } from './utils/cost-tracker.js';
import { logger } from './utils/logger.js';
import { ContentRefreshService } from './services/content-refresh.service.js';
import { TopicClusterService } from './services/topic-cluster.service.js';
import { FactCheckService } from './services/fact-check.service.js';
import { MediumService } from './services/medium.service.js';
import { EmailAutomationService } from './services/email-automation.service.js';
import { NaverBlogService } from './services/naver-blog.service.js';
import { LinkedInService } from './services/linkedin.service.js';
import { FacebookService } from './services/facebook.service.js';
import { RedditPostService } from './services/reddit-post.service.js';
import { AdSenseApiService } from './services/adsense-api.service.js';
import type { PostResult, BatchResult, MediaUploadResult } from './types/index.js';
import { CATEGORY_PUBLISH_TIMING } from './types/index.js';
import { resolvePostUrl } from './utils/utm.js';

function extractDataPoints(html: string): Array<{ label: string; value: string }> {
  const points: Array<{ label: string; value: string }> = [];
  // Match patterns like "X is Y%", "X: Y", "X reached Y" in text content
  const stripped = html.replace(/<[^>]+>/g, ' ');
  // Pattern: "Label: number/percentage"
  const colonPattern = /([A-Za-z][A-Za-z\s]{2,30}):\s*(\$?[\d,.]+[%KMB]?(?:\s*(?:billion|million|trillion|percent))?)/g;
  let match;
  while ((match = colonPattern.exec(stripped)) !== null && points.length < 8) {
    points.push({ label: match[1].trim(), value: match[2].trim() });
  }
  // Pattern: numbers with units in parenthetical context
  if (points.length < 3) {
    const numPattern = /(\d{1,3}(?:,\d{3})*(?:\.\d+)?)\s*(%|billion|million|trillion|won|USD|KRW)/gi;
    while ((match = numPattern.exec(stripped)) !== null && points.length < 8) {
      const ctx = stripped.slice(Math.max(0, match.index - 40), match.index).trim();
      const label = ctx.split(/[.!?]/).pop()?.trim() || 'Data';
      if (label.length > 3 && label.length < 40) {
        points.push({ label, value: `${match[1]} ${match[2]}` });
      }
    }
  }
  return points;
}

async function main(): Promise<void> {
  const startedAt = new Date().toISOString();
  logger.info('=== Auto Blog WordPress - Korea-Focused SEO Batch Start ===');

  // 1. Config
  const config = loadConfig();

  // 1.1. E-E-A-T warning: generic SITE_OWNER weakens AdSense approval for YMYL niches
  if (config.SITE_OWNER === 'TrendHunt' || !config.SITE_OWNER) {
    logger.warn('⚠️ SITE_OWNER is set to default "TrendHunt". For AdSense approval (especially Finance YMYL), set a real author name with AUTHOR_LINKEDIN and AUTHOR_CREDENTIALS.');
  }

  // 1.2. AdSense publisher ID check
  if (!config.ADSENSE_PUB_ID) {
    logger.warn('ADSENSE_PUB_ID not set — ad placements will use Auto Ads only. Set ADSENSE_PUB_ID (e.g., "ca-pub-1234567890") for manual ad units.');
  }

  // 1.5. Load history early (needed for calendar-based niche reordering)
  const history = new PostHistory();
  await history.load();

  const seasonalNiches = getSeasonallyOrderedNiches();

  // Niche Focus Mode: concentrate on specific niches for topical authority building
  let filteredNiches = seasonalNiches;
  if (config.NICHE_FOCUS_IDS) {
    const focusIds = config.NICHE_FOCUS_IDS.split(',').map(id => id.trim()).filter(Boolean);
    if (focusIds.length > 0) {
      filteredNiches = seasonalNiches.filter(n => focusIds.includes(n.id));
      if (filteredNiches.length === 0) {
        logger.warn(`NICHE_FOCUS_IDS contains no valid IDs: ${config.NICHE_FOCUS_IDS}. Using all niches.`);
        filteredNiches = seasonalNiches;
      } else {
        logger.info(`Niche Focus Mode: concentrating on ${filteredNiches.length} niche(s): ${filteredNiches.map(n => n.name).join(', ')}`);
      }
    }
  }

  // Reorder by content calendar staleness (least recently published first)
  const stalenessOrder = history.getCategoriesByStalenessPriority(filteredNiches.map(n => n.id));
  const calendarNiches = [...filteredNiches].sort((a, b) => {
    return stalenessOrder.indexOf(a.id) - stalenessOrder.indexOf(b.id);
  });
  const activeNiches = calendarNiches.slice(0, config.POST_COUNT);
  const boostedNames = seasonalNiches.slice(0, config.POST_COUNT).filter((n, i) => {
    const origIdx = NICHES.findIndex(orig => orig.id === n.id);
    return origIdx !== i;
  }).map(n => n.name);
  logger.info(`Geo: ${config.TRENDS_GEO}, Niches: ${activeNiches.length}/${NICHES.length} (POST_COUNT=${config.POST_COUNT})${boostedNames.length > 0 ? ` | Seasonal boost: ${boostedNames.join(', ')}` : ''}`);

  // 2. Services
  const researchService = new KeywordResearchService(config.ANTHROPIC_API_KEY, config.TRENDS_GEO,
    config.REDDIT_CLIENT_ID && config.REDDIT_CLIENT_SECRET
      ? { clientId: config.REDDIT_CLIENT_ID, clientSecret: config.REDDIT_CLIENT_SECRET }
      : undefined,
    config.SERPAPI_KEY || undefined,
  );
  const authorLinks = { linkedin: config.AUTHOR_LINKEDIN, twitter: config.AUTHOR_TWITTER, website: config.AUTHOR_WEBSITE, credentials: config.AUTHOR_CREDENTIALS };
  const contentService = new ContentGeneratorService(config.ANTHROPIC_API_KEY, config.SITE_OWNER, config.WP_URL, config.MIN_QUALITY_SCORE, authorLinks);
  const imageService = new ImageGeneratorService(config.GEMINI_API_KEY, config.IMAGE_FORMAT);
  const wpService = new WordPressService(config.WP_URL, config.WP_USERNAME, config.WP_APP_PASSWORD, config.SITE_OWNER, authorLinks, config.ADSENSE_PUB_ID || undefined);

  const twitterService =
    config.X_API_KEY && config.X_API_SECRET && config.X_ACCESS_TOKEN && config.X_ACCESS_TOKEN_SECRET
      ? new TwitterService(config.X_API_KEY, config.X_API_SECRET, config.X_ACCESS_TOKEN, config.X_ACCESS_TOKEN_SECRET)
      : null;
  if (twitterService) {
    logger.info('X (Twitter) promotion service enabled');
  } else {
    logger.info('X_API_KEY not set, skipping X promotion');
  }

  const linkedinService =
    config.LINKEDIN_ACCESS_TOKEN && config.LINKEDIN_PERSON_ID
      ? new LinkedInService(config.LINKEDIN_ACCESS_TOKEN, config.LINKEDIN_PERSON_ID)
      : null;
  if (linkedinService) {
    logger.info('LinkedIn promotion service enabled');
  } else {
    logger.info('LINKEDIN_ACCESS_TOKEN not set, skipping LinkedIn promotion');
  }

  const facebookService =
    config.FB_ACCESS_TOKEN && config.FB_PAGE_ID
      ? new FacebookService(config.FB_ACCESS_TOKEN, config.FB_PAGE_ID)
      : null;
  if (facebookService) {
    logger.info('Facebook Page promotion service enabled');
  } else {
    logger.info('FB_ACCESS_TOKEN not set, skipping Facebook promotion');
  }

  const redditPostService =
    config.REDDIT_CLIENT_ID && config.REDDIT_CLIENT_SECRET && config.REDDIT_POST_USERNAME && config.REDDIT_POST_PASSWORD
      ? new RedditPostService(config.REDDIT_CLIENT_ID, config.REDDIT_CLIENT_SECRET, config.REDDIT_POST_USERNAME, config.REDDIT_POST_PASSWORD)
      : null;
  if (redditPostService) {
    logger.info('Reddit auto-posting service enabled');
  } else {
    logger.info('REDDIT_POST_USERNAME not set, skipping Reddit posting');
  }

  const devtoService = config.DEVTO_API_KEY
    ? new DevToService(config.DEVTO_API_KEY)
    : null;
  if (devtoService) {
    logger.info('DEV.to syndication service enabled');
  } else {
    logger.info('DEVTO_API_KEY not set, skipping DEV.to syndication');
  }

  const hashnodeService =
    config.HASHNODE_TOKEN && config.HASHNODE_PUBLICATION_ID
      ? new HashnodeService(config.HASHNODE_TOKEN, config.HASHNODE_PUBLICATION_ID)
      : null;
  if (hashnodeService) {
    logger.info('Hashnode syndication service enabled');
  } else {
    logger.info('HASHNODE_TOKEN not set, skipping Hashnode syndication');
  }

  const mediumService = config.MEDIUM_TOKEN
    ? new MediumService(config.MEDIUM_TOKEN)
    : null;
  if (mediumService) {
    logger.info('Medium syndication service enabled');
  } else {
    logger.info('MEDIUM_TOKEN not set, skipping Medium syndication');
  }

  const pinterestService = config.PINTEREST_ACCESS_TOKEN
    ? new PinterestService(config.PINTEREST_ACCESS_TOKEN)
    : null;
  if (pinterestService) {
    logger.info('Pinterest auto-pin service enabled');
  } else {
    logger.info('PINTEREST_ACCESS_TOKEN not set, skipping Pinterest');
  }

  // 2.5. Ensure required pages exist (AdSense compliance)
  const pagesService = new PagesService(config.WP_URL, config.WP_USERNAME, config.WP_APP_PASSWORD);
  try {
    await pagesService.ensureRequiredPages(config.SITE_NAME, config.SITE_OWNER, config.CONTACT_EMAIL, authorLinks, config.AUTHOR_BIO, config.AUTHOR_CREDENTIALS);
  } catch (error) {
    logger.warn(`Failed to create required pages: ${error instanceof Error ? error.message : error}`);
  }

  // 2.6. SEO service + niche-aware site settings
  const seoService = new SeoService(config.WP_URL, config.WP_USERNAME, config.WP_APP_PASSWORD, {
    indexNowKey: config.INDEXNOW_KEY || undefined,
    indexingSaKey: config.GOOGLE_INDEXING_SA_KEY || undefined,
  });
  const nicheCategories = [...new Set(NICHES.map((n) => n.category))];

  try {
    await seoService.ensureSiteTitle(config.SITE_NAME, nicheCategories, config.SITE_TAGLINE || undefined);
  } catch (error) {
    logger.warn(`Site title setup failed: ${error instanceof Error ? error.message : error}`);
  }

  // 2.6b. Ensure category-based permalink structure for topical authority
  try {
    await seoService.ensureCategoryPermalinks();
  } catch (error) {
    logger.warn(`Permalink setup failed: ${error instanceof Error ? error.message : error}`);
  }

  // 2.7–2.10d. Install all independent SEO/PHP snippets in parallel (was 20+ sequential API calls)
  logger.info('Installing SEO snippets in parallel...');
  const snippetTasks: Array<Promise<unknown>> = [
    seoService.ensureHeaderScripts({
      googleCode: config.GOOGLE_SITE_VERIFICATION,
      naverCode: config.NAVER_SITE_VERIFICATION,
      gaMeasurementId: config.GA_MEASUREMENT_ID,
      adsensePubId: config.ADSENSE_PUB_ID || undefined,
      clarityProjectId: config.CLARITY_PROJECT_ID || undefined,
    }),
    seoService.ensureAdSensePaddingSnippet(),
    seoService.ensureNoindexThinPagesSnippet(),
    seoService.ensureJsonLdSnippet(),
    seoService.ensureDarkModeSnippet(),
    seoService.ensureRssFeedOptimization(),
    seoService.ensureImageSitemapSnippet(),
    seoService.ensureSitemapPrioritySnippet(),
    seoService.ensureNewsSitemapSnippet(),
    seoService.ensureVideoSitemapSnippet(),
    seoService.ensurePostCssSnippet(),
    seoService.ensureIndexNowKeySnippet(),
    seoService.ensurePostCanonicalFallbackSnippet(),
    seoService.ensureCookieConsentSnippet(),
    seoService.ensureSiteSchemaSnippet(config.SITE_NAME, config.SITE_OWNER, {
      linkedin: config.AUTHOR_LINKEDIN,
      twitter: config.AUTHOR_TWITTER,
      website: config.AUTHOR_WEBSITE,
    }),
    seoService.ensureNavigationMenu(nicheCategories),
    seoService.ensureStickyAdsSnippet(),
    seoService.ensureExitIntentSnippet(config.NEWSLETTER_FORM_URL),
    seoService.ensureCwvAutoFixSnippet(),
    seoService.ensureCriticalCssSnippet(),
    // Conditional tasks
    ...(config.ADSENSE_PUB_ID ? [seoService.ensureAdsTxtSnippet(config.ADSENSE_PUB_ID)] : []),
    ...(config.CLOUDFLARE_API_TOKEN && config.CLOUDFLARE_ZONE_ID
      ? [seoService.ensureCacheHeaders(config.CLOUDFLARE_API_TOKEN, config.CLOUDFLARE_ZONE_ID)]
      : []),
  ];
  const snippetResults = await Promise.allSettled(snippetTasks);
  const snippetFailures = snippetResults.filter((r) => r.status === 'rejected');
  if (snippetFailures.length > 0) {
    logger.warn(`${snippetFailures.length}/${snippetTasks.length} SEO snippet tasks failed (non-critical)`);
  } else {
    logger.info(`All ${snippetTasks.length} SEO snippets installed successfully`);
  }

  // Post-CSS snippet status check (depends on ensurePostCssSnippet completing above)
  let postCssSnippetActive = false;
  try {
    postCssSnippetActive = await seoService.isPostCssSnippetActive();
    if (postCssSnippetActive) {
      logger.info('Post CSS loaded via site-wide snippet (inline CSS disabled)');
    }
  } catch (error) {
    logger.warn(`Post CSS status check failed: ${error instanceof Error ? error.message : error}`);
  }

  // Comment settings + spam cleanup (sequential — interdependent)
  try {
    await seoService.ensureCommentSettings();
    await seoService.cleanupSpamComments();
    await seoService.ensureCommentEngagementSnippet();
  } catch (error) {
    logger.warn(`Comment settings/cleanup failed: ${error instanceof Error ? error.message : error}`);
  }

  // 2.11. Check robots.txt + WordPress indexing settings + sitemap
  await seoService.checkRobotsTxt();
  await seoService.checkAndFixIndexingSettings();
  await seoService.verifySitemap();

  // 2.11b. Submit sitemaps to Google Search Console
  try {
    await seoService.submitSitemapToGSC(config.GSC_SITE_URL);
  } catch (error) {
    logger.warn(`GSC sitemap submission failed: ${error instanceof Error ? error.message : error}`);
  }

  // 2.12. Ensure pillar pages for topic clusters
  try {
    const earlyPosts = await wpService.getRecentPosts(500);
    await pagesService.ensurePillarPages(NICHES, earlyPosts, config.SITE_NAME);

    // 2.12b. Author profile pages (E-E-A-T entity building)
    await pagesService.ensureAuthorPages(NICHES, earlyPosts, config.SITE_OWNER, authorLinks);

    // 2.12c. Site-wide FAQ page (aggregated FAQPage schema)
    await pagesService.ensureFaqPage(earlyPosts, config.SITE_NAME, config.WP_URL);
  } catch (error) {
    logger.warn(`Pillar/Author/FAQ pages update failed: ${error instanceof Error ? error.message : error}`);
  }

  // 2.12d. Series hub pages (aggregate all posts in a content series)
  try {
    const seriesIds = history.getAllSeriesIds();
    if (seriesIds.length > 0) {
      const seriesMap = new Map<string, import('./types/index.js').PostHistoryEntry[]>();
      for (const sid of seriesIds) {
        seriesMap.set(sid, history.getSeriesEntries(sid));
      }
      await pagesService.ensureSeriesHubPages(seriesMap, config.SITE_NAME);
    }
  } catch (error) {
    logger.warn(`Series hub pages update failed: ${error instanceof Error ? error.message : error}`);
  }

  // 2.12e-pre. Load cached RPM data from previous runs (fallback when AdSense API unavailable)
  const RPM_CACHE_FILE = path.resolve('data', 'rpm-cache.json');
  try {
    const rpmCacheRaw = await fs.readFile(RPM_CACHE_FILE, 'utf-8');
    const rpmCache = JSON.parse(rpmCacheRaw) as Record<string, number>;
    for (const niche of NICHES) {
      if (rpmCache[niche.category] && !niche.dynamicRpmValue) {
        niche.dynamicRpmValue = rpmCache[niche.category];
        logger.debug(`RPM cache loaded [${niche.category}]: $${rpmCache[niche.category].toFixed(2)}`);
      }
    }
  } catch { /* No cache file yet, OK */ }

  // 2.12e. AdSense API: auto-collect RPM data per niche (replaces manual ADSENSE_RPM_OVERRIDES)
  if (config.ADSENSE_SA_KEY && config.ADSENSE_ACCOUNT_ID) {
    try {
      const adsenseApi = new AdSenseApiService(config.ADSENSE_ACCOUNT_ID, config.ADSENSE_SA_KEY);
      const categoryPatterns: Record<string, string> = {
        'Korean Tech': 'korean-tech',
        'Korean Finance': 'korean-finance',
        'K-Beauty': 'k-beauty',
        'Korea Travel': 'korea-travel',
        'K-Entertainment': 'k-entertainment',
      };
      const rpmData = await adsenseApi.getRpmByCategory(categoryPatterns);
      if (Object.keys(rpmData).length > 0) {
        // Update niche configs with actual RPM data
        for (const niche of NICHES) {
          if (rpmData[niche.category]) {
            niche.dynamicRpmValue = rpmData[niche.category];
            logger.info(`AdSense RPM [${niche.category}]: $${rpmData[niche.category].toFixed(2)}`);
          }
        }
      }
      // Apply seasonal RPM multipliers to dynamic RPM values
      for (const niche of NICHES) {
        if (niche.dynamicRpmValue) {
          const seasonalMultiplier = CostTracker.SEASONAL_RPM_MULTIPLIERS[niche.category]?.[new Date().getMonth() + 1] || 1.0;
          if (seasonalMultiplier > 1.0) {
            const seasonalRpm = niche.dynamicRpmValue * seasonalMultiplier;
            logger.info(`Seasonal RPM boost [${niche.category}]: $${niche.dynamicRpmValue.toFixed(2)} × ${seasonalMultiplier}x = $${seasonalRpm.toFixed(2)}`);
            niche.dynamicRpmValue = seasonalRpm;
          }
        }
      }
      // Pass RPM data to keyword research for revenue-aware prioritization
      if (Object.keys(rpmData).length > 0) {
        researchService.setRpmData(rpmData);
        logger.info(`RPM data passed to keyword research: ${Object.keys(rpmData).length} categories`);
      }
      // Persist RPM data for next run (survives process restart)
      try {
        const rpmToCache: Record<string, number> = {};
        for (const niche of NICHES) {
          if (niche.dynamicRpmValue) rpmToCache[niche.category] = niche.dynamicRpmValue;
        }
        if (Object.keys(rpmToCache).length > 0) {
          await fs.mkdir(path.dirname(RPM_CACHE_FILE), { recursive: true });
          await fs.writeFile(RPM_CACHE_FILE, JSON.stringify(rpmToCache, null, 2), 'utf-8');
          logger.debug(`RPM cache saved: ${Object.keys(rpmToCache).length} categories`);
        }
      } catch { /* non-critical */ }
    } catch (adsError) {
      logger.debug(`AdSense API RPM collection failed: ${adsError instanceof Error ? adsError.message : adsError}`);
    }
  }

  // 2.13. Build pillar URL map for cluster navigation
  const pillarUrlMap: Record<string, string> = {};
  for (const niche of NICHES) {
    const pillarSlug = `guide-${niche.id}`;
    pillarUrlMap[niche.id] = `${config.WP_URL}/${pillarSlug}/`;
  }

  // 2.14. Build topic clusters for cluster-aware internal linking
  const topicClusterService = new TopicClusterService();

  // 2.14b. Initialize fact-check service for pre-publish verification
  const factCheckService = new FactCheckService();

  // 2.14b2. Initialize data visualization service for Finance/Tech charts
  const dataVizService = new DataVisualizationService(factCheckService);

  // 2.14c-pre. Send health check notification at batch start
  if (config.TELEGRAM_BOT_TOKEN && config.TELEGRAM_CHAT_ID) {
    await sendHealthCheck(config.TELEGRAM_BOT_TOKEN, config.TELEGRAM_CHAT_ID, {
      totalPosts: history.getAllEntries().length,
      activeNiches: activeNiches.length,
      postCount: config.POST_COUNT,
    });
  }

  // 2.14c. Check evergreen ratio health
  ContentRefreshService.checkEvergreenRatio(history.getAllEntries());

  // 2.15. Manual review mode: schedule initial posts for delayed auto-publish (AdSense safety)
  const isNewPublisher = config.MANUAL_REVIEW_THRESHOLD > 0 && history.getAllEntries().length < config.MANUAL_REVIEW_THRESHOLD * 2;
  let effectivePublishStatus = config.PUBLISH_STATUS as 'publish' | 'draft';
  let manualReviewDelayMs = 0; // 0 = no delay, >0 = schedule future publish
  if (config.MANUAL_REVIEW_THRESHOLD > 0) {
    const totalPublished = history.getAllEntries().length;
    if (totalPublished < config.MANUAL_REVIEW_THRESHOLD) {
      manualReviewDelayMs = 24 * 60 * 60 * 1000; // 24 hours
      logger.info(
        `Manual Review Mode: ${totalPublished}/${config.MANUAL_REVIEW_THRESHOLD} posts published. ` +
        `Scheduling auto-publish 24h later (WordPress future status). Set MANUAL_REVIEW_THRESHOLD=0 to disable.`,
      );
    } else {
      logger.info(`Manual Review Mode: threshold reached (${totalPublished} posts). Auto-publish enabled.`);
    }
  }

  // 3. History (already loaded in 2.0 for calendar reordering)

  // 3.5. GA4 + GSC Performance Feedback Loop
  let ga4OptimalHour: number | null = null;
  let ga4OptimalDay: number | null = null;
  const insightParts: string[] = [];

  // Singleton service instances — reused throughout the batch (avoids repeated auth handshakes)
  const ga4Singleton = (config.GA4_PROPERTY_ID && config.GOOGLE_INDEXING_SA_KEY)
    ? new GA4AnalyticsService(config.GA4_PROPERTY_ID, config.GOOGLE_INDEXING_SA_KEY)
    : null;
  const gscSingleton = (config.GSC_SITE_URL && config.GOOGLE_INDEXING_SA_KEY)
    ? new GSCAnalyticsService(config.GSC_SITE_URL || config.WP_URL, config.GOOGLE_INDEXING_SA_KEY)
    : null;

  // Pre-batch GA4 metrics snapshot for ROI comparison
  let preBatchMetrics: { pageviews: number; sessions: number; engagementRate: number; avgEngagementDuration: number } | null = null;

  if (ga4Singleton) {
    try {
      // Capture 7-day baseline before batch runs
      preBatchMetrics = await ga4Singleton.getSiteMetricsSnapshot('7daysAgo', 'today');
      if (preBatchMetrics) {
        logger.info(`Pre-batch GA4 snapshot: ${preBatchMetrics.pageviews} pageviews, ${preBatchMetrics.sessions} sessions, ${(preBatchMetrics.engagementRate * 100).toFixed(1)}% engagement`);
      }
    } catch (snapErr) {
      logger.debug(`Pre-batch GA4 snapshot failed: ${snapErr instanceof Error ? snapErr.message : snapErr}`);
    }
    try {
      const ga4Service = ga4Singleton;
      const insights = await ga4Service.getPerformanceInsights();
      if (insights) {
        insightParts.push(insights);
        logger.info('GA4 performance insights loaded for keyword research');
      }
      // Content type performance learning
      const ctInsights = await ga4Service.getContentTypeInsights(history.getAllEntries());
      if (ctInsights) {
        insightParts.push(ctInsights);
        logger.info('GA4 content type insights loaded for keyword research');
      }
      ga4OptimalHour = await ga4Service.getOptimalPublishHour();
      ga4OptimalDay = await ga4Service.getOptimalPublishDay();

      // Update engagement scores for freshness decay calculations
      const topPosts = await ga4Service.getTopPerformingPosts(200);
      if (topPosts.length > 0) {
        await history.updateEngagementScores(topPosts);
      }

      // Core Web Vitals monitoring — flag slow posts (LCP > 2500ms)
      try {
        const cwvPages = await ga4Service.getCoreWebVitals(20);
        const slowPages = cwvPages.filter(p => p.lcp > 2500);
        if (slowPages.length > 0) {
          logger.warn(`CWV: ${slowPages.length} page(s) with LCP > 2.5s — consider image optimization`);
          for (const sp of slowPages.slice(0, 5)) {
            logger.warn(`  ${sp.pagePath}: LCP=${Math.round(sp.lcp)}ms, CLS=${sp.cls.toFixed(3)}, INP=${Math.round(sp.inp)}ms`);
          }
        } else if (cwvPages.length > 0) {
          logger.info(`CWV: all ${cwvPages.length} measured pages have LCP < 2.5s`);
        }
      } catch (cwvErr) {
        logger.debug(`CWV monitoring skipped: ${cwvErr instanceof Error ? cwvErr.message : cwvErr}`);
      }
    } catch (error) {
      logger.warn(`GA4 performance feedback failed: ${error instanceof Error ? error.message : error}`);
    }
  }

  // Google Search Console integration (impressions, clicks, positions, decay, threats)
  // Cache GSC results for reuse (avoids duplicate API calls in competitor gap analysis)
  let cachedStrikingDistance: Awaited<ReturnType<GSCAnalyticsService['getStrikingDistanceKeywords']>> = [];
  let cachedTopQueries: Awaited<ReturnType<GSCAnalyticsService['getTopQueries']>> = [];
  let gscService: GSCAnalyticsService | null = null;
  if (gscSingleton) {
    try {
      gscService = gscSingleton;
      const searchInsights = await gscService.getSearchInsights();
      if (searchInsights) {
        insightParts.push(searchInsights);
        logger.info('GSC search insights loaded for keyword research');
      }
      // SERP competition analysis: feed striking distance + top queries for content gap detection
      // Results cached in outer scope for reuse by competitor gap analysis (avoids duplicate API calls)
      [cachedStrikingDistance, cachedTopQueries] = await Promise.all([
        gscService.getStrikingDistanceKeywords(),
        gscService.getTopQueries(30),
      ]);
      const strikingDistance = cachedStrikingDistance;
      const topQueries = cachedTopQueries;
      if (strikingDistance.length > 0 || topQueries.length > 0) {
        researchService.setSerpAnalysis(strikingDistance, topQueries);
        logger.info(`SERP analysis loaded: ${strikingDistance.length} striking distance, ${topQueries.length} top queries`);
      }

      // Build competitive context from striking distance (reuse fetched data — no duplicate API call)
      if (strikingDistance.length > 0) {
        const competitiveStr = strikingDistance.slice(0, 5).map(sd =>
          `"${sd.query}" (pos ${sd.position.toFixed(1)}, ${sd.impressions} imp)`,
        ).join('; ');
        contentService.setCompetitiveContext(
          `Striking distance keywords needing supporting content: ${competitiveStr}. Consider weaving these into your article naturally.`,
        );
      }

      // Content decay detection
      const declining = await gscService.getDecliningPages();
      if (declining.length > 0) {
        logger.warn(`\n=== Content Decay Alert: ${declining.length} declining page(s) ===`);
        for (const page of declining.slice(0, 10)) {
          logger.warn(`  ${page.page} (pos ${page.position.toFixed(1)}, ${page.clicks} clicks/7d, ${page.impressions} imp/7d)`);
        }
        logger.warn(`Consider running: npx tsx src/scripts/refresh-stale-posts.ts`);
        // Send Telegram alert for content decay
        if (config.TELEGRAM_BOT_TOKEN && config.TELEGRAM_CHAT_ID) {
          await sendDecayAlert(config.TELEGRAM_BOT_TOKEN, config.TELEGRAM_CHAT_ID, declining.slice(0, 5));
        }
      }

      // Competitive threat monitoring: detect queries where competitors are outranking us
      const threats = await gscService.getCompetitiveThreats();
      if (threats.length > 0) {
        const critical = threats.filter(t => t.urgency === 'critical');
        const high = threats.filter(t => t.urgency === 'high');
        logger.warn(`\n=== Competitive Threat Alert: ${threats.length} threat(s) detected ===`);
        if (critical.length > 0) {
          logger.warn(`CRITICAL (position dropped 10+):`);
          for (const t of critical.slice(0, 5)) {
            logger.warn(`  "${t.query}" on ${t.page} — pos ${t.previousPosition.toFixed(1)} -> ${t.currentPosition.toFixed(1)} (dropped ${t.positionDelta.toFixed(1)} places, ${t.impressions} imp)`);
          }
        }
        if (high.length > 0) {
          logger.warn(`HIGH (position dropped 5-9):`);
          for (const t of high.slice(0, 5)) {
            logger.warn(`  "${t.query}" on ${t.page} — pos ${t.previousPosition.toFixed(1)} -> ${t.currentPosition.toFixed(1)} (dropped ${t.positionDelta.toFixed(1)} places)`);
          }
        }

        const threatInsights = '\n## Competitive Threats (position declining — defend these rankings)\n' +
          threats.slice(0, 8).map(t =>
            `  - "${t.query}" on ${t.page}: pos ${t.previousPosition.toFixed(1)} -> ${t.currentPosition.toFixed(1)} [${t.urgency}]`,
          ).join('\n') +
          '\nConsider creating supporting content for these keywords to reclaim rankings.';
        researchService.setPerformanceInsights(
          researchService.getPerformanceInsights() + threatInsights,
        );
      }
      // Featured snippet opportunity detection — feed into keyword research for optimization
      try {
        const snippetOpps = await gscService.getFeaturedSnippetOpportunities();
        if (snippetOpps.length > 0) {
          const snippetInsight = '\n## Featured Snippet Opportunities\n' +
            snippetOpps.slice(0, 5).map(s =>
              `  - "${s.query}" (pos ${s.position.toFixed(1)}, ${s.impressions} imp, type: ${s.snippetType})`,
            ).join('\n') +
            '\nOptimize content for these queries using paragraph/list/table format matching the snippet type.';
          insightParts.push(snippetInsight);
          // Feed snippet opportunities into content generator for format optimization
          contentService.setSnippetOpportunities(snippetOpps.slice(0, 5));
          logger.info(`Featured snippet: ${snippetOpps.length} opportunity(ies) detected and fed to content generator`);
        }
      } catch (snippetErr) {
        logger.debug(`Featured snippet detection failed: ${snippetErr instanceof Error ? snippetErr.message : snippetErr}`);
      }

      // Keyword cannibalization detection
      try {
        const cannibalized = await gscService.detectCannibalization();
        if (cannibalized.length > 0) {
          logger.warn(`\n=== Keyword Cannibalization: ${cannibalized.length} query(ies) with competing pages ===`);
          for (const c of cannibalized.slice(0, 5)) {
            logger.warn(`  "${c.query}" → ${c.pages.length} pages competing (${c.recommendation})`);
            for (const p of c.pages) {
              logger.warn(`    ${p.page} (pos ${p.position.toFixed(1)}, ${p.clicks} clicks, ${p.impressions} imp)`);
            }
          }
          // Feed cannibalization data into content research to avoid
          const cannibInsight = '\n## Keyword Cannibalization Alert\n' +
            'AVOID these queries — multiple pages already compete:\n' +
            cannibalized.slice(0, 5).map(c => `  - "${c.query}" (${c.recommendation})`).join('\n');
          researchService.setPerformanceInsights(
            researchService.getPerformanceInsights() + cannibInsight,
          );
        }
      } catch (cannibError) {
        logger.debug(`Cannibalization check failed: ${cannibError instanceof Error ? cannibError.message : cannibError}`);
      }
    } catch (error) {
      logger.warn(`GSC integration failed: ${error instanceof Error ? error.message : error}`);
    }
  }

  // 3.5a2. Weekly ranking digest (Mondays only)
  if (gscService && new Date().getDay() === 1 && config.TELEGRAM_BOT_TOKEN && config.TELEGRAM_CHAT_ID) {
    try {
      const digest = await gscService.generateWeeklyRankingDigest();
      if (digest) {
        await sendTelegramAlert(config.TELEGRAM_BOT_TOKEN, config.TELEGRAM_CHAT_ID, digest);
        logger.info('Weekly ranking digest sent to Telegram');
      }
    } catch (digestError) {
      logger.debug(`Weekly ranking digest failed: ${digestError instanceof Error ? digestError.message : digestError}`);
    }
  }

  // 3.5b. Core Web Vitals monitoring (CrUX API)
  if (gscService) {
    try {
      const cwvReport = await gscService.getCoreWebVitals();
      if (cwvReport.overallRating !== 'good') {
        logger.warn(`Core Web Vitals: ${cwvReport.overallRating.toUpperCase()} rating detected`);
        if (cwvReport.lcp && cwvReport.lcp.rating !== 'good') logger.warn(`  LCP: ${cwvReport.lcp.p75}ms (${cwvReport.lcp.rating})`);
        if (cwvReport.inp && cwvReport.inp.rating !== 'good') logger.warn(`  INP: ${cwvReport.inp.p75}ms (${cwvReport.inp.rating})`);
        if (cwvReport.cls && cwvReport.cls.rating !== 'good') logger.warn(`  CLS: ${cwvReport.cls.p75} (${cwvReport.cls.rating})`);
        // Send Telegram alert for CWV issues
        if (config.TELEGRAM_BOT_TOKEN && config.TELEGRAM_CHAT_ID) {
          await sendTelegramAlert(
            config.TELEGRAM_BOT_TOKEN, config.TELEGRAM_CHAT_ID,
            `Core Web Vitals: ${cwvReport.overallRating.toUpperCase()}\n` +
            `LCP: ${cwvReport.lcp?.p75 ?? 'N/A'}ms | INP: ${cwvReport.inp?.p75 ?? 'N/A'}ms | CLS: ${cwvReport.cls?.p75 ?? 'N/A'}`,
          );
        }
      }
    } catch (cwvError) {
      logger.debug(`CWV check failed: ${cwvError instanceof Error ? cwvError.message : cwvError}`);
    }
  }

  // 3.5b2. Weekly PageSpeed Insights per-URL check (Mondays only)
  if (new Date().getDay() === 1) {
    try {
      const recentForPsi = await wpService.getRecentPosts(5);
      const psiUrls = recentForPsi.map(p => p.url).filter(Boolean).slice(0, 5);
      if (psiUrls.length > 0) {
        const psiResults = await seoService.checkPageSpeedBatch(psiUrls);
        const failing = psiResults.filter(r => !r.pass);
        if (failing.length > 0 && config.TELEGRAM_BOT_TOKEN && config.TELEGRAM_CHAT_ID) {
          const psiMsg = `⚠️ PageSpeed Insights Alert\n${failing.length} URL(s) below threshold:\n` +
            failing.map(f => `${f.url}\n  Score: ${f.performanceScore} | LCP: ${f.lcp}ms | CLS: ${f.cls}`).join('\n');
          await sendTelegramAlert(config.TELEGRAM_BOT_TOKEN, config.TELEGRAM_CHAT_ID, psiMsg);
        }
      }
    } catch (psiError) {
      logger.debug(`PageSpeed Insights check failed: ${psiError instanceof Error ? psiError.message : psiError}`);
    }
  }

  // 3.5c. Backlink profile monitoring
  if (gscService) {
    try {
      const backlinkProfile = await gscService.getBacklinkProfile();
      if (backlinkProfile.totalLinks > 0) {
        logger.info(`Backlink profile: ${backlinkProfile.totalLinks} total referral clicks, ${backlinkProfile.topLinkedPages.length} top linked pages`);
        if (backlinkProfile.topLinkedPages.length > 0) {
          logger.info(`  Top linked: ${backlinkProfile.topLinkedPages.slice(0, 3).map(p => `${p.page} (${p.count} clicks)`).join(', ')}`);
        }
      }
    } catch (blError) {
      logger.debug(`Backlink monitoring failed: ${blError instanceof Error ? blError.message : blError}`);
    }
  }

  // 3.5d. Topical authority score per niche (position + CTR + breadth + indexed pages)
  if (gscService) {
    try {
      const nicheUrlPatterns: Record<string, string> = {};
      for (const niche of NICHES) {
        nicheUrlPatterns[niche.category] = niche.id;
      }
      const authorityScores = await gscService.getTopicalAuthorityScore(nicheUrlPatterns);
      if (Object.keys(authorityScores).length > 0) {
        logger.info('Topical authority scores:');
        for (const [niche, data] of Object.entries(authorityScores)) {
          logger.info(`  ${niche}: ${data.score.toFixed(0)}/100 (${data.rating}, pos=${data.avgPosition.toFixed(1)}, ${data.queryCount} queries)`);
        }
      }
    } catch (authError) {
      logger.debug(`Topical authority scoring failed: ${authError instanceof Error ? authError.message : authError}`);
    }
  }

  // 3.5e. Content funnel distribution (TOFU/MOFU/BOFU balance)
  try {
    const funnelDist = history.getFunnelDistribution();
    if (funnelDist.total > 0) {
      const tofuPct = (funnelDist.tofu / funnelDist.total) * 100;
      const mofuPct = (funnelDist.mofu / funnelDist.total) * 100;
      const bofuPct = (funnelDist.bofu / funnelDist.total) * 100;
      logger.info(`Content funnel: TOFU=${funnelDist.tofu} (${tofuPct.toFixed(0)}%) | MOFU=${funnelDist.mofu} (${mofuPct.toFixed(0)}%) | BOFU=${funnelDist.bofu} (${bofuPct.toFixed(0)}%) | Total=${funnelDist.total}`);
      if (bofuPct < 10) {
        logger.warn('Funnel imbalance: BOFU content is below 10%. Consider more transactional/comparison content.');
        insightParts.push('## Funnel Imbalance Alert\nBOFU (bottom-of-funnel) content is critically low. Prioritize comparison, review, and buying-guide content types.');
      }
    }
  } catch (funnelError) {
    logger.debug(`Funnel distribution failed: ${funnelError instanceof Error ? funnelError.message : funnelError}`);
  }

  if (insightParts.length > 0) {
    researchService.setPerformanceInsights(insightParts.join('\n'));
  }

  // 3.6. Fetch existing posts for internal linking + similarity dedup
  const existingPosts = await wpService.getRecentPosts(500);
  // Enrich existing posts with subNiche from history for topic cluster linking
  for (const post of existingPosts) {
    if (post.postId) {
      const entry = history.findByPostId(post.postId);
      if (entry?.niche) {
        post.subNiche = entry.niche;
      }
    }
  }
  logger.info(`Fetched ${existingPosts.length} existing posts for internal linking`);
  researchService.setExistingPosts(existingPosts);

  // Build topic clusters for cluster-aware linking and content gap detection
  topicClusterService.buildClusters(existingPosts, history.getAllEntries(), pillarUrlMap);

  // Generate topical map coverage report (strategic content planning)
  topicClusterService.generateTopicalMapReport();

  // Content priority recommendations from topical map gaps
  for (const niche of activeNiches) {
    try {
      const priorities = topicClusterService.getContentPriority(niche.id, existingPosts);
      if (priorities.length > 0) {
        const critical = priorities.filter(p => p.priority === 'critical');
        const high = priorities.filter(p => p.priority === 'high');
        if (critical.length > 0 || high.length > 0) {
          logger.info(`Content priority [${niche.id}]: ${critical.length} critical, ${high.length} high-priority topics`);
          // Feed top critical/high gaps as seed keywords for research
          const prioritySeeds = priorities
            .filter(p => p.priority === 'critical' || p.priority === 'high')
            .slice(0, 2)
            .map(p => p.topic);
          if (prioritySeeds.length > 0) {
            insightParts.push(`Priority content gaps for ${niche.id}: ${prioritySeeds.join(', ')}`);
          }
        }
      }
    } catch (priErr) {
      logger.debug(`Content priority check skipped for ${niche.id}: ${priErr instanceof Error ? priErr.message : priErr}`);
    }
  }

  // Cluster completeness dashboard: identify high-priority content gaps
  for (const niche of activeNiches) {
    try {
      const completeness = topicClusterService.getClusterCompleteness(niche.id);
      if (completeness && completeness.highPriorityGaps.length > 0) {
        logger.info(`Cluster completeness [${niche.id}]: ${completeness.coveragePct.toFixed(0)}% coverage, ${completeness.highPriorityGaps.length} high-priority gap(s)`);
        if (completeness.insightString) {
          insightParts.push(completeness.insightString);
        }

        // Auto-fill topical map gaps: inject gap topics as priority seed keywords for next batch
        // Only inject seeds for completely uncovered sub-topics (0 posts) to avoid
        // generating near-duplicate content for sub-topics already partially covered.
        const zeroCoverageGaps = completeness.highPriorityGaps.filter(gap =>
          !completeness.subTopicDetails?.find((d: { subTopic: string; postCount: number }) => d.subTopic === gap && d.postCount > 0),
        );
        const gapSeedKeywords = zeroCoverageGaps
          .slice(0, 3) // Top 3 gaps per niche
          .map(gap => `${gap} ${niche.category} guide ${new Date().getFullYear()}`);

        if (gapSeedKeywords.length > 0) {
          // Prepend gap keywords to niche seed keywords so they get priority treatment
          niche.seedKeywords = [...gapSeedKeywords, ...niche.seedKeywords];
          insightParts.push(
            `\n## PRIORITY GAP FILL for ${niche.name}\n` +
            `The following sub-topics have ZERO or very few articles and MUST be prioritized:\n` +
            completeness.highPriorityGaps.slice(0, 3).map(g => `- **${g}**: Needs dedicated content (0-2 existing posts)`).join('\n') +
            `\nSTRONGLY prefer selecting keywords that address these gaps over general topics.`,
          );
          logger.info(`Topical gap auto-fill [${niche.id}]: Injected ${gapSeedKeywords.length} priority seed keywords: ${gapSeedKeywords.join(', ')}`);
        }
      }
    } catch (error) {
      logger.debug(`Cluster completeness check failed for ${niche.id}: ${error instanceof Error ? error.message : error}`);
    }
  }

  // 3.7a. Niche saturation detection — warn if any niche is overrepresented
  const saturation = history.getNicheSaturation(activeNiches.map(n => n.id));
  const saturatedNiches = Object.entries(saturation).filter(([, s]) => s.saturated);
  if (saturatedNiches.length > 0) {
    for (const [nicheId, data] of saturatedNiches) {
      logger.warn(`Niche saturation: "${nicheId}" has ${data.pct}% of all posts (${data.count} total). Consider diversifying.`);
    }
    // Feed saturation data to keyword research
    const satInsight = '\n## Niche Saturation Alert\n' +
      saturatedNiches.map(([id, d]) => `- "${id}": ${d.pct}% of all posts (OVER-REPRESENTED — deprioritize unless high RPM)`).join('\n') +
      '\nFor saturated niches, only publish if the keyword fills a genuine gap or has exceptional search demand.';
    insightParts.push(satInsight);
  }

  // Log series opportunities for each active niche
  for (const niche of activeNiches) {
    const seriesOpps = topicClusterService.getSeriesOpportunities(niche.id);
    if (seriesOpps.length > 0) {
      const highPriority = seriesOpps.filter(s => s.priority === 'high');
      if (highPriority.length > 0) {
        logger.info(`Series opportunities for ${niche.id}: ${highPriority.map(s => s.seriesName).join(', ')}`);
      }
    }

    // Pillar→satellite content sequencing advice
    const sequenceAdvice = topicClusterService.getPillarSequencingAdvice(niche.id, existingPosts, pillarUrlMap);
    if (sequenceAdvice) {
      logger.info(`Sequencing [${niche.id}]: ${sequenceAdvice.advice} (${sequenceAdvice.satelliteCount} satellites)`);
      if (sequenceAdvice.shouldCreatePillar) {
        insightParts.push(`\n## Pillar Sequencing: ${niche.name}\n${sequenceAdvice.advice}\nPrioritize creating a pillar page for this niche.`);
      }
    }
  }

  // 3.7b. Competitor gap analysis: reuse cached GSC data (no duplicate API calls)
  if (cachedStrikingDistance.length > 0 || cachedTopQueries.length > 0) {
    try {
      const gapStriking = cachedStrikingDistance;
      const gapTopQueries = cachedTopQueries;
      if (gapStriking.length > 0 || gapTopQueries.length > 0) {
        const competitorGaps = topicClusterService.analyzeCompetitorGaps(gapStriking, gapTopQueries, existingPosts);
        if (competitorGaps.length > 0) {
          // Revenue-weighted gap scoring: prioritize gaps in high-RPM niches
          const rpmWeightedGaps = competitorGaps
            .filter(g => g.opportunity === 'create' && g.priority === 'high')
            .map(g => {
              // Match gap query to niche by checking which niche it belongs to
              const matchedNiche = NICHES.find(n => {
                const kwLower = g.query.toLowerCase();
                return n.seedKeywords.some(s => kwLower.includes(s.toLowerCase().split(' ')[0])) ||
                  kwLower.includes(n.category.toLowerCase().replace('korean ', '').replace('k-', ''));
              });
              const rpm = matchedNiche?.dynamicRpmValue || 3;
              const revenueScore = g.estimatedTraffic * rpm / 1000;
              return { ...g, rpm, revenueScore, niche: matchedNiche?.category || 'Unknown' };
            })
            .sort((a, b) => b.revenueScore - a.revenueScore)
            .slice(0, 5);

          if (rpmWeightedGaps.length > 0) {
            const gapInsight = `\n## Content Gap Opportunities (revenue-weighted)\n` +
              rpmWeightedGaps.map(g =>
                `- "${g.query}" (${g.estimatedTraffic} est. traffic, $${g.rpm.toFixed(2)} RPM, est. revenue: $${g.revenueScore.toFixed(2)}/mo) [${g.niche}]`,
              ).join('\n') +
              '\nPrioritize high-revenue gaps when selecting keywords.';
            researchService.setPerformanceInsights(
              researchService.getPerformanceInsights() + gapInsight,
            );
          }
        }
      }
    } catch (error) {
      logger.warn(`Competitor gap analysis failed: ${error instanceof Error ? error.message : error}`);
    }
  }

  // 4. Two-phase pipeline
  //    Phase A: Research + Content Generation back-to-back (maximises prompt cache HITs)
  //    Phase B: Images + Publish for each generated post
  const results: PostResult[] = [];
  let skippedCount = 0;

  interface GeneratedPost {
    niche: typeof NICHES[number];
    postStart: number;
    researched: Awaited<ReturnType<typeof researchService.researchKeyword>>;
    content: Awaited<ReturnType<typeof contentService.generateContent>>;
    fastTrack?: boolean;
    selectedPersona?: import('./types/index.js').AuthorProfile;
  }

  // Cross-niche keyword tracking (prevent different niches from picking similar topics in same batch)
  const batchKeywords: string[] = [];

  // [#3] Seasonal content calendar: inject seasonal hints into keyword research
  const seasonalSuggestions = getSeasonalContentSuggestions();
  if (seasonalSuggestions.length > 0) {
    logger.info(`Seasonal calendar: ${seasonalSuggestions.length} upcoming event(s)`);
    for (const s of seasonalSuggestions) {
      logger.info(`  ${s.eventName} in ${s.daysUntilEvent}d → niches: ${s.relevantNiches.join(', ')}`);
    }
  }

  // [#10] GSC ranking keywords for anchor text optimization
  let gscRankingKeywords = new Map<string, { keyword: string; position: number; impressions: number }>();
  if (gscService) {
    try {
      gscRankingKeywords = await gscService.getRankingKeywordsForPages(200);
      if (gscRankingKeywords.size > 0) {
        logger.info(`GSC: Loaded ${gscRankingKeywords.size} ranking keywords for anchor text optimization`);
      }
    } catch (error) {
      logger.debug(`GSC ranking keywords fetch failed: ${error instanceof Error ? error.message : error}`);
    }
  }

  // ── Batch Checkpoint: Resume from crash if checkpoint exists ──────────
  const checkpoint = await history.loadCheckpoint();
  let checkpointResumeIdx = 0;
  if (checkpoint) {
    checkpointResumeIdx = checkpoint.currentNicheIdx + 1;
    logger.info(`Batch checkpoint found: resuming from niche index ${checkpointResumeIdx} (${checkpoint.completedNiches.join(', ')} already done)`);
    // Pre-fill results for already-completed niches so batch summary is accurate
    for (let ci = 0; ci < checkpointResumeIdx && ci < activeNiches.length; ci++) {
      results.push({ keyword: activeNiches[ci].name, niche: activeNiches[ci].id, success: true, duration: 0 });
    }
  }

  // ── Phase A: Research + Content Generation ──────────────────────────────
  logger.info('\n=== Phase A: Research + Content Generation (prompt-cache optimised) ===');
  const generated: GeneratedPost[] = [];
  const failedNiches: Array<{ niche: typeof NICHES[number]; resultIndex: number }> = [];

  for (let nicheIdx = 0; nicheIdx < activeNiches.length; nicheIdx++) {
    const niche = activeNiches[nicheIdx];
    const postStart = Date.now();

    // Skip niches already processed in checkpoint
    if (nicheIdx < checkpointResumeIdx) {
      logger.info(`[Phase A] Skipping "${niche.name}" (checkpoint: already processed)`);
      continue;
    }

    logger.info(`\n[Phase A] Niche: "${niche.name}"`);

    // Rate limit: 5s delay between niches to avoid Claude API throttling (except first)
    if (nicheIdx > 0) {
      await new Promise(r => setTimeout(r, 5000));
    }

    // Set per-niche content type distribution for diversity-aware keyword selection
    const allContentTypes = history.getRecentContentTypes(niche.id, 999);
    if (allContentTypes.length > 0) {
      const dist: Record<string, number> = {};
      for (const ct of allContentTypes) dist[ct] = (dist[ct] || 0) + 1;
      researchService.setContentTypeDistribution(dist);
    }
    // Per-category content type distribution (detect >70% dominance per category)
    if (nicheIdx === 0) {
      const categoryDist: Record<string, Record<string, number>> = {};
      for (const n of activeNiches) {
        const cts = history.getRecentContentTypes(n.id, 999);
        if (cts.length >= 3) {
          const d: Record<string, number> = {};
          for (const ct of cts) d[ct] = (d[ct] || 0) + 1;
          categoryDist[n.name] = d;
        }
      }
      if (Object.keys(categoryDist).length > 0) {
        researchService.setCategoryContentTypeDistribution(categoryDist);
      }
    }

    try {
      // A-1. Keyword research with duplicate retry loop (up to 3 attempts)
      const MAX_KEYWORD_ATTEMPTS = 3;
      let researched: Awaited<ReturnType<typeof researchService.researchKeyword>> | null = null;
      let hasBreakout = false;
      const rejectedDupKeywords: string[] = [];

      for (let kwAttempt = 1; kwAttempt <= MAX_KEYWORD_ATTEMPTS; kwAttempt++) {
        const postedKeywords = [...history.getPostedKeywordsForNiche(niche.id), ...batchKeywords, ...rejectedDupKeywords];
        const recentContentTypes = history.getRecentContentTypes(niche.id, 5);
        const candidate = await researchService.researchKeyword(niche, postedKeywords, recentContentTypes);

        // A-1.5. Fast-track breakout trends — bypass scheduling for breaking news
        hasBreakout = candidate.trendsData.some(t => t.hasBreakout);
        if (hasBreakout) {
          logger.info(`⚡ BREAKING TREND detected for "${candidate.analysis.selectedKeyword}" — fast-tracking publication`);
          if (candidate.analysis.contentType !== 'news-explainer' && niche.contentTypes.includes('news-explainer')) {
            candidate.analysis.contentType = 'news-explainer';
            logger.info(`  Content type switched to news-explainer for breakout trend`);
          }
        }

        // A-2. Check if already posted (history file)
        if (history.isPosted(candidate.analysis.selectedKeyword, niche.id)) {
          logger.warn(`Attempt ${kwAttempt}/${MAX_KEYWORD_ATTEMPTS}: Already posted "${candidate.analysis.selectedKeyword}", retrying with different keyword...`);
          rejectedDupKeywords.push(candidate.analysis.selectedKeyword);
          continue;
        }

        // WordPress meta fallback: check existing posts for keyword/title overlap
        const kwLower = candidate.analysis.selectedKeyword.toLowerCase();
        const wpDuplicate = existingPosts.find(p => {
          const titleMatch = p.title.toLowerCase().includes(kwLower) || kwLower.includes(p.title.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim());
          const keywordMatch = p.keyword && (p.keyword.toLowerCase() === kwLower || p.keyword.toLowerCase().includes(kwLower));
          return titleMatch || keywordMatch;
        });
        if (wpDuplicate) {
          logger.warn(`Attempt ${kwAttempt}/${MAX_KEYWORD_ATTEMPTS}: WordPress duplicate "${candidate.analysis.selectedKeyword}" matches "${wpDuplicate.title}". Retrying...`);
          rejectedDupKeywords.push(candidate.analysis.selectedKeyword);
          continue;
        }

        // Pre-generation title similarity check: reject keyword if too similar to any existing post title
        // This prevents wasting API calls on content that will be rejected after generation
        const postedTitles = history.getPostedTitlesForNiche(niche.id);
        const suggestedTitle = candidate.analysis.suggestedTitle || candidate.analysis.selectedKeyword;
        const similarTitle = postedTitles.find(t => history.titleSimilarity(t, suggestedTitle) >= 0.6);
        if (similarTitle) {
          logger.warn(`Attempt ${kwAttempt}/${MAX_KEYWORD_ATTEMPTS}: Keyword pre-check rejected "${candidate.analysis.selectedKeyword}" — title too similar to "${similarTitle}". Retrying...`);
          rejectedDupKeywords.push(candidate.analysis.selectedKeyword);
          continue;
        }

        // Passed all checks — use this keyword
        researched = candidate;
        break;
      }

      if (!researched) {
        logger.warn(`All ${MAX_KEYWORD_ATTEMPTS} keyword attempts duplicated for "${niche.name}", skipping niche`);
        skippedCount++;
        continue;
      }

      // A-3. Generate content — runs back-to-back across all niches for cache HITs
      const nichePosts = existingPosts
        .filter((p) => p.category.toLowerCase() === niche.category.toLowerCase())
        .slice(0, 30);
      const otherPosts = existingPosts
        .filter((p) => p.category.toLowerCase() !== niche.category.toLowerCase())
        .slice(0, 20);
      const filteredPosts = [...nichePosts, ...otherPosts];

      // Get cluster links for topic cluster strengthening
      const clusterLinks = topicClusterService.getClusterLinks(niche.id, researched.analysis.selectedKeyword, 5);
      const clusterLinksForPrompt = clusterLinks.map(cl => ({ url: cl.url, title: cl.title, keyword: cl.keyword }));

      // Select author persona based on content type
      const postCount = history.getPostedKeywordsForNiche(niche.id).length;
      const selectedPersona = contentService.selectAuthorPersona(niche.category, researched.analysis.contentType, postCount);

      // Gather similar post titles for content differentiation prompt
      const similarPostTitles = history.getPostedTitlesForNiche(niche.id)
        .filter(t => history.titleSimilarity(t, researched.analysis.suggestedTitle) > 0.25)
        .slice(0, 5);
      if (similarPostTitles.length > 0) {
        logger.info(`Found ${similarPostTitles.length} similar post(s) for differentiation: ${similarPostTitles.map(t => `"${t}"`).join(', ')}`);
      }

      const content = await contentService.generateContent(researched, filteredPosts, clusterLinksForPrompt, { postCount, rankingKeywords: gscRankingKeywords, similarPostTitles });
      generated.push({ niche, postStart, researched, content, fastTrack: hasBreakout, selectedPersona });

      // Track keyword for cross-niche dedup
      batchKeywords.push(researched.analysis.selectedKeyword);

      // Save checkpoint after each successful niche (crash recovery)
      await history.saveCheckpoint({
        batchId: startedAt,
        completedNiches: activeNiches.slice(0, nicheIdx + 1).map(n => n.id),
        currentNicheIdx: nicheIdx,
        generatedPosts: generated.length,
        publishedPosts: results.filter(r => r.success).length,
        startedAt,
      });
    } catch (error) {
      const message = axios.isAxiosError(error)
        ? `${error.response?.status} ${JSON.stringify(error.response?.data ?? error.message)}`
        : (error instanceof Error ? error.message : String(error));
      logger.error(`[Phase A] Failed "${niche.name}": ${message}`);
      const resultIdx = results.length;
      results.push({ keyword: niche.name, niche: niche.id, success: false, error: message, duration: Date.now() - postStart });
      failedNiches.push({ niche, resultIndex: resultIdx });
    }
  }

  // ── Phase A Retry: One retry attempt for failed niches ──────────────────
  if (failedNiches.length > 0) {
    logger.info(`\n=== Phase A Retry: ${failedNiches.length} failed niche(s) ===`);
    for (const { niche, resultIndex } of failedNiches) {
      const retryStart = Date.now();
      logger.info(`[Retry] Niche: "${niche.name}"`);
      try {
        const postedKeywords = [...history.getPostedKeywordsForNiche(niche.id), ...batchKeywords];
        const recentContentTypes = history.getRecentContentTypes(niche.id, 5);
        const researched = await researchService.researchKeyword(niche, postedKeywords, recentContentTypes);

        if (history.isPosted(researched.analysis.selectedKeyword, niche.id)) {
          logger.info(`[Retry] Already posted: "${researched.analysis.selectedKeyword}", skipping`);
          continue;
        }

        const nichePosts = existingPosts
          .filter((p) => p.category.toLowerCase() === niche.category.toLowerCase())
          .slice(0, 30);
        const otherPosts = existingPosts
          .filter((p) => p.category.toLowerCase() !== niche.category.toLowerCase())
          .slice(0, 20);
        const filteredPosts = [...nichePosts, ...otherPosts];

        const retryClusterLinks = topicClusterService.getClusterLinks(niche.id, researched.analysis.selectedKeyword, 5);
        const retryClusterLinksForPrompt = retryClusterLinks.map(cl => ({ url: cl.url, title: cl.title, keyword: cl.keyword }));

        const retryPostCount = history.getPostedKeywordsForNiche(niche.id).length;
        const retryPersona = contentService.selectAuthorPersona(niche.category, researched.analysis.contentType, retryPostCount);

        const retrySimilarTitles = history.getPostedTitlesForNiche(niche.id)
          .filter(t => history.titleSimilarity(t, researched.analysis.suggestedTitle) > 0.25)
          .slice(0, 5);
        const content = await contentService.generateContent(researched, filteredPosts, retryClusterLinksForPrompt, { postCount: retryPostCount, rankingKeywords: gscRankingKeywords, similarPostTitles: retrySimilarTitles });
        generated.push({ niche, postStart: retryStart, researched, content, selectedPersona: retryPersona });
        batchKeywords.push(researched.analysis.selectedKeyword);

        // Replace failure result with pending success
        results[resultIndex] = { keyword: researched.analysis.selectedKeyword, niche: niche.id, success: false, error: 'retry-pending', duration: 0 };
        logger.info(`[Retry] Success for "${niche.name}" — will publish in Phase B`);
      } catch (retryError) {
        const msg = retryError instanceof Error ? retryError.message : String(retryError);
        logger.warn(`[Retry] Failed again for "${niche.name}": ${msg}`);
      }
    }
  }

  // ── Batch Duplicate Check ──────────────────────────────────────────────
  if (generated.length >= 2) {
    const { detectBatchDuplicates } = await import('./utils/content-validator.js');
    const articles = generated.map(g => ({
      title: g.content.title,
      keyword: g.researched.analysis.selectedKeyword,
      html: g.content.html,
    }));
    const duplicates = detectBatchDuplicates(articles);
    if (duplicates.length > 0) {
      logger.warn(`Batch duplicate check: ${duplicates.length} similar article pair(s) detected — consider diversifying topics`);
    }
  }

  // ── Phase B: Images + Publish ──────────────────────────────────────────
  logger.info('\n=== Phase B: Images + Publish ===');
  // Ensure minimum 30-minute interval between posts (even if config is 0) to avoid spam
  const publishInterval = Math.max(config.PUBLISH_INTERVAL_MINUTES, 30);
  logger.info(`Publish scheduling: ${publishInterval}-minute intervals between posts${config.PUBLISH_INTERVAL_MINUTES < 30 ? ' (enforced minimum 30 min)' : ''}`);

  // Optimal publish time calculation (#14) — GA4-driven > niche-specific > config fallback
  const publishTz = config.PUBLISH_TIMEZONE;
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  logger.info(`Base publish hour: ${ga4OptimalHour ?? config.PUBLISH_OPTIMAL_HOUR}:00 ${publishTz}${ga4OptimalHour !== null ? ' (GA4-detected)' : ' (config default)'}${ga4OptimalDay !== null ? ` | Best day: ${dayNames[ga4OptimalDay]}` : ''}`);
  logger.info(`Per-niche timing enabled: ${Object.keys(CATEGORY_PUBLISH_TIMING).length} categories configured`);

  // Track which categories are scheduled on which dates to prevent same-day same-category publishing
  const categoryDateMap = new Map<string, Set<string>>(); // category → Set of date strings (YYYY-MM-DD)

  for (let gi = 0; gi < generated.length; gi++) {
    const { niche, postStart, researched, content, fastTrack, selectedPersona } = generated[gi];
    // Reset publish status per post (fact-check may have forced draft on previous post)
    effectivePublishStatus = config.PUBLISH_STATUS as 'publish' | 'draft';
    logger.info(`\n[Phase B] Niche: "${niche.name}"${fastTrack ? ' [FAST-TRACK]' : ''}`);

    // Calculate scheduled date: niche-specific timing > GA4-driven > config fallback
    // Fast-track breakout trends bypass scheduling (publish immediately)
    let scheduledDate: string | undefined;
    if (fastTrack) {
      scheduledDate = undefined; // Immediate publish
      logger.info(`Fast-track: Bypassing scheduling for breakout trend "${researched.analysis.selectedKeyword}"`);
    } else {
      const now = new Date();
      // Use niche-specific timing if no GA4 data, otherwise GA4 takes priority
      const nicheTiming = CATEGORY_PUBLISH_TIMING[niche.category];
      const optimalHour = ga4OptimalHour ?? nicheTiming?.optimalHour ?? config.PUBLISH_OPTIMAL_HOUR;
      const optimalDay = ga4OptimalDay ?? nicheTiming?.bestDays?.[0] ?? null;
      const timingSource = ga4OptimalHour !== null ? 'GA4' : nicheTiming ? `niche:${niche.category}` : 'config';

      // Build a target date at optimal hour in the configured timezone
      const tzFormatter = new Intl.DateTimeFormat('en-US', {
        timeZone: publishTz,
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
      });
      const tzParts = tzFormatter.formatToParts(now);
      const getPart = (type: string) => tzParts.find(p => p.type === type)?.value || '0';
      const tzYear = parseInt(getPart('year'));
      const tzMonth = parseInt(getPart('month')) - 1;
      const tzDay = parseInt(getPart('day'));
      const tzHour = parseInt(getPart('hour'));
      // Build target date in the configured timezone
      const targetDate = new Date(now);
      const tzOffset = now.getTime() - new Date(tzYear, tzMonth, tzDay, tzHour, parseInt(getPart('minute')), parseInt(getPart('second'))).getTime();
      targetDate.setTime(new Date(tzYear, tzMonth, tzDay, optimalHour, 0, 0).getTime() + tzOffset);
      // If target time has passed today, schedule for tomorrow
      if (targetDate.getTime() <= now.getTime()) {
        targetDate.setDate(targetDate.getDate() + 1);
      }
      // If optimal day is detected, shift to the next occurrence of that day
      if (optimalDay !== null) {
        const currentDay = targetDate.getDay();
        const daysUntilOptimal = (optimalDay - currentDay + 7) % 7;
        if (daysUntilOptimal > 0) {
          targetDate.setDate(targetDate.getDate() + daysUntilOptimal);
          logger.debug(`Scheduling shifted to ${dayNames[optimalDay]} (${daysUntilOptimal} day(s) ahead) [${timingSource}]`);
        }
      }
      // Add interval offset per post
      const scheduleTime = new Date(targetDate.getTime() + gi * publishInterval * 60 * 1000);

      // Prevent same-day same-category publishing to avoid keyword cannibalization
      const category = niche.category;
      const scheduleDateStr = scheduleTime.toISOString().slice(0, 10); // YYYY-MM-DD
      const existingDates = categoryDateMap.get(category) ?? new Set<string>();
      if (existingDates.has(scheduleDateStr)) {
        // Shift to the next day at the same hour
        scheduleTime.setDate(scheduleTime.getDate() + 1);
        logger.info(`Same-day collision for "${category}" on ${scheduleDateStr}, shifted to ${scheduleTime.toISOString().slice(0, 10)}`);
      }
      const finalDateStr = scheduleTime.toISOString().slice(0, 10);
      existingDates.add(finalDateStr);
      categoryDateMap.set(category, existingDates);

      scheduledDate = scheduleTime.toISOString();
      logger.info(`Scheduling "${niche.category}" for: ${scheduleTime.toLocaleString('en-US', { timeZone: publishTz })} (${publishTz}) [${timingSource}]`);
    }

    // Manual Review Mode: ensure scheduled date is at least 24h out for review window
    if (manualReviewDelayMs > 0) {
      const minPublishTime = new Date(Date.now() + manualReviewDelayMs);
      if (!scheduledDate || new Date(scheduledDate).getTime() < minPublishTime.getTime()) {
        scheduledDate = minPublishTime.toISOString();
        logger.info(`Manual Review: auto-publish scheduled for ${minPublishTime.toLocaleString('en-US', { timeZone: publishTz })} (24h review window)`);
      }
    }

    try {
      // B-1. Generate images (Gemini)
      const images = await imageService.generateImages(content.imagePrompts);

      // B-2. Upload featured image (MANDATORY)
      const keyword = researched.analysis.selectedKeyword;
      let featuredMediaResult: MediaUploadResult | undefined;
      if (images.featured.length > 0) {
        const filename = ImageGeneratorService.buildFilename(keyword, 'featured', config.IMAGE_FORMAT);
        // Featured image ALT: keyword-optimized for image search + caption readability
        const caption = content.imageCaptions?.[0] ?? content.title;
        const captionLower = caption.toLowerCase();
        const keywordLower = keyword.toLowerCase();
        const kwWords = keywordLower.split(' ').filter(w => w.length > 3);
        let altText: string;
        if (captionLower.includes(keywordLower) || kwWords.some(w => captionLower.includes(w))) {
          altText = caption;
        } else {
          // Add keyword context for image search discoverability
          const combined = `${caption} — ${keyword}`;
          altText = combined.length > 125 ? `${caption} — South Korea` : combined;
        }
        featuredMediaResult = await wpService.uploadMedia(images.featured, filename, altText);
      }
      if (!featuredMediaResult) {
        logger.warn(`Featured image generation failed for "${keyword}", attempting WebP fallback`);
        const safeKeyword = keyword.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const categoryLabel = niche.category.replace(/&/g, '&amp;');
        // Use category-specific gradient colors for visual variety
        const gradients: Record<string, [string, string]> = {
          'Korean Tech': ['#1a1a2e', '#16213e'],
          'K-Entertainment': ['#2d1b69', '#6b21a8'],
          'Korean Finance': ['#0c4a6e', '#0369a1'],
          'Korean Food': ['#7c2d12', '#c2410c'],
          'Korea Travel': ['#14532d', '#15803d'],
          'Korean Language': ['#4a1d96', '#7c3aed'],
        };
        const [c1, c2] = gradients[niche.category] || ['#0052CC', '#0066FF'];
        // Split long keywords into two lines to prevent SVG text overflow
        const kwWords = safeKeyword.split(' ');
        let kwLine1 = '';
        let kwLine2 = '';
        for (const word of kwWords) {
          if (kwLine1.length + word.length < 35 || kwLine1.length === 0) {
            kwLine1 += (kwLine1 ? ' ' : '') + word;
          } else {
            kwLine2 += (kwLine2 ? ' ' : '') + word;
          }
        }
        if (kwLine2.length > 40) kwLine2 = kwLine2.substring(0, 37) + '...';
        const svgSource = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675" viewBox="0 0 1200 675">
            <defs>
              <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" style="stop-color:${c1}"/>
                <stop offset="100%" style="stop-color:${c2}"/>
              </linearGradient>
              <pattern id="grid" width="60" height="60" patternUnits="userSpaceOnUse">
                <path d="M 60 0 L 0 0 0 60" fill="none" stroke="rgba(255,255,255,0.03)" stroke-width="1"/>
              </pattern>
            </defs>
            <rect width="1200" height="675" fill="url(#bg)"/>
            <rect width="1200" height="675" fill="url(#grid)"/>
            <circle cx="100" cy="100" r="200" fill="rgba(255,255,255,0.03)"/>
            <circle cx="1100" cy="575" r="250" fill="rgba(255,255,255,0.03)"/>
            <!-- Site branding bar -->
            <rect x="0" y="0" width="1200" height="50" fill="rgba(0,0,0,0.3)"/>
            <text x="40" y="33" fill="rgba(255,255,255,0.9)" font-family="system-ui,sans-serif" font-size="16" font-weight="bold">${config.SITE_NAME}</text>
            <!-- Category label pill -->
            <rect x="900" y="12" width="${Math.max(categoryLabel.length * 10 + 24, 100)}" height="28" rx="14" fill="rgba(255,255,255,0.2)"/>
            <text x="${900 + Math.max(categoryLabel.length * 10 + 24, 100) / 2}" y="31" text-anchor="middle" fill="rgba(255,255,255,0.9)" font-family="system-ui,sans-serif" font-size="12" font-weight="600">${categoryLabel}</text>
            <rect x="80" y="190" width="1040" height="300" rx="20" fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.1)" stroke-width="1"/>
            <text x="600" y="${kwLine2 ? '280' : '310'}" text-anchor="middle" fill="#fff" font-family="system-ui,sans-serif" font-size="36" font-weight="bold">${kwLine1}</text>
            ${kwLine2 ? `<text x="600" y="330" text-anchor="middle" fill="#fff" font-family="system-ui,sans-serif" font-size="36" font-weight="bold">${kwLine2}</text>` : ''}
            <line x1="520" y1="${kwLine2 ? '355' : '340'}" x2="680" y2="${kwLine2 ? '355' : '340'}" stroke="rgba(255,255,255,0.4)" stroke-width="2"/>
            <text x="600" y="${kwLine2 ? '390' : '375'}" text-anchor="middle" fill="rgba(255,255,255,0.7)" font-family="system-ui,sans-serif" font-size="20">${categoryLabel}</text>
            <text x="600" y="${kwLine2 ? '445' : '430'}" text-anchor="middle" fill="rgba(255,255,255,0.4)" font-family="system-ui,sans-serif" font-size="15">${config.SITE_NAME}</text>
          </svg>`;
        // Convert SVG to configured image format via sharp for Google Image Search compatibility
        try {
          const { default: sharp } = await import('sharp');
          const pipeline = sharp(Buffer.from(svgSource)).resize(1200, 675);
          const fallbackBuffer = config.IMAGE_FORMAT === 'avif'
            ? await pipeline.avif({ quality: 75 }).toBuffer()
            : await pipeline.webp({ quality: 85 }).toBuffer();
          const filename = ImageGeneratorService.buildFilename(keyword, 'featured', config.IMAGE_FORMAT);
          featuredMediaResult = await wpService.uploadMedia(fallbackBuffer, filename, `${keyword} featured image`);
          logger.info(`Fallback ${config.IMAGE_FORMAT.toUpperCase()} placeholder uploaded for "${keyword}" (${(fallbackBuffer.length / 1024).toFixed(0)}KB)`);
        } catch (fallbackError) {
          logger.warn(`All image generation attempts failed for "${keyword}": ${fallbackError instanceof Error ? fallbackError.message : fallbackError}. Publishing without featured image.`);
        }
      }

      // B-3. Upload inline images (graceful)
      const inlineImages: Array<{ url: string; caption: string }> = [];
      for (let i = 0; i < images.inline.length; i++) {
        try {
          if (images.inline[i].length > 0) {
            const filename = ImageGeneratorService.buildFilename(keyword, `section-${i + 1}`, config.IMAGE_FORMAT);
            const caption = content.imageCaptions?.[i + 1] ?? `${content.title} image ${i + 1}`;
            // ALT text: prefer caption (human-readable) over image prompt (machine instruction)
            const altText = caption.length > 125 ? caption.slice(0, 122) + '...' : caption;
            const mediaResult = await wpService.uploadMedia(images.inline[i], filename, altText);
            inlineImages.push({ url: mediaResult.sourceUrl, caption });
          }
        } catch (error) {
          logger.warn(`Inline image ${i + 1} upload failed, skipping: ${error instanceof Error ? error.message : error}`);
        }
      }

      // B-3.5. Use featured image as OG image (better social CTR than generated text overlays)
      const ogImageUrl = featuredMediaResult?.sourceUrl || '';

      // B-3.7. Generate cluster navigation HTML for related articles
      const clusterNavHtml = topicClusterService.generateClusterNavHtml(niche.id, '');

      // B-3.7b. Pre-publish title similarity check against existing posts
      {
        const existingTitles = history.getPostedTitlesForNiche(niche.id);
        let titleBlocked = false;
        for (const existingTitle of existingTitles) {
          const sim = history.titleSimilarity(content.title, existingTitle);
          if (sim >= 0.6) {
            logger.error(`Title too similar: "${content.title}" is ${(sim * 100).toFixed(0)}% similar to existing "${existingTitle}". Skipping publish.`);
            results.push({ keyword: researched.analysis.selectedKeyword, niche: niche.id, success: false, error: `Title similarity: ${(sim * 100).toFixed(0)}% match with "${existingTitle}"`, duration: Date.now() - postStart });
            titleBlocked = true;
            break;
          }
          if (sim >= 0.4) {
            logger.warn(`Title overlap warning: "${content.title}" is ${(sim * 100).toFixed(0)}% similar to existing "${existingTitle}". Publishing with caution.`);
          }
        }
        if (titleBlocked) continue;
      }

      // B-3.8. Pre-publish plagiarism check against existing posts (thresholds: hard block 40%, warning 20%)
      try {
        const { detectPlagiarism } = await import('./utils/content-validator.js');
        const plagiarismMatches = detectPlagiarism(content.html, existingPosts, 0.20);
        if (plagiarismMatches.length > 0) {
          const topMatch = plagiarismMatches[0];
          if (topMatch.similarity > 0.4) {
            logger.error(`High plagiarism risk: "${content.title}" is ${(topMatch.similarity * 100).toFixed(0)}% similar to "${topMatch.title}". Skipping publish.`);
            results.push({ keyword: researched.analysis.selectedKeyword, niche: niche.id, success: false, error: `Plagiarism: ${(topMatch.similarity * 100).toFixed(0)}% match with "${topMatch.title}"`, duration: Date.now() - postStart });
            continue;
          }
          logger.warn(`Moderate content overlap detected: "${content.title}" is ${(topMatch.similarity * 100).toFixed(0)}% similar to "${topMatch.title}". Publishing with caution.`);
        }
      } catch (plagError) {
        logger.debug(`Plagiarism check skipped: ${plagError instanceof Error ? plagError.message : plagError}`);
      }

      // B-3.9. Pre-publish fact verification (critical errors → force draft)
      let factCheckClaims: Array<{ claim: string; correction: string }> = [];
      try {
        const factResult = await factCheckService.verifyContent(content.html, niche.category);
        if (factResult.corrections.length > 0) {
          factCheckClaims = factResult.corrections;
        }
        if (factResult.flagged.length > 0) {
          logger.warn(`Fact-check: ${factResult.flagged.length} issue(s) detected for "${content.title}"`);
          // Apply auto-corrections where possible
          if (factResult.corrections.length > 0) {
            content.html = factCheckService.applyCorrections(content.html, factResult.corrections);
          }
          // Critical fact errors → force draft to prevent publishing inaccurate data
          if (factResult.hasCriticalErrors) {
            logger.warn(`Fact-check: Forcing draft status due to ${factResult.criticalCount} critical factual errors`);
            effectivePublishStatus = 'draft';
            if (config.TELEGRAM_BOT_TOKEN && config.TELEGRAM_CHAT_ID) {
              await sendQualityAlert(
                config.TELEGRAM_BOT_TOKEN, config.TELEGRAM_CHAT_ID, content.title, '',
                content.qualityScore || 0, config.MIN_QUALITY_SCORE,
                [`${factResult.criticalCount} critical fact-check errors`, ...factResult.flagged.slice(0, 3)],
              );
            }
          }
        }
      } catch (factError) {
        logger.debug(`Fact-check skipped: ${factError instanceof Error ? factError.message : factError}`);
      }

      // B-3.95. Inject data visualization charts for Finance/Tech categories
      // Inject data visualization charts for Finance/Tech categories
      if (['Korean Finance', 'Korean Tech'].includes(niche.category)) {
        try {
          let chartSvg = '';
          if (niche.category === 'Korean Finance') {
            chartSvg = await dataVizService.generateKospiChart();
          } else {
            chartSvg = await dataVizService.generateExchangeRateChart();
          }
          if (chartSvg) {
            content.html = wpService.injectDataChart(content.html, chartSvg, niche.category);
            logger.info(`Data chart injected for ${niche.category} post`);
          }
        } catch (chartError) {
          logger.debug(`Data chart injection skipped: ${chartError instanceof Error ? chartError.message : chartError}`);
        }

        // Inject infographic for data-rich content
        try {
          const dataPoints = extractDataPoints(content.html);
          if (dataPoints.length >= 3) {
            const infographicSvg = dataVizService.generateInfoGraphic(
              content.title, dataPoints, niche.category,
            );
            if (infographicSvg) {
              content.html = wpService.injectDataChart(content.html, infographicSvg, niche.category);
              logger.info(`Infographic injected with ${dataPoints.length} data points`);
            }
          }
        } catch (infoErr) {
          logger.debug(`Infographic skipped: ${infoErr instanceof Error ? infoErr.message : infoErr}`);
        }
      }

      // Engagement poll injection (if content generated a poll question)
      if (content.pollQuestion) {
        content.html = wpService.injectEngagementPoll(content.html, content.pollQuestion, researched.analysis.selectedKeyword, niche.category);
        logger.debug(`Engagement poll injected for "${researched.analysis.selectedKeyword}"`);
      }

      // Interactive calculator injection (Finance/K-Beauty)
      if (['Korean Finance', 'K-Beauty'].includes(niche.category)) {
        content.html = wpService.injectInteractiveCalculator(content.html, niche.category);
        logger.debug(`Interactive calculator injected for ${niche.category}`);
      }

      // Contextual affiliate link injection
      if (content.productMentions && content.productMentions.length > 0) {
        const affiliateMap = config.AFFILIATE_MAP ? (() => { try { return JSON.parse(config.AFFILIATE_MAP); } catch { return {}; } })() : {};
        if (Object.keys(affiliateMap).length > 0) {
          content.html = wpService.injectContextualAffiliateLinks(content.html, niche.category, affiliateMap);
          logger.debug(`Contextual affiliate links injected for "${researched.analysis.selectedKeyword}"`);
        }
      }

      // YouTube video embed (search for relevant video and inject responsive embed)
      if (config.YOUTUBE_API_KEY) {
        try {
          // Fallback query chain: specific → niche-level → broad niche
          const ytQueries = [
            `${researched.analysis.selectedKeyword} ${new Date().getFullYear()}`,
            `${niche.name} ${new Date().getFullYear()}`,
            niche.broadTerm,
          ];
          let ytInjected = false;
          for (const searchQuery of ytQueries) {
            const ytResponse = await axios.get('https://www.googleapis.com/youtube/v3/search', {
              params: {
                part: 'snippet',
                q: searchQuery,
                type: 'video',
                maxResults: 3,
                relevanceLanguage: 'en',
                videoEmbeddable: 'true',
                key: config.YOUTUBE_API_KEY,
              },
              timeout: 10000,
            });
            const ytItems = ytResponse.data?.items;
            if (ytItems?.length > 0) {
              // Verify embed is actually allowed via oEmbed (videoEmbeddable param is not always reliable)
              let videoId: string | null = null;
              let videoTitle = searchQuery;
              for (const item of ytItems) {
                const vid = item.id?.videoId;
                if (!vid) continue;
                try {
                  await axios.get(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${vid}&format=json`, { timeout: 5000 });
                  videoId = vid;
                  videoTitle = item.snippet?.title || searchQuery;
                  break;
                } catch {
                  logger.debug(`YouTube video ${vid} is not embeddable, trying next`);
                }
              }
              if (videoId) {
                content.html = WordPressService.injectYouTubeEmbed(
                  content.html,
                  `https://www.youtube.com/watch?v=${videoId}`,
                  videoTitle,
                );
                logger.info(`YouTube embed injected: "${videoTitle}" for "${researched.analysis.selectedKeyword}" (query: "${searchQuery}")`);
                ytInjected = true;
                break;
              }
            }
          }
          if (!ytInjected) {
            logger.warn(`YouTube embed skipped: no results for "${researched.analysis.selectedKeyword}"`);
          }
        } catch (ytError) {
          logger.warn(`YouTube embed skipped: ${ytError instanceof Error ? ytError.message : ytError}`);
        }
      }

      // B-3.99. Inject contextual internal links within post body
      content.html = WordPressService.injectContextualInternalLinks(
        content.html, existingPosts, researched.analysis.selectedKeyword, config.WP_URL, 3,
      );

      // B-4. Create WordPress post (English only)
      // Enforce niche category to prevent AI from generating mismatched category names
      content.category = niche.category;
      // Get cluster-aware related posts for enhanced related posts widget
      const clusterRelatedPosts = topicClusterService.getRelatedPostsByCluster(
        niche.id, researched.analysis.selectedKeyword, existingPosts, 4,
      );
      const post = await wpService.createPost(
        content,
        featuredMediaResult?.mediaId || 0,
        inlineImages,
        {
          contentType: researched.analysis.contentType,
          keyword: researched.analysis.selectedKeyword,
          featuredImageUrl: featuredMediaResult?.sourceUrl,
          ogImageUrl: featuredMediaResult?.sourceUrl || '',
          publishStatus: effectivePublishStatus,
          existingPosts,
          scheduledDate,
          pillarPageUrl: pillarUrlMap[niche.id],
          subNiche: niche.id,
          skipInlineCss: postCssSnippetActive,
          newsletterFormUrl: config.NEWSLETTER_FORM_URL || undefined,
          titleCandidates: content.titleCandidates,
          clusterNavHtml,
          affiliateMap: config.AFFILIATE_MAP ? (() => { try { return JSON.parse(config.AFFILIATE_MAP); } catch { return {}; } })() : undefined,
          selectedPersona,
          isNewPublisher,
          clusterRelatedPosts: clusterRelatedPosts.length > 0 ? clusterRelatedPosts : undefined,
          factCheckClaims: factCheckClaims.length > 0 ? factCheckClaims : undefined,
        },
      );

      // Mark fact-check-drafted posts for auto-retry on next batch
      if (effectivePublishStatus === 'draft' && post.postId) {
        try {
          await wpService.updatePostMeta(post.postId, {
            _autoblog_factcheck_retry: new Date().toISOString(),
            _autoblog_factcheck_category: niche.category,
          });
          logger.info(`Fact-check draft: post ${post.postId} marked for auto-retry on next batch`);
        } catch (metaErr) {
          logger.debug(`Failed to set factcheck retry meta: ${metaErr instanceof Error ? metaErr.message : metaErr}`);
        }
      }

      if (content.qualityScore !== undefined) {
        logger.info(`Quality score: ${content.qualityScore}/100 for "${content.title}"`);
        // Post-publish quality rollback: revert to draft if score is critically low
        const minQuality = config.MIN_QUALITY_SCORE;
        if (content.qualityScore < minQuality - 15 && effectivePublishStatus === 'publish') {
          logger.warn(`Quality score ${content.qualityScore} is critically below threshold (${minQuality}). Reverting to draft.`);
          await wpService.revertToDraft(post.postId, `Quality score ${content.qualityScore} < ${minQuality - 15}`);
          if (config.TELEGRAM_BOT_TOKEN && config.TELEGRAM_CHAT_ID) {
            const issues = content.qualityScore < 40 ? ['Critically low quality score', 'Needs complete rewrite'] : ['Below minimum quality threshold'];
            await sendQualityAlert(config.TELEGRAM_BOT_TOKEN, config.TELEGRAM_CHAT_ID, content.title, post.url, content.qualityScore, minQuality, issues);
          }
        } else if (content.qualityScore < minQuality && config.TELEGRAM_BOT_TOKEN && config.TELEGRAM_CHAT_ID) {
          // Alert but don't rollback for marginal scores
          await sendQualityAlert(config.TELEGRAM_BOT_TOKEN, config.TELEGRAM_CHAT_ID, content.title, post.url, content.qualityScore, minQuality, ['Marginal quality - review recommended']);
        }
      }

      // B-4.5. Korean content generation removed — English-only publishing

      // B-5. IndexNow + Bing Sitemap Ping
      await seoService.notifyIndexNow([post.url]);
      await seoService.pingSitemap();

      // B-6. Multi-day social campaign: stagger platforms for sustained engagement
      // Day 0 (immediate): Pinterest + Reddit + Facebook (freshness-sensitive)
      // Day 0 +2h: Twitter thread (engagement window)
      // Day 0 +6h: LinkedIn (professional audience, different timezone peak)
      const TWITTER_DELAY_MS = 2 * 60 * 60 * 1000; // 2 hours
      const LINKEDIN_DELAY_MS = 6 * 60 * 60 * 1000; // 6 hours
      const socialPlatforms: string[] = [];
      if (twitterService) socialPlatforms.push('twitter');
      if (linkedinService) socialPlatforms.push('linkedin');

      // Facebook: post immediately only when published (not scheduled/future — URL not accessible yet)
      if (facebookService && effectivePublishStatus === 'publish') {
        const fbPostId = await facebookService.promoteBlogPost(content, post);
        if (fbPostId) await wpService.updatePostMeta(post.postId, { _autoblog_fb_post_id: fbPostId }).catch(() => {});
      }

      if (socialPlatforms.length > 0) {
        try {
          // Schedule Twitter at +2h
          if (twitterService) {
            await wpService.updatePostMeta(post.postId, {
              _autoblog_social_scheduled: new Date(Date.now() + TWITTER_DELAY_MS).toISOString(),
              _autoblog_social_platforms: 'twitter',
            });
          }
          // Schedule LinkedIn at +6h (separate meta key for staggering)
          if (linkedinService) {
            await wpService.updatePostMeta(post.postId, {
              _autoblog_linkedin_scheduled: new Date(Date.now() + LINKEDIN_DELAY_MS).toISOString(),
            });
          }
          logger.info(`Multi-day campaign: Twitter +2h, LinkedIn +6h for "${content.title}"`);
        } catch (socialMetaError) {
          logger.debug(`Social scheduling meta save failed: ${socialMetaError instanceof Error ? socialMetaError.message : socialMetaError}`);
          // Fallback: post immediately if meta save fails, save social IDs for tracking
          if (twitterService) {
            const tweetId = await twitterService.promoteBlogPost(content, post);
            if (tweetId) await wpService.updatePostMeta(post.postId, { _autoblog_tweet_id: tweetId }).catch(() => {});
          }
          if (linkedinService) {
            const linkedinPostId = await linkedinService.promoteBlogPost(content.title, content.excerpt, resolvePostUrl(post), featuredMediaResult?.sourceUrl || undefined);
            if (linkedinPostId) await wpService.updatePostMeta(post.postId, { _autoblog_linkedin_post_id: linkedinPostId }).catch(() => {});
          }
        }
      }

      // Execute previously scheduled social posts that are now due (read from WP post meta)
      try {
        // Twitter execution
        const pendingSocial = await wpService.getPostsByMeta('_autoblog_social_scheduled', 10);
        for (const pending of pendingSocial.slice(0, 3)) {
          const scheduledAt = pending.meta._autoblog_social_scheduled;
          if (!scheduledAt || new Date(scheduledAt).getTime() > Date.now()) continue;

          const platforms = (pending.meta._autoblog_social_platforms || '').split(',');
          try {
            if (platforms.includes('twitter') && twitterService) {
              const deferredTweetId = await twitterService.promoteBlogPost(
                { title: pending.title, html: '', excerpt: '', tags: [], category: '', imagePrompts: [], imageCaptions: [], qualityScore: 0, metaDescription: '', slug: '' } as any,
                { url: pending.url, postId: pending.postId } as any,
              );
              if (deferredTweetId) await wpService.updatePostMeta(pending.postId, { _autoblog_tweet_id: deferredTweetId }).catch(() => {});
              logger.info(`Deferred Twitter post executed for "${pending.title}"`);
            }
            await wpService.updatePostMeta(pending.postId, { _autoblog_social_scheduled: '', _autoblog_social_platforms: '' });
          } catch (deferredSocialErr) {
            logger.debug(`Deferred social post failed: ${deferredSocialErr instanceof Error ? deferredSocialErr.message : deferredSocialErr}`);
          }
        }
        // LinkedIn execution (staggered separately)
        if (linkedinService) {
          const pendingLinkedin = await wpService.getPostsByMeta('_autoblog_linkedin_scheduled', 10);
          for (const pending of pendingLinkedin.slice(0, 3)) {
            const scheduledAt = pending.meta._autoblog_linkedin_scheduled;
            if (!scheduledAt || new Date(scheduledAt).getTime() > Date.now()) continue;
            try {
              const deferredLiId = await linkedinService.promoteBlogPost(pending.title, '', pending.url);
              if (deferredLiId) await wpService.updatePostMeta(pending.postId, { _autoblog_linkedin_post_id: deferredLiId }).catch(() => {});
              logger.info(`Deferred LinkedIn post executed for "${pending.title}"`);
              await wpService.updatePostMeta(pending.postId, { _autoblog_linkedin_scheduled: '' });
            } catch (liErr) {
              logger.debug(`Deferred LinkedIn post failed: ${liErr instanceof Error ? liErr.message : liErr}`);
            }
          }
        }
      } catch (socialQueryErr) {
        logger.debug(`Deferred social query failed: ${socialQueryErr instanceof Error ? socialQueryErr.message : socialQueryErr}`);
      }

      // B-7/8: Syndication with 24h delay (prevents duplicate content — original must index first)
      const SYNDICATION_DELAY_MS = 24 * 60 * 60 * 1000; // 24 hours
      const syndicationScheduledAt = new Date(Date.now() + SYNDICATION_DELAY_MS).toISOString();

      // Store syndication intent in post meta for deferred processing
      const naverBlogReady = !!(config.NAVER_BLOG_ID && config.NAVER_CLIENT_ID && config.NAVER_CLIENT_SECRET);
      if (devtoService || hashnodeService || mediumService || naverBlogReady) {
        try {
          await wpService.updatePostMeta(post.postId, {
            _autoblog_syndication_scheduled: syndicationScheduledAt,
            _autoblog_syndication_platforms: [
              devtoService ? 'devto' : '',
              hashnodeService ? 'hashnode' : '',
              mediumService ? 'medium' : '',
              naverBlogReady ? 'naver' : '',
            ].filter(Boolean).join(','),
          });
          logger.info(`Syndication scheduled for ${syndicationScheduledAt} (24h delay for canonical indexing)`);
        } catch (syndicationMetaError) {
          logger.debug(`Syndication meta save failed: ${syndicationMetaError instanceof Error ? syndicationMetaError.message : syndicationMetaError}`);
        }

        // Check if any PREVIOUSLY scheduled syndications are now due (read from WP post meta)
        try {
          const pendingSyndications = await wpService.getPostsByMeta('_autoblog_syndication_scheduled', 10);
          for (const pending of pendingSyndications.slice(0, 3)) {
            const scheduledAt = pending.meta._autoblog_syndication_scheduled;
            if (!scheduledAt || new Date(scheduledAt).getTime() > Date.now()) continue;

            logger.info(`Executing deferred syndication for "${pending.title}"`);
            const syndicationPlatforms = (pending.meta._autoblog_syndication_platforms || '').split(',');
            // Fetch full post content for syndication (needed for HTML→Markdown conversion)
            let syndicationContent: any = { title: pending.title, html: '', excerpt: '', tags: [], category: '', imagePrompts: [], imageCaptions: [], qualityScore: 0, metaDescription: '', slug: '' };
            try {
              const fullPost = await wpService.getPostContent(pending.postId);
              if (fullPost) {
                const plainText = fullPost.content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
                // Extract tags from WP post for proper Twitter thread building
                let postTags: string[] = [];
                let postSlug = '';
                try {
                  const { data: wpPostData } = await (wpService as any).api.get(`/posts/${pending.postId}`, {
                    params: { _fields: 'tags,slug' },
                  });
                  postSlug = (wpPostData as any).slug || '';
                  const tagIds: number[] = (wpPostData as any).tags || [];
                  if (tagIds.length > 0) {
                    const { data: tagsData } = await (wpService as any).api.get('/tags', {
                      params: { include: tagIds.slice(0, 10).join(','), _fields: 'name' },
                    });
                    postTags = (tagsData as any[]).map((t: any) => t.name);
                  }
                } catch { /* tags extraction optional */ }
                syndicationContent = {
                  ...syndicationContent,
                  title: fullPost.title,
                  html: fullPost.content,
                  category: fullPost.category,
                  excerpt: plainText.substring(0, 300),
                  tags: postTags,
                  slug: postSlug,
                };
              }
            } catch { /* use minimal content */ }
            const syndicationPost = { url: pending.url, postId: pending.postId, title: pending.title, featuredImageId: 0 };
            try {
              if (syndicationPlatforms.includes('devto') && devtoService) {
                await devtoService.syndicateBlogPost(syndicationContent as any, syndicationPost as any);
                logger.info(`Deferred DEV.to syndication executed for "${pending.title}"`);
              }
              if (syndicationPlatforms.includes('hashnode') && hashnodeService) {
                await hashnodeService.syndicateBlogPost(syndicationContent as any, syndicationPost as any);
                logger.info(`Deferred Hashnode syndication executed for "${pending.title}"`);
              }
              if (syndicationPlatforms.includes('medium') && mediumService) {
                const mediumUrl = await mediumService.syndicate(syndicationContent as any, syndicationPost as any);
                if (mediumUrl) logger.info(`Deferred Medium syndication executed: ${mediumUrl}`);
              }
              if (syndicationPlatforms.includes('naver') && config.NAVER_BLOG_ID && config.NAVER_CLIENT_ID && config.NAVER_CLIENT_SECRET) {
                const naverSvc = new NaverBlogService(config.NAVER_BLOG_ID, config.NAVER_CLIENT_ID, config.NAVER_CLIENT_SECRET);
                const naverUrl = await naverSvc.seedPost(syndicationContent as any, syndicationPost as any);
                if (naverUrl) logger.info(`Deferred Naver Blog seeding executed: ${naverUrl}`);
              }
              // Clear syndication meta after execution
              await wpService.updatePostMeta(pending.postId, { _autoblog_syndication_scheduled: '', _autoblog_syndication_platforms: '' });
            } catch (deferredErr) {
              logger.debug(`Deferred syndication failed: ${deferredErr instanceof Error ? deferredErr.message : deferredErr}`);
            }
          }
        } catch (syndicationQueryErr) {
          logger.debug(`Deferred syndication query failed: ${syndicationQueryErr instanceof Error ? syndicationQueryErr.message : syndicationQueryErr}`);
        }
      }

      // B-7. DEV.to syndication (deferred 24h for canonical indexing)
      if (devtoService) {
        logger.info(`DEV.to syndication: deferred 24h for canonical indexing (scheduled: ${syndicationScheduledAt})`);
      }

      // B-8. Hashnode syndication (deferred 24h for canonical indexing)
      if (hashnodeService) {
        logger.info(`Hashnode syndication: deferred 24h for canonical indexing (scheduled: ${syndicationScheduledAt})`);
      }

      // B-8.5. Pinterest auto-pin (optional, visual categories only — immediate, benefits from freshness)
      if (pinterestService && PinterestService.isEligible(niche.category)) {
        await pinterestService.pinBlogPost(content, post, featuredMediaResult?.sourceUrl || '');
      }

      // B-8.5b. Reddit auto-posting (optional)
      if (redditPostService) {
        try {
          const redditCount = await redditPostService.autoPost(niche.category, content.title, post.url);
          if (redditCount > 0) {
            logger.info(`Reddit: Posted to ${redditCount} subreddit(s) for "${researched.analysis.selectedKeyword}"`);
          }
        } catch (redditError) {
          logger.debug(`Reddit posting failed: ${redditError instanceof Error ? redditError.message : redditError}`);
        }
      }

      // B-8.6. Medium syndication (deferred 24h for canonical indexing)
      if (mediumService) {
        logger.info(`Medium syndication: deferred 24h for canonical indexing (scheduled: ${syndicationScheduledAt})`);
      }

      // B-8.7. Email automation webhook (segmented by niche)
      if (config.EMAIL_WEBHOOK_URL) {
        try {
          const emailService = new EmailAutomationService(config.EMAIL_WEBHOOK_URL);
          await emailService.sendSegmentedNotification({
            title: content.title,
            url: post.url,
            excerpt: content.excerpt,
            category: niche.category,
            contentType: researched.analysis.contentType,
          }, niche.category);
        } catch (emailError) {
          logger.debug(`Email webhook failed: ${emailError instanceof Error ? emailError.message : emailError}`);
        }
      }

      // B-8.8. Naver Blog auto-seeding (deferred 24h for canonical indexing — wired in syndication block above)
      if (naverBlogReady) {
        logger.info(`Naver Blog seeding: deferred 24h for canonical indexing (scheduled: ${syndicationScheduledAt})`);
      }

      // B-9. Google Indexing API
      await seoService.requestIndexing(post.url);

      // B-9.5. Reverse internal linking — inject links to new post in related existing posts
      try {
        await wpService.insertReverseLinks(
          post.url, content.title, researched.analysis.selectedKeyword,
          niche.id, existingPosts, 5,
        );
      } catch (revLinkError) {
        logger.debug(`Reverse linking failed: ${revLinkError instanceof Error ? revLinkError.message : revLinkError}`);
      }

      // B-10. Record history + category publish timestamp (with series detection)
      await history.recordCategoryPublish(niche.id);
      const seriesInfo = history.getSeriesInfo(niche.id, researched.analysis.selectedKeyword);
      // Auto-generate seriesId for new potential series (3+ similar posts)
      let seriesId = seriesInfo?.seriesId;
      let seriesPart = seriesInfo?.seriesPart;
      if (!seriesId) {
        // Check if this keyword could start a new series based on existing posts
        const nicheKeywords = history.getPostedKeywordsForNiche(niche.id);
        const kwWords = researched.analysis.selectedKeyword.toLowerCase().split(/\s+/).filter(w => w.length > 3);
        const similarCount = nicheKeywords.filter(pk => {
          const pkWords = pk.toLowerCase().split(/\s+/).filter(w => w.length > 3);
          return kwWords.filter(w => pkWords.some(pw => pw.includes(w) || w.includes(pw))).length >= 2;
        }).length;
        if (similarCount >= 2) {
          // Create a new series for this cluster of similar topics
          seriesId = `${niche.id}-${researched.analysis.selectedKeyword.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30)}`;
          seriesPart = similarCount + 1;
          logger.info(`New content series detected: "${seriesId}" (part ${seriesPart})`);
        }
      } else {
        logger.info(`Continuing series: "${seriesId}" (part ${seriesPart})`);
      }
      await history.addEntry({
        keyword: researched.analysis.selectedKeyword,
        postId: post.postId,
        postUrl: post.url,
        publishedAt: new Date().toISOString(),
        niche: niche.id,
        contentType: researched.analysis.contentType,
        titleCandidates: content.titleCandidates,
        originalTitle: content.title,
        searchIntent: researched.analysis.searchIntent || undefined,
        featuredImageUrl: featuredMediaResult?.sourceUrl,
        featuredImageMediaId: featuredMediaResult?.mediaId,
        affiliateLinkCount: content.affiliateLinksCount || 0,
        ...(seriesId ? { seriesId, seriesPart } : {}),
      });

      results.push({
        keyword: researched.analysis.selectedKeyword,
        niche: niche.id,
        success: true,
        postId: post.postId,
        postUrl: post.url,
        duration: Date.now() - postStart,
      });
    } catch (error) {
      const message = axios.isAxiosError(error)
        ? `${error.response?.status} ${JSON.stringify(error.response?.data ?? error.message)}`
        : (error instanceof Error ? error.message : String(error));
      logger.error(`[Phase B] Failed "${niche.name}": ${message}`);
      results.push({ keyword: niche.name, niche: niche.id, success: false, error: message, duration: Date.now() - postStart });
    }
  }

  // 4.1. Orphan page detection + auto-fix + internal link integrity check
  try {
    const orphans = await wpService.detectOrphanPages(existingPosts);
    if (orphans.length > 0) {
      await wpService.autoLinkOrphans(orphans, existingPosts);
    }
    await wpService.checkAndFixInternalLinks(existingPosts);
  } catch (error) {
    logger.warn(`Orphan/link check failed: ${error instanceof Error ? error.message : error}`);
  }

  // 4.1b. Periodic broken external link check (weekly maintenance)
  try {
    const linkCheckService = new ContentRefreshService(
      config.WP_URL, config.WP_USERNAME, config.WP_APP_PASSWORD,
      config.ANTHROPIC_API_KEY, config.CLAUDE_MODEL,
    );
    const { broken, fixed } = await linkCheckService.checkBrokenExternalLinks(20);
    if (broken > 0) {
      logger.info(`Broken link maintenance: ${broken} broken link(s) found, ${fixed} post(s) updated`);
    }
  } catch (error) {
    logger.warn(`Broken link check failed: ${error instanceof Error ? error.message : error}`);
  }

  // 4.1c. Link rot detection on Mondays — check last 50 posts for dead external links
  if (new Date().getDay() === 1) {
    try {
      const linkRotPosts = await wpService.getRecentPosts(50);
      const token = Buffer.from(`${config.WP_USERNAME}:${config.WP_APP_PASSWORD}`).toString('base64');
      const linkApi = axios.create({
        baseURL: `${config.WP_URL}/wp-json/wp/v2`,
        headers: { Authorization: `Basic ${token}` },
        timeout: 30000,
      });
      const brokenLinks: Array<{ postTitle: string; linkUrl: string; status: number }> = [];
      for (const p of linkRotPosts.slice(0, 50)) {
        try {
          const { data } = await linkApi.get(`/posts/${p.postId}`, { params: { _fields: 'content' } });
          const html = (data as { content: { rendered: string } }).content.rendered;
          const extLinks: string[] = [];
          const re = /href="(https?:\/\/[^"]+)"/gi;
          let m;
          while ((m = re.exec(html)) !== null) {
            if (!m[1].includes('youtube.com') && !m[1].includes('schema.org')) extLinks.push(m[1]);
          }
          for (const link of [...new Set(extLinks)].slice(0, 5)) {
            try {
              const resp = await axios.head(link, { timeout: 8000, maxRedirects: 5, validateStatus: () => true });
              if (resp.status >= 400) brokenLinks.push({ postTitle: p.title, linkUrl: link, status: resp.status });
            } catch { brokenLinks.push({ postTitle: p.title, linkUrl: link, status: 0 }); }
          }
        } catch { /* skip individual post errors */ }
      }
      if (brokenLinks.length > 0) {
        logger.warn(`Link rot check: ${brokenLinks.length} broken link(s) detected`);
        if (config.TELEGRAM_BOT_TOKEN && config.TELEGRAM_CHAT_ID) {
          const lrMsg = `🔗 Link Rot: ${brokenLinks.length} broken link(s)\n` +
            brokenLinks.slice(0, 8).map(b => `[${b.status}] ${b.linkUrl}\n  in: "${b.postTitle}"`).join('\n');
          await sendTelegramAlert(config.TELEGRAM_BOT_TOKEN, config.TELEGRAM_CHAT_ID, lrMsg);
        }
      }
    } catch (linkRotError) {
      logger.debug(`Link rot check failed: ${linkRotError instanceof Error ? linkRotError.message : linkRotError}`);
    }
  }

  // 4.2. Auto-rewrite underperforming posts (when enabled, with timeout guard)
  const elapsedMinutes = (Date.now() - new Date(startedAt).getTime()) / 60000;
  const REWRITE_TIME_BUDGET_MIN = 35; // Skip rewrite if already past 35 min (GitHub Actions timeout is 45 min)
  if (config.AUTO_REWRITE_COUNT > 0 && config.GA4_PROPERTY_ID && config.GOOGLE_INDEXING_SA_KEY && elapsedMinutes < REWRITE_TIME_BUDGET_MIN) {
    try {
      const ga4Service = ga4Singleton!;
      const refreshService = new ContentRefreshService(
        config.WP_URL, config.WP_USERNAME, config.WP_APP_PASSWORD,
        config.ANTHROPIC_API_KEY, config.CLAUDE_MODEL,
      );
      const freshnessData = history.getPostsByFreshnessScore(config.AUTO_REWRITE_MIN_AGE_DAYS);
      if (freshnessData.length > 0) {
        const staleCount = freshnessData.filter(f => f.freshnessScore < 30).length;
        if (staleCount > 0) {
          logger.info(`Content freshness: ${staleCount} post(s) with freshness score < 30 (needs refresh)`);
        }
      }
      const gscForRefresh = gscSingleton ?? undefined;
      const rewritten = await refreshService.refreshDecliningPosts(
        ga4Service, seoService, config.AUTO_REWRITE_COUNT, config.AUTO_REWRITE_MIN_AGE_DAYS, freshnessData, gscForRefresh,
      );
      if (rewritten > 0) {
        logger.info(`Auto-rewrote ${rewritten} underperforming post(s)`);
        // Purge Cloudflare cache for refreshed URLs so updated content propagates immediately
        if (config.CLOUDFLARE_API_TOKEN && config.CLOUDFLARE_ZONE_ID) {
          try {
            const refreshedForPurge = await wpService.getPostsByMeta('_autoblog_last_refreshed', 10);
            const refreshedUrls = refreshedForPurge
              .filter(r => r.meta._autoblog_last_refreshed && Date.now() - new Date(r.meta._autoblog_last_refreshed).getTime() < 24 * 60 * 60 * 1000)
              .map(r => r.url);
            if (refreshedUrls.length > 0) {
              await seoService.purgeCloudflareUrls(config.CLOUDFLARE_API_TOKEN, config.CLOUDFLARE_ZONE_ID, refreshedUrls);
            }
          } catch (purgeErr) {
            logger.debug(`Cloudflare purge after refresh failed: ${purgeErr instanceof Error ? purgeErr.message : purgeErr}`);
          }
        }
        // Re-promote refreshed content to SNS for renewed traffic
        try {
          const recentRefreshed = await wpService.getPostsByMeta('_autoblog_last_refreshed', 5);
          for (const refreshed of recentRefreshed.slice(0, 2)) {
            const refreshedAt = refreshed.meta._autoblog_last_refreshed;
            // Only re-promote if refreshed within last 24h
            if (!refreshedAt || Date.now() - new Date(refreshedAt).getTime() > 24 * 60 * 60 * 1000) continue;
            logger.info(`Re-promoting refreshed post: "${refreshed.title}"`);
            // Fetch enriched content from WP for proper social post building
            let reproContent: any = { title: refreshed.title, html: '', excerpt: '', tags: [], category: '', imagePrompts: [], imageCaptions: [], qualityScore: 0, metaDescription: '', slug: '' };
            let reproExcerpt = '';
            try {
              const fullPost = await wpService.getPostContent(refreshed.postId);
              if (fullPost) {
                reproExcerpt = fullPost.content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().substring(0, 300);
                reproContent = { ...reproContent, title: fullPost.title, html: fullPost.content, category: fullPost.category, excerpt: reproExcerpt };
                // Fetch tags for Twitter thread
                try {
                  const { data: wpData } = await (wpService as any).api.get(`/posts/${refreshed.postId}`, { params: { _fields: 'tags,slug' } });
                  reproContent.slug = (wpData as any).slug || '';
                  const tagIds: number[] = (wpData as any).tags || [];
                  if (tagIds.length > 0) {
                    const { data: tagsData } = await (wpService as any).api.get('/tags', { params: { include: tagIds.slice(0, 10).join(','), _fields: 'name' } });
                    reproContent.tags = (tagsData as any[]).map((t: any) => t.name);
                  }
                } catch { /* tags extraction optional */ }
              }
            } catch { /* use minimal content */ }
            if (twitterService) {
              try {
                await twitterService.promoteBlogPost(
                  reproContent as any,
                  { url: refreshed.url, postId: refreshed.postId, title: refreshed.title, featuredImageId: 0 },
                );
                logger.info(`Re-promotion: Twitter thread posted for "${refreshed.title}"`);
              } catch (reproErr) {
                logger.debug(`Re-promotion Twitter failed: ${reproErr instanceof Error ? reproErr.message : reproErr}`);
              }
            }
            if (linkedinService) {
              try {
                await linkedinService.promoteBlogPost(refreshed.title, reproExcerpt, refreshed.url);
                logger.info(`Re-promotion: LinkedIn post shared for "${refreshed.title}"`);
              } catch (reproErr) {
                logger.debug(`Re-promotion LinkedIn failed: ${reproErr instanceof Error ? reproErr.message : reproErr}`);
              }
            }
          }
        } catch (reproError) {
          logger.debug(`Re-promotion lookup failed: ${reproError instanceof Error ? reproError.message : reproError}`);
        }
      }
    } catch (error) {
      logger.warn(`Auto-rewrite failed: ${error instanceof Error ? error.message : error}`);
    }
  } else if (config.AUTO_REWRITE_COUNT > 0 && elapsedMinutes >= REWRITE_TIME_BUDGET_MIN) {
    logger.warn(`Skipping auto-rewrite: elapsed ${elapsedMinutes.toFixed(0)} min exceeds ${REWRITE_TIME_BUDGET_MIN} min budget`);
  }

  // 4.21b. CTR-based title/meta-only refresh (lightweight — no full rewrite)
  // Targets posts where position is stable but CTR is declining → title/meta problem
  if (config.GSC_SITE_URL && config.GOOGLE_INDEXING_SA_KEY) {
    try {
      const gscCtrService = gscSingleton!;
      const ctrRefreshService = new ContentRefreshService(
        config.WP_URL, config.WP_USERNAME, config.WP_APP_PASSWORD,
        config.ANTHROPIC_API_KEY, config.CLAUDE_MODEL,
      );
      const ctrRefreshed = await ctrRefreshService.refreshDecliningCtrPosts(gscCtrService, seoService, 2);
      if (ctrRefreshed > 0) {
        logger.info(`CTR refresh: Updated title/meta for ${ctrRefreshed} post(s) with stable position but declining CTR`);
      }
    } catch (error) {
      logger.warn(`CTR refresh failed: ${error instanceof Error ? error.message : error}`);
    }
  }

  // 4.22. Time-based content refresh fallback (works WITHOUT GA4)
  // Refreshes posts that exceed their freshness class update interval
  try {
    const freshnessData = history.getPostsByFreshnessScore(14);
    if (freshnessData.length > 0) {
      const refreshService = new ContentRefreshService(
        config.WP_URL, config.WP_USERNAME, config.WP_APP_PASSWORD,
        config.ANTHROPIC_API_KEY, config.CLAUDE_MODEL,
      );
      const timeRefreshed = await refreshService.refreshByTimeThreshold(freshnessData, seoService, 2);
      if (timeRefreshed > 0) {
        logger.info(`Time-based refresh: Rewrote ${timeRefreshed} stale post(s) exceeding freshness threshold`);
      }

      // 4.22b. Yearly content refresh (Q1 only: update previous year's content)
      const yearlyRefreshed = await refreshService.refreshYearlyContent(freshnessData, seoService, 2);
      if (yearlyRefreshed > 0) {
        logger.info(`Yearly refresh: Updated ${yearlyRefreshed} post(s) with new year data`);
      }
    }
  } catch (error) {
    logger.warn(`Time-based/yearly refresh failed: ${error instanceof Error ? error.message : error}`);
  }

  // 4.22b2. Partial data-section refresh (lightweight — updates prices, dates, tables only)
  try {
    const freshnessForPartial = history.getPostsByFreshnessScore(14);
    if (freshnessForPartial.length > 0) {
      const partialRefreshService = new ContentRefreshService(
        config.WP_URL, config.WP_USERNAME, config.WP_APP_PASSWORD,
        config.ANTHROPIC_API_KEY, config.CLAUDE_MODEL,
      );
      const partialRefreshed = await partialRefreshService.partialRefreshDataSections(freshnessForPartial, seoService, 3);
      if (partialRefreshed > 0) {
        logger.info(`Partial data refresh: Updated data sections in ${partialRefreshed} post(s) without full rewrite`);
      }
    }
  } catch (error) {
    logger.warn(`Partial data refresh failed: ${error instanceof Error ? error.message : error}`);
  }

  // 4.22d. Striking distance post strengthening (position 5-20 → strengthen for target query)
  if (config.GSC_SITE_URL && config.GOOGLE_INDEXING_SA_KEY && elapsedMinutes < REWRITE_TIME_BUDGET_MIN) {
    try {
      const gscForStrength = gscSingleton!;
      const strengthService = new ContentRefreshService(
        config.WP_URL, config.WP_USERNAME, config.WP_APP_PASSWORD,
        config.ANTHROPIC_API_KEY, config.CLAUDE_MODEL,
      );
      const strengthened = await strengthService.strengthenStrikingDistancePosts(gscForStrength, seoService, 2);
      if (strengthened > 0) {
        logger.info(`Striking distance: Strengthened ${strengthened} post(s) for better ranking`);
      }
    } catch (error) {
      logger.warn(`Striking distance strengthening failed: ${error instanceof Error ? error.message : error}`);
    }
  }

  // 4.22c. Content lifecycle: noindex stale time-sensitive content (>6 months)
  try {
    const lifecycleService = new ContentRefreshService(
      config.WP_URL, config.WP_USERNAME, config.WP_APP_PASSWORD,
      config.ANTHROPIC_API_KEY, config.CLAUDE_MODEL,
    );
    const noindexed = await lifecycleService.noindexStaleContent(history.getAllEntries(), 180);
    if (noindexed > 0) {
      logger.info(`Content lifecycle: ${noindexed} stale post(s) noindexed`);
    }
  } catch (error) {
    logger.warn(`Content lifecycle noindex failed: ${error instanceof Error ? error.message : error}`);
  }

  // 4.22d-pre. Content pruning: auto-archive near-zero engagement stale posts
  try {
    const pruneService = new ContentRefreshService(
      config.WP_URL, config.WP_USERNAME, config.WP_APP_PASSWORD,
      config.ANTHROPIC_API_KEY, config.CLAUDE_MODEL,
    );
    const ga4ForPrune = ga4Singleton ?? undefined;
    const gscForPrune = gscSingleton ?? undefined;
    const pruned = await pruneService.pruneStaleContent(history.getAllEntries(), ga4ForPrune, gscForPrune, 3);
    if (pruned > 0) {
      logger.info(`Content pruning: ${pruned} stale post(s) archived (draft + noindex)`);
      if (config.TELEGRAM_BOT_TOKEN && config.TELEGRAM_CHAT_ID) {
        await sendTelegramAlert(config.TELEGRAM_BOT_TOKEN, config.TELEGRAM_CHAT_ID,
          `<b>Content Pruning</b>\n${pruned} stale post(s) auto-archived (draft + noindex)`, 'info');
      }
    }
  } catch (error) {
    logger.warn(`Content pruning failed: ${error instanceof Error ? error.message : error}`);
  }

  // Build set of live post URLs — used to filter out deleted posts from decay/merge detection
  const livePostUrls = new Set(existingPosts.map(p => p.url).filter(Boolean));

  // 4.22d. Content lifecycle: detect merge candidates (cannibalization reduction)
  try {
    const liveEntries = history.getAllEntries().filter(e => e.postUrl && livePostUrls.has(e.postUrl));
    const mergeCandidates = ContentRefreshService.detectMergeCandidates(liveEntries);
    if (mergeCandidates.length > 0) {
      logger.info(`Content lifecycle: ${mergeCandidates.length} merge candidate(s) detected — review recommended`);

      // Auto-redirect: for very high similarity (≥80%) merge candidates, set 301 redirect
      // from weaker post (lower engagement) to stronger post
      const autoRedirectCandidates = mergeCandidates
        .filter(c => c.similarity >= 0.8 && c.postB.postId)
        .slice(0, 2); // Max 2 auto-redirects per batch

      for (const c of autoRedirectCandidates) {
        try {
          await wpService.updatePostMeta(c.postB.postId, {
            rank_math_redirection_url_to: c.postA.postUrl,
            rank_math_redirection_header_code: '301',
          });
          logger.info(`Merge auto-redirect: "${c.postB.keyword}" → "${c.postA.keyword}" (${(c.similarity * 100).toFixed(0)}% overlap)`);
        } catch (redirectErr) {
          logger.debug(`Merge redirect failed: ${redirectErr instanceof Error ? redirectErr.message : redirectErr}`);
        }
      }

      if (config.TELEGRAM_BOT_TOKEN && config.TELEGRAM_CHAT_ID && mergeCandidates.length > 0) {
        const mergeMsg = mergeCandidates.slice(0, 3).map(c => c.recommendation).join('\n  - ');
        await sendTelegramAlert(config.TELEGRAM_BOT_TOKEN, config.TELEGRAM_CHAT_ID,
          `<b>Content Merge Candidates: ${mergeCandidates.length} pair(s)</b>\n  - ${mergeMsg}\n\n<i>Review recommended to reduce keyword cannibalization.</i>`, 'info');
      }
    }
  } catch (error) {
    logger.warn(`Content merge detection failed: ${error instanceof Error ? error.message : error}`);
  }

  // 4.23. Keyword ranking tracking — store position trends in history
  if (config.GSC_SITE_URL && config.GOOGLE_INDEXING_SA_KEY) {
    try {
      const gscRankingService = gscSingleton!;
      const allEntries = history.getAllEntries();
      const postKeywords = allEntries
        .filter(e => e.keyword && e.postUrl)
        .slice(-50) // Track last 50 posts
        .map(e => ({ url: e.postUrl, keyword: e.keyword }));

      if (postKeywords.length > 0) {
        const rankings = await gscRankingService.getKeywordRankings(postKeywords);
        const today = new Date().toISOString().split('T')[0];
        let tracked = 0;

        for (const ranking of rankings) {
          const entry = allEntries.find(e => e.postUrl === ranking.url);
          if (entry) {
            if (!entry.rankingHistory) entry.rankingHistory = [];
            entry.rankingHistory.push({
              date: today,
              position: ranking.position,
              clicks: ranking.clicks,
              impressions: ranking.impressions,
            });
            // Keep only last 30 data points
            if (entry.rankingHistory.length > 30) {
              entry.rankingHistory = entry.rankingHistory.slice(-30);
            }
            entry.lastPosition = ranking.position;
            tracked++;
          }
        }

        if (tracked > 0) {
          await history.persist();
          logger.info(`Keyword rankings: Updated ${tracked} post position(s)`);

          // Ranking milestone alerts — detect hits to #1, top 3, top 10, drops
          const milestones = GSCAnalyticsService.detectRankingMilestones(allEntries, rankings);
          if (milestones.length > 0) {
            for (const m of milestones) {
              const emoji = m.event === 'hit-top1' ? '🥇' : m.event === 'hit-top3' ? '🥈' : m.event === 'hit-top10' ? '📈' : '📉';
              logger.info(`${emoji} Ranking milestone: "${m.keyword}" ${m.event} (pos ${m.previousPosition.toFixed(1)} → ${m.currentPosition.toFixed(1)})`);
            }
            if (config.TELEGRAM_BOT_TOKEN && config.TELEGRAM_CHAT_ID) {
              const milestoneMsg = milestones.map(m => {
                const emoji = m.event === 'hit-top1' ? '🥇' : m.event === 'hit-top3' ? '🥈' : m.event === 'hit-top10' ? '📈' : '📉';
                return `${emoji} "${m.keyword}": pos ${m.previousPosition.toFixed(1)} → ${m.currentPosition.toFixed(1)}`;
              }).join('\n');
              await sendTelegramAlert(
                config.TELEGRAM_BOT_TOKEN, config.TELEGRAM_CHAT_ID,
                `<b>Ranking Milestones</b>\n${milestoneMsg}`,
                milestones.some(m => m.event === 'dropped-from-top10') ? 'warning' : 'info',
              );
            }
          }
        }
      }
    } catch (error) {
      logger.debug(`Keyword ranking tracking failed: ${error instanceof Error ? error.message : error}`);
    }
  }

  // 4.23c. Keyword cannibalization detection — find queries where 2+ pages compete
  if (config.GSC_SITE_URL && config.GOOGLE_INDEXING_SA_KEY) {
    try {
      const gscCannibal = gscSingleton!;
      const cannibalized = await gscCannibal.detectCannibalization();
      const highSeverity = cannibalized.filter(c => c.severity === 'high');
      const medSeverity = cannibalized.filter(c => c.severity === 'medium');

      if (cannibalized.length > 0) {
        logger.warn(`\n=== Keyword Cannibalization Alert: ${cannibalized.length} query(ies) with competing pages ===`);
        for (const c of highSeverity.slice(0, 5)) {
          const pageList = c.pages.map(p => `${p.page} (pos ${p.position.toFixed(1)})`).join(' vs ');
          logger.warn(`  HIGH [${c.recommendation}]: "${c.query}" — ${pageList}`);
        }
        for (const c of medSeverity.slice(0, 5)) {
          const pageList = c.pages.map(p => `${p.page} (pos ${p.position.toFixed(1)})`).join(' vs ');
          logger.warn(`  MEDIUM [${c.recommendation}]: "${c.query}" — ${pageList}`);
        }

        // Auto-redirect: for high-severity 'redirect' recommendations, set 301 redirect
        // from weaker page to stronger page (higher clicks = stronger)
        const redirectCandidates = highSeverity
          .filter(c => c.recommendation === 'redirect' && c.pages.length >= 2)
          .slice(0, 2); // Max 2 auto-redirects per batch

        for (const c of redirectCandidates) {
          const sorted = [...c.pages].sort((a, b) => b.clicks - a.clicks);
          const strongPage = sorted[0];
          const weakPage = sorted[1];
          try {
            // Find weak post by URL and set Rank Math redirect
            const weakPost = existingPosts.find(p => weakPage.page.includes(new URL(p.url).pathname));
            if (weakPost?.postId) {
              await wpService.updatePostMeta(weakPost.postId, {
                rank_math_redirection_url_to: strongPage.page,
                rank_math_redirection_header_code: '301',
              });
              logger.info(`Cannibalization auto-redirect: ${weakPage.page} → ${strongPage.page} (query: "${c.query}")`);
            }
          } catch (redirectErr) {
            logger.debug(`Cannibalization redirect failed for "${c.query}": ${redirectErr instanceof Error ? redirectErr.message : redirectErr}`);
          }
        }

        // Send Telegram alert for cannibalization issues
        if (config.TELEGRAM_BOT_TOKEN && config.TELEGRAM_CHAT_ID && (highSeverity.length > 0 || medSeverity.length > 0)) {
          try {
            const cannibalSummary = [...highSeverity, ...medSeverity].slice(0, 5)
              .map(c => `[${c.severity.toUpperCase()}] "${c.query}" → ${c.recommendation} (${c.pages.map(p => `pos ${p.position.toFixed(0)}`).join(' vs ')})`)
              .join('\n');
            await sendTelegramAlert(
              config.TELEGRAM_BOT_TOKEN, config.TELEGRAM_CHAT_ID,
              `<b>Keyword Cannibalization Alert</b>\n${cannibalized.length} competing query(ies) detected:\n${cannibalSummary}`,
              'warning',
            );
          } catch { /* Telegram alert non-fatal */ }
        }
      }
    } catch (error) {
      logger.debug(`Cannibalization detection failed: ${error instanceof Error ? error.message : error}`);
    }
  }

  // 4.23c-pre. Redirect chain detection — find A→B→C redirect chains that waste crawl budget
  try {
    const internalUrls = existingPosts.map(p => p.url).filter(Boolean);
    if (internalUrls.length > 0) {
      const chains = await wpService.detectRedirectChains(internalUrls);
      if (chains.length > 0) {
        logger.warn(`Redirect chains found: ${chains.length} chain(s) — auto-fixing internal links`);
        // Auto-fix: replace chain links in post content with direct final URLs
        const fixedCount = await wpService.fixRedirectChains(chains);
        if (config.TELEGRAM_BOT_TOKEN && config.TELEGRAM_CHAT_ID) {
          const chainMsg = chains.slice(0, 3).map(c => `[${c.hops} hops] ${c.originalUrl} → ${c.finalUrl}`).join('\n  - ');
          await sendTelegramAlert(config.TELEGRAM_BOT_TOKEN, config.TELEGRAM_CHAT_ID,
            `<b>Redirect Chain Alert: ${chains.length} chain(s)</b>\n  - ${chainMsg}\n\n${fixedCount > 0 ? `✅ Auto-fixed links in ${fixedCount} post(s)` : '<i>No fixable links found in recent posts.</i>'}`, 'warning');
        }
      }
    }
  } catch (error) {
    logger.debug(`Redirect chain detection failed: ${error instanceof Error ? error.message : error}`);
  }

  // 4.23b. Title pattern CTR analysis (log insights for keyword research optimization)
  if (config.GA4_PROPERTY_ID && config.GOOGLE_INDEXING_SA_KEY) {
    try {
      const ga4Patterns = ga4Singleton!;
      const titlePatterns = await ga4Patterns.getTitlePatternPerformance(history.getAllEntries());
      if (titlePatterns.length > 0) {
        logger.info('Title pattern performance:');
        for (const p of titlePatterns.slice(0, 5)) {
          logger.info(`  ${p.pattern}: ${p.avgPageviews.toFixed(0)} avg views (${p.count} posts)`);
        }
      }

      // Topic cluster performance
      const clusterPerf = await ga4Patterns.getClusterPerformance(history.getAllEntries());
      if (clusterPerf.size > 0) {
        logger.info('Topic cluster performance:');
        for (const [niche, data] of clusterPerf) {
          logger.info(`  ${niche}: ${data.totalPageviews} total views, ${data.postCount} posts, ${(data.avgBounceRate * 100).toFixed(0)}% bounce`);
        }
      }
    } catch (error) {
      logger.debug(`Title pattern/cluster analysis failed: ${error instanceof Error ? error.message : error}`);
    }
  }

  // 4.25. A/B title testing — real rotation: Title A (days 0-7) → Title B (days 7-14) → winner (day 14+)
  // Uses GSC CTR as primary signal (most reliable for title effectiveness)
  // Requires minimum 200 impressions per phase for statistical significance
  if (config.GA4_PROPERTY_ID && config.GOOGLE_INDEXING_SA_KEY) {
    try {
      const ga4Service = ga4Singleton!;
      const gscAbService = gscSingleton;

      const entriesWithCandidates = history.getAllEntries()
        .filter(e => e.titleCandidates?.length && !e.titleTestResolved);

      if (entriesWithCandidates.length > 0) {
        const [ga4Perf, gscPages] = await Promise.all([
          ga4Service.getTopPerformingPosts(200),
          gscAbService ? gscAbService.getPagePerformance(100) : Promise.resolve([]),
        ]);

        for (const entry of entriesWithCandidates.slice(0, 5)) {
          try {
            const ageDays = (Date.now() - new Date(entry.publishedAt).getTime()) / (1000 * 60 * 60 * 24);
            const candidates = entry.titleCandidates!;

            // Phase 1 (day 0-7): Original title (Title A) — already set at publish
            if (ageDays < 7) {
              // Record baseline CTR if GSC data available (require min 200 impressions for statistical significance)
              const gscPage = gscPages.find(p => entry.postUrl.includes(p.page.replace(/^https?:\/\/[^/]+/, '')));
              if (gscPage && !entry.titleTestPhaseACtr && gscPage.impressions >= 200) {
                entry.titleTestPhaseACtr = gscPage.ctr;
                entry.titleTestPhaseATitle = entry.originalTitle || entry.keyword; // Original post title
                await history.persist();
                logger.debug(`A/B test: Phase A baseline recorded for post ${entry.postId} (CTR: ${(gscPage.ctr * 100).toFixed(1)}%, ${gscPage.impressions} impressions)`);
              }
              continue;
            }

            // Phase 2 (day 7-14): Switch to Title B (best alternative candidate)
            if (ageDays >= 7 && ageDays < 14 && !entry.titleTestPhaseBStarted) {
              if (candidates.length === 0) continue;
              const newTitle = candidates[0]; // First candidate as Title B
              logger.info(`A/B test Phase B: Rotating post ${entry.postId} to "${newTitle}" (was: original title)`);
              await wpService.updatePostMeta(entry.postId, { rank_math_title: newTitle });
              try {
                const wpApi = (wpService as unknown as { api: { post: (url: string, data: unknown) => Promise<unknown> } }).api;
                await wpApi.post(`/posts/${entry.postId}`, { title: newTitle });
              } catch {
                logger.debug(`Could not update post title for ${entry.postId}`);
              }
              entry.titleTestPhaseBStarted = true;
              entry.titleTestPhaseBTitle = newTitle;
              await history.persist();
              continue;
            }

            // Phase 3 (day 12-14): Record Title B CTR (require min 200 impressions)
            if (ageDays >= 12 && ageDays < 14 && entry.titleTestPhaseBStarted && !entry.titleTestPhaseBCtr) {
              const gscPage = gscPages.find(p => entry.postUrl.includes(p.page.replace(/^https?:\/\/[^/]+/, '')));
              if (gscPage && gscPage.impressions >= 200) {
                entry.titleTestPhaseBCtr = gscPage.ctr;
                await history.persist();
                logger.debug(`A/B test: Phase B CTR recorded for post ${entry.postId} (CTR: ${(gscPage.ctr * 100).toFixed(1)}%, ${gscPage.impressions} impressions)`);
              }
              continue;
            }

            // Phase 4 (day 14+): Decide winner based on CTR comparison
            if (ageDays >= 14) {
              const phaseACtr = entry.titleTestPhaseACtr ?? 0;
              const phaseBCtr = entry.titleTestPhaseBCtr ?? 0;
              const postPerf = ga4Perf.find(p => entry.postUrl.includes(p.url.replace(/^\//, '')));

              // Use GSC CTR as primary, fall back to GA4 multi-signal
              let winnerTitle: string;
              let reason: string;

              if (phaseACtr > 0 && phaseBCtr > 0) {
                // Statistical comparison: Title B needs >10% CTR improvement to justify the switch
                const improvement = (phaseBCtr - phaseACtr) / phaseACtr;
                if (improvement > 0.10) {
                  winnerTitle = entry.titleTestPhaseBTitle || candidates[0];
                  reason = `Title B wins: CTR ${(phaseBCtr * 100).toFixed(1)}% vs ${(phaseACtr * 100).toFixed(1)}% (+${(improvement * 100).toFixed(0)}%)`;
                } else {
                  winnerTitle = entry.titleTestPhaseATitle || entry.keyword;
                  reason = `Title A wins: CTR ${(phaseACtr * 100).toFixed(1)}% vs ${(phaseBCtr * 100).toFixed(1)}% (B not significantly better)`;
                  // Revert to Title A
                  await wpService.updatePostMeta(entry.postId, { rank_math_title: winnerTitle });
                  try {
                    const wpApi = (wpService as unknown as { api: { post: (url: string, data: unknown) => Promise<unknown> } }).api;
                    await wpApi.post(`/posts/${entry.postId}`, { title: winnerTitle });
                  } catch { /* ignore */ }
                }
              } else if (postPerf && postPerf.pageviews >= 10) {
                // Fallback: multi-signal decision (same as before)
                const gscPage = gscPages.find(p => entry.postUrl.includes(p.page.replace(/^https?:\/\/[^/]+/, '')));
                const searchCtr = gscPage?.ctr ?? null;
                const shouldKeepB =
                  (postPerf.bounceRate < 0.65 || postPerf.avgEngagementTime > 60) &&
                  (searchCtr === null || searchCtr >= 0.02);

                if (shouldKeepB && entry.titleTestPhaseBStarted) {
                  winnerTitle = entry.titleTestPhaseBTitle || candidates[0];
                  reason = `Title B kept: bounce ${(postPerf.bounceRate * 100).toFixed(0)}%, engagement ${postPerf.avgEngagementTime.toFixed(0)}s`;
                } else {
                  winnerTitle = entry.titleTestPhaseATitle || entry.keyword;
                  reason = `Reverted to Title A: bounce ${(postPerf.bounceRate * 100).toFixed(0)}%, engagement ${postPerf.avgEngagementTime.toFixed(0)}s`;
                  // Revert to Title A
                  if (entry.titleTestPhaseBStarted) {
                    await wpService.updatePostMeta(entry.postId, { rank_math_title: winnerTitle });
                    try {
                      const wpApi = (wpService as unknown as { api: { post: (url: string, data: unknown) => Promise<unknown> } }).api;
                      await wpApi.post(`/posts/${entry.postId}`, { title: winnerTitle });
                    } catch { /* ignore */ }
                  }
                }
              } else if (postPerf) {
                // Minimal GA4 data — use pageviews trend as proxy for title effectiveness
                // If post exists in GA4 at all, decide based on engagement quality
                const engagementOk = postPerf.avgEngagementTime > 30 || postPerf.bounceRate < 0.75;
                if (entry.titleTestPhaseBStarted && engagementOk) {
                  winnerTitle = entry.titleTestPhaseBTitle || candidates[0];
                  reason = `Title B kept (GA4 fallback): engagement ${postPerf.avgEngagementTime.toFixed(0)}s, bounce ${(postPerf.bounceRate * 100).toFixed(0)}%`;
                } else {
                  winnerTitle = entry.titleTestPhaseATitle || entry.keyword;
                  reason = `Title A kept (GA4 fallback): low engagement or Phase B not started`;
                  if (entry.titleTestPhaseBStarted) {
                    await wpService.updatePostMeta(entry.postId, { rank_math_title: winnerTitle });
                    try {
                      const wpApi = (wpService as unknown as { api: { post: (url: string, data: unknown) => Promise<unknown> } }).api;
                      await wpApi.post(`/posts/${entry.postId}`, { title: winnerTitle });
                    } catch { /* ignore */ }
                  }
                }
              } else {
                // No data at all — keep current
                winnerTitle = entry.titleTestPhaseBStarted ? (entry.titleTestPhaseBTitle || candidates[0]) : entry.keyword;
                reason = 'Insufficient data, keeping current title';
              }

              logger.info(`A/B test resolved: Post ${entry.postId} — ${reason}`);
              logger.info(`  Winner: "${winnerTitle}" | Phase A CTR: ${(phaseACtr * 100).toFixed(1)}% | Phase B CTR: ${(phaseBCtr * 100).toFixed(1)}%`);

              // Update slug to match winning title for URL consistency
              try {
                const newSlug = winnerTitle
                  .toLowerCase()
                  .replace(/[^a-z0-9\s-]/g, '')
                  .replace(/\s+/g, '-')
                  .replace(/-+/g, '-')
                  .replace(/^-|-$/g, '')
                  .slice(0, 80);
                const wpApi = (wpService as unknown as { api: { post: (url: string, data: unknown) => Promise<unknown> } }).api;
                await wpApi.post(`/posts/${entry.postId}`, {
                  title: winnerTitle,
                  slug: newSlug,
                  meta: {
                    rank_math_title: winnerTitle,
                    rank_math_focus_keyword: entry.keyword,
                  },
                });
                logger.debug(`A/B winner applied: title + slug + Rank Math meta updated for post ${entry.postId}`);
              } catch {
                logger.debug(`A/B winner: could not update slug/meta for post ${entry.postId}`);
              }

              await history.markTitleTestResolved(entry.postId, winnerTitle);
            }
          } catch (error) {
            logger.debug(`A/B title test failed for post ${entry.postId}: ${error instanceof Error ? error.message : error}`);
          }
        }
      }
    } catch (error) {
      logger.warn(`A/B title testing failed: ${error instanceof Error ? error.message : error}`);
    }
  }

  // 4.25b. New title A/B testing via ContentRefreshService (complementary to inline A/B above)
  if (config.GSC_SITE_URL && config.GOOGLE_INDEXING_SA_KEY) {
    try {
      const abRefreshService = new ContentRefreshService(
        config.WP_URL, config.WP_USERNAME, config.WP_APP_PASSWORD,
        config.ANTHROPIC_API_KEY, config.CLAUDE_MODEL,
      );
      const gscForAB = gscSingleton!;
      const pendingTests = history.getPendingTitleTests();
      const abResults = await abRefreshService.runTitleABTests(pendingTests, gscForAB);
      if (abResults.tested > 0) {
        logger.info(`Title A/B testing (refresh service): ${abResults.tested} test(s) processed, ${abResults.resolved} resolved`);
      }
    } catch (error) {
      logger.debug(`Title A/B testing (refresh service) failed: ${error instanceof Error ? error.message : error}`);
    }
  }

  // 4.25c. Proactive content refresh calendar: log upcoming scheduled refreshes
  try {
    const scheduledRefreshes = ContentRefreshService.getScheduledRefreshes(history.getAllEntries(), 10);
    if (scheduledRefreshes.length > 0) {
      // getScheduledRefreshes already logs — auto-execute partial refreshes for most overdue items
      const topOverdue = scheduledRefreshes.slice(0, 2);
      if (topOverdue.length > 0 && elapsedMinutes < REWRITE_TIME_BUDGET_MIN) {
        const proactiveService = new ContentRefreshService(
          config.WP_URL, config.WP_USERNAME, config.WP_APP_PASSWORD,
          config.ANTHROPIC_API_KEY, config.CLAUDE_MODEL,
        );
        for (const sr of topOverdue) {
          try {
            await proactiveService.partialRefresh(sr.postId, ['stats', 'dates', 'links']);
            logger.info(`Proactive partial refresh completed for post ${sr.postId} ("${sr.keyword}")`);
          } catch (prError) {
            logger.debug(`Proactive partial refresh failed for post ${sr.postId}: ${prError instanceof Error ? prError.message : prError}`);
          }
        }
      }
    }
  } catch (error) {
    logger.debug(`Proactive refresh calendar failed: ${error instanceof Error ? error.message : error}`);
  }

  // 4.25d. Title pattern learning: log win rates from resolved A/B tests
  try {
    const patternWinRates = history.getTitlePatternWinRates();
    const patterns = Object.entries(patternWinRates).filter(([, s]) => s.total >= 3);
    if (patterns.length > 0) {
      logger.info('Title pattern win rates (3+ tests):');
      for (const [pattern, stats] of patterns) {
        logger.info(`  ${pattern}: ${stats.winRate}% win rate (${stats.wins}/${stats.total})`);
      }
    }
  } catch (error) {
    logger.debug(`Title pattern analysis failed: ${error instanceof Error ? error.message : error}`);
  }

  // 4.26. Social proof: update InteractionCounter in JSON-LD with real GA4 pageview data
  if (config.GA4_PROPERTY_ID && config.GOOGLE_INDEXING_SA_KEY) {
    try {
      const ga4Social = ga4Singleton!;
      const topPostsForSocial = await ga4Social.getTopPerformingPosts(100);
      const postPerformance = topPostsForSocial
        .filter(p => p.pageviews >= 10)
        .map(p => {
          const entry = history.getAllEntries().find(e => e.postUrl && p.url.includes(e.postUrl.replace(/^https?:\/\/[^/]+/, '')));
          return entry?.postId ? { postId: entry.postId, pageviews: p.pageviews } : null;
        })
        .filter((p): p is { postId: number; pageviews: number } => p !== null);

      if (postPerformance.length > 0) {
        const socialUpdated = await wpService.updateSocialProofSignals(postPerformance);
        if (socialUpdated > 0) {
          logger.info(`Social proof: Updated InteractionCounter for ${socialUpdated} post(s) with real pageview data`);
        }
      }
    } catch (error) {
      logger.debug(`Social proof update failed: ${error instanceof Error ? error.message : error}`);
    }
  }

  // 4.3. Post-publish indexing verification (check posts from last 7 days)
  try {
    const recentEntries = history.getRecentEntries(7);
    if (recentEntries.length > 0) {
      await seoService.verifyRecentIndexing(recentEntries.map(e => e.postUrl));
    }
  } catch (error) {
    logger.warn(`Indexing verification failed: ${error instanceof Error ? error.message : error}`);
  }

  // 4.5. Evergreen refresh: auto-update posts with stale year references
  try {
    const refreshed = await wpService.refreshStalePosts(existingPosts, 2);
    if (refreshed > 0) {
      logger.info(`Refreshed ${refreshed} stale post(s) with current year references`);
    }
  } catch (error) {
    logger.warn(`Evergreen refresh failed: ${error instanceof Error ? error.message : error}`);
  }

  // 4.6. Internal link rescan — discover new linking opportunities across existing posts (weekly)
  try {
    const newLinks = await wpService.rescanInternalLinks(existingPosts);
    if (newLinks > 0) {
      logger.info(`Internal link rescan: ${newLinks} new link(s) added to existing posts`);
    }
  } catch (error) {
    logger.warn(`Internal link rescan failed: ${error instanceof Error ? error.message : error}`);
  }

  // 4.7. Topic cluster coverage analysis — log which sub-topics need more content
  try {
    for (const niche of activeNiches) {
      const cluster = topicClusterService.getCluster(niche.id);
      if (cluster) {
        const coverage = topicClusterService.getClusterCoverage(niche.id);
        if (coverage && coverage.gaps.length > 0) {
          logger.info(`Cluster [${niche.id}]: ${coverage.covered}/${coverage.total} sub-topics covered. Gaps: ${coverage.gaps.slice(0, 3).join(', ')}`);
        }
      }
    }
  } catch (error) {
    logger.debug(`Cluster coverage analysis failed: ${error instanceof Error ? error.message : error}`);
  }

  // 4.8. Featured snippet auto-optimization — optimize top-ranking posts for Position 0
  if (config.GSC_SITE_URL && config.GOOGLE_INDEXING_SA_KEY) {
    try {
      const refreshService = new ContentRefreshService(
        config.WP_URL, config.WP_USERNAME, config.WP_APP_PASSWORD,
        config.ANTHROPIC_API_KEY, config.CLAUDE_MODEL,
      );
      const gscSnippet = gscSingleton!;
      const snippetOptimized = await refreshService.optimizeForFeaturedSnippets(gscSnippet, seoService, 2);
      if (snippetOptimized > 0) {
        logger.info(`Featured snippet: Optimized ${snippetOptimized} post(s) for Position 0 capture`);
      }
    } catch (error) {
      logger.warn(`Featured snippet optimization failed: ${error instanceof Error ? error.message : error}`);
    }
  }

  // 4.9. [#2] Early content decay detection — 3-day consecutive + slope-based detection
  if (gscService) {
    try {
      const decayItemsRaw = await gscService.detectEarlyDecay();
      const decayItems = decayItemsRaw.filter(d => livePostUrls.has(d.page));
      if (decayItemsRaw.length > decayItems.length) {
        logger.info(`Early decay: filtered out ${decayItemsRaw.length - decayItems.length} deleted page(s) from decay detection`);
      }
      if (decayItems.length > 0) {
        logger.warn(`Early decay: ${decayItems.length} page(s) with 3+ day consecutive decline`);
        for (const item of decayItems.slice(0, 5)) {
          logger.warn(`  ${item.urgency}: "${item.query}" ${item.page} (avg decline: ${item.avgDailyDecline.toFixed(1)} pos/day)`);
        }
        // Send Telegram alert for critical decays
        if (config.TELEGRAM_BOT_TOKEN && config.TELEGRAM_CHAT_ID) {
          const criticalDecays = decayItems.filter(d => d.urgency === 'critical');
          if (criticalDecays.length > 0) {
            const decayMsg = criticalDecays.slice(0, 3).map(d => `"${d.query}" on ${d.page} (-${d.avgDailyDecline.toFixed(1)} pos/day)`).join('\n');
            await sendTelegramAlert(config.TELEGRAM_BOT_TOKEN, config.TELEGRAM_CHAT_ID, `Early Decay Alert: ${criticalDecays.length} critical decline(s)\n${decayMsg}`);
          }
        }
      }
    } catch (error) {
      logger.debug(`Early decay detection failed: ${error instanceof Error ? error.message : error}`);
    }

    // Enhanced: slope-based early decay (linear regression on 14-day rolling averages)
    try {
      const slopeDecayRaw = await gscService.detectEarlyDecayWithSlope();
      const slopeDecay = slopeDecayRaw.filter(d => livePostUrls.has(d.page));
      if (slopeDecayRaw.length > slopeDecay.length) {
        logger.info(`Slope decay: filtered out ${slopeDecayRaw.length - slopeDecay.length} deleted page(s) from slope detection`);
      }
      if (slopeDecay.length > 0) {
        logger.warn(`Slope-based decay: ${slopeDecay.length} page(s) with statistically significant decline`);
        for (const item of slopeDecay.slice(0, 5)) {
          logger.warn(`  ${item.urgency}: "${item.query}" slope=${item.slope.toFixed(2)} R²=${item.r2.toFixed(2)} (projected pos: ${item.projectedPosition7d.toFixed(1)} in 7d)`);
        }
        // Send enhanced early decay alert with slope data
        if (config.TELEGRAM_BOT_TOKEN && config.TELEGRAM_CHAT_ID) {
          await sendEarlyDecayAlert(config.TELEGRAM_BOT_TOKEN, config.TELEGRAM_CHAT_ID, slopeDecay);
        }
      }
    } catch (slopeError) {
      logger.debug(`Slope-based decay detection failed: ${slopeError instanceof Error ? slopeError.message : slopeError}`);
    }
  }

  // 4.10. [#16] RPM feedback loop — auto-adjust RPM from GA4 AdSense revenue data
  if (config.GA4_PROPERTY_ID && config.GOOGLE_INDEXING_SA_KEY) {
    try {
      const ga4RpmService = ga4Singleton!;
      const rpmData = await ga4RpmService.getActualRpmData();
      if (rpmData.size > 0) {
        costTracker.updateActualRpm(rpmData);
      }
    } catch (error) {
      logger.debug(`RPM feedback loop failed: ${error instanceof Error ? error.message : error}`);
    }
  }

  // 4.11. [#22] Core Web Vitals monitoring — CrUX API check + Telegram alert on degradation
  if (config.GOOGLE_API_KEY) {
    try {
      const cwv = await seoService.checkCoreWebVitals(config.GOOGLE_API_KEY);
      if (cwv.overall === 'poor' && config.TELEGRAM_BOT_TOKEN && config.TELEGRAM_CHAT_ID) {
        const cwvMsg = `CWV Alert: POOR scores — LCP: ${cwv.lcp?.p75 || 'N/A'}ms, INP: ${cwv.inp?.p75 || 'N/A'}ms, CLS: ${cwv.cls?.p75 || 'N/A'}`;
        await sendTelegramAlert(config.TELEGRAM_BOT_TOKEN, config.TELEGRAM_CHAT_ID, cwvMsg);
      }
    } catch (error) {
      logger.debug(`CWV monitoring failed: ${error instanceof Error ? error.message : error}`);
    }
  }

  // 4.12. [#20] Rich Results Test — validate structured data for recently published posts
  if (config.GOOGLE_API_KEY && config.GOOGLE_INDEXING_SA_KEY) {
    try {
      const recentPosts = results.filter(r => r.success && r.postUrl).slice(0, 3);
      for (const post of recentPosts) {
        const validation = await seoService.validateStructuredData(post.postUrl!, config.GOOGLE_API_KEY);
        if (!validation.valid) {
          logger.warn(`Rich Results: ${validation.errors.length} error(s) for ${post.postUrl}: ${validation.errors.join(', ')}`);
        }
      }
    } catch (error) {
      logger.debug(`Rich Results validation failed: ${error instanceof Error ? error.message : error}`);
    }
  }

  // 4.99a. Clear batch checkpoint on successful completion
  history.clearCheckpoint();

  // 4.99b. Rate limit dashboard — log API usage summary
  try {
    const apiUsage = costTracker.getApiUsageSummary();
    if (apiUsage.length > 0) {
      logger.info('API rate limit dashboard:');
      for (const usage of apiUsage) {
        const warningStr = usage.warning ? ' ⚠️ APPROACHING LIMIT' : '';
        logger.info(`  ${usage.api}: ${usage.calls}/${usage.limit} (${usage.usagePct}%)${warningStr}`);
      }
    }
  } catch (rlError) {
    logger.debug(`Rate limit dashboard failed: ${rlError instanceof Error ? rlError.message : rlError}`);
  }

  // 4.99c. Post-level revenue tracking (RPM-based estimation per published post)
  if (config.GA4_PROPERTY_ID && config.GOOGLE_INDEXING_SA_KEY) {
    try {
      const ga4Revenue = ga4Singleton!;
      const topPostsRevenue = await ga4Revenue.getTopPerformingPosts(100);
      for (const p of topPostsRevenue) {
        const entry = history.getAllEntries().find(e => e.postUrl && p.url.includes(e.postUrl.replace(/^https?:\/\/[^/]+/, '')));
        if (entry?.niche) {
          const nicheConf = NICHES.find(n => n.id === entry.niche);
          const rpmTierMap: Record<string, number> = { high: 8, medium: 4, low: 2 };
          const rpm = nicheConf?.dynamicRpmValue ?? (nicheConf?.adSenseRpm ? rpmTierMap[nicheConf.adSenseRpm] : 3);
          costTracker.trackPostRevenue(entry.postUrl, p.pageviews, rpm);
          // Persist post-level RPM to history for content format optimization analysis
          entry.estimatedRpm = rpm;
          entry.estimatedRevenue = (p.pageviews / 1000) * rpm;
        }
      }
      await history.persist(); // Save post-level RPM data to disk
    } catch (revError) {
      logger.debug(`Post-level revenue tracking failed: ${revError instanceof Error ? revError.message : revError}`);
    }
  }

  // 5. Update last run
  await history.updateLastRun();

  // 6. Summary
  const batch: BatchResult = {
    startedAt,
    completedAt: new Date().toISOString(),
    totalKeywords: NICHES.length,
    successCount: results.filter((r) => r.success).length,
    failureCount: results.filter((r) => !r.success).length,
    skippedCount,
    results,
  };

  // API cost summary + revenue estimate
  costTracker.logSummary();
  // Revenue estimation based on published posts per niche
  const postsByNiche: Record<string, number> = {};
  for (const entry of history.getAllEntries()) {
    const nicheConfig = NICHES.find(n => n.id === entry.niche);
    const category = nicheConfig?.category || 'Unknown';
    postsByNiche[category] = (postsByNiche[category] || 0) + 1;
  }

  // Dynamic RPM optimization: learn actual RPM from GA4 pageview data per niche
  if (config.GA4_PROPERTY_ID && config.GOOGLE_INDEXING_SA_KEY) {
    try {
      const ga4Rpm = ga4Singleton!;
      const topPosts = await ga4Rpm.getTopPerformingPosts(200);
      if (topPosts.length >= 10) {
        // Calculate actual pageviews-per-post by niche for RPM refinement
        const nichePageviews: Record<string, { totalPv: number; postCount: number }> = {};
        for (const p of topPosts) {
          const entry = history.getAllEntries().find(e => e.postUrl && p.url.includes(e.postUrl.replace(/^https?:\/\/[^/]+/, '')));
          if (entry?.niche) {
            const nicheConf = NICHES.find(n => n.id === entry.niche);
            const cat = nicheConf?.category || 'Unknown';
            if (!nichePageviews[cat]) nichePageviews[cat] = { totalPv: 0, postCount: 0 };
            nichePageviews[cat].totalPv += p.pageviews;
            nichePageviews[cat].postCount++;
          }
        }
        // Log actual vs estimated RPM performance
        for (const [niche, data] of Object.entries(nichePageviews)) {
          if (data.postCount >= 3) {
            const avgPv = data.totalPv / data.postCount;
            logger.info(`Dynamic RPM [${niche}]: ${avgPv.toFixed(0)} avg pageviews/post (${data.postCount} posts tracked)`);
          }
        }
      }
    } catch (rpmError) {
      logger.debug(`Dynamic RPM analysis failed: ${rpmError instanceof Error ? rpmError.message : rpmError}`);
    }
  }

  costTracker.logRevenueEstimate(postsByNiche);

  // RPM feedback loop: adjust estimates from actual AdSense data when available
  if (config.ADSENSE_RPM_OVERRIDES) {
    try {
      const actualRpm = JSON.parse(config.ADSENSE_RPM_OVERRIDES) as Record<string, number>;
      if (Object.keys(actualRpm).length > 0) {
        CostTracker.adjustRpmFromActual(actualRpm);
      }
    } catch (error) {
      logger.warn(`ADSENSE_RPM_OVERRIDES parse failed (expected JSON object): ${error instanceof Error ? error.message : error}`);
    }
  }

  logger.info('\n=== Batch Summary ===');
  logger.info(`Total: ${batch.totalKeywords} | Success: ${batch.successCount} | Failed: ${batch.failureCount} | Skipped: ${batch.skippedCount}`);

  // Search intent distribution report
  const intentCounts: Record<string, number> = {};
  for (const g of generated) {
    const intent = g.researched.analysis.searchIntent || 'informational';
    intentCounts[intent] = (intentCounts[intent] || 0) + 1;
  }
  if (Object.keys(intentCounts).length > 0) {
    const intentStr = Object.entries(intentCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([intent, count]) => `${intent}: ${count}`)
      .join(', ');
    logger.info(`Search Intent Distribution: ${intentStr}`);
    // Warn if >80% informational (revenue imbalance)
    const total = Object.values(intentCounts).reduce((a, b) => a + b, 0);
    const infoRatio = (intentCounts['informational'] || 0) / total;
    if (infoRatio > 0.8 && total >= 3) {
      logger.warn(`Intent imbalance: ${(infoRatio * 100).toFixed(0)}% informational — consider more transactional/commercial content for better monetization`);
    }
  }

  // Affiliate link distribution report
  const totalAffLinks = generated.reduce((sum, g) => sum + (g.content.affiliateLinksCount || 0), 0);
  const postsWithAff = generated.filter(g => (g.content.affiliateLinksCount || 0) > 0).length;
  if (totalAffLinks > 0) {
    logger.info(`Affiliate Links: ${totalAffLinks} total across ${postsWithAff}/${generated.length} posts (avg ${(totalAffLinks / generated.length).toFixed(1)}/post)`);
  }

  for (const r of results) {
    if (r.success) {
      logger.info(`  [OK] [${r.niche}] "${r.keyword}" → ${r.postUrl} (${r.duration}ms)`);
    } else {
      logger.error(`  [FAIL] [${r.niche}] "${r.keyword}" → ${r.error}`);
    }
  }

  // Auto-retry fact-check on draft posts from previous batches
  try {
    const draftPosts = await wpService.getPostsByMeta('_autoblog_factcheck_retry', 20, 'draft');
    if (draftPosts.length > 0) {
      logger.info(`\n=== Fact-Check Auto-Retry: ${draftPosts.length} draft post(s) to re-verify ===`);
      for (const draft of draftPosts) {
        try {
          const postContent = await wpService.getPostContent(draft.postId);
          if (!postContent) {
            logger.debug(`Skipping fact-check retry for post ${draft.postId}: content not found`);
            continue;
          }
          const retryResult = await factCheckService.verifyContent(postContent.content, postContent.category || draft.meta._autoblog_factcheck_category || '');
          // Apply auto-corrections if available
          if (retryResult.corrections.length > 0) {
            const correctedHtml = factCheckService.applyCorrections(postContent.content, retryResult.corrections);
            await wpService.updatePostMeta(draft.postId, {}); // trigger content update below
            try {
              await (wpService as any).api.post(`/posts/${draft.postId}`, { content: correctedHtml });
              logger.info(`Fact-check retry: applied ${retryResult.corrections.length} correction(s) to post ${draft.postId}`);
            } catch { /* ignore update error */ }
          }

          if (!retryResult.hasCriticalErrors) {
            // Fact-check passed — schedule for publishing (2 hours from now)
            const publishAt = new Date(Date.now() + 2 * 60 * 60 * 1000);
            const scheduled = await wpService.schedulePost(draft.postId, publishAt);
            if (scheduled) {
              // Clear retry meta
              await wpService.updatePostMeta(draft.postId, { _autoblog_factcheck_retry: '', _autoblog_factcheck_category: '' });
              logger.info(`Fact-check retry PASSED: post ${draft.postId} "${draft.title}" scheduled for ${publishAt.toISOString()}`);
              if (config.TELEGRAM_BOT_TOKEN && config.TELEGRAM_CHAT_ID) {
                await sendQualityAlert(
                  config.TELEGRAM_BOT_TOKEN, config.TELEGRAM_CHAT_ID, draft.title, draft.url,
                  0, 0, [`Fact-check retry passed — auto-scheduled for ${publishAt.toLocaleString()}`],
                );
              }
            }
          } else {
            // Still failing — check if too old (>7 days), then give up
            const retryDate = draft.meta._autoblog_factcheck_retry;
            if (retryDate && (Date.now() - new Date(retryDate).getTime()) > 7 * 24 * 60 * 60 * 1000) {
              logger.warn(`Fact-check retry EXPIRED: post ${draft.postId} "${draft.title}" still has ${retryResult.criticalCount} critical errors after 7 days. Keeping as draft.`);
              await wpService.updatePostMeta(draft.postId, { _autoblog_factcheck_retry: '', _autoblog_factcheck_category: '' });
            } else {
              logger.info(`Fact-check retry FAILED: post ${draft.postId} still has ${retryResult.criticalCount} critical error(s). Will retry next batch.`);
            }
          }
        } catch (retryErr) {
          logger.debug(`Fact-check retry error for post ${draft.postId}: ${retryErr instanceof Error ? retryErr.message : retryErr}`);
        }
      }
    }
  } catch (factRetryQueryErr) {
    logger.debug(`Fact-check retry query failed: ${factRetryQueryErr instanceof Error ? factRetryQueryErr.message : factRetryQueryErr}`);
  }

  // Monthly niche revenue comparison report (1st of each month)
  if (new Date().getDate() === 1) {
    try {
      const allEntries = history.getAllEntries();
      const nicheRevenue: Record<string, { totalRevenue: number; postCount: number; avgRpm: number; topPost: string }> = {};
      for (const entry of allEntries) {
        if (!entry.estimatedRevenue || !entry.niche) continue;
        const nicheConf = NICHES.find(n => n.id === entry.niche);
        const cat = nicheConf?.category || 'Unknown';
        if (!nicheRevenue[cat]) nicheRevenue[cat] = { totalRevenue: 0, postCount: 0, avgRpm: 0, topPost: '' };
        nicheRevenue[cat].totalRevenue += entry.estimatedRevenue;
        nicheRevenue[cat].postCount++;
        if (!nicheRevenue[cat].topPost || entry.estimatedRevenue > (nicheRevenue[nicheRevenue[cat].topPost]?.totalRevenue || 0)) {
          nicheRevenue[cat].topPost = entry.keyword;
        }
      }
      // Calculate avg RPM per niche
      for (const cat of Object.keys(nicheRevenue)) {
        const entries = allEntries.filter(e => {
          const nc = NICHES.find(n => n.id === e.niche);
          return nc?.category === cat && e.estimatedRpm;
        });
        if (entries.length > 0) {
          nicheRevenue[cat].avgRpm = entries.reduce((sum, e) => sum + (e.estimatedRpm || 0), 0) / entries.length;
        }
      }
      if (Object.keys(nicheRevenue).length > 0) {
        const sorted = Object.entries(nicheRevenue).sort((a, b) => b[1].totalRevenue - a[1].totalRevenue);
        logger.info('=== Monthly Niche Revenue Report ===');
        for (const [cat, data] of sorted) {
          logger.info(`  ${cat}: $${data.totalRevenue.toFixed(2)} total (${data.postCount} posts, $${data.avgRpm.toFixed(2)} avg RPM)`);
        }
        if (config.TELEGRAM_BOT_TOKEN && config.TELEGRAM_CHAT_ID) {
          const reportLines = sorted.map(([cat, d]) => `${cat}: $${d.totalRevenue.toFixed(2)} (${d.postCount} posts, $${d.avgRpm.toFixed(2)} RPM)`);
          await sendTelegramAlert(config.TELEGRAM_BOT_TOKEN, config.TELEGRAM_CHAT_ID,
            `💰 Monthly Niche Revenue Report\n\n${reportLines.join('\n')}`);
        }
      }
    } catch (revenueReportErr) {
      logger.debug(`Monthly revenue report failed: ${revenueReportErr instanceof Error ? revenueReportErr.message : revenueReportErr}`);
    }
  }

  // Monthly expired content archive (1st of each month)
  if (new Date().getDate() === 1) {
    try {
      const allEntries = history.getAllEntries();
      const archived = await wpService.archiveExpiredPosts(allEntries);
      if (archived.length > 0) {
        logger.info(`Archived ${archived.length} expired low-traffic post(s) → noindex,nofollow`);
        if (config.TELEGRAM_BOT_TOKEN && config.TELEGRAM_CHAT_ID) {
          const archiveList = archived.map(a => `• Post #${a.postId}: "${a.keyword}"`).join('\n');
          await sendTelegramAlert(
            config.TELEGRAM_BOT_TOKEN, config.TELEGRAM_CHAT_ID,
            `📦 Monthly Archive: ${archived.length} post(s) set to noindex\n\n${archiveList}`,
          );
        }
      }
    } catch (archiveErr) {
      logger.debug(`Expired content archive failed: ${archiveErr instanceof Error ? archiveErr.message : archiveErr}`);
    }
  }

  // Weekly email digest (Monday) — send top posts from last 7 days to email subscribers
  if (new Date().getDay() === 1 && config.EMAIL_WEBHOOK_URL) {
    try {
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const recentEntries = history.getAllEntries()
        .filter(e => new Date(e.publishedAt) >= weekAgo && e.postUrl)
        .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
        .slice(0, 10);
      if (recentEntries.length >= 2) {
        const digestService = new EmailAutomationService(config.EMAIL_WEBHOOK_URL);
        await digestService.sendDigestWebhook(
          recentEntries.map(e => ({
            title: e.keyword,
            url: e.postUrl,
            category: NICHES.find(n => n.id === e.niche)?.category || e.niche || 'General',
          })),
        );
        logger.info(`Weekly email digest sent with ${recentEntries.length} posts`);
      } else {
        logger.debug('Weekly digest skipped: fewer than 2 posts this week');
      }
    } catch (digestErr) {
      logger.debug(`Weekly digest failed: ${digestErr instanceof Error ? digestErr.message : digestErr}`);
    }
  }

  // Post-level revenue attribution (weekly on Mondays)
  if (new Date().getDay() === 1 && config.GA4_PROPERTY_ID && config.GOOGLE_INDEXING_SA_KEY) {
    try {
      const revenueGa4 = ga4Singleton!;
      const rpmData: Record<string, number> = {};
      for (const niche of NICHES) {
        if (niche.dynamicRpmValue) rpmData[niche.category] = niche.dynamicRpmValue;
      }
      if (Object.keys(rpmData).length > 0) {
        const revenueAttr = await revenueGa4.getPostRevenueAttribution(history.getAllEntries(), rpmData);
        if (revenueAttr.length > 0) {
          const topRevenue = revenueAttr.slice(0, 5);
          logger.info('=== Top Revenue Posts (estimated) ===');
          for (const r of topRevenue) {
            logger.info(`  $${r.estimatedRevenue.toFixed(2)} — "${r.title}" (${r.pageviews} views, ${r.niche})`);
          }
          if (config.TELEGRAM_BOT_TOKEN && config.TELEGRAM_CHAT_ID) {
            const revMsg = '💰 Top Revenue Posts (weekly)\n' +
              topRevenue.map(r => `$${r.estimatedRevenue.toFixed(2)} — ${r.title} (${r.pageviews} views)`).join('\n');
            await sendTelegramAlert(config.TELEGRAM_BOT_TOKEN, config.TELEGRAM_CHAT_ID, revMsg);
          }
        }

        // Traffic source revenue attribution (which channels drive revenue?)
        const sourceRevenue = await revenueGa4.getRevenueByTrafficSource(rpmData);
        if (sourceRevenue.length > 0) {
          logger.info('=== Revenue by Traffic Source ===');
          const topSources = sourceRevenue.slice(0, 8);
          for (const s of topSources) {
            logger.info(`  $${s.estimatedRevenue.toFixed(2)} — ${s.source} (${s.pageviews} views, ${s.sessions} sessions)`);
          }
          if (config.TELEGRAM_BOT_TOKEN && config.TELEGRAM_CHAT_ID) {
            const srcMsg = '📊 Revenue by Traffic Source (weekly)\n' +
              topSources.map(s => `$${s.estimatedRevenue.toFixed(2)} — ${s.source} (${s.pageviews} views)`).join('\n');
            await sendTelegramAlert(config.TELEGRAM_BOT_TOKEN, config.TELEGRAM_CHAT_ID, srcMsg);
          }
        }

        // Cross-niche user journey analysis
        const journeys = await revenueGa4.getCrossNicheJourneys();
        if (journeys.length > 0) {
          logger.info('=== Cross-Niche User Journeys ===');
          for (const j of journeys.slice(0, 5)) {
            logger.info(`  ${j.fromCategory} → ${j.toCategory}: ~${j.transitions} cross-visits`);
          }
        }
      }
    } catch (revError) {
      logger.debug(`Revenue attribution failed: ${revError instanceof Error ? revError.message : revError}`);
    }
  }

  // Post-batch GA4 metrics comparison
  if (ga4Singleton && preBatchMetrics) {
    try {
      const postBatchMetrics = await ga4Singleton.getSiteMetricsSnapshot('7daysAgo', 'today');
      if (postBatchMetrics) {
        const pvDelta = postBatchMetrics.pageviews - preBatchMetrics.pageviews;
        const sessDelta = postBatchMetrics.sessions - preBatchMetrics.sessions;
        const engDelta = (postBatchMetrics.engagementRate - preBatchMetrics.engagementRate) * 100;
        logger.info(`Post-batch GA4 delta: pageviews ${pvDelta >= 0 ? '+' : ''}${pvDelta}, sessions ${sessDelta >= 0 ? '+' : ''}${sessDelta}, engagement ${engDelta >= 0 ? '+' : ''}${engDelta.toFixed(1)}pp`);
        if (config.TELEGRAM_BOT_TOKEN && config.TELEGRAM_CHAT_ID) {
          const metricsMsg = [
            '📊 *Batch GA4 Metrics Snapshot*',
            '',
            `*Pre-batch (7d):* ${preBatchMetrics.pageviews.toLocaleString()} PV | ${preBatchMetrics.sessions.toLocaleString()} sessions | ${(preBatchMetrics.engagementRate * 100).toFixed(1)}% engagement`,
            `*Post-batch (7d):* ${postBatchMetrics.pageviews.toLocaleString()} PV | ${postBatchMetrics.sessions.toLocaleString()} sessions | ${(postBatchMetrics.engagementRate * 100).toFixed(1)}% engagement`,
            `*Delta:* ${pvDelta >= 0 ? '+' : ''}${pvDelta} PV | ${sessDelta >= 0 ? '+' : ''}${sessDelta} sessions | ${engDelta >= 0 ? '+' : ''}${engDelta.toFixed(1)}pp engagement`,
          ].join('\n');
          await sendTelegramAlert(config.TELEGRAM_BOT_TOKEN, config.TELEGRAM_CHAT_ID, metricsMsg);
        }
      }
    } catch (postSnapErr) {
      logger.debug(`Post-batch GA4 snapshot failed: ${postSnapErr instanceof Error ? postSnapErr.message : postSnapErr}`);
    }
  }

  logger.info('=== Batch Complete ===');

  // Batch performance SLA tracking — persist duration/cost trends
  const batchDurationMs = new Date(batch.completedAt).getTime() - new Date(batch.startedAt).getTime();
  try {
    const slaFile = path.join(process.cwd(), 'data', 'batch-sla.json');
    let slaHistory: Array<{ date: string; durationMs: number; posts: number; costUsd: number }> = [];
    try { slaHistory = JSON.parse(await fs.readFile(slaFile, 'utf-8')); } catch { /* first run */ }
    const totalCost = costTracker.getTotalCost?.() ?? 0;
    slaHistory.push({
      date: new Date().toISOString().slice(0, 10),
      durationMs: batchDurationMs,
      posts: batch.successCount,
      costUsd: totalCost,
    });
    // Keep last 90 entries
    if (slaHistory.length > 90) slaHistory = slaHistory.slice(-90);
    const tmpSla = slaFile + '.tmp';
    await fs.writeFile(tmpSla, JSON.stringify(slaHistory, null, 2), 'utf-8');
    await fs.rename(tmpSla, slaFile);
    // SLA alert: warn if batch took >150% of 7-day average
    const recent = slaHistory.slice(-7);
    if (recent.length >= 3) {
      const avgDuration = recent.slice(0, -1).reduce((s, e) => s + e.durationMs, 0) / (recent.length - 1);
      if (batchDurationMs > avgDuration * 1.5 && config.TELEGRAM_BOT_TOKEN && config.TELEGRAM_CHAT_ID) {
        await sendTelegramAlert(config.TELEGRAM_BOT_TOKEN, config.TELEGRAM_CHAT_ID,
          `⏱ *Batch SLA Warning*\nDuration: ${Math.round(batchDurationMs / 60000)}min (avg: ${Math.round(avgDuration / 60000)}min)\nThis batch took ${Math.round((batchDurationMs / avgDuration) * 100)}% of recent average.`);
      }
      // Cost per post trend
      const costPerPost = batch.successCount > 0 ? totalCost / batch.successCount : 0;
      if (costPerPost > 0) {
        logger.info(`Batch SLA: ${Math.round(batchDurationMs / 60000)}min, $${costPerPost.toFixed(2)}/post, ${batch.successCount} posts`);
      }
    }
  } catch (slaErr) {
    logger.debug(`Batch SLA tracking failed: ${slaErr instanceof Error ? slaErr.message : slaErr}`);
  }

  // Send Telegram notification
  if (config.TELEGRAM_BOT_TOKEN && config.TELEGRAM_CHAT_ID) {
    await sendBatchSummary(config.TELEGRAM_BOT_TOKEN, config.TELEGRAM_CHAT_ID, {
      successCount: batch.successCount,
      failureCount: batch.failureCount,
      skippedCount: batch.skippedCount,
      totalDuration: batchDurationMs,
      results: results.map(r => ({
        keyword: r.keyword,
        niche: r.niche,
        success: r.success,
        postUrl: r.postUrl,
        error: r.error,
      })),
    });
  }

  // Exit with error code if all posts failed
  if (batch.successCount === 0 && batch.failureCount > 0) {
    process.exit(1);
  }
}

// Global unhandled error handlers — prevent silent hangs
process.on('unhandledRejection', (reason) => {
  logger.error(`Unhandled Promise rejection: ${reason instanceof Error ? reason.message : String(reason)}`);
  process.exit(1);
});
process.on('uncaughtException', (error) => {
  logger.error(`Uncaught exception: ${error.message}`);
  process.exit(1);
});

// Batch-level timeout (40 min) — prevent exceeding GitHub Actions 45-min limit
const BATCH_TIMEOUT_MS = 40 * 60 * 1000;
const batchTimer = setTimeout(() => {
  logger.error(`Batch timeout: exceeded ${BATCH_TIMEOUT_MS / 60000} minutes. Forcing exit.`);
  process.exit(1);
}, BATCH_TIMEOUT_MS);
batchTimer.unref(); // Don't block process exit

main().catch((error) => {
  logger.error(`Fatal error: ${error instanceof Error ? error.message : error}`);
  process.exit(1);
}).finally(() => clearTimeout(batchTimer));
