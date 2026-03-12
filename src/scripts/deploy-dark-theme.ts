import { SeoService } from '../services/seo.service.js';
import { loadConfig } from '../config/env.js';

async function main() {
  const c = loadConfig();
  const seo = new SeoService(c.WP_URL, c.WP_USERNAME, c.WP_APP_PASSWORD);

  console.log('Deploying always-on dark theme snippet...');
  await seo.ensureDarkModeSnippet();
  console.log('Done! Check your blog.');
}

main().catch(console.error);
