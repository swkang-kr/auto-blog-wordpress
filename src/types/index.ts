/** Korean seasonal events calendar for proactive content production */
export const KOREAN_SEASONAL_EVENTS: Array<{
  name: string;
  /** Approximate date range (month-day) */
  startMonth: number;
  startDay: number;
  endMonth: number;
  endDay: number;
  /** Days before event to start producing content */
  leadTimeDays: number;
  /** Which niche categories benefit from this event */
  relevantNiches: string[];
  /** Suggested content angles */
  contentAngles: string[];
}> = [
  // Lead times extended to 45-60 days for major events (SEO indexing + ranking takes 30-45 days)
  { name: 'Seollal (Lunar New Year)', startMonth: 1, startDay: 20, endMonth: 2, endDay: 20, leadTimeDays: 60, relevantNiches: ['K-Entertainment', 'K-Beauty'], contentAngles: ['best K-dramas to watch during Seollal', 'K-pop idol Seollal greetings ranked', 'Korean holiday skincare gift sets', 'Hanbok beauty makeup looks'] },
  { name: 'Valentine\'s Day / White Day', startMonth: 2, startDay: 14, endMonth: 3, endDay: 14, leadTimeDays: 45, relevantNiches: ['K-Beauty', 'K-Entertainment'], contentAngles: ['best K-beauty gift sets for Valentine\'s Day', 'Korean skincare gift guide for her him', 'K-pop idol Valentine messages fan culture', 'White Day Korean gift guide skincare sets'] },
  { name: 'Cherry Blossom Season', startMonth: 3, startDay: 25, endMonth: 4, endDay: 15, leadTimeDays: 60, relevantNiches: ['K-Beauty', 'K-Entertainment'], contentAngles: ['spring skincare routine', 'K-beauty spring essentials', 'cherry blossom K-drama filming locations', 'spring comeback season K-pop preview'] },
  { name: 'Seoul Fashion Week', startMonth: 3, startDay: 24, endMonth: 4, endDay: 2, leadTimeDays: 30, relevantNiches: ['K-Beauty', 'K-Entertainment'], contentAngles: ['Seoul Fashion Week beauty trends 2026', 'K-pop idol Seoul Fashion Week looks', 'Korean runway makeup trends to try', 'best Korean beauty brands at Seoul Fashion Week'] },
  { name: 'Buddha\'s Birthday (부처님 오신 날)', startMonth: 5, startDay: 1, endMonth: 5, endDay: 31, leadTimeDays: 45, relevantNiches: ['K-Entertainment', 'K-Beauty'], contentAngles: ['best K-dramas set in Korean temples Buddhist culture guide', 'Korean temple beauty routines natural skincare inspired by temple food', 'K-pop idols and Korean Buddhist traditions fan culture guide', 'natural Korean skincare mugwort Artemisia traditional botanical ingredients guide'] },
  { name: 'Summer Monsoon Season', startMonth: 6, startDay: 15, endMonth: 8, endDay: 15, leadTimeDays: 45, relevantNiches: ['K-Beauty', 'K-Entertainment'], contentAngles: ['summer skincare for humidity', 'best Korean sunscreen for summer', 'summer comeback season K-pop ranked', 'best K-dramas to watch this summer'] },
  { name: 'Chuseok (Korean Thanksgiving)', startMonth: 9, startDay: 5, endMonth: 9, endDay: 25, leadTimeDays: 60, relevantNiches: ['K-Entertainment', 'K-Beauty'], contentAngles: ['best K-dramas to binge during Chuseok', 'K-pop idol Chuseok content ranked', 'Korean beauty gift sets for Chuseok holiday'] },
  { name: 'Seoul Fashion Week (Fall)', startMonth: 10, startDay: 14, endMonth: 10, endDay: 22, leadTimeDays: 30, relevantNiches: ['K-Beauty', 'K-Entertainment'], contentAngles: ['Seoul Fashion Week fall beauty trends', 'K-pop idol fashion week street style', 'Korean fall skincare prep beauty guide'] },
  { name: 'MAMA Awards Season', startMonth: 11, startDay: 15, endMonth: 12, endDay: 5, leadTimeDays: 45, relevantNiches: ['K-Entertainment'], contentAngles: ['MAMA Awards predictions', 'K-pop year-end awards guide', 'best K-pop performances'] },
  { name: 'Pepero Day', startMonth: 11, startDay: 11, endMonth: 11, endDay: 11, leadTimeDays: 30, relevantNiches: ['K-Beauty', 'K-Entertainment'], contentAngles: ['Pepero Day K-beauty gift sets ranked', 'best Korean skincare gift box ideas Pepero Day', 'K-pop idol Pepero Day fan events guide'] },
  { name: 'Black Friday / Singles Day', startMonth: 11, startDay: 1, endMonth: 11, endDay: 30, leadTimeDays: 45, relevantNiches: ['K-Beauty'], contentAngles: ['best K-beauty Black Friday deals ranked', 'Olive Young sale picks', 'Amazon K-beauty holiday deals guide'] },
  { name: 'Year-End / New Year', startMonth: 12, startDay: 15, endMonth: 1, endDay: 5, leadTimeDays: 45, relevantNiches: ['K-Entertainment', 'K-Beauty'], contentAngles: ['best K-pop songs of the year ranked', 'K-drama year-end awards winners', 'best K-beauty products of the year', 'new year skincare reset routine'] },
  // Olive Young 봄 그랜드세일 (매년 3월 말~4월 초) — K-Beauty 최대 구매 이벤트, Amazon 연동 어필리에이트 최고 수익
  { name: 'Olive Young Spring Grand Sale', startMonth: 3, startDay: 20, endMonth: 4, endDay: 10, leadTimeDays: 45, relevantNiches: ['K-Beauty'], contentAngles: ['Olive Young spring sale best picks 2026 ranked', 'what to buy at Olive Young grand sale 2026 guide', 'best K-beauty products on sale at Olive Young spring 2026', 'Olive Young spring haul guide skincare makeup must-buys 2026'] },
  // Olive Young 가을 그랜드세일 (매년 9월 말~10월 초) — 연중 2번째 최대 구매 이벤트
  { name: 'Olive Young Fall Grand Sale', startMonth: 9, startDay: 20, endMonth: 10, endDay: 5, leadTimeDays: 45, relevantNiches: ['K-Beauty'], contentAngles: ['Olive Young fall sale best picks 2026 ranked', 'what to buy at Olive Young grand sale fall 2026', 'best K-beauty deals Olive Young autumn sale 2026 guide', 'Olive Young fall haul must-buy skincare for dry season 2026'] },
  // BTS 데뷔 기념일 (6월 13일) — 매년 글로벌 최대 K-팝 트렌드 이벤트, ARMY 구매 행동 + 팬 컨텐츠 폭발
  { name: 'BTS Debut Anniversary', startMonth: 6, startDay: 13, endMonth: 6, endDay: 13, leadTimeDays: 30, relevantNiches: ['K-Entertainment', 'K-Beauty'], contentAngles: ['BTS debut anniversary 2026 how ARMY celebrates guide', 'best BTS songs ranked by era complete anniversary guide', 'BTS 13 years of impact on global K-pop culture explained', 'BTS member solo highlights 2025-2026 recap anniversary special'] },
  // NOTE: Summer Olympics removed — 2026 is NOT an Olympic year (Paris 2024, LA 2028). Re-add in 2027 for LA 2028 pre-production.
  { name: 'Melon Music Awards (MMA)', startMonth: 11, startDay: 20, endMonth: 11, endDay: 30, leadTimeDays: 45, relevantNiches: ['K-Entertainment'], contentAngles: ['Melon Music Awards 2026 predictions who will win daesang', 'MMA 2026 nominees best songs of the year ranked', 'how to watch Melon Music Awards 2026 livestream international fans', 'K-pop year-end awards 2026 complete guide MMA MAMA GDA'] },
  { name: 'K-Beauty Awards Season', startMonth: 12, startDay: 1, endMonth: 12, endDay: 31, leadTimeDays: 45, relevantNiches: ['K-Beauty'], contentAngles: ['best K-beauty products of the year', 'Olive Young award winners', 'skincare trends next year'] },
  { name: 'Circle Chart (Gaon) Year-End Awards', startMonth: 12, startDay: 20, endMonth: 12, endDay: 31, leadTimeDays: 45, relevantNiches: ['K-Entertainment'], contentAngles: ['Circle Chart year-end awards predictions', 'Circle Chart best songs of the year ranked', 'K-pop year-end chart winners 2026', 'Circle Chart vs Hanteo year-end stats who sold the most'] },
  { name: 'Gayo Daejun Year-End Music Specials', startMonth: 12, startDay: 25, endMonth: 12, endDay: 31, leadTimeDays: 30, relevantNiches: ['K-Entertainment'], contentAngles: ['SBS Gayo Daejun 2026 performers lineup complete guide', 'KBS Gayo Daejeon vs SBS Gayo Daejun which to watch 2026', 'MBC Music Festival 2026 performers predictions guide', 'how to watch Korean year-end music specials 2026 livestream international fans', 'best K-pop year-end music show performances of all time ranked'] },
  // NOTE: K-Drama 시상식 3사 — K-드라마 팬이 연말에 가장 많이 검색하는 이벤트 (Baeksang과 별도)
  { name: 'Year-End K-Drama Awards (KBS/MBC/SBS)', startMonth: 12, startDay: 20, endMonth: 12, endDay: 31, leadTimeDays: 30, relevantNiches: ['K-Entertainment'], contentAngles: ['KBS Drama Awards 2026 predictions winners daesang who will win', 'SBS Drama Awards 2026 nominees best actress actor predictions guide', 'MBC Drama Awards 2026 winners recap highlights K-drama fans', 'K-drama year-end awards 2026 complete guide all three networks', 'how to watch KBS SBS MBC drama awards 2026 livestream international fans'] },
  // NOTE: Golden Disc Awards — 통상 1월 초 (디지털 음원 + 음반 시상 분리 개최), 팬 검색 피크: 12월 25일~1월 12일
  { name: 'Golden Disc Awards (골든디스크)', startMonth: 1, startDay: 4, endMonth: 1, endDay: 12, leadTimeDays: 45, relevantNiches: ['K-Entertainment'], contentAngles: ['Golden Disc Awards 2027 predictions winners K-pop guide', 'Golden Disc Awards nominees 2027 best album song ranked', 'how to watch Golden Disc Awards 2027 livestream guide international fans', 'K-pop year-end awards recap Golden Disc MAMA MMA winners 2026'] },
  // 서울가요대상 — 1990년 창설, 한국 3대 음악 시상식 (GDA·SMA·MMA), 1월 개최
  { name: 'Seoul Music Awards (서울가요대상/SMA)', startMonth: 1, startDay: 15, endMonth: 1, endDay: 31, leadTimeDays: 45, relevantNiches: ['K-Entertainment'], contentAngles: ['Seoul Music Awards 2027 predictions daesang winners K-pop guide', 'Seoul Music Awards nominees 2027 best album song ranked', 'how to watch Seoul Music Awards 2027 livestream international fans guide', 'Seoul Music Awards vs Golden Disc Awards difference explained K-pop fans'] },
  // TODO: KCON 일정은 매년 1-2월 공식 발표됨 — 2026년 실제 일정 발표 후 업데이트 필요 (현재: 과거 패턴 기반 추정)
  { name: 'KCON Japan', startMonth: 4, startDay: 1, endMonth: 4, endDay: 30, leadTimeDays: 45, relevantNiches: ['K-Entertainment'], contentAngles: ['KCON Japan 2026 lineup schedule guide', 'how to attend KCON Japan as a foreigner', 'KCON Japan artists performing 2026', 'K-pop fan events Japan 2026 guide'] },
  { name: 'KCON USA', startMonth: 6, startDay: 15, endMonth: 7, endDay: 31, leadTimeDays: 45, relevantNiches: ['K-Entertainment'], contentAngles: ['KCON USA 2026 lineup schedule how to get tickets', 'KCON USA what to expect first timer guide', 'K-pop concerts USA 2026 summer schedule', 'best K-pop fan events in USA 2026'] },
  { name: 'KCON Europe', startMonth: 9, startDay: 1, endMonth: 10, endDay: 15, leadTimeDays: 45, relevantNiches: ['K-Entertainment'], contentAngles: ['KCON Europe 2026 lineup schedule guide', 'K-pop concerts Europe 2026 tour dates cities', 'how to attend KCON Europe tips guide'] },
  { name: 'K-pop Spring Comeback Season', startMonth: 2, startDay: 1, endMonth: 4, endDay: 30, leadTimeDays: 60, relevantNiches: ['K-Entertainment'], contentAngles: ['spring comeback preview K-pop 2026', 'best K-pop comebacks spring ranked', 'new K-pop releases to watch'] },
  { name: 'K-pop Summer Comeback Season', startMonth: 6, startDay: 1, endMonth: 8, endDay: 31, leadTimeDays: 60, relevantNiches: ['K-Entertainment'], contentAngles: ['summer comeback season K-pop 2026', 'best K-pop summer releases ranked', 'K-pop festival season guide'] },
  { name: 'BIFF (Busan Film Festival)', startMonth: 10, startDay: 1, endMonth: 10, endDay: 12, leadTimeDays: 45, relevantNiches: ['K-Entertainment'], contentAngles: ['BIFF highlights', 'Korean cinema spotlight', 'best Korean films at BIFF'] },
  { name: 'Baeksang Arts Awards (TV)', startMonth: 4, startDay: 20, endMonth: 5, endDay: 10, leadTimeDays: 45, relevantNiches: ['K-Entertainment'], contentAngles: ['Baeksang Arts Awards TV category predictions 2026 K-drama', 'best K-drama nominees Baeksang 2026 guide', 'Baeksang best actress actor winner predictions K-drama 2026', 'how to watch Baeksang 2026 international fans'] },
  { name: 'Baeksang Arts Awards (Film)', startMonth: 4, startDay: 20, endMonth: 5, endDay: 10, leadTimeDays: 45, relevantNiches: ['K-Entertainment'], contentAngles: ['Baeksang Arts Awards film category predictions 2026 Korean movies', 'best Korean film nominees Baeksang 2026 guide', 'Baeksang best director film predictions 2026', 'Korean film awards Baeksang vs Blue Dragon vs Grand Bell comparison guide'] },
  // Amazon Prime Day — K-Beauty 국제 딜 폭발 시점 (7월 중순, 2일간)
  { name: 'Amazon Prime Day K-Beauty Deals', startMonth: 7, startDay: 10, endMonth: 7, endDay: 17, leadTimeDays: 45, relevantNiches: ['K-Beauty'], contentAngles: ['best K-beauty deals Amazon Prime Day 2026 ranked', 'K-beauty skincare Prime Day steals under $20 guide', 'COSRX Anua Numbuzin Prime Day discounts what to buy', 'Amazon Prime Day K-beauty haul guide must-buy products 2026'] },
  // Olive Young 메가세일 (2월) — 봄 그랜드세일과 별도, 연초 뷰티 쇼핑 시즌
  { name: 'Olive Young Mega Sale', startMonth: 2, startDay: 1, endMonth: 2, endDay: 20, leadTimeDays: 30, relevantNiches: ['K-Beauty'], contentAngles: ['Olive Young mega sale 2026 best picks ranked', 'best K-beauty products Olive Young February sale guide', 'Olive Young winter sale skincare essentials what to stock up', 'how to shop Olive Young mega sale internationally 2026'] },
  // Dano (단오, 음력 5월 5일) — 전통 뷰티 약초 앵글
  { name: 'Dano (단오)', startMonth: 5, startDay: 20, endMonth: 7, endDay: 5, leadTimeDays: 30, relevantNiches: ['K-Beauty', 'K-Entertainment'], contentAngles: ['Korean Dano traditional beauty rituals mugwort iris guide', 'best Korean mugwort skincare products Dano beauty tradition', 'Dano Korean holiday explained cultural significance guide'] },
  // Korean Summer Sales (쿠팡·올리브영 여름 세일)
  { name: 'Korean Summer Sales', startMonth: 7, startDay: 1, endMonth: 7, endDay: 31, leadTimeDays: 30, relevantNiches: ['K-Beauty'], contentAngles: ['best K-beauty summer sale deals 2026 guide', 'Korean sunscreen summer deals ranked what to buy', 'lightweight Korean moisturizer summer sale picks 2026'] },
  // WATERBOMB (워터밤) — K-pop 출연 워터 페스티벌, 6-7월 (서울·부산·대구)
  { name: 'WATERBOMB', startMonth: 6, startDay: 20, endMonth: 7, endDay: 20, leadTimeDays: 45, relevantNiches: ['K-Entertainment', 'K-Beauty'], contentAngles: ['WATERBOMB festival lineup schedule how to attend guide', 'K-pop idols performing at WATERBOMB what to expect', 'WATERBOMB makeup K-beauty waterproof skincare festival look', 'best waterproof Korean sunscreen for outdoor festival summer'] },
  // 서울뷰티위크 (Seoul Beauty Week) — K-Beauty 산업 축제 (6월)
  { name: 'Seoul Beauty Week', startMonth: 6, startDay: 10, endMonth: 6, endDay: 15, leadTimeDays: 30, relevantNiches: ['K-Beauty'], contentAngles: ['Seoul Beauty Week new product launches trend preview', 'K-beauty trends revealed at Seoul Beauty Week guide', 'best new Korean skincare products Seoul Beauty Week'] },
  // Olive Young Awards (올리브영 어워즈) — K-Beauty 최고 상품 시상 (12월 별도)
  { name: 'Olive Young Awards', startMonth: 12, startDay: 10, endMonth: 12, endDay: 20, leadTimeDays: 30, relevantNiches: ['K-Beauty'], contentAngles: ['Olive Young Awards winners best products ranked guide', 'Olive Young award-winning skincare products what to buy', 'best K-beauty products of the year Olive Young Awards recap'] },
  // 수능 (대학수학능력시험, CSAT) — 매년 11월 셋째 목요일, K-Entertainment 트래픽 스파이크 (아이돌 수능 응원·수능 후 K-Drama 몰아보기)
  { name: 'Suneung (Korean CSAT)', startMonth: 11, startDay: 13, endMonth: 11, endDay: 14, leadTimeDays: 30, relevantNiches: ['K-Entertainment'], contentAngles: ['K-pop idols Suneung encouragement messages fans guide 2026', 'best K-dramas to binge after Suneung exam stress relief ranked', 'K-pop idols who took Suneung while training exam stories explained', 'Suneung Korean college entrance exam explained for international fans guide'] },
  // Korea Sale Festa (코리아세일페스타) — 산업통상자원부 주관, 매년 10-11월 한국판 블랙프라이데이
  { name: 'Korea Sale Festa', startMonth: 10, startDay: 25, endMonth: 11, endDay: 15, leadTimeDays: 45, relevantNiches: ['K-Beauty'], contentAngles: ['Korea Sale Festa best K-beauty deals what to buy 2026 guide', 'Olive Young Korea Sale Festa discounts skincare must-buy list 2026', 'how to shop Korea Sale Festa internationally K-Beauty deals guide', 'Korea Sale Festa vs Black Friday which has better K-beauty deals comparison'] },
];

/** 콘텐츠 유형 */
export type ContentType = 'how-to' | 'best-x-for-y' | 'x-vs-y' | 'analysis' | 'deep-dive' | 'news-explainer' | 'listicle' | 'case-study' | 'product-review';

/** Content freshness classification — determines update frequency */
export type FreshnessClass = 'evergreen' | 'seasonal' | 'time-sensitive';

/** Map content types to freshness class for automatic content lifecycle management */
export const CONTENT_FRESHNESS_MAP: Record<ContentType, FreshnessClass> = {
  'how-to': 'evergreen',
  'deep-dive': 'evergreen',
  'case-study': 'evergreen',
  'best-x-for-y': 'seasonal',      // Rankings change, update quarterly
  'x-vs-y': 'seasonal',             // Specs/features change
  'analysis': 'seasonal',            // Data-driven, update quarterly
  'listicle': 'seasonal',            // Lists evolve
  'product-review': 'seasonal',
  'news-explainer': 'time-sensitive', // Decays fast, flag for archive after 6 months
};

/** Recommended update intervals in days per freshness class */
export const FRESHNESS_UPDATE_INTERVALS: Record<FreshnessClass, number> = {
  'evergreen': 180,       // Semi-annual review
  'seasonal': 60,         // Bi-monthly update
  'time-sensitive': 30,   // K-Entertainment comeback news expires in 30 days; archive/update promptly to avoid stale content
};

/** Author profile for E-E-A-T credibility signals */
export interface AuthorProfile {
  name: string;
  title: string;
  bio: string;
  expertise: string[];
  credentials: string[];
  /** Years of experience in the domain */
  yearsExperience: number;
}

/** Niche-specific author profiles for visible E-E-A-T bio sections (primary persona) */
export const NICHE_AUTHOR_PROFILES: Record<string, AuthorProfile> = {
  'K-Beauty': {
    name: 'Sophie Kim',
    title: 'K-Beauty & Skincare Specialist',
    bio: 'Seoul-based skincare researcher who has personally tested 500+ Korean beauty products and tracked MFDS functional cosmetic certifications since 2020. Analyzes Olive Young bestseller data, ingredient concentrations (active % and pH levels), and Korean dermatological research papers to provide evidence-based product recommendations.',
    expertise: ['Korean skincare formulations', 'K-beauty ingredient analysis', 'Olive Young product reviews', 'Korean sunscreen technology', 'Glass skin routines', 'MFDS functional cosmetic regulations'],
    credentials: ['Cosmetic Science Researcher', 'Korean Beauty Industry Analyst'],
    yearsExperience: 6,
  },
  'K-Entertainment': {
    name: 'Jamie Yoon',
    title: 'K-Pop & K-Drama Culture Writer',
    bio: 'Seoul-based Hallyu culture writer tracking Circle Chart, Hanteo, and Melon data daily. Has covered 30+ comeback seasons, attended MAMA and Melon Music Awards, and actively participates in fan communities on Weverse and X. Provides chart-backed analysis, award predictions, and fan-first content grounded in real community culture.',
    expertise: ['K-pop fandom culture', 'K-drama recommendations & rankings', 'Idol comeback news', 'Award show predictions (MAMA/MMA/GDA/SMA)', 'Circle Chart & Hanteo data analysis', 'Fan community & Hallyu culture'],
    credentials: ['Hallyu Culture Researcher', 'K-Entertainment Content Writer'],
    yearsExperience: 7,
  },
};

/** Multiple author personas per niche for voice rotation (academic, casual, enthusiast) */
export const NICHE_AUTHOR_PERSONAS: Record<string, AuthorProfile[]> = {
  'K-Beauty': [
    NICHE_AUTHOR_PROFILES['K-Beauty'],
    {
      name: 'Mia Cho',
      title: 'K-Beauty Product Tester',
      bio: 'Testing and reviewing Korean skincare products hands-on, with a focus on ingredient transparency, texture analysis, and real-world routine results. Sensitive skin perspective.',
      expertise: ['Product texture analysis', 'Sensitive skin routines', 'Olive Young hauls', 'Korean drugstore picks'],
      credentials: ['Certified Cosmetic Ingredient Reviewer', 'K-Beauty Content Creator'],
      yearsExperience: 5,
    },
    {
      name: 'Ella Park',
      title: 'K-Beauty Hair & Makeup Specialist',
      bio: 'Covering the full spectrum of Korean beauty — from viral makeup looks and K-pop idol beauty trends to hair loss treatments and scalp care innovations. Focused on products available on Amazon and Olive Young.',
      expertise: ['Korean makeup brands', 'K-pop idol makeup looks', 'Korean hair loss treatments', 'Scalp care', 'Korean nail art & gel stickers', 'Korean cosmetics on Amazon'],
      credentials: ['Korean Beauty Content Specialist', 'Makeup & Haircare Product Reviewer'],
      yearsExperience: 4,
    },
  ],
  'K-Entertainment': [
    NICHE_AUTHOR_PROFILES['K-Entertainment'],
    {
      name: 'Alex Han',
      title: 'K-Pop & Hallyu Culture Writer',
      bio: 'Exploring Korean pop culture through the lens of global fandom, concert economics, and digital content trends. Covering everything from comeback strategies to fan community dynamics.',
      expertise: ['K-pop fandom economics', 'Concert & tour analysis', 'Digital content trends', 'Fan community dynamics'],
      credentials: ['Hallyu Culture Researcher', 'Digital Media Analyst'],
      yearsExperience: 5,
    },
    {
      name: 'Sora Lee',
      title: 'K-Drama & Korean Cinema Critic',
      bio: 'Dedicated to Korean drama and film criticism for international audiences. Specializing in webtoon-to-screen adaptations, streaming platform guides, OST rankings, and breakout actor spotlights. Translating the nuances of Korean storytelling for global fans.',
      expertise: ['K-drama reviews & rankings', 'Webtoon adaptation analysis', 'K-drama OST rankings', 'Netflix & streaming platform guides', 'Korean film & cinema', 'Korean musical theater'],
      credentials: ['Korean Media Studies Researcher', 'K-Drama Content Specialist'],
      yearsExperience: 6,
    },
  ],
};

/** Content-type to persona voice mapping for automatic rotation.
 * K-Beauty override: skincare-focused content types use primary (Sophie Kim, ingredient science)
 * instead of tertiary (Ella Park, makeup/hair). Tertiary only for explicitly makeup/hair content.
 */
export const CONTENT_TYPE_PERSONA_MAP: Record<string, 'primary' | 'secondary' | 'tertiary'> = {
  'deep-dive': 'primary',
  'analysis': 'primary',
  'case-study': 'primary',
  'news-explainer': 'primary',
  'how-to': 'secondary',      // K-Beauty: Mia Cho (hands-on routine how-to); K-Entertainment: Alex Han (fan how-to)
  'listicle': 'secondary',
  'best-x-for-y': 'primary',  // K-Beauty: Sophie Kim (ingredient-based product ranking); K-Entertainment: primary (data-driven ranking)
  'x-vs-y': 'primary',        // K-Beauty: Sophie Kim (ingredient/formulation comparison); K-Entertainment: primary (group/drama analysis)
  'product-review': 'secondary', // K-Beauty: Mia Cho (hands-on product testing); K-Entertainment: secondary (content review)
};

/** Niche-specific persona override: when keyword matches these patterns, force tertiary (Ella Park for K-Beauty makeup/hair) */
export const KBEAUTY_TERTIARY_KEYWORDS = /\b(?:makeup|mascara|eyeliner|eyeshadow|foundation|cushion|lip\s*tint|blush|contour|hair\s*(?:loss|care|shampoo|dye)|scalp|wig|nail\s*(?:art|gel|sticker|polish)|press[- ]on\s*nail|manicure)\b/i;

/** 니치 설정 */
export interface NicheConfig {
  id: string;
  name: string;
  category: string;
  /** Broad 1-2 word term used for Google Trends rising query discovery */
  broadTerm: string;
  /** Fallback seed keywords used when Trends API returns no rising queries */
  seedKeywords: string[];
  contentTypes: ContentType[];
  /** AdSense RPM tier for niche-specific ad density tuning */
  adSenseRpm?: 'high' | 'medium' | 'low';
  /** Dynamic RPM value learned from GA4 (overrides static tier) */
  dynamicRpmValue?: number;
  /** Whether this niche is enabled (default true) */
  enabled?: boolean;
  /** Pillar topics for internal link hub structure — each topic becomes a comprehensive guide page */
  pillarTopics?: string[];
}

/** Per-category optimal publish timing (override GA4 when no data available) */
export const CATEGORY_PUBLISH_TIMING: Record<string, { optimalHour: number; bestDays: number[] }> = {
  'K-Beauty': { optimalHour: 10, bestDays: [2, 3, 5, 6, 0] },     // Tue-Wed (informational/how-to) + Fri-Sun (shopping/reviews)
  'K-Entertainment': { optimalHour: 9, bestDays: [4, 5, 6] },     // Thu-Sat KST morning = Wed-Fri EST evening (global fan prime time)
};

/** Niche-specific disclaimer templates for legal compliance */
export const NICHE_DISCLAIMERS: Record<string, string> = {
  'K-Beauty': '<div class="ab-disclaimer-beauty" style="margin:0 0 24px 0; padding:16px 20px; background:#f0fff4; border:1px solid #c6f6d5; border-radius:8px; font-size:13px; color:#666; line-height:1.6;"><strong>Skincare Disclaimer:</strong> Product recommendations are based on research and editorial analysis. Individual results may vary. Always patch-test new products and consult a dermatologist for specific skin concerns. This content is not medical advice.</div>',
  'K-Entertainment': '<div class="ab-disclaimer-entertainment" style="margin:0 0 24px 0; padding:16px 20px; background:#f0f4ff; border:1px solid #c6d6f6; border-radius:8px; font-size:13px; color:#666; line-height:1.6;"><strong>Entertainment Disclaimer:</strong> Schedule, comeback, and project information is based on publicly available sources and may change without notice. This content represents editorial analysis and fan perspective, not official announcements from artists or agencies.</div>',
};

/** Search intent to valid content type mapping for enforcement */
export const INTENT_CONTENT_TYPE_MAP: Record<string, string[]> = {
  'transactional': ['product-review', 'best-x-for-y', 'how-to'],
  'commercial': ['best-x-for-y', 'x-vs-y', 'product-review', 'listicle', 'analysis'],
  'commercial-investigation': ['x-vs-y', 'best-x-for-y', 'product-review', 'analysis', 'listicle', 'deep-dive'],
  'informational': ['how-to', 'deep-dive', 'analysis', 'news-explainer', 'case-study', 'listicle'],
  'navigational': ['deep-dive', 'news-explainer', 'how-to'],
};

/** Google Trends rising query entry */
export interface RisingQuery {
  query: string;
  /** Growth percentage or "Breakout" (5000%+) */
  value: number | 'Breakout';
}

/** Google Trends API 결과 */
export interface TrendsData {
  keyword: string;
  interestOverTime: number[];
  relatedTopics: string[];
  relatedQueries: string[];
  averageInterest: number;
  trendDirection: 'rising' | 'stable' | 'declining';
  hasBreakout: boolean;
}

/** Claude 키워드 분석 결과 */
export interface KeywordAnalysis {
  selectedKeyword: string;
  contentType: ContentType;
  suggestedTitle: string;
  uniqueAngle: string;
  searchIntent: 'informational' | 'commercial' | 'commercial-investigation' | 'transactional' | 'navigational';
  estimatedCompetition: 'low' | 'medium' | 'high';
  /** Keyword difficulty score 0-100 (estimated from SERP signals + trend data) */
  keywordDifficulty?: number;
  /** Estimated monthly search volume tier */
  volumeEstimate?: 'high' | 'medium' | 'low' | 'minimal';
  /** Estimated monthly search volume number (rough estimate from Trends data) */
  estimatedMonthlySearches?: number;
  reasoning: string;
  relatedKeywordsToInclude: string[];
  /** Long-tail keyword variants for satellite content strategy */
  longTailVariants?: string[];
}

/** 최종 키워드 리서치 결과 */
export interface ResearchedKeyword {
  niche: NicheConfig;
  trendsData: TrendsData[];
  analysis: KeywordAnalysis;
}

/** Claude API가 생성한 블로그 콘텐츠 */
export interface BlogContent {
  title: string;
  slug?: string;
  html: string;
  excerpt: string;
  tags: string[];
  category: string;
  imagePrompts: string[];
  imageCaptions: string[];
  /** Content quality score (0-100) from post-generation validation */
  qualityScore?: number;
  /** SEO-optimized meta description (separate from excerpt, 145-158 chars) */
  metaDescription?: string;
  /** Alternative title candidates for A/B testing (2-3 options) */
  titleCandidates?: string[];
  /** CTR-optimized meta description (benefit + keyword + CTA, 145-158 chars) */
  ctrMetaDescription?: string;
  /** Number of affiliate links detected in content */
  affiliateLinksCount?: number;
  /** Search intent from keyword research */
  searchIntent?: 'informational' | 'commercial' | 'commercial-investigation' | 'transactional' | 'navigational';
  /** FAQ items extracted from content for FAQ JSON-LD schema */
  faqItems?: Array<{ question: string; answer: string }>;
  /** HowTo steps extracted from content for HowTo JSON-LD schema */
  howToSteps?: Array<{ name: string; text: string }>;
  /** YouTube video URL to embed in the post */
  youtubeVideoUrl?: string;
  /** YouTube video title for Video schema */
  youtubeVideoTitle?: string;
  /** Whether this is an original research/survey-based post */
  isOriginalResearch?: boolean;
  /** Lead magnet CTA text injected in content */
  leadMagnetCta?: string;
  /** Poll question for engagement (generated by Claude) */
  pollQuestion?: { question: string; options: string[] };
  /** Product mentions for affiliate link injection */
  productMentions?: Array<{ name: string; category: string }>;
  /** Shorter social-optimized title for OG/Facebook (max 50 chars) */
  ogTitle?: string;
}

/** WordPress 미디어 업로드 결과 */
export interface MediaUploadResult {
  mediaId: number;
  sourceUrl: string;
}

/** Gemini API가 생성한 이미지 결과 */
export interface ImageResult {
  featured: Buffer;
  inline: Buffer[];
}

/** WordPress에 발행된 포스트 정보 */
export interface PublishedPost {
  postId: number;
  url: string;
  slug?: string;
  title: string;
  featuredImageId: number;
}

/** 내부 링크용 기존 포스트 정보 */
export interface ExistingPost {
  title: string;
  url: string;
  category: string;
  /** Primary keyword for better anchor text generation */
  keyword?: string;
  /** Post slug for context */
  slug?: string;
  /** WordPress post ID for update targeting */
  postId?: number;
  /** Original publish date ISO string */
  publishedAt?: string;
  /** Sub-niche ID for topic cluster linking */
  subNiche?: string;
}

/** GA4 performance data for feedback loop */
export interface PostPerformance {
  url: string;
  pageviews: number;
  avgEngagementTime: number;
  bounceRate: number;
  keyword?: string;
  category?: string;
}

/** 포스팅 이력 (중복 방지용) */
export interface PostHistoryEntry {
  keyword: string;
  postId: number;
  postUrl: string;
  publishedAt: string;
  niche?: string;
  contentType?: ContentType;
  engagementScore?: number;
  /** Estimated RPM for this post (from GA4 pageviews × niche RPM) */
  estimatedRpm?: number;
  /** Estimated monthly revenue for this post */
  estimatedRevenue?: number;
  /** Number of affiliate links in the post (for ROI tracking) */
  affiliateLinkCount?: number;
  /** A/B title candidates for testing */
  titleCandidates?: string[];
  /** Whether A/B title test has been resolved */
  titleTestResolved?: boolean;
  /** Winning title variant from A/B test (for learning) */
  titleTestWinner?: string;
  /** A/B rotation Phase A CTR (recorded at day 3) */
  titleTestPhaseACtr?: number;
  /** A/B rotation Phase A title text */
  titleTestPhaseATitle?: string;
  /** Whether Phase B (alternative title) rotation has started */
  titleTestPhaseBStarted?: boolean;
  /** A/B rotation Phase B title text */
  titleTestPhaseBTitle?: string;
  /** A/B rotation Phase B CTR (recorded at day 6) */
  titleTestPhaseBCtr?: number;
  /** Original post title (for A/B test revert) */
  originalTitle?: string;
  /** Series ID for multi-part content (e.g., "korean-stocks-101") */
  seriesId?: string;
  /** Part number within a series */
  seriesPart?: number;
  /** Keyword position tracking history (date → position) */
  rankingHistory?: Array<{ date: string; position: number; clicks: number; impressions: number }>;
  /** Last known keyword ranking position */
  lastPosition?: number;
  /** Title pattern classification for CTR analysis */
  titlePattern?: string;
  /** Korean version post URL (hreflang sync) */
  koreanPostUrl?: string;
  /** Last time this post was refreshed/rewritten */
  lastRefreshedAt?: string;
  /** Last modified date for content freshness signal (visible to users + JSON-LD dateModified) */
  lastModifiedDate?: string;
  /** A/B test excerpt variants */
  excerptCandidates?: string[];
  /** A/B test: active excerpt variant index */
  activeExcerptVariant?: number;
  /** Search intent classification for funnel stage mapping */
  searchIntent?: string;
  /** Featured image URL for performance tracking and reuse */
  featuredImageUrl?: string;
  /** Featured image WordPress media ID */
  featuredImageMediaId?: number;
  /** Content quality score from validator (0-100+) */
  qualityScore?: number;
}

/** Ranking milestone event for Telegram alerts */
export interface RankingMilestone {
  keyword: string;
  postUrl: string;
  event: 'hit-top1' | 'hit-top3' | 'hit-top10' | 'dropped-from-top10';
  previousPosition: number;
  currentPosition: number;
}

/** Featured snippet opportunity from GSC */
export interface FeaturedSnippetOpportunity {
  query: string;
  position: number;
  impressions: number;
  ctr: number;
  /** Type of snippet to target */
  snippetType: 'paragraph' | 'list' | 'table';
}

/** Dynamic RPM data learned from GA4 */
export interface DynamicRpmData {
  category: string;
  contentType?: string;
  rpm: number;
  sampleSize: number;
  lastUpdated: string;
  /** Actual AdSense revenue from GA4 (for RPM feedback loop) */
  actualRevenue?: number;
  /** Actual pageviews from GA4 (for RPM calculation) */
  pageviews?: number;
}

/** 전체 포스팅 이력 파일 구조 */
export interface PostHistoryData {
  entries: PostHistoryEntry[];
  lastRunAt: string;
  totalPosts: number;
  categoryLastPublished?: Record<string, string>;
  /** Learned RPM data from GA4 (updated monthly) */
  dynamicRpm?: DynamicRpmData[];
}

/** 개별 포스트 처리 결과 */
export interface PostResult {
  keyword: string;
  niche: string;
  success: boolean;
  postId?: number;
  postUrl?: string;
  error?: string;
  duration: number;
}

/** Topic cluster mapping for explicit pillar-supporting relationship tracking */
export interface TopicCluster {
  /** Unique cluster identifier (e.g., niche id or topic slug) */
  clusterId: string;
  /** WordPress post ID of the pillar page */
  pillarPostId?: number;
  /** WordPress post IDs of supporting (satellite) posts */
  supportingPostIds: number[];
  /** Niche category this cluster belongs to */
  category: string;
  /** Sub-topics covered by supporting posts */
  coveredSubTopics: string[];
  /** Last time cluster was analyzed */
  lastAnalyzed?: string;
}

/** 배치 실행 전체 결과 */
export interface BatchResult {
  startedAt: string;
  completedAt: string;
  totalKeywords: number;
  successCount: number;
  failureCount: number;
  skippedCount: number;
  results: PostResult[];
}
