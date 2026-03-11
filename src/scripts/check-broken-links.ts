/**
 * [#21] Broken Link Monitor — standalone script for comprehensive broken link checking.
 * Scans all published posts for broken external links and generates a report.
 *
 * Usage: npx tsx src/scripts/check-broken-links.ts [--fix]
 */
import { loadConfig } from '../config/env.js';
import { ContentRefreshService } from '../services/content-refresh.service.js';
import { WordPressService } from '../services/wordpress.service.js';
import { logger } from '../utils/logger.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const shouldFix = process.argv.includes('--fix');

  logger.info('=== Broken Link Monitor ===');

  const wpService = new WordPressService(config.WP_URL, config.WP_USERNAME, config.WP_APP_PASSWORD, config.SITE_OWNER);
  const refreshService = new ContentRefreshService(
    config.WP_URL, config.WP_USERNAME, config.WP_APP_PASSWORD,
    config.ANTHROPIC_API_KEY, config.CLAUDE_MODEL,
  );

  // Fetch all published posts
  const posts = await wpService.getRecentPosts(500);
  logger.info(`Scanning ${posts.length} published posts for broken links...`);

  if (shouldFix) {
    const { broken, fixed } = await refreshService.checkBrokenExternalLinks(posts.length);
    logger.info(`\nResults: ${broken} broken link(s) found, ${fixed} post(s) auto-fixed`);
  } else {
    const { broken } = await refreshService.checkBrokenExternalLinks(posts.length);
    logger.info(`\nResults: ${broken} broken link(s) found`);
    if (broken > 0) {
      logger.info('Run with --fix to auto-replace broken links');
    }
  }
}

main().catch((error) => {
  logger.error(`Fatal error: ${error instanceof Error ? error.message : error}`);
  process.exit(1);
});
