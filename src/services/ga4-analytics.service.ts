import axios from 'axios';
import { logger } from '../utils/logger.js';
import { getGoogleAccessToken } from '../utils/google-auth.js';
import type { PostPerformance, PostHistoryEntry } from '../types/index.js';

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
    try {
      const accessToken = await this.getAccessToken();
      const { data } = await axios.post(
        `https://analyticsdata.googleapis.com/v1beta/properties/${this.propertyId}:runReport`,
        {
          dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
          dimensions: [{ name: 'pagePath' }, { name: 'pageTitle' }],
          metrics: [
            { name: 'screenPageViews' },
            { name: 'averageSessionDuration' },
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
      // Match GA4 path to history entry
      const entry = historyEntries.find(e => {
        const entryPath = new URL(e.postUrl).pathname.replace(/\/$/, '');
        return post.url.replace(/\/$/, '') === entryPath;
      });

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
      const path = new URL(entry.postUrl).pathname.replace(/\/$/, '');
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
      const entry = historyEntries.find(e => {
        const entryPath = new URL(e.postUrl).pathname.replace(/\/$/, '');
        return post.url.replace(/\/$/, '') === entryPath;
      });

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

  private async getAccessToken(): Promise<string> {
    return getGoogleAccessToken(this.saKey, 'https://www.googleapis.com/auth/analytics.readonly');
  }
}
