/**
 * Link Rot Detection Script
 * Scans published posts for broken external links (4xx/5xx responses).
 * Sends results to Telegram if configured.
 *
 * Usage: npx tsx src/scripts/check-link-rot.ts [--limit=50]
 */
import axios from 'axios';
import { loadConfig } from '../config/env.js';
import { WordPressService } from '../services/wordpress.service.js';
import { sendTelegramAlert } from '../utils/alerting.js';
import { logger } from '../utils/logger.js';

interface BrokenLink {
  postTitle: string;
  postUrl: string;
  linkUrl: string;
  statusCode: number | string;
}

/** Extract external links from HTML content */
function extractExternalLinks(html: string): string[] {
  const linkRegex = /href="(https?:\/\/[^"]+)"/gi;
  const links: string[] = [];
  let match;
  while ((match = linkRegex.exec(html)) !== null) {
    const url = match[1];
    // Skip internal links and common CDN/platform URLs that don't need checking
    if (
      url.includes('wordpress.com') ||
      url.includes('wp.com') ||
      url.includes('googleapis.com') ||
      url.includes('gstatic.com') ||
      url.includes('youtube.com') ||
      url.includes('schema.org')
    ) continue;
    links.push(url);
  }
  return [...new Set(links)]; // deduplicate
}

/** Check a single URL with HEAD request (fallback to GET) */
async function checkUrl(url: string): Promise<{ url: string; status: number | string }> {
  try {
    const resp = await axios.head(url, {
      timeout: 10000,
      maxRedirects: 5,
      validateStatus: () => true, // don't throw on non-2xx
    });
    return { url, status: resp.status };
  } catch (error) {
    // HEAD might be blocked, try GET
    try {
      const resp = await axios.get(url, {
        timeout: 10000,
        maxRedirects: 5,
        validateStatus: () => true,
        headers: { Range: 'bytes=0-0' },
      });
      return { url, status: resp.status };
    } catch (getError) {
      return { url, status: getError instanceof Error ? getError.message : 'error' };
    }
  }
}

/** Check URLs with concurrency limit */
async function checkUrlsBatch(urls: string[], concurrency: number = 10): Promise<Map<string, number | string>> {
  const results = new Map<string, number | string>();
  for (let i = 0; i < urls.length; i += concurrency) {
    const batch = urls.slice(i, i + concurrency);
    const batchResults = await Promise.all(batch.map(checkUrl));
    for (const r of batchResults) {
      results.set(r.url, r.status);
    }
  }
  return results;
}

async function main(): Promise<void> {
  const config = loadConfig();
  const limitArg = process.argv.find(a => a.startsWith('--limit='));
  const limit = limitArg ? parseInt(limitArg.split('=')[1]) : 50;

  logger.info(`=== Link Rot Detection: Checking last ${limit} posts ===`);

  const wpService = new WordPressService(
    config.WP_URL, config.WP_USERNAME, config.WP_APP_PASSWORD,
  );

  // Fetch recent posts with content
  const posts = await wpService.getRecentPosts(limit);
  logger.info(`Fetched ${posts.length} posts to scan`);

  // Fetch full content for each post
  const token = Buffer.from(`${config.WP_USERNAME}:${config.WP_APP_PASSWORD}`).toString('base64');
  const api = axios.create({
    baseURL: `${config.WP_URL}/wp-json/wp/v2`,
    headers: { Authorization: `Basic ${token}` },
    timeout: 30000,
  });

  const broken: BrokenLink[] = [];
  let totalLinks = 0;

  for (const post of posts) {
    try {
      const { data } = await api.get(`/posts/${post.postId}`, {
        params: { _fields: 'content' },
      });
      const content = (data as { content: { rendered: string } }).content.rendered;
      const links = extractExternalLinks(content);
      if (links.length === 0) continue;

      totalLinks += links.length;
      const results = await checkUrlsBatch(links);

      for (const [url, status] of results) {
        const statusNum = typeof status === 'number' ? status : 0;
        if (statusNum >= 400 || statusNum === 0) {
          broken.push({
            postTitle: post.title,
            postUrl: post.url,
            linkUrl: url,
            statusCode: status,
          });
        }
      }
    } catch (error) {
      logger.debug(`Failed to check post ${post.postId}: ${error instanceof Error ? error.message : error}`);
    }
  }

  logger.info(`\n=== Results: ${totalLinks} links checked, ${broken.length} broken ===`);

  if (broken.length > 0) {
    for (const b of broken) {
      logger.warn(`BROKEN [${b.statusCode}] ${b.linkUrl}`);
      logger.warn(`  in: "${b.postTitle}" — ${b.postUrl}`);
    }

    // Send Telegram alert
    if (config.TELEGRAM_BOT_TOKEN && config.TELEGRAM_CHAT_ID) {
      const msg = `🔗 Link Rot Alert: ${broken.length} broken link(s) found\n\n` +
        broken.slice(0, 10).map(b =>
          `• [${b.statusCode}] ${b.linkUrl}\n  in: "${b.postTitle}"`,
        ).join('\n\n');
      await sendTelegramAlert(config.TELEGRAM_BOT_TOKEN, config.TELEGRAM_CHAT_ID, msg);
      logger.info('Link rot report sent to Telegram');
    }
  } else {
    logger.info('No broken links found!');
  }
}

main().catch((err) => {
  logger.error(`Link rot check failed: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
