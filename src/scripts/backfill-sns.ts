#!/usr/bin/env npx tsx
/**
 * Backfill SNS Script
 *
 * Retroactively posts all published blog posts to connected SNS platforms.
 * Reads from post-history.json, fetches full content from WordPress, and
 * distributes to: Twitter, LinkedIn, Pinterest, DEV.to, Hashnode, Medium, Reddit.
 *
 * Usage:
 *   npx tsx src/scripts/backfill-sns.ts                  # Dry run (preview only)
 *   npx tsx src/scripts/backfill-sns.ts --execute         # Actually post
 *   npx tsx src/scripts/backfill-sns.ts --execute --limit 5   # Post first 5 only
 *   npx tsx src/scripts/backfill-sns.ts --execute --platform twitter  # Twitter only
 *   npx tsx src/scripts/backfill-sns.ts --execute --skip 10   # Skip first 10 entries
 *
 * Rate limiting: 10s between posts to avoid API rate limits.
 */

import { loadConfig } from '../config/env.js';
import { NICHES } from '../config/niches.js';
import { TwitterService } from '../services/twitter.service.js';
import { LinkedInService } from '../services/linkedin.service.js';
import { PinterestService } from '../services/pinterest.service.js';
import { DevToService } from '../services/devto.service.js';
import { HashnodeService } from '../services/hashnode.service.js';
import { MediumService } from '../services/medium.service.js';
import { RedditPostService } from '../services/reddit-post.service.js';
import { WordPressService } from '../services/wordpress.service.js';
import { PostHistory } from '../utils/history.js';
import { logger } from '../utils/logger.js';
import type { BlogContent, PublishedPost } from '../types/index.js';

// ── Niche ID → Category mapping ──
const NICHE_CATEGORY_MAP: Record<string, string> = {};
for (const n of NICHES) {
  NICHE_CATEGORY_MAP[n.id] = n.category;
}
// Legacy niche IDs from old config
const LEGACY_NICHE_MAP: Record<string, string> = {
  'personal-finance': 'Korean Finance',
  'ai-tools-review': 'Korean Tech',
  'korean-tech': 'Korean Tech',
  'korean-finance': 'Korean Finance',
  'k-beauty': 'K-Beauty',
  'korea-travel': 'Korea Travel',
  'k-entertainment': 'K-Entertainment',
};

function resolveCategory(nicheId?: string): string {
  if (!nicheId) return 'Uncategorized';
  return NICHE_CATEGORY_MAP[nicheId] || LEGACY_NICHE_MAP[nicheId] || 'Uncategorized';
}

// ── CLI Args ──
const args = process.argv.slice(2);
const dryRun = !args.includes('--execute');
const limitIdx = args.indexOf('--limit');
const limit = limitIdx !== -1 ? parseInt(args[limitIdx + 1]) || Infinity : Infinity;
const skipIdx = args.indexOf('--skip');
const skipCount = skipIdx !== -1 ? parseInt(args[skipIdx + 1]) || 0 : 0;
const platformIdx = args.indexOf('--platform');
const onlyPlatform = platformIdx !== -1 ? args[platformIdx + 1] : null;

const DELAY_BETWEEN_POSTS_MS = 10_000; // 10 seconds between posts

async function main() {
  console.log('=== SNS Backfill Script ===');
  console.log(`Mode: ${dryRun ? 'DRY RUN (add --execute to actually post)' : 'EXECUTE'}`);
  if (onlyPlatform) console.log(`Platform filter: ${onlyPlatform}`);
  if (limit < Infinity) console.log(`Limit: ${limit} posts`);
  if (skipCount > 0) console.log(`Skipping first: ${skipCount} posts`);
  console.log('');

  const config = loadConfig();

  // ── Initialize services ──
  const wpService = new WordPressService(
    config.WP_URL, config.WP_USERNAME, config.WP_APP_PASSWORD,
    config.SITE_OWNER, {}, config.ADSENSE_PUB_ID || undefined,
  );

  const services: Record<string, { name: string; enabled: boolean; service: any }> = {
    twitter: {
      name: 'X (Twitter)',
      enabled: !!(config.X_API_KEY && config.X_API_SECRET && config.X_ACCESS_TOKEN && config.X_ACCESS_TOKEN_SECRET),
      service: config.X_API_KEY && config.X_API_SECRET && config.X_ACCESS_TOKEN && config.X_ACCESS_TOKEN_SECRET
        ? new TwitterService(config.X_API_KEY, config.X_API_SECRET, config.X_ACCESS_TOKEN, config.X_ACCESS_TOKEN_SECRET)
        : null,
    },
    linkedin: {
      name: 'LinkedIn',
      enabled: !!(config.LINKEDIN_ACCESS_TOKEN && config.LINKEDIN_PERSON_ID),
      service: config.LINKEDIN_ACCESS_TOKEN && config.LINKEDIN_PERSON_ID
        ? new LinkedInService(config.LINKEDIN_ACCESS_TOKEN, config.LINKEDIN_PERSON_ID)
        : null,
    },
    pinterest: {
      name: 'Pinterest',
      enabled: !!config.PINTEREST_ACCESS_TOKEN,
      service: config.PINTEREST_ACCESS_TOKEN
        ? new PinterestService(config.PINTEREST_ACCESS_TOKEN)
        : null,
    },
    devto: {
      name: 'DEV.to',
      enabled: !!config.DEVTO_API_KEY,
      service: config.DEVTO_API_KEY
        ? new DevToService(config.DEVTO_API_KEY)
        : null,
    },
    hashnode: {
      name: 'Hashnode',
      enabled: !!(config.HASHNODE_TOKEN && config.HASHNODE_PUBLICATION_ID),
      service: config.HASHNODE_TOKEN && config.HASHNODE_PUBLICATION_ID
        ? new HashnodeService(config.HASHNODE_TOKEN, config.HASHNODE_PUBLICATION_ID)
        : null,
    },
    medium: {
      name: 'Medium',
      enabled: !!config.MEDIUM_TOKEN,
      service: config.MEDIUM_TOKEN
        ? new MediumService(config.MEDIUM_TOKEN)
        : null,
    },
    reddit: {
      name: 'Reddit',
      enabled: !!(config.REDDIT_CLIENT_ID && config.REDDIT_CLIENT_SECRET && config.REDDIT_POST_USERNAME && config.REDDIT_POST_PASSWORD),
      service: config.REDDIT_CLIENT_ID && config.REDDIT_CLIENT_SECRET && config.REDDIT_POST_USERNAME && config.REDDIT_POST_PASSWORD
        ? new RedditPostService(config.REDDIT_CLIENT_ID, config.REDDIT_CLIENT_SECRET, config.REDDIT_POST_USERNAME, config.REDDIT_POST_PASSWORD)
        : null,
    },
  };

  // Show platform status
  console.log('Connected platforms:');
  let anyEnabled = false;
  for (const [key, svc] of Object.entries(services)) {
    const status = svc.enabled ? '✅' : '❌';
    const filtered = onlyPlatform && key !== onlyPlatform ? ' (skipped by --platform filter)' : '';
    console.log(`  ${status} ${svc.name}${filtered}`);
    if (svc.enabled && (!onlyPlatform || key === onlyPlatform)) anyEnabled = true;
  }
  console.log('');

  if (!anyEnabled) {
    console.log('No enabled platforms found. Set the required env vars and try again.');
    process.exit(0);
  }

  // ── Load post history ──
  const history = new PostHistory();
  await history.load();
  const allEntries = history.getAllEntries();
  console.log(`Total posts in history: ${allEntries.length}`);

  // Filter and slice
  const entries = allEntries
    .filter(e => e.postUrl && e.postId)
    .slice(skipCount, skipCount + limit);
  console.log(`Posts to process: ${entries.length}${skipCount > 0 ? ` (after skipping ${skipCount})` : ''}`);
  console.log('');

  // ── Process each post ──
  const results = {
    processed: 0,
    success: { twitter: 0, linkedin: 0, pinterest: 0, devto: 0, hashnode: 0, medium: 0, reddit: 0 },
    failed: { twitter: 0, linkedin: 0, pinterest: 0, devto: 0, hashnode: 0, medium: 0, reddit: 0 },
    skipped: 0,
  };

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const category = resolveCategory(entry.niche);
    const title = entry.keyword; // Will be replaced with actual title from WP

    console.log(`\n[${i + 1}/${entries.length}] Post #${entry.postId}: "${entry.keyword}"`);
    console.log(`  URL: ${entry.postUrl}`);
    console.log(`  Category: ${category}`);
    console.log(`  Published: ${entry.publishedAt}`);

    // Fetch full post content from WordPress
    let postContent: { content: string; title: string; category: string } | null = null;
    try {
      postContent = await wpService.getPostContent(entry.postId);
    } catch (err) {
      console.log(`  ⚠️ Failed to fetch post content: ${err instanceof Error ? err.message : err}`);
    }

    if (!postContent) {
      console.log('  ⏭️ Skipping — could not fetch post content');
      results.skipped++;
      continue;
    }

    // Build BlogContent-like object from WP data
    const blogContent: BlogContent = {
      title: postContent.title,
      html: postContent.content,
      excerpt: stripHtml(postContent.content).substring(0, 300),
      tags: extractTags(entry.keyword, category),
      category: postContent.category || category,
      faqItems: extractFaqFromHtml(postContent.content),
      imagePrompts: [],
      imageCaptions: [],
    };

    const publishedPost: PublishedPost = {
      postId: entry.postId,
      url: entry.postUrl,
      title: postContent.title,
      featuredImageId: entry.featuredImageMediaId || 0,
    };

    if (dryRun) {
      console.log(`  [DRY RUN] Would post to: ${getActivePlatforms(services, category, onlyPlatform).join(', ')}`);
      results.processed++;
      continue;
    }

    // ── Post to each platform ──
    // Twitter
    if (shouldPost('twitter', services, onlyPlatform)) {
      try {
        await services.twitter.service.promoteBlogPost(blogContent, publishedPost);
        console.log('  ✅ Twitter: thread posted');
        results.success.twitter++;
      } catch (err) {
        console.log(`  ❌ Twitter: ${err instanceof Error ? err.message : err}`);
        results.failed.twitter++;
      }
      await delay(3000);
    }

    // LinkedIn
    if (shouldPost('linkedin', services, onlyPlatform)) {
      try {
        await services.linkedin.service.promoteBlogPost(
          blogContent.title, blogContent.excerpt, publishedPost.url,
          entry.featuredImageUrl || undefined,
        );
        console.log('  ✅ LinkedIn: post shared');
        results.success.linkedin++;
      } catch (err) {
        console.log(`  ❌ LinkedIn: ${err instanceof Error ? err.message : err}`);
        results.failed.linkedin++;
      }
      await delay(2000);
    }

    // Pinterest
    if (shouldPost('pinterest', services, onlyPlatform) && PinterestService.isEligible(blogContent.category)) {
      try {
        await services.pinterest.service.pinBlogPost(
          blogContent, publishedPost,
          entry.featuredImageUrl || '',
        );
        console.log('  ✅ Pinterest: pin created');
        results.success.pinterest++;
      } catch (err) {
        console.log(`  ❌ Pinterest: ${err instanceof Error ? err.message : err}`);
        results.failed.pinterest++;
      }
      await delay(2000);
    }

    // DEV.to
    if (shouldPost('devto', services, onlyPlatform)) {
      try {
        await services.devto.service.syndicateBlogPost(blogContent, publishedPost);
        console.log('  ✅ DEV.to: article syndicated');
        results.success.devto++;
      } catch (err) {
        console.log(`  ❌ DEV.to: ${err instanceof Error ? err.message : err}`);
        results.failed.devto++;
      }
      await delay(3000);
    }

    // Hashnode
    if (shouldPost('hashnode', services, onlyPlatform)) {
      try {
        await services.hashnode.service.syndicateBlogPost(blogContent, publishedPost);
        console.log('  ✅ Hashnode: article syndicated');
        results.success.hashnode++;
      } catch (err) {
        console.log(`  ❌ Hashnode: ${err instanceof Error ? err.message : err}`);
        results.failed.hashnode++;
      }
      await delay(3000);
    }

    // Medium
    if (shouldPost('medium', services, onlyPlatform)) {
      try {
        const mediumUrl = await services.medium.service.syndicate(blogContent, publishedPost);
        if (mediumUrl) {
          console.log(`  ✅ Medium: ${mediumUrl}`);
          results.success.medium++;
        } else {
          console.log('  ⚠️ Medium: syndication returned null');
          results.failed.medium++;
        }
      } catch (err) {
        console.log(`  ❌ Medium: ${err instanceof Error ? err.message : err}`);
        results.failed.medium++;
      }
      await delay(3000);
    }

    // Reddit
    if (shouldPost('reddit', services, onlyPlatform)) {
      try {
        const count = await services.reddit.service.autoPost(
          blogContent.category, blogContent.title, publishedPost.url,
        );
        console.log(`  ✅ Reddit: posted to ${count} subreddit(s)`);
        results.success.reddit++;
      } catch (err) {
        console.log(`  ❌ Reddit: ${err instanceof Error ? err.message : err}`);
        results.failed.reddit++;
      }
      await delay(5000);
    }

    results.processed++;

    // Rate limiting between posts
    if (i < entries.length - 1) {
      console.log(`  ⏳ Waiting ${DELAY_BETWEEN_POSTS_MS / 1000}s before next post...`);
      await delay(DELAY_BETWEEN_POSTS_MS);
    }
  }

  // ── Summary ──
  console.log('\n' + '='.repeat(60));
  console.log('=== SNS Backfill Summary ===');
  console.log(`Processed: ${results.processed} | Skipped: ${results.skipped}`);
  console.log('');
  console.log('Platform Results:');
  for (const [key, svc] of Object.entries(services)) {
    if (!svc.enabled) continue;
    if (onlyPlatform && key !== onlyPlatform) continue;
    const s = results.success[key as keyof typeof results.success];
    const f = results.failed[key as keyof typeof results.failed];
    console.log(`  ${svc.name}: ${s} success, ${f} failed`);
  }
  console.log('='.repeat(60));
}

// ── Helpers ──

function shouldPost(platform: string, services: Record<string, any>, onlyPlatform: string | null): boolean {
  if (onlyPlatform && platform !== onlyPlatform) return false;
  return services[platform]?.enabled && services[platform]?.service;
}

function getActivePlatforms(services: Record<string, any>, category: string, onlyPlatform: string | null): string[] {
  const platforms: string[] = [];
  for (const [key, svc] of Object.entries(services)) {
    if (!svc.enabled) continue;
    if (onlyPlatform && key !== onlyPlatform) continue;
    if (key === 'pinterest' && !PinterestService.isEligible(category)) continue;
    platforms.push(svc.name);
  }
  return platforms;
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function extractTags(keyword: string, category: string): string[] {
  const tags = keyword.split(/\s+/)
    .filter(w => w.length > 3)
    .slice(0, 3);
  tags.push(category.replace(/\s+/g, ''));
  tags.push('Korea');
  return [...new Set(tags)].slice(0, 5);
}

function extractFaqFromHtml(html: string): Array<{ question: string; answer: string }> {
  const faqs: Array<{ question: string; answer: string }> = [];
  // Match FAQ patterns: <h3>Question?</h3><p>Answer</p>
  const faqPattern = /<h3[^>]*>([^<]*\?)<\/h3>\s*<p[^>]*>([^<]+)<\/p>/gi;
  let match;
  while ((match = faqPattern.exec(html)) !== null && faqs.length < 5) {
    faqs.push({ question: match[1].trim(), answer: match[2].trim() });
  }
  return faqs;
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

main().catch((error) => {
  console.error(`Fatal error: ${error instanceof Error ? error.message : error}`);
  process.exit(1);
});
