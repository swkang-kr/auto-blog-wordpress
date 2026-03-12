/**
 * Google URL Inspection API - 색인 상태 확인 및 색인 요청
 *
 * - URL Inspection API로 각 페이지의 실제 Google 색인 상태 확인
 * - 미색인 페이지는 Google Indexing API로 색인 요청
 * - GSC에서 SA가 siteOwner가 아니면 Indexing API는 실패하지만 Inspection은 동작
 *
 * 실행: npx tsx src/scripts/inspect-and-request-indexing.ts
 */

import axios from 'axios';
import 'dotenv/config';
import { getGoogleAccessToken } from '../utils/google-auth.js';

const WP_URL = process.env.WP_URL!.replace(/\/+$/, '');
const AUTH = Buffer.from(`${process.env.WP_USERNAME}:${process.env.WP_APP_PASSWORD}`).toString('base64');
const SA_KEY = process.env.GOOGLE_INDEXING_SA_KEY!;
// GSC requires exact siteUrl format — must include trailing slash for URL-prefix properties
const GSC_SITE_URL = (process.env.GSC_SITE_URL || WP_URL).replace(/\/*$/, '/');

const api = axios.create({
  baseURL: `${WP_URL}/wp-json/wp/v2`,
  headers: { Authorization: `Basic ${AUTH}` },
  timeout: 30000,
});

interface InspectionResult {
  url: string;
  title: string;
  verdict: string; // PASS, PARTIAL, FAIL, VERDICT_UNSPECIFIED
  coverageState: string; // e.g., "Submitted and indexed", "Crawled - currently not indexed"
  robotsTxtState: string;
  indexingState: string;
  lastCrawlTime?: string;
  pageFetchState: string;
}

async function inspectUrl(url: string, accessToken: string): Promise<InspectionResult | null> {
  try {
    const { data } = await axios.post(
      'https://searchconsole.googleapis.com/v1/urlInspection/index:inspect',
      {
        inspectionUrl: url,
        siteUrl: GSC_SITE_URL,
      },
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        timeout: 30000,
      },
    );

    const result = data.inspectionResult?.indexStatusResult;
    if (!result) return null;

    return {
      url,
      title: '',
      verdict: result.verdict || 'UNKNOWN',
      coverageState: result.coverageState || 'UNKNOWN',
      robotsTxtState: result.robotsTxtState || 'UNKNOWN',
      indexingState: result.indexingState || 'UNKNOWN',
      lastCrawlTime: result.lastCrawlTime,
      pageFetchState: result.pageFetchState || 'UNKNOWN',
    };
  } catch (error) {
    if (axios.isAxiosError(error)) {
      if (error.response?.status === 429) {
        console.log('  ⚠️  Rate limit — 10초 대기');
        await new Promise((r) => setTimeout(r, 10000));
        return inspectUrl(url, accessToken);
      }
      console.error(`  [ERROR] ${error.response?.status} ${JSON.stringify(error.response?.data)?.slice(0, 200)}`);
    }
    return null;
  }
}

async function requestIndexing(url: string, accessToken: string): Promise<boolean> {
  try {
    await axios.post(
      'https://indexing.googleapis.com/v3/urlNotifications:publish',
      { url, type: 'URL_UPDATED' },
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        timeout: 15000,
      },
    );
    return true;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      const msg = JSON.stringify(error.response?.data)?.slice(0, 150);
      if (status === 403) {
        // Permission denied - SA not owner
        return false;
      }
      console.error(`  [Indexing Error] ${status} ${msg}`);
    }
    return false;
  }
}

async function getAllPostUrls(): Promise<Array<{ link: string; title: string }>> {
  const posts: Array<{ link: string; title: string }> = [];
  let page = 1;
  while (true) {
    const { data, headers } = await api.get('/posts', {
      params: { per_page: 100, page, status: 'publish', _fields: 'link,slug,title' },
    });
    const items = data as Array<{ link: string; slug: string; title: { rendered: string } }>;
    posts.push(
      ...items.map((p) => ({ link: p.link, title: p.title.rendered })),
    );
    if (page >= parseInt(headers['x-wp-totalpages'] || '1')) break;
    page++;
  }
  return posts;
}

async function main() {
  if (!SA_KEY) {
    console.error('GOOGLE_INDEXING_SA_KEY가 설정되지 않았습니다.');
    process.exit(1);
  }

  console.log('\n=== Google URL Inspection + Indexing 점검 ===\n');

  const posts = await getAllPostUrls();
  // Add homepage
  posts.unshift({ link: `${WP_URL}/`, title: 'Homepage' });
  console.log(`대상 URL: ${posts.length}개\n`);

  console.log('Access Token 발급 중...');
  const inspectionToken = await getGoogleAccessToken(SA_KEY, 'https://www.googleapis.com/auth/webmasters.readonly');

  let indexingToken: string | null = null;
  try {
    indexingToken = await getGoogleAccessToken(SA_KEY, 'https://www.googleapis.com/auth/indexing');
  } catch {
    console.log('⚠️  Indexing API 토큰 발급 실패 (소유자 권한 필요)\n');
  }

  console.log('✅ Token 발급 완료\n');

  const results: Array<InspectionResult & { indexingRequested: boolean }> = [];
  let indexed = 0, notIndexed = 0, errors = 0;
  let indexingRequested = 0, indexingFailed = 0;

  for (let i = 0; i < posts.length; i++) {
    const { link, title } = posts[i];
    const shortUrl = link.replace(WP_URL, '') || '/';
    process.stdout.write(`[${i + 1}/${posts.length}] ${shortUrl} ... `);

    const result = await inspectUrl(link, inspectionToken);

    if (!result) {
      console.log('❓ 검사 실패');
      errors++;
      continue;
    }

    result.title = title;

    const isIndexed = result.verdict === 'PASS';
    const statusIcon = isIndexed ? '✅' : '❌';
    const crawlInfo = result.lastCrawlTime
      ? ` (마지막 크롤: ${new Date(result.lastCrawlTime).toLocaleDateString('ko-KR')})`
      : '';

    console.log(`${statusIcon} ${result.coverageState}${crawlInfo}`);

    if (isIndexed) {
      indexed++;
      results.push({ ...result, indexingRequested: false });
    } else {
      notIndexed++;

      // Try to request indexing
      let requested = false;
      if (indexingToken) {
        process.stdout.write(`     → 색인 요청 중... `);
        requested = await requestIndexing(link, indexingToken);
        if (requested) {
          console.log('✅ 요청 완료');
          indexingRequested++;
        } else {
          console.log('❌ 실패 (소유자 권한 필요)');
          indexingFailed++;
          indexingToken = null; // Don't retry for remaining URLs
        }
      }
      results.push({ ...result, indexingRequested: requested });
    }

    // Rate limit: URL Inspection API has low quota
    await new Promise((r) => setTimeout(r, 1500));
  }

  console.log('\n' + '='.repeat(60));
  console.log('결과 요약');
  console.log('='.repeat(60));
  console.log(`✅ 색인됨: ${indexed}개`);
  console.log(`❌ 미색인: ${notIndexed}개`);
  if (errors) console.log(`❓ 검사 실패: ${errors}개`);
  if (indexingRequested) console.log(`📤 색인 요청 성공: ${indexingRequested}개`);
  if (indexingFailed) console.log(`⚠️  색인 요청 실패: ${indexingFailed}개 (GSC에서 SA를 소유자로 등록 필요)`);

  if (notIndexed > 0) {
    console.log('\n--- 미색인 URL ---');
    results
      .filter((r) => r.verdict !== 'PASS')
      .forEach((r) => {
        const shortUrl = r.url.replace(WP_URL, '') || '/';
        console.log(`  ${shortUrl}`);
        console.log(`    상태: ${r.coverageState}`);
        console.log(`    robots.txt: ${r.robotsTxtState}`);
        console.log(`    페이지 가져오기: ${r.pageFetchState}`);
        if (r.lastCrawlTime) console.log(`    마지막 크롤: ${new Date(r.lastCrawlTime).toLocaleDateString('ko-KR')}`);
      });
  }

  if (indexingFailed > 0 && notIndexed > 0) {
    console.log('\n💡 Google Indexing API 사용하려면:');
    console.log('   1. Google Search Console → 설정 → 사용자 및 권한');
    console.log(`   2. "${posts[0] ? 'auto-blog-wordpress@auto-blog-wordpress-488705.iam.gserviceaccount.com' : 'SA_EMAIL'}" 추가`);
    console.log('   3. 권한을 "소유자"로 설정');
    console.log('   4. 이 스크립트 재실행');
  }
}

main().catch((e) => { console.error('Fatal:', e.message || e); process.exit(1); });
