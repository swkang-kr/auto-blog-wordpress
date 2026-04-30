/**
 * fix-broken-internal-links.ts
 * 존재하지 않는 내부 링크를 포스트 본문에서 제거합니다.
 * (링크 텍스트는 유지하고 <a> 태그만 제거)
 *
 * Usage: node --import tsx/esm src/scripts/fix-broken-internal-links.ts
 */
import axios from 'axios';
import { logger } from '../utils/logger.js';

const WP_URL = process.env.WP_URL!;
const WP_USERNAME = process.env.WP_USERNAME!;
const WP_APP_PASSWORD = process.env.WP_APP_PASSWORD!;
const SITE_HOST = new URL(WP_URL).host;

const api = axios.create({
  baseURL: `${WP_URL}/wp-json/wp/v2`,
  auth: { username: WP_USERNAME, password: WP_APP_PASSWORD },
  timeout: 30_000,
});

async function fetchAllPosts() {
  const posts: { id: number; slug: string; content: { rendered: string }; link: string }[] = [];
  let page = 1;
  while (true) {
    const res = await api.get('/posts', {
      params: { status: 'publish', per_page: 100, page, _fields: 'id,slug,content,link' },
    });
    const items = res.data as typeof posts;
    if (!items.length) break;
    posts.push(...items);
    const total = parseInt(res.headers['x-wp-totalpages'] ?? '1', 10);
    if (page >= total) break;
    page++;
  }
  return posts;
}

async function fetchAllSlugs(): Promise<Set<string>> {
  const slugs = new Set<string>();
  let page = 1;
  while (true) {
    const res = await api.get('/posts', {
      params: { status: 'publish', per_page: 100, page, _fields: 'slug' },
    });
    const items = res.data as { slug: string }[];
    if (!items.length) break;
    items.forEach(p => slugs.add(p.slug));
    const total = parseInt(res.headers['x-wp-totalpages'] ?? '1', 10);
    if (page >= total) break;
    page++;
  }
  // 페이지 슬러그도 추가
  const pageRes = await api.get('/pages', {
    params: { status: 'publish', per_page: 100, _fields: 'slug' },
  });
  (pageRes.data as { slug: string }[]).forEach(p => slugs.add(p.slug));
  return slugs;
}

function extractInternalLinks(html: string): { href: string; slug: string }[] {
  const re = /href="(https?:\/\/[^"]*?)"/gi;
  const results: { href: string; slug: string }[] = [];
  let m;
  while ((m = re.exec(html)) !== null) {
    const href = m[1];
    try {
      const u = new URL(href);
      if (u.host === SITE_HOST) {
        const slug = decodeURIComponent(u.pathname.replace(/^\/|\/$/g, '').split('/').pop() ?? '');
        if (slug) results.push({ href, slug });
      }
    } catch {}
  }
  return results;
}

function stripBrokenLinks(html: string, brokenHrefs: Set<string>): string {
  // <a href="...broken...">텍스트</a> → 텍스트
  let result = html;
  for (const href of brokenHrefs) {
    const escaped = href.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    result = result.replace(new RegExp(`<a[^>]*href="${escaped}"[^>]*>(.*?)<\\/a>`, 'gi'), '$1');
  }
  return result;
}

async function main() {
  logger.info('슬러그 목록 조회 중...');
  const validSlugs = await fetchAllSlugs();
  logger.info(`유효 슬러그: ${validSlugs.size}개`);

  logger.info('포스트 전체 조회 중...');
  const posts = await fetchAllPosts();
  logger.info(`총 ${posts.length}개 포스트`);

  let fixedCount = 0;
  let brokenLinkCount = 0;

  for (const post of posts) {
    const html = post.content.rendered;
    const internalLinks = extractInternalLinks(html);
    const brokenHrefs = new Set<string>();

    for (const { href, slug } of internalLinks) {
      if (!validSlugs.has(slug)) {
        brokenHrefs.add(href);
        brokenLinkCount++;
        logger.warn(`  깨진 링크 [${post.id}]: ${decodeURIComponent(href)}`);
      }
    }

    if (brokenHrefs.size === 0) continue;

    const fixed = stripBrokenLinks(html, brokenHrefs);
    await api.post(`/posts/${post.id}`, { content: fixed });
    logger.info(`  수정 완료: [${post.id}] ${post.slug} (${brokenHrefs.size}개 링크 제거)`);
    fixedCount++;
    await new Promise(r => setTimeout(r, 300));
  }

  logger.info(`\n완료 — ${fixedCount}개 포스트에서 ${brokenLinkCount}개 깨진 내부 링크 제거`);
}

main().catch(err => {
  logger.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
