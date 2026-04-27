import 'dotenv/config';
import { SeoService } from '../services/seo.service.js';

const WP_URL = process.env.WP_URL!;
const WP_USERNAME = process.env.WP_USERNAME!;
const WP_APP_PASSWORD = process.env.WP_APP_PASSWORD!;

if (!WP_URL || !WP_USERNAME || !WP_APP_PASSWORD) {
  console.error('Missing env vars');
  process.exit(1);
}

async function run() {
  const seo = new SeoService(WP_URL, WP_USERNAME, WP_APP_PASSWORD);
  await seo.ensureKoreanUrlRedirectSnippet();
  console.log('Done: Korean URL redirect snippet installed');
}
run().catch(e => { console.error(e); process.exit(1); });
