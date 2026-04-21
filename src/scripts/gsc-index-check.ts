/**
 * GSC URL Inspection API로 발행된 포스트의 색인 상태 확인
 * 실행: node --import tsx/esm src/scripts/gsc-index-check.ts
 */

import { google } from 'googleapis';
import axios from 'axios';
import 'dotenv/config';

const SITE_URL = (process.env.GSC_SITE_URL!).replace(/\/?$/, '/');
const WP_URL = process.env.WP_URL!.replace(/\/+$/, '');
const AUTH = Buffer.from(`${process.env.WP_USERNAME}:${process.env.WP_APP_PASSWORD}`).toString('base64');

async function getPublishedPostUrls(): Promise<Array<{ id: number; url: string; title: string }>> {
  const posts: Array<{ id: number; link: string; title: { rendered: string } }> = [];
  let page = 1;
  while (true) {
    const { data, headers } = await axios.get(`${WP_URL}/wp-json/wp/v2/posts`, {
      headers: { Authorization: `Basic ${AUTH}` },
      params: { per_page: 100, page, status: 'publish', _fields: 'id,link,title' },
    });
    posts.push(...data);
    if (page >= parseInt(headers['x-wp-totalpages'] || '1')) break;
    page++;
  }
  return posts.map(p => ({ id: p.id, url: p.link, title: p.title.rendered }));
}

async function main() {
  const keyJson = JSON.parse(process.env.GOOGLE_INDEXING_SA_KEY!);
  const auth = new google.auth.JWT({
    email: keyJson.client_email,
    key: keyJson.private_key,
    scopes: ['https://www.googleapis.com/auth/webmasters'],
  });

  const sc = google.searchconsole({ version: 'v1', auth });

  console.log('WordPress 포스트 URL 조회 중...');
  const posts = await getPublishedPostUrls();
  console.log(`총 ${posts.length}개 포스트\n`);

  const results: Array<{
    id: number; title: string; url: string;
    verdict: string; indexingState: string; crawlState: string; lastCrawl: string;
  }> = [];

  for (const post of posts) {
    try {
      const { data } = await sc.urlInspection.index.inspect({
        requestBody: { inspectionUrl: post.url, siteUrl: SITE_URL },
      });
      const r = data.inspectionResult;
      results.push({
        id: post.id,
        title: post.title,
        url: post.url,
        verdict: r?.indexStatusResult?.verdict ?? 'UNKNOWN',
        indexingState: r?.indexStatusResult?.indexingState ?? 'UNKNOWN',
        crawlState: r?.indexStatusResult?.crawledAs ?? 'N/A',
        lastCrawl: r?.indexStatusResult?.lastCrawlTime ?? 'N/A',
      });
      process.stdout.write('.');
    } catch (err) {
      results.push({
        id: post.id, title: post.title, url: post.url,
        verdict: 'API_ERROR', indexingState: String(err instanceof Error ? err.message : err),
        crawlState: 'N/A', lastCrawl: 'N/A',
      });
      process.stdout.write('x');
    }
    // API rate limit: 2 req/sec
    await new Promise(r => setTimeout(r, 600));
  }

  console.log('\n');

  // 결과 분류
  const indexed = results.filter(r => r.verdict === 'PASS');
  const notIndexed = results.filter(r => r.verdict === 'FAIL' || r.verdict === 'NEUTRAL');
  const errors = results.filter(r => r.verdict === 'ERROR' || r.verdict === 'API_ERROR' || r.verdict === 'UNKNOWN');

  console.log(`=== 색인 상태 요약 ===`);
  console.log(`색인됨 (PASS):      ${indexed.length}개`);
  console.log(`미색인 (FAIL/NEUTRAL): ${notIndexed.length}개`);
  console.log(`오류/불명:           ${errors.length}개\n`);

  if (notIndexed.length > 0) {
    console.log('=== 미색인 포스트 ===');
    for (const r of notIndexed) {
      console.log(`[${r.id}] ${r.title}`);
      console.log(`  URL: ${r.url}`);
      console.log(`  상태: ${r.indexingState} | 마지막 크롤: ${r.lastCrawl}\n`);
    }
  }

  if (errors.length > 0) {
    console.log('=== 오류 포스트 ===');
    for (const r of errors) {
      console.log(`[${r.id}] ${r.title}`);
      console.log(`  URL: ${r.url}`);
      console.log(`  오류: ${r.indexingState}\n`);
    }
  }

  // 색인 상태별 그룹
  const byState: Record<string, number> = {};
  for (const r of results) {
    byState[r.indexingState] = (byState[r.indexingState] ?? 0) + 1;
  }
  console.log('=== 색인 상태별 분포 ===');
  Object.entries(byState).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log(`  ${k}: ${v}개`));
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
