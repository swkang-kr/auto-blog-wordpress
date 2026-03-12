import axios from 'axios';
import { loadConfig } from '../config/env.js';

async function main() {
  const c = loadConfig();
  const token = Buffer.from(`${c.WP_USERNAME}:${c.WP_APP_PASSWORD}`).toString('base64');
  const headers = { Authorization: `Basic ${token}` };

  // 1. Check if snippet exists
  console.log('=== 1. Code Snippet Status ===');
  const { data: snippets } = await axios.get(`${c.WP_URL}/wp-json/code-snippets/v1/snippets`, { headers, timeout: 15000 });
  const news = (snippets as any[]).filter((s: any) => s.name.includes('News Sitemap'));
  for (const s of news) {
    console.log(`ID=${s.id} | active=${s.active} | name=${s.name}`);
    console.log(`Code (first 300 chars):\n${(s.code || '').slice(0, 300)}\n`);
  }
  if (news.length === 0) console.log('No news sitemap snippet found!\n');

  // 2. Check URL
  console.log('=== 2. URL Check ===');
  try {
    const resp = await axios.get(`${c.WP_URL}/news-sitemap.xml`, { timeout: 15000, validateStatus: () => true });
    console.log(`HTTP ${resp.status} | Content-Type: ${resp.headers['content-type']}`);
    if (resp.status === 200) {
      console.log(`Response (first 500 chars):\n${String(resp.data).slice(0, 500)}`);
    } else {
      console.log('Response body:', String(resp.data).slice(0, 200));
    }
  } catch (e) {
    console.log(`Error: ${e instanceof Error ? e.message : e}`);
  }

  // 3. Check if rewrite rules need flushing
  console.log('\n=== 3. Rewrite Flush Option ===');
  try {
    const { data: options } = await axios.get(`${c.WP_URL}/wp-json/wp/v2/settings`, { headers, timeout: 15000 });
    console.log('Settings accessible:', typeof options === 'object');
  } catch {
    console.log('Cannot read settings (normal for non-admin)');
  }

  // 4. Try ?autoblog_news_sitemap=1 directly (bypasses rewrite)
  console.log('\n=== 4. Direct Query Var Test ===');
  try {
    const resp = await axios.get(`${c.WP_URL}/?autoblog_news_sitemap=1`, { timeout: 15000, validateStatus: () => true });
    console.log(`HTTP ${resp.status} | Content-Type: ${resp.headers['content-type']}`);
    if (resp.headers['content-type']?.includes('xml')) {
      console.log(`XML Response (first 500 chars):\n${String(resp.data).slice(0, 500)}`);
    } else {
      console.log('Not XML — query var not working either');
    }
  } catch (e) {
    console.log(`Error: ${e instanceof Error ? e.message : e}`);
  }
}

main().catch(console.error);
