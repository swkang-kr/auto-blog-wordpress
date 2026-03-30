import { getSeasonalContext } from '../utils/korean-calendar.js';
import type { NicheConfig } from '../types/index.js';
import { KOREAN_SEASONAL_EVENTS } from '../types/index.js';

export function getSeasonallyOrderedNiches(): NicheConfig[] {
  const { events, upcomingEvents } = getSeasonalContext();
  const allEvents = [...events, ...upcomingEvents];
  if (allEvents.length === 0) return [...NICHES];

  const EVENTS_NICHE_MAP: Record<string, string[]> = {
    'Earnings Season': ['시장분석', '업종분석'],
    'FOMC': ['시장분석', '수급분석'],
    'BOK Rate Decision': ['시장분석'],
    'MSCI Rebalancing': ['수급분석', '업종분석'],
    'Dividend': ['업종분석'],
    'Options Expiry': ['시장분석'],
    'CES': ['테마분석', '업종분석'],
    'IPO Season': ['시장분석'],
    'Year-End Tax': ['시장분석'],
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
 * 4개 니치: 시장 / 업종 / 테마 / 수급
 * 매일 4개 포스트 (니치당 1개)
 * Trade Engine DB 데이터 기반 콘텐츠 생성
 */
export const NICHES: NicheConfig[] = [
  // ── 1. 시장 분석 ──
  {
    id: 'market-analysis',
    name: '시장 분석',
    category: '시장분석',
    broadTerm: `KOSPI 전망 ${Y}`,
    broadTermsExtra: ['KOSDAQ 전망'],
    seedKeywords: [
      `KOSPI 전망 ${Y} 상승 하락 분석`,
      `KOSDAQ 전망 ${Y} 소형주 성장주 분석`,
      `주식시장 전망 ${Y} 전문가 분석`,
      'KOSPI vs KOSDAQ 차이점 비교 어디 투자할까',
      '한국은행 기준금리 결정 주식시장 영향 분석',
      '미국 FOMC 금리 결정 한국 주식 영향',
      '원달러 환율 주식시장 영향 분석 전략',
      '한국 GDP 성장률 주식시장 상관관계 분석',
      `주식시장 하락 원인 분석 대응 전략 ${Y}`,
      '주식시장 변동성 VIX 코스피 관계 분석',
      '코스피 지지선 저항선 기술적 분석',
      '코스닥 바이오 장세 분석 투자 전략',
      '한국 주식시장 역사적 패턴 월별 수익률',
      '주식 거래 시간 장전 장후 시간외 정리',
      '주식 초보 시작 가이드 계좌 개설 첫 매수',
      '실적 시즌 투자 전략 어닝 서프라이즈 활용법',
      '공모주 청약 방법 IPO 투자 전략',
      `KODEX TIGER ETF 비교 ${Y} 어떤 걸 살까`,
      '채권 ETF 추천 금리 변동 투자 전략',
      '주식 폭락 역사 교훈 대응 전략',
    ],
    contentTypes: ['analysis', 'news-explainer', 'deep-dive', 'how-to', 'x-vs-y', 'listicle'],
    adSenseRpm: 'high',
    pillarTopics: [
      'KOSPI 전망 분석: 시장 흐름과 투자 전략',
      '주식 투자 초보자 완벽 가이드',
      '한국 주식시장 거시경제 분석 가이드',
      '국내 ETF 투자 가이드: KODEX TIGER 비교',
    ],
  },

  // ── 2. 업종 분석 ──
  {
    id: 'sector-analysis',
    name: '업종 분석',
    category: '업종분석',
    broadTerm: `업종 분석 ${Y}`,
    broadTermsExtra: ['섹터 로테이션'],
    seedKeywords: [
      `반도체 관련주 추천 HBM AI 수혜주 분석 ${Y}`,
      '2차전지 관련주 비교 LG 삼성 SK 투자',
      '전기차 관련주 분석 현대 기아 부품주',
      '방산주 분석 한화에어로스페이스 LIG넥스원',
      '조선주 분석 HD현대 삼성중공업 전망',
      '바이오주 분석 유망 종목 파이프라인',
      'AI 관련주 분석 네이버 카카오 기술주',
      '철강주 분석 POSCO 현대제철 전망',
      '삼성전자 주가 전망 목표가 매수 타이밍',
      'SK하이닉스 주가 분석 HBM AI반도체 전망',
      '현대자동차 주가 전망 전기차 전략 분석',
      'LG에너지솔루션 주가 분석 배터리 시장',
      '네이버 주가 전망 AI 검색 광고 매출',
      '카카오 주가 분석 플랫폼 사업 회복',
      '셀트리온 주가 분석 바이오시밀러 파이프라인',
      '삼성바이오로직스 주가 분석 CDMO 점유율',
      '섹터 로테이션 전략 업종순환 투자 방법',
      `배당주 투자 방법 고배당 종목 추천 ${Y}`,
      '기본적 분석 PER PBR ROE 쉽게 이해하기',
      '원전 관련주 분석 두산에너빌리티 전망',
    ],
    contentTypes: ['analysis', 'deep-dive', 'best-x-for-y', 'x-vs-y', 'listicle', 'news-explainer'],
    adSenseRpm: 'high',
    pillarTopics: [
      '반도체주 투자 가이드: 삼성전자 SK하이닉스',
      '섹터별 유망주 분석: 2차전지 AI 방산 바이오',
      '배당주 투자 가이드: 고배당 종목 추천',
      '기본적 분석 가이드: PER PBR ROE',
    ],
  },

  // ── 3. 테마 분석 ──
  {
    id: 'theme-analysis',
    name: '테마 분석',
    category: '테마분석',
    broadTerm: `테마주 ${Y}`,
    broadTermsExtra: ['관련주 정리'],
    seedKeywords: [
      `AI 테마주 정리 인공지능 관련주 분석 ${Y}`,
      '로봇 관련주 분석 두산로보틱스 HD현대',
      '우주항공 관련주 한화에어로스페이스 분석',
      '수소 경제 관련주 분석 투자 가이드',
      '2차전지 LFP 테마주 관련주 정리 분석',
      '반도체 HBM 테마주 수혜주 정리',
      '전고체 배터리 테마주 관련주 분석',
      'SMR 소형모듈원전 테마주 관련주 정리',
      'K콘텐츠 테마주 CJ ENM HYBE SM 분석',
      '자율주행 테마주 관련주 정리 분석',
      '클라우드 SaaS 테마주 관련주 분석',
      '사이버 보안 테마주 관련주 정리',
      '디지털 헬스케어 테마주 관련주 분석',
      '탄소 중립 ESG 테마주 관련주 정리',
      '메타버스 XR 테마주 관련주 분석',
      '온디바이스 AI 테마주 관련주 정리',
      `금리 인하 수혜주 테마 분석 ${Y}`,
      '정부 정책 수혜주 테마 분석 정리',
      '계절 테마주 여름 겨울 시즌 관련주',
      '실적 호전주 어닝 서프라이즈 테마 분석',
    ],
    contentTypes: ['analysis', 'listicle', 'best-x-for-y', 'news-explainer', 'deep-dive', 'x-vs-y'],
    adSenseRpm: 'high',
    pillarTopics: [
      'AI 테마주 완벽 가이드: 관련주 총정리',
      '2차전지 테마주 가이드: LFP 전고체 관련주',
      '정부 정책 수혜주 테마 분석 가이드',
      '신성장 테마주 가이드: 로봇 우주 수소',
    ],
  },

  // ── 4. 수급 분석 ──
  {
    id: 'supply-demand-analysis',
    name: '수급 분석',
    category: '수급분석',
    broadTerm: `주식 수급 ${Y}`,
    broadTermsExtra: ['외국인 매매 동향'],
    seedKeywords: [
      `외국인 매수 종목 분석 수급 추적 전략 ${Y}`,
      '기관 매수 종목 분석 수급 추적 전략',
      '개인 투자자 매매 동향 분석 전략',
      '외국인 순매매 동향 코스피 영향 분석',
      '기관 순매도 이유 분석 투자 전략',
      '프로그램 매매 차익 비차익 영향 분석',
      '공매도 현황 분석 공매도 잔고 확인 방법',
      '대차거래 잔고 분석 공매도 전략',
      '신용잔고 추이 분석 투자 심리 지표',
      '연기금 매매 동향 국민연금 투자 분석',
      'MSCI 리밸런싱 외국인 수급 영향 분석',
      '외국인 선물 옵션 포지션 분석 전략',
      '수급 분석 방법 주식 매매 가이드',
      '거래량 분석 매매 전략 가이드',
      '기관 외국인 동시 매수 종목 찾기',
      `배당락일 수급 변화 분석 전략 ${Y}`,
      '블록딜 대량 매매 영향 분석 전략',
      '자사주 매입 공시 수급 영향 분석',
      'ETF 자금 유입 유출 분석 투자 전략',
      'DART 공시 보는 법 수급 분석 활용',
    ],
    contentTypes: ['analysis', 'news-explainer', 'how-to', 'deep-dive', 'listicle', 'best-x-for-y'],
    adSenseRpm: 'high',
    pillarTopics: [
      '주식 수급 분석 완벽 가이드: 외국인 기관 개인',
      '외국인 매매 동향 추적 투자 전략',
      '공매도 분석 가이드: 잔고 확인과 전략',
      'DART 공시 분석으로 수급 읽는 법',
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
