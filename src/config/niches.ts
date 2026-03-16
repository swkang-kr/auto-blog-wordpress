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
    // NOTE: 현충일(Memorial Day, June 6) is NOT a K-Entertainment event — removed from mapping
    'Dano': ['K-Entertainment'],
    'Summer Sales': ['K-Beauty'],
    'Mid-Year': ['K-Beauty'],
    'Black Friday': ['K-Beauty'],
    'Singles Day': ['K-Beauty'],
    'Amazon Prime Day': ['K-Beauty'],
    'Olive Young Mega Sale': ['K-Beauty'],
    'Korean Summer Sales': ['K-Beauty'],
    'Christmas': ['K-Beauty', 'K-Entertainment'],
    'New Year': ['K-Entertainment', 'K-Beauty'],
    'WATERBOMB': ['K-Entertainment', 'K-Beauty'],
    'Seoul Beauty Week': ['K-Beauty'],
    'Olive Young Awards': ['K-Beauty'],
    'K-Beauty Awards': ['K-Beauty'],
    'Olive Young Spring Grand Sale': ['K-Beauty'],
    'Olive Young Fall Grand Sale': ['K-Beauty'],
    'BTS Debut Anniversary': ['K-Entertainment', 'K-Beauty'],
    'Circle Chart': ['K-Entertainment'],
    'Year-End K-Drama Awards': ['K-Entertainment'],
    'Gayo Daejun': ['K-Entertainment'],
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
      // NOTE: NewJeans — 2025년 12월 어도어 독립 확정, 독립 아티스트로 활동 중 (2026).
      //       콘텐츠 작성 시: 2025년 소속사 분쟁 내러티브 지양 (해결 완료), 독립 활동·뷰티 룩·제품 중심 작성.
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
      'Olive Young vs YesStyle vs Stylevana where to buy Korean beauty 2026',
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
      // Bakuchiol — 레티놀 대체 K-Beauty 성분, 민감성·임산부 피부 세그먼트 급성장
      'best Korean bakuchiol serum retinol alternative sensitive skin 2026',
      'bakuchiol vs retinol Korean skincare which is better for beginners',
      // Polyglutamic acid (PGA) — 히알루론산보다 강력한 수분 결합, 2025-2026 신흥 성분
      'polyglutamic acid Korean skincare products best serums ranked 2026',
      'polyglutamic acid vs hyaluronic acid Korean serum comparison guide',
      // Adenosine — 식약처 공인 주름개선 고시 성분, K-Beauty 차별점
      'best Korean adenosine anti-wrinkle serum products ranked 2026',
      // d'Alba (달바) — Olive Young 글로벌 탑 5 베스트셀러 브랜드 (화이트 트러플)
      'd\'Alba white truffle serum review before after results glow',
      'd\'Alba peptide firming serum review vs COSRX comparison 2026',
      'best d\'Alba products ranked Olive Young bestsellers guide 2026',
      // VT Cosmetics (비티) — 씨카 라인 + K팝 콜라보 브랜드
      'VT Cosmetics CICA products review best for sensitive skin 2026',
      'VT Cosmetics vs COSRX which is better for sensitive acne skin',
      // Glutathione — 2024-2026 최대 브라이트닝 트렌드 (Olive Young 폭발적 성장)
      'best Korean glutathione serum for brightening dark spots 2026',
      'Korean glutathione skincare products Olive Young ranked 2026',
      'glutathione vs tranexamic acid Korean brightening serum comparison',
      // Mugwort (쑥) — 한국 전통 식물 성분, 민감성 피부 특화
      'best Korean mugwort skincare products for sensitive skin 2026',
      'innisfree mugwort essence review calming skin guide 2026',
      'mugwort vs centella asiatica which Korean botanical is better',
      // Dr.Jart+ (닥터자르트) — Sephora 글로벌 유통, Cicapair 최강 브랜드
      'Dr.Jart+ Cicapair Tiger Grass review before after results 2026',
      'Dr.Jart+ vs SKIN1004 centella products comparison review 2026',
      // PURITO — 선크림·센텔라 전문, Amazon 급성장 브랜드 (2025-2026)
      // NOTE: 무향 제품 라인업이 민감성·성분 덕후 커뮤니티(Reddit r/AsianBeauty) 최상위 추천
      'PURITO centella green level recovery cream review sensitive skin',
      'PURITO unscented sunscreen SPF50 review no white cast comparison 2026',
      'PURITO vs Beauty of Joseon sunscreen which is better 2026',
      // Jumiso — 성분 투명성 전문 브랜드, 글로벌 인디 K-Beauty 커뮤니티 인기
      'Jumiso cheek and fix vitamin C serum review brightening before after',
      'Jumiso hello skin plump serum review hyaluronic acid comparison 2026',
      // 임신 중 안전한 스킨케어 — 고전환 미개척 세그먼트 (bakuchiol·PHA·niacinamide 중심)
      // NOTE: 효능 과장 금지, "consult your healthcare provider" 고지 필수
      'best Korean pregnancy-safe skincare routine products 2026 guide',
      'Korean skincare safe during pregnancy bakuchiol retinol alternative guide',
      'best Korean sunscreen safe for pregnancy SPF guide 2026',
      // 다크스킨/멜라닌 피부 K-Beauty — 동남아·아프리카·남미 팬 폭발적 증가 (Amazon 전환율 최고)
      // NOTE: 피부색 표현 시 중립적·존중적 언어 사용 필수 (예: "deeper skin tones", "melanin-rich skin")
      'K-beauty skincare routine for dark skin tones guide 2026 what actually works',
      'best Korean brightening products for dark skin hyperpigmentation 2026',
      'Korean sunscreen for dark skin tones no white cast ranked 2026',
      'best Korean vitamin C serum for dark skin hyperpigmentation before after',
      // Olive Young 앱·국제직구 가이드 — 에버그린 고수요 (Reddit r/AsianBeauty 상위 질문)
      'how to use Olive Young app in English international shopping guide 2026',
      'Olive Young membership rewards points guide for international shoppers 2026',
      // I'm From (아임프롬) — 자연 원료 특화, 쌀·꿀·석류 라인, Amazon 급성장 인디 브랜드
      'I\'m From rice toner review before after brightening results for sensitive skin',
      'I\'m From honey mask review hydration glow results vs other sheet masks',
      // Rovectin — 피부과 기반 민감성 전문, Reddit r/AsianBeauty 최상위 추천
      'Rovectin skin essentials barrier repair cream review sensitive skin 2026',
      'Rovectin vs COSRX which barrier cream is better for sensitive skin 2026',
      // Cos De BAHA — 성분 집중 최저가 포지셔닝, Amazon K-Beauty 성분덕후 최애
      'Cos De BAHA niacinamide serum review vs COSRX which is better 2026',
      'Cos De BAHA vs The Ordinary which is better for K-Beauty ingredients 2026',
      // Skin&Lab — 비타민C·레티놀 전문 브랜드, 글로벌 확장 중
      'Skin&Lab Dr Color Effect vitamin C serum review brightening results 2026',
      // Klavuu — 진주/마린 콜라겐 특화, 감성 패키징으로 SNS 강세
      'Klavuu white pearlsation marine collagen cream review glass skin results',
      // 스킨말리즘(Skinmalism) — 미니멀 스킨케어 + 자연 피부 표현 글로벌 트렌드
      'skinmalism Korean skincare minimalist routine skin tint guide 2026',
      'best Korean products for skinmalism no-makeup makeup look ranked 2026',
      // 유리 입술(Glass Lip) — 글라스 스킨 다음 단계, 립 케어 루틴 급성장
      'Korean glass lip trend how to get it routine products step by step 2026',
      'best Korean lip balm sleeping mask for glass lip look ranked 2026',
      // 한국 두피 케어 — 샴푸 넘어 두피 앰플·스케일러, Amazon 신규 카테고리 폭발
      'best Korean scalp care serum ampoule for hair growth thinning 2026 ranked',
      'Korean scalp scaler how to use guide for hair health oil buildup removal',
      'best Korean scalp treatment for dandruff sebum control 2026 guide',
      // 인캡슐레이티드 레티놀 — 자극 없는 캡슐형 레티놀, 한국 브랜드 기술 차별점
      'encapsulated retinol Korean skincare guide best products for beginners 2026',
      'Korean encapsulated retinol vs regular retinol which is gentler comparison 2026',
      // ── Tier 1 K-Beauty 브랜드 — 글로벌 인지도 최상위, 시드 키워드 누락 보완 ──
      // Innisfree (이니스프리) — 아모레퍼시픽, 제주 자연 원료, 그린티 라인 대표
      'Innisfree green tea seed serum review before after results 2026',
      'Innisfree vs innisfree retinol cica best products ranked 2026',
      // Laneige (라네즈) — 아모레퍼시픽, 립 슬리핑 마스크 글로벌 베스트셀러
      'Laneige water sleeping mask review vs lip sleeping mask which is better',
      'Laneige lip sleeping mask all flavors ranked review 2026',
      // MISSHA (미샤) — BB 크림 원조, 가성비 한류 뷰티 대표
      'MISSHA M Perfect Cover BB cream review shades comparison 2026',
      'MISSHA Time Revolution essence review vs SK-II dupe comparison',
      // Etude House (에뛰드하우스) — 아모레퍼시픽, 메이크업 특화, Z세대 타겟
      'Etude House best products ranked makeup skincare 2026 guide',
      'Etude House fixing tint review best lip shades swatches 2026',
      // Tony Moly (토니모리) — 캐릭터 패키징, Banana Hand Milk 상징
      'Tony Moly best products ranked skincare 2026 what to buy',
      'Tony Moly vs Innisfree which K-beauty brand is better for beginners',
      // Holika Holika (홀리카 홀리카) — 자연주의 + 캐릭터, Aloe 라인 강세
      'Holika Holika aloe soothing gel review best products ranked 2026',
      // ── 2025-2026 신흥 K-Beauty 트렌드 키워드 ──
      // 살몬 DNA 크림 — PDRN/연어 DNA 성분, 재생·안티에이징 한국 트렌드 폭발
      'Korean salmon DNA PDRN cream serum review best products ranked 2026',
      'PDRN skincare Korean trend explained what is salmon DNA cream guide',
      // 비건 K-Beauty — 글로벌 수요 급증, Z세대 핵심 구매 동인
      'best vegan Korean skincare products cruelty-free ranked 2026',
      'vegan K-beauty brands certified guide what to look for 2026',
      // 워터리스 포뮬레이션 — 농축 활성 성분, 친환경 트렌드
      'waterless Korean skincare products concentrated formulas ranked 2026',
      // 업사이클 성분 — 지속가능성 K-Beauty 차별화
      'upcycled ingredient Korean skincare sustainable beauty trend 2026',
      // 선패드 (Sun Pad) — 2025-2026 최대 신규 카테고리, 토너패드 형식 자외선 차단
      'best Korean sunscreen pad sun pad SPF for reapplication ranked 2026',
      'Korean sun pad vs sunscreen stick which is better for reapplication guide',
      // 립 오일/세럼 — 글라스 립 이후 립 케어 급성장 세그먼트
      'best Korean lip oil for glass lip look ranked 2026',
      'best Korean lip serum treatment for dry cracked lips 2026 guide',
      // ma:nyo (마녀공장) — 비피다 바이옴 라인 + 퓨어 클렌징 오일 베스트셀러
      'ma:nyo bifida biome ampoule review before after results sensitive skin',
      'ma:nyo pure cleansing oil review best Korean oil cleanser comparison 2026',
      // NACIFIC (나시픽) — 파이토 나이아신 라인, Amazon K-Beauty 급성장 브랜드
      'NACIFIC phyto niacin whitening essence review brightening results 2026',
      'NACIFIC vs COSRX which niacinamide product is better comparison review',
      // BENTON — 센텔라+프로폴리스 전문, 민감성 피부 커뮤니티 최상위 추천
      'Benton snail bee high content essence review before after results 2026',
      'Benton centella propolis gel review sensitive acne skin guide',
      // AMPLE:N — 펩타이드 전문 브랜드, 가성비 안티에이징
      'AMPLE:N peptide shot ampoule review anti-aging results before after 2026',
      // ILLIYOON (일리윤) — 아모레퍼시픽 더마 브랜드, Ato 세라마이드 크림 올리브영 베스트셀러
      'Illiyoon ceramide ato concentrate cream review eczema sensitive skin 2026',
      'Illiyoon vs COSRX ceramide cream which is better for damaged skin barrier',
      // 한국 피부과 추천 제품 — Reddit/TikTok 최대 트렌드 (피부과 전문의 권위)
      'Korean dermatologist recommended skincare products 2026 ranked guide',
      'what Korean dermatologists actually use for their own skin routine 2026',
      'Korean dermatologist anti-aging skincare routine products guide 2026',
      // K-Beauty 구독 박스 — 어필리에이트 기회 + 입문자 허들 해소
      'best K-beauty subscription box 2026 FaceTory Bomibox compared ranked',
      'K-beauty subscription box review which is worth it for beginners 2026',
      // 쿠팡 vs 올리브영 국제직구 비교 — 기존에 올리브영 vs YesStyle만 있었음
      'Coupang vs Olive Young which is better for buying Korean skincare 2026',
      'how to buy Korean skincare on Coupang internationally shipping guide',
      // K-Beauty for Teens — 성장 세그먼트 (순한 성분, 여드름 관리)
      'best Korean skincare for teenagers teens acne gentle routine 2026',
      'Korean skincare routine for teens beginners gentle products guide 2026',
      'best Korean acne patches pimple patches for teens ranked 2026',
      // ── 한방(Hanbang) & 프리미엄 K-Beauty — 고가 어필리에이트 + 럭셔리 세그먼트 ──
      // Sulwhasoo (설화수) — 아모레퍼시픽 최고급 한방 브랜드, 글로벌 프레스티지 라인
      'Sulwhasoo First Care Activating Serum review before after results 2026',
      'Sulwhasoo vs La Mer which luxury skincare brand is worth it comparison',
      'best Sulwhasoo products ranked for anti-aging Korean luxury skincare guide',
      // History of Whoo (더 후) — LG생활건강 한방 궁중 화장품, 아시아 면세점 1위 뷰티 브랜드
      'History of Whoo review is Korean luxury skincare worth the price 2026',
      'History of Whoo vs Sulwhasoo which Korean luxury brand is better comparison',
      // AmorePacific (아모레퍼시픽 브랜드 라인) — 녹차 원료, 미니멀 럭셔리
      'AmorePacific Treatment Enzyme Peel review luxury Korean exfoliation guide',
      // 한방(Hanbang) 스킨케어 — 전통 한의학 성분 기반, K-Beauty 고유 차별점
      'what is Hanbang Korean herbal skincare traditional ingredients explained guide',
      'best Korean Hanbang skincare products ginseng lotus herbal ranked 2026',
      // OHUI (오휘) — LG생활건강 프리미엄 사이언스 라인, 글로벌 확장 중
      'O HUI miracle moisture cream review Korean luxury moisturizer 2026',
      // 시카(Cica) — 센텔라 마케팅 용어, K-Beauty에서 독립 카테고리화
      'what is cica skincare Korean centella products explained guide 2026',
      'best Korean cica cream for sensitive skin redness calming ranked 2026',
      // PDRN — 2026 최대 신흥 성분, 살몬 DNA 넘어 리제너레이션 포커스
      'best Korean PDRN serum cream for skin regeneration anti-aging ranked 2026',
      'PDRN vs EGF vs peptide which Korean anti-aging ingredient is best comparison',
      // 마데카소사이드 — 센텔라 파생 개별 성분, 기능성 화장품 고시 원료
      'madecassoside vs centella asiatica Korean skincare which is better explained guide',
      // ── 전문가 감사 추가 (2026-03-16): 누락된 트렌드 세그먼트 보완 ──
      // Barrier cream as primer — 시카/세라마이드 크림을 메이크업 프라이머로 사용하는 트렌드 (2025-2026 TikTok 바이럴)
      'barrier cream as primer Korean skincare makeup base trend 2026 guide',
      'best Korean barrier cream for makeup primer sensitive skin 2026',
      // Peptide stacking — 다중 펩타이드 레이어링, 구리 펩타이드·마트릭실·아르지렐린 조합
      'peptide stacking Korean skincare how to layer multiple peptides guide 2026',
      'copper peptide vs matrixyl vs argireline Korean serum comparison 2026',
      // Perioral dermatitis — K-Beauty 커뮤니티 급상승 검색어, 입주위 피부염 관리
      'Korean skincare for perioral dermatitis gentle routine products 2026 guide',
      'best Korean products safe for perioral dermatitis fungal acne 2026',
      // Centella sun stick / cushion sunscreen — 2025-2026 선케어 포맷 혁신
      'best Korean centella sun stick SPF for sensitive skin reapplication 2026',
      'Korean cushion sunscreen compact SPF review best for on the go 2026',
      'centella sun stick vs cushion sunscreen which Korean SPF format is better',
      // Tone-up cream (톤업크림) — 한국 선크림 #1 검색어, 별도 키워드 보강
      'best Korean tone up cream for bright skin no white cast ranked 2026',
      'tone up sunscreen vs regular sunscreen Korean SPF difference explained guide',
      // 피부과 시술 + 홈케어 조합 — K-Beauty 핵심 차별점 (YMYL 주의: 의료 조언 제공 금지)
      // NOTE: 시술 자체를 추천하지 말 것. "시술 후 홈케어 루틴" 앵글로만 작성, "consult your dermatologist" 필수
      'Korean skincare routine after laser treatment post-procedure homecare guide 2026',
      'best Korean products after chemical peel gentle recovery skincare 2026',
      'post-botox skincare routine Korean products what to use and avoid guide',
      // LED 마스크 — 홈케어 뷰티 디바이스 최대 시장, 셀리턴/CurrentBody/CELLRETURN
      'best Korean LED face mask device for anti-aging acne home treatment 2026',
      'Korean LED mask vs professional treatment is it worth it comparison guide',
      'CELLRETURN LED mask review vs CurrentBody which is better 2026',
      // 레티날 (Retinaldehyde) — 레티놀보다 강력하지만 처방전 불필요, K-Beauty 차별화 성분
      'best Korean retinal retinaldehyde serum products for anti-aging ranked 2026',
      'retinal vs retinol Korean skincare which is better explained guide comparison',
      // BANILA CO — 클렌징 밤 카테고리 리더, Clean It Zero 글로벌 베스트셀러
      'BANILA CO Clean It Zero review best cleansing balm comparison 2026',
      'BANILA CO vs Heimish cleansing balm which is better for double cleansing',
      // Heimish (헤이미쉬) — 올리브영 클렌징 밤 강자, 자연주의 포지셔닝
      'Heimish All Clean balm review sensitive skin double cleansing guide 2026',
      // Hince (힌스) — 프리미엄 미니멀 K-Beauty 메이크업, 성수 팝업 강세
      'Hince Korean makeup brand review best products lip cheek ranked 2026',
      'Hince vs rom&nd Korean makeup comparison which brand is better 2026',
      // 마이크로커런트 디바이스 — NuFACE/BEAR 대항마 한국 브랜드 등장
      'best Korean microcurrent device for face lifting toning home use 2026',
      // K-Beauty 성분 사전 — 에버그린 고트래픽 (성분 검색 허브 페이지)
      'Korean skincare ingredients guide complete dictionary A to Z explained 2026',
      // "Brightening" vs "Whitening" — 글로벌 독자 교육 콘텐츠 (고 E-E-A-T)
      'Korean brightening skincare vs whitening what is the difference explained guide',
      // ── 전문가 감사 추가 (2026-03-16 batch 12): 누락 트렌드·비교·가격 세그먼트 ──
      // Glass Body — 글라스 스킨의 바디 케어 확장, 2026 최대 성장 트렌드
      'glass body Korean skincare routine body brightening exfoliation 2026 guide',
      'how to achieve glass body skin Italian towel Korean body products guide',
      'best Korean body brightening products serum lotion for glass body 2026',
      // Skinmalism 확장 — 2026 글로벌 미니멀 스킨케어 트렌드 추가 키워드
      'K-beauty skinmalism vs 10-step routine which is trending 2026 guide',
      'skinmalism Korean serums which actives do you actually need minimal routine 2026',
      'how to transition from 10-step skincare to skinmalism minimal routine guide 2026',
      // Dupes — 가격대 명시 키워드 (budget $30 이하 vs luxury $100+)
      'budget Korean skincare dupes under 30 dollars for Tatcha La Mer Drunk Elephant 2026',
      'affordable Korean skincare alternatives to luxury brands ranked by price 2026',
      // Adenosine vs Retinol — MFDS 기능성 차별점 활용 비교
      'adenosine vs retinol Korean anti-wrinkle serum which is better for beginners 2026',
      // Niacinamide 농도별 비교 — 성분 덕후 타겟
      'high concentration niacinamide Korean serums 5 to 10 percent comparison ranked 2026',
      // Amazon vs Olive Young 가격 비교 — 어필리에이트 전환율 키워드
      'Korean beauty products cheaper Olive Young vs Amazon price comparison 2026 guide',
      'best K-beauty Amazon Prime Day deals COSRX Anua ranked 2026',
      // Hyaluronic acid 분자량 — Torriden DIVE-IN 특화
      'Korean hyaluronic acid five molecular weights Torriden DIVE-IN serum ranked 2026',
      // PA 등급 교육 — 글로벌 독자 필수 정보
      'Korean sunscreen PA rating explained PA+ to PA++++ what it means guide',
      // ── 전문가 감사 추가 (2026-03-16 batch 14): 누락된 K-Beauty 세그먼트 ──
      // Glow Recipe (글로우레시피) — 한국계 미국 브랜드, Sephora K-Beauty 검색 #1
      'Glow Recipe best products ranked watermelon dew drops review 2026',
      'Glow Recipe vs Korean skincare brands which is real K-Beauty comparison guide',
      'is Glow Recipe actually Korean skincare explained brand origin guide',
      // Azelaic acid (아젤라산) — 로사시아+여드름 겸용, 2025-2026 급성장 성분
      'best Korean azelaic acid products for rosacea acne prone skin 2026',
      'azelaic acid vs niacinamide Korean skincare which is better for redness 2026',
      // 프로바이오틱스 클렌저 — 마이크로바이옴 카테고리 확장 (기존 토너/세럼만 커버)
      'best Korean probiotic cleanser for sensitive microbiome skincare 2026',
      'Korean microbiome cleanser vs regular cleanser what is the difference guide',
      // K-Beauty 미국 대형 리테일 진출 — "where to buy" 검색 폭발
      'best Korean skincare at Target what to buy K-Beauty guide 2026',
      'Korean skincare at Costco best deals bulk K-Beauty products ranked 2026',
      'K-Beauty at TJ Maxx Marshalls hidden deals what to look for guide 2026',
      'where to buy Korean skincare in the US complete store guide 2026',
      // 남성 K-Beauty — 성장 중인 서브니치 (기존 남성 키워드 보강)
      'Korean skincare routine for men beginners step by step guide 2026',
      'K-beauty for men complete skincare guide what products to use 2026',
      'Korean men grooming skincare essentials what to buy 2026 guide',
      'Korean sunscreen for men no white cast lightweight best ranked 2026',
      'Korean toner for men best picks oily combination skin 2026 ranked',
      // 아이돌 스킨케어 크로스오버 — K-Beauty ↔ K-Entertainment 브릿지 (추가 보강)
      'K-pop idol skincare routine products they actually use revealed guide',
      'aespa Karina skincare routine products 2026 complete guide',
      'IVE Wonyoung skincare routine beauty secrets products revealed 2026',
      'NewJeans skincare routine K-Beauty products beauty looks guide 2026',
      // 가격 비교 — 어필리에이트 전환율 최고 (구매 의도)
      'Olive Young vs Amazon K-beauty price comparison which is cheaper 2026',
      'Korean skincare cheaper in Korea how much you save buying local guide',
      'K-beauty dupes drugstore affordable alternatives ranked 2026 guide',
      // 선크림 비교 — UV 필터 교육 콘텐츠 고 E-E-A-T
      'Korean sunscreen vs American sunscreen UV filters difference PA vs SPF explained',
      'PA++++ sunscreen comparison best Korean SPF ranked by UV protection 2026',
      // Skintific — 동남아 폭발적 성장 한국 포뮬레이션 브랜드
      'Skintific Korean skincare review best products barrier repair 2026',
      'Skintific vs COSRX which is better for sensitive skin comparison 2026',
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
    broadTerm: `K-pop ${new Date().getFullYear()}`,
    seedKeywords: [
      // BTS — 글로벌 최고 검색량 (2026년: 전원 전역 완료, 그룹 컴백 앵글 중심)
      // NOTE: 모든 멤버 2025년 중반까지 전역 완료 — "after military service" 앵글은 과거완료형으로 작성
      'BTS group comeback 2026 what fans need to know full guide',
      'BTS 2026 comeback latest what fans need to know full update',
      'BTS members solo activities ranked 2026 update',
      // 4세대 주력 그룹 — 급상승 트래픽
      // NOTE: NewJeans — 2025년 12월 어도어 독립 확정, 독립 아티스트 활동 중 (2026).
      //       콘텐츠 작성 시: 2025년 소속사 분쟁 내러티브 지양 (해결 완료), 독립 전략·음악·팬덤 중심 작성.
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
      // K-Drama — Netflix 글로벌 + TVING 국내 트래픽
      'best Korean dramas on Netflix 2026 must watch',
      'most watched K-dramas of 2026 ranked by viewers',
      'K-drama 2026 release schedule complete list Netflix Disney TVING',
      'where to watch K-dramas online streaming platforms compared',
      // TVING — 2024-2025 국내 OTT 1위, 한국 오리지널 독점 콘텐츠
      'TVING vs Netflix which is better for K-dramas 2026 guide',
      'best K-dramas on TVING 2026 exclusive Korean originals ranked',
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
      // TWICE — 2015년 데뷔, 2026년 기준 11년 차 K-pop 걸그룹 롱런 비결이 독보적 앵글
      'TWICE 10 years K-pop longest-running girl group legacy explained 2026',
      // K-Drama 배우/OST — 팬 검색 의도
      'best K-drama OST songs ranked all time',
      'top K-drama actors to watch 2026 breakout performances',
      // 아이돌 뷰티 — K-Beauty ↔ K-Entertainment 크로스 니치 교두보
      // NOTE: 'K-pop idol skincare routine' 계열 키워드는 K-Beauty 섹션에 이미 있음 (cannibalization 방지)
      'K-pop idol no-makeup looks natural beauty secrets revealed',
      // IU(아이유) — Laneige 글로벌 앰배서더, 한국 최고 스킨케어 아이콘, 검색량 폭발적
      'IU skincare routine products Laneige ambassador what she uses',
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
      // 8TURN — MNH Entertainment 4세대 보이그룹 (2023 데뷔), 글로벌 팬덤 급성장
      '8TURN MNH Entertainment boy group songs ranked guide for new fans 2026',
      '8TURN debut story MNH Entertainment members explained guide',
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
      // NCT WISH — SM 2024년 신유닛, NCT 프랜차이즈 글로벌 팬덤 확장
      'NCT WISH debut story SM Entertainment concept explained guide fans',
      'NCT WISH songs ranked best tracks for new fans guide 2026',
      // KATSEYE — HYBE 글로벌 걸그룹 프로젝트 (The Debut: Dream Academy 출신), K팝 ↔ 서양 크로스오버
      'KATSEYE HYBE global girl group debut story explained guide fans',
      'KATSEYE songs ranked best tracks guide new fans 2026',
      // WHIPLASH — SM Entertainment 4세대 보이그룹 (2024년 10월 데뷔)
      'WHIPLASH SM Entertainment boy group debut story explained guide 2026',
      'WHIPLASH songs ranked best tracks for new fans guide 2026',
      // QWER (큐더블유이알) — 밴드돌 걸그룹, 라이브 악기 연주, 팬덤 급성장
      'QWER K-pop girl band concept explained instruments guide new fans',
      'QWER songs ranked best tracks Melon chart hits guide 2026',
      'QWER vs BLACKPINK vs aespa why band idol concept is different',
      // PLAVE (플레이브) — VLAST 소속 버추얼 아이돌, 2024-2026 최고 성장 4세대 보이그룹
      // NOTE: 5명 전원 버추얼 아바타로 활동, 팬덤명 ASTERDOM, Melon/Circle Chart 다수 1위
      'PLAVE virtual idol group explained concept lore guide for new fans',
      'PLAVE songs ranked best tracks for new fans 2026 guide',
      'PLAVE comeback 2026 what fans need to know full update',
      'PLAVE vs aespa virtual concept comparison K-pop metaverse explained',
      // G-Dragon (권지용) — YG, 2025년 솔로 컴백, K팝 레전드 복귀 초대형 이벤트
      // NOTE: 솔로 아티스트 활동 기준으로 작성 — BIGBANG 그룹 컴백 앵글은 미확정이므로 헤지 필수
      'G-Dragon solo comeback 2025 2026 what fans need to know guide',
      'G-Dragon Power of GD concert tour setlist fan guide 2026',
      'G-Dragon best songs ranked solo discography guide for new fans',
      // 아이돌 배우 크로스오버 — 2025-2026 K-Drama 최대 트렌드
      // NOTE: 특정 배우 이름 없이 보편적 검색 의도 앵글로 작성 — 개인 사생활 추정 금지
      'K-pop idols turned actors best drama performances ranked 2026',
      'best K-dramas starring K-pop idols 2026 who surprised fans',
      'K-pop idol acting debut guide what to watch ranked 2026',
      // NCT 127 / NCT Dream — NCT 최대 유닛 두 개, 아시아 스트리밍 최강
      'NCT 127 best songs ranked guide for new fans 2026',
      'NCT Dream best songs ranked guide all eras new fans 2026',
      'NCT 127 vs NCT Dream differences explained complete guide for new fans',
      // Cha Eun-woo (차은우) — 아스트로 솔로 + K-Drama 주연, K-Beauty 앰배서더 교차 앵글
      'Cha Eun-woo solo career 2026 dramas movies guide fans complete update',
      // Chung Ha (청하) — K-팝 퀸 솔로, 글로벌 팬덤 안정적
      'Chung Ha best songs ranked solo discography guide new fans 2026',
      'Chung Ha comeback 2026 what fans need to know full update',
      // MAMAMOO 솔로 — 화사·솔라·문별·휘인 개별 활동 고검색
      'MAMAMOO members solo activities 2026 update complete guide fans',
      'best MAMAMOO solo songs ranked all four members guide 2026',
      // EXO — 멤버 전역 완료 (2024-2025), 팬덤 EXO-L 재결집 기대
      // NOTE: 공개 확인된 그룹 일정 기준으로만 작성 — 미확인 컴백 앵글 헤지 필수
      'EXO group comeback 2026 what fans need to know full update guide',
      'EXO best songs ranked guide for new fans after military reunion 2026',
      'EXO-L fandom guide how to stay updated 2026 lightstick fan culture',
      // AMPERS&ONE — FNC Entertainment 걸그룹 (2023 데뷔, My Teenage Girl 시즌2 출신)
      'AMPERS&ONE FNC Entertainment girl group debut concept explained guide fans 2026',
      'AMPERS&ONE songs ranked best tracks for new fans guide 2026',
      // NEXZ — JYP 일본 공식 그룹 (K-팝 훈련 방식), 일본 팬덤→K-팝 진입 앵글
      'NEXZ JYP Japan group debut story concept explained guide new fans 2026',
      // K-팝 아이돌 럭셔리 브랜드 앰배서더 — 패션·K-팝 크로스오버 고검색
      // NOTE: 공식 확인된 대사 계약 관계 기준으로만 작성 — 미확인 루머 금지
      'K-pop idols as luxury brand ambassadors complete list 2026 guide',
      'why luxury brands choose K-pop idols as global ambassadors explained 2026',
      'best K-pop idol luxury brand collaboration fashion moments ranked 2026',
      // K-팝 군백기 / 전역 콘텐츠 — 팬 검색 지속적
      'K-pop idols military service discharge schedule 2026 complete update guide',
      'K-pop idols who completed military service comeback guide what fans expect',
      // Viki (Rakuten Viki / 비키) — K-Drama 스트리밍, 다국어 자막 강점
      'Viki vs Netflix which is better for watching K-dramas 2026 guide',
      'best K-dramas on Viki 2026 exclusive multilingual subtitles ranked guide',
      'how to use Viki to watch K-dramas free vs premium guide 2026',
      // MEOVV (미오브) — THEBLACKLABEL 걸그룹 (2024 데뷔), YG 계열 but 독립 레이블
      'MEOVV THEBLACKLABEL girl group debut concept explained guide fans 2026',
      'MEOVV songs ranked best tracks for new fans guide 2026',
      // Coupang Play — 2025-2026 가장 빠르게 성장하는 K-Drama OTT 플랫폼
      'best K-dramas on Coupang Play 2026 exclusive originals ranked guide',
      'Coupang Play vs Netflix vs TVING which is best for K-dramas 2026 comparison',
      // ── 전문가 감사 추가 (2026-03-16 batch 12): K-Entertainment 누락 세그먼트 ──
      // Weverse 프리미엄 — 팬 멤버십 구독 모델
      'Weverse membership how to get K-pop idol messages premium content guide 2026',
      // Circle Chart vs Melon vs Hanteo — 차트 시스템 교육 (글로벌 팬 혼란 1위)
      'Circle Chart vs Melon vs Hanteo Korean music charts explained which matters guide',
      // K-Drama 장르 확장 — 힐링/컴포트, 액션/스파이, 직장 로코
      'best Korean comfort healing dramas 2026 low stress feel good ranked guide',
      'best Korean action spy thriller dramas Netflix 2026 high stakes ranked',
      'best Korean workplace romance comedy dramas 2026 fan favorite guide',
      // 예측형 K-pop 콘텐츠 — 팬 추측/토론 유도 (에버그린 댓글 트래픽)
      'ENHYPEN 2026 comeback schedule predictions new era concept clues guide',
      'TXT chapter concept lore predictions 2026 fan theories explained guide',
      'K-pop 2026 comebacks schedule predictions what groups are coming back guide',
      // 아이돌 뷰티 팁 — K-Beauty ↔ K-Entertainment 브릿지
      'K-pop idol makeup artist tips professional techniques revealed guide 2026',
      // ── 전문가 감사 추가 (2026-03-16 batch 14): 누락된 주요 아티스트/세그먼트 ──
      // (G)I-DLE ((여자)아이들) — 4세대 최상위 걸그룹, 셀프 프로듀싱 차별점 (소연 작곡/프로듀싱)
      '(G)I-DLE self-producing girl group concept discography explained guide fans',
      '(G)I-DLE best songs ranked guide for new fans 2026',
      '(G)I-DLE Soyeon producer songwriter how she creates music explained guide',
      '(G)I-DLE comeback 2026 what fans need to know full update',
      // Stray Kids 확장 — 키워드 1개(투어)에서 비기너 가이드/노래 랭킹 추가
      'Stray Kids best songs ranked guide for new fans by era 2026',
      'Stray Kids self-produced music how 3RACHA works explained guide',
      'Stray Kids member profiles who is who complete guide new fans 2026',
      // Wavve (웨이브) — KBS/MBC/SBS 합작 OTT, TVING/Coupang Play와 3강 체제
      'Wavve vs TVING vs Coupang Play which Korean OTT is best 2026 comparison',
      'best K-dramas on Wavve 2026 exclusive originals ranked guide',
      // 한국 예능 (비아이돌) — 글로벌 시청자 급증, Netflix 예능 구독 유입
      'best Korean variety shows for beginners 2026 ranked must watch',
      'Korean variety shows on Netflix 2026 funniest shows ranked guide',
      'Running Man vs Knowing Bros which Korean variety show to watch first guide',
      'I Live Alone Korean variety show why it is so popular explained 2026',
      // 한국 영화 — 봉준호/박찬욱 이후 글로벌 K-영화 팬 세그먼트
      'best Korean movies of all time ranked beginners guide 2026',
      'best Korean thriller movies on Netflix 2026 must watch ranked',
      'Korean horror movies ranked scariest films guide 2026',
      'Korean movies at Cannes 2026 which films to watch guide',
      // K-Drama OST 아티스트 특화 — 팬 검색 높은 세그먼트
      'best K-drama OST artists singers 2026 who sings the best soundtracks',
      'IU best K-drama OST songs ranked all time guide',
      'Baek Yerin K-drama OST songs ranked discography guide fans',
      // TVING 오리지널 / K-Drama 스트리밍 — 2026 OTT 트렌드
      'best TVING original drama 2026 exclusive must watch ranked guide',
      'K-drama Netflix 2026 best new shows ranked what to watch guide',
      'Korean drama streaming platforms compared which is best 2026 guide',
      // 5세대 그룹 (Gen 5) — 2024-2025 데뷔, 글로벌 팬덤 형성 중
      'WHIPLASH Kpop SM Entertainment boy group songs concept guide 2026',
      'TWS Kpop debut story members songs ranked guide for new fans 2026',
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
