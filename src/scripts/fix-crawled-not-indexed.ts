/**
 * fix-crawled-not-indexed.ts
 *
 * GSC "크롤링됨 - 현재 색인이 생성되지 않음" 수정 스크립트
 *
 * 문제: rank_math_robots 필드가 REST API에 등록되지 않아 index,follow가
 *       기록되지 않았음. 결과적으로 Rank Math global 설정에 의존하게 됨.
 *
 * 수정: 모든 발행 포스트에 rank_math_robots = 'index,follow' 명시적 기록 후
 *       IndexNow로 재크롤 요청.
 *
 * Usage:
 *   npx tsx src/scripts/fix-crawled-not-indexed.ts --dry-run
 *   npx tsx src/scripts/fix-crawled-not-indexed.ts
 */
import 'dotenv/config';
import axios, { type AxiosInstance } from 'axios';

const WP_URL = process.env.WP_URL!.replace(/\/+$/, '');
const WP_USERNAME = process.env.WP_USERNAME!;
const WP_APP_PASSWORD = process.env.WP_APP_PASSWORD!;
const INDEXNOW_KEY = process.env.INDEXNOW_KEY || '';
const DRY_RUN = process.argv.includes('--dry-run');

if (!WP_URL || !WP_USERNAME || !WP_APP_PASSWORD) {
  console.error('Missing required env vars');
  process.exit(1);
}

const token = Buffer.from(`${WP_USERNAME}:${WP_APP_PASSWORD}`).toString('base64');
const api: AxiosInstance = axios.create({
  baseURL: `${WP_URL}/wp-json/wp/v2`,
  headers: { Authorization: `Basic ${token}` },
  timeout: 30000,
});

async function getAllPosts(): Promise<Array<{ id: number; link: string; title: string }>> {
  const posts: Array<{ id: number; link: string; title: string }> = [];
  let page = 1;
  while (true) {
    const { data, headers } = await api.get('/posts', {
      params: { per_page: 100, page, status: 'publish', _fields: 'id,title,link' },
    });
    for (const p of data as Array<{ id: number; title: { rendered: string }; link: string }>) {
      posts.push({ id: p.id, link: p.link, title: p.title.rendered });
    }
    const totalPages = parseInt(headers['x-wp-totalpages'] ?? '1', 10);
    if (page >= totalPages) break;
    page++;
  }
  return posts;
}

async function main() {
  console.log(`${DRY_RUN ? '[DRY RUN] ' : ''}fix-crawled-not-indexed 시작`);

  const posts = await getAllPosts();
  console.log(`전체 발행 포스트: ${posts.length}개\n`);

  let patched = 0;

  for (let i = 0; i < posts.length; i++) {
    const post = posts[i];
    if (!DRY_RUN) {
      await api.post(`/posts/${post.id}`, {
        meta: { rank_math_robots: 'index,follow' },
      });
      patched++;
      // Rate limit
      await new Promise(r => setTimeout(r, 200));
    } else {
      patched++;
    }

    if ((i + 1) % 20 === 0 || i + 1 === posts.length) {
      console.log(`  진행: ${i + 1}/${posts.length}`);
    }
  }

  console.log(`\nrank_math_robots 기록: ${patched}개`);

  // IndexNow 재제출
  if (!DRY_RUN && INDEXNOW_KEY && posts.length > 0) {
    console.log('\nIndexNow 재제출 중...');
    const host = new URL(WP_URL).hostname;
    const keyLocation = `${WP_URL}/${INDEXNOW_KEY}.txt`;
    const urlList = posts.map(p => p.link);

    // IndexNow batch limit: 10,000 URLs per request; submit in chunks of 200
    const CHUNK = 200;
    for (let i = 0; i < urlList.length; i += CHUNK) {
      const chunk = urlList.slice(i, i + CHUNK);
      try {
        await axios.post('https://api.indexnow.org/indexnow', {
          host, key: INDEXNOW_KEY, keyLocation, urlList: chunk,
        }, { timeout: 20000 });
        console.log(`  IndexNow: ${chunk.length}개 제출 (${i + chunk.length}/${urlList.length})`);
      } catch (e) {
        console.warn(`  IndexNow 오류: ${e instanceof Error ? e.message : e}`);
      }
      await new Promise(r => setTimeout(r, 1000));
    }
    console.log('IndexNow 완료');
  } else if (DRY_RUN) {
    console.log('(--dry-run 모드: IndexNow 제출 생략)');
  } else if (!INDEXNOW_KEY) {
    console.log('INDEXNOW_KEY 미설정: IndexNow 제출 생략');
  }

  console.log('\n완료! GSC에서 48-72시간 후 색인 현황 확인.');
}

main().catch(err => {
  console.error('오류:', err.message);
  process.exit(1);
});
