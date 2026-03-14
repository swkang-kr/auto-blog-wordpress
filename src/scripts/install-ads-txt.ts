import dotenv from 'dotenv';
dotenv.config();
import { SeoService } from '../services/seo.service.js';

async function main() {
  const { WP_URL, WP_USERNAME, WP_APP_PASSWORD, ADSENSE_PUB_ID } = process.env;
  if (!WP_URL || !WP_USERNAME || !WP_APP_PASSWORD || !ADSENSE_PUB_ID) {
    console.error('Missing required env vars: WP_URL, WP_USERNAME, WP_APP_PASSWORD, ADSENSE_PUB_ID');
    process.exit(1);
  }
  const seo = new SeoService(WP_URL, WP_USERNAME, WP_APP_PASSWORD);
  await seo.ensureAdsTxtSnippet(ADSENSE_PUB_ID);
  console.log(`\nDone! Verify at: ${WP_URL}/ads.txt`);
}

main().catch((err) => {
  console.error('Failed:', err.message || err);
  process.exit(1);
});
