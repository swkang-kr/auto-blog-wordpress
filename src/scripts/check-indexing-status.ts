/**
 * Google Indexing API 색인 상태 확인
 * 실행: npx tsx src/scripts/check-indexing-status.ts
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

interface IndexingMetadata {
  url: string;
  latestUpdate?: {
    url: string;
    type: string;
    notifyTime: string;
  };
  latestRemove?: {
    url: string;
    type: string;
    notifyTime: string;
  };
}

async function getIndexingStatus(url: string, token: string): Promise<IndexingMetadata | null> {
  try {
    const { data } = await axios.get<IndexingMetadata>(
      'https://indexing.googleapis.com/v3/urlNotifications/metadata',
      {
        params: { url },
        headers: { Authorization: `Bearer ${token}` },
        timeout: 15000,
      },
    );
    return data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      if (error.response?.status === 404) return null; // No notification found
      if (error.response?.status === 429) {
        console.log('  ⚠️  할당량 초과 — 잠시 대기');
        await new Promise((r) => setTimeout(r, 5000));
        return getIndexingStatus(url, token); // retry once
      }
      console.error(`  [ERROR] ${error.response?.status} ${JSON.stringify(error.response?.data)}`);
    }
    return null;
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
      ...items
        .filter((p) => !p.slug.endsWith('-kr'))
        .map((p) => ({ link: p.link, title: p.title.rendered })),
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

  console.log('\n=== Google Indexing API 색인 상태 확인 ===\n');

  const posts = await getAllPostUrls();
  console.log(`대상 EN 포스트: ${posts.length}개\n`);

  console.log('Access Token 발급 중...');
  const token = await getAccessToken();
  console.log('✅ Token 발급 완료\n');

  let indexed = 0, notFound = 0, errors = 0;
  const results: Array<{ title: string; url: string; status: string; notifyTime?: string }> = [];

  for (let i = 0; i < posts.length; i++) {
    const { link, title } = posts[i];
    const shortUrl = link.replace(WP_URL, '');
    process.stdout.write(`[${i + 1}/${posts.length}] ${shortUrl} ... `);

    const metadata = await getIndexingStatus(link, token);

    if (metadata?.latestUpdate) {
      const time = new Date(metadata.latestUpdate.notifyTime).toLocaleString('ko-KR');
      console.log(`✅ 색인 요청됨 (${time})`);
      results.push({ title, url: link, status: 'indexed', notifyTime: metadata.latestUpdate.notifyTime });
      indexed++;
    } else {
      console.log('❌ 색인 요청 없음');
      results.push({ title, url: link, status: 'not_found' });
      notFound++;
    }

    // Rate limit: ~1 req/sec
    await new Promise((r) => setTimeout(r, 1100));
  }

  console.log('\n=== 결과 요약 ===');
  console.log(`✅ 색인 요청됨: ${indexed}개`);
  console.log(`❌ 색인 요청 없음: ${notFound}개`);
  if (errors) console.log(`⚠️  오류: ${errors}개`);

  if (notFound > 0) {
    console.log('\n--- 색인 요청이 없는 포스트 ---');
    results
      .filter((r) => r.status === 'not_found')
      .forEach((r) => console.log(`  ${r.url}`));
    console.log('\n💡 색인 요청: npx tsx src/scripts/request-indexing-all.ts');
  }
}

main().catch((e) => { console.error('Fatal:', e); process.exit(1); });
