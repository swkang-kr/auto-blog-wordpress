/**
 * Manual single-post rewrite script.
 * Rewrites a specific post by ID to improve content quality (readability, E-E-A-T, information density).
 *
 * Usage: npx tsx src/scripts/rewrite-post.ts <POST_ID> [--reason="quality improvement"]
 * Example: npx tsx src/scripts/rewrite-post.ts 88858 --reason="Readability 0/15, low info density"
 */

import 'dotenv/config';
import { ContentRefreshService } from '../services/content-refresh.service.js';
import { SeoService } from '../services/seo.service.js';
import { logger } from '../utils/logger.js';

const WP_URL = process.env.WP_URL!.replace(/\/+$/, '');
const WP_USERNAME = process.env.WP_USERNAME!;
const WP_APP_PASSWORD = process.env.WP_APP_PASSWORD!;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY!;
const CLAUDE_MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-4-6';

async function main() {
  const postId = parseInt(process.argv[2]);
  if (!postId || isNaN(postId)) {
    console.error('Usage: npx tsx src/scripts/rewrite-post.ts <POST_ID> [--reason="..."]');
    console.error('Example: npx tsx src/scripts/rewrite-post.ts 88858 --reason="Readability 0/15"');
    process.exit(1);
  }

  const reasonArg = process.argv.find(a => a.startsWith('--reason='));
  const reason = reasonArg ? reasonArg.replace('--reason=', '') : 'Manual quality rewrite';

  logger.info(`=== Manual Post Rewrite: ID=${postId} ===`);
  logger.info(`Reason: ${reason}`);

  const refreshService = new ContentRefreshService(
    WP_URL, WP_USERNAME, WP_APP_PASSWORD,
    ANTHROPIC_API_KEY, CLAUDE_MODEL,
  );

  // Access the internal API to fetch the post
  const axios = (await import('axios')).default;
  const AUTH = Buffer.from(`${WP_USERNAME}:${WP_APP_PASSWORD}`).toString('base64');
  const api = axios.create({
    baseURL: `${WP_URL}/wp-json/wp/v2`,
    headers: { Authorization: `Basic ${AUTH}` },
    timeout: 30000,
  });

  // Fetch the post
  let post;
  try {
    const { data } = await api.get(`/posts/${postId}`, {
      params: { _fields: 'id,title,slug,content,excerpt,link,date,modified,meta,categories' },
    });
    post = data as {
      id: number;
      title: { rendered: string };
      slug: string;
      content: { rendered: string };
      excerpt: { rendered: string };
      link: string;
      date: string;
      modified: string;
      meta: Record<string, unknown>;
    };
  } catch (error) {
    logger.error(`Failed to fetch post ${postId}: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  }

  logger.info(`Post: "${post.title.rendered}"`);
  logger.info(`URL: ${post.link}`);
  logger.info(`Current word count: ${post.content.rendered.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().split(/\s+/).length}`);

  // Rewrite using the public wrapper for rewriteContent
  const rewritten = await refreshService.rewriteSinglePost(post as never);

  if (!rewritten) {
    logger.error('Rewrite failed — no content generated');
    process.exit(1);
  }

  const newWordCount = rewritten.html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().split(/\s+/).length;
  logger.info(`New word count: ${newWordCount}`);
  logger.info(`New title: "${rewritten.title}"`);

  // Update the post
  const nowIso = new Date().toISOString();
  try {
    await api.post(`/posts/${postId}`, {
      title: rewritten.title,
      content: rewritten.html,
      excerpt: rewritten.excerpt,
      meta: {
        _last_updated: nowIso,
        _autoblog_modified_time: nowIso,
        _rewrite_reason: `Manual rewrite: ${reason}`,
        rank_math_description: rewritten.excerpt,
      },
    });
    logger.info(`Post ${postId} updated successfully`);
  } catch (error) {
    logger.error(`Failed to update post: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  }

  // Request re-indexing
  try {
    if (process.env.GOOGLE_INDEXING_SA_KEY) {
      const seoService = new SeoService(WP_URL, WP_USERNAME, WP_APP_PASSWORD, { indexingSaKey: process.env.GOOGLE_INDEXING_SA_KEY });
      await seoService.requestIndexing(post.link);
      logger.info(`Re-indexing requested for ${post.link}`);
    }
  } catch {
    logger.warn('Re-indexing request failed (non-critical)');
  }

  logger.info('=== Rewrite Complete ===');
}

main().catch((e) => { console.error('Fatal:', e.message || e); process.exit(1); });
