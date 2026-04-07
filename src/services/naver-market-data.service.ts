import axios from 'axios';
import { logger } from '../utils/logger.js';

export interface MarketIndex {
  name: string;
  price: string;
  change: string;
  changeRate: string;
  direction: 'RISING' | 'FALLING' | 'EVEN';
}

export interface MarketSnapshot {
  fetchedAt: string; // ISO datetime
  kospi: MarketIndex;
  kosdaq: MarketIndex;
  usdKrw: string;    // e.g. "1,505.80"
  /** Pre-formatted string ready for injection into content prompts */
  promptContext: string;
}

const NAVER_API = 'https://m.stock.naver.com/api/index';
const NAVER_EXCHANGE_URL = 'https://finance.naver.com/marketindex/';
const HEADERS = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' };

/**
 * Naver Market Data Service
 *
 * Fetches real-time KOSPI, KOSDAQ, and USD/KRW data from Naver Finance
 * for injection into content generation prompts. This prevents Claude from
 * hallucinating index levels that don't match the current market.
 *
 * Cache TTL: 30 minutes (one batch run stays within this window)
 */
export class NaverMarketDataService {
  private cache: { snapshot: MarketSnapshot; fetchedAt: number } | null = null;
  private readonly cacheTtlMs = 30 * 60 * 1000;

  async fetchMarketSnapshot(): Promise<MarketSnapshot | null> {
    if (this.cache && Date.now() - this.cache.fetchedAt < this.cacheTtlMs) {
      return this.cache.snapshot;
    }

    try {
      const [kospiData, kosdaqData, usdKrw] = await Promise.all([
        this.fetchIndex('KOSPI'),
        this.fetchIndex('KOSDAQ'),
        this.fetchUsdKrw(),
      ]);

      if (!kospiData || !kosdaqData) {
        logger.warn('NaverMarketData: Failed to fetch KOSPI or KOSDAQ');
        return null;
      }

      const now = new Date();
      const fetchedAt = now.toISOString();
      const koreaTime = now.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });

      const directionSymbol = (d: MarketIndex['direction']) => d === 'RISING' ? '▲' : d === 'FALLING' ? '▼' : '-';

      const snapshot: MarketSnapshot = {
        fetchedAt,
        kospi: kospiData,
        kosdaq: kosdaqData,
        usdKrw: usdKrw ?? '데이터 없음',
        promptContext: `
## 실시간 시장 데이터 (네이버 금융, ${koreaTime} KST 기준)
⚠️ CRITICAL: Use ONLY the index levels below. DO NOT invent or estimate index levels.

| 지수 | 현재가 | 등락 | 등락률 |
|------|--------|------|--------|
| KOSPI | ${kospiData.price} | ${directionSymbol(kospiData.direction)}${kospiData.change} | ${directionSymbol(kospiData.direction)}${kospiData.changeRate}% |
| KOSDAQ | ${kosdaqData.price} | ${directionSymbol(kosdaqData.direction)}${kosdaqData.change} | ${directionSymbol(kosdaqData.direction)}${kosdaqData.changeRate}% |
| USD/KRW | ${usdKrw ?? 'N/A'} | - | - |

이 데이터를 기사에서 인용 시: "네이버 금융 기준 ${koreaTime} KST" 로 명시하세요.
지지선·저항선 등 기술적 분석 수치는 KOSPI ${kospiData.price} 기준으로 산출하세요.
`.trim(),
      };

      this.cache = { snapshot, fetchedAt: Date.now() };
      logger.info(`NaverMarketData: KOSPI ${kospiData.price} (${directionSymbol(kospiData.direction)}${kospiData.changeRate}%), KOSDAQ ${kosdaqData.price}, USD/KRW ${usdKrw}`);
      return snapshot;
    } catch (error) {
      logger.warn(`NaverMarketData: fetch failed — ${error instanceof Error ? error.message : error}`);
      return null;
    }
  }

  private async fetchIndex(code: 'KOSPI' | 'KOSDAQ'): Promise<MarketIndex | null> {
    try {
      const { data } = await axios.get(`${NAVER_API}/${code}/basic`, { headers: HEADERS, timeout: 10_000 });
      return {
        name: code,
        price: data.closePrice,
        change: data.compareToPreviousClosePrice,
        changeRate: data.fluctuationsRatio,
        direction: data.compareToPreviousPrice?.name ?? 'EVEN',
      };
    } catch {
      return null;
    }
  }

  private async fetchUsdKrw(): Promise<string | null> {
    try {
      const { data } = await axios.get<ArrayBuffer>(NAVER_EXCHANGE_URL, {
        responseType: 'arraybuffer',
        timeout: 10_000,
        headers: { ...HEADERS, 'Accept-Encoding': 'identity' },
      });
      const html = new TextDecoder('euc-kr').decode(new Uint8Array(data as ArrayBuffer));
      const match = html.match(/<span class="value">([0-9,]+\.[0-9]+)<\/span>/);
      return match ? match[1] : null;
    } catch {
      return null;
    }
  }
}
