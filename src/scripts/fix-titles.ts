#!/usr/bin/env tsx
/**
 * fix-titles.ts
 * WordPress 전체 포스트의 제목 + excerpt를 새 CTR 패턴으로 일괄 업데이트
 *
 * 사용법:
 *   npx tsx scripts/fix-titles.ts              # 전체 실행
 *   npx tsx scripts/fix-titles.ts --dry-run    # 변경사항 미리보기만 (실제 업데이트 없음)
 *   npx tsx scripts/fix-titles.ts --limit 5    # 5개만 테스트
 *
 * 환경변수 (.env 또는 export):
 *   WP_URL, WP_USERNAME, WP_APP_PASSWORD
 */

import { spawnSync } from 'child_process';
import axios from 'axios';
import * as dotenv from 'dotenv';
dotenv.config();

// ─── Config ───────────────────────────────────────────────────
const WP_URL = process.env.WP_URL!;
const WP_USERNAME = process.env.WP_USERNAME!;
const WP_APP_PASSWORD = process.env.WP_APP_PASSWORD!;
const CLAUDE_BIN = process.env.CLAUDE_BIN || 'claude';

const DRY_RUN = process.argv.includes('--dry-run');
const LIMIT_ARG = process.argv.indexOf('--limit');
const LIMIT = LIMIT_ARG !== -1 ? parseInt(process.argv[LIMIT_ARG + 1], 10) : Infinity;
const DELAY_MS = 1500;

// ─── Types ────────────────────────────────────────────────────
interface WpPost {
  id: number;
  title: { rendered: string };
  excerpt: { rendered: string };
  slug: string;
  link: string;
  categories: number[];
  content: { rendered: string };
}

interface TitleExcerpt {
  title: string;
  excerpt: string;
  reason: string;
}

// ─── WordPress helpers ────────────────────────────────────────
function wpAuth() {
  const creds = Buffer.from(`${WP_USERNAME}:${WP_APP_PASSWORD}`).toString('base64');
  return { Authorization: `Basic ${creds}`, 'Content-Type': 'application/json' };
}

async function fetchAllPosts(): Promise<WpPost[]> {
  const posts: WpPost[] = [];
  let page = 1;

  while (true) {
    const res = await axios.get(`${WP_URL}/wp-json/wp/v2/posts`, {
      headers: wpAuth(),
      params: { per_page: 100, page, status: 'publish', _fields: 'id,title,excerpt,slug,link,categories,content' },
    });

    const batch: WpPost[] = res.data;
    if (batch.length === 0) break;
    posts.push(...batch);

    const totalPages = parseInt(res.headers['x-wp-totalpages'] ?? '1', 10);
    if (page >= totalPages) break;
    page++;
  }

  return posts;
}

async function updatePost(id: number, title: string, excerpt: string): Promise<void> {
  await axios.post(
    `${WP_URL}/wp-json/wp/v2/posts/${id}`,
    { title, excerpt },
    { headers: wpAuth() },
  );
}

// ─── Claude CLI rewrite ───────────────────────────────────────
function rewriteTitleExcerpt(post: WpPost): TitleExcerpt {
  const currentTitle = post.title.rendered.replace(/<[^>]+>/g, '');
  const currentExcerpt = post.excerpt.rendered.replace(/<[^>]+>/g, '').trim().slice(0, 300);

  const slug = post.slug;
  const isHowTo = /^how-|what-is|guide/.test(slug);
  const isList = /^best-|^top-|\d+-/.test(slug);
  const contentTypeHint = isHowTo ? 'how-to/explainer' : isList ? 'best-x-for-y or list' : 'analysis/deep-dive';

  const prompt = `You are an SEO title and meta description optimizer specializing in Korea-focused English content. Rewrite the blog post title and excerpt below to maximize Google SERP click-through rate (CTR).

## Title Rules
A. HOW-TO / EXPLAINER: "[How/What] [Korea topic] [qualifier]" or "[Primary Keyword] (2026 Guide)"
B. COMPARISON / LIST: "[Number] Best [thing] for [audience] (2026)" or "[X] vs [Y]: [insight]"
C. ANALYSIS / INSIGHT: "[Korea topic]: [what the analysis reveals]"

MANDATORY:
- 50-65 characters total
- Must contain primary keyword or close variant
- Must include "Korea", "Korean", or specific Korean entity
- For guides/lists: include (2026)
- FORBIDDEN: "changing everything", "things you need to know", "the real reason X matters", "comprehensive guide to"

## Excerpt Rules
- 145-158 characters
- Open with primary keyword verbatim
- State ONE concrete outcome
- Include "you" or "your"
- End with complete sentence
- FORBIDDEN: vague openers like "Discover everything about..."

## Input
Current title: "${currentTitle}"
Current excerpt: "${currentExcerpt}"
URL slug: "${slug}"
Detected content type: ${contentTypeHint}

If the current title already follows the correct pattern and is good, keep it but still optimize the excerpt.

Respond with pure JSON only (no markdown):
{"title":"...","excerpt":"...","reason":"one sentence explaining the change"}`;

  const { ANTHROPIC_API_KEY: _unused, ...safeEnv } = process.env;
  const result = spawnSync(CLAUDE_BIN, ['-p', prompt, '--model', 'opus'], {
    encoding: 'utf8',
    maxBuffer: 2 * 1024 * 1024,
    env: safeEnv,
  });

  if (result.status !== 0) {
    throw new Error(`Claude CLI failed: ${result.stderr?.slice(0, 300)}`);
  }

  const raw = result.stdout?.trim() ?? '';
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error(`No JSON in response: ${raw.slice(0, 100)}`);

  return JSON.parse(jsonMatch[0]) as TitleExcerpt;
}

// ─── Main ─────────────────────────────────────────────────────
async function main() {
  console.log(`\n=== WordPress Title/Excerpt Batch Updater ===`);
  console.log(`Mode: ${DRY_RUN ? '🔍 DRY RUN (no changes)' : '✏️  LIVE UPDATE'}`);
  console.log(`WP_URL: ${WP_URL}\n`);

  for (const [k, v] of Object.entries({ WP_URL, WP_USERNAME, WP_APP_PASSWORD })) {
    if (!v) { console.error(`Missing env: ${k}`); process.exit(1); }
  }

  console.log('Fetching all published posts...');
  const allPosts = await fetchAllPosts();
  const posts = allPosts.slice(0, LIMIT === Infinity ? allPosts.length : LIMIT);
  console.log(`Found ${allPosts.length} posts. Processing ${posts.length}.\n`);

  const results = { updated: 0, skipped: 0, failed: 0 };
  const log: Array<{ id: number; url: string; old: string; new: string; excerpt: string; reason: string }> = [];

  for (let i = 0; i < posts.length; i++) {
    const post = posts[i];
    const oldTitle = post.title.rendered.replace(/<[^>]+>/g, '');
    console.log(`[${i + 1}/${posts.length}] "${oldTitle}"`);

    try {
      const rewritten = rewriteTitleExcerpt(post);

      const titleChanged = rewritten.title.toLowerCase() !== oldTitle.toLowerCase();
      const charCount = rewritten.title.length;

      console.log(`  → "${rewritten.title}" (${charCount} chars)`);
      console.log(`  📝 ${rewritten.reason}`);

      if (charCount < 30 || charCount > 80) {
        console.warn(`  ⚠️  Title length suspicious (${charCount} chars), skipping`);
        results.skipped++;
        continue;
      }

      if (!titleChanged && rewritten.excerpt === post.excerpt.rendered.replace(/<[^>]+>/g, '').trim()) {
        console.log(`  ✓ No change needed\n`);
        results.skipped++;
        continue;
      }

      log.push({
        id: post.id,
        url: post.link,
        old: oldTitle,
        new: rewritten.title,
        excerpt: rewritten.excerpt,
        reason: rewritten.reason,
      });

      if (!DRY_RUN) {
        await updatePost(post.id, rewritten.title, rewritten.excerpt);
        console.log(`  ✅ Updated\n`);
      } else {
        console.log(`  [DRY RUN] Would update\n`);
      }

      results.updated++;
    } catch (err) {
      console.error(`  ❌ Failed: ${err instanceof Error ? err.message : err}\n`);
      results.failed++;
    }

    if (i < posts.length - 1) {
      await new Promise((r) => setTimeout(r, DELAY_MS));
    }
  }

  console.log('\n=== Summary ===');
  console.log(`Updated : ${results.updated}`);
  console.log(`Skipped : ${results.skipped}`);
  console.log(`Failed  : ${results.failed}`);

  if (log.length > 0) {
    console.log('\n=== Changes Log ===');
    for (const entry of log) {
      console.log(`\n[${entry.id}] ${entry.url}`);
      console.log(`  BEFORE: "${entry.old}"`);
      console.log(`  AFTER : "${entry.new}"`);
      console.log(`  EXCERPT: "${entry.excerpt}"`);
      console.log(`  REASON: ${entry.reason}`);
    }
  }

  if (DRY_RUN) {
    console.log('\n💡 Dry run complete. Run without --dry-run to apply changes.');
  }
}

main().catch((e) => {
  console.error('Fatal:', e instanceof Error ? e.message : e);
  process.exit(1);
});
