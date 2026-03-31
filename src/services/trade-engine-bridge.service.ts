/**
 * Trade Engine Data Bridge Service
 *
 * Reads exported JSON data from Trade Engine and provides it as context
 * to the content generator for Korean stock market blog posts.
 *
 * Data flow:
 * 1. Trade Engine exports data daily → data/trade-engine/*.json
 * 2. This service reads the JSON files at batch start
 * 3. Content generator uses the data for market-aware content
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { logger } from '../utils/logger.js';

const DATA_DIR = join(dirname(new URL(import.meta.url).pathname), '../../data/trade-engine');

export interface DailySummary {
  exported_at: string;
  period: string;
  daily_performance: Array<{
    date: string;
    pnl: number;
    pnl_rate: number;
    trade_count: number;
    win_count: number;
    sharpe: number | null;
    mdd: number | null;
  }>;
  summary?: {
    total_pnl: number;
    total_trades: number;
    win_rate: number;
    avg_daily_pnl: number;
    best_day: number;
    worst_day: number;
  };
}

export interface TradeSignal {
  stock_code: string;
  stock_name: string;
  strategy: string;
  signal_type: string;
  confidence: number;
  reason: string;
  price: number;
  created_at: string;
}

export interface Holding {
  stock_code: string;
  stock_name: string;
  quantity: number;
  avg_price: number;
  current_price: number;
  unrealized_pnl: number;
  unrealized_pnl_rate: number;
  strategy: string;
  entry_date: string;
}

export interface TradeRecord {
  stock_code: string;
  stock_name: string;
  side: string;
  quantity: number;
  price: number;
  pnl: number | null;
  pnl_rate: number | null;
  strategy: string;
  reason: string;
  filled_at: string;
}

export interface DisclosureItem {
  corp_name: string;
  stock_code: string;
  report_name: string;
  disclosure_type: string;
  sentiment: number | null;
  submitted_at: string;
  signal_used: boolean;
}

export interface TopMover {
  stock_code: string;
  stock_name: string;
  close?: number;
  change_rate: number;
  volume: number;
}

export interface MarketOverview {
  date: string;
  kospi_change: number;
  kosdaq_change: number;
  foreign_net: number;
  institution_net: number;
  individual_net: number;
  hot_theme_count: number;
  momentum_count: number;
  crash_count: number;
}

export interface SectorData {
  name: string;
  change_rate: number;
}

export interface ThemeData {
  name: string;
  change_rate: number;
}

export interface WatchlistItem {
  stock_code: string;
  stock_name: string;
  market: string;
  sector: string;
  signal_count: number;
  avg_confidence: number;
  strategies: string[];
  latest_reason: string;
  latest_price: number;
  latest_at: string;
}

export interface WatchlistByNiche {
  시장분석: WatchlistItem[];
  업종분석: WatchlistItem[];
  테마분석: WatchlistItem[];
  수급분석: WatchlistItem[];
}

export interface DbWatchlistItem {
  stock_code: string;
  stock_name: string;
  market: string;
  sector: string;
  target_buy_price: number | null;
  target_price: number | null;
  stop_loss: number | null;
  priority: number;
  memo: string;
  created_at: string;
  updated_at: string;
}

export interface AiPick {
  stock_code: string;
  stock_name: string;
  sector: string;
  signal_count: number;
  avg_confidence: number;
  strategies: string[];
  reason: string;
  price_at_signal: number;
  signal_time: string;
  status: string;
}

export interface AiHolding {
  stock_code: string;
  stock_name: string;
  quantity: number;
  avg_price: number;
  strategy: string;
  entry_date: string;
  status: string;
}

export interface SupplyDemand {
  period: string;
  summary: {
    foreign_net_total: number;
    institution_net_total: number;
    individual_net_total: number;
    dominant_buyer: string;
  };
  daily: Array<{ date: string; foreign_net: number; institution_net: number; individual_net: number }>;
}

export interface TradeEngineData {
  dailySummary: DailySummary | null;
  signals: TradeSignal[];
  holdings: Holding[];
  trades: TradeRecord[];
  disclosures: DisclosureItem[];
  topGainers: TopMover[];
  topLosers: TopMover[];
  // 시장/업종/테마/수급
  marketOverview: MarketOverview[];
  topSectors: SectorData[];
  bottomSectors: SectorData[];
  hotThemes: ThemeData[];
  coldThemes: ThemeData[];
  supplyDemand: SupplyDemand | null;
  // 워치리스트 (니치별)
  watchlistByNiche: WatchlistByNiche | null;
  watchlistAll: WatchlistItem[];
  // 종목분석 (워치리스트 매수 시그널 + 보유 종목)
  aiPicks: AiPick[];       // 매수 시그널 발생 종목 (내일의 매수 후보)
  aiHoldings: AiHolding[]; // 현재 보유 종목
  dataAge: number;
  isStale: boolean;
}

export class TradeEngineBridge {
  private dataDir: string;

  constructor(dataDir?: string) {
    this.dataDir = dataDir || DATA_DIR;
  }

  /** Load all trade engine data files */
  loadData(): TradeEngineData {
    const result: TradeEngineData = {
      dailySummary: null,
      signals: [],
      holdings: [],
      trades: [],
      disclosures: [],
      topGainers: [],
      topLosers: [],
      marketOverview: [],
      topSectors: [],
      bottomSectors: [],
      hotThemes: [],
      coldThemes: [],
      supplyDemand: null,
      watchlistByNiche: null,
      watchlistAll: [],
      aiPicks: [],
      aiHoldings: [],
      dataAge: Infinity,
      isStale: true,
    };

    try {
      // Daily summary
      const summary = this.readJson<DailySummary>('daily_summary.json');
      if (summary) {
        result.dailySummary = summary;
        result.dataAge = this.getDataAge(summary.exported_at);
      }

      // Signals
      const signals = this.readJson<{ signals: TradeSignal[] }>('signals.json');
      if (signals) result.signals = signals.signals || [];

      // Holdings
      const holdings = this.readJson<{ holdings: Holding[] }>('holdings.json');
      if (holdings) result.holdings = holdings.holdings || [];

      // Trades
      const trades = this.readJson<{ trades: TradeRecord[] }>('trades.json');
      if (trades) result.trades = trades.trades || [];

      // Disclosures
      const disclosures = this.readJson<{ disclosures: DisclosureItem[] }>('disclosures.json');
      if (disclosures) result.disclosures = disclosures.disclosures || [];

      // Top movers
      const movers = this.readJson<{ top_gainers: TopMover[]; top_losers: TopMover[] }>('top_movers.json');
      if (movers) {
        result.topGainers = movers.top_gainers || [];
        result.topLosers = movers.top_losers || [];
      }

      // 시장 개요
      const market = this.readJson<{ market_daily: MarketOverview[] }>('market_overview.json');
      if (market) result.marketOverview = market.market_daily || [];

      // 업종
      const sectors = this.readJson<{ top_sectors: SectorData[]; bottom_sectors: SectorData[] }>('sectors.json');
      if (sectors) {
        result.topSectors = sectors.top_sectors || [];
        result.bottomSectors = sectors.bottom_sectors || [];
      }

      // 테마
      const themes = this.readJson<{ hot_themes: ThemeData[]; cold_themes: ThemeData[] }>('themes.json');
      if (themes) {
        result.hotThemes = themes.hot_themes || [];
        result.coldThemes = themes.cold_themes || [];
      }

      // 수급
      const supply = this.readJson<SupplyDemand>('supply_demand.json');
      if (supply) result.supplyDemand = supply;

      // 워치리스트 (시그널 기반) — 오늘 시그널이 있을 때만 사용
      const todayStr = new Date().toISOString().slice(0, 10); // "2026-03-31"
      const watchlist = this.readJson<{ watchlist_all: WatchlistItem[]; by_niche: WatchlistByNiche }>('watchlist.json');
      if (watchlist) {
        const hasTodaySignals = (watchlist.watchlist_all || []).some(
          w => w.latest_at && w.latest_at.startsWith(todayStr)
        );
        if (hasTodaySignals) {
          result.watchlistAll = watchlist.watchlist_all || [];
          result.watchlistByNiche = watchlist.by_niche || null;
        } else {
          logger.info(`Watchlist skipped: no today's signals (latest: ${watchlist.watchlist_all?.[0]?.latest_at?.slice(0, 10) ?? 'none'})`);
        }
      }

      // 종목분석 (워치리스트 + 보유 종목) — 오늘 시그널이 있을 때만 candidates 사용
      const aiPicks = this.readJson<{ candidates: AiPick[]; holdings: AiHolding[] }>('ai_picks.json');
      if (aiPicks) {
        const todayCandidates = (aiPicks.candidates || []).filter(
          c => c.signal_time && c.signal_time.startsWith(todayStr)
        );
        if (todayCandidates.length < aiPicks.candidates?.length) {
          logger.info(`ai_picks filtered: ${todayCandidates.length}/${aiPicks.candidates?.length ?? 0} today's candidates`);
        }
        result.aiPicks = todayCandidates;
        result.aiHoldings = aiPicks.holdings || [];
      }

      // DB 워치리스트 (watchList 테이블 — trade-engine에서 export)
      const dbWl = this.readJson<{ items: DbWatchlistItem[] }>('db_watchlist.json');
      if (dbWl?.items?.length) {
        const existingCodes = new Set(result.aiPicks.map(p => p.stock_code));
        for (const w of dbWl.items) {
          if (!existingCodes.has(w.stock_code)) {
            result.aiPicks.push({
              stock_code: w.stock_code,
              stock_name: w.stock_name,
              sector: w.sector || '',
              signal_count: 1,
              avg_confidence: (w.priority || 0) / 10,
              strategies: w.memo ? [w.memo.split(/[,\s]/)[0]] : [],
              reason: w.memo || `목표매수=${w.target_buy_price || '?'}, TP=${w.target_price || '?'}, SL=${w.stop_loss || '?'}`,
              price_at_signal: w.target_buy_price || 0,
              signal_time: w.updated_at || '',
              status: 'DB 워치리스트',
            });
          }
        }
        logger.info(`DB watchlist: ${dbWl.items.length}종목 로드, aiPicks 병합 완료 (총 ${result.aiPicks.length} 종목)`);
      }

      // 장중 라이브 워치리스트 (15:25 저장, 가장 최신)
      const liveWl = this.readJson<{ watchlist: Array<{ stock_code: string; stock_name: string; score: number; confidence: number; signal_count: number; sector: string }> }>('live_watchlist.json');
      if (liveWl?.watchlist?.length) {
        const existingCodes = new Set(result.aiPicks.map(p => p.stock_code));
        for (const w of liveWl.watchlist) {
          if (!existingCodes.has(w.stock_code)) {
            result.aiPicks.push({
              stock_code: w.stock_code,
              stock_name: w.stock_name,
              sector: w.sector || '',
              signal_count: w.signal_count || 1,
              avg_confidence: w.confidence || 0,
              strategies: [],
              reason: `장중 워치리스트 score=${w.score.toFixed(2)}`,
              price_at_signal: 0,
              signal_time: '',
              status: '장중 워치리스트',
            });
          }
        }
        logger.info(`Live watchlist: ${liveWl.watchlist.length}종목 병합 (총 ${result.aiPicks.length} 종목)`);
      }

      result.isStale = result.dataAge > 24;

      if (result.isStale) {
        logger.warn(`Trade Engine data is ${result.dataAge.toFixed(0)}h old (stale). Content will use general market context.`);
      } else {
        logger.info(`Trade Engine data loaded: ${result.signals.length} signals, ${result.holdings.length} holdings, ${result.topSectors.length} sectors, ${result.hotThemes.length} themes`);
      }
    } catch (error) {
      logger.warn(`Trade Engine data load failed: ${error instanceof Error ? error.message : error}`);
    }

    return result;
  }

  /** Build content generation context from trade engine data */
  buildContentContext(data: TradeEngineData): string {
    if (data.isStale || !data.dailySummary) {
      return '\n## Trade Engine Data: UNAVAILABLE (use general Korean market knowledge)\n';
    }

    const parts: string[] = ['\n## Trade Engine Live Data (use in content where relevant)\n'];

    // Performance summary
    if (data.dailySummary.summary) {
      const s = data.dailySummary.summary;
      parts.push(
        `### 30-Day Trading Performance\n` +
        `- Total P&L: ${s.total_pnl >= 0 ? '+' : ''}${s.total_pnl.toLocaleString()}원\n` +
        `- Win Rate: ${s.win_rate}% (${s.total_trades} trades)\n` +
        `- Best Day: +${s.best_day.toLocaleString()}원 | Worst Day: ${s.worst_day.toLocaleString()}원\n`,
      );
    }

    // Recent signals (top 5)
    if (data.signals.length > 0) {
      parts.push('### Recent Trading Signals\n');
      for (const sig of data.signals.slice(0, 5)) {
        parts.push(`- [${sig.signal_type}] ${sig.stock_name} (${sig.stock_code}) — ${sig.strategy}, confidence: ${(sig.confidence * 100).toFixed(0)}%, reason: ${sig.reason.slice(0, 100)}`);
      }
      parts.push('');
    }

    // Current holdings
    if (data.holdings.length > 0) {
      parts.push('### Current Holdings\n');
      for (const h of data.holdings) {
        const pnlSign = h.unrealized_pnl >= 0 ? '+' : '';
        parts.push(`- ${h.stock_name} (${h.stock_code}): ${h.quantity}주 @ ${h.avg_price.toLocaleString()}원, P&L: ${pnlSign}${h.unrealized_pnl_rate.toFixed(1)}%`);
      }
      parts.push('');
    }

    // Key disclosures
    if (data.disclosures.length > 0) {
      parts.push('### Recent Key Disclosures (DART)\n');
      for (const d of data.disclosures.slice(0, 5)) {
        const sentiment = d.sentiment ? ` (sentiment: ${d.sentiment > 0 ? 'positive' : d.sentiment < 0 ? 'negative' : 'neutral'})` : '';
        parts.push(`- ${d.corp_name}: ${d.report_name}${sentiment}`);
      }
      parts.push('');
    }

    // Top movers
    if (data.topGainers.length > 0 || data.topLosers.length > 0) {
      parts.push('### Market Movers (Latest Trading Day)\n');
      if (data.topGainers.length > 0) {
        parts.push('Top Gainers:');
        for (const g of data.topGainers.slice(0, 5)) {
          const price = g.close ? ` (${g.close.toLocaleString()}원)` : '';
          parts.push(`  - ${g.stock_name}: +${g.change_rate.toFixed(1)}%${price}`);
        }
      }
      if (data.topLosers.length > 0) {
        parts.push('Top Losers:');
        for (const l of data.topLosers.slice(0, 5)) {
          const price = l.close ? ` (${l.close.toLocaleString()}원)` : '';
          parts.push(`  - ${l.stock_name}: ${l.change_rate.toFixed(1)}%${price}`);
        }
      }
      parts.push('');
    }

    // Recent trades (top 5)
    if (data.trades.length > 0) {
      parts.push('### 최근 거래 내역\n');
      for (const t of data.trades.slice(0, 5)) {
        const pnl = t.pnl != null ? ` → 손익: ${t.pnl >= 0 ? '+' : ''}${t.pnl.toLocaleString()}원 (${t.pnl_rate?.toFixed(1)}%)` : '';
        parts.push(`- [${t.side === 'buy' ? '매수' : '매도'}] ${t.stock_name} ${t.quantity}주 @ ${t.price.toLocaleString()}원${pnl} — ${t.strategy}`);
      }
      parts.push('');
    }

    // 시장 개요 (최근 거래일)
    if (data.marketOverview.length > 0) {
      const latest = data.marketOverview[0];
      parts.push(
        `### 시장 개요 (${latest.date})\n` +
        `- KOSPI: ${latest.kospi_change >= 0 ? '+' : ''}${latest.kospi_change.toFixed(2)}%\n` +
        `- KOSDAQ: ${latest.kosdaq_change >= 0 ? '+' : ''}${latest.kosdaq_change.toFixed(2)}%\n` +
        `- 급등 종목: ${latest.momentum_count}개 | 급락 종목: ${latest.crash_count}개 | 핫 테마: ${latest.hot_theme_count}개\n`,
      );
    }

    // 업종별 등락 (상위/하위 5)
    if (data.topSectors.length > 0) {
      parts.push('### 업종 강세/약세\n강세 업종:');
      for (const s of data.topSectors.slice(0, 5)) {
        parts.push(`  - ${s.name}: +${s.change_rate.toFixed(2)}%`);
      }
      if (data.bottomSectors.length > 0) {
        parts.push('약세 업종:');
        for (const s of data.bottomSectors.slice(0, 5)) {
          parts.push(`  - ${s.name}: ${s.change_rate.toFixed(2)}%`);
        }
      }
      parts.push('');
    }

    // 핫 테마
    if (data.hotThemes.length > 0) {
      parts.push('### 핫 테마\n');
      for (const t of data.hotThemes.slice(0, 8)) {
        parts.push(`- ${t.name}: +${t.change_rate.toFixed(2)}%`);
      }
      parts.push('');
    }

    // 수급 동향
    if (data.supplyDemand?.summary) {
      const sd = data.supplyDemand.summary;
      parts.push(
        `### 투자자 수급 (${data.supplyDemand.period})\n` +
        `- 외국인 순매매: ${sd.foreign_net_total >= 0 ? '+' : ''}${sd.foreign_net_total.toLocaleString()}억원\n` +
        `- 기관 순매매: ${sd.institution_net_total >= 0 ? '+' : ''}${sd.institution_net_total.toLocaleString()}억원\n` +
        `- 개인 순매매: ${sd.individual_net_total >= 0 ? '+' : ''}${sd.individual_net_total.toLocaleString()}억원\n` +
        `- 주도 매수 주체: ${sd.dominant_buyer}\n`,
      );
    }

    // 종목분석 (기술적 분석 발생 종목)
    if (data.aiPicks.length > 0) {
      parts.push('### 종목분석 — 기술적 분석 관심 종목\n');
      for (const pick of data.aiPicks.slice(0, 8)) {
        parts.push(`- ${pick.stock_name}(${pick.stock_code}): 시그널 ${pick.signal_count}회, 신뢰도 ${(pick.avg_confidence * 100).toFixed(0)}%, 전략: ${pick.strategies.join('/')}, 업종: ${pick.sector || '미분류'}`);
        if (pick.reason) parts.push(`  근거: ${pick.reason.slice(0, 100)}`);
        if (pick.price_at_signal) parts.push(`  시그널 발생 가격: ${pick.price_at_signal.toLocaleString()}원`);
      }
      parts.push('');
    }

    // 현재 보유 종목
    if (data.aiHoldings.length > 0) {
      parts.push('### 현재 보유 종목 (스윙)\n');
      for (const h of data.aiHoldings) {
        parts.push(`- ${h.stock_name}(${h.stock_code}): ${h.quantity}주 @ ${h.avg_price.toLocaleString()}원 [${h.strategy}] 진입일: ${h.entry_date}`);
      }
      parts.push('');
    }

    // 워치리스트 (니치별)
    if (data.watchlistByNiche) {
      parts.push('### 워치리스트 (Trade Engine BUY 시그널 기반)\n');
      for (const [niche, items] of Object.entries(data.watchlistByNiche)) {
        if (items.length === 0) continue;
        parts.push(`**${niche}:**`);
        for (const w of items.slice(0, 5)) {
          parts.push(`  - ${w.stock_name}(${w.stock_code}): 시그널 ${w.signal_count}회, 신뢰도 ${(w.avg_confidence * 100).toFixed(0)}%, 전략: ${w.strategies.join('/')}, 업종: ${w.sector || '미분류'}`);
        }
      }
      parts.push('');
    }

    return parts.join('\n');
  }

  /** Generate keyword suggestions based on trade engine data */
  generateKeywordSuggestions(data: TradeEngineData): string[] {
    const suggestions: string[] = [];

    // Signal-based keywords
    for (const sig of data.signals.slice(0, 3)) {
      suggestions.push(`${sig.stock_name} 주가 전망 분석 ${new Date().getFullYear()}`);
      suggestions.push(`${sig.stock_name} 기술적 분석 RSI MACD 매매 전략`);
    }

    // Holding-based keywords
    for (const h of data.holdings.slice(0, 3)) {
      suggestions.push(`${h.stock_name} 투자 분석 목표가 전망 ${new Date().getFullYear()}`);
    }

    // Disclosure-based keywords
    for (const d of data.disclosures.slice(0, 3)) {
      suggestions.push(`${d.corp_name} ${d.report_name} 공시 분석 투자 영향`);
    }

    // Top movers keywords
    for (const g of data.topGainers.slice(0, 2)) {
      suggestions.push(`${g.stock_name} 급등 이유 분석 전망 ${new Date().getFullYear()}`);
    }
    for (const l of data.topLosers.slice(0, 2)) {
      suggestions.push(`${l.stock_name} 하락 원인 분석 반등 가능성`);
    }

    // 업종 기반 키워드
    for (const s of data.topSectors.slice(0, 2)) {
      suggestions.push(`${s.name} 업종 강세 이유 관련주 분석 ${new Date().getFullYear()}`);
    }
    for (const s of data.bottomSectors.slice(0, 1)) {
      suggestions.push(`${s.name} 업종 약세 원인 반등 전망 분석`);
    }

    // 테마 기반 키워드
    for (const t of data.hotThemes.slice(0, 3)) {
      suggestions.push(`${t.name} 테마주 관련주 정리 분석 ${new Date().getFullYear()}`);
    }

    // 수급 기반 키워드
    if (data.supplyDemand?.summary) {
      const buyer = data.supplyDemand.summary.dominant_buyer;
      suggestions.push(`${buyer} 순매매 동향 분석 주식 수급 전략 ${new Date().getFullYear()}`);
      if (data.supplyDemand.summary.foreign_net_total > 0) {
        suggestions.push(`외국인 매수 종목 분석 수급 추적 전략`);
      }
      if (data.supplyDemand.summary.institution_net_total > 0) {
        suggestions.push(`기관 매수 종목 분석 수급 추적 전략`);
      }
    }

    // 시장 상황 기반 키워드
    if (data.marketOverview.length > 0) {
      const m = data.marketOverview[0];
      if (m.kospi_change < -1) {
        suggestions.push(`KOSPI 하락 원인 분석 대응 전략 ${new Date().getFullYear()}`);
      } else if (m.kospi_change > 1) {
        suggestions.push(`KOSPI 상승 랠리 분석 추가 상승 가능성 전망`);
      }
    }

    // 오늘의 추천주 키워드 (매수 시그널 발생 종목)
    for (const pick of data.aiPicks.slice(0, 3)) {
      suggestions.push(`${pick.stock_name} AI 매수 시그널 분석 ${pick.strategies[0] || ''} 진입 근거`);
      suggestions.push(`${pick.stock_name} 기술적 분석 기술적 분석 참고`);
    }

    // 워치리스트 기반 키워드 (니치별)
    if (data.watchlistByNiche) {
      for (const [niche, items] of Object.entries(data.watchlistByNiche)) {
        for (const w of items.slice(0, 2)) {
          if (niche === '시장분석') {
            suggestions.push(`${w.stock_name} 주가 전망 시장 영향 분석 ${new Date().getFullYear()}`);
          } else if (niche === '업종분석') {
            suggestions.push(`${w.stock_name} ${w.sector} 업종 분석 투자 전망 ${new Date().getFullYear()}`);
          } else if (niche === '테마분석') {
            suggestions.push(`${w.stock_name} 테마주 관련주 분석 매수 시그널`);
          } else if (niche === '수급분석') {
            suggestions.push(`${w.stock_name} 수급 분석 매매 시그널 추적 전략`);
          }
        }
      }
    }

    return suggestions;
  }

  private readJson<T>(filename: string): T | null {
    const filepath = join(this.dataDir, filename);
    if (!existsSync(filepath)) {
      logger.debug(`Trade Engine data file not found: ${filename}`);
      return null;
    }
    try {
      const raw = readFileSync(filepath, 'utf-8');
      return JSON.parse(raw) as T;
    } catch (error) {
      logger.warn(`Failed to parse ${filename}: ${error instanceof Error ? error.message : error}`);
      return null;
    }
  }

  private getDataAge(exportedAt: string): number {
    try {
      const exported = new Date(exportedAt).getTime();
      return (Date.now() - exported) / (1000 * 60 * 60); // hours
    } catch {
      return Infinity;
    }
  }
}
