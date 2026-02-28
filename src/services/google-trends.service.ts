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

  constructor(geo = 'US') {
    this.geo = geo;
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

    // Fetch related queries
    let relatedQueries: string[] = [];
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

    // Breakout detection: check if any rising query has 5000%+ growth
    let hasBreakout = false;
    try {
      const rqRaw = await withRetry(
        () => googleTrends.relatedQueries({
          keyword,
          startTime,
          endTime,
          geo: this.geo,
        }),
        1,
        3000,
      );
      const rqData = JSON.parse(rqRaw);
      const rising = rqData.default?.rankedList?.[1]?.rankedKeyword ?? [];
      hasBreakout = rising.some(
        (item: { formattedValue: string }) =>
          item.formattedValue === 'Breakout' ||
          parseInt(item.formattedValue) >= 5000,
      );
    } catch {
      // Breakout check is optional; skip on failure
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

    logger.info(
      `Rising queries for "${broadTerm}": ${rising.length} rising, ${top.length} top, ` +
      `avg=${averageInterest}, direction=${trendDirection}`,
    );

    return { rising, top, averageInterest, trendDirection };
  }
}
