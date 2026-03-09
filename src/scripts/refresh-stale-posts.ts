/**
 * 오래된 포스트 검출 및 연도/날짜 참조 업데이트
 * - slug/title/content에 이전 연도(2024, 2025)가 포함된 포스트를 찾아 현재 연도로 업데이트
 * - dateModified를 현재 시간으로 갱신하여 SEO freshness 시그널 향상
 *
 * 실행: npx tsx src/scripts/refresh-stale-posts.ts
 * 드라이런: npx tsx src/scripts/refresh-stale-posts.ts --dry-run
 */

import axios from 'axios';
import 'dotenv/config';

const WP_URL = process.env.WP_URL!.replace(/\/+$/, '');
const AUTH = Buffer.from(`${process.env.WP_USERNAME}:${process.env.WP_APP_PASSWORD}`).toString('base64');
const CURRENT_YEAR = new Date().getFullYear();
const STALE_YEARS = [2024, 2025]; // Years to find and update
const DRY_RUN = process.argv.includes('--dry-run');

const api = axios.create({
  baseURL: `${WP_URL}/wp-json/wp/v2`,
  headers: { Authorization: `Basic ${AUTH}` },
  timeout: 30000,
});

interface WPPost {
  id: number;
  title: { rendered: string };
  slug: string;
  content: { rendered: string };
  excerpt: { rendered: string };
  link: string;
  date: string;
  modified: string;
}

async function getAllPosts(): Promise<WPPost[]> {
  const posts: WPPost[] = [];
  let page = 1;
  while (true) {
    const { data, headers } = await api.get('/posts', {
      params: { per_page: 100, page, status: 'publish', _fields: 'id,title,slug,content,excerpt,link,date,modified' },
    });
    posts.push(...(data as WPPost[]));
    if (page >= parseInt(headers['x-wp-totalpages'] || '1')) break;
    page++;
  }
  return posts;
}

function findStaleYearReferences(text: string): number[] {
  const found: number[] = [];
  for (const year of STALE_YEARS) {
    if (text.includes(String(year))) {
      found.push(year);
    }
  }
  return found;
}

function replaceYears(text: string, staleYears: number[]): string {
  let updated = text;
  for (const year of staleYears) {
    // Replace year in various contexts but avoid dates like "2024-01-15"
    updated = updated.replace(new RegExp(`\\b${year}\\b(?![-/]\\d)`, 'g'), String(CURRENT_YEAR));
  }
  return updated;
}

async function main() {
  console.log(`\n=== Stale Post Refresh (${DRY_RUN ? 'DRY RUN' : 'LIVE'}) ===`);
  console.log(`Current year: ${CURRENT_YEAR}`);
  console.log(`Looking for references to: ${STALE_YEARS.join(', ')}\n`);

  const posts = await getAllPosts();
  console.log(`Total published posts: ${posts.length}\n`);

  let staleCount = 0;
  let updatedCount = 0;

  for (const post of posts) {
    const titleText = post.title.rendered;
    const slugText = post.slug;
    const contentText = post.content.rendered;
    const excerptText = post.excerpt.rendered;

    const combined = `${titleText} ${slugText} ${contentText} ${excerptText}`;
    const staleYears = findStaleYearReferences(combined);

    if (staleYears.length === 0) continue;

    staleCount++;
    const yearsStr = staleYears.join(', ');
    console.log(`[STALE] ${post.link}`);
    console.log(`  Title: ${titleText}`);
    console.log(`  Contains: ${yearsStr}`);
    console.log(`  Last modified: ${post.modified}`);

    if (DRY_RUN) {
      console.log('  Action: Would update (dry-run)\n');
      continue;
    }

    try {
      const updates: Record<string, unknown> = {};

      // Update title if it contains stale year
      const titleStale = findStaleYearReferences(titleText);
      if (titleStale.length > 0) {
        updates.title = replaceYears(titleText, titleStale);
      }

      // Update slug if it contains stale year
      const slugStale = findStaleYearReferences(slugText);
      if (slugStale.length > 0) {
        updates.slug = replaceYears(slugText, slugStale);
      }

      // Update content if it contains stale year
      const contentStale = findStaleYearReferences(contentText);
      if (contentStale.length > 0) {
        updates.content = replaceYears(contentText, contentStale);
      }

      // Update excerpt if it contains stale year
      const excerptStale = findStaleYearReferences(excerptText);
      if (excerptStale.length > 0) {
        updates.excerpt = replaceYears(excerptText, excerptStale);
      }

      // Update Rank Math meta
      if (updates.title || updates.excerpt) {
        updates.meta = {
          ...(updates.title ? { rank_math_title: updates.title } : {}),
          ...(updates.excerpt ? { rank_math_description: updates.excerpt } : {}),
        };
      }

      await api.post(`/posts/${post.id}`, updates);
      updatedCount++;
      console.log(`  Action: Updated successfully\n`);

      // Rate limit
      await new Promise((r) => setTimeout(r, 500));
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`  Action: FAILED - ${msg}\n`);
    }
  }

  console.log('=== Summary ===');
  console.log(`Stale posts found: ${staleCount}`);
  console.log(`Posts updated: ${updatedCount}`);
  if (DRY_RUN && staleCount > 0) {
    console.log('\nRun without --dry-run to apply updates.');
  }
}

main().catch((e) => { console.error('Fatal:', e); process.exit(1); });
