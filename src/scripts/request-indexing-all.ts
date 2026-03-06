/**
 * 전체 EN 포스트 Google Indexing API 색인 재요청
 * 실행: npx tsx src/scripts/request-indexing-all.ts
 */

import axios from 'axios';
import { createSign } from 'crypto';
import 'dotenv/config';

const WP_URL = process.env.WP_URL!.replace(/\/+$/, '');
const AUTH = Buffer.from(`${process.env.WP_USERNAME}:${process.env.WP_APP_PASSWORD}`).toString('base64');
const SA_KEY = process.env.GOOGLE_INDEXING_SA_KEY!;

const api = axios.create({
  baseURL: `${WP_URL}/wp-json/wp/v2`,
  headers: { Authorization: `Basic ${AUTH}` },
  timeout: 30000,
});

async function getAccessToken(): Promise<string> {
  const sa = JSON.parse(SA_KEY) as { client_email: string; private_key: string };
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/indexing',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  })).toString('base64url');
  const sign = createSign('RSA-SHA256');
  sign.update(`${header}.${payload}`);
  const jwt = `${header}.${payload}.${sign.sign(sa.private_key, 'base64url')}`;

  const { data } = await axios.post<{ access_token: string }>(
    'https://oauth2.googleapis.com/token',
    new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 10000 },
  );
  return data.access_token;
}

async function requestIndexing(url: string, token: string): Promise<'ok' | 'quota' | 'error'> {
  try {
    await axios.post(
      'https://indexing.googleapis.com/v3/urlNotifications:publish',
      { url, type: 'URL_UPDATED' },
      { headers: { Authorization: `Bearer ${token}` }, timeout: 15000 },
    );
    return 'ok';
  } catch (error) {
    if (axios.isAxiosError(error)) {
      if (error.response?.status === 429) return 'quota';
      console.error(`  [ERROR] ${error.response?.status} ${JSON.stringify(error.response?.data)}`);
    }
    return 'error';
  }
}

async function getAllPostUrls(): Promise<string[]> {
  const urls: string[] = [];
  let page = 1;
  while (true) {
    const { data, headers } = await api.get('/posts', {
      params: { per_page: 100, page, status: 'publish', _fields: 'link,slug' },
    });
    const posts = data as Array<{ link: string; slug: string }>;
    // EN 포스트만 (slug가 -kr로 끝나지 않는 것)
    urls.push(...posts.filter((p) => !p.slug.endsWith('-kr')).map((p) => p.link));
    if (page >= parseInt(headers['x-wp-totalpages'] || '1')) break;
    page++;
  }
  return urls;
}

async function main() {
  if (!SA_KEY) {
    console.error('GOOGLE_INDEXING_SA_KEY가 설정되지 않았습니다.');
    process.exit(1);
  }

  console.log('\n=== Google Indexing API 색인 재요청 ===\n');

  const urls = await getAllPostUrls();
  console.log(`대상 EN 포스트: ${urls.length}개\n`);

  console.log('Access Token 발급 중...');
  const token = await getAccessToken();
  console.log('✅ Token 발급 완료\n');

  let ok = 0, quota = 0, errors = 0;

  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    process.stdout.write(`[${i + 1}/${urls.length}] ${url.replace(WP_URL, '')} ... `);

    const result = await requestIndexing(url, token);

    if (result === 'ok') {
      console.log('✅');
      ok++;
    } else if (result === 'quota') {
      console.log('⚠️  할당량 초과 — 중단');
      quota = urls.length - i;
      break;
    } else {
      console.log('❌');
      errors++;
    }

    // Google Indexing API: 200 req/day, 1 req/sec
    await new Promise((r) => setTimeout(r, 1100));
  }

  console.log(`\n=== 완료 ===`);
  console.log(`✅ 요청 성공: ${ok}개`);
  if (errors) console.log(`❌ 실패: ${errors}개`);
  if (quota) console.log(`⚠️  할당량 초과로 미처리: ${quota}개 (내일 재실행 필요)`);
}

main().catch((e) => { console.error('Fatal:', e); process.exit(1); });
