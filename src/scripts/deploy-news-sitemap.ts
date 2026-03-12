import { SeoService } from '../services/seo.service.js';
import { loadConfig } from '../config/env.js';

async function main() {
  const c = loadConfig();
  const seo = new SeoService(c.WP_URL, c.WP_USERNAME, c.WP_APP_PASSWORD);

  console.log('Deploying news sitemap snippet...');
  await seo.ensureNewsSitemapSnippet();

  // Verify
  console.log('\nVerifying /news-sitemap.xml...');
  const axios = (await import('axios')).default;

  // Wait a moment for snippet to activate
  await new Promise(r => setTimeout(r, 2000));

  const resp = await axios.get(`${c.WP_URL}/news-sitemap.xml`, { timeout: 15000, validateStatus: () => true });
  console.log(`HTTP ${resp.status} | Content-Type: ${resp.headers['content-type']}`);
  if (resp.status === 200) {
    console.log('✅ News sitemap is working!');
    console.log(`Response:\n${String(resp.data).slice(0, 800)}`);
  } else {
    console.log('❌ Still returning ' + resp.status);
  }
}

main().catch(console.error);
