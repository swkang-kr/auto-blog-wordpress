import axios from 'axios';
import { logger } from '../utils/logger.js';

const api = axios.create({
  baseURL: `${process.env.WP_URL}/wp-json/wp/v2`,
  auth: { username: process.env.WP_USERNAME!, password: process.env.WP_APP_PASSWORD! },
  timeout: 30_000,
});

async function main() {
  // series-skincare-routine-guide 페이지 찾기
  const res = await api.get('/pages', { params: { slug: 'series-skincare-routine-guide', _fields: 'id,slug,title' } });
  const pages = res.data as { id: number; slug: string; title: { rendered: string } }[];
  if (!pages.length) { logger.info('페이지 없음 (이미 삭제됨)'); return; }
  const page = pages[0];
  logger.info(`삭제: [ID=${page.id}] ${page.slug}`);
  await api.delete(`/pages/${page.id}`, { params: { force: true } });
  logger.info('삭제 완료');
}

main().catch(e => { console.error(e.message); process.exit(1); });
