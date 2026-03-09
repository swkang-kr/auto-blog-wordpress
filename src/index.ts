import axios from 'axios';
import { loadConfig } from './config/env.js';
import { NICHES, getSeasonallyOrderedNiches } from './config/niches.js';
import { KeywordResearchService } from './services/keyword-research.service.js';
import { ContentGeneratorService } from './services/content-generator.service.js';
import { ImageGeneratorService } from './services/image-generator.service.js';
import { WordPressService } from './services/wordpress.service.js';
import { PagesService } from './services/pages.service.js';
import { SeoService } from './services/seo.service.js';
import { TwitterService } from './services/twitter.service.js';
import { DevToService } from './services/devto.service.js';
import { HashnodeService } from './services/hashnode.service.js';
import { GA4AnalyticsService } from './services/ga4-analytics.service.js';
import { GSCAnalyticsService } from './services/gsc-analytics.service.js';
import { PostHistory } from './utils/history.js';
import { sendBatchSummary } from './utils/alerting.js';
import { costTracker } from './utils/cost-tracker.js';
import { logger } from './utils/logger.js';
import { ContentRefreshService } from './services/content-refresh.service.js';
import { TopicClusterService } from './services/topic-cluster.service.js';
import type { PostResult, BatchResult, MediaUploadResult } from './types/index.js';
import { CATEGORY_PUBLISH_TIMING } from './types/index.js';

async function main(): Promise<void> {
  const startedAt = new Date().toISOString();
  logger.info('=== Auto Blog WordPress - Korea-Focused SEO Batch Start ===');

  // 1. Config
  const config = loadConfig();

  // 1.5. Load history early (needed for calendar-based niche reordering)
  const history = new PostHistory();
  await history.load();

  const seasonalNiches = getSeasonallyOrderedNiches();

  // Reorder by content calendar staleness (least recently published first)
  const stalenessOrder = history.getCategoriesByStalenessPriority(seasonalNiches.map(n => n.id));
  const calendarNiches = [...seasonalNiches].sort((a, b) => {
    return stalenessOrder.indexOf(a.id) - stalenessOrder.indexOf(b.id);
  });
  const activeNiches = calendarNiches.slice(0, config.POST_COUNT);
  const boostedNames = seasonalNiches.slice(0, config.POST_COUNT).filter((n, i) => {
    const origIdx = NICHES.findIndex(orig => orig.id === n.id);
    return origIdx !== i;
  }).map(n => n.name);
  logger.info(`Geo: ${config.TRENDS_GEO}, Niches: ${activeNiches.length}/${NICHES.length} (POST_COUNT=${config.POST_COUNT})${boostedNames.length > 0 ? ` | Seasonal boost: ${boostedNames.join(', ')}` : ''}`);

  // 2. Services
  const researchService = new KeywordResearchService(config.ANTHROPIC_API_KEY, config.TRENDS_GEO);
  const authorLinks = { linkedin: config.AUTHOR_LINKEDIN, twitter: config.AUTHOR_TWITTER };
  const contentService = new ContentGeneratorService(config.ANTHROPIC_API_KEY, config.SITE_OWNER, config.WP_URL, config.MIN_QUALITY_SCORE, authorLinks);
  const imageService = new ImageGeneratorService(config.GEMINI_API_KEY, config.IMAGE_FORMAT);
  const wpService = new WordPressService(config.WP_URL, config.WP_USERNAME, config.WP_APP_PASSWORD, config.SITE_OWNER, authorLinks);

  const twitterService =
    config.X_API_KEY && config.X_API_SECRET && config.X_ACCESS_TOKEN && config.X_ACCESS_TOKEN_SECRET
      ? new TwitterService(config.X_API_KEY, config.X_API_SECRET, config.X_ACCESS_TOKEN, config.X_ACCESS_TOKEN_SECRET)
      : null;
  if (twitterService) {
    logger.info('X (Twitter) promotion service enabled');
  } else {
    logger.info('X_API_KEY not set, skipping X promotion');
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



  // 2.5. Ensure required pages exist (AdSense compliance)
  const pagesService = new PagesService(config.WP_URL, config.WP_USERNAME, config.WP_APP_PASSWORD);
  try {
    await pagesService.ensureRequiredPages(config.SITE_NAME, config.SITE_OWNER, config.CONTACT_EMAIL, authorLinks);
  } catch (error) {
    logger.warn(`Failed to create required pages: ${error instanceof Error ? error.message : error}`);
  }

  // 2.6. SEO service + niche-aware site settings
  const seoService = new SeoService(config.WP_URL, config.WP_USERNAME, config.WP_APP_PASSWORD, {
    indexNowKey: config.INDEXNOW_KEY || undefined,
    indexingSaKey: config.GOOGLE_INDEXING_SA_KEY || undefined,
  });
  const nicheCategories = NICHES.map((n) => n.category);

  try {
    await seoService.ensureSiteTitle(config.SITE_NAME, nicheCategories);
  } catch (error) {
    logger.warn(`Site title setup failed: ${error instanceof Error ? error.message : error}`);
  }

  // 2.7. Ensure search engine verification meta tags + GA4
  try {
    await seoService.ensureHeaderScripts({
      googleCode: config.GOOGLE_SITE_VERIFICATION,
      naverCode: config.NAVER_SITE_VERIFICATION,
      gaMeasurementId: config.GA_MEASUREMENT_ID,
    });
  } catch (error) {
    logger.warn(`SEO/GA setup failed: ${error instanceof Error ? error.message : error}`);
  }

  // 2.8. Ensure mobile AdSense padding (prevent bottom banner covering navigation)
  try {
    await seoService.ensureAdSensePaddingSnippet();
  } catch (error) {
    logger.warn(`AdSense padding snippet setup failed: ${error instanceof Error ? error.message : error}`);
  }

  // 2.8b. Ensure thin archive pages are noindexed
  try {
    await seoService.ensureNoindexThinPagesSnippet();
  } catch (error) {
    logger.warn(`Noindex thin pages snippet setup failed: ${error instanceof Error ? error.message : error}`);
  }

  // 2.9a. Ensure JSON-LD wp_head snippet is installed
  try {
    await seoService.ensureJsonLdSnippet();
  } catch (error) {
    logger.warn(`JSON-LD snippet setup failed: ${error instanceof Error ? error.message : error}`);
  }

  // 2.9b. Ensure dark mode CSS snippet is installed (server-side, not inline)
  try {
    await seoService.ensureDarkModeSnippet();
  } catch (error) {
    logger.warn(`Dark mode snippet setup failed: ${error instanceof Error ? error.message : error}`);
  }

  // 2.8c. Ensure RSS feed optimization (full content, featured images)
  try {
    await seoService.ensureRssFeedOptimization();
  } catch (error) {
    logger.warn(`RSS feed optimization failed: ${error instanceof Error ? error.message : error}`);
  }

  // 2.8d. Ensure image sitemap enhancement
  try {
    await seoService.ensureImageSitemapSnippet();
  } catch (error) {
    logger.warn(`Image sitemap setup failed: ${error instanceof Error ? error.message : error}`);
  }

  // 2.8e. Ensure post content CSS snippet is installed site-wide
  let postCssSnippetActive = false;
  try {
    await seoService.ensurePostCssSnippet();
    postCssSnippetActive = await seoService.isPostCssSnippetActive();
    if (postCssSnippetActive) {
      logger.info('Post CSS loaded via site-wide snippet (inline CSS disabled)');
    }
  } catch (error) {
    logger.warn(`Post CSS snippet setup failed: ${error instanceof Error ? error.message : error}`);
  }

  // 2.9. Ensure IndexNow key file is served (for Naver Search Advisor)
  try {
    await seoService.ensureIndexNowKeySnippet();
  } catch (error) {
    logger.warn(`IndexNow key snippet setup failed: ${error instanceof Error ? error.message : error}`);
  }

  // 2.9c. Ensure hreflang snippet for internationalization signals
  try {
    await seoService.ensureHreflangSnippet();
  } catch (error) {
    logger.warn(`Hreflang snippet setup failed: ${error instanceof Error ? error.message : error}`);
  }

  // 2.10. Ensure navigation menu matches niche categories
  try {
    await seoService.ensureNavigationMenu(nicheCategories);
  } catch (error) {
    logger.warn(`Navigation menu setup failed: ${error instanceof Error ? error.message : error}`);
  }

  // 2.11. Check robots.txt + WordPress indexing settings + sitemap
  await seoService.checkRobotsTxt();
  await seoService.checkAndFixIndexingSettings();
  await seoService.verifySitemap();

  // 2.12. Ensure pillar pages for topic clusters
  try {
    const earlyPosts = await wpService.getRecentPosts(500);
    await pagesService.ensurePillarPages(NICHES, earlyPosts, config.SITE_NAME);
  } catch (error) {
    logger.warn(`Pillar pages update failed: ${error instanceof Error ? error.message : error}`);
  }

  // 2.13. Build pillar URL map for cluster navigation
  const pillarUrlMap: Record<string, string> = {};
  for (const niche of NICHES) {
    const pillarSlug = `guide-${niche.id}`;
    pillarUrlMap[niche.id] = `${config.WP_URL}/${pillarSlug}/`;
  }

  // 2.14. Build topic clusters for cluster-aware internal linking
  const topicClusterService = new TopicClusterService();

  // 3. History (already loaded in 2.0 for calendar reordering)

  // 3.5. GA4 + GSC Performance Feedback Loop
  let ga4OptimalHour: number | null = null;
  let ga4OptimalDay: number | null = null;
  const insightParts: string[] = [];

  if (config.GA4_PROPERTY_ID && config.GOOGLE_INDEXING_SA_KEY) {
    try {
      const ga4Service = new GA4AnalyticsService(config.GA4_PROPERTY_ID, config.GOOGLE_INDEXING_SA_KEY);
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
    } catch (error) {
      logger.warn(`GA4 performance feedback failed: ${error instanceof Error ? error.message : error}`);
    }
  }

  // Google Search Console integration (impressions, clicks, positions)
  if (config.GSC_SITE_URL && config.GOOGLE_INDEXING_SA_KEY) {
    try {
      const gscService = new GSCAnalyticsService(config.GSC_SITE_URL || config.WP_URL, config.GOOGLE_INDEXING_SA_KEY);
      const searchInsights = await gscService.getSearchInsights();
      if (searchInsights) {
        insightParts.push(searchInsights);
        logger.info('GSC search insights loaded for keyword research');
      }
      // SERP competition analysis: feed striking distance + top queries for content gap detection
      const [strikingDistance, topQueries] = await Promise.all([
        gscService.getStrikingDistanceKeywords(),
        gscService.getTopQueries(30),
      ]);
      if (strikingDistance.length > 0 || topQueries.length > 0) {
        researchService.setSerpAnalysis(strikingDistance, topQueries);
        logger.info(`SERP analysis loaded: ${strikingDistance.length} striking distance, ${topQueries.length} top queries`);
      }
    } catch (error) {
      logger.warn(`GSC search insights failed: ${error instanceof Error ? error.message : error}`);
    }
  }

  if (insightParts.length > 0) {
    researchService.setPerformanceInsights(insightParts.join('\n'));
  }

  // 3.55. Content decay detection + competitive threat monitoring
  if (config.GSC_SITE_URL && config.GOOGLE_INDEXING_SA_KEY) {
    try {
      const gscService = new GSCAnalyticsService(config.GSC_SITE_URL || config.WP_URL, config.GOOGLE_INDEXING_SA_KEY);

      // Declining pages detection
      const declining = await gscService.getDecliningPages();
      if (declining.length > 0) {
        logger.warn(`\n=== Content Decay Alert: ${declining.length} declining page(s) ===`);
        for (const page of declining.slice(0, 10)) {
          logger.warn(`  ${page.page} (pos ${page.position.toFixed(1)}, ${page.clicks} clicks/7d, ${page.impressions} imp/7d)`);
        }
        logger.warn(`Consider running: npx tsx src/scripts/refresh-stale-posts.ts`);
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

        // Feed competitive threats into performance insights for keyword research
        if (threats.length > 0) {
          const threatInsights = '\n## Competitive Threats (position declining — defend these rankings)\n' +
            threats.slice(0, 8).map(t =>
              `  - "${t.query}" on ${t.page}: pos ${t.previousPosition.toFixed(1)} -> ${t.currentPosition.toFixed(1)} [${t.urgency}]`,
            ).join('\n') +
            '\nConsider creating supporting content for these keywords to reclaim rankings.';
          researchService.setPerformanceInsights(
            (researchService as unknown as { performanceInsights: string }).performanceInsights + threatInsights,
          );
        }
      }
    } catch (error) {
      logger.debug(`Content decay/competitive check failed: ${error instanceof Error ? error.message : error}`);
    }
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
  }

  // Cross-niche keyword tracking (prevent different niches from picking similar topics in same batch)
  const batchKeywords: string[] = [];

  // ── Phase A: Research + Content Generation ──────────────────────────────
  logger.info('\n=== Phase A: Research + Content Generation (prompt-cache optimised) ===');
  const generated: GeneratedPost[] = [];
  const failedNiches: Array<{ niche: typeof NICHES[number]; resultIndex: number }> = [];

  for (const niche of activeNiches) {
    const postStart = Date.now();
    logger.info(`\n[Phase A] Niche: "${niche.name}"`);

    try {
      // A-1. Keyword research (include batch keywords to avoid cross-niche overlap)
      const postedKeywords = [...history.getPostedKeywordsForNiche(niche.id), ...batchKeywords];
      const recentContentTypes = history.getRecentContentTypes(niche.id, 5);
      const researched = await researchService.researchKeyword(niche, postedKeywords, recentContentTypes);

      // A-2. Skip if already posted
      if (history.isPosted(researched.analysis.selectedKeyword, niche.id)) {
        logger.info(`Already posted: "${researched.analysis.selectedKeyword}", skipping`);
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

      const content = await contentService.generateContent(researched, filteredPosts);
      generated.push({ niche, postStart, researched, content });

      // Track keyword for cross-niche dedup
      batchKeywords.push(researched.analysis.selectedKeyword);
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

        const content = await contentService.generateContent(researched, filteredPosts);
        generated.push({ niche, postStart: retryStart, researched, content });
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

  for (let gi = 0; gi < generated.length; gi++) {
    const { niche, postStart, researched, content } = generated[gi];
    logger.info(`\n[Phase B] Niche: "${niche.name}"`);

    // Calculate scheduled date: niche-specific timing > GA4-driven > config fallback
    let scheduledDate: string | undefined;
    {
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
      scheduledDate = scheduleTime.toISOString();
      logger.info(`Scheduling "${niche.category}" for: ${scheduleTime.toLocaleString('en-US', { timeZone: publishTz })} (${publishTz}) [${timingSource}]`);
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
          throw new Error(`Featured image required but all attempts failed for "${keyword}": ${fallbackError instanceof Error ? fallbackError.message : fallbackError}`);
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
      const ogImageUrl = featuredMediaResult.sourceUrl;

      // B-3.7. Generate cluster navigation HTML for related articles
      const clusterNavHtml = topicClusterService.generateClusterNavHtml(niche.id, '');

      // B-4. Create WordPress post (English only)
      const post = await wpService.createPost(
        content,
        featuredMediaResult.mediaId,
        inlineImages,
        {
          contentType: researched.analysis.contentType,
          keyword: researched.analysis.selectedKeyword,
          featuredImageUrl: featuredMediaResult.sourceUrl,
          ogImageUrl,
          publishStatus: config.PUBLISH_STATUS as 'publish' | 'draft',
          existingPosts,
          scheduledDate,
          pillarPageUrl: pillarUrlMap[niche.id],
          subNiche: niche.id,
          skipInlineCss: postCssSnippetActive,
          newsletterFormUrl: config.NEWSLETTER_FORM_URL || undefined,
          titleCandidates: content.titleCandidates,
          clusterNavHtml,
          affiliateMap: config.AFFILIATE_MAP ? (() => { try { return JSON.parse(config.AFFILIATE_MAP); } catch { return {}; } })() : undefined,
        },
      );

      if (content.qualityScore !== undefined) {
        logger.info(`Quality score: ${content.qualityScore}/100 for "${content.title}"`);
      }

      // B-5. IndexNow + Bing Sitemap Ping
      await seoService.notifyIndexNow([post.url]);
      await seoService.pingSitemap();

      // B-6. X (Twitter) promotion (optional)
      if (twitterService) {
        await twitterService.promoteBlogPost(content, post);
      }

      // B-7. DEV.to syndication (optional)
      if (devtoService) {
        await devtoService.syndicateBlogPost(content, post);
      }

      // B-8. Hashnode syndication (optional)
      if (hashnodeService) {
        await hashnodeService.syndicateBlogPost(content, post);
      }

      // B-9. Google Indexing API
      await seoService.requestIndexing(post.url);

      // B-10. Record history + category publish timestamp
      await history.recordCategoryPublish(niche.id);
      await history.addEntry({
        keyword: researched.analysis.selectedKeyword,
        postId: post.postId,
        postUrl: post.url,
        publishedAt: new Date().toISOString(),
        niche: niche.id,
        contentType: researched.analysis.contentType,
        titleCandidates: content.titleCandidates,
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

  // 4.2. Auto-rewrite underperforming posts (when enabled)
  if (config.AUTO_REWRITE_COUNT > 0 && config.GA4_PROPERTY_ID && config.GOOGLE_INDEXING_SA_KEY) {
    try {
      const ga4Service = new GA4AnalyticsService(config.GA4_PROPERTY_ID, config.GOOGLE_INDEXING_SA_KEY);
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
      const gscForRefresh = (config.GSC_SITE_URL && config.GOOGLE_INDEXING_SA_KEY)
        ? new GSCAnalyticsService(config.GSC_SITE_URL || config.WP_URL, config.GOOGLE_INDEXING_SA_KEY)
        : undefined;
      const rewritten = await refreshService.refreshDecliningPosts(
        ga4Service, seoService, config.AUTO_REWRITE_COUNT, config.AUTO_REWRITE_MIN_AGE_DAYS, freshnessData, gscForRefresh,
      );
      if (rewritten > 0) {
        logger.info(`Auto-rewrote ${rewritten} underperforming post(s)`);
      }
    } catch (error) {
      logger.warn(`Auto-rewrite failed: ${error instanceof Error ? error.message : error}`);
    }
  }

  // 4.25. A/B title testing — multi-signal evaluation after 7+ days
  // Uses GA4 bounce rate + GSC CTR + engagement time to decide title switches
  if (config.GA4_PROPERTY_ID && config.GOOGLE_INDEXING_SA_KEY) {
    try {
      const ga4Service = new GA4AnalyticsService(config.GA4_PROPERTY_ID, config.GOOGLE_INDEXING_SA_KEY);
      const gscService = (config.GSC_SITE_URL && config.GOOGLE_INDEXING_SA_KEY)
        ? new GSCAnalyticsService(config.GSC_SITE_URL || config.WP_URL, config.GOOGLE_INDEXING_SA_KEY)
        : null;

      const entriesWithCandidates = history.getAllEntries()
        .filter(e => e.titleCandidates?.length && !e.titleTestResolved)
        .filter(e => {
          const age = (Date.now() - new Date(e.publishedAt).getTime()) / (1000 * 60 * 60 * 24);
          return age >= 7;
        });

      if (entriesWithCandidates.length > 0) {
        const [ga4Perf, gscPages] = await Promise.all([
          ga4Service.getTopPerformingPosts(200),
          gscService ? gscService.getPagePerformance(100) : Promise.resolve([]),
        ]);

        for (const entry of entriesWithCandidates.slice(0, 5)) {
          try {
            const postPerf = ga4Perf.find(p => entry.postUrl.includes(p.url.replace(/^\//, '')));
            if (!postPerf || postPerf.pageviews < 10) continue;

            // GSC data: check actual search CTR (more reliable than bounce rate alone)
            const gscPage = gscPages.find(p => entry.postUrl.includes(p.page.replace(/^https?:\/\/[^/]+/, '')));
            const searchCtr = gscPage?.ctr ?? null;

            // Multi-signal decision: switch title if poor performance across signals
            const shouldSwitch =
              (postPerf.bounceRate > 0.65 && postPerf.avgEngagementTime < 60) || // High bounce + low engagement
              (searchCtr !== null && searchCtr < 0.02 && (gscPage?.impressions ?? 0) > 50) || // Low CTR despite impressions
              (postPerf.bounceRate > 0.7); // Very high bounce alone

            if (shouldSwitch) {
              // Select the best candidate (prefer shorter, more specific titles)
              const candidates = entry.titleCandidates!;
              const newTitle = candidates.reduce((best, c) =>
                c.length >= 45 && c.length <= 65 && c.length < best.length ? c : best,
                candidates[0],
              );

              const signals = [
                `bounce: ${(postPerf.bounceRate * 100).toFixed(0)}%`,
                `engagement: ${postPerf.avgEngagementTime.toFixed(0)}s`,
                searchCtr !== null ? `search CTR: ${(searchCtr * 100).toFixed(1)}%` : null,
              ].filter(Boolean).join(', ');

              logger.info(`A/B test: Switching title for post ${entry.postId} to "${newTitle}" (${signals})`);
              await wpService.updatePostMeta(entry.postId, { rank_math_title: newTitle });
              try {
                const wpApi = (wpService as unknown as { api: { post: (url: string, data: unknown) => Promise<unknown> } }).api;
                await wpApi.post(`/posts/${entry.postId}`, { title: newTitle });
              } catch {
                logger.debug(`Could not update post title directly for ${entry.postId}`);
              }
            } else {
              logger.debug(`A/B test: Post ${entry.postId} performing adequately, keeping current title`);
            }
            await history.markTitleTestResolved(entry.postId);
          } catch (error) {
            logger.debug(`A/B title test failed for post ${entry.postId}: ${error instanceof Error ? error.message : error}`);
          }
        }
      }
    } catch (error) {
      logger.warn(`A/B title testing failed: ${error instanceof Error ? error.message : error}`);
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

  // API cost summary
  costTracker.logSummary();

  logger.info('\n=== Batch Summary ===');
  logger.info(`Total: ${batch.totalKeywords} | Success: ${batch.successCount} | Failed: ${batch.failureCount} | Skipped: ${batch.skippedCount}`);

  for (const r of results) {
    if (r.success) {
      logger.info(`  [OK] [${r.niche}] "${r.keyword}" → ${r.postUrl} (${r.duration}ms)`);
    } else {
      logger.error(`  [FAIL] [${r.niche}] "${r.keyword}" → ${r.error}`);
    }
  }

  logger.info('=== Batch Complete ===');

  // Send Slack notification
  if (config.SLACK_WEBHOOK_URL) {
    await sendBatchSummary(config.SLACK_WEBHOOK_URL, {
      successCount: batch.successCount,
      failureCount: batch.failureCount,
      skippedCount: batch.skippedCount,
      totalDuration: new Date(batch.completedAt).getTime() - new Date(batch.startedAt).getTime(),
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

main().catch((error) => {
  logger.error(`Fatal error: ${error instanceof Error ? error.message : error}`);
  process.exit(1);
});
