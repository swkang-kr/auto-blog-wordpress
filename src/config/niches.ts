import { getSeasonalContext } from '../utils/korean-calendar.js';
import type { NicheConfig } from '../types/index.js';
import { KOREAN_SEASONAL_EVENTS } from '../types/index.js';

export function getSeasonallyOrderedNiches(): NicheConfig[] {
  const { events, upcomingEvents } = getSeasonalContext();
  const allEvents = [...events, ...upcomingEvents];
  if (allEvents.length === 0) return [...NICHES];

  const EVENTS_NICHE_MAP: Record<string, string[]> = {
    'Earnings Season': ['오늘의 매수후보 기술적 분석', '오늘의 매수후보 수급 분석'],
    'FOMC': ['오늘의 매수후보 종합'],
    'BOK Rate Decision': ['오늘의 매수후보 종합'],
    'MSCI Rebalancing': ['오늘의 매수후보 수급 분석'],
    'Dividend': ['오늘의 매수후보 단기 스윙'],
    'Options Expiry': ['오늘의 매수후보 기술적 분석'],
    'CES': ['오늘의 매수후보 종합'],
    'IPO Season': ['오늘의 매수후보 수급 분석'],
    'Year-End Tax': ['오늘의 매수후보 단기 스윙'],
  };

  const boostedCategories = new Set<string>();
  for (const event of allEvents) {
    for (const [key, categories] of Object.entries(EVENTS_NICHE_MAP)) {
      if (event.includes(key)) categories.forEach(c => boostedCategories.add(c));
    }
  }

  if (boostedCategories.size === 0) return [...NICHES];
  const boosted = NICHES.filter(n => boostedCategories.has(n.category));
  const rest = NICHES.filter(n => !boostedCategories.has(n.category));
  return [...boosted, ...rest];
}

const Y = new Date().getFullYear();

/**
 * 4개 니치: 오늘의 매수후보 (4가지 각도)
 * 매일 4개 포스트 — Trade Engine live_watchlist 기반
 * niches[0] → liveWatchlist[0-2], [1] → [2-4], [2] → [4-6], [3] → [6-8]
 */
export const NICHES: NicheConfig[] = [
  // ── 1. 오늘의 매수후보 종합 TOP5 ──
  {
    id: 'daily-picks-overview',
    name: '오늘의 매수후보 종합',
    category: '종목분석',
    broadTerm: `오늘의 매수후보 ${Y}`,
    broadTermsExtra: ['오늘 매수할 주식', '매수추천 종목'],
    seedKeywords: [
      `오늘의 매수후보 종목 TOP5 종합 분석 ${Y}`,
      `오늘 매수할 주식 추천 종목 분석 ${Y}`,
      '오늘의 주식 매수 추천 종목 정리',
      `내일 상승 가능성 종목 오늘 매수후보 ${Y}`,
      '오늘 장전 주목 매수후보 종목 TOP5 정리',
      '오늘의 AI 추천 매수후보 종합 분석',
      '코스피 코스닥 오늘의 매수후보 종합 정리',
      `주식 매수 타이밍 오늘의 관심 종목 ${Y}`,
      '오늘의 매수후보 RSI MACD 볼린저밴드 종합',
      '단기 매수후보 종목 오늘의 종합 분석',
      `오늘 주목할 종목 매수후보 리스트 ${Y}`,
      '장 시작 전 오늘의 관심 매수후보 종목',
      '오늘의 스윙 매수후보 종목 정리',
      '매수타이밍 온 종목 오늘의 분석',
      '거래량 터진 오늘의 매수후보 종목 TOP5',
      '수급 강한 오늘의 매수후보 종목 정리',
      `이번 주 매수후보 종목 분석 ${Y}`,
      '오늘 장 마감 후 내일 매수후보 종목',
      '코스피 코스닥 오늘의 주목 매수후보',
      `오늘의 기술적 분석 매수후보 종합 ${Y}`,
    ],
    contentTypes: ['listicle', 'analysis', 'best-x-for-y', 'news-explainer', 'deep-dive'],
    adSenseRpm: 'high',
    pillarTopics: [
      '오늘의 매수후보 종합 가이드: 종목 선별 기준',
      '매수후보 TOP5 분석: RSI MACD 종합 시그널',
      '오늘의 관심 종목 완벽 분석 가이드',
      '매일 매수후보 선별하는 법: 기술적 분석 기초',
    ],
  },

  // ── 2. 오늘의 매수후보 기술적 심층 분석 ──
  {
    id: 'daily-picks-technical',
    name: '오늘의 매수후보 기술적 분석',
    category: '종목분석',
    broadTerm: `매수타이밍 기술적 분석 ${Y}`,
    broadTermsExtra: ['RSI 매수시점', 'MACD 골든크로스'],
    seedKeywords: [
      '오늘의 매수후보 RSI MACD 기술적 분석 심층',
      `매수타이밍 RSI 과매도 반등 종목 분석 ${Y}`,
      'MACD 골든크로스 매수시점 종목 기술적 분석',
      '볼린저밴드 하단 지지 매수후보 차트 분석',
      '거래량 급증 종목 기술적 분석 매수타이밍',
      'RSI 30이하 과매도 반등 가능성 종목 분석',
      '오늘의 매수후보 캔들 패턴 기술적 분석',
      '스윙 매수후보 RSI MACD BB 복합 분석',
      '눌림목 매수타이밍 기술적 분석 종목',
      '이평선 정배열 매수후보 기술적 분석',
      `ATR 손절선 계산 매수후보 리스크 관리 ${Y}`,
      '주봉 골든크로스 매수후보 기술적 분석',
      '볼린저밴드 수렴 후 돌파 매수후보 분석',
      '거래량 이동평균 돌파 매수시점 종목',
      '캔들 패턴 매수신호 오늘의 종목 분석',
      '단기 기술적 매수후보 손절 목표가 설정',
      `RSI MACD 골든크로스 동시 발생 종목 ${Y}`,
      '52주 신고가 돌파 매수후보 기술적 분석',
      '지지선 반등 확인 매수타이밍 종목 분석',
      '오늘의 매수후보 기술적 지표 완전 분석',
    ],
    contentTypes: ['analysis', 'deep-dive', 'how-to', 'listicle', 'news-explainer'],
    adSenseRpm: 'high',
    pillarTopics: [
      'RSI MACD 매수 시그널 완벽 가이드',
      '볼린저밴드로 매수타이밍 잡는 법',
      '기술적 분석 매수후보 선별 실전 가이드',
      '캔들 패턴으로 매수시점 찾는 법',
    ],
  },

  // ── 3. 오늘의 매수후보 수급 분석 ──
  {
    id: 'daily-picks-supply',
    name: '오늘의 매수후보 수급 분석',
    category: '종목분석',
    broadTerm: `수급 분석 매수후보 ${Y}`,
    broadTermsExtra: ['외국인 매수', '기관 순매수'],
    seedKeywords: [
      '외국인 기관 동시 순매수 매수후보 수급 분석',
      `오늘의 수급 강한 매수후보 종목 분석 ${Y}`,
      '외국인 순매수 종목 오늘의 매수후보 분석',
      '기관 순매수 종목 매수후보 수급 분석',
      '거래량 급증 수급 강세 매수후보 종목',
      `오늘 외국인 사는 종목 매수타이밍 ${Y}`,
      '기관 매수 집중 종목 오늘의 분석',
      '수급 주도 매수후보 종목 오늘의 정리',
      '외국인 매수 연속 종목 매수후보 분석',
      '프로그램 매수 강세 종목 분석',
      '코스피 수급 분석 오늘의 매수후보',
      '코스닥 외국인 매수 종목 매수후보',
      `개인 역발상 매수후보 수급 분석 ${Y}`,
      '투자자별 수급 분석 오늘의 매수후보',
      '시간외 거래량 급증 종목 매수후보 분석',
      '장전 시간외 수급 강세 종목 분석',
      '외국인 지분율 증가 종목 매수후보',
      '수급+기술적 복합 매수후보 종목 분석',
      `오늘의 수급 기반 단기 매수후보 ${Y}`,
      '외국인 기관 순매수 종목 오늘 매수후보',
    ],
    contentTypes: ['analysis', 'listicle', 'news-explainer', 'deep-dive', 'best-x-for-y'],
    adSenseRpm: 'high',
    pillarTopics: [
      '수급 기반 매수후보 선별 가이드: 외국인·기관 동향',
      '외국인 순매수 종목으로 매수후보 찾는 법',
      '기관 매수 집중 종목 분석 완벽 가이드',
      '수급 분석으로 매수타이밍 잡는 실전 전략',
    ],
  },

  // ── 4. 오늘의 매수후보 단기 스윙 ──
  {
    id: 'daily-picks-swing',
    name: '오늘의 매수후보 단기 스윙',
    category: '종목분석',
    broadTerm: `단기 스윙 매수후보 ${Y}`,
    broadTermsExtra: ['눌림목 매수', '스윙 트레이딩'],
    seedKeywords: [
      `단기 스윙 매수후보 종목 오늘의 분석 ${Y}`,
      '오늘의 스윙 트레이딩 매수후보 종목 정리',
      '눌림목 매수 타이밍 종목 오늘의 분석',
      '단기 매수후보 손절선 목표가 리스크관리',
      '스윙 매수후보 거래량 급등 종목 분석',
      '2-5일 단기 매수후보 기술적 분석',
      '스윙 트레이딩 오늘의 매수후보 종목',
      '주봉 기준 스윙 매수후보 차트 분석',
      `단기 반등 매수후보 저점 매수타이밍 ${Y}`,
      '캔들 패턴 기반 스윙 매수후보 분석',
      '볼린저밴드 하단 지지 스윙 매수후보',
      '이평선 지지 반등 스윙 매수후보 종목',
      '단기 상승 모멘텀 스윙 매수후보 분석',
      `리스크 대비 수익률 스윙 매수후보 ${Y}`,
      '스윙 매수후보 ATR 손절선 설정 방법',
      '주봉 골든크로스 단기 스윙 매수후보',
      '상대강도 강세 종목 스윙 매수후보 분석',
      '오늘의 스윙 관심 종목 기술적 분석',
      `단기 트레이딩 매수후보 실전 분석 ${Y}`,
      '스윙 매수후보 종목 오늘의 종합 정리',
    ],
    contentTypes: ['analysis', 'how-to', 'listicle', 'deep-dive', 'best-x-for-y'],
    adSenseRpm: 'high',
    pillarTopics: [
      '단기 스윙 매수후보 실전 가이드: 손절·목표가 설정',
      '눌림목 매수타이밍 완벽 가이드',
      '스윙 트레이딩 매수후보 선별 전략',
      '단기 매매 리스크 관리: ATR 손절선 활용법',
    ],
  },
];

export function getSeasonalContentSuggestions(): Array<{
  eventName: string;
  daysUntilEvent: number;
  relevantNiches: string[];
  contentAngles: string[];
}> {
  const now = new Date();
  const suggestions: Array<{ eventName: string; daysUntilEvent: number; relevantNiches: string[]; contentAngles: string[] }> = [];

  for (const event of KOREAN_SEASONAL_EVENTS) {
    let eventDate = new Date(now.getFullYear(), event.startMonth - 1, event.startDay);
    if (eventDate < now) eventDate = new Date(now.getFullYear() + 1, event.startMonth - 1, event.startDay);
    const daysUntil = Math.floor((eventDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (daysUntil <= event.leadTimeDays && daysUntil >= 0) {
      suggestions.push({ eventName: event.name, daysUntilEvent: daysUntil, relevantNiches: event.relevantNiches, contentAngles: event.contentAngles });
    }
  }
  return suggestions;
}
