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
   * Find declining pages: compare last 7 days vs previous 21 days.
   * Pages with significantly lower clicks/impressions recently may need updating.
   */
  async getDecliningPages(): Promise<Array<GSCPageData & { trend: 'declining' | 'stable' }>> {
    try {
      const accessToken = await this.getAccessToken();

      // Recent period (last 7 days)
      const { data: recentData } = await axios.post(
        `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(this.siteUrl)}/searchAnalytics/query`,
        {
          startDate: this.getDateString(-7),
          endDate: this.getDateString(-1),
          dimensions: ['page'],
          rowLimit: 100,
        },
        { headers: { Authorization: `Bearer ${accessToken}` }, timeout: 15000 },
      );

      // Previous period (8-28 days ago)
      const { data: previousData } = await axios.post(
        `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(this.siteUrl)}/searchAnalytics/query`,
        {
          startDate: this.getDateString(-28),
          endDate: this.getDateString(-8),
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
          // Normalize: previous period is 21 days, recent is 7 days
          const prevDailyClicks = prev.clicks / 21;
          const recentDailyClicks = recent.clicks / 7;
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

      // Recent period (last 7 days) — query+page dimension for specific page tracking
      const { data: recentData } = await axios.post(
        `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(this.siteUrl)}/searchAnalytics/query`,
        {
          startDate: this.getDateString(-7),
          endDate: this.getDateString(-1),
          dimensions: ['query', 'page'],
          rowLimit: 200,
        },
        { headers: { Authorization: `Bearer ${accessToken}` }, timeout: 15000 },
      );

      // Previous period (8-28 days ago)
      const { data: previousData } = await axios.post(
        `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(this.siteUrl)}/searchAnalytics/query`,
        {
          startDate: this.getDateString(-28),
          endDate: this.getDateString(-8),
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
        const impressionsStable = recent.impressions >= prev.impressions * 0.3; // adjusted for 7d vs 21d

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

  private getDateString(daysOffset: number): string {
    const date = new Date();
    date.setDate(date.getDate() + daysOffset);
    return date.toISOString().split('T')[0];
  }
}
