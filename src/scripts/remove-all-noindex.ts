/**
 * 모든 발행 포스트의 noindex 설정 해제
 *
 * 실행: npx tsx src/scripts/remove-all-noindex.ts
 * 드라이런: npx tsx src/scripts/remove-all-noindex.ts --dry-run
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

interface WPPost {
  id: number;
  title: { rendered: string };
  slug: string;
  status: string;
  meta: Record<string, string>;
}

async function main() {
  console.log(`=== 모든 포스트 noindex 해제 ===${DRY_RUN ? ' (DRY RUN)' : ''}\n`);

  // 모든 발행 포스트 가져오기
  const allPosts: WPPost[] = [];
  let page = 1;
  while (true) {
    const { data, headers } = await api.get('/posts', {
      params: { per_page: 100, page, status: 'publish', _fields: 'id,title,slug,status,meta' },
    });
    allPosts.push(...(data as WPPost[]));
    if (page >= parseInt(headers['x-wp-totalpages'] || '1')) break;
    page++;
  }

  console.log(`총 발행 포스트: ${allPosts.length}개\n`);

  let noindexCount = 0;
  let fixedCount = 0;

  for (const post of allPosts) {
    const robots = post.meta?.rank_math_robots || '';
    const noindexReason = post.meta?._autoblog_noindex_reason || '';
    const noindexed = post.meta?._autoblog_noindexed || '';
    const pruned = post.meta?._autoblog_pruned || '';

    const hasNoindex = robots.includes('noindex') || noindexed || pruned;

    if (hasNoindex) {
      noindexCount++;
      const title = post.title.rendered.replace(/<[^>]+>/g, '').slice(0, 50);
      console.log(`[noindex] ID=${post.id} "${title}" (robots: ${robots || 'none'}, reason: ${noindexReason || pruned || 'none'})`);

      if (!DRY_RUN) {
        try {
          await api.post(`/posts/${post.id}`, {
            meta: {
              rank_math_robots: '',
              _autoblog_noindexed: '',
              _autoblog_noindex_reason: '',
              _autoblog_pruned: '',
            },
          });
          fixedCount++;
          console.log(`  ✅ noindex 해제 완료`);
        } catch (error) {
          console.error(`  ❌ 해제 실패: ${error instanceof Error ? error.message : error}`);
        }
        await new Promise(r => setTimeout(r, 300));
      }
    }
  }

  console.log(`\n=== 결과 ===`);
  console.log(`noindex 설정된 포스트: ${noindexCount}개`);
  if (DRY_RUN) {
    console.log(`(드라이런) 실제 해제하려면 --dry-run 없이 실행`);
  } else {
    console.log(`해제 완료: ${fixedCount}개`);
  }
}

main().catch(e => { console.error('Fatal:', e.message || e); process.exit(1); });
