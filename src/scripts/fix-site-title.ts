/**
 * fix-site-title.ts
 * WordPress 사이트 타이틀/태그라인 + Rank Math 홈페이지 타이틀을 강제 업데이트합니다.
 * 캐시도 퍼지 시도합니다.
 *
 * Usage: npx tsx src/scripts/fix-site-title.ts
 */
import 'dotenv/config';
import axios from 'axios';

const WP_URL = process.env.WP_URL!.replace(/\/+$/, '');
const WP_USERNAME = process.env.WP_USERNAME!;
const WP_APP_PASSWORD = process.env.WP_APP_PASSWORD!;
const SITE_NAME = process.env.SITE_NAME || 'TrendHunt';

const token = Buffer.from(`${WP_USERNAME}:${WP_APP_PASSWORD}`).toString('base64');
const headers = { Authorization: `Basic ${token}` };

const TAGLINE = 'Your Guide to Korean-Stock, 한국주식 & 금융분석 Trends';

async function main() {
  console.log(`Site: ${WP_URL}\n`);

  // 1. Update WordPress core settings
  console.log('=== 1. WordPress Core Settings ===');
  const { data: settings } = await axios.post(
    `${WP_URL}/wp-json/wp/v2/settings`,
    { title: SITE_NAME, description: TAGLINE },
    { headers },
  );
  console.log(`  title: ${settings.title}`);
  console.log(`  description: ${settings.description}`);

  // 2. Update Rank Math settings via options API
  console.log('\n=== 2. Rank Math Homepage Title ===');
  const rmTitle = `${SITE_NAME} - ${TAGLINE}`;

  // Try updating Rank Math options via the Rank Math REST API
  try {
    await axios.post(
      `${WP_URL}/wp-json/rankmath/v1/updateMeta`,
      { objectType: 'options', objectID: 'homepage', meta: { 'homepage_title': rmTitle } },
      { headers },
    );
    console.log(`  Rank Math homepage title updated: "${rmTitle}"`);
  } catch {
    console.log('  Rank Math REST API not available, trying Code Snippets...');
  }

  // 3. Install Code Snippet to update Rank Math DB option + force title filters
  console.log('\n=== 3. Code Snippet: Force Site Title ===');
  const phpCode = `
// One-time: Update Rank Math homepage title in DB options
add_action('init', function() {
    \$rm_titles = get_option('rank-math-options-titles', []);
    \$desired = '${SITE_NAME} - ${TAGLINE}';
    if (is_array(\$rm_titles) && (!isset(\$rm_titles['homepage_title']) || \$rm_titles['homepage_title'] !== \$desired)) {
        \$rm_titles['homepage_title'] = \$desired;
        \$rm_titles['homepage_description'] = 'Discover the latest Korean 주식분석, K-beauty product reviews, 한국주식 실적발표s, and 금융분석 recommendations. Your trusted source for Korean culture trends.';
        update_option('rank-math-options-titles', \$rm_titles);
    }
});

// Filter: Force title on homepage regardless of Rank Math cache
add_filter('rank_math/frontend/title', function(\$title) {
    if (is_home() || is_front_page()) {
        return '${SITE_NAME} - ${TAGLINE}';
    }
    return \$title;
}, 999);

// Filter: Force WordPress document title
add_filter('pre_get_document_title', function(\$title) {
    if (is_home() || is_front_page()) {
        return '${SITE_NAME} - ${TAGLINE}';
    }
    return \$title;
}, 999);`.trim();

  const snippetTitle = 'Auto Blog Force Site Title';
  try {
    const { data: snippets } = await axios.get(
      `${WP_URL}/wp-json/code-snippets/v1/snippets`,
      { headers },
    );
    const existing = (snippets as Array<{ id: number; name: string }>)
      .find((s: { name: string }) => s.name === snippetTitle);

    if (existing) {
      await axios.put(
        `${WP_URL}/wp-json/code-snippets/v1/snippets/${existing.id}`,
        { code: phpCode, active: true },
        { headers },
      );
      console.log(`  Snippet updated (ID=${existing.id})`);
    } else {
      await axios.post(
        `${WP_URL}/wp-json/code-snippets/v1/snippets`,
        { name: snippetTitle, code: phpCode, scope: 'global', active: true, priority: 999 },
        { headers },
      );
      console.log('  Snippet installed');
    }
  } catch (err) {
    console.error(`  Failed: ${err instanceof Error ? err.message : err}`);
  }

  // 4. Try purging caches
  console.log('\n=== 4. Cache Purge ===');
  const cacheEndpoints = [
    { name: 'WP Super Cache', url: `${WP_URL}/wp-json/wp-super-cache/v1/cache`, method: 'DELETE' },
    { name: 'LiteSpeed', url: `${WP_URL}/wp-json/developer/v1/flush-all`, method: 'POST' },
    { name: 'W3TC', url: `${WP_URL}/wp-json/w3tc/v1/flush`, method: 'POST' },
  ];
  for (const ep of cacheEndpoints) {
    try {
      await axios({ url: ep.url, method: ep.method as 'DELETE' | 'POST', headers, timeout: 5000 });
      console.log(`  ${ep.name}: purged`);
    } catch {
      // Cache plugin not installed, skip
    }
  }
  console.log('  (If using Cloudflare or other CDN, purge cache manually)');

  console.log('\n=== Done ===');
  console.log(`New title: "${SITE_NAME} - ${TAGLINE}"`);
}

main().catch((err) => {
  console.error('Fatal:', err instanceof Error ? err.message : err);
  process.exit(1);
});
