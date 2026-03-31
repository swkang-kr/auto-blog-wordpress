/**
 * update-faq-page.ts
 * FAQ 페이지를 현재 니치(시장분석, 업종분석, 테마분석, 종목분석)에 맞게 즉시 업데이트합니다.
 *
 * Usage: npx tsx src/scripts/update-faq-page.ts
 */
import 'dotenv/config';
import { PagesService } from '../services/pages.service.js';

const WP_URL = process.env.WP_URL!;
const WP_USERNAME = process.env.WP_USERNAME!;
const WP_APP_PASSWORD = process.env.WP_APP_PASSWORD!;
const SITE_NAME = process.env.SITE_NAME || 'TrendHunt';

if (!WP_URL || !WP_USERNAME || !WP_APP_PASSWORD) {
  console.error('Missing required env vars: WP_URL, WP_USERNAME, WP_APP_PASSWORD');
  process.exit(1);
}

async function main() {
  const pagesService = new PagesService(WP_URL, WP_USERNAME, WP_APP_PASSWORD);
  console.log(`Updating FAQ page on ${WP_URL}...`);
  await pagesService.ensureFaqPage([], SITE_NAME, WP_URL);
  console.log('Done.');
}

main().catch((err) => {
  console.error('Fatal:', err instanceof Error ? err.message : err);
  process.exit(1);
});
