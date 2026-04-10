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
const NAVER_STOCK_API = 'https://api.finance.naver.com/service/itemSummary.nhn';
const HEADERS = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36', 'Referer': 'https://finance.naver.com' };

export interface StockSummary {
  stockCode: string;
  stockName: string;
  price: number;       // 현재가 (원)
  diff: number;        // 전일대비
  rate: number;        // 등락률 (%)
  high: number;        // 당일 고가
  low: number;         // 당일 저가
  marketCapBillionKRW: number; // 시가총액 (조원)
  per: number | null;
  pbr: number | null;
  eps: number | null;
  /** Pre-formatted string for prompt injection */
  promptContext: string;
}

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

  /**
   * Fetch real-time stock data for a specific stock code from Naver Finance.
   * Returns structured summary for prompt injection into 종목분석 content.
   */
  async fetchStockSummary(stockCode: string, stockName: string): Promise<StockSummary | null> {
    try {
      const { data } = await axios.get<{
        marketSum: number; per: number; eps: number; pbr: number;
        now: number; diff: number; rate: number; high: number; low: number;
      }>(NAVER_STOCK_API, { params: { itemcode: stockCode }, headers: HEADERS, timeout: 8_000 });

      if (!data || !data.now) return null;

      // marketSum unit: 백만원 → convert to 조원
      const marketCapJo = data.marketSum / 1_000_000;
      const priceFormatted = data.now.toLocaleString('ko-KR');
      const diffSign = data.diff >= 0 ? '▲' : '▼';
      const marketCapStr = marketCapJo >= 1
        ? `${marketCapJo.toFixed(1)}조원`
        : `${(marketCapJo * 1000).toFixed(0)}억원`;

      const now = new Date();
      const koreaTime = now.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });

      const promptContext = `
## 실시간 종목 데이터: ${stockName} (${stockCode}) — 네이버 금융 ${koreaTime} KST 기준
⚠️ CRITICAL: 아래 수치만 사용하고, 시총/현재가/PER/PBR을 절대 임의로 생성하지 마세요.
⚠️ 증권사 목표가는 아래에 제공되지 않으므로, 구체적인 수치를 생성하지 말고 "최신 증권사 리포트 참고 필요"로 기술하세요.

| 항목 | 수치 |
|------|------|
| 현재가 | ${priceFormatted}원 (${diffSign}${Math.abs(data.diff).toLocaleString('ko-KR')}원, ${data.rate >= 0 ? '+' : ''}${data.rate}%) |
| 시가총액 | 약 ${marketCapStr} |
| 당일 고/저 | ${data.high.toLocaleString('ko-KR')}원 / ${data.low.toLocaleString('ko-KR')}원 |
| PER | ${data.per ? `${data.per}배` : '해당없음'} |
| PBR | ${data.pbr ? `${data.pbr}배` : '해당없음'} |
| EPS | ${data.eps ? `${data.eps.toLocaleString('ko-KR')}원` : '해당없음'} |
`.trim();

      logger.info(`NaverStockData: ${stockName}(${stockCode}) 현재가=${priceFormatted}원, 시총=약${marketCapStr}`);

      return {
        stockCode, stockName,
        price: data.now, diff: data.diff, rate: data.rate,
        high: data.high, low: data.low,
        marketCapBillionKRW: marketCapJo,
        per: data.per ?? null, pbr: data.pbr ?? null, eps: data.eps ?? null,
        promptContext,
      };
    } catch (err) {
      logger.warn(`NaverStockData: ${stockName}(${stockCode}) fetch failed — ${err instanceof Error ? err.message : err}`);
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
