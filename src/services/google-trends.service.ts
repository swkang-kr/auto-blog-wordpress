import googleTrends from 'google-trends-api';
import { logger } from '../utils/logger.js';
import { GoogleTrendsError } from '../types/errors.js';
import { withRetry } from '../utils/retry.js';
import type { TrendsData, RisingQuery } from '../types/index.js';

const RATE_LIMIT_MS = 2500;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class GoogleTrendsService {
  private geo: string;
  private lastCallTime = 0;
  private serpApiKey: string;

  constructor(geo = 'US', serpApiKey = '') {
    this.geo = geo;
    this.serpApiKey = serpApiKey;
  }

  private async rateLimit(): Promise<void> {
    const elapsed = Date.now() - this.lastCallTime;
    if (elapsed < RATE_LIMIT_MS) {
      await sleep(RATE_LIMIT_MS - elapsed);
    }
    this.lastCallTime = Date.now();
  }

  async fetchTrendsData(keyword: string): Promise<TrendsData> {
    logger.info(`Fetching Google Trends data for: "${keyword}"`);

    const endTime = new Date();
    const startTime = new Date();
    startTime.setMonth(startTime.getMonth() - 12);

    // Fetch interest over time
    let interestOverTime: number[] = [];
    try {
      await this.rateLimit();
      const iotRaw = await withRetry(
        () => googleTrends.interestOverTime({
          keyword,
          startTime,
          endTime,
          geo: this.geo,
        }),
        2,
        5000,
      );
      const iotData = JSON.parse(iotRaw);
      if (iotData.default?.timelineData) {
        interestOverTime = iotData.default.timelineData.map(
          (d: { value: number[] }) => d.value[0] ?? 0,
        );
      }
    } catch (error) {
      logger.warn(`interestOverTime failed for "${keyword}": ${error instanceof Error ? error.message : error}`);
    }

    // Fetch related topics
    let relatedTopics: string[] = [];
    try {
      await this.rateLimit();
      const rtRaw = await withRetry(
        () => googleTrends.relatedTopics({
          keyword,
          startTime,
          endTime,
          geo: this.geo,
        }),
        2,
        5000,
      );
      const rtData = JSON.parse(rtRaw);
      const ranked = rtData.default?.rankedList?.[0]?.rankedKeyword ?? [];
      relatedTopics = ranked
        .slice(0, 10)
        .map((item: { topic: { title: string } }) => item.topic?.title)
        .filter(Boolean);
    } catch (error) {
      logger.warn(`relatedTopics failed for "${keyword}": ${error instanceof Error ? error.message : error}`);
    }

    // Fetch related queries (single call — reuse for both queries and breakout detection)
    let relatedQueries: string[] = [];
    let hasBreakout = false;
    try {
      await this.rateLimit();
      const rqRaw = await withRetry(
        () => googleTrends.relatedQueries({
          keyword,
          startTime,
          endTime,
          geo: this.geo,
        }),
        2,
        5000,
      );
      const rqData = JSON.parse(rqRaw);
      const topQueries = rqData.default?.rankedList?.[0]?.rankedKeyword ?? [];
      const risingQueries = rqData.default?.rankedList?.[1]?.rankedKeyword ?? [];
      relatedQueries = [
        ...risingQueries.slice(0, 5).map((item: { query: string }) => item.query),
        ...topQueries.slice(0, 5).map((item: { query: string }) => item.query),
      ].filter(Boolean);

      // Breakout detection from the same API response (no duplicate call needed)
      hasBreakout = risingQueries.some(
        (item: { formattedValue: string }) =>
          item.formattedValue === 'Breakout' ||
          parseInt(item.formattedValue) >= 5000,
      );
    } catch (error) {
      logger.warn(`relatedQueries failed for "${keyword}": ${error instanceof Error ? error.message : error}`);
    }

    // Calculate derived fields
    const averageInterest = interestOverTime.length > 0
      ? Math.round(interestOverTime.reduce((a, b) => a + b, 0) / interestOverTime.length)
      : 0;

    let trendDirection: TrendsData['trendDirection'] = 'stable';
    if (interestOverTime.length >= 6) {
      const recentAvg = interestOverTime.slice(-3).reduce((a, b) => a + b, 0) / 3;
      const olderAvg = interestOverTime.slice(0, 3).reduce((a, b) => a + b, 0) / 3;
      if (olderAvg > 0) {
        const change = (recentAvg - olderAvg) / olderAvg;
        if (change > 0.2) trendDirection = 'rising';
        else if (change < -0.2) trendDirection = 'declining';
      }
    }

    const result: TrendsData = {
      keyword,
      interestOverTime,
      relatedTopics,
      relatedQueries,
      averageInterest,
      trendDirection,
      hasBreakout,
    };

    logger.info(
      `Trends for "${keyword}": avg=${averageInterest}, direction=${trendDirection}, breakout=${hasBreakout}, ` +
      `topics=${relatedTopics.length}, queries=${relatedQueries.length}`,
    );

    return result;
  }

  /**
   * Fetch rising queries for a broad category term (last 3 months).
   * Rising queries have actual search momentum and lower competition
   * than top/steady queries.
   */
  async fetchRisingQueries(broadTerm: string): Promise<{
    rising: RisingQuery[];
    top: RisingQuery[];
    averageInterest: number;
    trendDirection: TrendsData['trendDirection'];
  }> {
    logger.info(`Fetching rising queries for broad term: "${broadTerm}"`);

    const endTime = new Date();
    const startTime = new Date();
    startTime.setMonth(startTime.getMonth() - 3); // 3-month window for recency

    // 1. Interest over time (for the broad term itself)
    let interestOverTime: number[] = [];
    try {
      await this.rateLimit();
      const iotRaw = await withRetry(
        () => googleTrends.interestOverTime({ keyword: broadTerm, startTime, endTime, geo: this.geo }),
        2, 5000,
      );
      const iotData = JSON.parse(iotRaw);
      interestOverTime = (iotData.default?.timelineData ?? []).map(
        (d: { value: number[] }) => d.value[0] ?? 0,
      );
    } catch (error) {
      logger.warn(`interestOverTime failed for "${broadTerm}": ${error instanceof Error ? error.message : error}`);
    }

    // 2. Rising + Top related queries
    let rising: RisingQuery[] = [];
    let top: RisingQuery[] = [];
    try {
      await this.rateLimit();
      const rqRaw = await withRetry(
        () => googleTrends.relatedQueries({ keyword: broadTerm, startTime, endTime, geo: this.geo }),
        2, 5000,
      );
      const rqData = JSON.parse(rqRaw);

      const topRaw = rqData.default?.rankedList?.[0]?.rankedKeyword ?? [];
      const risingRaw = rqData.default?.rankedList?.[1]?.rankedKeyword ?? [];

      top = topRaw
        .slice(0, 15)
        .map((item: { query: string; value: number }) => ({
          query: item.query,
          value: item.value,
        }))
        .filter((q: RisingQuery) => q.query);

      rising = risingRaw
        .slice(0, 20)
        .map((item: { query: string; value: number; formattedValue: string }) => ({
          query: item.query,
          value: item.formattedValue === 'Breakout' ? 'Breakout' : (item.value ?? 0),
        }))
        .filter((q: RisingQuery) => q.query);
    } catch (error) {
      logger.warn(`relatedQueries failed for "${broadTerm}": ${error instanceof Error ? error.message : error}`);
    }

    // Trend direction from interest over time
    let trendDirection: TrendsData['trendDirection'] = 'stable';
    if (interestOverTime.length >= 6) {
      const recentAvg = interestOverTime.slice(-3).reduce((a, b) => a + b, 0) / 3;
      const olderAvg = interestOverTime.slice(0, 3).reduce((a, b) => a + b, 0) / 3;
      if (olderAvg > 0) {
        const change = (recentAvg - olderAvg) / olderAvg;
        if (change > 0.15) trendDirection = 'rising';
        else if (change < -0.15) trendDirection = 'declining';
      }
    }

    const averageInterest = interestOverTime.length > 0
      ? Math.round(interestOverTime.reduce((a, b) => a + b, 0) / interestOverTime.length)
      : 0;

    // Fallback to SerpAPI if unofficial google-trends-api returned no data
    if (rising.length === 0 && top.length === 0 && this.serpApiKey) {
      logger.info(`Falling back to SerpAPI for "${broadTerm}"`);
      const serpResult = await this.fetchViaSerpApi(broadTerm);
      if (serpResult) {
        rising = serpResult.rising;
        top = serpResult.top;
        logger.info(`SerpAPI fallback: ${rising.length} rising, ${top.length} top queries for "${broadTerm}"`);
      }
    }

    logger.info(
      `Rising queries for "${broadTerm}": ${rising.length} rising, ${top.length} top, ` +
      `avg=${averageInterest}, direction=${trendDirection}`,
    );

    return { rising, top, averageInterest, trendDirection };
  }

  /**
   * Fallback: Fetch Google Trends data via SerpAPI when unofficial API fails.
   * SerpAPI provides a reliable paid alternative to the unofficial google-trends-api package.
   */
  private async fetchViaSerpApi(keyword: string): Promise<{ rising: RisingQuery[]; top: RisingQuery[] } | null> {
    if (!this.serpApiKey) return null;

    try {
      const params = new URLSearchParams({
        engine: 'google_trends',
        q: keyword,
        data_type: 'RELATED_QUERIES',
        geo: this.geo,
        date: 'today 3-m',
        api_key: this.serpApiKey,
      });

      const response = await fetch(`https://serpapi.com/search.json?${params}`, { signal: AbortSignal.timeout(15000) });
      if (!response.ok) {
        logger.warn(`SerpAPI error: ${response.status} ${response.statusText}`);
        return null;
      }

      const data = await response.json() as {
        related_queries?: {
          rising?: Array<{ query: string; value?: number; extracted_value?: number; link: string }>;
          top?: Array<{ query: string; value?: number; extracted_value?: number }>;
        };
      };

      const rising: RisingQuery[] = (data.related_queries?.rising || [])
        .slice(0, 20)
        .map(item => ({
          query: item.query,
          value: (item.extracted_value && item.extracted_value >= 5000) ? 'Breakout' as const : (item.extracted_value || item.value || 0),
        }));

      const top: RisingQuery[] = (data.related_queries?.top || [])
        .slice(0, 15)
        .map(item => ({
          query: item.query,
          value: item.extracted_value || item.value || 0,
        }));

      return { rising, top };
    } catch (error) {
      logger.warn(`SerpAPI fallback failed: ${error instanceof Error ? error.message : error}`);
      return null;
    }
  }
}
