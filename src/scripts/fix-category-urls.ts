/**
 * fix-category-urls.ts
 * 기존 발행 포스트에서 잘못 생성된 /category// URL을
 * URL-encoded 한국어 카테고리 슬러그로 일괄 교체합니다.
 *
 * 문제: 한국어 카테고리명(종목분석 등)이 ASCII 정규식에 의해 빈 문자열로 변환되어
 *       /category// 형태의 깨진 링크가 생성되었음.
 *
 * Usage:
 *   npx tsx src/scripts/fix-category-urls.ts --dry-run
 *   npx tsx src/scripts/fix-category-urls.ts
 */
import 'dotenv/config';
import axios, { type AxiosInstance } from 'axios';

const WP_URL = process.env.WP_URL!;
const WP_USERNAME = process.env.WP_USERNAME!;
const WP_APP_PASSWORD = process.env.WP_APP_PASSWORD!;
const DRY_RUN = process.argv.includes('--dry-run');

if (!WP_URL || !WP_USERNAME || !WP_APP_PASSWORD) {
  console.error('Missing required env vars: WP_URL, WP_USERNAME, WP_APP_PASSWORD');
  process.exit(1);
}

const BASE = WP_URL.replace(/\/+$/, '');
const token = Buffer.from(`${WP_USERNAME}:${WP_APP_PASSWORD}`).toString('base64');
const api: AxiosInstance = axios.create({
  baseURL: `${BASE}/wp-json/wp/v2`,
  headers: { Authorization: `Basic ${token}` },
  timeout: 30000,
});

// 카테고리명 → 올바른 URL 슬러그 매핑
const CATEGORY_SLUG_MAP: Record<string, string> = {
  '종목분석': encodeURIComponent('종목분석'),
  '시장분석': encodeURIComponent('시장분석'),
  '업종분석': encodeURIComponent('업종분석'),
  '테마분석': encodeURIComponent('테마분석'),
};

/**
 * /category//?topic=stock-XXXXX  →  /category/ENCODED_SLUG/?topic=stock-XXXXX
 * /category//  →  /category/ENCODED_SLUG/
 *
 * 카테고리는 포스트 카테고리 정보에서 가져옴.
 */
function fixCategoryUrls(html: string, categoryName: string): { fixed: string; count: number } {
  const slug = CATEGORY_SLUG_MAP[categoryName]
    ?? encodeURIComponent(categoryName.toLowerCase());

  let count = 0;

  // /category//  → /category/SLUG/  (쿼리스트링 포함 모두 처리)
  const fixed = html.replace(/\/category\/\//g, () => {
    count++;
    return `/category/${slug}/`;
  });

  return { fixed, count };
}

async function getAllPosts(): Promise<Array<{ id: number; title: string; categoryName: string }>> {
  const posts: Array<{ id: number; title: string; categoryName: string }> = [];
  let page = 1;

  // 카테고리 목록 먼저 가져오기
  const { data: cats } = await api.get('/categories', { params: { per_page: 100 } });
  const catMap: Record<number, string> = {};
  for (const c of cats as Array<{ id: number; name: string }>) {
    catMap[c.id] = c.name;
  }

  while (true) {
    const { data, headers } = await api.get('/posts', {
      params: { per_page: 100, page, status: 'publish', _fields: 'id,title,categories' },
    });
    for (const p of data as Array<{ id: number; title: { rendered: string }; categories: number[] }>) {
      const catId = p.categories[0];
      const categoryName = catId ? (catMap[catId] ?? '') : '';
      posts.push({ id: p.id, title: p.title.rendered, categoryName });
    }
    const totalPages = parseInt(headers['x-wp-totalpages'] ?? '1', 10);
    if (page >= totalPages) break;
    page++;
  }
  return posts;
}

async function main() {
  console.log(`${DRY_RUN ? '[DRY RUN] ' : ''}fix-category-urls 시작`);

  const posts = await getAllPosts();
  console.log(`전체 포스트: ${posts.length}개`);

  let checked = 0;
  let patched = 0;
  let skipped = 0;

  for (const post of posts) {
    checked++;

    // 포스트 본문 가져오기 (context=edit → raw 필드 포함)
    const { data } = await api.get(`/posts/${post.id}`, { params: { context: 'edit', _fields: 'id,content' } });
    const rawContent: string = (data as { content: { raw: string; rendered: string } }).content?.raw
      ?? (data as { content: { raw: string; rendered: string } }).content?.rendered
      ?? '';

    if (!rawContent.includes('/category//')) {
      skipped++;
      continue;
    }

    const { fixed, count } = fixCategoryUrls(rawContent, post.categoryName);

    console.log(`[${checked}/${posts.length}] Post ${post.id} "${post.title}" — ${count}개 교체 (카테고리: ${post.categoryName || '미분류'})`);

    if (!DRY_RUN) {
      await api.post(`/posts/${post.id}`, { content: fixed });
      patched++;
      // Rate limit
      await new Promise(r => setTimeout(r, 300));
    } else {
      patched++;
    }
  }

  console.log(`\n완료: ${checked}개 확인, ${patched}개 수정, ${skipped}개 스킵`);
  if (DRY_RUN) console.log('(--dry-run 모드: 실제 변경 없음)');
}

main().catch(err => {
  console.error('오류:', err.message);
  process.exit(1);
});
