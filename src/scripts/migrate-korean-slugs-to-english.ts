/**
 * migrate-korean-slugs-to-english.ts
 * WP 발행 포스트의 한글/percent-encoded 슬러그를 영문 ASCII로 일괄 변경.
 *
 * 변환 룰:
 *   1. 종목 매핑 사전(KNOWN_STOCKS) — 자주 등장하는 종목명 → 영문 이름
 *   2. 키워드 매핑 사전(KEYWORD_MAP) — 자주 쓰는 한글 키워드 → 영문
 *   3. title에서 ASCII 부분 추출 (영문/숫자/하이픈)
 *   4. 충돌 방지: ensureUniqueSlug
 *   5. WP가 자동으로 _wp_old_slug 등록 → 옛 한글 URL은 자동 301 redirect
 *
 * Usage:
 *   node --env-file=.env --import tsx/esm src/scripts/migrate-korean-slugs-to-english.ts [--dry-run]
 */
import axios from 'axios';
import 'dotenv/config';

const WP_URL = process.env.WP_URL!.replace(/\/+$/, '');
const AUTH = Buffer.from(`${process.env.WP_USERNAME}:${process.env.WP_APP_PASSWORD}`).toString('base64');
const DRY_RUN = process.argv.includes('--dry-run');

const api = axios.create({
  baseURL: `${WP_URL}/wp-json/wp/v2`,
  headers: { Authorization: `Basic ${AUTH}` },
  timeout: 30000,
});

// 자주 등장하는 종목명 → 영문 (확장 가능)
const KNOWN_STOCKS: Record<string, string> = {
  '삼성전자': 'samsung-005930',
  'sk하이닉스': 'sk-hynix-000660',
  'SK하이닉스': 'sk-hynix-000660',
  '한솔케미칼': 'hansol-014680',
  '현대글로비스': 'glovis-086280',
  '현대위아': 'wia-011210',
  '제이아이테크': 'jitech-417500',
  '대한항공': 'koreanair-003490',
  '한화투자증권': 'hanwha-inv-003530',
  '한화솔루션': 'hanwha-sol',
  '한화시스템': 'hanwha-sys',
  '현대차': 'hyundai-005380',
  '현대차증권': 'hyundai-sec',
  '코오롱': 'kolon',
  '아모레퍼시픽': 'amorepacific',
  'lg전자': 'lg-electronics-066570',
  'LG전자': 'lg-electronics-066570',
  'lg디스플레이': 'lg-display-034220',
  'LG디스플레이': 'lg-display-034220',
  '한온시스템': 'hanon-018880',
  '휴니드': 'huneed-005870',
  '와이투솔루션': 'y2sol',
  '코스모신소재': 'cosmo-newmaterial',
  '한국단자': 'koreanjunction-025540',
  '세진중공업': 'sejinheavy',
  '파미셀': 'pharmicell-005690',
  '삼화전기': 'samhwa-electric',
  '화신': 'hwashin',
  'ds단석': 'ds-dansuk',
  '삼성에스디에스': 'samsung-sds',
  '이구산업': 'lgcu-025820',
  '산일전기': 'sanil-electric',
  '코스피': 'kospi',
  '코스닥': 'kosdaq',
  '한국은행': 'bok',
};

// 자주 쓰는 한글 키워드 → 영문 (가나다 순)
const KEYWORD_MAP: Record<string, string> = {
  '가이드': 'guide', '강세': 'strong', '거래량': 'volume',
  '결정': 'decision', '경기': 'economic', '경쟁': 'compete',
  '계획': 'plan', '골든크로스': 'golden-cross', '관심': 'watch',
  '관심주': 'watchlist', '관련주': 'related-stocks', '국채': 'bond',
  '금리': 'rate', '금융': 'finance', '급등': 'surge',
  '급락': 'drop', '기관': 'institution', '기술적': 'technical',
  '기준금리': 'base-rate', '단기': 'short-term', '데드크로스': 'dead-cross',
  '동향': 'trend', '디스플레이': 'display', '랠리': 'rally',
  '리포트': 'report', '매도': 'sell', '매물': 'overhang',
  '매수': 'buy', '매수가': 'buy-price', '매수타이밍': 'buy-timing',
  '매수후보': 'buy-candidate', '매집': 'accumulation', '목표가': 'target-price',
  '바이오': 'bio', '반도체': 'semicon', '반등': 'rebound',
  '발표': 'announce', '발행': 'issuance', '백테스팅': 'backtest',
  '밴드': 'band', '변동성': 'volatility', '보고서': 'report',
  '복합': 'composite', '볼린저밴드': 'bollinger', '분기': 'quarter',
  '분기별': 'quarterly', '분석': 'analysis', '비교': 'comparison',
  '비중': 'weight', '사상': 'historic', '상승': 'rise',
  '상승률': 'gain-rate', '상승장': 'bull-market', '상한가': 'upper-limit',
  '서프라이즈': 'surprise', '섹터': 'sector', '셀온': 'sell-on',
  '손실': 'loss', '손절': 'stop-loss', '손절가': 'stop-loss',
  '손절선': 'stop-line', '수급': 'supply-demand', '수익': 'profit',
  '수익률': 'return', '수혜주': 'beneficiary', '순매도': 'net-sell',
  '순매수': 'net-buy', '스윙': 'swing', '스퀴즈': 'squeeze',
  '스토캐스틱': 'stochastic', '시가총액': 'marketcap', '시그널': 'signal',
  '시장': 'market', '실적': 'earnings', '실적호전': 'earnings-up',
  '실전': 'practice', '약세': 'weak', '어닝': 'earnings',
  '업종': 'sector', '연결': 'consolidated', '영업이익': 'op-profit',
  '오늘': 'today', '오늘의': 'today', '외국인': 'foreign',
  '원인': 'cause', '유망': 'promising', '이번주': 'this-week',
  '이탈': 'breakout', '인상': 'hike', '인하': 'cut',
  '임박': 'imminent', '자료': 'data', '재무': 'finance',
  '저항선': 'resistance', '저점': 'low-point', '전고체': 'solid-state',
  '전망': 'forecast', '전략': 'strategy', '정리': 'summary',
  '제시': 'present', '조선': 'shipbuilding', '조선업종': 'shipbuilding',
  '종목': 'stocks', '종합': 'overall', '주가': 'price',
  '주식': 'stock', '주식시장': 'stock-market', '주식초보': 'stock-beginner',
  '주봉': 'weekly', '주봉골든크로스': 'weekly-golden', '주봉MA20위': 'above-weekly-ma20',
  '주식초보가이드': 'stock-beginner-guide', '주춤': 'pause', '주요': 'key',
  '주요종목': 'key-stocks', '중공업': 'heavy-industry', '지지선': 'support',
  '진단': 'diagnose', '진입': 'entry', '진입가': 'entry-price',
  '진입가격': 'entry-price', '집중': 'focus', '차트': 'chart',
  '채권': 'bond', '철강': 'steel', '철강주': 'steel-stock',
  '체크': 'check', '초보': 'beginner', '추세': 'trend',
  '추천': 'recommend', '추천종목': 'recommend-stocks', '카탈리스트': 'catalyst',
  '캔들': 'candle', '큰손': 'whale', '키워드': 'keyword',
  '타겟': 'target', '타이밍': 'timing', '테마': 'theme',
  '테마주': 'theme-stock', '특징주': 'special-stock', '파인': 'pivot',
  '폭락': 'crash', '평가': 'evaluate', '폭등': 'spike',
  '포착': 'spot', '포지션': 'position', '포지셔닝': 'positioning',
  '프레임워크': 'framework', '하단': 'lower', '하락': 'fall',
  '하락장': 'bear-market', '한국': 'korea', '한국주식': 'korea-stock',
  '한국주식시장': 'korea-market', '한주': 'this-week', '핵심': 'core',
  '현재가': 'current-price', '호가': 'quote', '호전주': 'earnings-up',
  '확정': 'confirmed', '환율': 'fx', '회복': 'recovery',
  '회사': 'company', '효과': 'effect', '후보': 'candidate',
  '후속': 'follow-up', '효율': 'efficiency', 'kospi': 'kospi',
  'kosdaq': 'kosdaq', 'macd': 'macd', 'rsi': 'rsi',
  '단계': 'stage', '단자': 'junction', '단석': 'dansuk',
  '계좌개설': 'account-open', '계좌': 'account', '첫매수': 'first-buy',
  '미국': 'us', '글로벌': 'global', '인공지능': 'ai',
  '소재': 'material', '신소재': 'newmaterial', '약점': 'weakness',
  '강점': 'strength', '시점': 'timing', '대비': 'vs',
  'fomc': 'fomc', 'fed': 'fed', '인플레': 'inflation',
  '디플레': 'deflation', '경기침체': 'recession', '경기회복': 'recovery',
  '경기둔화': 'slowdown', '경기확장': 'expansion',
};

interface WPPost { id: number; title: { rendered: string }; slug: string; link: string; date: string; }

async function fetchAllPosts(): Promise<WPPost[]> {
  const posts: WPPost[] = [];
  let page = 1;
  while (true) {
    try {
      const res = await api.get('/posts', {
        params: { per_page: 100, page, status: 'publish', _fields: 'id,title,slug,link,date' },
      });
      const items = res.data as WPPost[];
      if (!items.length) break;
      posts.push(...items);
      const total = parseInt(res.headers['x-wp-totalpages'] ?? '1', 10);
      if (page >= total) break;
      page++;
    } catch {
      break;
    }
  }
  return posts;
}

function hasKorean(s: string): boolean {
  return /[가-힣]/.test(s);
}

function buildEnglishSlug(post: WPPost, usedSlugs: Set<string>): string {
  const title = post.title.rendered;
  const year = post.date.slice(0, 4);
  let parts: string[] = [];

  // 1) 종목명 매핑 우선 적용 (KNOWN_STOCKS)
  for (const [ko, en] of Object.entries(KNOWN_STOCKS)) {
    if (title.toLowerCase().includes(ko.toLowerCase())) {
      parts.push(en);
      break;
    }
  }

  // 2) 종목코드 패턴 추출 (괄호 안 6자리 숫자)
  const codeMatch = title.match(/\((\d{6})\)/);
  if (codeMatch && !parts[0]?.includes(codeMatch[1])) {
    parts.push(codeMatch[1]);
  }

  // 3) 한글 키워드 → 영문 매핑
  const titleLower = title.toLowerCase();
  for (const [ko, en] of Object.entries(KEYWORD_MAP)) {
    if (titleLower.includes(ko.toLowerCase())) {
      parts.push(en);
    }
  }

  // 4) title의 영문 단어/숫자 직접 추출 (RSI, MACD, 5.9, top5 등)
  const asciiWords = title
    .replace(/[가-힣]+/g, ' ')
    .toLowerCase()
    .match(/[a-z0-9]+/g) || [];
  for (const w of asciiWords) {
    if (w.length >= 2 && !parts.includes(w) && !['the','and','for','top'].includes(w)) {
      parts.push(w);
    }
  }

  // 중복 제거 + 길이 제한
  parts = [...new Set(parts)].slice(0, 10);

  // 연도 추가 (year-sensitive 콘텐츠)
  if (!parts.includes(year)) parts.push(year);

  let slug = parts.join('-').replace(/-+/g, '-').replace(/^-|-$/g, '');

  // 비었으면 post id 기반 fallback
  if (!slug) slug = `post-${post.id}-${year}`;

  // 64자 제한 (WP slug 안전 길이)
  if (slug.length > 64) {
    slug = slug.substring(0, 64).replace(/-[^-]*$/, '');
  }

  // 충돌 방지
  let unique = slug;
  let i = 2;
  while (usedSlugs.has(unique)) {
    unique = `${slug}-v${i++}`;
  }
  usedSlugs.add(unique);
  return unique;
}

async function main() {
  console.log(`[CONFIG] dry-run=${DRY_RUN}`);
  const posts = await fetchAllPosts();
  console.log(`[FETCH] ${posts.length}개 발행 포스트`);

  // 영문 ASCII 슬러그면 skip
  const needsMigration = posts.filter(p => hasKorean(decodeURIComponent(p.slug)) || /%/.test(p.slug));
  console.log(`[FILTER] 한글/encoded 슬러그: ${needsMigration.length}개 / 이미 영문: ${posts.length - needsMigration.length}개\n`);

  // 기존 영문 슬러그도 usedSlugs에 추가 (충돌 방지)
  const usedSlugs = new Set<string>(posts.filter(p => !hasKorean(decodeURIComponent(p.slug))).map(p => p.slug));

  const plan: Array<{ post: WPPost; newSlug: string }> = [];
  for (const post of needsMigration) {
    const newSlug = buildEnglishSlug(post, usedSlugs);
    plan.push({ post, newSlug });
  }

  console.log('=== 변경 계획 ===');
  for (const { post, newSlug } of plan) {
    const decoded = decodeURIComponent(post.slug);
    console.log(`  id=${post.id}`);
    console.log(`    title: ${post.title.rendered.slice(0, 70)}`);
    console.log(`    old:   ${decoded.slice(0, 80)}`);
    console.log(`    new:   ${newSlug}`);
  }

  if (DRY_RUN) {
    console.log('\n[DRY_RUN] 실제 변경 없음 — 검토 후 --dry-run 빼고 재실행');
    return;
  }

  console.log('\n=== 실제 적용 ===');
  let ok = 0, fail = 0;
  for (const { post, newSlug } of plan) {
    try {
      await api.post(`/posts/${post.id}`, { slug: newSlug });
      console.log(`  [OK] id=${post.id} → ${newSlug}`);
      ok++;
    } catch (e) {
      const msg = axios.isAxiosError(e) ? `${e.response?.status} ${JSON.stringify(e.response?.data)}` : String(e);
      console.log(`  [FAIL] id=${post.id}: ${msg}`);
      fail++;
    }
    await new Promise(r => setTimeout(r, 300));
  }
  console.log(`\n[SUMMARY] OK=${ok} FAIL=${fail} TOTAL=${plan.length}`);
}

main().catch(err => { console.error(err); process.exit(1); });
