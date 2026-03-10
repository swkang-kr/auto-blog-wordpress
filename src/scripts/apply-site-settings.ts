/**
 * apply-site-settings.ts
 * 사이트 타이틀/태그라인 업데이트 + 내비게이션 메뉴를 니치 카테고리에 맞게 즉시 적용합니다.
 * 기존 메뉴가 있으면 삭제 후 재생성합니다.
 *
 * Usage: npx tsx src/scripts/apply-site-settings.ts
 */
import 'dotenv/config';
import { NICHES } from '../config/niches.js';
import { SeoService } from '../services/seo.service.js';

const WP_URL = process.env.WP_URL!;
const WP_USERNAME = process.env.WP_USERNAME!;
const WP_APP_PASSWORD = process.env.WP_APP_PASSWORD!;
const SITE_NAME = process.env.SITE_NAME || 'TrendHunt';

if (!WP_URL || !WP_USERNAME || !WP_APP_PASSWORD) {
  console.error('Missing required env vars: WP_URL, WP_USERNAME, WP_APP_PASSWORD');
  process.exit(1);
}

async function main() {
  const seoService = new SeoService(WP_URL, WP_USERNAME, WP_APP_PASSWORD);
  const categories = [...new Set(NICHES.map((n) => n.category))];

  console.log(`Site: ${WP_URL}`);
  console.log(`Categories: ${categories.join(', ')}`);

  console.log('\n=== 1. Site Title & Tagline ===');
  await seoService.ensureSiteTitle(SITE_NAME, categories);

  console.log('\n=== 2. Navigation Menu ===');
  await seoService.ensureNavigationMenu(categories);

  console.log('\n=== Done ===');
}

main().catch((err) => {
  console.error('Fatal:', err instanceof Error ? err.message : err);
  process.exit(1);
});
