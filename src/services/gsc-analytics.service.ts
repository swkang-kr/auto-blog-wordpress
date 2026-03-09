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

    parts.push('\nUse striking distance keywords as supporting content opportunities. Avoid creating content that competes with your top queries.');

    return parts.join('\n\n');
  }

  private async getAccessToken(): Promise<string> {
    return getGoogleAccessToken(this.saKey, 'https://www.googleapis.com/auth/webmasters.readonly');
  }

  private getDateString(daysOffset: number): string {
    const date = new Date();
    date.setDate(date.getDate() + daysOffset);
    return date.toISOString().split('T')[0];
  }
}
