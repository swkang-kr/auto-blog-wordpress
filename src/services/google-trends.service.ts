import googleTrends from 'google-trends-api';
import { logger } from '../utils/logger.js';
import { withRetry } from '../utils/retry.js';
import { GoogleTrendsError } from '../types/errors.js';
import type { TrendKeyword } from '../types/index.js';

export class GoogleTrendsService {
  async fetchTrendingKeywords(country: string, count: number): Promise<TrendKeyword[]> {
    logger.info(`Fetching top ${count} trending keywords for ${country}...`);

    let raw: string;
    try {
      raw = await withRetry(
        () =>
          googleTrends.dailyTrends({
            trendDate: new Date(),
            geo: country,
          }),
        2,
        5000,
      );
    } catch (error) {
      throw new GoogleTrendsError(`Failed to fetch trends for ${country}`, error);
    }

    const parsed = JSON.parse(raw);
    const days = parsed?.default?.trendingSearchesDays;
    if (!days || days.length === 0) {
      logger.warn('No trending data found');
      return [];
    }

    const searches = days[0]?.trendingSearches ?? [];
    const keywords: TrendKeyword[] = searches.slice(0, count).map(
      (item: Record<string, unknown>) => {
        const title = (item.title as Record<string, string>)?.query ?? '';
        const articles = item.articles as Record<string, string>[] | undefined;
        return {
          title,
          description: articles?.[0]?.snippet ?? '',
          source: articles?.[0]?.url ?? '',
          traffic: (item.formattedTraffic as string) ?? '',
        };
      },
    );

    logger.info(`Found ${keywords.length} trending keywords: ${keywords.map((k) => k.title).join(', ')}`);
    return keywords;
  }
}
