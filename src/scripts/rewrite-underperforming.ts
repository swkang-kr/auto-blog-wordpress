/**
 * Rewrite underperforming posts using GA4 data + Claude.
 * Identifies posts with high bounce rate or low pageviews,
 * then rewrites their content while preserving URL/slug.
 *
 * Usage: npx tsx src/scripts/rewrite-underperforming.ts
 * Dry run: npx tsx src/scripts/rewrite-underperforming.ts --dry-run
 * Limit: npx tsx src/scripts/rewrite-underperforming.ts --limit=5
 */

import axios from 'axios';
import Anthropic from '@anthropic-ai/sdk';
import 'dotenv/config';
import { GA4AnalyticsService } from '../services/ga4-analytics.service.js';

const WP_URL = process.env.WP_URL!.replace(/\/+$/, '');
const AUTH = Buffer.from(`${process.env.WP_USERNAME}:${process.env.WP_APP_PASSWORD}`).toString('base64');
const DRY_RUN = process.argv.includes('--dry-run');
const LIMIT = parseInt(process.argv.find(a => a.startsWith('--limit='))?.split('=')[1] || '5');

const api = axios.create({
  baseURL: `${WP_URL}/wp-json/wp/v2`,
  headers: { Authorization: `Basic ${AUTH}` },
  timeout: 30000,
});

const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

interface WPPost {
  id: number;
  title: { rendered: string };
  slug: string;
  content: { rendered: string };
  excerpt: { rendered: string };
  link: string;
  categories: number[];
}

async function getPostByPath(path: string): Promise<WPPost | null> {
  // Extract slug from path like /korean-etf-guide/
  const slug = path.replace(/^\/|\/$/g, '');
  if (!slug) return null;
  try {
    const { data } = await api.get('/posts', {
      params: { slug, status: 'publish', _fields: 'id,title,slug,content,excerpt,link,categories' },
    });
    return (data as WPPost[])[0] || null;
  } catch {
    return null;
  }
}

async function rewriteContent(post: WPPost): Promise<{ title: string; html: string; excerpt: string } | null> {
  const existingContent = post.content.rendered.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const wordCount = existingContent.split(/\s+/).length;

  const prompt = `You are rewriting an underperforming blog post to improve reader engagement and reduce bounce rate. The post exists at ${post.link} and must keep its URL/slug unchanged.

CURRENT TITLE: ${post.title.rendered}
CURRENT WORD COUNT: ${wordCount}
CURRENT CONTENT (plain text): ${existingContent.slice(0, 3000)}...

REWRITE RULES:
1. Keep the same topic and primary keyword
2. Add a much stronger opening hook (first paragraph must grab attention)
3. Break up long paragraphs (max 3-4 sentences each)
4. Add more subheadings (H2/H3) every 200-300 words
5. Include more specific data points and Korean market context
6. Add a compelling FAQ section (3-5 questions) if missing
7. Target 2,500+ words
8. Use the same inline CSS styling as the original
9. Include "Last Updated: ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}" banner at top

Return JSON: {"title":"improved title","html":"full HTML content","excerpt":"compelling 145-158 char meta description"}
Return pure JSON only. No markdown.`;

  try {
    const response = await claude.messages.create({
      model: process.env.CLAUDE_MODEL || 'claude-sonnet-4-6',
      max_tokens: 32000,
      temperature: 0.7,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '';
    const cleaned = text.replace(/```(?:json)?\s*/g, '').replace(/```\s*$/g, '').trim();

    // Extract JSON
    const startIdx = cleaned.indexOf('{');
    if (startIdx === -1) return null;

    let depth = 0;
    let endIdx = -1;
    for (let i = startIdx; i < cleaned.length; i++) {
      const ch = cleaned[i];
      if (ch === '\\') { i++; continue; }
      if (ch === '"') { i++; while (i < cleaned.length && cleaned[i] !== '"') { if (cleaned[i] === '\\') i++; i++; } continue; }
      if (ch === '{') depth++;
      if (ch === '}') { depth--; if (depth === 0) { endIdx = i; break; } }
    }

    if (endIdx === -1) return null;
    const result = JSON.parse(cleaned.slice(startIdx, endIdx + 1)) as { title: string; html: string; excerpt: string };

    const newWordCount = result.html.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;
    if (newWordCount < 1000) {
      console.log(`  Rewrite too short (${newWordCount} words), skipping`);
      return null;
    }

    return result;
  } catch (error) {
    console.error(`  Claude rewrite failed: ${error instanceof Error ? error.message : error}`);
    return null;
  }
}

async function main() {
  console.log(`\n=== Underperforming Post Rewrite (${DRY_RUN ? 'DRY RUN' : 'LIVE'}) ===\n`);

  if (!process.env.GA4_PROPERTY_ID || !process.env.GOOGLE_INDEXING_SA_KEY) {
    console.error('GA4_PROPERTY_ID and GOOGLE_INDEXING_SA_KEY required for this script');
    process.exit(1);
  }

  const ga4 = new GA4AnalyticsService(process.env.GA4_PROPERTY_ID, process.env.GOOGLE_INDEXING_SA_KEY);
  const allPosts = await ga4.getTopPerformingPosts(100);

  if (allPosts.length === 0) {
    console.log('No GA4 data available. Try again later.');
    return;
  }

  // Identify underperformers: bottom 20% by pageviews OR bounce rate > 70%
  const threshold = Math.max(1, Math.floor(allPosts.length * 0.2));
  const underperformers = allPosts
    .filter(p => p.pageviews > 0) // must have some traffic
    .sort((a, b) => a.pageviews - b.pageviews) // lowest first
    .slice(0, threshold)
    .concat(
      allPosts.filter(p => p.bounceRate > 0.7 && p.pageviews >= 5), // high bounce with decent traffic
    )
    // Deduplicate
    .filter((p, i, arr) => arr.findIndex(x => x.url === p.url) === i)
    .slice(0, LIMIT);

  console.log(`Found ${underperformers.length} underperforming posts to rewrite (limit: ${LIMIT})\n`);

  let rewrittenCount = 0;

  for (const perf of underperformers) {
    console.log(`[UNDERPERFORMING] ${perf.url}`);
    console.log(`  Views: ${perf.pageviews} | Bounce: ${(perf.bounceRate * 100).toFixed(0)}% | Avg Time: ${perf.avgEngagementTime.toFixed(0)}s`);

    const post = await getPostByPath(perf.url);
    if (!post) {
      console.log('  Post not found in WordPress, skipping\n');
      continue;
    }

    console.log(`  Title: ${post.title.rendered}`);

    if (DRY_RUN) {
      console.log('  Action: Would rewrite (dry-run)\n');
      continue;
    }

    const rewritten = await rewriteContent(post);
    if (!rewritten) {
      console.log('  Rewrite failed, skipping\n');
      continue;
    }

    try {
      const nowIso = new Date().toISOString();
      await api.post(`/posts/${post.id}`, {
        title: rewritten.title,
        content: rewritten.html,
        excerpt: rewritten.excerpt,
        meta: {
          rank_math_title: rewritten.title,
          rank_math_description: rewritten.excerpt,
          _last_updated: nowIso,
          _rewrite_reason: `Low performance: ${perf.pageviews} views, ${(perf.bounceRate * 100).toFixed(0)}% bounce`,
        },
      });
      rewrittenCount++;
      console.log(`  Rewritten successfully: "${rewritten.title}"\n`);

      // Rate limit between rewrites
      await new Promise(r => setTimeout(r, 2000));
    } catch (error) {
      console.error(`  Update failed: ${error instanceof Error ? error.message : error}\n`);
    }
  }

  console.log('=== Summary ===');
  console.log(`Underperformers identified: ${underperformers.length}`);
  console.log(`Posts rewritten: ${rewrittenCount}`);
  if (DRY_RUN && underperformers.length > 0) {
    console.log('\nRun without --dry-run to apply rewrites.');
  }
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
