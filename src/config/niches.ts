import { getSeasonalContext } from '../utils/korean-calendar.js';
import type { NicheConfig } from '../types/index.js';
import { KOREAN_SEASONAL_EVENTS } from '../types/index.js';

/**
 * Get niches sorted by seasonal relevance.
 * Niches matching current Korean seasonal events are boosted to the front.
 */
export function getSeasonallyOrderedNiches(): NicheConfig[] {
  const { events, upcomingEvents } = getSeasonalContext();
  const allEvents = [...events, ...upcomingEvents];
  if (allEvents.length === 0) return [...NICHES];

  // Map seasonal events back to niche categories that are relevant right now
  const KOREAN_EVENTS_NICHE_MAP: Record<string, string[]> = {
    'Seollal': ['K-Entertainment'],
    'Cherry Blossom': ['K-Beauty', 'K-Entertainment'],
    'Children': ['K-Entertainment'],
    'Summer': ['K-Beauty'],
    'Chuseok': ['K-Entertainment'],
    'BIFF': ['K-Entertainment'],
    'K-pop Spring Comeback': ['K-Entertainment'],
    'K-pop Summer Comeback': ['K-Entertainment'],
    'Suneung': ['K-Entertainment'],
    'MAMA': ['K-Entertainment', 'K-Beauty'],
    'Memorial': ['K-Entertainment'],
    'Dano': ['K-Entertainment'],
    'Summer Sales': ['K-Beauty'],
    'Mid-Year': ['K-Beauty'],
    'Black Friday': ['K-Beauty'],
    'Singles Day': ['K-Beauty'],
    'Christmas': ['K-Beauty', 'K-Entertainment'],
    'New Year': ['K-Entertainment', 'K-Beauty'],
    'K-Beauty Awards': ['K-Beauty'],
  };

  const boostedCategories = new Set<string>();
  for (const event of allEvents) {
    for (const [key, categories] of Object.entries(KOREAN_EVENTS_NICHE_MAP)) {
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
 * CORE NICHES — 목표: 각 니치 15개 포스트로 구글 토픽 권위 확보
 *
 * K-Beauty   (현재 3/15): Amazon 어필리에이트 + AdSense
 *   → 제품 리뷰/비교/쇼핑 가이드 중심 (구매 의도 키워드 우선)
 *
 * K-Entertainment (현재 7/15): AdSense (트래픽 중심)
 *   → 팬 트래픽/바이럴 콘텐츠 중심 (검색량 + 소셜 공유 우선)
 */
export const NICHES: NicheConfig[] = [
  // ── K-Beauty: Amazon 어필리에이트 + AdSense ──
  // 전략: 제품 비교·리뷰·쇼핑 가이드로 구매 의도 트래픽 확보
  {
    id: 'k-beauty-skincare',
    name: 'Korean Skincare & Beauty',
    category: 'K-Beauty',
    broadTerm: 'Korean skincare K-beauty products review',
    seedKeywords: [
      // Product reviews (Amazon 어필리에이트 전환율 최고)
      'COSRX snail mucin essence review before and after',
      'Beauty of Joseon relief sun rice probiotics review',
      'Anua heartleaf toner review for sensitive skin',
      'best SKIN1004 Madagascar centella products ranked',
      'Torriden dive-in serum vs COSRX hyaluronic acid review',
      // Best-of / shopping guides (구매 의도 키워드)
      'best Korean toner for dry skin 2026 ranked',
      'best Korean moisturizer under 30 dollars Amazon 2026',
      'best Korean vitamin C serum ranked dermatologist tested',
      'best Korean sunscreen for dark skin no white cast 2026',
      'best Korean sheet masks for glowing skin ranked',
      // Comparisons (x-vs-y: high commercial intent)
      'COSRX vs CeraVe which is better for sensitive skin',
      'Korean sunscreen vs American sunscreen SPF comparison',
      'Laneige lip sleeping mask vs Tatcha review comparison',
      // Routine how-to (evergreen, internal link hub)
      'Korean skincare routine for beginners step by step 2026',
      'how to build a Korean glass skin routine on a budget',
      // K-Beauty 헤어 케어 — Amazon 어필리에이트 추가 기회
      'best Korean shampoo for hair loss thinning hair 2026',
      'Daeng Gi Meo Ri vs Ryo shampoo review comparison',
      // K-Beauty 메이크업 — 구매 의도 키워드
      'rom&nd blur fudge tint review best shades swatches',
      'best Korean cushion foundation for oily skin no oxidation 2026',
      'Clio kill cover foundation review vs MAC comparison',
    ],
    contentTypes: ['product-review', 'best-x-for-y', 'x-vs-y', 'how-to', 'listicle', 'case-study', 'deep-dive'],
    adSenseRpm: 'high',
  },

  // ── K-Entertainment: AdSense 트래픽 중심 ──
  // 전략: 팬덤 트래픽·뉴스·바이럴 리스티클로 페이지뷰 극대화
  {
    id: 'k-entertainment-business',
    name: 'K-Pop & K-Drama',
    category: 'K-Entertainment',
    broadTerm: 'K-pop K-drama comeback 2026 fan guide',
    seedKeywords: [
      // BTS — 글로벌 최고 검색량
      'BTS comeback 2026 date songs what to expect',
      'BTS members solo activities ranked 2026',
      'BTS Jungkook solo career 2026 update',
      // 신규 그룹 — 급상승 트래픽
      'NewJeans 2026 comeback songs ranked',
      'aespa Supernova era what happened explained',
      'BABYMONSTER debut songs ranked 2026',
      // K-Drama — Netflix 글로벌 트래픽
      'best Korean dramas on Netflix 2026 must watch',
      'most watched K-dramas of 2026 ranked by viewers',
      'K-drama ending explained 2026 popular shows',
      // 팬덤 바이럴 — 소셜 공유율 높음
      'best K-pop music videos 2026 ranked by views',
      'K-pop idol facts fans dont know 2026',
      'best K-pop reality shows to watch 2026',
      // 시즌 이벤트 — 검색 스파이크
      'MAMA Awards 2026 winners complete list',
      'Melon Music Awards 2026 predictions ranked',
      'K-pop concerts in USA 2026 schedule dates',
      // 3-4세대 그룹 — 글로벌 팬덤 검색량
      'Stray Kids world tour 2026 setlist fan experience',
      'SEVENTEEN discography ranked best songs guide',
      'LE SSERAFIM songs ranked best tracks to start with',
      'ATEEZ comeback 2026 what fans need to know',
      'TWICE best songs ranked for new fans guide',
      // K-Drama 배우/OST — 팬 검색 의도
      'best K-drama OST songs ranked all time',
      'top K-drama actors to watch 2026 breakout performances',
      // 에버그린 — 시간 독립적 (트래픽 지속성 확보)
      'how K-pop training system works explained',
      'K-drama tropes explained for beginners complete guide',
      'why K-pop dominated global music industry explained',
      'how to attend K-pop concerts in Korea as a foreigner',
      'K-pop fan culture guide bias stan fandom terms explained',
    ],
    contentTypes: ['listicle', 'news-explainer', 'best-x-for-y', 'deep-dive', 'how-to', 'x-vs-y', 'case-study'],
    adSenseRpm: 'medium',
  },
];

/**
 * Get seasonal content suggestions based on upcoming Korean events.
 * Returns content angles that should be produced 2 weeks ahead of each event.
 * Used in Phase A to inject seasonal hints into keyword research.
 */
export function getSeasonalContentSuggestions(): Array<{
  eventName: string;
  daysUntilEvent: number;
  relevantNiches: string[];
  contentAngles: string[];
}> {
  const now = new Date();
  const currentMonth = now.getMonth() + 1; // 1-based
  const currentDay = now.getDate();
  const suggestions: Array<{
    eventName: string;
    daysUntilEvent: number;
    relevantNiches: string[];
    contentAngles: string[];
  }> = [];

  for (const event of KOREAN_SEASONAL_EVENTS) {
    // Calculate days until event start
    let eventDate = new Date(now.getFullYear(), event.startMonth - 1, event.startDay);
    // If the event already passed this year, check next year
    if (eventDate < now) {
      eventDate = new Date(now.getFullYear() + 1, event.startMonth - 1, event.startDay);
    }
    const daysUntil = Math.floor((eventDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    // Only suggest if within lead time window (pre-production phase)
    if (daysUntil <= event.leadTimeDays && daysUntil >= 0) {
      suggestions.push({
        eventName: event.name,
        daysUntilEvent: daysUntil,
        relevantNiches: event.relevantNiches,
        contentAngles: event.contentAngles,
      });
    }
  }

  return suggestions.sort((a, b) => a.daysUntilEvent - b.daysUntilEvent);
}
