/**
 * fix-post-urls.ts
 * ?p=XXXXX 형태의 포스트 URL을 실제 permalink로 수정합니다.
 *
 * 1. post-history.json 의 postUrl 업데이트 (publish 상태인 것만)
 * 2. 발행된 포스트 본문에서 ?p=XXXXX 내부링크를 실제 URL로 교체
 *
 * Usage: npx tsx src/scripts/fix-post-urls.ts [--dry-run]
 */
import 'dotenv/config';
import axios, { type AxiosInstance } from 'axios';
import { PostHistory } from '../utils/history.js';

const WP_URL = process.env.WP_URL!;
const WP_USERNAME = process.env.WP_USERNAME!;
const WP_APP_PASSWORD = process.env.WP_APP_PASSWORD!;
const DRY_RUN = process.argv.includes('--dry-run');

const token = Buffer.from(`${WP_USERNAME}:${WP_APP_PASSWORD}`).toString('base64');
const api: AxiosInstance = axios.create({
  baseURL: `${WP_URL}/wp-json/wp/v2`,
  headers: { Authorization: `Basic ${token}` },
  timeout: 30000,
});

async function main(): Promise<void> {
  console.log(`\n🔧 Fix Post URLs ${DRY_RUN ? '(DRY RUN)' : ''}`);
  console.log('='.repeat(60));

  const history = new PostHistory();
  await history.load();
  const entries = history.getAllEntries();

  // ── Step 1: Collect ?p=XXXXX entries ──────────────────────────
  const staleEntries = entries.filter(e => e.postUrl?.includes('/?p='));
  console.log(`\n📋 Found ${staleEntries.length} entries with ?p= URLs (out of ${entries.length} total)`);

  // Build ID → real URL map by fetching from WP API
  const idToUrl = new Map<number, { url: string; status: string }>();
  const ids = staleEntries
    .map(e => {
      const m = e.postUrl.match(/\?p=(\d+)/);
      return m ? Number(m[1]) : null;
    })
    .filter(Boolean) as number[];

  // Fetch in batches of 50
  for (let i = 0; i < ids.length; i += 50) {
    const batch = ids.slice(i, i + 50);
    try {
      const resp = await api.get('/posts', {
        params: {
          include: batch.join(','),
          per_page: 100,
          status: 'publish,future,draft',
          _fields: 'id,link,status',
        },
      });
      for (const p of resp.data as Array<{ id: number; link: string; status: string }>) {
        idToUrl.set(p.id, { url: p.link, status: p.status });
      }
    } catch (e: any) {
      console.warn(`  Batch fetch failed: ${e.message}`);
    }
  }

  // ── Step 2: Update post-history.json ──────────────────────────
  console.log('\n📝 Updating post-history.json ...');
  let historyUpdated = 0;
  for (const entry of staleEntries) {
    const m = entry.postUrl.match(/\?p=(\d+)/);
    if (!m) continue;
    const id = Number(m[1]);
    const wpPost = idToUrl.get(id);
    if (!wpPost || wpPost.status !== 'publish') {
      console.log(`  ⏭  #${id} [${wpPost?.status || 'not found'}] — skip (not published)`);
      continue;
    }
    if (wpPost.url.includes('?p=')) {
      console.log(`  ⚠️  #${id} still has ?p= URL in WP — skip`);
      continue;
    }
    console.log(`  ✏️  #${id}: ${entry.postUrl} → ${wpPost.url}`);
    if (!DRY_RUN) {
      entry.postUrl = wpPost.url;
      historyUpdated++;
    }
  }

  if (!DRY_RUN && historyUpdated > 0) {
    // PostHistory.save() is private; we write directly via addEntry trick:
    // Reload + mutate + re-save using the internal save mechanism
    // Since we mutated entries in-place (same array reference), just call save
    // by adding a dummy then removing — instead use a simpler approach:
    // Re-export via a public method or direct file update
    await (history as any).save();
    console.log(`  ✅ Saved ${historyUpdated} URL updates to post-history.json`);
  } else if (DRY_RUN) {
    console.log(`  🔍 Would update ${staleEntries.filter(e => {
      const m = e.postUrl.match(/\?p=(\d+)/);
      if (!m) return false;
      const wp = idToUrl.get(Number(m[1]));
      return wp?.status === 'publish' && !wp.url.includes('?p=');
    }).length} entries (dry-run)`);
  }

  // ── Step 3: Build ?p= → real URL map for link replacement ─────
  const urlMap = new Map<string, string>(); // `?p=XXXXX` → clean URL
  for (const [id, wp] of idToUrl) {
    if (wp.status === 'publish' && !wp.url.includes('?p=')) {
      urlMap.set(`${WP_URL}/?p=${id}`, wp.url);
    }
  }

  if (urlMap.size === 0) {
    console.log('\n✅ No published posts with ?p= URLs — nothing to replace in content');
    printSummary(historyUpdated, 0);
    return;
  }

  // ── Step 4: Fix ?p= links in published post content ────────────
  console.log(`\n🔗 Scanning published posts for ?p= internal links ...`);

  let page = 1;
  let contentFixed = 0;

  while (true) {
    let posts: Array<{ id: number; title: { rendered: string }; content: { rendered: string } }>;
    try {
      const resp = await api.get('/posts', {
        params: { per_page: 20, page, status: 'publish', _fields: 'id,title,content' },
      });
      posts = resp.data;
    } catch (e: any) {
      if (e.response?.status === 400) break;
      throw e;
    }
    if (posts.length === 0) break;

    for (const post of posts) {
      let content = post.content.rendered;
      let changed = false;

      for (const [pUrl, cleanUrl] of urlMap) {
        // Match href="...?p=XXXXX" and href="...?p=XXXXX/"
        const escaped = pUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const linkRegex = new RegExp(`href="${escaped}[/"']`, 'gi');
        if (linkRegex.test(content)) {
          content = content.replace(
            new RegExp(`href="${escaped}([/"'])`, 'gi'),
            `href="${cleanUrl}$1`,
          );
          changed = true;
          console.log(`  [${post.id}] ${pUrl} → ${cleanUrl}`);
        }
      }

      if (changed) {
        if (!DRY_RUN) {
          try {
            await api.post(`/posts/${post.id}`, { content });
            contentFixed++;
          } catch (e: any) {
            console.warn(`  ⚠️  Failed to update post ${post.id}: ${e.response?.status || e.message}`);
          }
        } else {
          contentFixed++;
        }
      }
    }
    page++;
  }

  printSummary(historyUpdated, contentFixed);
}

function printSummary(historyUpdated: number, contentFixed: number): void {
  console.log('\n' + '='.repeat(60));
  console.log(`📊 history.json: ${historyUpdated} URLs updated`);
  console.log(`📊 Post content: ${contentFixed} posts fixed`);
}

main().catch(e => {
  console.error('Fatal error:', e.message);
  process.exit(1);
});
