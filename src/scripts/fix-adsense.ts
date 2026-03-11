/**
 * fix-adsense.ts
 * 1. AdSense JS를 WordPress <head>에 삽입 (ensureHeaderScripts 호출)
 * 2. 기존 포스트의 광고 코드에 data-ad-client 추가
 *
 * Usage: npx tsx src/scripts/fix-adsense.ts [--dry-run]
 */
import 'dotenv/config';
import axios, { type AxiosInstance } from 'axios';
import { SeoService } from '../services/seo.service.js';

const WP_URL = process.env.WP_URL!;
const WP_USERNAME = process.env.WP_USERNAME!;
const WP_APP_PASSWORD = process.env.WP_APP_PASSWORD!;
const ADSENSE_PUB_ID = process.env.ADSENSE_PUB_ID || '';
const GA_MEASUREMENT_ID = process.env.GA_MEASUREMENT_ID || '';
const GOOGLE_SITE_VERIFICATION = process.env.GOOGLE_SITE_VERIFICATION || '';
const NAVER_SITE_VERIFICATION = process.env.NAVER_SITE_VERIFICATION || '';
const DRY_RUN = process.argv.includes('--dry-run');

if (!ADSENSE_PUB_ID) {
  console.error('ADSENSE_PUB_ID is not set in .env');
  process.exit(1);
}

const token = Buffer.from(`${WP_USERNAME}:${WP_APP_PASSWORD}`).toString('base64');
const api: AxiosInstance = axios.create({
  baseURL: `${WP_URL.replace(/\/+$/, '')}/wp-json/wp/v2`,
  headers: { Authorization: `Basic ${token}` },
  timeout: 30000,
});

console.log(`ADSENSE_PUB_ID: ${ADSENSE_PUB_ID}`);
console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : '🔴 LIVE'}\n`);

// ══════════════════════════════════════════════════════════════
// STEP 1: Ensure AdSense JS in <head>
// ══════════════════════════════════════════════════════════════
async function ensureHeadScript(): Promise<void> {
  console.log('═══ Step 1: AdSense JS in <head> ═══\n');

  if (DRY_RUN) {
    console.log('(Dry run — would update header scripts with AdSense JS)');
    return;
  }

  try {
    const seoService = new SeoService(WP_URL, WP_USERNAME, WP_APP_PASSWORD);
    await seoService.ensureHeaderScripts({
      adsensePubId: ADSENSE_PUB_ID,
      gaMeasurementId: GA_MEASUREMENT_ID || undefined,
      googleCode: GOOGLE_SITE_VERIFICATION || undefined,
      naverCode: NAVER_SITE_VERIFICATION || undefined,
    });
    console.log('✅ Header scripts updated with AdSense JS\n');
  } catch (err: any) {
    console.error(`❌ Failed: ${err.message}`);
    console.log('\nManual fallback: Add this to WordPress → Appearance → Customize → Additional CSS/JS or WPCode plugin:');
    console.log(`<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_PUB_ID}" crossorigin="anonymous"></script>\n`);
  }
}

// ══════════════════════════════════════════════════════════════
// STEP 2: Fix ad slots in existing posts (add data-ad-client)
// ══════════════════════════════════════════════════════════════
async function fixPostAdSlots(): Promise<void> {
  console.log('═══ Step 2: Fix Ad Slots in Posts ═══\n');

  let page = 1;
  const posts: any[] = [];
  while (true) {
    const { data, headers } = await api.get('/posts', {
      params: { per_page: 100, page, status: 'publish', _fields: 'id,title,content' },
    });
    posts.push(...data);
    if (page >= parseInt(headers['x-wp-totalpages'] || '1', 10)) break;
    page++;
  }

  let fixed = 0;
  for (const post of posts) {
    let html = post.content.rendered;
    const title = post.title.rendered.replace(/<[^>]+>/g, '');
    let changed = false;

    // Fix 1: Add data-ad-client to ins tags missing it
    if (html.includes('adsbygoogle') && !html.includes('data-ad-client')) {
      html = html.replace(
        /(<ins\s+class="adsbygoogle"[^>]*)(>)/g,
        `$1 data-ad-client="${ADSENSE_PUB_ID}"$2`
      );
      changed = true;
    }

    // Fix 2: Replace placeholder slot IDs with empty string (Auto Ads will handle)
    if (html.includes('data-ad-slot="mid-content')) {
      html = html.replace(/data-ad-slot="mid-content-?\d*"/g, 'data-ad-slot=""');
      changed = true;
    }

    if (!changed) continue;

    console.log(`  [${post.id}] ${title} — fixing ad slots`);
    if (!DRY_RUN) {
      try {
        await api.post(`/posts/${post.id}`, { content: html });
        console.log(`    ✅ Updated`);
        fixed++;
      } catch (err: any) {
        console.error(`    ❌ Failed: ${err.message}`);
      }
    } else {
      fixed++;
    }
  }

  console.log(`\nFixed: ${fixed}/${posts.length} posts`);
}

async function main() {
  await ensureHeadScript();
  await fixPostAdSlots();
  console.log('\nDone.');
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
