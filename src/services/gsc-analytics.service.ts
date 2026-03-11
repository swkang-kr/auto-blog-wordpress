import axios from 'axios';
import { logger } from '../utils/logger.js';
import { getGoogleAccessToken } from '../utils/google-auth.js';

export interface GSCQueryData {
  query: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface GSCPageData {
  page: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

/**
 * Google Search Console API service for search performance feedback.
 * Fetches real search queries, impressions, clicks, and average positions
 * to inform keyword research and content optimization.
 */
export class GSCAnalyticsService {
  private siteUrl: string;
  private saKey: string;

  constructor(siteUrl: string, googleSaKey: string) {
    // GSC expects the property URL format (with trailing slash for domain properties)
    this.siteUrl = siteUrl.replace(/\/+$/, '');
    this.saKey = googleSaKey;
  }

  /**
   * Fetch top search queries from GSC (last 28 days).
   * Returns queries sorted by impressions descending.
   */
  async getTopQueries(limit: number = 50): Promise<GSCQueryData[]> {
    try {
      const accessToken = await this.getAccessToken();
      const { data } = await axios.post(
        `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(this.siteUrl)}/searchAnalytics/query`,
        {
          startDate: this.getDateString(-28),
          endDate: this.getDateString(-1),
          dimensions: ['query'],
          rowLimit: limit,
          dataState: 'final',
        },
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          timeout: 15000,
        },
      );

      const rows = (data as { rows?: Array<{ keys: string[]; clicks: number; impressions: number; ctr: number; position: number }> }).rows || [];
      return rows.map(row => ({
        query: row.keys[0],
        clicks: row.clicks,
        impressions: row.impressions,
        ctr: row.ctr,
        position: row.position,
      }));
    } catch (error) {
      logger.warn(`GSC top queries fetch failed: ${error instanceof Error ? error.message : error}`);
      return [];
    }
  }

  /**
   * Fetch page performance from GSC (last 28 days).
   * Returns pages sorted by impressions descending.
   */
  async getPagePerformance(limit: number = 50): Promise<GSCPageData[]> {
    try {
      const accessToken = await this.getAccessToken();
      const { data } = await axios.post(
        `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(this.siteUrl)}/searchAnalytics/query`,
        {
          startDate: this.getDateString(-28),
          endDate: this.getDateString(-1),
          dimensions: ['page'],
          rowLimit: limit,
          dataState: 'final',
        },
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          timeout: 15000,
        },
      );

      const rows = (data as { rows?: Array<{ keys: string[]; clicks: number; impressions: number; ctr: number; position: number }> }).rows || [];
      return rows.map(row => ({
        page: row.keys[0],
        clicks: row.clicks,
        impressions: row.impressions,
        ctr: row.ctr,
        position: row.position,
      }));
    } catch (error) {
      logger.warn(`GSC page performance fetch failed: ${error instanceof Error ? error.message : error}`);
      return [];
    }
  }

  /**
   * Find "striking distance" keywords: high impressions but low CTR or position 5-20.
   * These are the best candidates for content optimization or new supporting content.
   */
  async getStrikingDistanceKeywords(): Promise<GSCQueryData[]> {
    const queries = await this.getTopQueries(200);
    return queries.filter(q =>
      q.impressions >= 10 &&
      q.position >= 5 && q.position <= 20 &&
      q.ctr < 0.05, // Less than 5% CTR
    ).sort((a, b) => b.impressions - a.impressions);
  }

  /**
   * Find declining pages: compare last 14 days vs previous 42 days.
   * Uses wider windows to reduce noise from weekly fluctuations.
   */
  async getDecliningPages(): Promise<Array<GSCPageData & { trend: 'declining' | 'stable' }>> {
    try {
      const accessToken = await this.getAccessToken();

      // Recent period (last 14 days)
      const { data: recentData } = await axios.post(
        `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(this.siteUrl)}/searchAnalytics/query`,
        {
          startDate: this.getDateString(-14),
          endDate: this.getDateString(-1),
          dimensions: ['page'],
          rowLimit: 100,
        },
        { headers: { Authorization: `Bearer ${accessToken}` }, timeout: 15000 },
      );

      // Previous period (15-56 days ago, 42-day window)
      const { data: previousData } = await axios.post(
        `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(this.siteUrl)}/searchAnalytics/query`,
        {
          startDate: this.getDateString(-56),
          endDate: this.getDateString(-15),
          dimensions: ['page'],
          rowLimit: 100,
        },
        { headers: { Authorization: `Bearer ${accessToken}` }, timeout: 15000 },
      );

      const recentRows = (recentData as { rows?: Array<{ keys: string[]; clicks: number; impressions: number; ctr: number; position: number }> }).rows || [];
      const previousRows = (previousData as { rows?: Array<{ keys: string[]; clicks: number; impressions: number; ctr: number; position: number }> }).rows || [];

      const previousMap = new Map(previousRows.map(r => [r.keys[0], r]));
      const declining: Array<GSCPageData & { trend: 'declining' | 'stable' }> = [];

      for (const recent of recentRows) {
        const prev = previousMap.get(recent.keys[0]);
        if (prev) {
          // Normalize: previous period is 42 days, recent is 14 days
          const prevDailyClicks = prev.clicks / 42;
          const recentDailyClicks = recent.clicks / 14;
          if (prevDailyClicks > 0 && recentDailyClicks / prevDailyClicks < 0.5) {
            declining.push({
              page: recent.keys[0],
              clicks: recent.clicks,
              impressions: recent.impressions,
              ctr: recent.ctr,
              position: recent.position,
              trend: 'declining',
            });
          }
        }
      }

      return declining.sort((a, b) => b.impressions - a.impressions);
    } catch (error) {
      logger.warn(`GSC declining pages fetch failed: ${error instanceof Error ? error.message : error}`);
      return [];
    }
  }

  /**
   * Detect competitive threats: queries where our position is declining while
   * impressions remain stable/growing (competitors are outranking us).
   * Returns pages that need urgent content refresh to defend rankings.
   */
  async getCompetitiveThreats(): Promise<Array<{
    query: string;
    page: string;
    currentPosition: number;
    previousPosition: number;
    positionDelta: number;
    impressions: number;
    ctr: number;
    urgency: 'critical' | 'high' | 'medium';
  }>> {
    try {
      const accessToken = await this.getAccessToken();

      // Recent period (last 14 days) — query+page dimension for specific page tracking
      const { data: recentData } = await axios.post(
        `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(this.siteUrl)}/searchAnalytics/query`,
        {
          startDate: this.getDateString(-14),
          endDate: this.getDateString(-1),
          dimensions: ['query', 'page'],
          rowLimit: 200,
        },
        { headers: { Authorization: `Bearer ${accessToken}` }, timeout: 15000 },
      );

      // Previous period (15-56 days ago, 42-day window)
      const { data: previousData } = await axios.post(
        `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(this.siteUrl)}/searchAnalytics/query`,
        {
          startDate: this.getDateString(-56),
          endDate: this.getDateString(-15),
          dimensions: ['query', 'page'],
          rowLimit: 200,
        },
        { headers: { Authorization: `Bearer ${accessToken}` }, timeout: 15000 },
      );

      type GSCRow = { keys: string[]; clicks: number; impressions: number; ctr: number; position: number };
      const recentRows = (recentData as { rows?: GSCRow[] }).rows || [];
      const previousRows = (previousData as { rows?: GSCRow[] }).rows || [];

      // Build lookup by query+page
      const previousMap = new Map(previousRows.map(r => [`${r.keys[0]}|${r.keys[1]}`, r]));
      const threats: Array<{
        query: string; page: string; currentPosition: number; previousPosition: number;
        positionDelta: number; impressions: number; ctr: number; urgency: 'critical' | 'high' | 'medium';
      }> = [];

      for (const recent of recentRows) {
        const key = `${recent.keys[0]}|${recent.keys[1]}`;
        const prev = previousMap.get(key);
        if (!prev) continue;

        const positionDelta = recent.position - prev.position; // positive = worse
        const impressionsStable = recent.impressions >= prev.impressions * 0.25; // adjusted for 14d vs 42d

        // Threat: position dropped 3+ places while impressions remain stable
        if (positionDelta >= 3 && impressionsStable && recent.impressions >= 5) {
          const urgency: 'critical' | 'high' | 'medium' =
            positionDelta >= 10 ? 'critical' :
            positionDelta >= 5 ? 'high' : 'medium';

          threats.push({
            query: recent.keys[0],
            page: recent.keys[1],
            currentPosition: recent.position,
            previousPosition: prev.position,
            positionDelta,
            impressions: recent.impressions,
            ctr: recent.ctr,
            urgency,
          });
        }
      }

      return threats.sort((a, b) => {
        const urgencyOrder = { critical: 0, high: 1, medium: 2 };
        return urgencyOrder[a.urgency] - urgencyOrder[b.urgency] || b.positionDelta - a.positionDelta;
      });
    } catch (error) {
      logger.warn(`GSC competitive threats fetch failed: ${error instanceof Error ? error.message : error}`);
      return [];
    }
  }

  /**
   * Compare page performance over two 90-day windows (current vs previous).
   * Useful for identifying long-term content trends and seasonal patterns.
   */
  async get90DayComparison(): Promise<Array<{
    page: string;
    currentClicks: number;
    previousClicks: number;
    changePercent: number;
    trend: 'growing' | 'declining' | 'stable';
  }>> {
    try {
      const accessToken = await this.getAccessToken();

      const [{ data: currentData }, { data: previousData }] = await Promise.all([
        axios.post(
          `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(this.siteUrl)}/searchAnalytics/query`,
          { startDate: this.getDateString(-90), endDate: this.getDateString(-1), dimensions: ['page'], rowLimit: 100 },
          { headers: { Authorization: `Bearer ${accessToken}` }, timeout: 15000 },
        ),
        axios.post(
          `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(this.siteUrl)}/searchAnalytics/query`,
          { startDate: this.getDateString(-180), endDate: this.getDateString(-91), dimensions: ['page'], rowLimit: 100 },
          { headers: { Authorization: `Bearer ${accessToken}` }, timeout: 15000 },
        ),
      ]);

      type GSCRow = { keys: string[]; clicks: number; impressions: number; ctr: number; position: number };
      const currentRows = (currentData as { rows?: GSCRow[] }).rows || [];
      const previousRows = (previousData as { rows?: GSCRow[] }).rows || [];
      const previousMap = new Map(previousRows.map(r => [r.keys[0], r.clicks]));

      return currentRows
        .filter(r => previousMap.has(r.keys[0]))
        .map(r => {
          const prevClicks = previousMap.get(r.keys[0])!;
          const changePercent = prevClicks > 0 ? ((r.clicks - prevClicks) / prevClicks) * 100 : 0;
          const trend: 'growing' | 'declining' | 'stable' =
            changePercent > 20 ? 'growing' : changePercent < -20 ? 'declining' : 'stable';
          return { page: r.keys[0], currentClicks: r.clicks, previousClicks: prevClicks, changePercent, trend };
        })
        .sort((a, b) => a.changePercent - b.changePercent);
    } catch (error) {
      logger.warn(`GSC 90-day comparison failed: ${error instanceof Error ? error.message : error}`);
      return [];
    }
  }

  /**
   * Generate performance insights string for keyword research prompts.
   * Combines top queries, striking distance keywords, and declining pages.
   */
  async getSearchInsights(): Promise<string> {
    const [topQueries, strikingDistance, declining] = await Promise.all([
      this.getTopQueries(20),
      this.getStrikingDistanceKeywords(),
      this.getDecliningPages(),
    ]);

    if (topQueries.length === 0) return '';

    const parts: string[] = ['\n## Google Search Console Data (Last 28 Days)'];

    // Top performing queries
    const topLines = topQueries.slice(0, 10)
      .map(q => `  - "${q.query}" (${q.clicks} clicks, ${q.impressions} impressions, pos ${q.position.toFixed(1)}, CTR ${(q.ctr * 100).toFixed(1)}%)`)
      .join('\n');
    parts.push(`### Top Search Queries (your site is already ranking for these):\n${topLines}`);

    // Striking distance (golden opportunities)
    if (strikingDistance.length > 0) {
      const sdLines = strikingDistance.slice(0, 8)
        .map(q => `  - "${q.query}" (pos ${q.position.toFixed(1)}, ${q.impressions} imp, CTR ${(q.ctr * 100).toFixed(1)}%)`)
        .join('\n');
      parts.push(`### Striking Distance Keywords (position 5-20, LOW CTR — create supporting content):\n${sdLines}`);
    }

    // Declining pages
    if (declining.length > 0) {
      const decLines = declining.slice(0, 5)
        .map(p => `  - ${p.page} (pos ${p.position.toFixed(1)}, traffic declining)`)
        .join('\n');
      parts.push(`### Declining Pages (may need content refresh):\n${decLines}`);
    }

    // CTR analysis by position bucket
    const ctrByPosition = [
      { label: 'Position 1-3', min: 1, max: 3, queries: topQueries.filter(q => q.position >= 1 && q.position <= 3) },
      { label: 'Position 4-10', min: 4, max: 10, queries: topQueries.filter(q => q.position >= 4 && q.position <= 10) },
      { label: 'Position 11-20', min: 11, max: 20, queries: topQueries.filter(q => q.position >= 11 && q.position <= 20) },
    ].filter(b => b.queries.length > 0);

    if (ctrByPosition.length > 0) {
      const ctrLines = ctrByPosition.map(b => {
        const avgCtr = b.queries.reduce((sum, q) => sum + q.ctr, 0) / b.queries.length;
        const expectedCtr = b.min <= 3 ? 0.15 : b.min <= 10 ? 0.05 : 0.02;
        const verdict = avgCtr < expectedCtr * 0.6 ? '⚠ LOW — title/meta needs optimization' : avgCtr > expectedCtr * 1.2 ? '✓ Above average' : '→ Normal range';
        return `  - ${b.label}: ${(avgCtr * 100).toFixed(1)}% avg CTR (${b.queries.length} queries) ${verdict}`;
      }).join('\n');
      parts.push(`### CTR Analysis by Position (title/meta effectiveness):\n${ctrLines}`);
    }

    parts.push('\nUse striking distance keywords as supporting content opportunities. Avoid creating content that competes with your top queries.');

    return parts.join('\n\n');
  }

  /**
   * Track keyword rankings for specific posts over time.
   * Returns position data for each post's target keyword for trend analysis.
   */
  async getKeywordRankings(postKeywords: Array<{ url: string; keyword: string }>): Promise<Array<{
    url: string;
    keyword: string;
    position: number;
    clicks: number;
    impressions: number;
    ctr: number;
  }>> {
    if (postKeywords.length === 0) return [];

    try {
      const accessToken = await this.getAccessToken();
      const { data } = await axios.post(
        `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(this.siteUrl)}/searchAnalytics/query`,
        {
          startDate: this.getDateString(-7),
          endDate: this.getDateString(-1),
          dimensions: ['query', 'page'],
          rowLimit: 500,
        },
        { headers: { Authorization: `Bearer ${accessToken}` }, timeout: 15000 },
      );

      type GSCRow = { keys: string[]; clicks: number; impressions: number; ctr: number; position: number };
      const rows = (data as { rows?: GSCRow[] }).rows || [];

      // Match rows to our target keywords
      const results: Array<{ url: string; keyword: string; position: number; clicks: number; impressions: number; ctr: number }> = [];

      for (const { url, keyword } of postKeywords) {
        const kwLower = keyword.toLowerCase();
        const kwWords = kwLower.split(/\s+/).filter(w => w.length > 3);

        // Find best matching row for this post+keyword combination
        const matchingRows = rows.filter(r => {
          const rowPage = r.keys[1];
          const rowQuery = r.keys[0].toLowerCase();
          const pageMatch = url.includes(rowPage.replace(/^https?:\/\/[^/]+/, '').replace(/\/$/, '')) ||
                           rowPage.includes(url.replace(/\/$/, ''));
          if (!pageMatch) return false;

          // Keyword match: exact or most words overlap
          const matchedWords = kwWords.filter(w => rowQuery.includes(w));
          return matchedWords.length >= Math.min(2, kwWords.length);
        });

        if (matchingRows.length > 0) {
          // Use the row with most impressions as the primary ranking
          const best = matchingRows.sort((a, b) => b.impressions - a.impressions)[0];
          results.push({
            url,
            keyword,
            position: best.position,
            clicks: best.clicks,
            impressions: best.impressions,
            ctr: best.ctr,
          });
        }
      }

      logger.info(`Keyword rankings: tracked ${results.length}/${postKeywords.length} keywords`);
      return results;
    } catch (error) {
      logger.warn(`Keyword ranking tracking failed: ${error instanceof Error ? error.message : error}`);
      return [];
    }
  }

  /**
   * Detect keyword cannibalization: queries where 2+ pages from our site
   * compete for the same search query. Returns pairs that should be
   * merged, consolidated, or differentiated.
   */
  async detectCannibalization(): Promise<Array<{
    query: string;
    pages: Array<{ page: string; position: number; clicks: number; impressions: number; ctr: number }>;
    recommendation: 'merge' | 'redirect' | 'differentiate';
    severity: 'high' | 'medium' | 'low';
  }>> {
    try {
      const accessToken = await this.getAccessToken();
      const { data } = await axios.post(
        `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(this.siteUrl)}/searchAnalytics/query`,
        {
          startDate: this.getDateString(-28),
          endDate: this.getDateString(-1),
          dimensions: ['query', 'page'],
          rowLimit: 1000,
        },
        { headers: { Authorization: `Bearer ${accessToken}` }, timeout: 20000 },
      );

      type GSCRow = { keys: string[]; clicks: number; impressions: number; ctr: number; position: number };
      const rows = (data as { rows?: GSCRow[] }).rows || [];

      // Group by query
      const queryPages = new Map<string, Array<{ page: string; position: number; clicks: number; impressions: number; ctr: number }>>();
      for (const row of rows) {
        const query = row.keys[0];
        const page = row.keys[1];
        if (!queryPages.has(query)) queryPages.set(query, []);
        queryPages.get(query)!.push({
          page, position: row.position, clicks: row.clicks, impressions: row.impressions, ctr: row.ctr,
        });
      }

      // Find queries with 2+ pages (cannibalization)
      const cannibalized: Array<{
        query: string;
        pages: Array<{ page: string; position: number; clicks: number; impressions: number; ctr: number }>;
        recommendation: 'merge' | 'redirect' | 'differentiate';
        severity: 'high' | 'medium' | 'low';
      }> = [];

      for (const [query, pages] of queryPages) {
        if (pages.length < 2) continue;
        // Only flag if both pages have meaningful impressions
        const significantPages = pages.filter(p => p.impressions >= 5);
        if (significantPages.length < 2) continue;

        significantPages.sort((a, b) => a.position - b.position);
        const posGap = significantPages[1].position - significantPages[0].position;
        const totalImpressions = significantPages.reduce((sum, p) => sum + p.impressions, 0);

        // Determine severity and recommendation
        let severity: 'high' | 'medium' | 'low';
        let recommendation: 'merge' | 'redirect' | 'differentiate';

        if (posGap < 5 && totalImpressions > 50) {
          severity = 'high';
          recommendation = 'merge'; // Pages are close in ranking, splitting authority
        } else if (posGap < 10) {
          severity = 'medium';
          recommendation = 'redirect'; // One page should absorb the other
        } else {
          severity = 'low';
          recommendation = 'differentiate'; // Differentiate content angles
        }

        cannibalized.push({ query, pages: significantPages, recommendation, severity });
      }

      return cannibalized.sort((a, b) => {
        const sevOrder = { high: 0, medium: 1, low: 2 };
        return sevOrder[a.severity] - sevOrder[b.severity];
      });
    } catch (error) {
      logger.warn(`Cannibalization detection failed: ${error instanceof Error ? error.message : error}`);
      return [];
    }
  }

  /**
   * Detect early content decay: 3+ consecutive days of ranking decline.
   * Returns pages with sustained position drops that need immediate attention
   * before they fall off page 1. Triggers auto-refresh + Telegram alert.
   */
  async detectEarlyDecay(): Promise<Array<{
    page: string;
    query: string;
    currentPosition: number;
    positionTrend: number[];
    avgDailyDecline: number;
    urgency: 'critical' | 'warning';
  }>> {
    try {
      const accessToken = await this.getAccessToken();

      // Fetch daily position data for last 7 days (query+page+date dimensions)
      const { data } = await axios.post(
        `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(this.siteUrl)}/searchAnalytics/query`,
        {
          startDate: this.getDateString(-7),
          endDate: this.getDateString(-1),
          dimensions: ['query', 'page', 'date'],
          rowLimit: 500,
          dataState: 'final',
        },
        { headers: { Authorization: `Bearer ${accessToken}` }, timeout: 20000 },
      );

      type GSCRow = { keys: string[]; clicks: number; impressions: number; ctr: number; position: number };
      const rows = (data as { rows?: GSCRow[] }).rows || [];

      // Group by query+page, track daily positions
      const dailyPositions = new Map<string, Array<{ date: string; position: number }>>();
      for (const row of rows) {
        const key = `${row.keys[0]}|${row.keys[1]}`;
        if (!dailyPositions.has(key)) dailyPositions.set(key, []);
        dailyPositions.get(key)!.push({ date: row.keys[2], position: row.position });
      }

      const decaying: Array<{
        page: string; query: string; currentPosition: number;
        positionTrend: number[]; avgDailyDecline: number; urgency: 'critical' | 'warning';
      }> = [];

      for (const [key, positions] of dailyPositions) {
        if (positions.length < 3) continue;

        // Sort by date ascending
        positions.sort((a, b) => a.date.localeCompare(b.date));
        const posValues = positions.map(p => p.position);

        // Check for 3+ consecutive days of decline
        let consecutiveDeclines = 0;
        for (let i = 1; i < posValues.length; i++) {
          if (posValues[i] > posValues[i - 1]) {
            consecutiveDeclines++;
          } else {
            consecutiveDeclines = 0;
          }
        }

        if (consecutiveDeclines >= 3) {
          const [query, page] = key.split('|');
          const currentPos = posValues[posValues.length - 1];
          const startPos = posValues[0];
          const avgDecline = (currentPos - startPos) / posValues.length;

          decaying.push({
            page,
            query,
            currentPosition: currentPos,
            positionTrend: posValues,
            avgDailyDecline: avgDecline,
            urgency: avgDecline > 2 || currentPos > 15 ? 'critical' : 'warning',
          });
        }
      }

      if (decaying.length > 0) {
        logger.warn(`Early decay detected: ${decaying.length} query(ies) with 3+ day consecutive decline`);
        for (const d of decaying.slice(0, 5)) {
          logger.warn(`  [${d.urgency.toUpperCase()}] "${d.query}" on ${d.page}: pos ${d.positionTrend[0].toFixed(1)} → ${d.currentPosition.toFixed(1)} (avg -${d.avgDailyDecline.toFixed(1)}/day)`);
        }
      }

      return decaying.sort((a, b) => b.avgDailyDecline - a.avgDailyDecline);
    } catch (error) {
      logger.warn(`Early decay detection failed: ${error instanceof Error ? error.message : error}`);
      return [];
    }
  }

  /**
   * Get top ranking keywords for each page (for internal link anchor text optimization).
   * Returns a map of page URL → best ranking keyword from GSC.
   */
  async getRankingKeywordsForPages(limit: number = 100): Promise<Map<string, { keyword: string; position: number; impressions: number }>> {
    const result = new Map<string, { keyword: string; position: number; impressions: number }>();

    try {
      const accessToken = await this.getAccessToken();
      const { data } = await axios.post(
        `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(this.siteUrl)}/searchAnalytics/query`,
        {
          startDate: this.getDateString(-28),
          endDate: this.getDateString(-1),
          dimensions: ['query', 'page'],
          rowLimit: 1000,
          dataState: 'final',
        },
        { headers: { Authorization: `Bearer ${accessToken}` }, timeout: 20000 },
      );

      type GSCRow = { keys: string[]; clicks: number; impressions: number; ctr: number; position: number };
      const rows = (data as { rows?: GSCRow[] }).rows || [];

      // For each page, pick the query with most impressions (best ranking keyword)
      const pageKeywords = new Map<string, Array<{ query: string; position: number; impressions: number }>>();
      for (const row of rows) {
        const page = row.keys[1];
        if (!pageKeywords.has(page)) pageKeywords.set(page, []);
        pageKeywords.get(page)!.push({
          query: row.keys[0],
          position: row.position,
          impressions: row.impressions,
        });
      }

      for (const [page, queries] of pageKeywords) {
        // Best keyword = highest impressions with reasonable position
        const best = queries.sort((a, b) => b.impressions - a.impressions)[0];
        if (best) {
          result.set(page, { keyword: best.query, position: best.position, impressions: best.impressions });
        }
      }

      logger.info(`GSC ranking keywords: ${result.size} page(s) with top ranking keywords`);
    } catch (error) {
      logger.warn(`GSC ranking keywords fetch failed: ${error instanceof Error ? error.message : error}`);
    }

    return result;
  }

  private async getAccessToken(): Promise<string> {
    return getGoogleAccessToken(this.saKey, 'https://www.googleapis.com/auth/webmasters.readonly');
  }

  /**
   * Detect competitor content gaps: queries where we have impressions but no clicks,
   * indicating content that doesn't satisfy user intent well enough.
   * These represent opportunities to create better-targeted content.
   */
  async detectContentGapOpportunities(minImpressions: number = 50): Promise<Array<{
    query: string;
    impressions: number;
    position: number;
    opportunity: string;
  }>> {
    try {
      const token = await this.getAccessToken();
      const { data } = await axios.post(
        `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(this.siteUrl)}/searchAnalytics/query`,
        {
          startDate: this.getDateString(-28),
          endDate: this.getDateString(-1),
          dimensions: ['query'],
          rowLimit: 500,
        },
        { headers: { Authorization: `Bearer ${token}` }, timeout: 15000 },
      );

      const rows = (data as { rows?: Array<{ keys: string[]; clicks: number; impressions: number; position: number }> }).rows || [];
      const gaps: Array<{ query: string; impressions: number; position: number; opportunity: string }> = [];

      for (const row of rows) {
        const query = row.keys[0];
        if (row.impressions < minImpressions || row.clicks > 2) continue;

        let opportunity: string;
        if (row.position <= 10) {
          opportunity = 'optimize-snippet'; // On page 1 but no clicks = bad snippet/title
        } else if (row.position <= 20) {
          opportunity = 'create-dedicated'; // Striking distance, needs dedicated content
        } else {
          opportunity = 'new-content'; // Too far, needs fresh approach
        }

        gaps.push({ query, impressions: row.impressions, position: row.position, opportunity });
      }

      const sorted = gaps.sort((a, b) => b.impressions - a.impressions).slice(0, 20);
      if (sorted.length > 0) {
        logger.info(`Content gap opportunities: ${sorted.length} queries with high impressions but no clicks`);
      }
      return sorted;
    } catch (error) {
      logger.warn(`Content gap detection failed: ${error instanceof Error ? error.message : error}`);
      return [];
    }
  }

  /**
   * Detect featured snippet opportunities: high-impression queries at positions 2-10
   * where we could target position zero with optimized content structure.
   */
  async getFeaturedSnippetOpportunities(): Promise<Array<{
    query: string;
    position: number;
    impressions: number;
    ctr: number;
    snippetType: 'paragraph' | 'list' | 'table';
  }>> {
    try {
      const queries = await this.getTopQueries(300);
      const opportunities = queries
        .filter(q => q.position >= 2 && q.position <= 10 && q.impressions >= 20)
        .map(q => {
          // Infer snippet type from query pattern
          const qLower = q.query.toLowerCase();
          let snippetType: 'paragraph' | 'list' | 'table' = 'paragraph';
          if (/^(?:what is|what are|who is|why|how does|what does)/i.test(qLower)) {
            snippetType = 'paragraph'; // Definition-style snippet
          } else if (/^(?:best|top|how to|steps|ways to|tips)/i.test(qLower)) {
            snippetType = 'list'; // List snippet
          } else if (/(?:vs|versus|comparison|compared|difference)/i.test(qLower)) {
            snippetType = 'table'; // Table snippet
          }
          return { query: q.query, position: q.position, impressions: q.impressions, ctr: q.ctr, snippetType };
        })
        .sort((a, b) => b.impressions - a.impressions)
        .slice(0, 15);

      if (opportunities.length > 0) {
        logger.info(`Featured snippet opportunities: ${opportunities.length} queries at positions 2-10 with high impressions`);
      }
      return opportunities;
    } catch (error) {
      logger.warn(`Featured snippet detection failed: ${error instanceof Error ? error.message : error}`);
      return [];
    }
  }

  /**
   * Detect ranking milestones by comparing current positions with history.
   * Returns events like "hit #1", "entered top 3", "dropped from top 10".
   */
  static detectRankingMilestones(
    entries: Array<{
      keyword: string;
      postUrl: string;
      lastPosition?: number;
      rankingHistory?: Array<{ date: string; position: number }>;
    }>,
    currentRankings: Array<{ url: string; keyword: string; position: number }>,
  ): Array<{
    keyword: string;
    postUrl: string;
    event: 'hit-top1' | 'hit-top3' | 'hit-top10' | 'dropped-from-top10';
    previousPosition: number;
    currentPosition: number;
  }> {
    const milestones: Array<{
      keyword: string; postUrl: string;
      event: 'hit-top1' | 'hit-top3' | 'hit-top10' | 'dropped-from-top10';
      previousPosition: number; currentPosition: number;
    }> = [];

    for (const ranking of currentRankings) {
      const entry = entries.find(e => e.postUrl === ranking.url);
      if (!entry || !entry.lastPosition) continue;

      const prev = entry.lastPosition;
      const curr = ranking.position;

      // Hit #1
      if (curr <= 1.5 && prev > 1.5) {
        milestones.push({ keyword: ranking.keyword, postUrl: ranking.url, event: 'hit-top1', previousPosition: prev, currentPosition: curr });
      }
      // Hit top 3
      else if (curr <= 3 && prev > 3) {
        milestones.push({ keyword: ranking.keyword, postUrl: ranking.url, event: 'hit-top3', previousPosition: prev, currentPosition: curr });
      }
      // Hit top 10
      else if (curr <= 10 && prev > 10) {
        milestones.push({ keyword: ranking.keyword, postUrl: ranking.url, event: 'hit-top10', previousPosition: prev, currentPosition: curr });
      }
      // Dropped from top 10
      else if (curr > 10 && prev <= 10) {
        milestones.push({ keyword: ranking.keyword, postUrl: ranking.url, event: 'dropped-from-top10', previousPosition: prev, currentPosition: curr });
      }
    }

    return milestones;
  }

  private getDateString(daysOffset: number): string {
    const date = new Date();
    date.setDate(date.getDate() + daysOffset);
    return date.toISOString().split('T')[0];
  }
}
