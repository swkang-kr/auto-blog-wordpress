/**
 * generate-category-sitemap.ts
 * - WordPress 카테고리 전체 조회
 * - 구 니치(한국주식 이외) 카테고리 삭제
 * - 현재 니치(한국주식/종목분석) 카테고리만 남겨 category-sitemap.xml 생성
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

// 현재 니치에서 유지할 카테고리 슬러그 패턴
const KEEP_PATTERNS = [
  /종목분석/,
  /시장분석/,
  /업종분석/,
  /테마분석/,
  /매수후보/,
  /기술적분석/,
  /수급분석/,
  /스윙/,
  /주식/,
  /코스피/,
  /코스닥/,
  /uncategorized/i,
];

// 삭제할 구 니치 카테고리 패턴
const DELETE_PATTERNS = [
  /tech/i, /finance(?!-naver)/i, /k-beauty/i, /beauty/i,
  /travel/i, /entertainment/i, /k-pop/i, /kpop/i,
  /save-money/i, /invest(?!ment-analysis)/i, /crypto/i, /bitcoin/i,
  /career/i, /health/i, /food/i, /fashion/i,
  /seo/i, /ai-tools/i, /how-to/i, /skincare/i,
  /lifestyle/i, /review/i, /news(?!-analysis)/i,
];

function shouldDelete(slug: string, name: string): boolean {
  const combined = `${slug} ${name}`.toLowerCase();
  // KEEP_PATTERNS 우선
  if (KEEP_PATTERNS.some(p => p.test(combined))) return false;
  return DELETE_PATTERNS.some(p => p.test(combined));
}

async function fetchAllCategories() {
  const cats: { id: number; slug: string; name: string; count: number; link: string; modified?: string }[] = [];
  let page = 1;
  while (true) {
    const res = await api.get('/categories', {
      params: { per_page: 100, page, _fields: 'id,slug,name,count,link' },
    });
    const items = res.data as { id: number; slug: string; name: string; count: number; link: string }[];
    if (!items.length) break;
    cats.push(...items);
    const total = parseInt(res.headers['x-wp-totalpages'] ?? '1', 10);
    if (page >= total) break;
    page++;
  }
  return cats;
}

async function main() {
  logger.info('WordPress 카테고리 조회 중...');
  const cats = await fetchAllCategories();
  logger.info(`총 ${cats.length}개 카테고리`);

  for (const c of cats) {
    logger.info(`  [${c.id}] ${c.slug} — ${c.name} (포스트 ${c.count}개)`);
  }

  // 삭제 대상
  const toDelete = cats.filter(c => shouldDelete(c.slug, c.name));
  const toKeep = cats.filter(c => !shouldDelete(c.slug, c.name));

  logger.info(`\n삭제 대상: ${toDelete.length}개`);
  for (const c of toDelete) {
    logger.info(`  → 삭제: [${c.id}] ${c.slug} — ${c.name}`);
    try {
      // force=true: 카테고리 내 포스트는 Uncategorized로 이동
      await api.delete(`/categories/${c.id}`, { params: { force: true } });
      logger.info(`    삭제 완료`);
    } catch (err) {
      logger.warn(`    삭제 실패: ${err instanceof Error ? err.message : err}`);
    }
    await new Promise(r => setTimeout(r, 200));
  }

  // category-sitemap.xml 생성 (포스트 수 > 0 카테고리만)
  const active = toKeep.filter(c => c.count > 0);
  logger.info(`\ncategory-sitemap.xml 생성 (${active.length}개 카테고리)...`);

  const today = new Date().toISOString().slice(0, 10);
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ];

  for (const c of active) {
    const decoded = decodeURIComponent(c.link);
    lines.push('  <url>');
    lines.push(`    <loc>${decoded}</loc>`);
    lines.push(`    <lastmod>${today}</lastmod>`);
    lines.push('    <changefreq>daily</changefreq>');
    lines.push('    <priority>0.7</priority>');
    lines.push('  </url>');
  }
  lines.push('</urlset>');

  await fs.writeFile('category-sitemap.xml', lines.join('\n'), 'utf-8');
  logger.info('category-sitemap.xml 생성 완료');

  logger.info('\n유지 카테고리:');
  for (const c of active) {
    logger.info(`  [${c.id}] ${c.slug} — ${c.name} (${c.count}개)`);
  }
}

main().catch(err => {
  logger.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
