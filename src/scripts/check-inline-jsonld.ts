import 'dotenv/config';
import axios from 'axios';

async function main() {
  const api = axios.create({
    baseURL: `${process.env.WP_URL}/wp-json/wp/v2`,
    headers: { Authorization: `Basic ${Buffer.from(`${process.env.WP_USERNAME}:${process.env.WP_APP_PASSWORD}`).toString('base64')}` },
    timeout: 30000,
  });

  const resp = await api.get('/posts/15041', { params: { _fields: 'id,title,content,meta' } });
  const post = resp.data as any;

  console.log('=== META JSON-LD ===');
  const metaJsonld = post.meta?._autoblog_jsonld;
  if (metaJsonld) {
    const schemas = JSON.parse(metaJsonld);
    for (const s of schemas) {
      if (s['@type'] === 'ItemList') {
        console.log(`ItemList (${s.itemListElement?.length} items):`);
        for (const item of (s.itemListElement || [])) {
          const name = item.item?.name || item.name || '(no name)';
          const type = item.item?.['@type'] || item['@type'] || '?';
          const hasOffers = !!(item.item?.offers || item.offers);
          const hasRating = !!(item.item?.aggregateRating || item.aggregateRating);
          console.log(`  [${type}] ${name.substring(0,70)} | offers:${hasOffers} rating:${hasRating}`);
        }
      }
    }
  } else {
    console.log('No meta JSON-LD');
  }

  console.log('\n=== INLINE JSON-LD in content ===');
  const content = post.content?.rendered || '';
  const matches = [...content.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)];
  if (matches.length === 0) {
    console.log('No inline JSON-LD found');
  } else {
    for (const m of matches as any[]) {
      try {
        const parsed = JSON.parse(m[1]);
        const schemas2 = Array.isArray(parsed) ? parsed : [parsed];
        for (const s of schemas2) {
          console.log(`Schema type: ${s['@type']}`);
          if (s['@type'] === 'ItemList') {
            for (const item of (s.itemListElement || [])) {
              const name = item.item?.name || item.name || '';
              const type = item.item?.['@type'] || '?';
              console.log(`  [${type}] ${name.substring(0,70)}`);
            }
          }
        }
      } catch (e: any) { console.log('parse error:', e.message); }
    }
  }
}

main().catch(e => { console.error(e.message); process.exit(1); });
