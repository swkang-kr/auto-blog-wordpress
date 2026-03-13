/**
 * Remove "한국어로 보기" links from all published posts.
 * Usage: npx tsx src/scripts/remove-kr-links.ts [--dry-run]
 */
import axios from 'axios';
import { loadConfig } from '../config/env.js';

async function main() {
  const c = loadConfig();
  const dryRun = process.argv.includes('--dry-run');
  const auth = Buffer.from(`${c.WP_USERNAME}:${c.WP_APP_PASSWORD}`).toString('base64');
  const headers = { Authorization: `Basic ${auth}` };

  console.log(`=== Remove 한국어로 보기 links ${dryRun ? '[DRY-RUN]' : '[LIVE]'} ===\n`);

  // Regex to match the Korean link div
  const krLinkRegex = /<div[^>]*>\s*<a[^>]*hreflang="ko"[^>]*>한국어로 보기<\/a>\s*<\/div>\s*/g;

  let page = 1;
  let fixed = 0;
  let scanned = 0;

  while (true) {
    const { data, headers: respHeaders } = await axios.get(
      `${c.WP_URL}/wp-json/wp/v2/posts`,
      { headers, params: { per_page: 50, page, status: 'publish,future,draft', _fields: 'id,title,content' }, timeout: 30000 },
    );
    const posts = data as Array<{ id: number; title: { rendered: string }; content: { rendered: string } }>;
    if (posts.length === 0) break;

    for (const p of posts) {
      scanned++;
      if (krLinkRegex.test(p.content.rendered)) {
        const cleaned = p.content.rendered.replace(krLinkRegex, '');
        if (dryRun) {
          console.log(`[DRY] ID=${p.id} | ${p.title.rendered.slice(0, 60)}`);
        } else {
          await axios.post(
            `${c.WP_URL}/wp-json/wp/v2/posts/${p.id}`,
            { content: cleaned },
            { headers, timeout: 30000 },
          );
          console.log(`✅ ID=${p.id} | ${p.title.rendered.slice(0, 60)}`);
          await new Promise(r => setTimeout(r, 300));
        }
        fixed++;
        krLinkRegex.lastIndex = 0; // reset regex state
      }
    }

    const totalPages = parseInt(respHeaders['x-wp-totalpages'] || '1');
    if (page >= totalPages) break;
    page++;
  }

  console.log(`\nScanned: ${scanned} | Fixed: ${fixed}`);
  if (dryRun && fixed > 0) console.log('Run without --dry-run to apply.');
}

main().catch(console.error);
