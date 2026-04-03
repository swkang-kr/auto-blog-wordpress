/**
 * remove-data-charts.ts
 * 모든 발행된 포스트에서 ab-data-chart SVG 블록 제거
 *
 * Usage:
 *   npx tsx src/scripts/remove-data-charts.ts --dry-run
 *   npx tsx src/scripts/remove-data-charts.ts
 */
import 'dotenv/config';
import axios from 'axios';

const WP_URL = process.env.WP_URL!.replace(/\/+$/, '');
const AUTH = Buffer.from(`${process.env.WP_USERNAME}:${process.env.WP_APP_PASSWORD}`).toString('base64');
const DRY_RUN = process.argv.includes('--dry-run');

const api = axios.create({
  baseURL: `${WP_URL}/wp-json/wp/v2`,
  headers: { Authorization: `Basic ${AUTH}` },
  timeout: 30000,
});

function removeDataChart(html: string): string {
  // Remove <div class="ab-data-chart"...>...</div> blocks (including nested tags)
  let result = html;
  const startMarker = '<div class="ab-data-chart"';
  let idx = result.indexOf(startMarker);
  let removed = 0;
  while (idx !== -1) {
    // Find matching closing </div> by tracking nesting depth
    let depth = 0;
    let pos = idx;
    while (pos < result.length) {
      const openTag = result.indexOf('<div', pos);
      const closeTag = result.indexOf('</div>', pos);
      if (closeTag === -1) break;
      if (openTag !== -1 && openTag < closeTag) {
        depth++;
        pos = openTag + 4;
      } else {
        depth--;
        if (depth === 0) {
          const end = closeTag + 6; // length of </div>
          result = result.slice(0, idx) + result.slice(end);
          removed++;
          break;
        }
        pos = closeTag + 6;
      }
    }
    idx = result.indexOf(startMarker);
  }
  return result;
}

async function getAllPosts() {
  const posts: Array<{ id: number; link: string; content: { rendered: string } }> = [];
  let page = 1;
  while (true) {
    const { data, headers } = await api.get('/posts', {
      params: { per_page: 100, page, status: 'publish', _fields: 'id,link,content' },
    });
    posts.push(...data);
    if (page >= parseInt(headers['x-wp-totalpages'] || '1')) break;
    page++;
  }
  return posts;
}

async function main() {
  console.log(`\n=== Remove ab-data-chart SVG (${DRY_RUN ? 'DRY RUN' : 'LIVE'}) ===\n`);

  const posts = await getAllPosts();
  console.log(`Total published posts: ${posts.length}`);

  let found = 0;
  let updated = 0;

  for (const post of posts) {
    const html = post.content.rendered;
    if (!html.includes('ab-data-chart')) continue;

    found++;
    const cleaned = removeDataChart(html);

    console.log(`[FOUND] ${post.link}`);
    if (DRY_RUN) {
      console.log('  → Would remove chart (dry-run)\n');
      continue;
    }

    try {
      await api.post(`/posts/${post.id}`, { content: cleaned });
      updated++;
      console.log('  → Removed\n');
      await new Promise(r => setTimeout(r, 300));
    } catch (e) {
      console.error(`  → FAILED: ${e instanceof Error ? e.message : e}\n`);
    }
  }

  console.log(`=== Done: ${found} found, ${updated} updated ===`);
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
