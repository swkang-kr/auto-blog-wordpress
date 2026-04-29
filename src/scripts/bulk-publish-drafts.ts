/**
 * bulk-publish-drafts.ts
 * WP REST API로 draft 포스트를 전체 publish로 일괄 변경
 * GitHub Actions(비차단 IP)에서 실행
 */
import axios from 'axios';
import { logger } from '../utils/logger.js';

const WP_URL = process.env.WP_URL!;
const WP_USERNAME = process.env.WP_USERNAME!;
const WP_APP_PASSWORD = process.env.WP_APP_PASSWORD!;

if (!WP_URL || !WP_USERNAME || !WP_APP_PASSWORD) {
  logger.error('WP_URL, WP_USERNAME, WP_APP_PASSWORD 환경변수 필요');
  process.exit(1);
}

const api = axios.create({
  baseURL: `${WP_URL}/wp-json/wp/v2`,
  auth: { username: WP_USERNAME, password: WP_APP_PASSWORD },
  timeout: 30_000,
});

async function fetchAllDrafts(): Promise<{ id: number; title: string; status: string }[]> {
  const drafts: { id: number; title: string; status: string }[] = [];
  let page = 1;
  while (true) {
    const res = await api.get('/posts', {
      params: { status: 'draft', per_page: 100, page, _fields: 'id,title,status' },
    });
    const items = res.data as { id: number; title: { rendered: string }; status: string }[];
    if (!items.length) break;
    drafts.push(...items.map(p => ({ id: p.id, title: p.title.rendered, status: p.status })));
    const total = parseInt(res.headers['x-wp-totalpages'] ?? '1', 10);
    if (page >= total) break;
    page++;
  }
  return drafts;
}

async function publishPost(id: number): Promise<boolean> {
  try {
    await api.post(`/posts/${id}`, { status: 'publish' });
    return true;
  } catch (err) {
    logger.warn(`Post ${id} publish 실패: ${err instanceof Error ? err.message : err}`);
    return false;
  }
}

async function main() {
  logger.info('Draft 포스트 조회 중...');
  const drafts = await fetchAllDrafts();
  logger.info(`Draft 포스트 총 ${drafts.length}개 발견`);

  if (!drafts.length) {
    logger.info('발행할 draft 포스트 없음');
    return;
  }

  let published = 0;
  let failed = 0;
  for (const post of drafts) {
    logger.info(`발행 중: [ID=${post.id}] ${post.title.slice(0, 50)}`);
    const ok = await publishPost(post.id);
    if (ok) {
      published++;
      logger.info(`  → 발행 완료 (${published}/${drafts.length})`);
    } else {
      failed++;
    }
    // Rate limit 방지
    await new Promise(r => setTimeout(r, 300));
  }

  logger.info(`\n완료: 발행 ${published}개 / 실패 ${failed}개 / 총 ${drafts.length}개`);
}

main().catch(err => {
  logger.error(`bulk-publish-drafts 실패: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
