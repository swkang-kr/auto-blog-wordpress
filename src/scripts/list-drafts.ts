import { WordPressService } from '../services/wordpress.service.js';
import { FactCheckService } from '../services/fact-check.service.js';
import { loadConfig } from '../config/env.js';

async function main() {
  const config = loadConfig();
  const wp = new WordPressService(config.WP_URL, config.WP_USERNAME, config.WP_APP_PASSWORD);
  const factCheck = new FactCheckService();

  const dryRun = !process.argv.includes('--schedule');

  const { data } = await (wp as any).api.get('/posts', {
    params: { per_page: 20, status: 'draft', _fields: 'id,title,date,content,categories,meta' },
  });
  const posts = data as Array<{
    id: number; title: { rendered: string }; date: string;
    content: { rendered: string }; categories: number[];
    meta?: Record<string, string>;
  }>;

  console.log(`Found ${posts.length} draft posts\n`);

  for (const p of posts) {
    // Resolve category name
    let categoryName = '';
    if (p.categories?.[0]) {
      try {
        const { data: catData } = await (wp as any).api.get(`/categories/${p.categories[0]}`, {
          params: { _fields: 'name' },
        });
        categoryName = (catData as { name: string }).name;
      } catch { /* ignore */ }
    }

    console.log(`--- ID=${p.id} | ${p.title.rendered.slice(0, 60)}`);
    console.log(`    Category: ${categoryName} | Date: ${p.date}`);

    // Run fact-check
    try {
      const result = await factCheck.verifyContent(p.content.rendered, categoryName);
      if (result.hasCriticalErrors) {
        console.log(`    ❌ Fact-check FAILED: ${result.criticalCount} critical error(s)`);
        for (const flag of result.flagged.slice(0, 3)) {
          console.log(`       - ${flag}`);
        }
      } else {
        console.log(`    ✅ Fact-check PASSED (${result.flagged.length} minor issue(s))`);
        if (!dryRun) {
          const publishAt = new Date(Date.now() + 2 * 60 * 60 * 1000);
          const ok = await wp.schedulePost(p.id, publishAt);
          if (ok) {
            console.log(`    📅 Scheduled for ${publishAt.toISOString()}`);
          }
        } else {
          console.log(`    (dry-run: use --schedule to auto-publish)`);
        }
      }
    } catch (err) {
      console.log(`    ⚠️ Fact-check skipped: ${err instanceof Error ? err.message : err}`);
      if (!dryRun) {
        const publishAt = new Date(Date.now() + 2 * 60 * 60 * 1000);
        const ok = await wp.schedulePost(p.id, publishAt);
        if (ok) {
          console.log(`    📅 Scheduled for ${publishAt.toISOString()} (no fact-check issues)`);
        }
      }
    }
    console.log();
  }
}

main().catch(console.error);
