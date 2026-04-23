/**
 * 발행된 종목 관련 포스트의 금융 데이터 수정
 * - 시총, 현재가, PER, PBR 등 오래된 수치를 네이버 금융 실시간 데이터로 교체
 * - 증권사 목표가: 구체적 수치 대신 "최신 리포트 참고" 방식으로 변경
 *
 * 실행: npx tsx src/scripts/fix-stock-financial-data.ts
 * 드라이런: npx tsx src/scripts/fix-stock-financial-data.ts --dry-run
 */

import { spawnSync } from 'child_process';
import axios from 'axios';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import 'dotenv/config';

const DRY_RUN = process.argv.includes('--dry-run');
const TARGET_POST_ID = process.argv.find(a => /^\d+$/.test(a)) ? parseInt(process.argv.find(a => /^\d+$/.test(a))!) : null;

const WP_URL = process.env.WP_URL!.replace(/\/+$/, '');
const AUTH = Buffer.from(`${process.env.WP_USERNAME}:${process.env.WP_APP_PASSWORD}`).toString('base64');
const CLAUDE_BIN = process.env.CLAUDE_BIN || 'claude';

const wpApi = axios.create({
  baseURL: `${WP_URL}/wp-json/wp/v2`,
  headers: { Authorization: `Basic ${AUTH}` },
  timeout: 30_000,
});

const naverHeaders = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Referer': 'https://finance.naver.com',
};

// 종목 코드 매핑: 정적 목록 + Trade Engine 워치리스트 동적 로드
function buildStockCodeMap(): Record<string, string> {
  const map: Record<string, string> = {
    '삼성전자': '005930',
    'SK하이닉스': '000660',
    'POSCO': '005490',
    'POSCO홀딩스': '005490',
    '포스코': '005490',
    '현대제철': '004020',
    'LG에너지솔루션': '373220',
    '삼성SDI': '006400',
    'SK이노베이션': '096770',
    '현대차': '005380',
    '현대자동차': '005380',
    '기아': '000270',
    'NAVER': '035420',
    '네이버': '035420',
    '카카오': '035720',
    'LG전자': '066570',
    'KB금융': '105560',
    '신한지주': '055550',
    '하나금융지주': '086790',
    'LG화학': '051910',
    '셀트리온': '068270',
    '삼성바이오로직스': '207940',
    'SK텔레콤': '017670',
    'KT': '030200',
  };
  try {
    const watchlistPath = resolve(process.cwd(), 'data/trade-engine/live_watchlist.json');
    const wl = JSON.parse(readFileSync(watchlistPath, 'utf-8')) as { watchlist?: Array<{ stock_code: string; stock_name: string }> };
    for (const item of wl.watchlist ?? []) {
      if (item.stock_code && item.stock_name) map[item.stock_name] = item.stock_code;
    }
    const dbPath = resolve(process.cwd(), 'data/trade-engine/db_watchlist.json');
    const db = JSON.parse(readFileSync(dbPath, 'utf-8')) as { watchlist?: Array<{ stock_code: string; stock_name: string }> };
    for (const item of db.watchlist ?? []) {
      if (item.stock_code && item.stock_name) map[item.stock_name] = item.stock_code;
    }
  } catch { /* watchlist optional */ }
  return map;
}

const STOCK_CODE_MAP = buildStockCodeMap();

interface StockData {
  stockCode: string;
  stockName: string;
  price: number;
  diff: number;
  rate: number;
  marketCapJo: number;
  per: number | null;
  pbr: number | null;
  eps: number | null;
}

interface WPPost {
  id: number;
  title: { rendered: string };
  content: { rendered: string };
  excerpt: { rendered: string };
  link: string;
  categories: number[];
}

async function fetchStockData(stockCode: string, stockName: string): Promise<StockData | null> {
  try {
    const { data } = await axios.get<{
      marketSum: number; per: number; eps: number; pbr: number;
      now: number; diff: number; rate: number;
    }>('https://api.finance.naver.com/service/itemSummary.nhn', {
      params: { itemcode: stockCode },
      headers: naverHeaders,
      timeout: 8_000,
    });
    if (!data?.now) return null;
    return {
      stockCode,
      stockName,
      price: data.now,
      diff: data.diff,
      rate: data.rate,
      marketCapJo: data.marketSum / 1_000_000,
      per: data.per ?? null,
      pbr: data.pbr ?? null,
      eps: data.eps ?? null,
    };
  } catch {
    return null;
  }
}

function detectStocksInText(text: string): Array<{ name: string; code: string }> {
  const found: Array<{ name: string; code: string }> = [];
  const plain = text.replace(/<[^>]+>/g, ' ');
  for (const [name, code] of Object.entries(STOCK_CODE_MAP)) {
    if (plain.includes(name)) {
      found.push({ name, code });
    }
  }
  return found.filter((item, idx) => found.findIndex(f => f.code === item.code) === idx);
}

function hasFinancialData(html: string): boolean {
  const plain = html.replace(/<[^>]+>/g, ' ');
  return /시가총액|목표가|현재가|PER|PBR|주가\s*(전망|분석)|증권사/.test(plain);
}

function updatePostContent(post: WPPost, stocks: Array<{ name: string; code: string; data: StockData }>): string | null {
  const stockDataBlocks = stocks.map(s => {
    const d = s.data;
    const diffSign = d.diff >= 0 ? '▲' : '▼';
    const mcap = d.marketCapJo >= 1
      ? `약 ${d.marketCapJo.toFixed(1)}조원`
      : `약 ${(d.marketCapJo * 1000).toFixed(0)}억원`;
    return `
【${s.name} (${s.code}) 실시간 데이터 — 네이버 금융 기준】
- 현재가: ${d.price.toLocaleString('ko-KR')}원 (${diffSign}${Math.abs(d.diff).toLocaleString('ko-KR')}원, ${d.rate >= 0 ? '+' : ''}${d.rate}%)
- 시가총액: ${mcap}
- PER: ${d.per ? `${d.per}배` : 'N/A'}
- PBR: ${d.pbr ? `${d.pbr}배` : 'N/A'}
- EPS: ${d.eps ? `${d.eps.toLocaleString('ko-KR')}원` : 'N/A'}
⚠️ 증권사 목표가: 이 데이터는 제공되지 않음. 구체적인 목표가 수치를 생성하지 말고, "최신 증권사 리포트를 통해 확인 필요"로 기술할 것.`;
  }).join('\n');

  const prompt = `당신은 한국 주식 블로그 포스트의 콘텐츠 편집자입니다.
아래 포스트의 HTML 콘텐츠에서 금융 수치(시가총액, 현재가, PER, PBR, 증권사 목표가 범위 등)를
최신 실시간 데이터로 교체하는 작업을 해주세요.

## 규칙
1. HTML 구조(태그, 클래스, 스타일)를 보존하세요
2. 아래 최신 데이터를 사용해 수치를 교체하세요
3. 증권사 목표가: 구체적 수치(예: "45,000원~75,000원") 대신 "최신 증권사 리포트를 통해 확인하세요"로 변경
4. 금융 수치가 없는 단락은 수정하지 마세요
5. 순수 HTML만 반환하세요 (설명 없이)

## 최신 실시간 데이터
${stockDataBlocks}

## 수정할 포스트 HTML
${post.content.rendered.slice(0, 25000)}`;

  const { ANTHROPIC_API_KEY: _unused, ...safeEnv } = process.env;
  const result = spawnSync(CLAUDE_BIN, ['-p', prompt, '--model', 'opus'], {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    env: safeEnv,
  });

  if (result.status !== 0) {
    console.error(`Claude CLI error: ${result.stderr?.slice(0, 300)}`);
    return null;
  }

  const text = result.stdout?.trim() ?? '';
  return text.replace(/^```html?\s*/i, '').replace(/\s*```\s*$/, '').trim();
}

async function getAllPublishedPosts(): Promise<WPPost[]> {
  const posts: WPPost[] = [];
  let page = 1;
  while (true) {
    const { data, headers } = await wpApi.get('/posts', {
      params: { per_page: 100, page, status: 'publish', _fields: 'id,title,content,excerpt,link,categories' },
    });
    posts.push(...(data as WPPost[]));
    if (page >= parseInt(headers['x-wp-totalpages'] || '1')) break;
    page++;
  }
  return posts;
}

async function main() {
  console.log(`=== 종목 금융 데이터 수정 스크립트 ${DRY_RUN ? '[DRY RUN]' : '[실제 실행]'} ===`);
  console.log(`날짜: ${new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })} KST\n`);

  console.log('WordPress 포스트 조회 중...');
  const allPosts = await getAllPublishedPosts();
  console.log(`총 발행 포스트: ${allPosts.length}개\n`);

  let targetPosts = TARGET_POST_ID
    ? allPosts.filter(p => p.id === TARGET_POST_ID)
    : allPosts.filter(p => {
        const title = p.title.rendered;
        const hasStockKeyword = detectStocksInText(title).length > 0 || hasFinancialData(p.content.rendered);
        return hasStockKeyword;
      });

  if (targetPosts.length === 0) {
    console.log('수정 대상 포스트가 없습니다.');
    return;
  }

  console.log(`수정 대상 포스트: ${targetPosts.length}개`);
  targetPosts.forEach(p => console.log(`  [${p.id}] ${p.title.rendered}`));
  console.log('');

  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const post of targetPosts) {
    console.log(`\n[${post.id}] ${post.title.rendered}`);

    const titleStocks = detectStocksInText(post.title.rendered);
    const contentStocks = detectStocksInText(post.content.rendered);
    const uniqueStocks = [...titleStocks, ...contentStocks]
      .filter((s, i, arr) => arr.findIndex(x => x.code === s.code) === i);

    if (uniqueStocks.length === 0) {
      console.log('  → 종목 코드 매칭 없음, 스킵');
      skipped++;
      continue;
    }

    console.log(`  → 탐지된 종목: ${uniqueStocks.map(s => `${s.name}(${s.code})`).join(', ')}`);

    const stocksWithData: Array<{ name: string; code: string; data: StockData }> = [];
    for (const stock of uniqueStocks) {
      const data = await fetchStockData(stock.code, stock.name);
      if (data) {
        const mcap = data.marketCapJo >= 1 ? `${data.marketCapJo.toFixed(1)}조원` : `${(data.marketCapJo * 1000).toFixed(0)}억원`;
        console.log(`  → ${stock.name}: 현재가 ${data.price.toLocaleString('ko-KR')}원, 시총 약${mcap}, PER ${data.per ?? 'N/A'}배`);
        stocksWithData.push({ ...stock, data });
      } else {
        console.log(`  → ${stock.name}: 데이터 fetch 실패`);
      }
    }

    if (stocksWithData.length === 0) {
      console.log('  → 유효한 실시간 데이터 없음, 스킵');
      skipped++;
      continue;
    }

    if (DRY_RUN) {
      console.log('  → [DRY RUN] 수정 건너뜀');
      continue;
    }

    console.log('  → Claude CLI로 콘텐츠 수정 중...');
    const updatedContent = updatePostContent(post, stocksWithData);
    if (!updatedContent || updatedContent.length < 500) {
      console.error(`  → 콘텐츠 수정 실패 (길이: ${updatedContent?.length ?? 0})`);
      failed++;
      continue;
    }

    try {
      await wpApi.post(`/posts/${post.id}`, {
        content: updatedContent,
        modified: new Date().toISOString(),
      });
      console.log(`  ✓ WP 업데이트 완료 [ID=${post.id}]`);
      updated++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`  ✗ WP 업데이트 실패: ${msg}`);
      failed++;
    }

    await new Promise(r => setTimeout(r, 3000));
  }

  console.log('\n=== 완료 ===');
  console.log(`수정됨: ${updated}개`);
  console.log(`스킵: ${skipped}개`);
  console.log(`실패: ${failed}개`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
