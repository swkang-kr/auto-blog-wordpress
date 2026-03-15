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
    'Seollal': ['K-Entertainment', 'K-Beauty'],
    'Valentine': ['K-Beauty', 'K-Entertainment'],
    'White Day': ['K-Beauty', 'K-Entertainment'],
    'Cherry Blossom': ['K-Beauty', 'K-Entertainment'],
    'Seoul Fashion Week': ['K-Beauty', 'K-Entertainment'],
    'KCON': ['K-Entertainment'],
    'Children': ['K-Entertainment'],
    'Summer': ['K-Beauty'],
    'Chuseok': ['K-Entertainment'],
    'BIFF': ['K-Entertainment'],
    'Baeksang': ['K-Entertainment'],
    'K-pop Spring Comeback': ['K-Entertainment'],
    'K-pop Summer Comeback': ['K-Entertainment'],
    'Suneung': ['K-Entertainment'],
    'MAMA': ['K-Entertainment', 'K-Beauty'],
    'Pepero': ['K-Beauty', 'K-Entertainment'],
    'Memorial': ['K-Entertainment'],
    'Dano': ['K-Entertainment'],
    'Summer Sales': ['K-Beauty'],
    'Mid-Year': ['K-Beauty'],
    'Black Friday': ['K-Beauty'],
    'Singles Day': ['K-Beauty'],
    'Christmas': ['K-Beauty', 'K-Entertainment'],
    'New Year': ['K-Entertainment', 'K-Beauty'],
    'K-Beauty Awards': ['K-Beauty'],
    'Circle Chart': ['K-Entertainment'],
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
    broadTerm: 'Korean skincare routine',
    seedKeywords: [
      // Product reviews — established brands (Amazon 어필리에이트 전환율 최고)
      'COSRX snail mucin essence review before and after',
      'Beauty of Joseon relief sun rice probiotics review',
      'Anua heartleaf toner review for sensitive skin',
      'best SKIN1004 Madagascar centella products ranked',
      'Torriden dive-in serum vs COSRX hyaluronic acid review',
      // Emerging brands 2025-2026 (급성장 중)
      'MEDICUBE age R booster review before after results',
      'Isntree hyaluronic acid toner review sensitive skin',
      'Haruharu Wonder black rice toner review vs Anua',
      'Round Lab birch juice moisturizer review dry skin',
      'Mixsoon bean ferment essence review glow skin',
      // Breakout brands 2025-2026 (TikTok 바이럴 + Amazon 급등)
      'Numbuzin No 5 serum review before after glow results',
      'Numbuzin vs COSRX which serum is better for glow',
      'TIRTIR cushion foundation review shades swatches coverage',
      'TIRTIR vs Laneige cushion foundation comparison 2026',
      // Toner pads — fastest-growing K-Beauty segment
      'best Korean toner pads 2026 Anua COSRX ranked',
      'Anua heartleaf 77 toner pad review vs cloth toner',
      'best Korean exfoliating pads for sensitive skin 2026',
      // Glass skin — biggest K-Beauty search category globally
      'glass skin routine Korean products step by step 2026',
      'how to get glass skin Korean skincare method explained',
      'best Korean products for glass skin ranked 2026',
      // Skin barrier repair — high conversion intent
      'skin barrier repair Korean skincare ceramide products ranked',
      'best Korean ceramide moisturizer for damaged skin barrier',
      // Skin cycling + slugging — evergreen 2024-2026
      'skin cycling Korean skincare method guide beginner',
      'slugging Korean skincare overnight method products 2026',
      // Best-of / shopping guides (구매 의도 키워드)
      'best Korean toner for dry skin 2026 ranked',
      'best Korean moisturizer under 30 dollars Amazon 2026',
      'best Korean vitamin C serum ranked dermatologist tested',
      'best Korean sunscreen for dark skin no white cast 2026',
      'best Korean sunscreen tone up cream no white cast 2026',
      'best Korean sheet masks for glowing skin ranked',
      // NOTE: 음용 보충제 — 콘텐츠 내 "not a substitute for medical advice" 고지 필수, 효능 과장 금지
      'best Korean collagen supplement drink 2026 ranked results',
      // Dupes — high-demand 2025-2026 segment (최고 전환율)
      'best Korean skincare dupes for luxury brands that work',
      'Tatcha vs Korean alternative skincare dupes ranked',
      'La Mer dupe Korean moisturizer that actually works',
      'Drunk Elephant dupe Korean skincare alternatives ranked',
      // Men K-Beauty — growing sub-niche
      'best Korean skincare routine for men beginners 2026',
      'best Korean moisturizer for men oily skin 2026',
      'Korean sunscreen for men no white cast lightweight',
      // Comparisons (x-vs-y: high commercial intent)
      'COSRX vs CeraVe which is better for sensitive skin',
      'Korean sunscreen vs American sunscreen SPF comparison',
      'Laneige lip sleeping mask vs Tatcha review comparison',
      'MEDICUBE vs COSRX peptide serum comparison review',
      'Numbuzin vs Mixsoon which ferment serum is better',
      // Routine how-to (evergreen, internal link hub)
      'Korean skincare routine for beginners step by step 2026',
      'how to build a Korean glass skin routine on a budget',
      'skip-care Korean minimalist skincare routine guide 2026',
      // Double cleanse — K-Beauty 아이콘 루틴, 에버그린 고트래픽
      'Korean double cleansing method guide step by step for beginners',
      'best Korean cleansing balm for waterproof makeup removal 2026',
      'best Korean oil cleanser for sensitive acne-prone skin ranked',
      // Centella asiatica — 에버그린 최강 성분 키워드
      'best Korean centella asiatica skincare products ranked 2026',
      'centella asiatica benefits for skin Korean products explained',
      // Eye cream — 인기 K-Beauty 카테고리
      'best Korean eye cream for dark circles puffiness 2026 ranked',
      // Body care — 성장 중인 K-Beauty 세그먼트
      'best Korean body lotion cream for glass skin body 2026',
      // Idol beauty crossover (K-Beauty ↔ K-Entertainment bridge)
      'K-pop idol skincare routine products they actually use',
      'BLACKPINK members skincare routine products revealed',
      'aespa Karina skincare routine products 2026 guide',
      'IVE Wonyoung beauty routine skincare products revealed',
      // NOTE: NewJeans 어도어 계약 분쟁 진행 중 — 법적 분쟁 언급 금지, 뷰티 룩/제품 중심으로만 작성
      'NewJeans makeup looks how to recreate K-Beauty products',
      // K-Beauty 헤어 케어 — Amazon 어필리에이트 추가 기회
      'best Korean shampoo for hair loss thinning hair 2026',
      'Daeng Gi Meo Ri vs Ryo shampoo review comparison',
      // Biodance — 2024-2026 최대 바이럴 K-Beauty 트렌드 (바이오셀룰로오스 콜라겐 패치)
      'Biodance bio-cellulose collagen mask review before after results',
      'Biodance vs other collagen patches which is worth it 2026',
      // Some By Mi — Amazon 강세 브랜드 (AHA BHA PHA 라인)
      'Some By Mi AHA BHA PHA toner review before after acne',
      // ABIB — 컬트 팔로잉, 순한 스킨케어 전문
      'ABIB mild acidic pH sheet mask review sensitive skin',
      // 트라넥삼산 — 브라이트닝 세그먼트 최고 성장률 (2025-2026)
      'best Korean tranexamic acid serum for dark spots hyperpigmentation 2026',
      'tranexamic acid vs niacinamide Korean serum comparison for brightening',
      // 마이크로바이옴 스킨케어 — 신흥 카테고리
      'best Korean microbiome skincare probiotic toner serum 2026',
      // K-Beauty 메이크업 — 구매 의도 키워드
      'rom&nd blur fudge tint review best shades swatches',
      'best Korean cushion foundation for oily skin no oxidation 2026',
      'Clio kill cover foundation review vs MAC comparison',
      // Olive Young 직구 — 2025-2026 폭발적 성장 트렌드
      'how to buy from Olive Young internationally shipping guide 2026',
      'Olive Young best sellers 2026 ranked what to buy',
      'Olive Young vs YesStyle vs Soko Glam where to buy Korean beauty',
      // K-Beauty Tools — 신흥 카테고리
      'best Korean gua sha face tools for lifting 2026 guide',
      'Korean facial massage tools ice roller gua sha guide beginner',
      // 성분 집중 검색 — 고전환율
      'niacinamide concentration guide best Korean serums ranked 2026',
      'best Korean retinol alternative for beginners sensitive skin 2026',
      // Body care 확장 — 급성장 세그먼트
      'how to use Korean Italy towel exfoliation body scrub guide',
      'Korean body glow routine products glass skin body 2026',
      // Peptide 스킨케어 — 글로벌 2위 성장 세그먼트 (2025-2026)
      'best Korean peptide serum for anti-aging firming skin 2026',
      'peptide skincare Korean brands MEDICUBE Isntree ranked guide',
      'Korean peptide vs retinol which is better for beginners 2026',
      // Korean SPF Stick — TikTok 바이럴 2025-2026 (빠른 성장)
      'best Korean sunscreen stick for on-the-go reapplication 2026',
      'Korean SPF stick vs lotion which is better for reapplication',
      // Pore care / sebum control — 아시아 검색량 폭발, K-Beauty 강점
      'best Korean pore minimizer serum toner for enlarged pores 2026',
      'Korean sebum control skincare routine for oily skin 2026',
      'best Korean BHA exfoliant for blackheads pores ranked 2026',
      // K-Beauty Advent Calendar — 연말 어필리에이트 최고 수익 콘텐츠 (11-12월 한정)
      'best K-beauty advent calendar 2026 ranked what is inside',
      'Olive Young advent calendar 2026 review worth it or not',
      // Skin flooding — TikTok 바이럴 2025-2026 (레이어링 수분 공법, 급성장 검색어)
      'skin flooding Korean skincare method how to do it correctly guide',
      'skin flooding vs 7 skin method Korean layering technique compared',
      // Mushroom/Fungi skincare — 글로벌 최고 성장률 성분 카테고리 2025-2026
      'best Korean mushroom skincare products reishi tremella ranked 2026',
      'tremella mushroom K-beauty serum review vs hyaluronic acid',
      // FWEE — 아이돌 메이크업 브랜드, 지수(BLACKPINK) 콜라보, 급성장
      'FWEE Korean makeup brand Jisoo review best products 2026',
      'FWEE vs rom&nd lip tint comparison review best shades',
      // Aestura / Dr.G — 피부과 브랜드 메인스트림 진입, 민감·트러블 피부 세그먼트 강세
      'Aestura AtoBarrier cream review sensitive skin barrier repair',
      'Dr.G brightening peeling gel review gentle exfoliation guide',
      // 50s+ 안티에이징 K-Beauty — 성장 중인 미개척 세그먼트
      'best Korean anti-aging skincare for women over 50 ranked 2026',
      'Korean skincare routine for mature skin 40s 50s guide 2026',
      'best Korean retinol serum for mature skin anti-wrinkle 2026',
    ],
    contentTypes: ['product-review', 'best-x-for-y', 'x-vs-y', 'how-to', 'listicle', 'case-study', 'deep-dive', 'news-explainer'],
    adSenseRpm: 'high',
  },

  // ── K-Entertainment: AdSense 트래픽 중심 ──
  // 전략: 팬덤 트래픽·뉴스·바이럴 리스티클로 페이지뷰 극대화
  {
    id: 'k-entertainment-business',
    name: 'K-Pop & K-Drama',
    category: 'K-Entertainment',
    broadTerm: 'K-pop 2026',
    seedKeywords: [
      // BTS — 글로벌 최고 검색량 (2026년: 모든 멤버 전역 완료, 그룹 컴백 앵글 중심)
      'BTS group comeback 2026 what fans need to know full guide',
      'BTS reunion 2026 after military service what to expect',
      'BTS members solo activities ranked 2026 update',
      // 4세대 주력 그룹 — 급상승 트래픽
      // NOTE: NewJeans — 멤버 5인이 어도어와의 계약을 종료하고 독립 활동 중 (2025-2026).
      //       콘텐츠 작성 시: 법적 분쟁/소속사 갈등 주장 금지, 음악·팬덤 중심으로만 작성할 것.
      //       그룹명 'NewJeans' 사용은 팬덤 관점에서 가능하나, 소속사 관련 주장은 일절 금지.
      'NewJeans best songs ranked guide for new fans',
      'aespa KWANGYA universe lore explained complete guide for new fans',
      'aespa Karina solo debut 2026 what fans need to know',
      // BABYMONSTER — YG 소속 걸그룹, 서바이벌 출신, 글로벌 데뷔 전략 특화
      'BABYMONSTER YG survival show debut story explained guide fans',
      'BABYMONSTER songs ranked best tracks guide 2026',
      // ILLIT — HYBE 뉴진스 스타일 여부 논란 → 고유 정체성 앵글
      'ILLIT HYBE girl group concept sound explained for new fans',
      'ILLIT comeback 2026 what fans need to know',
      // IVE — Starship, 스타일리시 컨셉 + 멤버별 인기
      'IVE member profiles who is who complete guide new fans 2026',
      'IVE best songs ranked guide for new fans 2026',
      'KISS OF LIFE songs ranked retro concept explained',
      'TWS debut songs ranked guide for new listeners 2026',
      'BLACKPINK members solo activities 2026 update what fans need to know',
      // 글로벌 팬덤 그룹 — 검색량 안정적
      'XG songs ranked best tracks to start with guide',
      'tripleS concept explained guide for new fans',
      // K-Drama — Netflix 글로벌 트래픽
      'best Korean dramas on Netflix 2026 must watch',
      'most watched K-dramas of 2026 ranked by viewers',
      'K-drama 2026 release schedule complete list Netflix Disney',
      'where to watch K-dramas online streaming platforms compared',
      'K-drama ending explained 2026 popular shows',
      // K-Drama 웹툰 원작 — 2025-2026 최대 트렌드
      'best K-drama webtoon adaptations 2026 complete list',
      'K-drama based on webtoon manhwa ranked 2026 guide',
      // 팬덤 바이럴 — 소셜 공유율 높음
      'best K-pop music videos 2026 ranked by YouTube views',
      'K-pop idol debut story how each group was formed explained',
      'K-pop idol facts fans don\'t know 2026',
      'best K-pop reality shows to watch 2026',
      'K-pop idol relationship news fan culture guide how fandoms react',
      'K-pop album unboxing guide photocards inclusions 2026',
      // 시즌 이벤트 — 검색 스파이크
      'MAMA Awards 2026 winners predictions complete guide',
      'Golden Disc Awards 2026 predictions K-pop winners ranked',
      'Circle Chart year-end awards 2026 K-pop winners ranked',
      'K-pop concerts in USA 2026 schedule tour dates',
      // 3-4세대 그룹 — 글로벌 팬덤 검색량
      'Stray Kids world tour 2026 setlist fan experience',
      // SEVENTEEN — 13인 자작곡/퍼포먼스 유닛 시스템이 핵심 차별점
      'SEVENTEEN self-producing idol group how units work explained guide',
      // LE SSERAFIM — HYBE, "fearless" 브랜드 아이덴티티 + 스포츠 콜라보 특화
      'LE SSERAFIM fearless concept brand identity explained guide fans',
      'ATEEZ comeback 2026 what fans need to know',
      // TWICE — 9년 차 K-pop 그룹 롱런 비결이 독보적 앵글
      'TWICE how they became K-pop longest-running girl group explained',
      // K-Drama 배우/OST — 팬 검색 의도
      'best K-drama OST songs ranked all time',
      'top K-drama actors to watch 2026 breakout performances',
      // 아이돌 뷰티 — K-Beauty ↔ K-Entertainment 크로스 니치 교두보
      'K-pop idol no-makeup looks what products they use',
      'K-pop idol skincare routine favorite products 2026',
      // BLACKPINK 멤버별 솔로 — 개인 검색량 폭발적
      'Jennie solo career 2026 BLACKPINK comeback update fans',
      'Lisa solo comeback 2026 what fans need to know',
      // KCON — 글로벌 K팝 컨벤션, 연간 고트래픽 이벤트
      'KCON 2026 USA lineup schedule how to get tickets guide',
      'KCON 2026 what to expect first timer complete guide',
      // K팝 포토카드 — Z세대 초고관심, 에버그린
      'how to collect K-pop photocards guide beginners 2026',
      'how to trade K-pop photocards online safely guide',
      // K팝 스트리밍 — 팬 문화 에버그린
      'how to stream K-pop music help your favorite artist chart',
      // 2023-2025 데뷔 그룹 — 그룹별 차별화된 앵글 (cannibalization 방지)
      // RIIZE — SM 루키, 데뷔 후 빠른 성장 케이스
      'RIIZE SM Entertainment rookie group rise explained guide 2026',
      'RIIZE songs ranked best tracks for new fans guide',
      // BOYNEXTDOOR — 스토리텔링 가사 콘셉트 특화
      'BOYNEXTDOOR concept storytelling lyrics explained guide for new fans',
      'BOYNEXTDOOR comeback 2026 what fans need to know',
      // ZeroBaseOne — 서바이벌 오디션 출신, 팬덤 결속력 강함
      'ZeroBaseOne ZB1 how they debuted Boys Planet survival show explained',
      'ZeroBaseOne ZB1 fandom guide lightstick fan culture 2026',
      // ENHYPEN — 글로벌 팬덤 최상위권 4세대 (2020 데뷔, HYBE/Belift Lab)
      'ENHYPEN dark concept explained vampire storyline guide fans',
      'ENHYPEN best songs ranked guide for new fans 2026',
      // TXT (Tomorrow X Together) — 3.5세대 최강 글로벌 팬덤, 챕터 세계관
      'TXT Tomorrow X Together The Dream Chapter universe explained complete guide',
      'TXT best songs ranked by era guide for new fans 2026',
      // 에버그린 — 시간 독립적 (트래픽 지속성 확보)
      'how K-pop training system works explained',
      'K-drama tropes explained for beginners complete guide',
      'why K-pop dominated global music industry explained',
      'how to attend K-pop concerts in Korea as a foreigner',
      'K-pop fan culture guide bias stan fandom terms explained',
      'K-pop world domination how Korean music conquered global charts explained',
      // 팬 멤버십 앱 — Z세대 팬 필수 정보 (에버그린 고수요)
      'Weverse vs Bubble which K-pop fan subscription is worth it 2026',
      'how to use Weverse complete guide for beginners K-pop fans',
      'Weverse DM how to get message from your favorite idol guide',
      // K-Drama by genre — 탐색 의도 키워드
      'best Korean thriller dramas 2026 ranked must watch',
      'best Korean historical dramas 2026 ranked for beginners',
      'best Korean romance dramas Netflix 2026 ranked new fans',
      // K-pop 굿즈 가이드 — 팬덤 구매 의도
      'how to buy official K-pop merchandise online safely guide 2026',
      'best K-pop light sticks ranked most popular fandoms 2026',
      'K-pop official fan club membership guide how to join 2026',
      // 글로벌 투어 확장 — 지역별 팬 검색
      'K-pop concerts in Europe 2026 schedule tour dates cities',
      'K-pop concerts Australia 2026 schedule tour dates guide',
      // 8TURN — JYP 4세대 보이그룹 (2024 데뷔), 글로벌 팬덤 급성장
      '8TURN JYP boy group songs ranked guide for new fans 2026',
      '8TURN debut story JYP Entertainment members explained guide',
      // UNIS (유니스) — FNC/WAKEONE 걸그룹 (2024 데뷔), Universe Ticket 출신
      'UNIS girl group debut story Universe Ticket explained guide',
      'UNIS songs ranked best tracks for new fans 2026',
      // izna (이즈나) — Produce 101 시즌 2 계보 서바이벌 출신 걸그룹
      'izna K-pop girl group debut story concept explained fans guide',
      'izna best songs ranked guide for new fans 2026',
      // Baeksang Arts Awards — 한국 최고권위 시상식, 고트래픽 이벤트 (5월)
      'Baeksang Arts Awards 2026 predictions winners K-drama film guide',
      'Baeksang Arts Awards 2026 nominees K-drama best actress actor',
      // K-pop idol variety show — 팬 검색 높은 에버그린 카테고리
      'best K-pop idol variety shows to watch ranked all time guide',
      'funniest K-pop idol variety show moments compilation guide 2026',
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
