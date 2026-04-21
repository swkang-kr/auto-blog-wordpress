/**
 * GSC 사이트맵 관리: 지정된 4개만 남기고 나머지 삭제
 * 실행: node --import tsx/esm src/scripts/gsc-manage-sitemaps.ts
 */

import { google } from 'googleapis';
import 'dotenv/config';

const KEEP_SITEMAPS = new Set([
  'https://trendhunt.net/wp-sitemap.xml',
  'https://trendhunt.net/post-sitemap.xml',
  'https://trendhunt.net/page-sitemap.xml',
  'https://trendhunt.net/news-sitemap.xml',
]);

const SITE_URL = process.env.GSC_SITE_URL!;

async function main() {
  const keyJson = JSON.parse(process.env.GOOGLE_INDEXING_SA_KEY!);
  const auth = new google.auth.JWT({
    email: keyJson.client_email,
    key: keyJson.private_key,
    scopes: ['https://www.googleapis.com/auth/webmasters'],
  });

  const sc = google.searchconsole({ version: 'v1', auth });

  // 현재 등록된 사이트맵 목록 조회
  const { data } = await sc.sitemaps.list({ siteUrl: SITE_URL });
  const sitemaps = data.sitemap ?? [];

  console.log(`등록된 사이트맵: ${sitemaps.length}개`);
  sitemaps.forEach(s => console.log(`  - ${s.path}`));
  console.log('');

  const toDelete = sitemaps.filter(s => s.path && !KEEP_SITEMAPS.has(s.path));
  const toKeep = sitemaps.filter(s => s.path && KEEP_SITEMAPS.has(s.path));

  console.log(`유지: ${toKeep.length}개`);
  toKeep.forEach(s => console.log(`  ✓ ${s.path}`));
  console.log(`삭제: ${toDelete.length}개`);
  toDelete.forEach(s => console.log(`  ✗ ${s.path}`));
  console.log('');

  for (const sitemap of toDelete) {
    try {
      await sc.sitemaps.delete({ siteUrl: SITE_URL, feedpath: sitemap.path! });
      console.log(`삭제 완료: ${sitemap.path}`);
    } catch (err) {
      console.error(`삭제 실패: ${sitemap.path} — ${err instanceof Error ? err.message : err}`);
    }
  }

  // 4개 중 미등록 항목은 새로 제출
  const registeredPaths = new Set(sitemaps.map(s => s.path));
  for (const url of KEEP_SITEMAPS) {
    if (!registeredPaths.has(url)) {
      try {
        await sc.sitemaps.submit({ siteUrl: SITE_URL, feedpath: url });
        console.log(`신규 제출: ${url}`);
      } catch (err) {
        console.error(`제출 실패: ${url} — ${err instanceof Error ? err.message : err}`);
      }
    }
  }

  console.log('\n완료');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
