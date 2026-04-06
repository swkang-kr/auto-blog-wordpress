import { getSeasonalContext } from '../utils/korean-calendar.js';
import type { NicheConfig } from '../types/index.js';
import { KOREAN_SEASONAL_EVENTS } from '../types/index.js';

export function getSeasonallyOrderedNiches(): NicheConfig[] {
  const { events, upcomingEvents } = getSeasonalContext();
  const allEvents = [...events, ...upcomingEvents];
  if (allEvents.length === 0) return [...NICHES];

  const EVENTS_NICHE_MAP: Record<string, string[]> = {
    'Earnings Season': ['시장분석', '업종분석'],
    'FOMC': ['시장분석'],
    'BOK Rate Decision': ['시장분석'],
    'MSCI Rebalancing': ['업종분석'],
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
      // AI·반도체
      `AI 테마주 정리 인공지능 관련주 분석 ${Y}`,
      '반도체 HBM 테마주 수혜주 정리',
      '전고체 배터리 테마주 관련주 분석',
      'AI 데이터센터 전력 인프라 관련주 정리',
      '온디바이스 AI 테마주 관련주 정리',
      '엔비디아 수혜주 한국 관련주 정리',
      // 로봇·자율주행·우주
      '로봇 관련주 분석 두산로보틱스 HD현대',
      '자율주행 테마주 관련주 정리 분석',
      '우주항공 관련주 한화에어로스페이스 분석',
      'UAM 도심항공모빌리티 관련주 정리',
      // 방산·조선·원전
      '방산 테마주 방위산업 관련주 정리',
      '조선 테마주 HD한국조선해양 한화오션 분석',
      'SMR 소형모듈원전 테마주 관련주 정리',
      '원전 수출 수혜주 두산에너빌리티 관련주',
      '전력기기 변압기 테마주 관련주 정리',
      // 2차전지·신에너지
      '2차전지 LFP 테마주 관련주 정리 분석',
      '수소 경제 관련주 분석 투자 가이드',
      '태양광 풍력 신재생에너지 관련주 정리',
      // 바이오·헬스케어
      '디지털 헬스케어 테마주 관련주 분석',
      '바이오 의약품 위탁생산 CMO 관련주 정리',
      '의료기기 테마주 인바디 뷰웍스 관련주',
      // 엔터·게임·K콘텐츠
      'K콘텐츠 테마주 CJ ENM HYBE SM 분석',
      '게임 테마주 넥슨 크래프톤 엔씨 관련주',
      'OTT 스트리밍 테마주 관련주 정리',
      // 금융·핀테크
      '인터넷은행 핀테크 테마주 카카오뱅크 관련주',
      '증권주 테마 분석 키움 삼성증권 관련주',
      // 소비·유통·식품
      'K-뷰티 화장품 테마주 관련주 정리',
      'K-푸드 식품 수출 테마주 관련주 분석',
      '면세점 여행 항공 테마주 관련주 정리',
      // 정책·거시경제
      `금리 인하 수혜주 테마 분석 ${Y}`,
      '정부 정책 수혜주 테마 분석 정리',
      '트럼프 관세 수혜주 피해주 관련주 분석',
      '환율 강달러 수혜주 피해주 테마 분석',
      '공매도 재개 영향 수혜주 관련주 정리',
      // 클라우드·사이버보안·기타
      '클라우드 SaaS 테마주 관련주 분석',
      '사이버 보안 테마주 관련주 정리',
      '탄소 중립 ESG 테마주 관련주 정리',
      // 계절·이슈
      '계절 테마주 여름 겨울 시즌 관련주',
      '실적 호전주 어닝 서프라이즈 테마 분석',
      '외국인 순매수 테마주 최근 동향 분석',
      '코스피 저평가 테마주 PBR 1배 이하 정리',
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

  // ── 4. 종목분석 (워치리스트 기반) ──
  {
    id: 'ai-stock-picks',
    name: '종목분석',
    category: '종목분석',
    broadTerm: `종목분석 기술적 분석 ${Y}`,
    broadTermsExtra: ['종목분석 참고'],
    seedKeywords: [
      `오늘 기술적 지표 관심 종목 분석 검토 ${Y}`,
      'RSI 과매도 구간 진입 종목 기술적 분석',
      'MACD 골든크로스 종목 차트 분석 참고',
      '볼린저밴드 하단 이탈 반등 가능성 종목 분석',
      '거래량 급증 종목 원인 분석 투자 참고',
      'DART 공시 호재 종목 영향 분석',
      '기술적 지표 복합 시그널 종목 분석 참고',
      '스윙 트레이딩 관점 기술적 분석 종목 검토',
      '과매도 구간 반등 가능성 RSI MACD 분석',
      `이번 주 주목 종목 기술적 분석 정리 ${Y}`,
      '외국인 기관 동시 순매수 종목 수급 분석',
      '차트 패턴 + RSI 조합 종목 분석 참고',
      '실적 개선 기대 종목 밸류에이션 분석',
      '업종 강세 수혜 종목 분석 참고',
      '오늘 장 마감 후 내일 관심 종목 기술적 검토',
    ],
    contentTypes: ['analysis', 'listicle', 'news-explainer', 'deep-dive', 'best-x-for-y', 'how-to'],
    adSenseRpm: 'high',
    pillarTopics: [
      'AI 자동매매 워치리스트 가이드: 시그널 분석법',
      'RSI MACD 매수 시그널 활용 가이드',
      'AI 트레이딩 봇 종목 선정 기준 해설',
      '종목분석 활용법: 기술적 지표 해석 가이드',
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
