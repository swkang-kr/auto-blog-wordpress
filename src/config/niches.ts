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
    broadTerm: `주식 투자 ${new Date().getFullYear()}`,
    broadTermsExtra: [
      'KOSPI 전망',
      '주식 종목 추천',
    ],
    seedKeywords: [
      // 시장 전망
      `KOSPI 전망 ${new Date().getFullYear()} 하반기 상승 하락 분석`,
      `KOSDAQ 유망주 ${new Date().getFullYear()} 소형주 성장주 분석`,
      `주식시장 전망 ${new Date().getFullYear()} 전문가 분석 투자전략`,
      'KOSPI vs KOSDAQ 차이점 어디에 투자할까 비교 분석',
      '주식 초보 시작 가이드 계좌 개설부터 첫 매수까지',
      '주식 거래 시간 장전 장후 시간외 거래 정리',
      // 대형주 분석
      '삼성전자 주가 전망 목표가 분석 매수 타이밍',
      'SK하이닉스 주가 분석 HBM AI반도체 투자 전망',
      '현대자동차 주가 전망 전기차 전략 투자 분석',
      'LG에너지솔루션 주가 분석 배터리 시장 전망',
      '네이버 주가 전망 AI 검색 광고 매출 분석',
      '카카오 주가 분석 플랫폼 사업 회복 전망',
      '삼성SDI 주가 분석 전고체 배터리 전망',
      'POSCO홀딩스 주가 분석 리튬 배터리 소재',
      '셀트리온 주가 분석 바이오시밀러 파이프라인',
      '삼성바이오로직스 주가 분석 CDMO 점유율',
      // 섹터 분석
      '반도체 관련주 추천 HBM AI 수혜주 분석',
      '2차전지 관련주 비교 LG 삼성 SK 투자 가이드',
      '전기차 관련주 분석 현대 기아 부품주 정리',
      '방산주 분석 한화에어로스페이스 LIG넥스원 전망',
      '조선주 분석 HD현대 삼성중공업 투자 전망',
      '바이오주 분석 유망 종목 파이프라인 정리',
      'AI 관련주 분석 네이버 카카오 기술주 투자',
      '철강주 분석 POSCO 현대제철 전망',
      // 투자 전략 교육
      '주식 기술적 분석 RSI MACD 초보자 가이드',
      '주식 차트 보는 법 캔들 패턴 완벽 가이드',
      '기본적 분석 PER PBR ROE 쉽게 이해하기',
      '배당주 투자 방법 고배당 종목 추천 가이드',
      '가치투자 전략 워렌 버핏 스타일 한국 주식 적용',
      '단타 매매 방법 초보자 전략 수익 내는 법',
      '섹터 로테이션 전략 업종순환 투자 방법',
      '공매도 뜻 방법 규제 개인 투자자 영향',
      // 공시/이벤트
      'DART 공시 보는 법 사업보고서 분석 가이드',
      '실적 시즌 투자 전략 어닝 서프라이즈 활용법',
      '공모주 청약 방법 IPO 투자 전략 팁',
      '유상증자 무상증자 차이 주가 영향 분석',
      '자사주 매입 공시 분석 매수 신호 판단법',
      '배당락일 캘린더 고배당주 매수 타이밍',
      // ETF
      'KODEX TIGER ETF 비교 어떤 걸 살까',
      '국내 ETF 추천 KOSPI KOSDAQ 인덱스 가이드',
      '채권 ETF 추천 금리 변동 투자 전략',
      // 거시경제
      '한국은행 기준금리 결정 주식시장 영향 분석',
      '원달러 환율 주식시장 영향 분석 전략',
      '한국 GDP 성장률 주식시장 상관관계',
      '미국 FOMC 금리 결정 한국 주식 영향 분석',
      // 테마주
      'AI 테마주 정리 인공지능 관련주 분석',
      '원전 관련주 분석 두산에너빌리티 전망',
      '우주항공 관련주 한화에어로스페이스 분석',
      '로봇 관련주 분석 두산로보틱스 HD현대',
      '수소 경제 관련주 분석 투자 가이드',
      // 리스크 관리
      '주식 손절 기준 설정 방법 리스크 관리 가이드',
      '주식 폭락 역사 교훈 대응 전략',
      '주식 분산 투자 포트폴리오 구성 방법',
      '신용거래 미수거래 위험성 주의사항 정리',
    ],
    contentTypes: ['analysis', 'deep-dive', 'news-explainer', 'how-to', 'best-x-for-y', 'x-vs-y', 'case-study', 'listicle'],
    adSenseRpm: 'high',
    pillarTopics: [
      '주식 투자 초보자 완벽 가이드: 계좌 개설부터 첫 매수까지',
      'KOSPI 전망 분석: 시장 흐름과 투자 전략',
      '반도체주 투자 가이드: 삼성전자 SK하이닉스 분석',
      '주식 기술적 분석 가이드: RSI MACD 차트 패턴',
      '배당주 투자 가이드: 고배당 종목 추천과 전략',
      '국내 ETF 투자 가이드: KODEX TIGER 비교 분석',
      'DART 공시 분석 가이드: 사업보고서 읽는 법',
      '섹터별 유망주 분석: 2차전지 AI 방산 바이오',
    ],
  },

  // ── AI Trading & Quant: AI 자동매매 + 퀀트 전략 ──
  {
    id: 'ai-trading-quant',
    name: 'AI Trading & Quant Strategy',
    category: 'AI-Trading',
    broadTerm: `자동매매 ${new Date().getFullYear()}`,
    broadTermsExtra: [
      '퀀트 투자',
      '알고리즘 트레이딩',
    ],
    seedKeywords: [
      // AI 트레이딩 기초
      'AI 자동매매 봇 만들기 초보자 가이드',
      '알고리즘 트레이딩 시작하기 한국 주식 가이드',
      'AI 주식 예측 가능할까 머신러닝 주가 분석',
      'AI 자동매매 vs 수동매매 비교 어떤게 유리할까',
      '주식 자동매매 프로그램 추천 비교 분석',
      // 기술적 전략
      'RSI 매매 전략 백테스트 결과 한국 주식 적용',
      'MACD 매매 전략 사용법 골든크로스 데드크로스',
      '볼린저밴드 매매 전략 한국 주식 실전 가이드',
      '이동평균선 매매 전략 골든크로스 데드크로스 정리',
      '거래량 분석 매매 전략 한국 주식 가이드',
      '캔들 패턴 매매 전략 백테스트 결과 분석',
      // 퀀트 전략
      '모멘텀 투자 전략 한국 주식 백테스트 성과',
      '평균 회귀 전략 한국 주식 구현 방법',
      '페어 트레이딩 전략 통계적 차익거래 가이드',
      '팩터 투자 한국 주식 가치 모멘텀 퀄리티',
      'DART 공시 모멘텀 전략 공시로 수익률 예측하기',
      // Python 구현
      'Python 주식 자동매매 봇 만들기 단계별 튜토리얼',
      'Python 기술적 분석 라이브러리 pandas ta 사용법',
      'Python 백테스트 프레임워크 만들기 가이드',
      'KIS OpenAPI Python 연동 가이드 한국투자증권',
      'Python DART API 공시 분석 자동화 튜토리얼',
      'Python 포트폴리오 최적화 현대 포트폴리오 이론',
      // 리스크 관리
      '매매 리스크 관리 포지션 사이징 켈리 기준',
      'MDD 최대 낙폭 관리 방법 트레이딩 리스크',
      '손절 전략 비교 고정 비율 ATR 트레일링',
      '샤프 비율 설명 매매 전략 성과 평가 방법',
      // 실전 자동매매
      '자동매매 시스템 아키텍처 설계 실전 가이드',
      '실시간 주가 데이터 처리 WebSocket 가이드',
      '트레이딩 대시보드 만들기 모니터링 시스템',
      '자동매매 에러 처리 서킷 브레이커 패턴',
      '모의투자 vs 실전투자 차이점 전환 가이드',
      // AI/ML
      'Claude AI 트레이딩 에이전트 만들기 LLM 투자 분석',
      '한국 주식 감성 분석 DART 뉴스 NLP 가이드',
      '강화학습 주식 매매 실제로 가능할까 분석',
      '대안 데이터 활용 한국 주식 분석 가이드',
      // 백테스트
      '백테스트 흔한 실수 과최적화 피하는 방법',
      '워크포워드 최적화 매매 전략 검증 방법',
      '슬리피지 수수료 백테스트 실전 차이 분석',
      '한국 주식 시장 레짐 감지 전략 적응 방법',
    ],
    contentTypes: ['how-to', 'deep-dive', 'analysis', 'case-study', 'x-vs-y', 'news-explainer', 'listicle', 'best-x-for-y'],
    adSenseRpm: 'high',
    pillarTopics: [
      'AI 자동매매 봇 만들기: 이론부터 실전까지 완벽 가이드',
      '기술적 분석 가이드: RSI MACD 볼린저밴드 실전 활용',
      'Python 알고리즘 트레이딩 튜토리얼: 한국 주식 자동매매',
      '매매 리스크 관리: 포지션 사이징과 손절 전략 가이드',
      '백테스트 완벽 가이드: 매매 전략 검증 방법',
      'DART 공시 분석으로 수익률 예측하기',
      '트레이딩 대시보드 만들기: 실시간 모니터링 시스템',
      '퀀트 팩터 투자: 가치 모멘텀 퀄리티 전략',
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
