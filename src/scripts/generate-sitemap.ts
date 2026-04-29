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
  const posts: { link: string; modified: string }[] = [];
  let page = 1;
  while (true) {
    const res = await api.get('/posts', {
      params: { status: 'publish', per_page: 100, page, _fields: 'link,modified' },
    });
    const items = res.data as { link: string; modified: string }[];
    if (!items.length) break;
    posts.push(...items);
    const totalPages = parseInt(res.headers['x-wp-totalpages'] ?? '1', 10);
    logger.info(`  페이지 ${page}/${totalPages} — 누적 ${posts.length}개`);
    if (page >= totalPages) break;
    page++;
  }
  return posts;
}

function isKoreanSlug(url: string): boolean {
  const slug = decodeURIComponent(url.replace(/\/$/, '').split('/').pop() ?? '');
  return /[가-힣]/.test(slug);
}

async function main() {
  logger.info('WordPress 발행 포스트 조회 중...');
  const posts = await fetchAllPublished();
  logger.info(`총 ${posts.length}개 발행 포스트 확인`);

  const korean = posts.filter(p => isKoreanSlug(p.link));
  const skipped = posts.length - korean.length;
  if (skipped > 0) logger.info(`영문 슬러그 ${skipped}개 제외`);

  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ];

  for (const p of korean) {
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
