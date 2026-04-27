import axios from 'axios';
import { logger } from '../utils/logger.js';
import { getGoogleAccessToken } from '../utils/google-auth.js';
import { circuitBreakers } from '../utils/retry.js';
import type { PostPerformance, PostHistoryEntry } from '../types/index.js';

/** Normalize a URL path for comparison: strip trailing slash + decode percent-encoding */
function normPath(urlOrPath: string): string {
  let path = urlOrPath;
  try {
    // If it looks like a full URL, extract pathname
    if (urlOrPath.startsWith('http')) path = new URL(urlOrPath).pathname;
  } catch { /* keep as-is */ }
  try { path = decodeURIComponent(path); } catch { /* keep encoded if malformed */ }
  return path.replace(/\/$/, '');
}

/**
 * GA4 Data API service for performance feedback loop.
 * Fetches top-performing and worst-performing posts to inform keyword research.
 */
export class GA4AnalyticsService {
  private propertyId: string;
  private saKey: string;

  constructor(ga4PropertyId: string, googleSaKey: string) {
    this.propertyId = ga4PropertyId;
    this.saKey = googleSaKey;
  }

  /**
   * Fetch top-performing posts from GA4 (last 30 days).
   * Returns posts sorted by pageviews descending.
   */
  async getTopPerformingPosts(limit: number = 20): Promise<PostPerformance[]> {
    if (circuitBreakers.ga4.isOpen()) {
      logger.debug('GA4 circuit breaker open, skipping');
      return [];
    }
    try {
      const accessToken = await this.getAccessToken();
      const { data } = await axios.post(
        `https://analyticsdata.googleapis.com/v1beta/properties/${this.propertyId}:runReport`,
        {
          dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
          dimensions: [{ name: 'pagePath' }, { name: 'pageTitle' }],
          metrics: [
            { name: 'screenPageViews' },
            { name: 'userEngagementDuration' },
            { name: 'bounceRate' },
          ],
          orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
          limit,
        },
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          timeout: 15000,
        },
      );

      const rows = (data as { rows?: Array<{ dimensionValues: Array<{ value: string }>; metricValues: Array<{ value: string }> }> }).rows || [];

      circuitBreakers.ga4.recordSuccess();
      return rows
        .filter((row) => {
          const path = row.dimensionValues[0].value;
          // Exclude non-post pages
          return path !== '/' && !path.startsWith('/category/') && !path.startsWith('/tag/') && !path.startsWith('/page/');
        })
        .map((row) => ({
          url: row.dimensionValues[0].value,
          pageviews: parseInt(row.metricValues[0].value) || 0,
          avgEngagementTime: parseFloat(row.metricValues[1].value) || 0,
          bounceRate: parseFloat(row.metricValues[2].value) || 0,
        }));
    } catch (error) {
      circuitBreakers.ga4.recordFailure();
      logger.warn(`GA4 analytics fetch failed: ${error instanceof Error ? error.message : error}`);
      return [];
    }
  }

  /**
   * Extract performance insights for keyword research.
   * Returns a summary string to include in keyword research prompts.
   */
  async getPerformanceInsights(): Promise<string> {
    const posts = await this.getTopPerformingPosts(30);
    if (posts.length === 0) return '';

    const topPosts = posts.slice(0, 10);
    const lowPosts = posts.filter((p) => p.pageviews > 0).slice(-5);

    const topLines = topPosts
      .map((p) => `- "${p.url}" (${p.pageviews} views, ${p.avgEngagementTime.toFixed(0)}s avg time, ${(p.bounceRate * 100).toFixed(0)}% bounce)`)
      .join('\n');

    const lowLines = lowPosts
      .map((p) => `- "${p.url}" (${p.pageviews} views, ${(p.bounceRate * 100).toFixed(0)}% bounce)`)
      .join('\n');

    return `\n## Site Performance Data (Last 30 Days)
### Top Performing Posts (create more content like these):
${topLines}

### Underperforming Posts (avoid similar topics/angles):
${lowLines}

Use this data to inform your keyword selection — topics similar to top performers tend to do well.`;
  }

  /**
   * Detect peak traffic hours from GA4 session data (last 30 days).
   * Returns the optimal publish hour (0-23) based on when users are most active.
   */
  async getOptimalPublishHour(): Promise<number | null> {
    try {
      const accessToken = await this.getAccessToken();
      const { data } = await axios.post(
        `https://analyticsdata.googleapis.com/v1beta/properties/${this.propertyId}:runReport`,
        {
          dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
          dimensions: [{ name: 'hour' }],
          metrics: [{ name: 'sessions' }],
          orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
          limit: 24,
        },
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          timeout: 15000,
        },
      );

      const rows = (data as { rows?: Array<{ dimensionValues: Array<{ value: string }>; metricValues: Array<{ value: string }> }> }).rows || [];
      if (rows.length === 0) return null;

      // Find the hour with most sessions, then publish 1 hour before peak
      const peakHour = parseInt(rows[0].dimensionValues[0].value);
      const optimalHour = (peakHour - 1 + 24) % 24; // 1 hour before peak for freshness
      logger.info(`GA4 peak hour: ${peakHour}:00, optimal publish hour: ${optimalHour}:00`);
      return optimalHour;
    } catch (error) {
      logger.warn(`GA4 peak hour detection failed: ${error instanceof Error ? error.message : error}`);
      return null;
    }
  }

  /**
   * Detect the best day of week for publishing based on GA4 session data.
   * Returns 0 (Sunday) through 6 (Saturday), or null if data unavailable.
   */
  async getOptimalPublishDay(): Promise<number | null> {
    try {
      const accessToken = await this.getAccessToken();
      const { data } = await axios.post(
        `https://analyticsdata.googleapis.com/v1beta/properties/${this.propertyId}:runReport`,
        {
          dateRanges: [{ startDate: '90daysAgo', endDate: 'today' }],
          dimensions: [{ name: 'dayOfWeek' }],
          metrics: [{ name: 'sessions' }, { name: 'screenPageViews' }],
          orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
          limit: 7,
        },
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          timeout: 15000,
        },
      );

      const rows = (data as { rows?: Array<{ dimensionValues: Array<{ value: string }>; metricValues: Array<{ value: string }> }> }).rows || [];
      if (rows.length === 0) return null;

      // dayOfWeek: 0=Sunday, 1=Monday, ..., 6=Saturday
      const peakDay = parseInt(rows[0].dimensionValues[0].value);
      const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      logger.info(`GA4 peak day: ${dayNames[peakDay]} (${rows[0].metricValues[1].value} pageviews)`);
      return peakDay;
    } catch (error) {
      logger.warn(`GA4 peak day detection failed: ${error instanceof Error ? error.message : error}`);
      return null;
    }
  }

  /**
   * Compute content type performance by cross-referencing GA4 data with post history.
   * Returns a map of niche → contentType → average engagement score.
   */
  async getContentTypePerformance(historyEntries: PostHistoryEntry[]): Promise<Map<string, Map<string, number>>> {
    const performanceMap = new Map<string, Map<string, number>>();
    const countMap = new Map<string, Map<string, number>>();

    const posts = await this.getTopPerformingPosts(100);
    if (posts.length === 0) return performanceMap;

    for (const post of posts) {
      // Match GA4 path to history entry (decode both sides — GA4 returns decoded, history stores encoded)
      const entry = historyEntries.find(e => normPath(e.postUrl) === normPath(post.url));

      if (!entry?.niche || !entry?.contentType) continue;

      // Engagement score = pageviews * (1 - bounceRate) * avgEngagementTime weight
      const engagementScore = post.pageviews * (1 - Math.min(post.bounceRate, 1)) * Math.min(post.avgEngagementTime / 60, 5);

      if (!performanceMap.has(entry.niche)) {
        performanceMap.set(entry.niche, new Map());
        countMap.set(entry.niche, new Map());
      }
      const nicheMap = performanceMap.get(entry.niche)!;
      const nicheCount = countMap.get(entry.niche)!;

      nicheMap.set(entry.contentType, (nicheMap.get(entry.contentType) || 0) + engagementScore);
      nicheCount.set(entry.contentType, (nicheCount.get(entry.contentType) || 0) + 1);
    }

    // Average the scores
    for (const [niche, typeMap] of performanceMap) {
      const counts = countMap.get(niche)!;
      for (const [type, total] of typeMap) {
        typeMap.set(type, total / (counts.get(type) || 1));
      }
    }

    return performanceMap;
  }

  /**
   * Generate content type insights string for keyword research prompts.
   * Tells the keyword researcher which content types perform best per niche.
   */
  async getContentTypeInsights(historyEntries: PostHistoryEntry[]): Promise<string> {
    try {
      const perfMap = await this.getContentTypePerformance(historyEntries);
      if (perfMap.size === 0) return '';

      const lines: string[] = [];
      for (const [niche, typeMap] of perfMap) {
        const sorted = [...typeMap.entries()].sort((a, b) => b[1] - a[1]);
        if (sorted.length < 2) continue;
        const best = sorted[0];
        const worst = sorted[sorted.length - 1];
        lines.push(`- ${niche}: "${best[0]}" performs best (score: ${best[1].toFixed(1)}), "${worst[0]}" underperforms (score: ${worst[1].toFixed(1)})`);
      }

      if (lines.length === 0) return '';

      return `\n## Content Type Performance by Niche (engagement-weighted)
${lines.join('\n')}
Favor top-performing content types when choosing format for each niche.`;
    } catch (error) {
      logger.warn(`Content type insights failed: ${error instanceof Error ? error.message : error}`);
      return '';
    }
  }

  /**
   * Analyze CTR performance by title pattern.
   * Cross-references GA4 data with post history to identify which title formulas drive the most clicks.
   * Returns patterns ranked by average CTR.
   */
  async getTitlePatternPerformance(historyEntries: PostHistoryEntry[]): Promise<Array<{
    pattern: string;
    avgCtr: number;
    avgPageviews: number;
    count: number;
    examples: string[];
  }>> {
    const posts = await this.getTopPerformingPosts(100);
    if (posts.length === 0 || historyEntries.length === 0) return [];

    // Build URL-to-title map from history
    const urlToTitle = new Map<string, string>();
    for (const entry of historyEntries) {
      const path = normPath(entry.postUrl);
      urlToTitle.set(path, entry.keyword);
    }

    // Classify titles into patterns
    const patternMap = new Map<string, Array<{ pageviews: number; title: string }>>();

    for (const post of posts) {
      const path = post.url.replace(/\/$/, '');
      const keyword = urlToTitle.get(path);
      if (!keyword) continue;

      const pattern = this.classifyTitlePattern(keyword);
      if (!patternMap.has(pattern)) patternMap.set(pattern, []);
      patternMap.get(pattern)!.push({ pageviews: post.pageviews, title: keyword });
    }

    const results: Array<{ pattern: string; avgCtr: number; avgPageviews: number; count: number; examples: string[] }> = [];
    for (const [pattern, entries] of patternMap) {
      if (entries.length < 2) continue; // Need at least 2 data points
      const avgPageviews = entries.reduce((sum, e) => sum + e.pageviews, 0) / entries.length;
      // CTR estimated from pageviews rank (higher pageviews ≈ higher CTR)
      const avgCtr = avgPageviews / (posts[0]?.pageviews || 1);
      results.push({
        pattern,
        avgCtr,
        avgPageviews,
        count: entries.length,
        examples: entries.slice(0, 3).map(e => e.title),
      });
    }

    return results.sort((a, b) => b.avgPageviews - a.avgPageviews);
  }

  /**
   * Classify a title/keyword into a pattern category for A/B analysis.
   */
  private classifyTitlePattern(title: string): string {
    const lower = title.toLowerCase();
    if (/^how to\s/i.test(lower)) return 'How-To Question';
    if (/^what\s|^why\s|^when\s|^where\s/i.test(lower)) return 'W-Question';
    if (/\bvs\b|\bversus\b/i.test(lower)) return 'X vs Y Comparison';
    if (/^\d+\s+best\b|^best\s/i.test(lower)) return 'Best-Of List';
    if (/^\d+\s/i.test(lower)) return 'Numbered List';
    if (/\(\d{4}\)|\b\d{4}\b/.test(lower)) return 'Year-Tagged';
    if (/guide|tutorial|explained/i.test(lower)) return 'Guide/Tutorial';
    if (/analysis|review|breakdown/i.test(lower)) return 'Analysis/Review';
    return 'Standard';
  }

  /**
   * Get topic cluster performance: aggregate metrics grouped by category/niche.
   */
  async getClusterPerformance(historyEntries: PostHistoryEntry[]): Promise<Map<string, {
    totalPageviews: number;
    postCount: number;
    avgBounceRate: number;
    avgEngagement: number;
    topPost: string;
  }>> {
    const posts = await this.getTopPerformingPosts(100);
    const clusterMap = new Map<string, { totalPageviews: number; postCount: number; bounceSum: number; engagementSum: number; topPost: string; topViews: number }>();

    for (const post of posts) {
      const entry = historyEntries.find(e => normPath(e.postUrl) === normPath(post.url));

      const niche = entry?.niche || 'uncategorized';
      const existing = clusterMap.get(niche) || { totalPageviews: 0, postCount: 0, bounceSum: 0, engagementSum: 0, topPost: '', topViews: 0 };

      existing.totalPageviews += post.pageviews;
      existing.postCount++;
      existing.bounceSum += post.bounceRate;
      existing.engagementSum += post.avgEngagementTime;
      if (post.pageviews > existing.topViews) {
        existing.topViews = post.pageviews;
        existing.topPost = post.url;
      }
      clusterMap.set(niche, existing);
    }

    const result = new Map<string, { totalPageviews: number; postCount: number; avgBounceRate: number; avgEngagement: number; topPost: string }>();
    for (const [niche, data] of clusterMap) {
      result.set(niche, {
        totalPageviews: data.totalPageviews,
        postCount: data.postCount,
        avgBounceRate: data.postCount > 0 ? data.bounceSum / data.postCount : 0,
        avgEngagement: data.postCount > 0 ? data.engagementSum / data.postCount : 0,
        topPost: data.topPost,
      });
    }

    return result;
  }

  /**
   * [#16] Get actual RPM data from GA4 AdSense revenue events.
   * Returns per-category RPM based on real revenue and pageview data.
   */
  async getActualRpmData(): Promise<Map<string, { rpm: number; pageviews: number; revenue: number }>> {
    const result = new Map<string, { rpm: number; pageviews: number; revenue: number }>();
    try {
      const accessToken = await this.getAccessToken();
      const { data } = await axios.post(
        `https://analyticsdata.googleapis.com/v1beta/properties/${this.propertyId}:runReport`,
        {
          dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
          dimensions: [{ name: 'pagePathPlusQueryString' }],
          metrics: [
            { name: 'screenPageViews' },
            { name: 'publisherAdImpressionRevenue' },
          ],
          orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
          limit: 200,
        },
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          timeout: 15000,
        },
      );

      const rows = (data as { rows?: Array<{ dimensionValues: Array<{ value: string }>; metricValues: Array<{ value: string }> }> }).rows || [];

      // Category detection from URL path pattern (e.g., /category/korean-tech/*)
      const categoryMap = new Map<string, { pageviews: number; revenue: number }>();
      for (const row of rows) {
        const path = row.dimensionValues[0].value;
        const pv = parseInt(row.metricValues[0].value) || 0;
        const rev = parseFloat(row.metricValues[1].value) || 0;
        if (pv < 1) continue;

        // Determine category from path segments
        const segments = path.split('/').filter(Boolean);
        const category = segments.length > 0 ? segments[0] : 'uncategorized';

        const existing = categoryMap.get(category) || { pageviews: 0, revenue: 0 };
        existing.pageviews += pv;
        existing.revenue += rev;
        categoryMap.set(category, existing);
      }

      for (const [cat, { pageviews, revenue }] of categoryMap) {
        if (pageviews >= 100) { // Only include categories with meaningful traffic
          const rpm = (revenue / pageviews) * 1000;
          result.set(cat, { rpm, pageviews, revenue });
        }
      }

      if (result.size > 0) {
        logger.info(`RPM feedback: Got actual RPM for ${result.size} categories from GA4`);
      }
    } catch (error) {
      logger.debug(`GA4 RPM data fetch failed: ${error instanceof Error ? error.message : error}`);
    }
    return result;
  }

  /**
   * Estimate per-post revenue attribution by combining GA4 pageviews with niche RPM data.
   * Returns top revenue-generating posts for insight into which content drives revenue.
   */
  async getPostRevenueAttribution(
    historyEntries: PostHistoryEntry[],
    rpmByCategory: Record<string, number>,
  ): Promise<Array<{ url: string; title: string; niche: string; pageviews: number; estimatedRevenue: number }>> {
    try {
      const posts = await this.getTopPerformingPosts(100);
      if (posts.length === 0) return [];

      const attributed: Array<{ url: string; title: string; niche: string; pageviews: number; estimatedRevenue: number }> = [];

      for (const post of posts) {
        const entry = historyEntries.find(e => normPath(e.postUrl) === normPath(post.url));
        if (!entry?.niche) continue;

        // Find category for this niche
        // Map niche ID to category name
        const NICHE_ID_TO_CATEGORY: Record<string, string> = {
          'market-analysis': '시장분석', 'sector-analysis': '업종분석',
          'theme-analysis': '테마분석', 'stock-analysis': '종목분석',
          'korean-stock': '시장분석', 'ai-trading': '종목분석', // legacy
        };
        const category = NICHE_ID_TO_CATEGORY[entry.niche] || entry.niche;
        const rpm = rpmByCategory[category] || 3; // Default RPM $3 if unknown
        const estimatedRevenue = (post.pageviews / 1000) * rpm;

        attributed.push({
          url: post.url,
          title: entry.keyword || post.url,
          niche: entry.niche,
          pageviews: post.pageviews,
          estimatedRevenue,
        });
      }

      return attributed.sort((a, b) => b.estimatedRevenue - a.estimatedRevenue);
    } catch (error) {
      logger.debug(`Post revenue attribution failed: ${error instanceof Error ? error.message : error}`);
      return [];
    }
  }

  /**
   * Revenue attribution by traffic source (organic, twitter, pinterest, linkedin, etc.).
   * Combines GA4 session source with pageview data and niche RPM for per-channel revenue estimates.
   */
  async getRevenueByTrafficSource(
    rpmByCategory: Record<string, number>,
  ): Promise<Array<{ source: string; sessions: number; pageviews: number; estimatedRevenue: number }>> {
    try {
      const accessToken = await this.getAccessToken();
      const { data } = await axios.post(
        `https://analyticsdata.googleapis.com/v1beta/properties/${this.propertyId}:runReport`,
        {
          dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
          dimensions: [{ name: 'sessionSource' }],
          metrics: [
            { name: 'sessions' },
            { name: 'screenPageViews' },
          ],
          orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
          limit: 20,
        },
        { headers: { Authorization: `Bearer ${accessToken}` }, timeout: 15000 },
      );
      const rows = (data as { rows?: Array<{ dimensionValues: Array<{ value: string }>; metricValues: Array<{ value: string }> }> }).rows || [];
      const avgRpm = Object.values(rpmByCategory).reduce((a, b) => a + b, 0) / Math.max(Object.keys(rpmByCategory).length, 1) || 5;
      return rows.map(row => {
        const pageviews = parseInt(row.metricValues[1].value) || 0;
        return {
          source: row.dimensionValues[0].value,
          sessions: parseInt(row.metricValues[0].value) || 0,
          pageviews,
          estimatedRevenue: (pageviews / 1000) * avgRpm,
        };
      });
    } catch (error) {
      logger.debug(`Revenue by traffic source failed: ${error instanceof Error ? error.message : error}`);
      return [];
    }
  }

  /**
   * Cross-niche user journey analysis: detect users who visit multiple categories.
   * Identifies cross-category navigation patterns for internal linking optimization.
   */
  async getCrossNicheJourneys(): Promise<Array<{
    fromCategory: string;
    toCategory: string;
    transitions: number;
  }>> {
    try {
      const accessToken = await this.getAccessToken();
      const { data } = await axios.post(
        `https://analyticsdata.googleapis.com/v1beta/properties/${this.propertyId}:runReport`,
        {
          dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
          dimensions: [{ name: 'contentGroup' }, { name: 'pagePath' }],
          metrics: [{ name: 'screenPageViews' }],
          orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
          limit: 200,
        },
        { headers: { Authorization: `Bearer ${accessToken}` }, timeout: 15000 },
      );
      const rows = (data as { rows?: Array<{ dimensionValues: Array<{ value: string }>; metricValues: Array<{ value: string }> }> }).rows || [];

      // Group by content group (category) and count cross-category transitions
      const categoryPaths: Record<string, number> = {};
      for (const row of rows) {
        const category = row.dimensionValues[0].value;
        const views = parseInt(row.metricValues[0].value) || 0;
        if (category && category !== '(not set)') {
          categoryPaths[category] = (categoryPaths[category] || 0) + views;
        }
      }

      // Build transition pairs based on category co-occurrence
      const categories = Object.keys(categoryPaths).sort((a, b) => categoryPaths[b] - categoryPaths[a]);
      const journeys: Array<{ fromCategory: string; toCategory: string; transitions: number }> = [];
      for (let i = 0; i < categories.length; i++) {
        for (let j = i + 1; j < categories.length; j++) {
          const transitions = Math.min(categoryPaths[categories[i]], categoryPaths[categories[j]]);
          if (transitions > 5) {
            journeys.push({
              fromCategory: categories[i],
              toCategory: categories[j],
              transitions: Math.floor(transitions * 0.15), // Estimate ~15% cross-visit rate
            });
          }
        }
      }
      return journeys.sort((a, b) => b.transitions - a.transitions).slice(0, 10);
    } catch (error) {
      logger.debug(`Cross-niche journey analysis failed: ${error instanceof Error ? error.message : error}`);
      return [];
    }
  }

  /**
   * Get aggregate site metrics snapshot (pageviews, sessions, engagement) for a date range.
   * Used to compare pre-batch vs post-batch traffic.
   */
  async getSiteMetricsSnapshot(startDate: string = '7daysAgo', endDate: string = 'today'): Promise<{
    pageviews: number;
    sessions: number;
    engagementRate: number;
    avgEngagementDuration: number;
  } | null> {
    if (circuitBreakers.ga4.isOpen()) return null;
    try {
      const accessToken = await this.getAccessToken();
      const { data } = await axios.post(
        `https://analyticsdata.googleapis.com/v1beta/properties/${this.propertyId}:runReport`,
        {
          dateRanges: [{ startDate, endDate }],
          metrics: [
            { name: 'screenPageViews' },
            { name: 'sessions' },
            { name: 'engagementRate' },
            { name: 'userEngagementDuration' },
          ],
        },
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          timeout: 15000,
        },
      );
      const rows = (data as { rows?: Array<{ metricValues: Array<{ value: string }> }> }).rows;
      if (!rows || rows.length === 0) return null;
      const mv = rows[0].metricValues;
      circuitBreakers.ga4.recordSuccess();
      return {
        pageviews: parseInt(mv[0].value) || 0,
        sessions: parseInt(mv[1].value) || 0,
        engagementRate: parseFloat(mv[2].value) || 0,
        avgEngagementDuration: parseFloat(mv[3].value) || 0,
      };
    } catch (error) {
      circuitBreakers.ga4.recordFailure();
      logger.debug(`GA4 site metrics snapshot failed: ${error instanceof Error ? error.message : error}`);
      return null;
    }
  }

  /**
   * Get Core Web Vitals (LCP, CLS, INP) per page from GA4 web-vitals events.
   * Requires web-vitals.js library to be sending events to GA4.
   * Falls back gracefully if CWV events are not available.
   */
  async getCoreWebVitals(limit: number = 20): Promise<Array<{
    pagePath: string;
    lcp: number;
    cls: number;
    inp: number;
  }>> {
    if (circuitBreakers.ga4.isOpen()) return [];
    try {
      const accessToken = await this.getAccessToken();
      const { data } = await axios.post(
        `https://analyticsdata.googleapis.com/v1beta/properties/${this.propertyId}:runReport`,
        {
          dateRanges: [{ startDate: '28daysAgo', endDate: 'today' }],
          dimensions: [{ name: 'pagePath' }, { name: 'eventName' }],
          metrics: [{ name: 'eventValue' }, { name: 'eventCount' }],
          dimensionFilter: {
            filter: {
              fieldName: 'eventName',
              inListFilter: { values: ['LCP', 'CLS', 'INP'] },
            },
          },
          orderBys: [{ metric: { metricName: 'eventCount' }, desc: true }],
          limit: limit * 3,
        },
        { headers: { Authorization: `Bearer ${accessToken}` }, timeout: 15000 },
      );
      const rows = (data as { rows?: Array<{ dimensionValues: Array<{ value: string }>; metricValues: Array<{ value: string }> }> }).rows || [];
      // Aggregate by page
      const pageMetrics = new Map<string, { lcp: number[]; cls: number[]; inp: number[] }>();
      for (const row of rows) {
        const page = row.dimensionValues[0].value;
        const event = row.dimensionValues[1].value;
        const value = parseFloat(row.metricValues[0].value) || 0;
        if (!pageMetrics.has(page)) pageMetrics.set(page, { lcp: [], cls: [], inp: [] });
        const m = pageMetrics.get(page)!;
        if (event === 'LCP') m.lcp.push(value);
        else if (event === 'CLS') m.cls.push(value);
        else if (event === 'INP') m.inp.push(value);
      }
      circuitBreakers.ga4.recordSuccess();
      const results: Array<{ pagePath: string; lcp: number; cls: number; inp: number }> = [];
      for (const [pagePath, m] of pageMetrics) {
        const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
        results.push({ pagePath, lcp: avg(m.lcp), cls: avg(m.cls), inp: avg(m.inp) });
      }
      return results.sort((a, b) => b.lcp - a.lcp).slice(0, limit);
    } catch (error) {
      circuitBreakers.ga4.recordFailure();
      logger.debug(`GA4 CWV metrics failed: ${error instanceof Error ? error.message : error}`);
      return [];
    }
  }

  private async getAccessToken(): Promise<string> {
    return getGoogleAccessToken(this.saKey, 'https://www.googleapis.com/auth/analytics.readonly');
  }
}
