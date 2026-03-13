/**
 * Request Google indexing for all published posts via Google Indexing API + IndexNow.
 * Usage: npx tsx src/scripts/request-indexing.ts
 */
import { SeoService } from '../services/seo.service.js';
import { loadConfig } from '../config/env.js';
import axios from 'axios';

async function main() {
  const c = loadConfig();
  const token = Buffer.from(`${c.WP_USERNAME}:${c.WP_APP_PASSWORD}`).toString('base64');
  const headers = { Authorization: `Basic ${token}` };

  // Fetch all published posts
  const posts: Array<{ url: string; title: string }> = [];
  let page = 1;
  while (true) {
    const { data, headers: h } = await axios.get(`${c.WP_URL}/wp-json/wp/v2/posts`, {
      headers, params: { per_page: 50, page, status: 'publish', _fields: 'id,title,link' }, timeout: 30000,
    });
    const batch = data as Array<{ id: number; title: { rendered: string }; link: string }>;
    posts.push(...batch.map(p => ({ url: p.link, title: p.title.rendered })));
    const totalPages = parseInt(h['x-wp-totalpages'] || '1');
    if (page >= totalPages) break;
    page++;
  }

  // Also add homepage and page URLs
  const { data: pages } = await axios.get(`${c.WP_URL}/wp-json/wp/v2/pages`, {
    headers, params: { per_page: 50, status: 'publish', _fields: 'id,title,link' }, timeout: 30000,
  });
  const wpPages = pages as Array<{ id: number; title: { rendered: string }; link: string }>;
  posts.push(...wpPages.map(p => ({ url: p.link, title: p.title.rendered })));

  const allUrls = posts.map(p => p.url);
  console.log(`Found ${allUrls.length} published URLs\n`);

  // 1. Google Indexing API (one by one, rate limited)
  const seo = new SeoService(c.WP_URL, c.WP_USERNAME, c.WP_APP_PASSWORD, {
    indexNowKey: c.INDEXNOW_KEY,
    indexingSaKey: c.GOOGLE_INDEXING_SA_KEY,
  });

  if (c.GOOGLE_INDEXING_SA_KEY) {
    console.log('=== Google Indexing API ===');
    for (const p of posts) {
      process.stdout.write(`  ${p.title.slice(0, 55)}... `);
      try {
        await seo.requestIndexing(p.url);
        console.log('OK');
      } catch (e: any) {
        console.log(`FAIL: ${e.message}`);
      }
      // Rate limit: ~1 req/sec
      await new Promise(r => setTimeout(r, 1200));
    }
    console.log('');
  } else {
    console.log('GOOGLE_INDEXING_SA_KEY not set, skipping Google Indexing API\n');
  }

  // 2. IndexNow (batch submission)
  if (c.INDEXNOW_KEY) {
    console.log('=== IndexNow (Naver + Bing/Yandex) ===');
    await seo.notifyIndexNow(allUrls);
    console.log(`Submitted ${allUrls.length} URLs via IndexNow\n`);
  } else {
    console.log('INDEXNOW_KEY not set, skipping IndexNow\n');
  }

  console.log('Done! Check GSC in 24-48h for indexing status.');
}

main().catch(console.error);
