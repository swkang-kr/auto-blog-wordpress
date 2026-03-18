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
    'Chuseok': ['K-Entertainment', 'K-Beauty'],
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
    'Korea Sale Festa': ['K-Beauty'],
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
      // NOTE: NewJeans — 2025년 12월 어도어 독립 활동 시작, 일부 법적 이슈 진행 중 (2026).
      //       콘텐츠 작성 시: 소속사 분쟁 내러티브 지양, 독립 활동·뷰티 룩·제품 중심 작성. 법적 확정 사항은 단정 금지.
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
      'best Korean body scrub exfoliator for smooth skin ranked 2026',
      'Korean body sunscreen lotion SPF lightweight non-greasy ranked 2026',
      'Korean perfumed body care lotion mist best smelling ranked 2026',
      // Baby K-Beauty — 고의도 저경쟁 키워드 세그먼트 (Green Finger, 궁비, ato)
      'best Korean baby skincare products safe gentle for newborn 2026',
      'Korean kids sunscreen for sensitive skin EWG safe guide 2026',
      'Green Finger vs Goongbe Korean baby skincare brand comparison 2026',
      // Intimate care — pH 밸런스 이너 워시, K-Beauty 수출 성장 카테고리
      'Korean intimate wash feminine care pH balanced best products 2026',
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
      // Aestura / Dr.G / CNP — 피부과 브랜드 메인스트림 진입, 민감·트러블 피부 세그먼트 강세
      'Aestura AtoBarrier cream review sensitive skin barrier repair',
      'Dr.G brightening peeling gel review gentle exfoliation guide',
      // 14차 감사: 더마코스메틱 카테고리 확장 — 올리브영 더마 카테고리 1위 세그먼트
      'best Korean dermacosmetic brands ranked Aestura Dr.G CNP guide 2026',
      'CNP Laboratory propolis ampule review acne sensitive skin 2026',
      'Aestura vs ILLIYOON vs CNP best Korean derma brand comparison 2026',
      'Korean dermatologist recommended brands what Korean 피부과 doctors use',
      'best Korean cica cream ranked centella barrier repair derma brands 2026',
      'Korean dermacosmetic vs French pharmacy skincare La Roche-Posay comparison',
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
      'Innisfree retinol cica repair ampoule review best products ranked 2026',
      // Laneige (라네즈) — 아모레퍼시픽, 립 슬리핑 마스크 글로벌 베스트셀러
      'Laneige water sleeping mask review vs lip sleeping mask which is better',
      'Laneige lip sleeping mask all flavors ranked review 2026',
      // MISSHA (미샤) — BB 크림 원조, 가성비 한류 뷰티 대표
      'MISSHA M Perfect Cover BB cream review shades comparison 2026',
      'MISSHA Time Revolution essence review vs SK-II dupe comparison',
      // Etude (에뛰드) — 2024년 리브랜딩 (구 Etude House), 아모레퍼시픽, 메이크업 특화, Z세대 타겟
      // NOTE: 'Etude House' 아닌 'Etude' 사용 필수 (공식 리브랜딩 완료)
      'Etude best products ranked makeup skincare 2026 guide',
      'Etude fixing tint review best lip shades swatches 2026',
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
      // 아토피/습진 K-Beauty — Reddit r/AsianBeauty 급성장 세그먼트
      'best Korean skincare for atopic eczema prone skin barrier repair complete routine 2026',
      'Korean eczema cream vs Western brand comparison which is better sensitive skin 2026',
      // 한국 피부과 추천 제품 — Reddit/TikTok 최대 트렌드 (피부과 전문의 권위)
      'Korean dermatologist recommended skincare products 2026 ranked guide',
      'what Korean dermatologists actually use for their own skin routine 2026',
      'Korean dermatologist anti-aging skincare routine products guide 2026',
      // 더마투어리즘 — 한국 피부과 원정 (YMYL 주의: "consult a professional" 면책 필수)
      'Korean dermatology clinic guide for foreigners Seoul Gangnam what to expect 2026',
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
      // 14차 감사: 쿨링/아이스 스킨케어 — 2025-2026 한국 여름 트렌드
      'best Korean cooling skincare products ice toner pad summer routine 2026',
      'Korean ice globes face roller cryotherapy skincare trend how to use guide',
      // 14차 감사: 립 틴트-세럼 하이브리드 — 립케어+컬러 동시 카테고리 급성장
      'best Korean lip tint serum hybrid products ranked care and color 2026',
      'rom&nd vs Peripera vs FWEE lip tint serum comparison which is best 2026',
      // 14차 감사: 남성 K-Beauty 젠더리스 확장 — Laka, FWEE 중성 라인
      'best Korean genderless makeup brands Laka FWEE for men guide 2026',
      'Korean skincare for men beginners guide affordable products ranked 2026',
      // ── 한방(Hanbang) & 프리미엄 K-Beauty — 고가 어필리에이트 + 럭셔리 세그먼트 ──
      // Sulwhasoo (설화수) — 아모레퍼시픽 최고급 한방 브랜드, 글로벌 프레스티지 라인
      'Sulwhasoo First Care Activating Serum review before after results 2026',
      'Sulwhasoo vs La Mer which luxury skincare brand is worth it comparison',
      'best Sulwhasoo products ranked for anti-aging Korean luxury skincare guide',
      // History of Whoo (더 후) — LG생활건강 한방 궁중 화장품, 과거 아시아 면세점 1위 뷰티 브랜드 (2023년 이후 중국 관광객 감소로 매출 하락)
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
      'K-beauty for men complete skincare guide what products to use 2026',
      'Korean men grooming skincare essentials what to buy 2026 guide',
      'Korean toner for men best picks oily combination skin 2026 ranked',
      // 아이돌 스킨케어 크로스오버 — K-Beauty ↔ K-Entertainment 브릿지 (추가 보강, 차별화된 앵글)
      // NOTE: K-Entertainment에는 "idol visual culture" 앵글, 여기서는 "제품 + 루틴 재현" 앵글로 차별화
      'K-pop idol glass skin routine recreate at home step by step products guide',
      // NOTE: K-Entertainment에 NewJeans 뷰티 "looks" 키워드 있으므로, 여기서는 제품·성분 앵글로 차별화
      'NewJeans members favorite skincare products ingredient breakdown K-Beauty guide 2026',
      // 가격 비교 — 어필리에이트 전환율 최고 (구매 의도)
      'Korean skincare cheaper in Korea how much you save buying local guide',
      'K-beauty dupes drugstore affordable alternatives ranked 2026 guide',
      // 선크림 비교 — UV 필터 교육 콘텐츠 고 E-E-A-T
      'PA++++ sunscreen comparison best Korean SPF ranked by UV protection 2026',
      // Skintific — NOTE: 인도네시아 브랜드 (PT Skintific Global Indonesia), 한국 스타일 포뮬레이션 사용. 한국 브랜드가 아님.
      'Skintific skincare review Korean-inspired formulas best products barrier repair 2026',
      'Skintific vs COSRX which is better for sensitive skin comparison 2026',
      // 한국 네일아트 — TikTok 바이럴 급성장 트렌드 (젤 스티커, press-on nails, 젤리 네일)
      'best Korean nail art stickers press on nails ranked easy gel manicure 2026 guide',
      'Korean nail art trends 2026 what is trending K-nail glass jelly chrome nail guide',
      // ── 전문가 감사 추가 (2026-03-16 batch 21): 미국 대형 리테일 확장 + 시즌 세일 선행 키워드 ──
      // Ulta K-Beauty — 2024-2026 Ulta 한국 뷰티 전용 섹션 런칭, 저경쟁 "where to buy" 폭발
      'best Korean skincare at Ulta 2026 K-Beauty exclusive brands guide',
      'Ulta K-beauty section what Korean brands are sold exclusive 2026',
      'Ulta vs Sephora for Korean skincare which has better K-Beauty selection 2026',
      'best Ulta K-beauty deals sales what to buy on discount guide 2026',
      // Walmart K-Beauty — 2024-2026 월마트 K-Beauty 오프라인 최대 채널 확장
      'best Korean skincare at Walmart what to buy affordable 2026 guide',
      'Korean skincare brands sold at Walmart affordable K-Beauty budget options 2026',
      'Walmart vs Target K-Beauty which store has better Korean skincare 2026',
      // CVS / Walgreens K-Beauty — 미국 드러그스토어 K-Beauty 진출
      'Korean skincare at CVS Walgreens which brands are available US guide 2026',
      'best Korean skincare drugstore CVS Walgreens affordable picks 2026',
      // ULTA Loyalty / Target Circle K-Beauty — 포인트 활용 어필리에이트 키워드
      'how to save money on Korean skincare Ulta Loyalty Target Circle guide 2026',
      // Olive Young 봄 그랜드 세일 — 현재 기준 60일 전 제작 적기 (2026-03-16 → 5월 초 세일)
      // NOTE: contentAngles 이미 KOREAN_SEASONAL_EVENTS에 정의됨 — 시드 키워드로 명시적 보강
      'Olive Young spring grand sale 2026 what to buy best deals complete guide',
      'Olive Young spring sale 2026 haul best products ranked what to buy first',
      'Olive Young spring grand sale shopping strategy 2026 K-Beauty deals guide',
      'best Olive Young deals spring 2026 skincare makeup must buy list ranked',
      'Olive Young spring 2026 discount coupon how to use app international buyers guide',
      // Olive Young 추계 / 연말 세일 선행 — 9-11월 세일 선행 (연간 최대 수익 시즌)
      'Olive Young mega sale fall 2026 best deals what to buy guide',
      'Olive Young year-end sale 2026 best K-Beauty discounts complete guide',
      // Chuseok / Seollal K-Beauty 선물 세트 — 시즌 어필리에이트 최고 수익 (60일 리드)
      'best Korean skincare gift sets 2026 holiday Chuseok Seollal what to buy',
      'Olive Young gift set guide 2026 best K-Beauty presents birthday holiday ranked',
      'Korean beauty gift sets for mom wife girlfriend ranked 2026 guide',
      // K-Beauty Haul Content 강화 — "haul" 키워드 구매 의도 최고
      'Olive Young haul 2026 what I bought review skincare makeup',
      'K-Beauty haul guide 2026 best products to try from Olive Young Amazon',
      // 뷰티 디바이스 — 고가 어필리에이트 + 마이크로니들링 신규 카테고리
      'best Korean at-home microneedling derma roller device 2026 guide ranked',
      'Korean beauty devices worth buying 2026 LED microcurrent gua sha ranked',
      'Korean facial steamer for skincare routine guide best picks 2026',
      // 성분 비교 심화 — 고 E-E-A-T 성분덕후 타겟 (10% 이상 농도 비교)
      'niacinamide 10 percent vs 5 percent Korean serum which is better safe guide 2026',
      'Korean skincare ingredients to avoid mixing dangerous combinations guide 2026',
      'best Korean actives stacking guide which ingredients work together 2026',
      // ── 전문가 감사 추가 (2026-03-16 batch 22): 복합성 피부·바디케어·연령대·트렌드 보완 ──
      // 복합성 피부 (Combination Skin) — 완전 누락 세그먼트, Google Trends 12x 성장
      'Korean skincare routine for combination skin oily T-zone dry cheeks guide 2026',
      'best Korean toner for combination skin pore minimizing moisture balance 2026',
      'Korean moisturizer for combination skin lightweight not greasy ranked 2026',
      'combination skin Korean layering guide what order to apply products 2026',
      'best Korean BHA toner for oily T-zone dry cheeks combination skin 2026',
      // 바디 케어 심화 — 각질(KP)·체지방·딸기 다리·손발 (TikTok 급성장 세그먼트)
      'Korean skincare for keratosis pilaris body bumps best products ranked 2026',
      'how to treat keratosis pilaris Korean exfoliation AHA BHA body routine 2026',
      'Korean body acne treatment back shoulder acne skincare routine 2026',
      'strawberry legs Korean skincare routine how to get smooth legs 2026',
      'Korean hand cream anti-aging for hands nail care ranked best 2026',
      'anti-aging neck skincare Korean routine products what to use 2026',
      'body hyperpigmentation dark spots Korean skincare treatment guide 2026',
      // 메이크업 + 스킨케어 하이브리드 — 0개 누락 세그먼트
      'best Korean BB cream with skincare benefits lightweight coverage 2026',
      'Korean tinted moisturizer with SPF skincare hybrid makeup ranked 2026',
      'Korean makeup primer with skincare ingredients barrier protection 2026',
      'best Korean cushion foundation with hyaluronic acid skincare benefits 2026',
      // 연령대별 세분화 — 20·30·60대 누락
      'Korean skincare routine for your 20s acne prevention glow guide 2026',
      'Korean skincare routine for 30s fine line prevention retinol guide 2026',
      'best Korean skincare for 60s and above sensitive aging skin ranked 2026',
      // 항공해·블루라이트 스킨케어 — 완전 누락 신흥 카테고리
      'Korean skincare for air pollution PM2.5 protection barrier products 2026',
      'Korean blue light protection skincare screen damage from phone laptop 2026',
      // 레티노이드 래더 — K-Beauty 차별화 성분 사다리 가이드
      'retinoid ladder Korean alternatives guide safest to strongest ranked 2026',
      'Korean retinol vs bakuchiol vs retinal vs adenosine complete comparison 2026',
      // 계절 전환 루틴 — 에버그린 반복 검색 (환절기 키워드)
      'Korean skincare routine transition from winter to spring what to change 2026',
      'summer to fall Korean skincare routine adjustment guide 2026',
      // 예산별 스타터 키트 — 구매 의도 최고 (어필리에이트 번들)
      'Korean skincare starter kit under 50 dollars best products beginner 2026',
      'Korean skincare full routine under 100 dollars best value kit 2026',
      'best affordable Korean skincare dupes under 25 dollars drugstore 2026',
      // 선크림 포맷 혁신 심화 — 하이브리드·스프레이·파우더
      'Korean sunscreen spray vs stick vs cushion which is best reapplication 2026',
      'Korean mineral sunscreen powder compact SPF review ranked 2026',
      // 오럴 콜라겐 비교 — YMYL 주의 (consult professional 면책 필수)
      // NOTE: 효능 과장 금지, "not a substitute for professional advice" 고지 필수
      'collagen drink vs hyaluronic acid supplement Korean comparison which works 2026',
      // 선케어 상식 오해 교정 — 고 E-E-A-T 교육 콘텐츠
      'Korean sunscreen myths debunked PA rating SPF explained facts 2026',
      // ── 전문가 감사 추가 (2026-03-17): 누락된 2026 핵심 트렌드 ──
      // Postbiotics (사균체) — 프리바이오틱스→프로바이오틱스→포스트바이오틱스 진화, 2026 최대 마이크로바이옴 세분화 트렌드
      'best Korean postbiotic skincare serum cream for sensitive skin barrier 2026',
      'postbiotics vs probiotics vs prebiotics Korean skincare what is the difference guide 2026',
      'Korean postbiotic moisturizer for sensitive redness prone skin ranked 2026',
      // Galactomyces 단독 키워드 — clarification NOTE 있지만 시드 키워드 없었음
      'best Korean galactomyces ferment essence serum ranked 2026 guide',
      'COSRX galactomyces 95 essence review vs SK-II Pitera dupe comparison 2026',
      'galactomyces ferment filtrate skincare benefits explained what it does for skin guide',
      // 한국 네일아트 확장 — 기존 2개에서 세분화 (매그넷·캣아이·젤리·오로라 네일)
      'best Korean magnet cat eye nail gel polish ranked trending 2026 guide',
      'Korean aurora nail jelly nail trend how to do at home guide 2026',
      'Korean nail art vs Japanese nail art differences style comparison guide 2026',
      'best Korean gel nail sticker brands ohora Dashing Diva ranked 2026 guide',
      // Skin Longevity / Pro-Aging — 2025-2026 글로벌 최대 뷰티 패러다임 전환
      'skin longevity Korean skincare pro-aging routine how to age well guide 2026',
      'Korean anti-aging vs pro-aging skincare which approach is better explained 2026',
      'best Korean skincare for skin longevity long term results not quick fix guide 2026',
      // Exosome skincare — PDRN 다음 단계 바이오테크 성분, 한국 클리닉→화장품 전환
      'Korean exosome skincare serum what is it explained science guide 2026',
      'best Korean exosome serum cream products ranked anti-aging 2026',
      'exosome vs PDRN vs stem cell Korean skincare which biotech ingredient is best 2026',
      // Ceramide NP vs AP vs EOP — 세라마이드 심화 비교 누락
      'ceramide types NP AP EOP explained which Korean product has best ceramide guide',
      'ILLIYOON vs COSRX vs Dr.Jart+ ceramide cream comparison which has most ceramides 2026',
      // UV 카메라 선크림 검증 — TikTok 바이럴 2025-2026 교육 콘텐츠
      'UV camera sunscreen test Korean SPF actually works visual proof guide 2026',
      'how much Korean sunscreen to apply UV camera reveals correct amount guide',
      // 마이크로니들 패치 진화 — 하이드로콜로이드 → 마이크로니들 (ZitSticka 경쟁)
      'best Korean microneedle acne patch vs hydrocolloid which works better 2026',
      'Korean acne patch evolution hydrocolloid to microneedle complete guide 2026',
      'COSRX vs Mighty Patch vs Korean microneedle patches ranked comparison 2026',
      // 립 콤보 (Lip Combo) — 한국식 립 레이어링 TikTok 바이럴 (라이너+틴트+글로스)
      'Korean lip combo technique liner tint gloss layering how to guide 2026',
      'best Korean products for lip combo look step by step tutorial ranked 2026',
      // K-Beauty FAQ 허브 — E-E-A-T YMYL 허브 페이지
      'is Korean skincare better than American explained facts comparison guide 2026',
      'are Korean beauty products safe ingredients tested guide for beginners 2026',
      // INCI 성분 교육 — 전문성 차별화
      'how to read Korean skincare ingredient list INCI label explained guide 2026',
      // ── 전문가 감사 추가 (2026-03-17 batch 5): 누락된 핵심 세그먼트 보완 ──
      // Lip Oil / Lip Serum — 2025-2026 K-Beauty 최대 성장 메이크업 카테고리 (TikTok 바이럴)
      'best Korean lip oil for hydration glass lips ranked 2026 guide',
      'Korean lip serum vs lip oil vs lip balm which is better comparison guide 2026',
      'best Korean lip tint with skincare benefits hydrating formula ranked 2026',
      'rom&nd vs Peripera vs FWEE lip oil comparison which Korean brand is best 2026',
      // Cica balm / Cica pad / Cica stick — 시카 제형 다양화 (밤·패드·스틱)
      'best Korean cica balm for irritated skin barrier repair ranked 2026',
      'Korean cica pad vs cica cream which format works better for sensitive skin 2026',
      'best Korean cica stick for spot treatment redness on the go 2026 guide',
      // Refillable / 리필 패키지 — ESG + 비용 절감 트렌드, 이니스프리·라네즈 리더
      'Korean skincare refillable packaging brands eco-friendly sustainable guide 2026',
      'best Korean refill skincare products save money reduce waste ranked 2026',
      'Innisfree vs Laneige refillable packaging which brand is more sustainable 2026',
      // J-Beauty vs K-Beauty — 비교 검색량 높음 (Hada Labo, Biore, Shiseido 등)
      'Korean skincare vs Japanese skincare which is better key differences explained 2026',
      'K-Beauty vs J-Beauty sunscreen comparison Korean SPF vs Japanese SPF 2026',
      'Hada Labo vs Korean hyaluronic acid toner which is better comparison 2026',
      'Biore UV vs Korean sunscreen which has better protection no white cast 2026',
      'Shiseido vs Sulwhasoo luxury Asian skincare comparison which to buy 2026',
      // C-Beauty vs K-Beauty — 영어권 검색 증가 (Florasis, Zeesea 등)
      'K-Beauty vs C-Beauty Chinese skincare comparison what is the difference 2026',
      'Florasis makeup vs Korean makeup brands comparison which is better guide 2026',
      // Olive Young 온라인 전용 / 글로벌 앱 독점 — 해외 구매자 핵심 정보
      'Olive Young online exclusive products you cannot buy in store guide 2026',
      'Olive Young Global app exclusive discounts how to save international buyers 2026',
      // Azelaic acid 확장 — 로사시아+여드름+색소 겸용 성분, K-Beauty 공식 진입
      'azelaic acid Korean skincare products complete guide benefits how to use 2026',
      'best Korean azelaic acid serum cream for dark spots hyperpigmentation 2026',
      'azelaic acid vs tranexamic acid Korean skincare which is better for dark spots 2026',
      // ── 전문가 감사 추가 (2026-03-17 batch 6): K-Fragrance, 메이크업 브랜드, 한미 브릿지 ──
      // K-Fragrance (한국 향수) — 2025-2026 K-Beauty 최대 성장 수출 카테고리 (Tamburins·nonfiction TikTok 바이럴)
      'best Korean perfume fragrance brands ranked Tamburins nonfiction granhand 2026',
      'Tamburins perfume review Jennie BLACKPINK collaboration best scents ranked 2026',
      'nonfiction Korean fragrance brand review Amorepacific clean scents ranked 2026',
      'granhand Korean niche perfume review Seoul boutique fragrance guide 2026',
      'Korean perfume vs French perfume which is better comparison guide 2026',
      'best Korean body mist affordable fragrance layering guide 2026',
      'K-fragrance trend explained why Korean perfume is going viral TikTok 2026',
      // 누락 메이크업 브랜드 — Olive Young/Amazon 베스트셀러급 브랜드 독립 키워드
      // 3CE (3 Concept Eyes) — Stylenanda 산하, 한국 메이크업 Top 3
      '3CE best products ranked lip tint eyeshadow palette review 2026',
      '3CE vs rom&nd Korean makeup comparison which brand is better 2026',
      // espoir — 아모레퍼시픽 프로페셔널 메이크업, 올리브영 베스트셀러
      'espoir Korean makeup brand review best cushion foundation lip tint 2026',
      // AMUSE — 비건 메이크업, Sephora Korea 베스트셀러
      'AMUSE vegan Korean makeup brand review best products lip tint 2026',
      // Laka — 젠더 뉴트럴 메이크업, 독특한 포지셔닝
      'Laka Korean gender neutral makeup brand review best products 2026',
      // Peach C — 틱톡 바이럴 쿠션, 버짓 메이크업
      'Peach C cushion foundation review affordable Korean makeup best coverage 2026',
      // Wakemake — 올리브영 자체 브랜드
      'Wakemake Korean makeup brand review best sellers eye palette Olive Young 2026',
      // Korean-American K-Beauty 브릿지 브랜드 — Sephora/Ulta K-Beauty 검색 트래픽
      // NOTE: Peach & Lily/Krave Beauty = 한국계 미국 브랜드, Glow Recipe와 동일 취급 (한국 브랜드 아님 고지 필수)
      'Peach and Lily Glass Skin Refining Serum review Ulta K-Beauty guide 2026',
      'Krave Beauty Liah Yoo minimalist Korean skincare review best products 2026',
      'Peach and Lily vs Glow Recipe vs Krave Beauty Korean-American skincare comparison 2026',
      // Case Study / Deep-Dive 비율 보강 — 현재 ~5% → 목표 15%
      'how COSRX became number one K-beauty brand on Amazon L\'Oreal acquisition story 2026',
      'how Anua heartleaf toner went viral TikTok Korean skincare brand growth story 2026',
      'how Olive Young became the global K-Beauty destination growth strategy explained 2026',
      'Beauty of Joseon brand story how a traditional Korean brand conquered global skincare 2026',
      'TIRTIR cushion foundation TikTok viral journey from Korean brand to global bestseller story',
      'Korean sunscreen revolution how K-Beauty changed global SPF standards deep dive 2026',
      'the science behind Korean glass skin why it works dermatology explained deep dive 2026',
      'Korean skincare industry size growth 2026 market data trends deep dive analysis',
      // ── 전문가 감사 추가 (2026-03-17 batch 9): 누락된 핵심 세그먼트 ──
      // 헤어 스타일링 (Hair Styling) — 샴푸/두피만 있고 스타일링 완전 누락, TikTok Korean perm 바이럴 대형 트렌드
      'best Korean hair wax pomade for men natural hold 2026 ranked guide',
      'Korean perm C-curl S-curl what is it how to maintain at home guide 2026',
      'best Korean hair styling products volume setting spray mousse ranked 2026',
      'Korean men hair styling routine products step by step guide 2026',
      'Korean see-through bangs how to style products for wispy fringe guide 2026',
      'best Korean heat protectant spray for curling iron straightener 2026',
      // 아이 패치 / 언더아이 마스크 — Biodance만 1개, 독립 카테고리 누락
      'best Korean eye patches for dark circles puffy eyes collagen ranked 2026',
      'Korean under eye mask vs eye cream which is better comparison guide 2026',
      'best Korean hydrogel eye patches for wrinkles fine lines ranked 2026',
      // 콜라겐 뱅킹 (Collagen Banking) — 2025-2026 글로벌 메가 트렌드
      'collagen banking Korean skincare trend what is it how to start guide 2026',
      'best Korean products for collagen banking prevention anti-aging routine 2026',
      'collagen banking skincare routine Korean products 20s 30s prevention guide 2026',
      // 화해(Hwahae) 앱 국제 가이드 — Reddit r/AsianBeauty 상위 질문, Olive Young 앱은 있지만 화해 누락
      'Hwahae Korean beauty app guide how to use in English review ratings 2026',
      'Hwahae app vs Olive Young app which Korean beauty app is better guide 2026',
      'how to find best Korean skincare products using Hwahae ratings guide 2026',
      // 한국 치아미백/구강케어 — 뷰티 카테고리 진입, Olive Young 구강케어 급성장
      'best Korean whitening toothpaste oral care products ranked 2026 guide',
      'Korean oral care routine teeth whitening products Olive Young ranked 2026',
      // ── 전문가 감사 추가 (2026-03-17 batch 16): 누락된 K-Beauty 세그먼트 ──
      // 남성 메이크업 (기존 남성 스킨케어와 별개)
      'best Korean BB cream for men natural coverage no makeup look 2026',
      'Korean men concealer dark circles blemish coverage natural finish 2026',
      'Korean men eyebrow pencil grooming products best ranked 2026',
      // Skin Cycling 상세화
      'skin cycling night routine Korean products step by step exfoliation retinoid recovery 2026',
      'skin cycling schedule Korean skincare which products for each night guide 2026',
      // 2026 신흥 성분 (Ectoin, Squalane, Panthenol)
      'ectoin Korean skincare products anti-pollution stress protection ranked 2026',
      'best Korean squalane oil serum lightweight moisturizer ranked 2026',
      'panthenol Korean skincare products vitamin B5 soothing barrier repair 2026',
      // iHerb K-Beauty
      'best Korean skincare on iHerb what to buy ranked 2026 guide',
      'iHerb vs Amazon vs Olive Young where to buy Korean skincare price comparison 2026',
      // 수유 중 K-Beauty
      'Korean skincare safe while breastfeeding nursing mother skincare guide 2026',
      // ── 전문가 감사 추가 (2026-03-17 batch 17): 누락 브랜드·카테고리·트렌드 ──
      // rom&nd (롬앤) — 글로벌 K-Beauty 색조 1위 브랜드, Amazon/Olive Young 립틴트 판매 1위, 시드 키워드 완전 누락
      'rom&nd best lip tints ranked shades swatches review guide 2026',
      'rom&nd Juicy Lasting Tint vs Glasting Water Tint comparison which to buy 2026',
      'rom&nd cushion foundation review shade range comparison K-Beauty 2026',
      'rom&nd vs TIRTIR vs Peripera Korean lip tint comparison which brand is best 2026',
      // K-Beauty 립 카테고리 — Amazon K-Beauty 검색 Top 5, 필라 토픽 없었음
      'best Korean lip tints 2026 ranked long-lasting shades beginners guide',
      'best Korean lip oils 2026 hydrating glossy ranked review guide',
      'Korean lip tint vs lip oil vs lip gloss which to choose difference explained guide',
      'best Korean lip products for dry lips moisturizing tints balms ranked 2026',
      'Korean gradient lip tutorial how to do Korean ombre lips step by step guide',
      // Sunscreen stick — Amazon K-Beauty 최고 성장 서브카테고리
      'best Korean sunscreen sticks 2026 ranked portable SPF reapply guide',
      'Korean sunscreen stick vs cream vs gel which format is best comparison 2026',
      'best Korean sunscreen for reapplication over makeup stick cushion spray ranked 2026',
      // Skin flooding — slugging 후속 트렌드
      'skin flooding Korean skincare trend explained how to do step by step guide 2026',
      'skin flooding vs slugging vs skin cycling which Korean trend is best comparison guide',
      // K-Beauty body care — 성장 세그먼트
      'best Korean body sunscreen 2026 SPF body lotion ranked review guide',
      'best Korean body scrub exfoliator ranked smooth skin guide 2026',
      'Korean body care routine complete guide body lotion scrub sunscreen 2026',
      'best Korean body lotion for dry skin winter moisturizer ranked 2026',
      // K-Beauty vs J-Beauty — 검색량 높은 비교
      'K-Beauty vs J-Beauty skincare comparison which is better difference explained 2026',
      'Korean skincare vs Japanese skincare routine comparison guide beginners 2026',
      // VT Cosmetics — CICA 라인 글로벌 인기, 리들샷 바이럴
      'VT Cosmetics Reedle Shot review before after results microneedle serum guide 2026',
      'VT Cosmetics CICA products ranked best for sensitive skin review 2026',
      // Laka — 젠더뉴트럴 K-Beauty 선구 브랜드
      'Laka Korean gender neutral beauty brand review best products ranked 2026',
      // JUNG SAEM MOOL (정샘물) — 프로 메이크업 아티스트 브랜드
      'JUNG SAEM MOOL Korean makeup artist brand best products review guide 2026',
      'JUNG SAEM MOOL Essential Skin Nuder cushion review vs other Korean cushions 2026',
      // Holika Holika — 버짓 K-Beauty 대표
      'best Holika Holika products ranked affordable K-Beauty guide 2026',
      'best budget Korean skincare under $15 affordable K-Beauty ranked guide 2026',
      // K-Drama 캐릭터 스킨케어 — 크로스니치 브릿지 (K-Entertainment → K-Beauty)
      'K-drama character skincare routine recreate products step by step guide 2026',
      'K-drama actress skincare secrets what products Korean celebrities actually use guide 2026',
      // K-Beauty dupes — 고검색량 키워드
      'best Korean skincare dupes affordable alternatives to luxury products ranked 2026',
      'Korean dupes for Drunk Elephant La Mer affordable K-Beauty alternatives guide 2026',
      // 18차 감사 — 2026 글로벌 급성장 브랜드 추가
      // SKIN1004: 마다가스카르 센텔라 라인, 글로벌 센텔라 카테고리 1위급 성장
      'SKIN1004 Madagascar Centella ampoule review sensitive skin before after results',
      'SKIN1004 vs COSRX centella products which centella line is better comparison guide',
      // roundlab (라운드랩): 독도 토너 Amazon K-Beauty 상위, 저자극 미니멀 스킨케어
      'round lab dokdo toner review oily combination skin before after hydration test',
      'round lab birch juice moisturizing best products for dry skin complete guide',
      // Torriden: 히알루론산 다이브인 세럼 Amazon #1 K-Beauty serum
      'Torriden dive in serum review hyaluronic acid best for dehydrated skin guide',
      'Torriden low molecular hyaluronic acid vs ordinary hyaluronic acid comparison guide',
      // GLP-1/Ozempic skin — 2025-2026 급부상 키워드 (약물 후 피부 변화 관리)
      'Ozempic face skincare routine how to care for skin after GLP-1 weight loss Korean products',
      'GLP-1 skin changes collagen loss sagging Korean skincare solutions guide 2026',
      // K-Beauty 더마 vs 유럽 더마 비교 — 검색 의도 높은 비교 앵글
      'Korean dermacosmetics vs European La Roche Posay CeraVe which is better for sensitive skin',
      'Aestura vs CeraVe for eczema atopic skin Korean vs Western dermacosmetics comparison',
      // 2026 K-Beauty 신기술/포맷 트렌드
      'Korean skincare device LED mask microcurrent at home best products guide 2026',
      'K-Beauty probiotic skincare best products for microbiome balance guide 2026',
      // ── 전문가 감사 추가 (2026-03-18 batch 19): 누락 트렌드·브랜드·플랫폼 보완 ──
      // Olive Young Global 미국 직접 판매 — 2025 공식 론칭, Amazon 대항마
      'Olive Young Global vs Amazon which is better for buying Korean skincare 2026',
      'Olive Young Global app how to buy Korean skincare shipped to USA guide 2026',
      'Olive Young Global US shipping review how fast delivery cost 2026 guide',
      'Olive Young Global exclusive products not on Amazon what to buy 2026',
      // Copper peptide — 2025-2026 최대 펩타이드 세부 성분 트렌드, 기존 "peptide" 키워드와 세분화
      'best Korean copper peptide serum for anti-aging skin firming ranked 2026',
      'copper peptide Korean skincare benefits explained how it works for wrinkles guide',
      'copper peptide vs regular peptide vs retinol Korean anti-aging comparison 2026',
      // Short-form skincare (TikTok/YouTube Shorts) — 콘텐츠 포맷 키워드 누락
      'Korean 3-step skincare routine TikTok short routine guide quick easy 2026',
      'K-Beauty 60-second skincare routine morning evening quick guide 2026',
      'viral Korean skincare TikTok products that actually work ranked 2026',
      'Korean skincare shorts routine minimalist 5 products only guide 2026',
      // goodal (구달) — Olive Young 글로벌 Top 3 브랜드, 비타민C 세럼 베스트셀러, 시드 키워드 완전 누락
      'goodal vitamin C serum review before after dark spots brightening 2026',
      'goodal green tangerine vita C serum vs other Korean vitamin C comparison 2026',
      'goodal best products ranked Olive Young bestseller guide 2026',
      // skinfood (스킨푸드) — 2025 리뉴얼 재런칭, 자연 식물 성분 브랜드 부활
      'skinfood brand relaunch 2025 best products ranked what changed review 2026',
      'skinfood Royal Honey propolis enrich essence review moisturizing 2026',
      // K-Beauty at Costco — 대량 구매 세그먼트, 구매 의도 최고
      'best Korean skincare at Costco deals what to buy K-Beauty 2026 ranked',
      // Sephora K-Beauty 독점 — 글로벌 프레스티지 채널
      'best Korean skincare at Sephora exclusive K-Beauty brands ranked 2026',
      'Sephora vs Ulta for Korean skincare which has better K-Beauty selection 2026',
    ],
    contentTypes: ['product-review', 'best-x-for-y', 'x-vs-y', 'how-to', 'listicle', 'case-study', 'deep-dive', 'news-explainer'],
    adSenseRpm: 'high',
    pillarTopics: [
      'Korean Skincare Routine: Complete Step-by-Step Guide',           // 루틴 허브 — 모든 how-to/beginner 키워드의 앵커
      'K-Beauty Ingredients Dictionary: Every Active Explained A-Z',    // 성분 허브 — 성분 비교/심화 키워드 앵커
      'Best Korean Sunscreens: Ultimate SPF Guide',                    // 선크림 허브 — PA/UV필터/톤업/포맷 키워드 앵커
      'Where to Buy Korean Skincare: Complete Shopping Guide',          // 쇼핑 허브 — Olive Young/Amazon/리테일 키워드 앵커
      'Korean Skincare for Every Skin Type: Personalized Guide',        // 피부타입 허브 — 건성/지성/복합/민감 키워드 앵커
      'Korean Skincare by Age: Your 20s, 30s, 40s, 50s+ Complete Guide', // 연령대 허브 — 연령별 루틴/제품 키워드 앵커
      'K-Beauty for Men: Complete Skincare Guide from Basics to Advanced', // 12차 감사: 남성 K-Beauty 허브 — 군대 컨텍스트 + 제품 앵커
      'K-Beauty Anti-Aging Routine: Prevention to Treatment Complete Guide', // 12차 감사: 안티에이징 허브 — 콜라겐 뱅킹, 주름개선 앵커
      'Korean Acne Skincare: Step-by-Step Guide for Every Age and Skin Type', // 12차 감사: 여드름 허브 — 활성여드름/색소/흉터 앵커
      'K-Beauty Dermacosmetics Guide: Aestura, Dr.G, CNP and Clinical Skincare', // 14차 감사: 더마코스메틱 허브 — 더마브랜드/병원급 제품 앵커
      'K-Beauty Lip Products Guide: Best Korean Lip Tints, Oils, and Glosses', // 17차 감사: 립 허브 — rom&nd/Peripera/립틴트/립오일 앵커
      'Olive Young Global Shopping Guide: How to Buy Korean Skincare Shipped Worldwide', // 19차 감사: 올리브영 글로벌 허브 — 직구/배송/가격비교 앵커
    ],
  },

  // ── K-Entertainment: AdSense 트래픽 중심 ──
  // 전략: 팬덤 트래픽·뉴스·바이럴 리스티클로 페이지뷰 극대화
  {
    id: 'k-entertainment-business',
    name: 'K-Pop & K-Drama',
    category: 'K-Entertainment',
    broadTerm: `K-pop ${new Date().getFullYear()}`,
    broadTermsExtra: [
      `K-drama ${new Date().getFullYear()}`,
      `Korean movie ${new Date().getFullYear()}`,
      'Korean webtoon',
    ],
    seedKeywords: [
      // BTS — 글로벌 최고 검색량 (2026년: 전원 전역 완료, 그룹 컴백 앵글 중심)
      // NOTE: 모든 멤버 2025년 중반까지 전역 완료 — "after military service" 앵글은 과거완료형으로 작성
      'BTS group comeback 2026 what fans need to know full guide',
      'BTS members solo activities ranked 2026 update',
      // 4세대 주력 그룹 — 급상승 트래픽
      // NOTE: NewJeans — 2025년 12월 어도어 독립 활동 시작, 일부 법적 이슈 진행 중 (2026).
      //       콘텐츠 작성 시: 소속사 분쟁 내러티브 지양, 독립 음악·팬덤 중심 작성. 법적 확정 사항은 단정 금지.
      //       그룹명 'NewJeans' 사용은 팬덤 관점에서 가능하나, 소속사·계약·상표 관련 확정 주장은 일절 금지.
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
      // NOTE: 'K-pop idol skincare routine/products' 계열 키워드는 K-Beauty 섹션에 이미 있음 (cannibalization 방지)
      // 여기서는 "비주얼 분석/스타일링 문화" 앵글로 차별화 — 제품 추천 X, 팬 문화 O
      'K-pop idol no-makeup visual how idols maintain visuals explained fan culture guide',
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
      // K-Drama 장르 확장 — SF/판타지, 좀비, 법정 (누락 세그먼트)
      'best Korean sci-fi fantasy dramas 2026 ranked must watch supernatural',
      'best Korean zombie dramas ranked Kingdom All of Us Are Dead 2026 guide',
      'best Korean legal courtroom dramas 2026 ranked lawyer judge shows guide',
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
      // ── 전문가 감사 추가 (2026-03-17 batch 5): 누락 그룹 + 키워드 보완 ──
      // NMIXX (엔믹스) — JYP Entertainment 4세대 대표 걸그룹 (2022 데뷔), MIXXPOP 장르 창시, 전문가 감사에서 완전 누락 발견
      'NMIXX JYP girl group songs ranked MIXXPOP concept explained guide 2026',
      'NMIXX members profile guide for new fans 2026',
      'NMIXX comeback 2026 album review concept explained fans guide',
      'NMIXX MIXXPOP genre explained what is it vs regular K-pop difference guide',
      'NMIXX vs aespa vs IVE vs NewJeans 4th gen girl group comparison guide 2026',
      // xikers (싸이커스) — KQ Entertainment (ATEEZ 후배), 해외 팬덤 급성장 2025-2026
      'xikers KQ Entertainment debut story concept explained guide new fans 2026',
      'xikers songs ranked best tracks for new fans guide 2026',
      'xikers vs ATEEZ KQ Entertainment how two boy groups differ comparison guide',
      // VCHA (비차) — JYP x Republic Records 글로벌 걸그룹, A2K 서바이벌 출신
      'VCHA JYP global girl group debut story A2K survival show explained guide',
      'VCHA songs ranked best tracks for new fans guide 2026',
      'VCHA vs KATSEYE global K-pop girl groups compared 2026 guide',
      // n.SSign (엔싸인) — n.CH Entertainment, Boys Be Brave 서바이벌 출신
      'n.SSign debut story Boys Be Brave survival show explained guide new fans',
      'n.SSign songs ranked best tracks for new fans guide 2026',
      // BL 드라마 (Boys Love) — 2024-2025 한국 BL 드라마 시장 급성장, 글로벌 팬덤 폭발
      'best Korean BL dramas ranked must watch boys love series 2026 guide',
      'Korean BL drama vs Thai BL drama which to watch comparison guide 2026',
      'Korean BL drama where to watch streaming platforms international guide 2026',
      'best Korean BL drama actors rising stars ranked 2026 guide',
      // K-웹드라마 — YouTube/TikTok 기반 웹드라마 (Playlist Global, 틱톡 숏폼 드라마)
      'best Korean web dramas YouTube 2026 short episodes must watch ranked',
      'Korean web drama vs TV drama differences explained which to watch guide',
      'best Korean short form drama TikTok YouTube Playlist Global ranked 2026',
      // 팬 투어 / 성지순례 — K-pop agency tour, 아이돌 맛집·카페, 촬영지
      'K-pop agency tour Seoul HYBE Insight SM Artium JYP complete guide 2026',
      'K-pop idol favorite restaurants cafes Seoul pilgrimage guide fans 2026',
      'K-drama filming locations tour Seoul Jeju how to visit guide 2026',
      'Hallyu pilgrimage Seoul complete fan tour guide K-pop K-drama spots 2026',
      // 포카 그레이딩 / 수집가용 — PSA grading, mint condition, trading tips
      'K-pop photocard grading guide PSA condition how to grade value 2026',
      'K-pop photocard price guide most expensive rare cards how to value 2026',
      'how to sell K-pop photocards safely online best platforms trading guide 2026',
      // Weverse DM vs Bubble 실사용 비교 — 비용, 빈도, 콘텐츠 질
      'Weverse DM vs Bubble detailed comparison which K-pop subscription is worth it 2026',
      'Bubble app for K-pop fans cost content frequency honest review guide 2026',
      'is Weverse premium membership worth it what you get honest review 2026',
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
      // NOTE: Wavve was absorbed by TVING in 2025 — no longer a separate platform. Use TVING-focused keywords.
      'TVING absorbed Wavve Korean OTT consolidation what it means for subscribers explained 2025',
      'Korean OTT landscape 2026 TVING vs Coupang Play Netflix which is best guide',
      // 한국 예능 (비아이돌) — 글로벌 시청자 급증, Netflix 예능 구독 유입
      'best Korean variety shows for beginners 2026 ranked must watch',
      'Korean variety shows on Netflix 2026 funniest shows ranked guide',
      'Running Man vs Knowing Bros which Korean variety show to watch first guide',
      'I Live Alone Korean variety show why it is so popular explained 2026',
      // 버라이어티 게임 규칙 설명 — 에버그린 + 글로벌 팬 필수 정보
      'Running Man games rules explained for international fans complete guide',
      'Knowing Bros entrance test questions translated funniest moments explained guide',
      // K-팝 댄스 커버 — YouTube/TikTok 검색량 최고 에버그린 카테고리
      'how to learn K-pop dance for beginners best tutorials step by step guide 2026',
      'best K-pop dance cover tutorials ranked easy to hard beginner to advanced 2026',
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
      // 5세대 그룹 (Gen 5) — WHIPLASH, TWS 키워드는 상단에 이미 존재 (cannibalization 방지)
      // ── 전문가 감사 추가 (2026-03-16 batch 21): 누락된 K-Entertainment 핵심 세그먼트 ──
      // K-Drama 작가/감독 스포트라이트 — 저경쟁 권위 구축 (오토르 중심 콘텐츠)
      'best Korean drama writers screenwriters who created top K-dramas explained 2026',
      'top K-drama directors 2026 who made the best Korean shows guide',
      'Kim Eun-sook best K-dramas ranked Goblin Crash Landing on You guide',
      'Park Chan-wook K-drama film director style explained best works guide 2026',
      'Park Hoon-jung best Korean thriller films dramas ranked guide 2026',
      // 8차 감사: K-Movie 감독 확장 — 봉준호, 황동혁, 연상호 등 누락
      'Bong Joon-ho complete filmography ranked Parasite Mickey 17 guide 2026',
      'Hwang Dong-hyuk directing style Squid Game what makes him unique explained',
      'Yeon Sang-ho films ranked Train to Busan Hellbound guide 2026',
      'Korean movie directors who won international film festivals complete list guide',
      'best Korean thriller film directors Na Hong-jin Ryoo Seung-wan ranked guide',
      // K-Drama 제작 비하인드 — 고참여율 팬 딥다이브 콘텐츠
      'how K-dramas are made production process explained behind the scenes 2026',
      'Korean drama filming locations Seoul Jeju where to visit sets guide 2026',
      'K-drama budget explained how much Korean dramas cost to produce guide',
      'K-pop music video production behind the scenes how MVs are made guide 2026',
      'K-pop producer spotlight Black Eyed Pilseung how they create hits explained',
      // 글로벌 팬덤 지역 확장 — 동남아·중남미·중동 (영어권 미개척 세그먼트)
      'K-pop fandom in Southeast Asia Philippines Indonesia Thailand why so huge 2026',
      'K-drama popularity in Latin America why Spanish speakers love Korean shows 2026',
      'K-pop in Middle East Saudi Arabia UAE how Hallyu spread to Arab fans explained',
      'K-pop Latin America fan community how Mexican Brazilian fans fell in love guide',
      'K-drama in India why Korean shows became popular Bollywood comparison 2026',
      // K-팝 아이돌 웰니스/번아웃 — YMYL 세이프 앵글 (팬 지지 관점 전용)
      // NOTE: 의학적 진단·처방 내용 일절 금지. "consult a professional" 면책 필수
      'how fans can support idol mental health K-pop wellness culture 2026 guide',
      'K-pop comeback schedule explained why idols have busy year how fans help support',
      'K-pop idol burnout prevention how the industry is changing fan culture 2026',
      'healthy K-pop fandom habits how to support idols without toxic fan culture guide',
      // K-Drama 합법 무료 스트리밍 — YouTube CJ ENM 파트너십 활용 가이드
      'how to watch K-dramas for free legally YouTube CJ ENM Viki 2026 guide',
      'free K-drama streaming platforms no subscription legally watch guide 2026',
      'best free K-drama apps legally available no subscription required 2026',
      'KBS World YouTube free K-dramas guide how to watch legally guide',
      // 아이돌 솔로 커리어 분석 — 팬덤 흥미 고관여 콘텐츠
      'which K-pop idols succeeded with solo careers analysis best examples 2026',
      'solo vs group career K-pop which format succeeds best explained 2026',
      'K-pop idol solo debut what makes or breaks a solo career explained guide',
      'BLACKPINK members solo success why Jennie Lisa Jisoo Rose all did well 2026',
      // K-Drama 웹툰 원작 IP 트래킹 — 팬 기대감 + 비즈니스 앵글
      'which webtoons are being adapted into K-dramas 2026 upcoming confirmed list',
      'best webtoons that should become K-dramas 2026 fan wish list guide',
      'Naver Webtoon vs Kakao Webtoon which has more K-drama adaptations 2026',
      'K-drama based on novel vs webtoon which are better ranked comparison 2026',
      // K-팝 서바이벌 쇼 트래킹 — 시즌 높은 트래픽
      'best K-pop survival shows ranked all time Produce 101 Boys Planet guide',
      'Boys Planet vs Girls Planet which survival show produced better groups 2026',
      'upcoming K-pop survival audition shows 2026 schedule what to watch',
      // K-팝 음악 차트 심화 교육 — 허브 페이지 앵커 (기존 1개에서 확장)
      'how to vote on Melon chart explained international fans guide 2026',
      'Hanteo vs Circle Chart physical sales vs streaming which counts more 2026',
      'how K-pop charts work complete beginner guide Melon Genie Circle 2026',
      // K-Drama 제작사/스튜디오 분석 — 권위 구축 에버그린
      'best K-drama production companies studios ranked most successful 2026 guide',
      'Studio Dragon vs JTBC Studios vs SLL which makes best K-dramas comparison',
      'tvN vs JTBC vs Netflix Korea which platform produces best K-dramas 2026',
      // ── 전문가 감사 추가 (2026-03-16 batch 22): 동남아 심화·아이돌 경력·팬덤·AI·크로스니치 ──
      // 동남아 팬덤 심화 — 베트남·인도네시아 개별 심화 (기존 광역 키워드 보완)
      'K-pop fandom in Vietnam largest Southeast Asia market explained 2026 guide',
      'K-drama popularity in Indonesia why fans obsessed streaming habits 2026',
      'Thai K-pop fans concert tourism Bangkok guide tickets travel 2026',
      'K-pop concert tours Southeast Asia 2026 Bangkok Jakarta Manila schedule guide',
      // 아이돌 커리어 전환 심화 — age-out·CEO·군 복귀
      'K-pop idol career after 35 what happens retirement transition explained 2026',
      'K-pop idol to actor transition success rate who made it best examples 2026',
      'K-pop idol entrepreneur CEO beauty brand post-career business guide 2026',
      'K-pop military service impact on career comeback strategy explained 2026',
      // K-팝 인디 레이블 — Big 3 외 신흥 독립 레이블 (저경쟁 권위 구축)
      'Korean indie K-pop labels vs Big 3 SM JYP YG HYBE comparison 2026 guide',
      'best K-pop groups from small labels indie agencies 2026 hidden gems',
      'THEBLACKLABEL Kakao M FNC vs Big 4 entertainment agencies compared 2026',
      // AI·딥페이크 K-팝 — 2025-2026 Reddit 최상위 트렌드, 고참여 교육 콘텐츠
      'AI deepfakes in K-pop music videos explained concerns fans should know 2026',
      'AI-generated K-pop idols virtual vs real which is winning fans 2026 guide',
      'how K-pop companies use AI for music production what fans need to know 2026',
      // 콘서트 기술·메타버스 — 온라인 팬 참여 신흥 카테고리
      'K-pop virtual concerts metaverse experiences how to join from abroad 2026 guide',
      'best platforms to watch K-pop concert live streams beyond YouTube 2026',
      'how to attend K-pop online concerts fan guide technology requirements 2026',
      // K-Drama 심리·사회적 분석 — 고참여 팬 토론 유발 콘텐츠
      'K-drama toxic relationship tropes explained criticism why fans love anyway 2026',
      'K-drama vs Western TV storytelling differences format pace explained guide',
      'K-pop vs Western pop music production difference what makes K-pop unique 2026',
      // 팬덤 독성·사이상 교육 — 고관여 팬 서치, YMYL 세이프
      // NOTE: 아이돌 개인 스토킹 사례 구체화 금지, 교육적 문화 분석 앵글만 허용
      'saesang fan culture explained why it happens K-pop idol privacy guide 2026',
      'toxic K-pop fandom behaviors how to avoid explained healthy fan guide 2026',
      'K-pop fandom spending healthy limits finance guide how much is too much 2026',
      // 크로스니치: 아이돌 뷰티 브랜드 협업 — K-Beauty ↔ K-Entertainment 최고 수익 브릿지
      'K-pop idol beauty brand collaboration 2026 new launches which to buy guide',
      'IU Laneige collaboration products what is worth buying review 2026',
      'BLACKPINK Clio brand ambassador products complete buying guide 2026',
      'best skincare products used by K-drama actors in dramas revealed 2026',
      'K-drama character makeup look recreate products step by step guide 2026',
      // K-Drama 헐리우드 리메이크 — 고관심 팬 서치
      'which K-dramas are getting Hollywood remakes US adaptation 2026 list',
      'K-drama vs Hollywood remake comparison which is better fans say 2026',
      // K-Drama 사운드트랙 비즈니스 심화
      'K-drama OST revenue model how artists profit from soundtracks explained 2026',
      'best K-drama OST labels artists who specialize in soundtracks 2026 guide',
      // BIGBANG 재결합 추측 — 팬덤 초고관심 투기적 콘텐츠 (헤지 필수)
      // NOTE: 공식 발표 기준으로만 작성 — 미확인 컴백 추정 단정 금지
      'BIGBANG reunion 2026 possibility what fans know update guide',
      'G-Dragon TOP Taeyang Daesung BIGBANG solo vs group what is happening 2026',
      // 2NE1 재결합 — 글로벌 고관심 이벤트
      '2NE1 reunion concert 2026 what fans need to know complete guide',
      // K-팝 글로벌 음악 시장 비교 분석 — 에버그린 권위 콘텐츠
      'how K-pop idols are trained years debut timeline system explained guide',
      'K-pop entertainment contracts explained what idols sign guide 2026',
      'Korean entertainment Big 4 SM JYP YG HYBE training system compared 2026',
      // ── 전문가 감사 추가 (2026-03-17): 누락된 K-Entertainment 핵심 세그먼트 ──
      // tripleS 시스템 딥다이브 — 24멤버 로테이션 유닛 (K-pop 유일무이 구조)
      'tripleS MODHAUS 24 member system Cosmo voting units explained complete guide 2026',
      'tripleS all units explained which subunit to follow guide new fans 2026',
      // ILLIT 2026 — 뉴진스 유사성 논란 이후 독자적 정체성 확립 앵글
      'ILLIT 2026 musical identity what makes them different explained guide fans',
      // YOUNG POSSE / BADVILLAIN — 2024-2025 데뷔 걸그룹 누락
      'YOUNG POSSE girl group songs concept explained guide new fans 2026',
      'BADVILLAIN debut concept songs ranked guide for new fans 2026',
      // K-Hip-Hop / K-R&B — 완전 누락 세그먼트 (아이돌 외 K-music)
      'best K-R&B artists 2026 DEAN Crush Zion.T ranked guide for new listeners',
      'K-hip-hop artists ranked 2026 Jay Park pH-1 who to listen to guide',
      'K-R&B vs K-pop what is the difference explained genre guide 2026',
      'best Korean indie music artists bands 2026 beyond K-pop guide',
      // K-Drama 웹소설 원작 — 웹툰만 커버, 웹소설(카카오페이지/네이버시리즈) 누락
      'K-drama based on web novel Kakao Page Naver Series which to watch 2026',
      'best web novel K-dramas 2026 ranked adapted from Korean online fiction guide',
      'webtoon vs web novel K-drama adaptations which are better comparison 2026',
      // Netflix K-Drama 글로벌 Top 10 분석 — 매주 갱신 에버그린 반복 콘텐츠
      'Netflix top 10 K-dramas this week worldwide rankings explained 2026',
      'most popular K-dramas on Netflix 2026 global viewership hours ranked analysis',
      'why Korean dramas dominate Netflix global top 10 explained analysis 2026',
      // K-Drama 굿즈/어필리에이트 — AdSense-only 수익 다각화
      'best K-drama merchandise where to buy official OST albums goods guide 2026',
      'K-pop album buying guide which version to buy photocards explained 2026',
      'best K-drama streaming subscription comparison Netflix TVING Viki which to buy 2026',
      // K-Pop 티켓팅 가이드 — 전환율 높은 콘텐츠
      'how to buy K-pop concert tickets guide Ticketmaster Interpark tips 2026',
      'K-pop concert ticketing tips how to secure tickets fast fan guide 2026',
      // 이벤트 결과 자동 트리거 키워드
      'MAMA Awards 2026 winners complete list results recap guide',
      'Baeksang Arts Awards 2026 winners complete list best drama best actor results',
      'Golden Disc Awards 2026 winners complete results K-pop album recap',
      'Melon Music Awards 2026 winners complete list results analysis',
      // 숏폼 콘텐츠 — YouTube Shorts/TikTok 검색 의도 키워드
      'best K-pop dance challenges 2026 trending TikTok easy to learn guide',
      'K-pop TikTok viral moments 2026 best clips that broke the internet ranked',
      // 팬덤명 교육 — 글로벌 팬 필수 콘텐츠
      'K-pop fandom names complete list every group official fan name guide 2026',
      // ── 전문가 감사 추가 (2026-03-17 batch 2): 누락된 K-Entertainment 핵심 세그먼트 ──
      // 한국 뮤지컬 — 완전 누락 세그먼트 (뮤지컬 한류 급성장)
      'best Korean musicals to watch ranked complete guide 2026',
      'Korean musical actors singers best performers ranked guide 2026',
      'how to watch Korean musicals internationally tickets streaming guide 2026',
      'Korean musical vs Broadway comparison what makes K-musical unique explained',
      'K-pop idols in musicals best performances Doyoung Kyuhyun ranked 2026',
      // K-pop 세계관(lore) 종합 비교 허브 — aespa만 있고 그룹별 비교 없었음
      'K-pop group universes lore explained aespa ENHYPEN TXT tripleS comparison guide 2026',
      'best K-pop lore universes ranked most complex storylines explained guide',
      'how K-pop worldbuilding works KWANGYA Cosmo explained beginner guide 2026',
      // K-Drama OST 플레이리스트 — Spotify/Apple Music 검색 의도 키워드 누락
      'best K-drama OST playlist Spotify Apple Music 2026 complete guide',
      'K-drama sad OST songs playlist ranked best emotional soundtracks guide',
      'K-drama romantic OST songs playlist best love theme songs ranked 2026',
      // 14차 감사: OST 허브 보강 — 아티스트 크로스오버 + 스트리밍 가이드
      'how K-drama OST songs are made behind the scenes production process explained',
      'K-drama OST vs K-pop comeback which generates more streams data comparison 2026',
      'best K-drama OST duets couple songs romantic soundtracks ranked guide 2026',
      // 한국 웹예능/YouTube 예능 — 피식대학, 숏박스, 워크맨 등 완전 누락
      'best Korean YouTube variety shows web entertainment 2026 ranked guide',
      'Korean web variety shows explained Workman Psick University Short Box guide fans',
      'Korean YouTube variety vs TV variety shows comparison which to watch guide 2026',
      // K-pop 포토카드 트레이딩 플랫폼 비교 — "how to trade" 1개뿐, 플랫폼 비교 누락
      'best K-pop photocard trading apps platforms compared 2026 where to buy sell guide',
      'K-pop photocard market price guide how to value rare photocards 2026',
      'K-pop photocard collecting for beginners complete buying trading guide 2026',
      // ── 전문가 감사 추가 (2026-03-17 batch 6): 누락 그룹·장르·문화현상 ──
      // ITZY (있지) — JYP 4세대 대표 걸그룹 (2019 데뷔), 글로벌 투어 활발, 시드 키워드 완전 누락
      'ITZY best songs ranked complete discography guide for new fans 2026',
      'ITZY comeback 2026 album review concept analysis guide fans',
      'ITZY member profiles guide ages facts for new fans 2026',
      'ITZY vs aespa vs IVE 4th gen girl group comparison which to stan guide 2026',
      // Street Dance Shows — SWF/SMF/SDGF, Mnet 최고시청률 리얼리티
      'Street Woman Fighter SWF best dance crews ranked complete guide 2026',
      'Street Man Fighter SMF best dance crews ranked 2026 guide',
      'Korean street dance competition shows SWF SMF explained for beginners guide',
      'best Korean dance crews to follow after Street Woman Fighter ranked 2026',
      // Trot (트로트) — 한국 국내 콘서트 매출 #1 음악 장르, 완전 누락
      // NOTE: 타겟 독자가 30-60대 한국인 + 해외 한국 문화 팬이므로 영어 키워드도 유효
      'Korean trot music explained what is trot genre history guide for beginners',
      'Lim Young-woong best songs ranked Korean trot singer guide 2026',
      'best Korean trot singers ranked Mr Trot Miss Trot stars guide 2026',
      'Mr Trot Miss Trot TV show explained Korean singing competition guide',
      // K-Ballad 독립 아티스트 — Melon 일간 차트 상위 고정, 아이돌과 다른 음악 세그먼트
      'best Korean ballad singers 2026 Paul Kim 10cm Lee Mujin ranked guide',
      'best Korean ballad songs playlist emotional all time classics ranked guide',
      'Lee Mujin best songs ranked Korean ballad singer guide 2026',
      // Manhwa-to-Anime 파이프라인 — Solo Leveling, Tower of God, 2025-2026 최대 한국 IP 수출
      // NOTE: webtoon-to-K-drama와 구분 (다른 미디어 파이프라인)
      'best Korean manhwa webtoon anime adaptations 2026 Solo Leveling Tower of God ranked',
      'Korean webtoon to anime vs webtoon to K-drama which adaptations are better guide',
      'Solo Leveling anime vs manhwa differences comparison guide what changed 2026',
      // fromis_9 (프로미스나인) — PLEDIS/HYBE 걸그룹, 2024-2026 활발 컴백
      'fromis_9 best songs ranked guide for new fans 2026',
      'fromis_9 member profiles PLEDIS HYBE group guide 2026',
      // Dreamcatcher (드림캐쳐) — 록/메탈 컨셉 걸그룹, 서양 팬덤 최대급
      'Dreamcatcher best songs ranked rock metal K-pop guide new fans 2026',
      'Dreamcatcher unique concept explained why they are different from other K-pop groups',
      // Kep1er (케플러) — Girls Planet 999 출신, 2025년 3월 해체 (프로젝트 그룹)
      // NOTE: 해체 후 멤버 활동 앵글로 작성 — 그룹 컴백은 없음
      'Kep1er members after disbandment where are they now solo activities 2026 guide',
      'Kep1er best songs ranked Girls Planet 999 legacy complete guide',
      // Case Study / Deep-Dive 비율 보강
      'how BTS became the biggest boy band in history growth timeline explained deep dive',
      'how BLACKPINK conquered global music fashion industry case study analysis 2026',
      'how Netflix changed K-drama industry global distribution model case study explained',
      'the economics of K-pop photocard collecting why fans buy multiple albums explained',
      'how aespa KWANGYA universe changed K-pop storytelling deep dive concept analysis',
      'HYBE vs SM vs JYP vs YG business model comparison K-pop Big 4 deep dive 2026',
      // ── 전문가 감사 추가 (2026-03-17 batch 9): 3세대 핵심 그룹 + 누락 보이그룹 + 문화 세그먼트 ──
      // SHINee (샤이니) — SM 3세대 레전드, 2025-2026 솔로+그룹 활발, 시드 키워드 완전 누락
      'SHINee best songs ranked complete discography guide for new fans 2026',
      'SHINee members solo activities 2026 Taemin Key Minho Onew update guide',
      'SHINee legacy explained how they shaped K-pop history guide 2026',
      // Red Velvet (레드벨벳) — SM 3세대 걸그룹, 듀얼 컨셉(Red+Velvet), 시드 키워드 완전 누락
      'Red Velvet best songs ranked Red vs Velvet concept guide new fans 2026',
      'Red Velvet comeback 2026 what fans need to know update guide',
      'Red Velvet members solo activities Wendy Joy Irene Seulgi Yeri 2026 guide',
      // GOT7 (갓세븐) — 자체 레이블 독립, 7인 전원 JYP 떠남 후 그룹 유지 유일무이 사례
      'GOT7 independent group story how they left JYP and stayed together guide',
      'GOT7 best songs ranked complete discography guide for new fans 2026',
      'GOT7 members solo activities 2026 Jay B Jackson Bambam Mark update guide',
      // DAY6 (데이식스) — JYP 밴드, 2024-2025 역대급 역주행 Melon 장기 1위, QWER 있는데 DAY6 없음
      'DAY6 best songs ranked complete discography guide for new fans 2026',
      'DAY6 comeback 2026 band resurgence why they went viral again explained',
      'DAY6 vs QWER Korean band idol comparison which to listen to guide 2026',
      'DAY6 concert tour 2026 what fans need to know setlist fan experience',
      // THE BOYZ (더보이즈) — IST 소속, Road to Kingdom 우승, 퍼포먼스 특화 보이그룹
      'THE BOYZ best songs ranked performance guide for new fans 2026',
      'THE BOYZ Road to Kingdom story how they won explained guide',
      'THE BOYZ member profiles who is who complete guide new fans 2026',
      // TREASURE (트레저) — YG 보이그룹, 동남아 팬덤 최강, YG 유일 보이그룹
      'TREASURE YG boy group best songs ranked guide for new fans 2026',
      'TREASURE comeback 2026 what fans need to know update guide',
      'TREASURE vs BABYMONSTER YG groups compared boy group vs girl group 2026',
      // BTOB (비투비) — 3.5세대, 예능 킹, 보컬 최강 보이그룹, 충성 팬덤 Melody
      'BTOB best songs ranked vocal kings of K-pop guide new fans 2026',
      'BTOB variety show best moments why they are funniest K-pop group guide',
      'BTOB members solo activities 2026 Peniel Changsub Hyunsik Eunkwang update',
      // K-pop 공항패션 / 아이돌 패션 — 검색량 매우 높은 에버그린 카테고리, 완전 누락
      'K-pop idol airport fashion best outfits 2026 style guide who wears what',
      'best dressed K-pop idols 2026 fashion icons ranked style guide',
      'K-pop idol luxury brand outfits airport fashion analysis where to buy 2026',
      'K-pop idol fashion trends 2026 what styles are popular streetwear guide',
      // 팬 크리에이티브 문화 — 팬에디트, 팬아트, 팬픽 글로벌 팬덤 핵심 활동
      'K-pop fan edit how to make guide best apps tutorials beginners 2026',
      'K-pop fan art culture explained digital art traditional what fans create guide',
      'K-pop fan fiction culture AO3 Wattpad explained guide for new fans 2026',
      'best K-pop fan content platforms where fans create share art edits 2026',
      // K-pop 커버 댄스 대회 — 글로벌 현상, KCON 연계, 대형 커뮤니티
      'K-pop cover dance competition how to enter win guide beginners 2026',
      'best K-pop cover dance teams worldwide ranked global competition 2026',
      'KCON cover dance competition how to apply tips what judges look for guide',
      // 아이돌 유튜브 채널 / 콘텐츠 크리에이터 — 성장 세그먼트
      'best K-pop idol YouTube channels to subscribe 2026 vlogs behind scenes ranked',
      'K-pop idols as content creators YouTube channels worth watching guide 2026',
      // ── 전문가 감사 추가 (2026-03-17 batch 16): 누락된 K-Entertainment 세그먼트 ──
      // 음악방송 (Music Show) 가이드
      'Korean music shows explained M Countdown Music Bank Inkigayo complete guide 2026',
      'how to vote on Korean music shows Inkigayo Music Bank guide international fans 2026',
      'how K-pop music show wins work criteria explained M Countdown THE SHOW guide',
      'K-pop music show wins record most wins all time ranked 2026 guide',
      // 컴백 쇼케이스
      'what is K-pop comeback showcase explained how it works fan guide 2026',
      'how to watch K-pop comeback showcase live online international fans guide 2026',
      // 한국 웹툰 (독립 세그먼트)
      'best Korean webtoons to read 2026 ranked for beginners English translated guide',
      'Naver Webtoon vs Kakao Webtoon vs LEZHIN which platform is best comparison 2026',
      'how to read Korean webtoons in English best apps platforms guide 2026',
      'best completed Korean webtoons manhwa to binge read ranked all time guide',
      // 팬캠 (Fancam) 문화
      'K-pop fancam culture explained why fans film individual members guide 2026',
      'best K-pop fancams of all time most viewed ranked guide',
      'how to film K-pop fancam tips equipment guide concert etiquette 2026',
      // Hallyu Tourism 종합
      'Seoul Hallyu travel guide K-pop K-drama fan pilgrimage complete itinerary 2026',
      'K-pop fan trip Seoul budget travel guide where to go what to see 2026',
      // ── 전문가 감사 추가 (2026-03-17 batch 17): 누락 그룹 확장·어필리에이트·문화 ──
      // KISS OF LIFE — 키워드 1개(곡 랭킹)뿐, 멤버 프로필/비기너 가이드/컨셉 설명 누락
      'KISS OF LIFE member profiles who is who complete guide new fans 2026',
      'KISS OF LIFE retro concept discography explained guide beginners 2026',
      'KISS OF LIFE comeback 2026 what fans need to know full update',
      // TWS — PLEDIS/HYBE 몬스터 루키, 키워드 1개(곡 랭킹)뿐
      'TWS member profiles PLEDIS HYBE debut guide for new fans 2026',
      'TWS concept storytelling explained how their music connects guide fans',
      'TWS comeback 2026 what fans need to know full update',
      // Xdinary Heroes — JYP 밴드, DAY6/QWER 있는데 누락
      'Xdinary Heroes JYP band members instruments concept explained guide new fans 2026',
      'Xdinary Heroes best songs ranked rock K-pop guide for new fans 2026',
      'Xdinary Heroes vs DAY6 vs QWER Korean band idol comparison which to listen 2026',
      // PURPLE KISS — RBW (MAMAMOO 후배), 독자적 팬덤
      'PURPLE KISS RBW girl group concept songs ranked guide new fans 2026',
      'PURPLE KISS comeback 2026 what fans need to know update guide',
      // H1-KEY — 글로벌 걸그룹, 다국적 멤버 앵글
      'H1-KEY global girl group multilingual members concept explained guide 2026',
      'H1-KEY songs ranked best tracks for new fans guide 2026',
      // FIFTY FIFTY — 바이럴 후 해체·재편 드라마, 교훈적 케이스 스터디
      // NOTE: 법적 분쟁 관련 확정 판결만 기술, 미확인 주장 단정 금지
      'FIFTY FIFTY rise and fall story what happened to the viral K-pop group explained 2026',
      // K-pop 앨범 구매 어필리에이트 — RPM 개선
      'where to buy K-pop albums online cheapest options Amazon Target guide 2026',
      'best websites to buy K-pop albums with photocards cheapest shipping guide 2026',
      'K-pop album pre-order guide how to pre-order get benefits photocards 2026',
      // 콘서트 티켓 어필리에이트
      'how to buy K-pop concert tickets resale StubHub Vivid Seats safe guide 2026',
      'K-pop concert ticket resale prices are they worth it how to find deals guide 2026',
      // 스트리밍 구독 어필리에이트
      'best streaming apps for K-pop music Spotify Apple Music YouTube Music compared 2026',
      'Melon app for international fans how to subscribe use guide 2026',
      // 18차 감사 — 2026 K-Entertainment 누락/강화 키워드
      // BTS 2026 완전체 컴백 — K-pop 최대 이벤트
      'BTS 2026 group comeback confirmed schedule what to expect complete guide',
      'BTS reunion album 2026 predictions tracklist members update everything we know',
      'BTS world tour 2026 cities dates how to get tickets international fan guide',
      // Squid Game Season 3 — K-Drama 최대 글로벌 이벤트
      'Squid Game season 3 Netflix release date cast plot predictions complete guide',
      'Squid Game season 3 vs season 2 what changed review analysis guide',
      // WHIPLASH — SM 신인 보이그룹 (2024 데뷔)
      'WHIPLASH members profile SM Entertainment new boy group complete guide 2026',
      'WHIPLASH debut album review SM new generation boy group analysis',
      // izna — I-LAND 2 프로젝트 그룹
      'izna members profile I-LAND 2 debut complete guide for new fans 2026',
      'izna debut album review songs ranked guide 2026',
      // UNIS — Universe Ticket 프로젝트 그룹
      'UNIS members profile Universe Ticket debut group complete guide 2026',
      // 2026 K-Drama 주요작
      'best Korean dramas 2026 must watch new releases Netflix TVING ranked guide',
      'upcoming K-dramas 2026 release schedule Netflix TVING Disney Plus complete list',
      'best Korean thriller dramas 2026 dark mystery suspense ranked guide',
      // K-Movie 글로벌 흥행작
      'best Korean movies 2026 must watch new releases theater streaming guide',
      'Korean movies at Cannes BIFF 2026 award winners predictions guide',
      // K-pop 5세대 심화
      'fifth generation K-pop groups 2025 2026 debut complete guide rookies to watch',
      'K-pop rookies 2026 best new groups debut ranked potential guide',
      // ── 전문가 감사 추가 (2026-03-18 batch 19): 누락 카테고리 대형 보완 ──
      // Korean Short Drama / 웹드라마 — 2025-2026 폭발적 성장, YouTube 숏폼 드라마 + Naver NOW
      'best Korean short dramas 2026 YouTube web drama must watch ranked guide',
      'Korean short drama vs regular K-drama what is the difference format explained 2026',
      'best Korean web dramas free to watch on YouTube 2026 ranked guide',
      'Korean short drama TikTok viral clips best romantic comedy action 2026',
      'Naver NOW Korean short drama best shows how to watch guide 2026',
      // Trot (트로트) — 국내 시청률 1위 장르, 미스터트롯/미스트롯 시리즈
      'what is trot Korean traditional pop music genre explained guide for new fans',
      'best trot songs ranked all time Korean trot music guide beginners 2026',
      'Mr Trot Miss Trot show explained contestants winners where to watch guide 2026',
      'Lim Young-woong trot singer why he is Korea number one artist explained fans 2026',
      'trot vs K-pop what is the difference Korean music genre comparison guide',
      // Korean Indie Bands — HYUKOH, Wave to Earth, The Rose, LUCY, Silica Gel (실리카겔)
      // NOTE: 아이돌이 아닌 자체 작곡/연주 밴드, K-pop과 구분 필수
      'best Korean indie bands 2026 beyond K-pop must listen Wave to Earth HYUKOH guide',
      'Wave to Earth discography ranked best songs Korean indie band guide 2026',
      'HYUKOH 혁오 best songs ranked Korean indie rock band guide for new listeners',
      'The Rose Korean band best songs comeback guide for new fans 2026',
      'LUCY Korean band best songs ranked indie orchestra concept guide 2026',
      'Silica Gel Korean indie band psychedelic experimental best songs guide 2026',
      'Korean indie music vs K-pop what is the difference genre comparison guide 2026',
      'best Korean indie music playlists Spotify Apple Music where to find guide 2026',
      // KATSEYE — HYBE x Geffen Records 글로벌 걸그룹 (The Debut: Dream Academy 출신)
      'KATSEYE HYBE global girl group debut story Dream Academy explained guide fans',
      'KATSEYE best songs ranked guide for new fans 2026',
      'KATSEYE vs XG vs VCHA global K-pop girl group comparison who to follow guide 2026',
      // YouTube Music / Spotify Korea — 스트리밍 플랫폼 차트 교육 (기존 Melon/Genie만 커버)
      'YouTube Music Korea chart how it works explained K-pop streaming guide 2026',
      'Spotify Korea K-pop chart how it differs from Melon Circle explained guide 2026',
      'best platforms to stream K-pop music Spotify vs Apple Music vs YouTube Music 2026',
      'K-pop streaming charts compared Melon Genie YouTube Music Spotify which matters most 2026',
      // Chzzk (치지직) — 네이버 라이브 스트리밍, K-pop 아이돌 라이브 + 팬소통
      'what is Chzzk Korean live streaming platform explained Naver guide fans 2026',
      'K-pop idols on Chzzk live streams how to watch international fans guide 2026',
      'Chzzk vs Weverse Live which is better for watching K-pop idol live streams 2026',
      // 한국 웹예능 (Web Variety) — 워크맨, 피식대학, 숏박스 등 YouTube 예능 급성장
      'best Korean YouTube variety shows 2026 Workman Short Box ranked guide',
      'Korean web variety shows explained Workman Psick University Short Box guide fans',
      'Korean YouTube variety vs TV variety shows comparison which to watch guide 2026',
      // Seoul Music Awards (서울가요대상) — 시즌 이벤트 보강
      'Seoul Music Awards 2026 winners nominees K-pop complete guide',
      'Melon Music Awards 2026 winners predictions complete K-pop guide',
      // K-pop idol luxury brand ambassador — 팬 검색 폭발
      'K-pop idols as luxury brand ambassadors 2026 complete list guide',
      'why luxury brands choose K-pop idols as global ambassadors explained 2026',
      // BL 드라마 — 2024-2025 한국 BL 폭발적 성장
      'best Korean BL dramas 2026 ranked must watch boys love series guide',
      'Korean BL drama vs Thai BL which is better comparison guide 2026',
    ],
    contentTypes: ['news-explainer', 'listicle', 'best-x-for-y', 'deep-dive', 'how-to', 'x-vs-y', 'case-study'],
    adSenseRpm: 'medium',
    pillarTopics: [
      'Complete Guide to K-Pop for Beginners: Everything You Need to Know',   // 입문 허브 — 팬 문화/용어/차트 키워드 앵커
      'K-Drama Streaming Guide: Where and What to Watch',                     // 스트리밍 허브 — Netflix/TVING/Viki/장르 키워드 앵커
      'K-Pop Chart System Explained: Circle, Melon, Hanteo Complete Guide',   // 차트 허브 — 올킬/PAK/음방 키워드 앵커
      'K-Pop Concert & Fan Event Guide: Tickets, Tours, KCON',               // 콘서트 허브 — 투어/티켓팅/KCON 키워드 앵커
      'K-Pop Groups by Generation: Complete Guide from 1st to 5th Gen',       // 세대 허브 — 그룹별 가이드/비교 키워드 앵커
      'Korean Entertainment Beyond K-Pop: Musicals, Movies, and Variety Shows Guide', // 비아이돌 허브 — 뮤지컬/영화/예능/K-R&B 키워드 앵커
      'K-Drama Genre Guide: Sageuk, Romance, Thriller, BL and More', // 12차 감사: K-드라마 장르 허브 — 사극/로맨스/스릴러/BL 앵커
      'K-Pop Fandom Culture Explained: Lightsticks, Photocards, Fan Events', // 12차 감사: 팬덤 문화 허브 — 포토카드/팬싸/응원봉 앵커
      'Best K-Drama OST Songs: Complete Guide to Korean Drama Soundtracks', // 14차 감사: OST 허브 — K-Drama OST/아티스트/스트리밍 앵커
      'Korean Webtoons Guide: Best Manhwa to Read and Where to Find Them', // 17차 감사: 웹툰 허브 — 네이버/카카오/LEZHIN/영어 번역 앵커
      'Best Korean Movies Guide: Thrillers, Horror, and Award Winners', // 17차 감사: 영화 허브 — 봉준호/박찬욱/넷플릭스/칸 앵커
      'Korean Short Drama Guide: Best Web Dramas on YouTube and Streaming Platforms', // 19차 감사: 웹드라마 허브 — YouTube 숏폼/Naver NOW 앵커
      'Korean Indie Music Guide: Best Bands Beyond K-Pop You Need to Hear', // 19차 감사: 인디밴드 허브 — HYUKOH/Wave to Earth/The Rose 앵커
    ],
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
