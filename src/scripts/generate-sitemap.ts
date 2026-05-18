/**
 * generate-sitemap.ts
 * WordPress REST API로 발행된 포스트 전체 조회 → post-sitemap.xml 생성
 */
import axios from 'axios';
import fs from 'node:fs/promises';
import { logger } from '../utils/logger.js';

const WP_URL = process.env.WP_URL!;
const WP_USERNAME = process.env.WP_USERNAME!;
const WP_APP_PASSWORD = process.env.WP_APP_PASSWORD!;

const api = axios.create({
  baseURL: `${WP_URL}/wp-json/wp/v2`,
  auth: { username: WP_USERNAME, password: WP_APP_PASSWORD },
  timeout: 30_000,
});

async function fetchAllPublished() {
  const posts: { link: string; modified: string; title: { rendered: string } }[] = [];
  let page = 1;
  while (true) {
    const res = await api.get('/posts', {
      params: { status: 'publish', per_page: 100, page, _fields: 'link,modified,title' },
    });
    const items = res.data as { link: string; modified: string; title: { rendered: string } }[];
    if (!items.length) break;
    posts.push(...items);
    const totalPages = parseInt(res.headers['x-wp-totalpages'] ?? '1', 10);
    logger.info(`  페이지 ${page}/${totalPages} — 누적 ${posts.length}개`);
    if (page >= totalPages) break;
    page++;
  }
  return posts;
}

/**
 * 한국어 콘텐츠 판정.
 * 제목 또는 슬러그에 한글이 있으면 한국 콘텐츠로 인식.
 * (슬러그만 영문/숫자로 망가진 정상 콘텐츠도 포함시키기 위함)
 */
function isKoreanContent(post: { link?: string; title?: { rendered?: string } }): boolean {
  const title = post.title?.rendered ?? '';
  if (/[가-힣]/.test(title)) return true;
  if (typeof post.link === 'string') {
    const slug = decodeURIComponent(post.link.replace(/\/$/, '').split('/').pop() ?? '');
    if (/[가-힣]/.test(slug)) return true;
  }
  return false;
}

async function main() {
  logger.info('WordPress 발행 포스트 조회 중...');
  const posts = await fetchAllPublished();
  logger.info(`총 ${posts.length}개 발행 포스트 확인`);

  const korean = posts.filter(p => p.link && isKoreanContent(p));
  const excluded = posts.filter(p => !p.link || !isKoreanContent(p));
  if (excluded.length > 0) {
    logger.info(`비한국어 콘텐츠 ${excluded.length}개 제외:`);
    excluded.forEach(p => logger.info(`  제외: ${p.link}`));
  }

  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ];

  for (const p of korean) {
    // canonical(<link rel="canonical">)이 decoded 한글 URL을 가리키므로 사이트맵도 같은 형식 유지.
    // 다만 WP가 한글 URL 요청 시 uppercase percent-encoded로 301 redirect함 → canonical mismatch.
    // 근본 해결은 WP PHP에서 redirect_canonical 제거 + canonical을 uppercase encoded로 변경 필요.
    const decoded = decodeURIComponent(p.link);
    const lastmod = p.modified?.slice(0, 10) ?? new Date().toISOString().slice(0, 10);
    lines.push('  <url>');
    lines.push(`    <loc>${decoded}</loc>`);
    lines.push(`    <lastmod>${lastmod}</lastmod>`);
    lines.push('    <changefreq>weekly</changefreq>');
    lines.push('    <priority>0.8</priority>');
    lines.push('  </url>');
  }
  lines.push('</urlset>');

  const xml = lines.join('\n');
  await fs.writeFile('post-sitemap.xml', xml, 'utf-8');
  logger.info(`post-sitemap.xml 생성 완료 (한국어 슬러그 ${korean.length}개)`);
}

main().catch(err => {
  logger.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
