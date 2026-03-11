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
import { sendBatchSummary, sendQualityAlert, sendDecayAlert, sendHealthCheck, sendTelegramAlert } from './utils/alerting.js';
import { DataVisualizationService } from './services/data-visualization.service.js';
import { costTracker, CostTracker } from './utils/cost-tracker.js';
import { logger } from './utils/logger.js';
import { ContentRefreshService } from './services/content-refresh.service.js';
import { TopicClusterService } from './services/topic-cluster.service.js';
import { FactCheckService } from './services/fact-check.service.js';
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
  );
  const authorLinks = { linkedin: config.AUTHOR_LINKEDIN, twitter: config.AUTHOR_TWITTER, website: config.AUTHOR_WEBSITE, credentials: config.AUTHOR_CREDENTIALS };
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
    await seoService.ensureSiteTitle(config.SITE_NAME, nicheCategories);
  } catch (error) {
    logger.warn(`Site title setup failed: ${error instanceof Error ? error.message : error}`);
  }

  // 2.6b. Ensure category-based permalink structure for topical authority
  try {
    await seoService.ensureCategoryPermalinks();
  } catch (error) {
    logger.warn(`Permalink setup failed: ${error instanceof Error ? error.message : error}`);
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

  // 2.8e. Ensure sitemap priority by content freshness class
  try {
    await seoService.ensureSitemapPrioritySnippet();
  } catch (error) {
    logger.warn(`Sitemap priority setup failed: ${error instanceof Error ? error.message : error}`);
  }

  // 2.8g. Ensure News Sitemap for news-explainer content (Google News eligibility)
  try {
    await seoService.ensureNewsSitemapSnippet();
  } catch (error) {
    logger.warn(`News sitemap setup failed: ${error instanceof Error ? error.message : error}`);
  }

  // 2.8h. Ensure Video Sitemap for YouTube embeds (Google Video carousel)
  try {
    await seoService.ensureVideoSitemapSnippet();
  } catch (error) {
    logger.warn(`Video sitemap setup failed: ${error instanceof Error ? error.message : error}`);
  }

  // 2.8f. Ensure post content CSS snippet is installed site-wide
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

  // 2.9d. Ensure WebSite + Organization JSON-LD schemas (Sitelinks Searchbox + Knowledge Panel)
  try {
    await seoService.ensureSiteSchemaSnippet(config.SITE_NAME, config.SITE_OWNER, {
      linkedin: config.AUTHOR_LINKEDIN,
      twitter: config.AUTHOR_TWITTER,
      website: config.AUTHOR_WEBSITE,
    });
  } catch (error) {
    logger.warn(`Site schema snippet setup failed: ${error instanceof Error ? error.message : error}`);
  }

  // 2.10. Ensure navigation menu matches niche categories
  try {
    await seoService.ensureNavigationMenu(nicheCategories);
  } catch (error) {
    logger.warn(`Navigation menu setup failed: ${error instanceof Error ? error.message : error}`);
  }

  // 2.10a2. Ensure CDN/Edge caching headers (Cloudflare)
  if (config.CLOUDFLARE_API_TOKEN && config.CLOUDFLARE_ZONE_ID) {
    try {
      await seoService.ensureCacheHeaders(config.CLOUDFLARE_API_TOKEN, config.CLOUDFLARE_ZONE_ID);
    } catch (error) {
      logger.warn(`CDN cache setup failed: ${error instanceof Error ? error.message : error}`);
    }
  }

  // 2.10b. Ensure comment settings + spam cleanup
  try {
    await seoService.ensureCommentSettings();
    await seoService.cleanupSpamComments();
  } catch (error) {
    logger.warn(`Comment settings/cleanup failed: ${error instanceof Error ? error.message : error}`);
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

  // 2.15. Manual review mode: force draft for initial posts (AdSense safety)
  let effectivePublishStatus = config.PUBLISH_STATUS as 'publish' | 'draft';
  if (config.MANUAL_REVIEW_THRESHOLD > 0) {
    const totalPublished = history.getAllEntries().length;
    if (totalPublished < config.MANUAL_REVIEW_THRESHOLD) {
      effectivePublishStatus = 'draft';
      logger.info(
        `Manual Review Mode: ${totalPublished}/${config.MANUAL_REVIEW_THRESHOLD} posts published. ` +
        `Forcing draft mode for quality review. Set MANUAL_REVIEW_THRESHOLD=0 to disable.`,
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

  // Google Search Console integration (impressions, clicks, positions, decay, threats)
  let gscService: GSCAnalyticsService | null = null;
  if (config.GSC_SITE_URL && config.GOOGLE_INDEXING_SA_KEY) {
    try {
      gscService = new GSCAnalyticsService(config.GSC_SITE_URL || config.WP_URL, config.GOOGLE_INDEXING_SA_KEY);
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
          logger.info(`Featured snippet: ${snippetOpps.length} opportunity(ies) detected`);
        }
      } catch (snippetErr) {
        logger.debug(`Featured snippet detection failed: ${snippetErr instanceof Error ? snippetErr.message : snippetErr}`);
      }
    } catch (error) {
      logger.warn(`GSC integration failed: ${error instanceof Error ? error.message : error}`);
    }
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

  // Cluster completeness dashboard: identify high-priority content gaps
  for (const niche of activeNiches) {
    try {
      const completeness = topicClusterService.getClusterCompleteness(niche.id);
      if (completeness && completeness.highPriorityGaps.length > 0) {
        logger.info(`Cluster completeness [${niche.id}]: ${completeness.coveragePct.toFixed(0)}% coverage, ${completeness.highPriorityGaps.length} high-priority gap(s)`);
        if (completeness.insightString) {
          insightParts.push(completeness.insightString);
        }
      }
    } catch (error) {
      logger.debug(`Cluster completeness check failed for ${niche.id}: ${error instanceof Error ? error.message : error}`);
    }
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

  // 3.7b. Competitor gap analysis: find high-value content opportunities from GSC data
  if (config.GSC_SITE_URL && config.GOOGLE_INDEXING_SA_KEY) {
    try {
      const gscGapService = new GSCAnalyticsService(config.GSC_SITE_URL || config.WP_URL, config.GOOGLE_INDEXING_SA_KEY);
      const [gapStriking, gapTopQueries] = await Promise.all([
        gscGapService.getStrikingDistanceKeywords(),
        gscGapService.getTopQueries(50),
      ]);
      if (gapStriking.length > 0 || gapTopQueries.length > 0) {
        const competitorGaps = topicClusterService.analyzeCompetitorGaps(gapStriking, gapTopQueries, existingPosts);
        if (competitorGaps.length > 0) {
          // Feed high-priority create opportunities into keyword research as seed suggestions
          const createOpportunities = competitorGaps
            .filter(g => g.opportunity === 'create' && g.priority === 'high')
            .slice(0, 5)
            .map(g => g.query);
          if (createOpportunities.length > 0) {
            const gapInsight = `\n## Content Gap Opportunities (from competitor analysis)\nHigh-value queries with impressions but no dedicated content: ${createOpportunities.map(q => `"${q}"`).join(', ')}. Prioritize creating targeted content for these queries.`;
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

  // ── Phase A: Research + Content Generation ──────────────────────────────
  logger.info('\n=== Phase A: Research + Content Generation (prompt-cache optimised) ===');
  const generated: GeneratedPost[] = [];
  const failedNiches: Array<{ niche: typeof NICHES[number]; resultIndex: number }> = [];

  for (let nicheIdx = 0; nicheIdx < activeNiches.length; nicheIdx++) {
    const niche = activeNiches[nicheIdx];
    const postStart = Date.now();
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

    try {
      // A-1. Keyword research (include batch keywords to avoid cross-niche overlap)
      const postedKeywords = [...history.getPostedKeywordsForNiche(niche.id), ...batchKeywords];
      const recentContentTypes = history.getRecentContentTypes(niche.id, 5);
      const researched = await researchService.researchKeyword(niche, postedKeywords, recentContentTypes);

      // A-1.5. Fast-track breakout trends — bypass scheduling for breaking news
      const hasBreakout = researched.trendsData.some(t => t.hasBreakout);
      if (hasBreakout) {
        logger.info(`⚡ BREAKING TREND detected for "${researched.analysis.selectedKeyword}" — fast-tracking publication`);
        // Prefer news-explainer content type for breakout topics
        if (researched.analysis.contentType !== 'news-explainer' && niche.contentTypes.includes('news-explainer')) {
          researched.analysis.contentType = 'news-explainer';
          logger.info(`  Content type switched to news-explainer for breakout trend`);
        }
      }

      // A-2. Skip if already posted (history file + WordPress meta fallback)
      if (history.isPosted(researched.analysis.selectedKeyword, niche.id)) {
        logger.info(`Already posted: "${researched.analysis.selectedKeyword}", skipping`);
        skippedCount++;
        continue;
      }
      // WordPress meta fallback: check existing posts for keyword/title overlap (guards against history file desync)
      const kwLower = researched.analysis.selectedKeyword.toLowerCase();
      const wpDuplicate = existingPosts.find(p => {
        const titleMatch = p.title.toLowerCase().includes(kwLower) || kwLower.includes(p.title.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim());
        const keywordMatch = p.keyword && (p.keyword.toLowerCase() === kwLower || p.keyword.toLowerCase().includes(kwLower));
        return titleMatch || keywordMatch;
      });
      if (wpDuplicate) {
        logger.warn(`WordPress duplicate detected: "${researched.analysis.selectedKeyword}" matches existing post "${wpDuplicate.title}" (${wpDuplicate.url}). Skipping.`);
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

      const content = await contentService.generateContent(researched, filteredPosts, clusterLinksForPrompt, { postCount, rankingKeywords: gscRankingKeywords });
      generated.push({ niche, postStart, researched, content, fastTrack: hasBreakout, selectedPersona });

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

        const retryClusterLinks = topicClusterService.getClusterLinks(niche.id, researched.analysis.selectedKeyword, 5);
        const retryClusterLinksForPrompt = retryClusterLinks.map(cl => ({ url: cl.url, title: cl.title, keyword: cl.keyword }));

        const retryPostCount = history.getPostedKeywordsForNiche(niche.id).length;
        const retryPersona = contentService.selectAuthorPersona(niche.category, researched.analysis.contentType, retryPostCount);

        const content = await contentService.generateContent(researched, filteredPosts, retryClusterLinksForPrompt, { postCount: retryPostCount, rankingKeywords: gscRankingKeywords });
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

      // B-3.8. Pre-publish plagiarism check against existing posts
      try {
        const { detectPlagiarism } = await import('./utils/content-validator.js');
        const plagiarismMatches = detectPlagiarism(content.html, existingPosts, 0.25);
        if (plagiarismMatches.length > 0) {
          const topMatch = plagiarismMatches[0];
          if (topMatch.similarity > 0.5) {
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
      try {
        const factResult = await factCheckService.verifyContent(content.html, niche.category);
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
      }
      // Inject lead magnet mention for all niches with lead magnets
      content.html = wpService.injectLeadMagnetMention(content.html, niche.category);

      // Enhanced lead magnet with category-specific CTA (requires LEAD_MAGNET_URL)
      if (config.LEAD_MAGNET_URL) {
        content.html = wpService.injectEnhancedLeadMagnet(
          content.html, niche.category,
          config.LEAD_MAGNET_URL,
          config.LEAD_MAGNET_TITLE || `Free ${niche.category} Guide`,
        );
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
          const searchQuery = `${researched.analysis.selectedKeyword} Korea ${new Date().getFullYear()}`;
          const ytResponse = await axios.get('https://www.googleapis.com/youtube/v3/search', {
            params: {
              part: 'snippet',
              q: searchQuery,
              type: 'video',
              maxResults: 1,
              relevanceLanguage: 'en',
              key: config.YOUTUBE_API_KEY,
            },
            timeout: 10000,
          });
          const ytItems = ytResponse.data?.items;
          if (ytItems?.length > 0) {
            const videoId = ytItems[0].id?.videoId;
            const videoTitle = ytItems[0].snippet?.title || searchQuery;
            if (videoId) {
              content.html = WordPressService.injectYouTubeEmbed(
                content.html,
                `https://www.youtube.com/watch?v=${videoId}`,
                videoTitle,
              );
              logger.info(`YouTube embed injected: "${videoTitle}" for "${researched.analysis.selectedKeyword}"`);
            }
          }
        } catch (ytError) {
          logger.debug(`YouTube embed skipped: ${ytError instanceof Error ? ytError.message : ytError}`);
        }
      }

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
        },
      );

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

      // B-4.5. Generate Korean version (if enabled) for hreflang SEO
      let koreanPostUrl: string | undefined;
      if (config.ENABLE_KOREAN_CONTENT === 'true') {
        try {
          const { KoreanContentService } = await import('./services/korean-content.service.js');
          const koreanService = new KoreanContentService(config.ANTHROPIC_API_KEY, config.CLAUDE_MODEL);

          // Korean keyword research: find the right Korean search terms
          const koreanKeywords = await koreanService.researchKoreanKeyword(
            researched.analysis.selectedKeyword, niche.category,
          );

          const koreanVersion = await koreanService.generateKoreanVersion(
            content.title, content.html, content.excerpt,
            niche.category, koreanKeywords?.koreanKeyword || researched.analysis.selectedKeyword,
          );
          if (koreanVersion) {
            // Merge Naver tags into Korean post tags
            if (koreanKeywords?.naverTags) {
              koreanVersion.tags = [...new Set([...koreanVersion.tags, ...koreanKeywords.naverTags])].slice(0, 10);
            }

            // Create Korean version as a separate post with hreflang linking
            const koreanPost = await wpService.createPost(
              {
                ...content,
                title: koreanVersion.title,
                html: koreanVersion.html,
                excerpt: koreanVersion.excerpt,
                tags: koreanVersion.tags,
                slug: content.slug ? `ko-${content.slug}` : undefined,
              },
              featuredMediaResult.mediaId,
              undefined,
              {
                contentType: researched.analysis.contentType,
                keyword: koreanKeywords?.koreanKeyword || researched.analysis.selectedKeyword,
                featuredImageUrl: featuredMediaResult.sourceUrl,
                publishStatus: effectivePublishStatus,
                skipInlineCss: postCssSnippetActive,
              },
            );
            // Set hreflang meta + Naver SEO meta on both posts for mutual linking
            const naverMeta = koreanKeywords
              ? KoreanContentService.buildNaverMetaTags(koreanVersion.title, koreanVersion.excerpt, koreanKeywords.naverTags, koreanPost.url)
              : {};
            await wpService.updatePostMeta(post.postId, {
              _autoblog_hreflang_ko: koreanPost.url,
              _autoblog_hreflang_en: post.url,
            });
            await wpService.updatePostMeta(koreanPost.postId, {
              _autoblog_hreflang_en: post.url,
              _autoblog_hreflang_ko: koreanPost.url,
              ...(koreanKeywords?.koreanKeyword ? { rank_math_focus_keyword: koreanKeywords.koreanKeyword } : {}),
              ...naverMeta,
            });
            koreanPostUrl = koreanPost.url;
            logger.info(`Korean version published: ${koreanPost.url} (hreflang linked${koreanKeywords ? ', Naver SEO applied' : ''})`);
          }
        } catch (koError) {
          logger.debug(`Korean content generation failed: ${koError instanceof Error ? koError.message : koError}`);
        }
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

      // B-8.5. Pinterest auto-pin (optional, visual categories only)
      if (pinterestService && PinterestService.isEligible(niche.category)) {
        await pinterestService.pinBlogPost(content, post, featuredMediaResult.sourceUrl);
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
        ...(seriesId ? { seriesId, seriesPart } : {}),
        ...(koreanPostUrl ? { koreanPostUrl } : {}),
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

  // 4.2. Auto-rewrite underperforming posts (when enabled, with timeout guard)
  const elapsedMinutes = (Date.now() - new Date(startedAt).getTime()) / 60000;
  const REWRITE_TIME_BUDGET_MIN = 35; // Skip rewrite if already past 35 min (GitHub Actions timeout is 45 min)
  if (config.AUTO_REWRITE_COUNT > 0 && config.GA4_PROPERTY_ID && config.GOOGLE_INDEXING_SA_KEY && elapsedMinutes < REWRITE_TIME_BUDGET_MIN) {
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
        // Flag Korean versions of rewritten posts for refresh
        if (config.ENABLE_KOREAN_CONTENT === 'true') {
          const rewrittenEntries = history.getAllEntries()
            .filter(e => e.koreanPostUrl && e.lastRefreshedAt)
            .filter(e => {
              const refreshedAt = new Date(e.lastRefreshedAt!).getTime();
              return Date.now() - refreshedAt < 2 * 60 * 60 * 1000; // refreshed in this batch
            });
          if (rewrittenEntries.length > 0) {
            logger.info(`Korean content sync needed: ${rewrittenEntries.length} rewritten post(s) have Korean versions. Run Korean refresh manually or wait for next batch.`);
            // Send Telegram alert for Korean sync needed
            if (config.TELEGRAM_BOT_TOKEN && config.TELEGRAM_CHAT_ID) {
              await sendTelegramAlert(
                config.TELEGRAM_BOT_TOKEN, config.TELEGRAM_CHAT_ID,
                `🇰🇷 Korean Content Sync Needed\n${rewrittenEntries.length} English post(s) were rewritten but their Korean versions are now outdated:\n${rewrittenEntries.map(e => `• "${e.keyword}"`).join('\n')}`,
              );
            }
          }
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
      const gscCtrService = new GSCAnalyticsService(config.GSC_SITE_URL || config.WP_URL, config.GOOGLE_INDEXING_SA_KEY);
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
    const ga4ForPrune = config.GA4_PROPERTY_ID && config.GOOGLE_INDEXING_SA_KEY
      ? new GA4AnalyticsService(config.GA4_PROPERTY_ID, config.GOOGLE_INDEXING_SA_KEY)
      : undefined;
    const gscForPrune = config.GSC_SITE_URL && config.GOOGLE_INDEXING_SA_KEY
      ? new GSCAnalyticsService(config.GSC_SITE_URL || config.WP_URL, config.GOOGLE_INDEXING_SA_KEY)
      : undefined;
    const pruned = await pruneService.pruneStaleContent(history.getAllEntries(), ga4ForPrune, gscForPrune, 3);
    if (pruned > 0) {
      logger.info(`Content pruning: ${pruned} stale post(s) archived (draft + noindex)`);
      if (config.TELEGRAM_BOT_TOKEN && config.TELEGRAM_CHAT_ID) {
        await sendQualityAlert(config.TELEGRAM_BOT_TOKEN, config.TELEGRAM_CHAT_ID, 'Content Pruning', '', 0, 0, [`${pruned} stale post(s) auto-archived`]);
      }
    }
  } catch (error) {
    logger.warn(`Content pruning failed: ${error instanceof Error ? error.message : error}`);
  }

  // 4.22d. Content lifecycle: detect merge candidates (cannibalization reduction)
  try {
    const mergeCandidates = ContentRefreshService.detectMergeCandidates(history.getAllEntries());
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
        const mergeMsg = mergeCandidates.slice(0, 3).map(c => c.recommendation).join('\n');
        await sendQualityAlert(config.TELEGRAM_BOT_TOKEN, config.TELEGRAM_CHAT_ID, 'Content Merge Candidates', '', 0, 0, [mergeMsg]);
      }
    }
  } catch (error) {
    logger.warn(`Content merge detection failed: ${error instanceof Error ? error.message : error}`);
  }

  // 4.23. Keyword ranking tracking — store position trends in history
  if (config.GSC_SITE_URL && config.GOOGLE_INDEXING_SA_KEY) {
    try {
      const gscRankingService = new GSCAnalyticsService(config.GSC_SITE_URL || config.WP_URL, config.GOOGLE_INDEXING_SA_KEY);
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
      const gscCannibal = new GSCAnalyticsService(config.GSC_SITE_URL || config.WP_URL, config.GOOGLE_INDEXING_SA_KEY);
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
        logger.warn(`Redirect chains found: ${chains.length} chain(s) — update internal links to point directly to final URLs`);
        if (config.TELEGRAM_BOT_TOKEN && config.TELEGRAM_CHAT_ID) {
          const chainMsg = chains.slice(0, 3).map(c => `[${c.hops} hops] ${c.originalUrl} → ${c.finalUrl}`).join('\n');
          await sendQualityAlert(config.TELEGRAM_BOT_TOKEN, config.TELEGRAM_CHAT_ID, 'Redirect Chain Alert', '', 0, 0, [chainMsg]);
        }
      }
    }
  } catch (error) {
    logger.debug(`Redirect chain detection failed: ${error instanceof Error ? error.message : error}`);
  }

  // 4.23b. Title pattern CTR analysis (log insights for keyword research optimization)
  if (config.GA4_PROPERTY_ID && config.GOOGLE_INDEXING_SA_KEY) {
    try {
      const ga4Patterns = new GA4AnalyticsService(config.GA4_PROPERTY_ID, config.GOOGLE_INDEXING_SA_KEY);
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

  // 4.25. A/B title testing — real rotation: Title A (days 0-3) → Title B (days 3-6) → winner (day 7+)
  // Uses GSC CTR as primary signal (most reliable for title effectiveness)
  if (config.GA4_PROPERTY_ID && config.GOOGLE_INDEXING_SA_KEY) {
    try {
      const ga4Service = new GA4AnalyticsService(config.GA4_PROPERTY_ID, config.GOOGLE_INDEXING_SA_KEY);
      const gscService = (config.GSC_SITE_URL && config.GOOGLE_INDEXING_SA_KEY)
        ? new GSCAnalyticsService(config.GSC_SITE_URL || config.WP_URL, config.GOOGLE_INDEXING_SA_KEY)
        : null;

      const entriesWithCandidates = history.getAllEntries()
        .filter(e => e.titleCandidates?.length && !e.titleTestResolved);

      if (entriesWithCandidates.length > 0) {
        const [ga4Perf, gscPages] = await Promise.all([
          ga4Service.getTopPerformingPosts(200),
          gscService ? gscService.getPagePerformance(100) : Promise.resolve([]),
        ]);

        for (const entry of entriesWithCandidates.slice(0, 5)) {
          try {
            const ageDays = (Date.now() - new Date(entry.publishedAt).getTime()) / (1000 * 60 * 60 * 24);
            const candidates = entry.titleCandidates!;

            // Phase 1 (day 0-3): Original title (Title A) — already set at publish
            if (ageDays < 3) {
              // Record baseline CTR if GSC data available
              const gscPage = gscPages.find(p => entry.postUrl.includes(p.page.replace(/^https?:\/\/[^/]+/, '')));
              if (gscPage && !entry.titleTestPhaseACtr) {
                entry.titleTestPhaseACtr = gscPage.ctr;
                entry.titleTestPhaseATitle = entry.originalTitle || entry.keyword; // Original post title
                await history.persist();
                logger.debug(`A/B test: Phase A baseline recorded for post ${entry.postId} (CTR: ${(gscPage.ctr * 100).toFixed(1)}%)`);
              }
              continue;
            }

            // Phase 2 (day 3-6): Switch to Title B (best alternative candidate)
            if (ageDays >= 3 && ageDays < 6 && !entry.titleTestPhaseBStarted) {
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

            // Phase 3 (day 6-7): Record Title B CTR
            if (ageDays >= 6 && ageDays < 7 && entry.titleTestPhaseBStarted && !entry.titleTestPhaseBCtr) {
              const gscPage = gscPages.find(p => entry.postUrl.includes(p.page.replace(/^https?:\/\/[^/]+/, '')));
              if (gscPage) {
                entry.titleTestPhaseBCtr = gscPage.ctr;
                await history.persist();
                logger.debug(`A/B test: Phase B CTR recorded for post ${entry.postId} (CTR: ${(gscPage.ctr * 100).toFixed(1)}%)`);
              }
              continue;
            }

            // Phase 4 (day 7+): Decide winner based on CTR comparison
            if (ageDays >= 7) {
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
              } else {
                // Not enough data — keep current
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
      const gscForAB = new GSCAnalyticsService(config.GSC_SITE_URL || config.WP_URL, config.GOOGLE_INDEXING_SA_KEY);
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
      const ga4Social = new GA4AnalyticsService(config.GA4_PROPERTY_ID, config.GOOGLE_INDEXING_SA_KEY);
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
      const gscSnippet = new GSCAnalyticsService(config.GSC_SITE_URL || config.WP_URL, config.GOOGLE_INDEXING_SA_KEY);
      const snippetOptimized = await refreshService.optimizeForFeaturedSnippets(gscSnippet, seoService, 2);
      if (snippetOptimized > 0) {
        logger.info(`Featured snippet: Optimized ${snippetOptimized} post(s) for Position 0 capture`);
      }
    } catch (error) {
      logger.warn(`Featured snippet optimization failed: ${error instanceof Error ? error.message : error}`);
    }
  }

  // 4.9. [#2] Early content decay detection — 3-day consecutive position decline alert
  if (gscService) {
    try {
      const decayItems = await gscService.detectEarlyDecay();
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
  }

  // 4.10. [#16] RPM feedback loop — auto-adjust RPM from GA4 AdSense revenue data
  if (config.GA4_PROPERTY_ID && config.GOOGLE_INDEXING_SA_KEY) {
    try {
      const ga4RpmService = new GA4AnalyticsService(config.GA4_PROPERTY_ID, config.GOOGLE_INDEXING_SA_KEY);
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
      const ga4Rpm = new GA4AnalyticsService(config.GA4_PROPERTY_ID, config.GOOGLE_INDEXING_SA_KEY);
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

  for (const r of results) {
    if (r.success) {
      logger.info(`  [OK] [${r.niche}] "${r.keyword}" → ${r.postUrl} (${r.duration}ms)`);
    } else {
      logger.error(`  [FAIL] [${r.niche}] "${r.keyword}" → ${r.error}`);
    }
  }

  logger.info('=== Batch Complete ===');

  // Send Telegram notification
  if (config.TELEGRAM_BOT_TOKEN && config.TELEGRAM_CHAT_ID) {
    await sendBatchSummary(config.TELEGRAM_BOT_TOKEN, config.TELEGRAM_CHAT_ID, {
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
