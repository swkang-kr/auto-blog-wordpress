import https from 'node:https';
import { logger } from '../utils/logger.js';
import { GoogleTrendsError } from '../types/errors.js';
import type { TrendKeyword } from '../types/index.js';

const TRENDS_RSS_URL = 'https://trends.google.co.kr/trending/rss?geo=';

function fetchUrl(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

function parseRssItems(xml: string, count: number): TrendKeyword[] {
  const keywords: TrendKeyword[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;

  while ((match = itemRegex.exec(xml)) !== null && keywords.length < count) {
    const item = match[1];

    const title = item.match(/<title>(.*?)<\/title>/)?.[1]?.trim() ?? '';
    const traffic = item.match(/<ht:approx_traffic>(.*?)<\/ht:approx_traffic>/)?.[1] ?? '';
    const newsTitle = item.match(/<ht:news_item_title>(.*?)<\/ht:news_item_title>/)?.[1] ?? '';
    const newsUrl = item.match(/<ht:news_item_url>(.*?)<\/ht:news_item_url>/)?.[1] ?? '';

    // Decode HTML entities
    const decodeHtml = (s: string) =>
      s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"').replace(/&apos;/g, "'");

    if (title) {
      keywords.push({
        title: decodeHtml(title),
        description: decodeHtml(newsTitle),
        source: newsUrl,
        traffic,
      });
    }
  }

  return keywords;
}

export class GoogleTrendsService {
  async fetchTrendingKeywords(country: string, count: number): Promise<TrendKeyword[]> {
    logger.info(`Fetching top ${count} trending keywords for ${country}...`);

    const url = `${TRENDS_RSS_URL}${country}`;
    let xml: string;

    try {
      xml = await fetchUrl(url);
    } catch (error) {
      throw new GoogleTrendsError(`Failed to fetch trends RSS for ${country}`, error);
    }

    if (!xml.includes('<item>')) {
      logger.warn('No trending items found in RSS feed');
      return [];
    }

    const keywords = parseRssItems(xml, count);

    logger.info(`Found ${keywords.length} trending keywords: ${keywords.map((k) => k.title).join(', ')}`);
    return keywords;
  }
}
