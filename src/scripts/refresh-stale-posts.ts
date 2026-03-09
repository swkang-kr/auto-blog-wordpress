/**
 * 오래된 포스트 검출 및 연도/날짜 참조 업데이트 + "Last Updated" 섹션 추가
 * - slug/title/content에 이전 연도(2024, 2025)가 포함된 포스트를 찾아 현재 연도로 업데이트
 * - dateModified를 현재 시간으로 갱신하여 SEO freshness 시그널 향상
 * - slug 변경 시 Rank Math 리다이렉트를 등록하여 301 리다이렉트 보장
 * - 콘텐츠에 "Last Updated" 배너 + freshness 신호 삽입
 *
 * 실행: npx tsx src/scripts/refresh-stale-posts.ts
 * 드라이런: npx tsx src/scripts/refresh-stale-posts.ts --dry-run
 */

import axios from 'axios';
import 'dotenv/config';

const WP_URL = process.env.WP_URL!.replace(/\/+$/, '');
const AUTH = Buffer.from(`${process.env.WP_USERNAME}:${process.env.WP_APP_PASSWORD}`).toString('base64');
const CURRENT_YEAR = new Date().getFullYear();
// Dynamically generate stale years: everything from 2024 up to (but not including) current year
const STALE_YEARS = Array.from({ length: CURRENT_YEAR - 2024 }, (_, i) => 2024 + i);
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

/**
 * Register a 301 redirect via Rank Math REST API.
 * Falls back to logging if Rank Math Redirections module is not available.
 */
async function registerRedirect(oldSlug: string, newSlug: string): Promise<boolean> {
  const oldPath = `/${oldSlug}/`;
  const newPath = `/${newSlug}/`;

  // Try Rank Math Redirections API
  try {
    await axios.post(
      `${WP_URL}/wp-json/rankmath/v1/redirections`,
      {
        sources: [{ pattern: oldPath, comparison: 'exact' }],
        url_to: newPath,
        header_code: 301,
        status: 'active',
      },
      { headers: { Authorization: `Basic ${AUTH}` }, timeout: 15000 },
    );
    console.log(`  301 redirect registered: ${oldPath} → ${newPath} (Rank Math)`);
    return true;
  } catch {
    // Rank Math API not available
  }

  // Try Redirection plugin API
  try {
    await axios.post(
      `${WP_URL}/wp-json/redirection/v1/redirect`,
      {
        url: oldPath,
        action_data: { url: newPath },
        action_type: 'url',
        action_code: 301,
        match_type: 'url',
        group_id: 1,
      },
      { headers: { Authorization: `Basic ${AUTH}` }, timeout: 15000 },
    );
    console.log(`  301 redirect registered: ${oldPath} → ${newPath} (Redirection plugin)`);
    return true;
  } catch {
    // Redirection plugin API not available
  }

  console.warn(`  WARNING: No redirect plugin API available. Manually add 301: ${oldPath} → ${newPath}`);
  return false;
}

/**
 * Inject a "Last Updated" banner into post content for freshness signal.
 */
function injectLastUpdatedBanner(content: string, dateFormatted: string): string {
  const banner = `<div style="background:#f0f8ff; border-left:4px solid #0066FF; padding:12px 20px; margin:0 0 24px 0; border-radius:0 8px 8px 0; font-size:14px; color:#555;"><strong>Last Updated:</strong> ${dateFormatted} — This article has been reviewed and updated with the latest information for ${CURRENT_YEAR}.</div>`;

  // Insert after article header (date/reading time div)
  const headerEndIdx = content.indexOf('border-bottom:1px solid #eee;');
  if (headerEndIdx !== -1) {
    const closingDiv = content.indexOf('</div>', headerEndIdx);
    if (closingDiv !== -1) {
      const insertPos = closingDiv + 6;
      return content.slice(0, insertPos) + '\n' + banner + '\n' + content.slice(insertPos);
    }
  }

  // Fallback: insert at beginning
  return banner + '\n' + content;
}

async function main() {
  console.log(`\n=== Stale Post Refresh (${DRY_RUN ? 'DRY RUN' : 'LIVE'}) ===`);
  console.log(`Current year: ${CURRENT_YEAR}`);
  console.log(`Looking for references to: ${STALE_YEARS.join(', ')}\n`);

  const posts = await getAllPosts();
  console.log(`Total published posts: ${posts.length}\n`);

  let staleCount = 0;
  let updatedCount = 0;
  let redirectCount = 0;

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
      const slugStale = findStaleYearReferences(slugText);
      if (slugStale.length > 0) {
        console.log(`  Slug change: ${slugText} → ${replaceYears(slugText, slugStale)} (+ 301 redirect)`);
      }
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

      // Update slug if it contains stale year — register 301 redirect FIRST
      const slugStale = findStaleYearReferences(slugText);
      if (slugStale.length > 0) {
        const newSlug = replaceYears(slugText, slugStale);
        const redirectOk = await registerRedirect(slugText, newSlug);
        if (redirectOk) {
          updates.slug = newSlug;
          redirectCount++;
        } else {
          console.log(`  Skipping slug change (no redirect mechanism available)`);
        }
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

      // Update Rank Math meta + last-updated timestamp
      const nowIso = new Date().toISOString();
      const dateFormatted = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
      updates.meta = {
        ...(updates.title ? { rank_math_title: updates.title } : {}),
        ...(updates.excerpt ? { rank_math_description: updates.excerpt } : {}),
        _last_updated: nowIso,
      };

      // Update dateModified in JSON-LD if present in content
      if (typeof updates.content === 'string') {
        updates.content = (updates.content as string).replace(
          /"dateModified":"[^"]*"/,
          `"dateModified":"${nowIso}"`,
        );

        // Inject "Last Updated" freshness banner
        updates.content = injectLastUpdatedBanner(updates.content as string, dateFormatted);

        // Update the Published date display
        updates.content = (updates.content as string).replace(
          /Published: [A-Z][a-z]+ \d{1,2}, \d{4}/,
          `Published: ${dateFormatted}`,
        );
      }

      await api.post(`/posts/${post.id}`, updates);
      updatedCount++;
      console.log(`  Action: Updated successfully (last-updated: ${nowIso})\n`);

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
  console.log(`301 redirects registered: ${redirectCount}`);
  if (DRY_RUN && staleCount > 0) {
    console.log('\nRun without --dry-run to apply updates.');
  }
}

main().catch((e) => { console.error('Fatal:', e); process.exit(1); });
