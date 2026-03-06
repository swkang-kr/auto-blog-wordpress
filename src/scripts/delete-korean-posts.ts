import axios from 'axios';
import * as dotenv from 'dotenv';
dotenv.config();

const WP_URL = process.env.WP_URL!;
const WP_USERNAME = process.env.WP_USERNAME!;
const WP_APP_PASSWORD = process.env.WP_APP_PASSWORD!;

function wpAuth() {
  const creds = Buffer.from(`${WP_USERNAME}:${WP_APP_PASSWORD}`).toString('base64');
  return { Authorization: `Basic ${creds}`, 'Content-Type': 'application/json' };
}

function isKorean(text: string): boolean {
  const cleaned = text.replace(/<[^>]+>/g, '').trim();
  const koreanChars = cleaned.match(/[\uac00-\ud7af\u1100-\u11ff\u3130-\u318f]/g);
  if (!koreanChars) return false;
  const ratio = koreanChars.length / cleaned.replace(/\s/g, '').length;
  return ratio > 0.3;
}

async function main() {
  const DRY_RUN = process.argv.includes('--dry-run');
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE DELETE'}\n`);

  // Fetch all posts
  const posts: any[] = [];
  let page = 1;
  while (true) {
    const res = await axios.get(`${WP_URL}/wp-json/wp/v2/posts`, {
      headers: wpAuth(),
      params: { per_page: 100, page, status: 'publish', _fields: 'id,title,slug,link,content' },
    });
    if (res.data.length === 0) break;
    posts.push(...res.data);
    const totalPages = parseInt(res.headers['x-wp-totalpages'] ?? '1', 10);
    if (page >= totalPages) break;
    page++;
  }

  console.log(`Total posts: ${posts.length}`);

  // Filter Korean posts by CONTENT (not title)
  const koreanPosts = posts.filter(p => isKorean(p.content.rendered));
  console.log(`Korean content posts found: ${koreanPosts.length}\n`);

  if (koreanPosts.length === 0) {
    console.log('No Korean posts to delete.');
    return;
  }

  for (const p of koreanPosts) {
    const title = p.title.rendered.replace(/<[^>]+>/g, '');
    console.log(`[${p.id}] ${title}`);
  }

  if (DRY_RUN) {
    console.log('\nDry run complete. Run without --dry-run to delete.');
    return;
  }

  console.log('\nDeleting...');
  let deleted = 0, failed = 0;
  for (const p of koreanPosts) {
    try {
      await axios.delete(`${WP_URL}/wp-json/wp/v2/posts/${p.id}?force=true`, {
        headers: wpAuth(),
      });
      console.log(`  ✅ Deleted [${p.id}]`);
      deleted++;
    } catch (err: any) {
      console.error(`  ❌ Failed [${p.id}]: ${err.message}`);
      failed++;
    }
  }

  console.log(`\n=== Summary ===`);
  console.log(`Deleted: ${deleted}`);
  console.log(`Failed: ${failed}`);
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
