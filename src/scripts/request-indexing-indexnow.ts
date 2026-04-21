/**
 * IndexNow로 네이버/다음(카카오) 색인 요청
 * IndexNow는 단일 제출로 참여 엔진(Naver, Daum/Kakao, Bing 등)에 동시 전파
 * 실행: node --import tsx/esm src/scripts/request-indexing-indexnow.ts
 */

import axios from 'axios';
import 'dotenv/config';

const WP_URL = process.env.WP_URL!.replace(/\/+$/, '');
const AUTH = Buffer.from(`${process.env.WP_USERNAME}:${process.env.WP_APP_PASSWORD}`).toString('base64');
const INDEXNOW_KEY = process.env.INDEXNOW_KEY!;
const HOST = new URL(WP_URL).hostname;

// 네이버 + 다음(카카오) 개별 엔드포인트 + 공용 api.indexnow.org
const ENDPOINTS = [
  'https://searchadvisor.naver.com/indexnow',
  'https://searchnow.daum.net/indexnow',
  'https://api.indexnow.org/indexnow',
];

async function getAllPostUrls(): Promise<string[]> {
  const posts: Array<{ link: string }> = [];
  let page = 1;
  while (true) {
    const { data, headers } = await axios.get(`${WP_URL}/wp-json/wp/v2/posts`, {
      headers: { Authorization: `Basic ${AUTH}` },
      params: { per_page: 100, page, status: 'publish', _fields: 'link' },
    });
    posts.push(...data);
    if (page >= parseInt(headers['x-wp-totalpages'] || '1')) break;
    page++;
  }
  return posts.map(p => p.link);
}

async function submitIndexNow(endpoint: string, urls: string[]): Promise<void> {
  const body = {
    host: HOST,
    key: INDEXNOW_KEY,
    keyLocation: `https://${HOST}/${INDEXNOW_KEY}.txt`,
    urlList: urls,
  };
  try {
    const { status } = await axios.post(endpoint, body, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 15_000,
    });
    if (status === 200 || status === 202) {
      console.log(`  ✅ ${endpoint} → ${status}`);
    } else {
      console.log(`  ⚠️  ${endpoint} → ${status}`);
    }
  } catch (err) {
    const msg = axios.isAxiosError(err) ? `${err.response?.status} ${JSON.stringify(err.response?.data)}` : String(err);
    console.error(`  ❌ ${endpoint} → ${msg}`);
  }
}

async function main() {
  console.log('=== IndexNow 색인 요청 (네이버 / 다음 / 공용) ===\n');

  console.log('WordPress 포스트 URL 조회 중...');
  const urls = await getAllPostUrls();
  console.log(`총 ${urls.length}개 URL\n`);

  for (const endpoint of ENDPOINTS) {
    console.log(`→ ${endpoint}`);
    // IndexNow는 1회 요청에 최대 10,000개 허용
    await submitIndexNow(endpoint, urls);
  }

  console.log('\n완료');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
