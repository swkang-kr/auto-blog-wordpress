import { getSeasonalContext } from '../utils/korean-calendar.js';
import type { NicheConfig } from '../types/index.js';
import { KOREAN_SEASONAL_EVENTS } from '../types/index.js';

/**
 * Get niches sorted by seasonal relevance.
 */
export function getSeasonallyOrderedNiches(): NicheConfig[] {
  const { events, upcomingEvents } = getSeasonalContext();
  const allEvents = [...events, ...upcomingEvents];
  if (allEvents.length === 0) return [...NICHES];

  const EVENTS_NICHE_MAP: Record<string, string[]> = {
    'Earnings Season': ['Korean-Stock'],
    'FOMC': ['Korean-Stock', 'AI-Trading'],
    'BOK Rate Decision': ['Korean-Stock'],
    'IPO Season': ['Korean-Stock'],
    'Year-End Tax': ['Korean-Stock'],
    'Dividend': ['Korean-Stock'],
    'Options Expiry': ['Korean-Stock', 'AI-Trading'],
    'Rebalancing': ['Korean-Stock', 'AI-Trading'],
    'KOSPI': ['Korean-Stock'],
    'KOSDAQ': ['Korean-Stock'],
    'Samsung': ['Korean-Stock'],
    'SK Hynix': ['Korean-Stock'],
    'CES': ['Korean-Stock'],
    'MWC': ['Korean-Stock'],
  };

  const boostedCategories = new Set<string>();
  for (const event of allEvents) {
    for (const [key, categories] of Object.entries(EVENTS_NICHE_MAP)) {
      if (event.includes(key)) {
        categories.forEach(c => boostedCategories.add(c));
      }
    }
  }

  if (boostedCategories.size === 0) return [...NICHES];
  const boosted = NICHES.filter(n => boostedCategories.has(n.category));
  const rest = NICHES.filter(n => !boostedCategories.has(n.category));
  return [...boosted, ...rest];
}

/**
 * CORE NICHES — 한국 주식 투자 + AI 트레이딩
 *
 * Korean-Stock: 종목 분석, 시장 리뷰, 공시 해설, 투자 전략 (AdSense 금융 RPM)
 * AI-Trading: AI/퀀트 트레이딩 전략, 백테스트, 자동매매 가이드 (AdSense 기술 RPM)
 */
export const NICHES: NicheConfig[] = [
  // ── Korean Stock: 한국 주식 시장 분석 ──
  {
    id: 'korean-stock-analysis',
    name: 'Korean Stock Market',
    category: 'Korean-Stock',
    broadTerm: `Korean stock market ${new Date().getFullYear()}`,
    broadTermsExtra: [
      'KOSPI KOSDAQ',
      'Korean stock investment',
    ],
    seedKeywords: [
      // 시장 개요/전망
      `KOSPI outlook ${new Date().getFullYear()} forecast analysis where is market heading`,
      `KOSDAQ small cap stocks ${new Date().getFullYear()} best picks analysis`,
      `Korean stock market forecast ${new Date().getFullYear()} expert analysis bull bear`,
      'how to invest in Korean stocks as foreigner complete guide',
      'Korean stock market hours trading schedule holidays explained',
      'KOSPI vs KOSDAQ difference explained which market to invest',
      // 대형주 분석
      'Samsung Electronics stock analysis target price forecast',
      'SK Hynix stock analysis HBM AI chip investment outlook',
      'Hyundai Motor stock analysis EV strategy investment guide',
      'LG Energy Solution stock analysis battery market outlook',
      'NAVER stock analysis AI search advertising revenue outlook',
      'Kakao stock analysis platform business recovery forecast',
      'Samsung SDI stock analysis solid state battery outlook',
      'POSCO Holdings stock analysis lithium battery materials',
      'Celltrion stock analysis biosimilar pipeline investment guide',
      'Samsung Biologics stock analysis CDMO market share forecast',
      // 섹터 분석
      'Korean semiconductor stocks best picks analysis HBM AI',
      'Korean battery stocks comparison LG Samsung SK investment guide',
      'Korean EV stocks analysis Hyundai Kia supply chain picks',
      'Korean defense stocks analysis Hanwha Systems LIG Nex1',
      'Korean shipbuilding stocks HD Hyundai Samsung Heavy analysis',
      'Korean biotech stocks analysis best picks pipeline guide',
      'Korean AI stocks analysis Naver Kakao tech investment',
      'Korean steel stocks POSCO Hyundai Steel analysis forecast',
      // 투자 전략 교육
      'Korean stock technical analysis guide RSI MACD beginners',
      'how to read Korean stock charts candlestick patterns guide',
      'Korean stock fundamental analysis PER PBR ROE guide',
      'Korean stock dividend investing best high yield stocks guide',
      'Korean stock value investing strategy Warren Buffett style guide',
      'Korean stock day trading guide beginners strategy tips',
      'Korean stock sector rotation strategy how to apply guide',
      'Korean stock short selling guide how it works regulations',
      // 공시/이벤트 기반
      'how to read DART financial disclosures Korean stock guide',
      'Korean stock earnings season what to watch guide',
      'Korean IPO investing guide how to apply tips strategy',
      'Korean stock rights offering guide how it works impact',
      'Korean stock buyback program analysis which companies guide',
      'Korean stock ex-dividend date calendar high yield picks',
      // ETF/인덱스
      'best Korean ETF for foreigners KOSPI KOSDAQ index guide',
      'KODEX TIGER Korean ETF comparison guide which to buy',
      'Korean stock index fund vs active fund comparison guide',
      'Korean bond ETF guide best picks interest rate analysis',
      // 거시경제
      'Bank of Korea interest rate decision impact stock market analysis',
      'Korean won USD exchange rate impact stock market analysis',
      'Korea GDP growth outlook stock market correlation analysis',
      'Korean inflation data impact stock market investment guide',
      'US Federal Reserve FOMC impact Korean stock market analysis',
      // 해외 투자자 가이드
      'foreign investor Korean stock market guide regulations account',
      'Korean stock brokerage account for foreigners comparison guide',
      'Korean stock tax guide for foreign investors capital gains',
      'Korean stock market regulation changes impact investors guide',
      // 테마주
      'Korean AI related stocks best picks investment analysis',
      'Korean nuclear power stocks analysis Doosan Enerbility outlook',
      'Korean space industry stocks analysis Hanwha Aerospace guide',
      'Korean K-content stocks CJ ENM HYBE SM Entertainment analysis',
      'Korean robotics stocks analysis Doosan Robotics HD Hyundai',
      'Korean 2nd battery stocks analysis cathode anode materials',
      'Korean hydrogen energy stocks analysis investment guide',
      // 리스크 관리
      'Korean stock risk management guide stop loss position sizing',
      'Korean stock market crash history lessons learned guide',
      'how to hedge Korean stock portfolio options futures guide',
      'Korean stock margin trading guide risks regulations',
    ],
    contentTypes: ['analysis', 'deep-dive', 'news-explainer', 'how-to', 'best-x-for-y', 'x-vs-y', 'case-study', 'listicle'],
    adSenseRpm: 'high',
    pillarTopics: [
      'Korean Stock Market Complete Guide for Investors',
      'KOSPI Analysis: Market Outlook and Investment Strategy',
      'Korean Semiconductor Stocks: Samsung, SK Hynix Investment Guide',
      'Korean Stock Technical Analysis: RSI, MACD, Chart Patterns',
      'How to Invest in Korean Stocks as a Foreign Investor',
      'Korean Stock Dividend Investing: Best High-Yield Picks',
      'Korean ETF Guide: Best Index Funds for Every Investor',
      'Korean Stock Earnings Season: How to Read DART Disclosures',
    ],
  },

  // ── AI Trading & Quant: AI 자동매매 + 퀀트 전략 ──
  {
    id: 'ai-trading-quant',
    name: 'AI Trading & Quant Strategy',
    category: 'AI-Trading',
    broadTerm: `AI trading ${new Date().getFullYear()}`,
    broadTermsExtra: [
      'algorithmic trading',
      'quant investing',
    ],
    seedKeywords: [
      // AI 트레이딩 기초
      'AI trading bot how it works explained beginners guide',
      'algorithmic trading Korean stock market guide getting started',
      'machine learning stock prediction does it work analysis',
      'AI stock trading vs human trader comparison which is better',
      'best AI trading platforms Korean stock market comparison',
      // 기술적 전략 교육
      'RSI trading strategy Korean stocks backtested results guide',
      'MACD trading strategy explained how to use Korean stocks',
      'Bollinger Band trading strategy Korean stock market guide',
      'moving average crossover strategy golden cross death cross guide',
      'volume price analysis Korean stock trading strategy guide',
      'candlestick pattern trading strategy backtested results Korean stocks',
      // 퀀트 전략
      'momentum trading strategy Korean stocks backtested performance',
      'mean reversion strategy Korean stock market how to implement',
      'pair trading strategy Korean stocks statistical arbitrage guide',
      'factor investing Korean stocks value momentum quality size',
      'risk parity portfolio strategy Korean stocks implementation guide',
      'DART disclosure momentum strategy how company filings predict returns',
      // Python 구현
      'Python stock trading bot tutorial Korean market step by step',
      'Python technical analysis library Korean stocks pandas ta guide',
      'Python backtesting framework Korean stocks how to build guide',
      'Korean stock API guide KIS OpenAPI Python tutorial',
      'Python DART API tutorial how to analyze Korean disclosures',
      'Python portfolio optimization Korean stocks modern portfolio theory',
      // 리스크 관리
      'trading risk management position sizing guide Kelly criterion',
      'maximum drawdown explained how to manage trading risk guide',
      'stop loss strategy comparison trailing fixed ATR based guide',
      'Sharpe ratio explained how to evaluate trading strategy performance',
      'Monte Carlo simulation trading strategy risk assessment guide',
      // 실전 자동매매
      'automated trading system architecture design guide production',
      'real-time stock data processing Korean market WebSocket guide',
      'trading system monitoring dashboard how to build guide',
      'trading bot error handling circuit breaker pattern guide',
      'live trading vs paper trading differences transition guide',
      // AI/ML 심화
      'Claude AI trading agent how to build LLM investment analysis',
      'sentiment analysis Korean stock market DART news NLP guide',
      'reinforcement learning stock trading does it work analysis',
      'transformer model stock prediction research review guide',
      'alternative data Korean stock market satellite social media guide',
      // 백테스트
      'backtesting trading strategy pitfalls common mistakes guide',
      'walk forward optimization trading strategy validation guide',
      'overfitting in trading strategy how to avoid guide',
      'transaction cost slippage impact backtesting real trading guide',
      'Korean stock market regime detection strategy adaptation guide',
    ],
    contentTypes: ['how-to', 'deep-dive', 'analysis', 'case-study', 'x-vs-y', 'news-explainer', 'listicle', 'best-x-for-y'],
    adSenseRpm: 'high',
    pillarTopics: [
      'AI Trading Bot Complete Guide: From Theory to Production',
      'Korean Stock Technical Analysis: RSI, MACD, Bollinger Bands',
      'Python Algorithmic Trading Tutorial: Korean Stock Market',
      'Trading Risk Management: Position Sizing and Stop Loss Guide',
      'Backtesting Trading Strategies: Complete Guide to Validation',
      'DART Disclosure Analysis: How Company Filings Predict Returns',
      'Building a Trading Dashboard: Real-Time Monitoring Guide',
      'Quant Factor Investing: Value, Momentum, Quality in Korean Stocks',
    ],
  },
];

/**
 * Get seasonal content suggestions based on upcoming financial events.
 */
export function getSeasonalContentSuggestions(): Array<{
  eventName: string;
  daysUntilEvent: number;
  relevantNiches: string[];
  contentAngles: string[];
}> {
  const now = new Date();
  const suggestions: Array<{
    eventName: string;
    daysUntilEvent: number;
    relevantNiches: string[];
    contentAngles: string[];
  }> = [];

  for (const event of KOREAN_SEASONAL_EVENTS) {
    let eventDate = new Date(now.getFullYear(), event.startMonth - 1, event.startDay);
    if (eventDate < now) {
      eventDate = new Date(now.getFullYear() + 1, event.startMonth - 1, event.startDay);
    }
    const daysUntil = Math.floor((eventDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    if (daysUntil <= event.leadTimeDays && daysUntil >= 0) {
      suggestions.push({
        eventName: event.name,
        daysUntilEvent: daysUntil,
        relevantNiches: event.relevantNiches,
        contentAngles: event.contentAngles,
      });
    }
  }

  return suggestions;
}
