/**
 * remove-newsletter-cta.ts
 * 모든 발행된 포스트에서 뉴스레터 CTA 블록 제거
 * Targets: ab-newsletter-cta, ab-cta ab-cta-newsletter
 *
 * Usage:
 *   npx tsx src/scripts/remove-newsletter-cta.ts --dry-run
 *   npx tsx src/scripts/remove-newsletter-cta.ts
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

/** Remove a div block by class name, handling arbitrary nesting depth. */
function removeDivByClass(html: string, className: string): { result: string; count: number } {
  let result = html;
  let count = 0;
  // Match opening <div> tags that contain the target class
  const classPattern = new RegExp(`<div[^>]*\\b${className}\\b[^>]*>`);

  let match = classPattern.exec(result);
  while (match) {
    const idx = match.index;
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
          const end = closeTag + 6; // '</div>'.length
          result = result.slice(0, idx) + result.slice(end);
          count++;
          break;
        }
        pos = closeTag + 6;
      }
    }
    match = classPattern.exec(result);
  }

  return { result, count };
}

function removeNewsletterCta(html: string): { cleaned: string; removed: number } {
  let cleaned = html;
  let removed = 0;

  // Primary: <div class="ab-newsletter-cta">
  const r1 = removeDivByClass(cleaned, 'ab-newsletter-cta');
  cleaned = r1.result;
  removed += r1.count;

  // Secondary: <div class="ab-cta ab-cta-newsletter"> (or similar ordering)
  const r2 = removeDivByClass(cleaned, 'ab-cta-newsletter');
  cleaned = r2.result;
  removed += r2.count;

  return { cleaned, removed };
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
  console.log(`\n=== Remove Newsletter CTA (${DRY_RUN ? 'DRY RUN' : 'LIVE'}) ===\n`);

  const posts = await getAllPosts();
  console.log(`Total published posts: ${posts.length}`);

  let found = 0;
  let updated = 0;
  let totalRemoved = 0;

  for (const post of posts) {
    const html = post.content.rendered;
    if (!html.includes('ab-newsletter-cta') && !html.includes('ab-cta-newsletter')) continue;

    found++;
    const { cleaned, removed } = removeNewsletterCta(html);

    console.log(`[FOUND] ${post.link} (${removed} block${removed !== 1 ? 's' : ''})`);
    if (DRY_RUN) {
      console.log('  → Would remove (dry-run)\n');
      totalRemoved += removed;
      continue;
    }

    try {
      await api.post(`/posts/${post.id}`, { content: cleaned });
      updated++;
      totalRemoved += removed;
      console.log('  → Removed\n');
      await new Promise(r => setTimeout(r, 300));
    } catch (e) {
      console.error(`  → FAILED: ${e instanceof Error ? e.message : e}\n`);
    }
  }

  console.log(`=== Done: ${found} posts found, ${updated} updated, ${totalRemoved} CTA blocks removed ===`);
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
