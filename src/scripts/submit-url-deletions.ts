/**
 * submit-url-deletions.ts
 * Google Indexing API에 URL_DELETED 알림 일괄 전송.
 * GSC "찾을 수 없음(404)" 리포트로 표시되는 옛 URL들을 색인에서 빠르게 제거.
 *
 * 입력: data/gsc-404-urls.txt — 한 줄에 URL 하나 (빈 줄/주석 # 허용)
 *      또는 GSC에서 다운받은 CSV (첫 컬럼이 URL이면 자동 인식)
 *
 * 실행: node --env-file=.env --import tsx/esm src/scripts/submit-url-deletions.ts [--dry-run] [--file=path]
 *
 * 제약:
 * - Indexing API 일일 quota 기본 200건 (Google Cloud Console에서 증액 신청 가능)
 * - 일반 페이지에 대한 URL_DELETED는 비공식이지만 실제 동작함
 */
import axios from 'axios';
import { createSign } from 'crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import 'dotenv/config';

const SA_KEY = process.env.GOOGLE_INDEXING_SA_KEY;
const DRY_RUN = process.argv.includes('--dry-run');
const fileArg = process.argv.find(a => a.startsWith('--file='));
const INPUT_FILE = fileArg ? fileArg.split('=')[1] : 'data/gsc-404-urls.txt';

if (!SA_KEY) {
  console.error('[FAIL] GOOGLE_INDEXING_SA_KEY 미설정');
  process.exit(1);
}

async function getAccessToken(): Promise<string> {
  const sa = JSON.parse(SA_KEY!) as { client_email: string; private_key: string };
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

async function loadUrls(file: string): Promise<string[]> {
  const raw = await fs.readFile(file, 'utf-8');
  const isCsv = file.toLowerCase().endsWith('.csv');
  const urls = new Set<string>();
  let lineNo = 0;
  for (const rawLine of raw.split(/\r?\n/)) {
    lineNo++;
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    // CSV: 헤더 행 + 첫 컬럼이 URL이라고 가정
    if (isCsv && lineNo === 1 && !line.startsWith('http')) continue;
    const firstCol = isCsv ? line.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/)[0].replace(/^"|"$/g, '') : line;
    if (/^https?:\/\//.test(firstCol)) urls.add(firstCol);
  }
  return [...urls];
}

async function submitDeletion(url: string, token: string): Promise<'ok' | 'quota' | 'not_found' | 'error'> {
  try {
    await axios.post(
      'https://indexing.googleapis.com/v3/urlNotifications:publish',
      { url, type: 'URL_DELETED' },
      { headers: { Authorization: `Bearer ${token}` }, timeout: 15000 },
    );
    return 'ok';
  } catch (error) {
    if (axios.isAxiosError(error)) {
      if (error.response?.status === 429) return 'quota';
      if (error.response?.status === 404) return 'not_found';
      console.error(`  [ERROR] ${url} → ${error.response?.status} ${JSON.stringify(error.response?.data)}`);
    }
    return 'error';
  }
}

async function main() {
  const file = path.resolve(INPUT_FILE);
  console.log(`[INPUT] ${file}`);
  const urls = await loadUrls(file).catch(err => {
    console.error(`[FAIL] 파일 로드 실패: ${err instanceof Error ? err.message : err}`);
    process.exit(2);
  });

  console.log(`[LOAD] ${urls.length}개 URL 로드됨`);
  if (urls.length === 0) {
    console.log('[INFO] 처리할 URL 없음');
    return;
  }

  if (DRY_RUN) {
    console.log('[DRY_RUN] 실제 호출 없이 목록만 표시');
    for (const u of urls) console.log(`  - ${u}`);
    return;
  }

  const token = await getAccessToken();
  let ok = 0, quota = 0, notFound = 0, errors = 0;

  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    const result = await submitDeletion(url, token);
    if (result === 'ok') {
      ok++;
      console.log(`  [${i + 1}/${urls.length}] OK ${url}`);
    } else if (result === 'quota') {
      quota++;
      console.warn(`  [${i + 1}/${urls.length}] QUOTA 429 — 일일 200건 소진. 24h 후 재시도.`);
      break;
    } else if (result === 'not_found') {
      notFound++;
      console.warn(`  [${i + 1}/${urls.length}] NOT_FOUND 404 ${url}`);
    } else {
      errors++;
    }
    // Indexing API: 600 req/min 권장 한계, 보수적으로 100ms 간격
    await new Promise(r => setTimeout(r, 100));
  }

  console.log('\n[SUMMARY]');
  console.log(`  OK: ${ok}`);
  console.log(`  NOT_FOUND: ${notFound}`);
  console.log(`  QUOTA: ${quota}`);
  console.log(`  ERROR: ${errors}`);
  console.log(`  TOTAL: ${urls.length}`);
}

main().catch(err => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(3);
});
