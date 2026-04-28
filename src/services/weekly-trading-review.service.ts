/**
 * WeeklyTradingReviewService
 * trade-engine 데이터를 기반으로 이번 주(월~금) 매매 결산 포스트를 생성한다.
 */
import { spawnSync } from 'child_process';
import { TradeEngineBridge } from './trade-engine-bridge.service.js';
import type { TradeRecord, DailySummary } from './trade-engine-bridge.service.js';
import { logger } from '../utils/logger.js';
import type { BlogContent } from '../types/index.js';

function getWeekRange(referenceDate: Date): { startDate: string; endDate: string; weekLabel: string } {
  const day = referenceDate.getDay(); // 0=Sun, 1=Mon, ..., 5=Fri
  const offsetToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(referenceDate);
  monday.setDate(referenceDate.getDate() + offsetToMonday);
  monday.setHours(0, 0, 0, 0);

  const friday = new Date(monday);
  friday.setDate(monday.getDate() + 4);

  const toYMD = (d: Date) => d.toISOString().slice(0, 10);
  const month = monday.getMonth() + 1;
  const weekOfMonth = Math.ceil(monday.getDate() / 7);

  return {
    startDate: toYMD(monday),
    endDate: toYMD(friday),
    weekLabel: `${monday.getFullYear()}년 ${month}월 ${weekOfMonth}주차`,
  };
}

function filterTradesByWeek(trades: TradeRecord[], startDate: string, endDate: string): TradeRecord[] {
  return trades.filter(t => {
    const d = t.filled_at.slice(0, 10);
    return d >= startDate && d <= endDate;
  });
}

function filterDailyByWeek(
  daily: DailySummary['daily_performance'],
  startDate: string,
  endDate: string,
): DailySummary['daily_performance'] {
  return daily.filter(d => {
    const formatted = `${d.date.slice(0, 4)}-${d.date.slice(4, 6)}-${d.date.slice(6, 8)}`;
    return formatted >= startDate && formatted <= endDate;
  });
}

function buildWeeklyStats(
  weeklyDaily: DailySummary['daily_performance'],
  weeklyTrades: TradeRecord[],
) {
  const totalPnl = weeklyDaily.reduce((s, d) => s + d.pnl, 0);
  const totalPnlRate = weeklyDaily.reduce((s, d) => s + d.pnl_rate, 0);
  const totalTradeCount = weeklyDaily.reduce((s, d) => s + d.trade_count, 0);
  const totalWinCount = weeklyDaily.reduce((s, d) => s + d.win_count, 0);
  const winRate = totalTradeCount > 0 ? (totalWinCount / totalTradeCount) * 100 : 0;
  const bestDay = weeklyDaily.reduce((best, d) => d.pnl > best.pnl ? d : best, weeklyDaily[0] ?? { date: '-', pnl: 0, pnl_rate: 0, trade_count: 0, win_count: 0, sharpe: null, mdd: null });
  const worstDay = weeklyDaily.reduce((worst, d) => d.pnl < worst.pnl ? d : worst, weeklyDaily[0] ?? { date: '-', pnl: 0, pnl_rate: 0, trade_count: 0, win_count: 0, sharpe: null, mdd: null });

  const sellTrades = weeklyTrades.filter(t => t.side === 'sell' && t.pnl != null);
  const bestTrade = sellTrades.reduce<TradeRecord | null>((best, t) => {
    if (!best || (t.pnl ?? -Infinity) > (best.pnl ?? -Infinity)) return t;
    return best;
  }, null);
  const worstTrade = sellTrades.reduce<TradeRecord | null>((worst, t) => {
    if (!worst || (t.pnl ?? Infinity) < (worst.pnl ?? Infinity)) return t;
    return worst;
  }, null);

  // 전략별 성과
  const strategyStats: Record<string, { count: number; pnl: number; wins: number }> = {};
  for (const t of sellTrades) {
    const key = t.strategy.split('(')[0]; // RSI+MACD(swing) → RSI+MACD
    if (!strategyStats[key]) strategyStats[key] = { count: 0, pnl: 0, wins: 0 };
    strategyStats[key].count++;
    strategyStats[key].pnl += t.pnl ?? 0;
    if ((t.pnl ?? 0) > 0) strategyStats[key].wins++;
  }

  // 종목별 손익
  const stockPnl: Record<string, { name: string; pnl: number; count: number }> = {};
  for (const t of sellTrades) {
    if (!stockPnl[t.stock_code]) stockPnl[t.stock_code] = { name: t.stock_name, pnl: 0, count: 0 };
    stockPnl[t.stock_code].pnl += t.pnl ?? 0;
    stockPnl[t.stock_code].count++;
  }

  return {
    totalPnl,
    totalPnlRate,
    totalTradeCount,
    totalWinCount,
    winRate,
    bestDay,
    worstDay,
    bestTrade,
    worstTrade,
    strategyStats,
    stockPnl,
  };
}

function buildContextText(
  weekLabel: string,
  startDate: string,
  endDate: string,
  weeklyDaily: DailySummary['daily_performance'],
  weeklyTrades: TradeRecord[],
  stats: ReturnType<typeof buildWeeklyStats>,
): string {
  const DAY_NAMES: Record<string, string> = { '0': '일', '1': '월', '2': '화', '3': '수', '4': '목', '5': '금', '6': '토' };
  const dayName = (yyyymmdd: string) => {
    const d = new Date(`${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`);
    return DAY_NAMES[String(d.getDay())];
  };

  const lines: string[] = [
    `## ${weekLabel} 주간 매매 결산 데이터 (${startDate} ~ ${endDate})`,
    '',
    '### 주간 종합 성과',
    `- 총 손익: ${stats.totalPnl >= 0 ? '+' : ''}${stats.totalPnl.toLocaleString()}원 (수익률 ${stats.totalPnlRate >= 0 ? '+' : ''}${stats.totalPnlRate.toFixed(2)}%)`,
    `- 총 거래: ${stats.totalTradeCount}회 (승: ${stats.totalWinCount}, 패: ${stats.totalTradeCount - stats.totalWinCount})`,
    `- 승률: ${stats.winRate.toFixed(1)}%`,
    `- 최고의 날: ${stats.bestDay.date} (${dayName(stats.bestDay.date)}요일) +${stats.bestDay.pnl.toLocaleString()}원`,
    `- 최악의 날: ${stats.worstDay.date} (${dayName(stats.worstDay.date)}요일) ${stats.worstDay.pnl.toLocaleString()}원`,
    '',
    '### 요일별 손익',
  ];

  const sortedDaily = [...weeklyDaily].sort((a, b) => a.date.localeCompare(b.date));
  for (const d of sortedDaily) {
    const sign = d.pnl >= 0 ? '+' : '';
    const wr = d.trade_count > 0 ? ((d.win_count / d.trade_count) * 100).toFixed(0) : '0';
    lines.push(`- ${d.date.slice(4, 6)}/${d.date.slice(6, 8)} (${dayName(d.date)}): ${sign}${d.pnl.toLocaleString()}원 (${sign}${d.pnl_rate.toFixed(2)}%) | 거래 ${d.trade_count}회, 승률 ${wr}%`);
  }

  lines.push('', '### 거래 내역 (매도 완결 기준)');
  const sells = weeklyTrades.filter(t => t.side === 'sell').sort((a, b) => a.filled_at.localeCompare(b.filled_at));
  for (const t of sells) {
    const pnlStr = t.pnl != null ? ` → 손익: ${t.pnl >= 0 ? '+' : ''}${t.pnl.toLocaleString()}원 (${t.pnl_rate?.toFixed(2)}%)` : '';
    lines.push(`- [매도] ${t.stock_name}(${t.stock_code}) ${t.quantity}주 @ ${t.price.toLocaleString()}원${pnlStr} | 전략: ${t.strategy} | ${t.filled_at.slice(0, 10)}`);
  }

  const buys = weeklyTrades.filter(t => t.side === 'buy').sort((a, b) => a.filled_at.localeCompare(b.filled_at));
  if (buys.length > 0) {
    lines.push('', '### 신규 매수 종목');
    for (const t of buys) {
      lines.push(`- [매수] ${t.stock_name}(${t.stock_code}) ${t.quantity}주 @ ${t.price.toLocaleString()}원 | 전략: ${t.strategy} | 매수근거: ${t.reason} | ${t.filled_at.slice(0, 10)}`);
    }
  }

  if (Object.keys(stats.strategyStats).length > 0) {
    lines.push('', '### 전략별 성과');
    for (const [strategy, s] of Object.entries(stats.strategyStats)) {
      const sWr = s.count > 0 ? ((s.wins / s.count) * 100).toFixed(0) : '0';
      lines.push(`- ${strategy}: ${s.count}회, 총손익 ${s.pnl >= 0 ? '+' : ''}${s.pnl.toLocaleString()}원, 승률 ${sWr}%`);
    }
  }

  if (stats.bestTrade) {
    lines.push('', `### 이번 주 베스트 트레이드: ${stats.bestTrade.stock_name} +${stats.bestTrade.pnl?.toLocaleString()}원 (+${stats.bestTrade.pnl_rate?.toFixed(2)}%)`);
  }
  if (stats.worstTrade) {
    lines.push(`### 이번 주 워스트 트레이드: ${stats.worstTrade.stock_name} ${stats.worstTrade.pnl?.toLocaleString()}원 (${stats.worstTrade.pnl_rate?.toFixed(2)}%)`);
  }

  return lines.join('\n');
}

export class WeeklyTradingReviewService {
  private bridge: TradeEngineBridge;

  constructor() {
    this.bridge = new TradeEngineBridge();
  }

  generatePost(referenceDate = new Date()): BlogContent {
    const { startDate, endDate, weekLabel } = getWeekRange(referenceDate);
    logger.info(`[WeeklyPost] 기간: ${startDate} ~ ${endDate} (${weekLabel})`);

    const data = this.bridge.loadData();
    const weeklyTrades = filterTradesByWeek(data.trades, startDate, endDate);
    const weeklyDaily = filterDailyByWeek(data.dailySummary?.daily_performance ?? [], startDate, endDate);

    if (weeklyDaily.length === 0 && weeklyTrades.length === 0) {
      logger.warn('[WeeklyPost] 이번 주 거래 데이터 없음 — 가장 최근 데이터 사용');
      // 최근 5개 거래일 사용
      const recent5 = (data.dailySummary?.daily_performance ?? []).slice(0, 5);
      weeklyDaily.push(...recent5);
      const oldestDate = recent5.length > 0
        ? `${recent5[recent5.length - 1].date.slice(0, 4)}-${recent5[recent5.length - 1].date.slice(4, 6)}-${recent5[recent5.length - 1].date.slice(6, 8)}`
        : startDate;
      const newestDate = recent5.length > 0
        ? `${recent5[0].date.slice(0, 4)}-${recent5[0].date.slice(4, 6)}-${recent5[0].date.slice(6, 8)}`
        : endDate;
      weeklyTrades.push(...filterTradesByWeek(data.trades, oldestDate, newestDate));
    }

    const stats = buildWeeklyStats(weeklyDaily, weeklyTrades);
    const contextText = buildContextText(weekLabel, startDate, endDate, weeklyDaily, weeklyTrades, stats);
    const marketCtx = this.bridge.buildContentContext(data);

    const pnlSign = stats.totalPnl >= 0 ? '+' : '';
    const prompt = `당신은 한국 주식 투자 블로그 작가입니다. 실제 AI 매매 시스템의 주간 결산 포스트를 SEO 최적화된 블로그 글로 작성해주세요.

${contextText}

${marketCtx}

【작성 규칙】
1. 제목: "${weekLabel} 주간 매매 결산 — 총손익 ${pnlSign}${stats.totalPnl.toLocaleString()}원, 승률 ${stats.winRate.toFixed(1)}%" 형식으로 시작
2. 내용 구성:
   - ## 이번 주 성과 요약 (핵심 수치 표 포함)
   - ## 요일별 손익 분석 (각 거래일 상세 설명)
   - ## 종목별 거래 내역 (매도 기준, 수익/손실 분석)
   - ## 전략별 성과 분석 (어떤 전략이 잘 됐나)
   - ## 이번 주 시장 환경 (KOSPI/KOSDAQ 흐름과 내 매매의 관계)
   - ## 다음 주 전략 및 보완점
3. 실제 수치를 반드시 포함. 임의로 숫자 생성 금지.
4. 구어체 금지, 전문적인 투자 블로그 문체 사용
5. HTML 형식으로 작성 (<h2>, <p>, <table>, <ul> 태그 활용)
6. 분량: 1500단어 이상

순수 JSON으로만 응답:
{"title":"","html":"","excerpt":"","tags":[],"metaDescription":"","imagePrompts":["",""],"imageCaptions":["",""]}`;

    logger.info(`[WeeklyPost] Claude CLI 포스트 생성 중...`);
    const claudeBin = process.env.CLAUDE_BIN || 'claude';
    const { ANTHROPIC_API_KEY: _unused, ...safeEnv } = process.env;
    const result = spawnSync(claudeBin, ['-p', prompt, '--model', 'opus'], {
      encoding: 'utf8',
      maxBuffer: 8 * 1024 * 1024,
      env: safeEnv,
    });
    if (result.status !== 0) {
      throw new Error(`Claude CLI exit ${result.status}: ${result.stderr?.slice(0, 300)}`);
    }
    const raw = result.stdout?.trim() ?? '';
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('[WeeklyPost] No JSON in Claude response');

    const sanitized = jsonMatch[0].replace(/("(?:[^"\\]|\\.)*")/g, (m) =>
      m.replace(/\n/g, '\\n').replace(/\r/g, '').replace(/\t/g, '\\t')
    );
    const parsed = JSON.parse(sanitized) as {
      title: string;
      html: string;
      excerpt: string;
      tags: string[];
      metaDescription: string;
      imagePrompts: string[];
      imageCaptions: string[];
    };

    logger.info(`[WeeklyPost] 생성 완료: "${parsed.title}"`);

    return {
      title: parsed.title,
      html: parsed.html,
      excerpt: parsed.excerpt || `${weekLabel} AI 주식 매매 결산. 총손익 ${pnlSign}${stats.totalPnl.toLocaleString()}원, 승률 ${stats.winRate.toFixed(1)}%, 총 ${stats.totalTradeCount}회 거래.`,
      tags: [...new Set([...parsed.tags, '주간결산', '매매일지', '주식투자', '스윙매매', weekLabel])],
      category: '매매일지',
      imagePrompts: parsed.imagePrompts?.length ? parsed.imagePrompts : [
        'Weekly stock trading dashboard with candlestick charts, PnL graph, dark theme, professional',
        'Korean stock market KOSPI board, weekly performance analysis, financial data visualization',
      ],
      imageCaptions: parsed.imageCaptions?.length ? parsed.imageCaptions : [
        `${weekLabel} AI 매매 시스템 주간 성과`,
        `${weekLabel} KOSPI/KOSDAQ 시장 흐름`,
      ],
      metaDescription: parsed.metaDescription || `${weekLabel} AI 주식 자동매매 결산. 총손익 ${pnlSign}${stats.totalPnl.toLocaleString()}원, 승률 ${stats.winRate.toFixed(1)}%, 전략별 성과 분석.`,
      qualityScore: 80,
      searchIntent: 'informational',
    };
  }
}
