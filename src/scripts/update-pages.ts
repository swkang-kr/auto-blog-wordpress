/**
 * update-pages.ts
 * About, Privacy, Contact, Disclaimer, Terms 페이지를 현재 니치에 맞게 즉시 업데이트합니다.
 *
 * Usage: npx tsx src/scripts/update-pages.ts
 */
import 'dotenv/config';
import { PagesService } from '../services/pages.service.js';

const WP_URL = process.env.WP_URL!;
const WP_USERNAME = process.env.WP_USERNAME!;
const WP_APP_PASSWORD = process.env.WP_APP_PASSWORD!;
const SITE_NAME = process.env.SITE_NAME || 'TrendHunt';
const SITE_OWNER = process.env.SITE_OWNER || '';
const CONTACT_EMAIL = process.env.CONTACT_EMAIL || '';

if (!WP_URL || !WP_USERNAME || !WP_APP_PASSWORD) {
  console.error('Missing required env vars: WP_URL, WP_USERNAME, WP_APP_PASSWORD');
  process.exit(1);
}

async function main() {
  const pagesService = new PagesService(WP_URL, WP_USERNAME, WP_APP_PASSWORD);
  console.log(`Updating pages on ${WP_URL}...`);
  await pagesService.ensureRequiredPages(
    SITE_NAME,
    SITE_OWNER,
    CONTACT_EMAIL,
    {
      linkedin: process.env.AUTHOR_LINKEDIN,
      twitter: process.env.AUTHOR_TWITTER,
    },
    process.env.AUTHOR_BIO,
    process.env.AUTHOR_CREDENTIALS,
  );
  console.log('Done.');
}

main().catch((err) => {
  console.error('Fatal:', err instanceof Error ? err.message : err);
  process.exit(1);
});
