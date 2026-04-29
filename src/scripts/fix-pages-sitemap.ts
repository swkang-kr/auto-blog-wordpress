/**
 * fix-pages-sitemap.ts
 * - 현재 WordPress 페이지 목록 조회
 * - 예전 니치(한국주식 이외) 페이지 삭제
 * - 현재 니치에 맞는 페이지만 남기고 page-sitemap.xml 생성
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

// 현재 유지할 페이지 슬러그 패턴 (한국 주식 관련)
const KEEP_SLUGS = [
  'about', 'contact', 'privacy-policy', 'terms', 'disclaimer',
  '소개', '문의', '개인정보', '이용약관', '면책조항',
  '종목분석', '주식', '매수', '매매', '시장분석',
];

// 삭제할 예전 니치 슬러그 패턴 (영문 콘텐츠 / 구 니치)
const DELETE_PATTERNS = [
  /tech/i, /finance(?!-naver)/i, /k-beauty/i, /beauty/i,
  /travel/i, /entertainment/i, /k-pop/i, /kpop/i,
  /save-money/i, /invest/i, /crypto/i, /bitcoin/i,
  /career/i, /health/i, /food/i, /fashion/i,
  /seo-guide/i, /ai-tools/i, /how-to/i,
];

function shouldDelete(slug: string, title: string): boolean {
  const combined = `${slug} ${title}`.toLowerCase();
  return DELETE_PATTERNS.some(p => p.test(combined));
}

async function fetchAllPages() {
  const pages: { id: number; slug: string; title: string; status: string; link: string; modified: string }[] = [];
  let page = 1;
  while (true) {
    const res = await api.get('/pages', {
      params: { status: 'publish,draft', per_page: 100, page, _fields: 'id,slug,title,status,link,modified' },
    });
    const items = res.data as { id: number; slug: string; title: { rendered: string }; status: string; link: string; modified: string }[];
    if (!items.length) break;
    pages.push(...items.map(p => ({ id: p.id, slug: p.slug, title: p.title.rendered, status: p.status, link: p.link, modified: p.modified })));
    const total = parseInt(res.headers['x-wp-totalpages'] ?? '1', 10);
    if (page >= total) break;
    page++;
  }
  return pages;
}

async function deletePage(id: number, slug: string): Promise<void> {
  await api.delete(`/pages/${id}`, { params: { force: true } });
  logger.info(`  삭제: [ID=${id}] ${slug}`);
}

async function main() {
  logger.info('WordPress 페이지 목록 조회 중...');
  const pages = await fetchAllPages();
  logger.info(`총 ${pages.length}개 페이지`);

  // 전체 목록 출력
  for (const p of pages) {
    logger.info(`  [${p.id}] (${p.status}) ${p.slug} — ${p.title.slice(0, 50)}`);
  }

  // 삭제 대상 필터링
  const toDelete = pages.filter(p => shouldDelete(p.slug, p.title));
  const toKeep = pages.filter(p => !shouldDelete(p.slug, p.title) && p.status === 'publish');

  logger.info(`\n삭제 대상: ${toDelete.length}개`);
  for (const p of toDelete) {
    logger.info(`  → 삭제: [${p.id}] ${p.slug}`);
    try {
      await deletePage(p.id, p.slug);
    } catch (err) {
      logger.warn(`    삭제 실패: ${err instanceof Error ? err.message : err}`);
    }
    await new Promise(r => setTimeout(r, 200));
  }

  // page-sitemap.xml 생성 (남은 발행 페이지)
  logger.info(`\npage-sitemap.xml 생성 (${toKeep.length}개 페이지)...`);
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ];
  for (const p of toKeep) {
    const decoded = decodeURIComponent(p.link);
    const lastmod = p.modified?.slice(0, 10) ?? new Date().toISOString().slice(0, 10);
    lines.push('  <url>');
    lines.push(`    <loc>${decoded}</loc>`);
    lines.push(`    <lastmod>${lastmod}</lastmod>`);
    lines.push('    <changefreq>monthly</changefreq>');
    lines.push('    <priority>0.6</priority>');
    lines.push('  </url>');
  }
  lines.push('</urlset>');

  await fs.writeFile('page-sitemap.xml', lines.join('\n'), 'utf-8');
  logger.info('page-sitemap.xml 생성 완료');
}

main().catch(err => {
  logger.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
