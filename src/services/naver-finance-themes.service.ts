import axios from 'axios';
import { logger } from '../utils/logger.js';

export interface NaverTheme {
  no: string;
  name: string;
  /** Today's change rate (%) — positive = rising */
  dayChangeRate: number;
  /** Seed keyword ready for Google Trends / AI selection */
  seedKeyword: string;
}

const NAVER_THEME_URL = 'https://finance.naver.com/sise/sise_group.naver?type=theme';

/** Words to strip when building seed keywords */
const FILLER_RE = /\s*등\s*$/g;

/**
 * Convert a Naver Finance theme name to a Google Trends seed keyword.
 *
 * Examples:
 *   "광통신(광케이블/광섬유 등)"  → "광통신 광케이블 광섬유 테마주 관련주"
 *   "2차전지(생산)"               → "2차전지 생산 테마주 관련주"
 *   "스테이블코인"                → "스테이블코인 테마주 관련주"
 */
function themeToSeedKeyword(name: string): string {
  // Extract main name and optional parentheses content
  const mainMatch = name.match(/^([^(]+)/);
  const subMatch = name.match(/\(([^)]+)\)/);

  const main = (mainMatch?.[1] ?? name).trim();
  let sub = subMatch?.[1] ?? '';

  // Clean up sub: remove "등", replace "/" with " "
  sub = sub.replace(FILLER_RE, '').replace(/\//g, ' ').trim();

  const parts = [main, sub].filter(Boolean).join(' ');
  return `${parts} 테마주 관련주`;
}

/**
 * Naver Finance Theme Service
 *
 * Fetches today's theme stock list from Naver Finance and returns the
 * top-rising themes as dynamic seed keywords for keyword research.
 * This replaces the static seedKeywords for the "theme-analysis" niche.
 *
 * Data source: https://finance.naver.com/sise/sise_group.naver?type=theme
 * Encoding: EUC-KR (parsed via TextDecoder)
 * Cache TTL: 60 minutes (one batch is well within this)
 */
export class NaverFinanceThemesService {
  private cache: { themes: NaverTheme[]; fetchedAt: number } | null = null;
  private readonly cacheTtlMs = 60 * 60 * 1000; // 1 hour

  /** Fetch and parse today's theme list from Naver Finance. Returns [] on error. */
  async fetchTopThemes(topN = 30): Promise<NaverTheme[]> {
    // Return cached result if still fresh
    if (this.cache && Date.now() - this.cache.fetchedAt < this.cacheTtlMs) {
      logger.debug(`NaverFinance themes: cache hit (${this.cache.themes.length} themes)`);
      return this.cache.themes.slice(0, topN);
    }

    try {
      const response = await axios.get<ArrayBuffer>(NAVER_THEME_URL, {
        responseType: 'arraybuffer',
        timeout: 15_000,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept-Language': 'ko-KR,ko;q=0.9',
          Accept: 'text/html,application/xhtml+xml',
        },
      });

      const html = new TextDecoder('euc-kr').decode(new Uint8Array(response.data as ArrayBuffer));
      const themes = this.parseThemes(html);

      if (themes.length === 0) {
        logger.warn('NaverFinance themes: parsed 0 themes — HTML structure may have changed');
        return [];
      }

      this.cache = { themes, fetchedAt: Date.now() };
      logger.info(`NaverFinance themes: fetched ${themes.length} themes, top rising: ${themes[0]?.name} (+${themes[0]?.dayChangeRate}%)`);
      return themes.slice(0, topN);
    } catch (error) {
      logger.warn(`NaverFinance themes fetch failed: ${error instanceof Error ? error.message : error}`);
      return [];
    }
  }

  /**
   * Returns today's top-rising themes as seed keywords, sorted by change rate.
   * Themes with negative or zero change are still included (for topic diversity)
   * but ranked after the risers.
   */
  async getTopSeedKeywords(topN = 20): Promise<string[]> {
    const themes = await this.fetchTopThemes(topN);
    return themes.map(t => t.seedKeyword);
  }

  private parseThemes(html: string): NaverTheme[] {
    const results: NaverTheme[] = [];
    const seen = new Set<string>();

    // Match table rows
    const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/g;
    let rowMatch: RegExpExecArray | null;

    while ((rowMatch = rowRe.exec(html)) !== null) {
      const row = rowMatch[1];

      // Theme link pattern: /sise/sise_group_detail.naver?type=theme&no=NNN
      const themeMatch = row.match(/type=theme&no=(\d+)[^>]*>\s*([^<]+?)\s*<\/a>/);
      if (!themeMatch) continue;

      const no = themeMatch[1];
      const rawName = themeMatch[2].trim();

      // Deduplicate by theme number
      if (seen.has(no)) continue;
      seen.add(no);

      // Parse change rate: look for "+4.62%" or "-1.23%" or "0.00%"
      const rateMatches = row.match(/([+-]?\d+\.\d+)%/g);
      const dayChangeRate = rateMatches ? parseFloat(rateMatches[0]) : 0;

      results.push({
        no,
        name: rawName,
        dayChangeRate,
        seedKeyword: themeToSeedKeyword(rawName),
      });
    }

    // Sort by change rate descending (today's hottest themes first)
    return results.sort((a, b) => b.dayChangeRate - a.dayChangeRate);
  }
}
