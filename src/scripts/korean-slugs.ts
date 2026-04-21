/**
 * 포스트 슬러그를 percent-encoded → 한국어 Unicode로 일괄 변환
 * 실행: node --import tsx/esm src/scripts/korean-slugs.ts
 * 드라이런: node --import tsx/esm src/scripts/korean-slugs.ts --dry-run
 */

import axios from 'axios';
import 'dotenv/config';

const DRY_RUN = process.argv.includes('--dry-run');
const WP_URL = process.env.WP_URL!.replace(/\/+$/, '');
const AUTH = Buffer.from(`${process.env.WP_USERNAME}:${process.env.WP_APP_PASSWORD}`).toString('base64');

const wpApi = axios.create({
  baseURL: `${WP_URL}/wp-json/wp/v2`,
  headers: { Authorization: `Basic ${AUTH}` },
  timeout: 30_000,
});

interface WPPost {
  id: number;
  slug: string;
  title: { rendered: string };
  link: string;
}

async function getAllPosts(): Promise<WPPost[]> {
  const posts: WPPost[] = [];
  let page = 1;
  while (true) {
    const { data, headers } = await wpApi.get('/posts', {
      params: { per_page: 100, page, status: 'publish', _fields: 'id,slug,title,link' },
    });
    posts.push(...(data as WPPost[]));
    if (page >= parseInt(headers['x-wp-totalpages'] || '1')) break;
    page++;
  }
  return posts;
}

function decodeSlug(slug: string): string {
  try {
    return decodeURIComponent(slug);
  } catch {
    return slug;
  }
}

function needsDecoding(slug: string): boolean {
  return slug.includes('%') && decodeSlug(slug) !== slug;
}

async function verifyUrl(url: string): Promise<boolean> {
  try {
    const res = await axios.get(url, { timeout: 8_000, maxRedirects: 5 });
    return res.status === 200;
  } catch {
    return false;
  }
}

async function main() {
  console.log(`=== 한국어 슬러그 변환 스크립트 ${DRY_RUN ? '[DRY RUN]' : '[실제 실행]'} ===`);
  console.log(`날짜: ${new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })} KST\n`);

  const posts = await getAllPosts();
  console.log(`총 발행 포스트: ${posts.length}개\n`);

  const targets = posts.filter(p => needsDecoding(p.slug));
  const already = posts.filter(p => !needsDecoding(p.slug));

  console.log(`변환 대상: ${targets.length}개`);
  console.log(`이미 한국어: ${already.length}개\n`);

  if (targets.length === 0) {
    console.log('변환할 슬러그 없음. 완료.');
    return;
  }

  let updated = 0;
  let failed = 0;
  let skipped = 0;

  for (const post of targets) {
    const newSlug = decodeSlug(post.slug);
    console.log(`[${post.id}] ${post.title.rendered}`);
    console.log(`  현재: ${post.slug}`);
    console.log(`  변환: ${newSlug}`);

    if (DRY_RUN) {
      console.log('  → [DRY RUN] 건너뜀\n');
      continue;
    }

    try {
      await wpApi.post(`/posts/${post.id}`, { slug: newSlug });

      // 변환 후 URL 검증
      const newUrl = `${WP_URL}/${newSlug}/`;
      const ok = await verifyUrl(newUrl);
      if (ok) {
        console.log(`  ✓ 완료 (200 확인)\n`);
        updated++;
      } else {
        // 404 발생 시 원래 슬러그로 롤백
        console.error(`  ✗ 404 발생 — 롤백 중...`);
        await wpApi.post(`/posts/${post.id}`, { slug: post.slug });
        console.error(`  ↩ 롤백 완료: ${post.slug}\n`);
        failed++;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`  ✗ 오류: ${msg}\n`);
      failed++;
    }

    await new Promise(r => setTimeout(r, 500));
  }

  console.log('=== 완료 ===');
  console.log(`성공: ${updated}개`);
  console.log(`실패/롤백: ${failed}개`);
  console.log(`스킵: ${skipped}개`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
