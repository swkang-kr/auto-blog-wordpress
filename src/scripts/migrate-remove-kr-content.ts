/**
 * Migration: EN 포스트에서 KR 콘텐츠 제거
 *
 * 기존 EN 포스트의 bilingual toggle 구조(content-en + content-kr)를
 * EN 콘텐츠만 남기고, KR URL 링크로 교체.
 *
 * 실행: npx tsx src/scripts/migrate-remove-kr-content.ts
 */

import axios from 'axios';
import 'dotenv/config';

const WP_URL = process.env.WP_URL!.replace(/\/+$/, '');
const AUTH = Buffer.from(`${process.env.WP_USERNAME}:${process.env.WP_APP_PASSWORD}`).toString('base64');

const api = axios.create({
  baseURL: `${WP_URL}/wp-json/wp/v2`,
  headers: { Authorization: `Basic ${AUTH}` },
  timeout: 30000,
});

// EN 포스트 판별: slug가 -kr로 끝나지 않는 것
function isEnPost(slug: string): boolean {
  return !slug.endsWith('-kr');
}

// content-kr div 및 bilingual toggle 구조 감지
function hasBilingualContent(html: string): boolean {
  return html.includes('class="content-kr"') || html.includes('bilingual-post');
}

// bilingual 구조에서 EN 콘텐츠만 추출
function extractEnContent(html: string): string {
  // content-en div 내용 추출
  const match = html.match(/<div[^>]*class="content-en"[^>]*lang="en"[^>]*style="[^"]*">([\s\S]*?)<\/div>\s*<div[^>]*class="content-kr"/);
  if (match) {
    return match[1].trim();
  }
  // fallback: bilingual-post div 전체에서 content-en 추출
  const fallback = html.match(/<div[^>]*class="content-en"[^>]*>([\s\S]*?)<\/div>\s*(?:<div[^>]*class="content-kr"|<\/div>)/);
  return fallback ? fallback[1].trim() : html;
}

// JSON-LD 스크립트 추출
function extractJsonLd(html: string): string {
  const match = html.match(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g);
  return match ? match.join('\n') : '';
}

// KR URL 링크 버튼 생성
function buildKrLink(krUrl: string): string {
  return `<div style="text-align:right; margin:0 0 20px 0;">` +
    `<a href="${krUrl}" style="display:inline-block; padding:8px 20px; background:#0066FF; color:#fff; border-radius:20px; font-size:14px; text-decoration:none;" hreflang="ko">` +
    `한국어로 보기</a></div>`;
}

async function getAllEnPosts(): Promise<Array<{ id: number; slug: string; content: string; meta: Record<string, unknown> }>> {
  const posts: Array<{ id: number; slug: string; content: string; meta: Record<string, unknown> }> = [];
  let page = 1;

  while (true) {
    const { data, headers } = await api.get('/posts', {
      params: { per_page: 50, page, status: 'publish', _fields: 'id,slug,content,meta' },
    });

    const batch = data as Array<{ id: number; slug: string; content: { rendered: string }; meta: Record<string, unknown> }>;
    const enBatch = batch.filter((p) => isEnPost(p.slug));

    posts.push(...enBatch.map((p) => ({
      id: p.id,
      slug: p.slug,
      content: p.content.rendered,
      meta: p.meta,
    })));

    const totalPages = parseInt(headers['x-wp-totalpages'] || '1');
    if (page >= totalPages) break;
    page++;
  }

  return posts;
}

async function migratePost(post: { id: number; slug: string; content: string; meta: Record<string, unknown> }, dryRun: boolean): Promise<'skipped' | 'migrated' | 'no-kr-url'> {
  if (!hasBilingualContent(post.content)) {
    return 'skipped';
  }

  const krUrl = (post.meta as Record<string, string>).hreflang_ko || '';

  // EN 콘텐츠 추출
  const jsonLd = extractJsonLd(post.content);
  const enContent = extractEnContent(post.content);

  if (!enContent) {
    console.warn(`  [WARN] Could not extract EN content for post ${post.id} (${post.slug})`);
    return 'skipped';
  }

  // 새 콘텐츠 조합: JSON-LD + KR링크(있으면) + EN 콘텐츠
  const krLink = krUrl ? buildKrLink(krUrl) : '';
  const newContent = [jsonLd, krLink, enContent].filter(Boolean).join('\n');

  if (dryRun) {
    console.log(`  [DRY-RUN] Would migrate post ${post.id} (${post.slug}) — KR URL: ${krUrl || 'none'}`);
    return krUrl ? 'migrated' : 'no-kr-url';
  }

  await api.post(`/posts/${post.id}`, { content: newContent });
  return krUrl ? 'migrated' : 'no-kr-url';
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  console.log(`\n=== EN 포스트 KR 콘텐츠 제거 마이그레이션 ${dryRun ? '[DRY-RUN]' : '[LIVE]'} ===\n`);

  console.log('Fetching EN posts...');
  const posts = await getAllEnPosts();
  console.log(`총 EN 포스트: ${posts.length}개\n`);

  let migrated = 0;
  let skipped = 0;
  let noKrUrl = 0;

  for (const post of posts) {
    process.stdout.write(`[${posts.indexOf(post) + 1}/${posts.length}] ${post.slug} ... `);
    try {
      const result = await migratePost(post, dryRun);
      if (result === 'migrated') {
        console.log('✅ migrated');
        migrated++;
      } else if (result === 'no-kr-url') {
        console.log('⚠️  migrated (no KR URL)');
        noKrUrl++;
      } else {
        console.log('— skipped (already clean)');
        skipped++;
      }
      // Rate limiting
      await new Promise((r) => setTimeout(r, 500));
    } catch (error) {
      const msg = axios.isAxiosError(error)
        ? `${error.response?.status} ${JSON.stringify(error.response?.data)}`
        : (error instanceof Error ? error.message : String(error));
      console.log(`❌ ERROR: ${msg}`);
    }
  }

  console.log(`\n=== 완료 ===`);
  console.log(`✅ 마이그레이션: ${migrated}개`);
  console.log(`⚠️  KR URL 없음: ${noKrUrl}개`);
  console.log(`— 이미 정상: ${skipped}개`);
  if (dryRun) {
    console.log(`\n실제 적용하려면 --dry-run 없이 실행하세요.`);
  }
}

main().catch((e) => {
  console.error('Fatal:', e);
  process.exit(1);
});
