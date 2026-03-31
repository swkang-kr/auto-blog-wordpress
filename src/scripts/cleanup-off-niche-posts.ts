/**
 * cleanup-off-niche-posts.ts
 * AdSense 심사 준비: 니치 무관 포스트 삭제, 중복 포스트 제거,
 * 작성자 표시명 수정, Terms of Service 발행.
 *
 * Usage:
 *   npx tsx src/scripts/cleanup-off-niche-posts.ts --dry-run   (preview only)
 *   npx tsx src/scripts/cleanup-off-niche-posts.ts              (live execution)
 */
import 'dotenv/config';
import axios, { type AxiosInstance } from 'axios';
import { NICHES } from '../config/niches.js';
import { PagesService } from '../services/pages.service.js';

const WP_URL = process.env.WP_URL!;
const WP_USERNAME = process.env.WP_USERNAME!;
const WP_APP_PASSWORD = process.env.WP_APP_PASSWORD!;
const SITE_NAME = process.env.SITE_NAME || 'TrendHunt';
const SITE_OWNER = process.env.SITE_OWNER || 'TrendHunt';
const CONTACT_EMAIL = process.env.CONTACT_EMAIL || 'snix.kr@gmail.com';
const DRY_RUN = process.argv.includes('--dry-run');

if (!WP_URL || !WP_USERNAME || !WP_APP_PASSWORD) {
  console.error('Missing required env vars: WP_URL, WP_USERNAME, WP_APP_PASSWORD');
  process.exit(1);
}

const token = Buffer.from(`${WP_USERNAME}:${WP_APP_PASSWORD}`).toString('base64');
const api: AxiosInstance = axios.create({
  baseURL: `${WP_URL.replace(/\/+$/, '')}/wp-json/wp/v2`,
  headers: { Authorization: `Basic ${token}` },
  timeout: 30000,
});

// ── Niche category names from config ──
const NICHE_CATEGORIES = new Set(NICHES.map((n) => n.category));

// ── Korea-related keywords (keep these posts even if not in a niche category yet) ──
const KOREA_FILTER = [
  'korea', 'korean', '한국', 'seoul', 'kospi', 'kosdaq',
  'samsung', 'naver', 'kakao', 'hyundai', 'sk hynix', 'lg ', 'posco',
  'won ', 'krw', 'dart', 'bok', 'bank of korea', 'krx',
  '주식', '종목', '시장', '업종', '테마', '반도체', '2차전지', '배터리',
];

// ── Types ──
interface WPPost {
  id: number;
  title: { rendered: string };
  slug: string;
  categories: number[];
  link: string;
  content: { rendered: string };
}

interface WPCategory {
  id: number;
  name: string;
}

function decodeHtml(text: string): string {
  return text
    .replace(/&#8217;/g, "'").replace(/&#8216;/g, "'")
    .replace(/&#8211;/g, '-').replace(/&#8212;/g, '--')
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/<[^>]+>/g, ' ').trim();
}

function isKoreaRelated(title: string, content: string): boolean {
  const text = `${title} ${content.slice(0, 2000)}`.toLowerCase();
  return KOREA_FILTER.some((kw) => text.includes(kw));
}

/** Generate bigrams from text for similarity comparison */
function bigrams(text: string): Set<string> {
  const words = text.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(Boolean);
  const result = new Set<string>();
  for (let i = 0; i < words.length - 1; i++) {
    result.add(`${words[i]} ${words[i + 1]}`);
  }
  return result;
}

/** Jaccard similarity between two bigram sets */
function bigramSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const bg of a) {
    if (b.has(bg)) intersection++;
  }
  return intersection / (a.size + b.size - intersection);
}

// ══════════════════════════════════════════════════════════════
// STEP 1: Delete off-niche and duplicate posts
// ══════════════════════════════════════════════════════════════
async function cleanupPosts(): Promise<{ deleted: number; failed: number }> {
  console.log('\n═══ Step 1: Off-Niche & Duplicate Post Cleanup ═══\n');

  // Fetch all categories to build ID→name map
  const catMap = new Map<number, string>();
  let catPage = 1;
  while (true) {
    const { data, headers } = await api.get<WPCategory[]>('/categories', {
      params: { per_page: 100, page: catPage, _fields: 'id,name' },
    });
    for (const c of data) catMap.set(c.id, decodeHtml(c.name));
    if (catPage >= parseInt(headers['x-wp-totalpages'] || '1', 10)) break;
    catPage++;
  }

  // Find niche category IDs
  const nicheCatIds = new Set<number>();
  for (const [id, name] of catMap) {
    if (NICHE_CATEGORIES.has(name)) nicheCatIds.add(id);
  }
  console.log(`Niche categories: ${[...nicheCatIds].map((id) => `${catMap.get(id)} (${id})`).join(', ')}`);

  // Fetch all published posts
  const allPosts: WPPost[] = [];
  let page = 1;
  while (true) {
    const { data, headers } = await api.get<WPPost[]>('/posts', {
      params: { per_page: 100, page, status: 'publish', _fields: 'id,title,slug,categories,link,content' },
    });
    allPosts.push(...data);
    if (page >= parseInt(headers['x-wp-totalpages'] || '1', 10)) break;
    page++;
  }
  console.log(`Total published posts: ${allPosts.length}\n`);

  const toDelete: Array<{ id: number; title: string; reason: string }> = [];

  // 1a. Off-niche posts (not in any niche category AND not Korea-related)
  for (const post of allPosts) {
    const title = decodeHtml(post.title.rendered);
    const inNiche = post.categories.some((cid) => nicheCatIds.has(cid));
    if (inNiche) continue;

    const content = post.content.rendered || '';
    if (isKoreaRelated(title, content)) {
      console.log(`  [KEEP] "${title}" — Korea-related but not yet categorized`);
      continue;
    }

    const catNames = post.categories.map((cid) => catMap.get(cid) || `ID:${cid}`).join(', ');
    toDelete.push({ id: post.id, title, reason: `off-niche (categories: ${catNames})` });
  }

  // 1b. Duplicate posts: slug ending with -2, -3, etc.
  for (const post of allPosts) {
    if (toDelete.some((d) => d.id === post.id)) continue; // already marked
    if (/-\d+$/.test(post.slug)) {
      const baseSlug = post.slug.replace(/-\d+$/, '');
      const original = allPosts.find((p) => p.slug === baseSlug && p.id !== post.id);
      if (original) {
        toDelete.push({
          id: post.id,
          title: decodeHtml(post.title.rendered),
          reason: `duplicate of [${original.id}] "${decodeHtml(original.title.rendered)}"`,
        });
      }
    }
  }

  // 1c. Title-similarity duplicates within same category (bigram Jaccard > 0.7)
  const remaining = allPosts.filter((p) => !toDelete.some((d) => d.id === p.id));
  const titleBigrams = new Map<number, { title: string; cats: number[]; bg: Set<string> }>();
  for (const post of remaining) {
    const title = decodeHtml(post.title.rendered);
    titleBigrams.set(post.id, { title, cats: post.categories, bg: bigrams(title) });
  }
  const checked = new Set<string>();
  for (const [idA, a] of titleBigrams) {
    for (const [idB, b] of titleBigrams) {
      if (idA >= idB) continue;
      const key = `${idA}-${idB}`;
      if (checked.has(key)) continue;
      checked.add(key);

      // Must share at least one category
      if (!a.cats.some((c) => b.cats.includes(c))) continue;

      const sim = bigramSimilarity(a.bg, b.bg);
      if (sim > 0.7) {
        // Delete the newer one (higher ID)
        toDelete.push({
          id: idB,
          title: b.title,
          reason: `similar title (${(sim * 100).toFixed(0)}%) to [${idA}] "${a.title}"`,
        });
      }
    }
  }

  // Print and execute
  console.log(`\nPosts to delete: ${toDelete.length}`);
  for (const d of toDelete) {
    console.log(`  [DELETE] [${d.id}] "${d.title}" — ${d.reason}`);
  }

  if (DRY_RUN || toDelete.length === 0) {
    return { deleted: 0, failed: 0 };
  }

  console.log('\nDeleting...');
  let deleted = 0, failed = 0;
  for (const d of toDelete) {
    try {
      await api.delete(`/posts/${d.id}?force=true`);
      console.log(`  ✅ Deleted [${d.id}]`);
      deleted++;
    } catch (err: any) {
      console.error(`  ❌ Failed [${d.id}]: ${err.message}`);
      failed++;
    }
  }
  return { deleted, failed };
}

// ══════════════════════════════════════════════════════════════
// STEP 2: Update author display name
// ══════════════════════════════════════════════════════════════
async function updateAuthorDisplayName(): Promise<void> {
  console.log('\n═══ Step 2: Update Author Display Name ═══\n');

  if (!SITE_OWNER) {
    console.log('SITE_OWNER not set, skipping.');
    return;
  }

  try {
    // Fetch current user
    const { data: me } = await api.get('/users/me', { params: { context: 'edit' } });
    console.log(`Current display name: "${me.name}"`);
    console.log(`Target display name: "${SITE_OWNER}"`);

    if (me.name === SITE_OWNER) {
      console.log('Already correct, skipping.');
      return;
    }

    if (DRY_RUN) {
      console.log('(Dry run — would update display name)');
      return;
    }

    await api.post(`/users/${me.id}`, {
      name: SITE_OWNER,
      first_name: SITE_OWNER,
      last_name: '',
      nickname: SITE_OWNER,
      description: me.description || `Editor at ${SITE_NAME}. Covering Korean stock market analysis: KOSPI·KOSDAQ 시황분석, 업종분석, 테마주, 종목분석.`,
    });
    console.log(`✅ Updated display name to "${SITE_OWNER}"`);
  } catch (err: any) {
    console.error(`❌ Failed to update author: ${err.message}`);
  }
}

// ══════════════════════════════════════════════════════════════
// STEP 3: Ensure required pages (Terms of Service, etc.)
// ══════════════════════════════════════════════════════════════
async function ensurePages(): Promise<void> {
  console.log('\n═══ Step 3: Ensure Required Pages ═══\n');

  if (DRY_RUN) {
    console.log('(Dry run — would ensure pages are published)');
    return;
  }

  try {
    const pagesService = new PagesService(WP_URL, WP_USERNAME, WP_APP_PASSWORD);
    await pagesService.ensureRequiredPages(SITE_NAME, SITE_OWNER, CONTACT_EMAIL);
    console.log('✅ Required pages ensured (About, Contact, Disclaimer, Privacy, Terms of Service)');
  } catch (err: any) {
    console.error(`❌ Failed to ensure pages: ${err.message}`);
  }
}

// ══════════════════════════════════════════════════════════════
// MAIN
// ══════════════════════════════════════════════════════════════
async function main() {
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║  AdSense Prep: Site Cleanup                 ║');
  console.log('╚══════════════════════════════════════════════╝');
  console.log(`Site: ${WP_URL}`);
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no changes)' : '🔴 LIVE EXECUTION'}\n`);

  // Step 1: Clean up posts
  const { deleted, failed } = await cleanupPosts();

  // Step 2: Fix author display name
  await updateAuthorDisplayName();

  // Step 3: Ensure required pages
  await ensurePages();

  // Summary
  console.log('\n╔══════════════════════════════════════════════╗');
  console.log('║  Summary                                    ║');
  console.log('╚══════════════════════════════════════════════╝');
  if (DRY_RUN) {
    console.log('Dry run complete. Run without --dry-run to execute.');
  } else {
    console.log(`Posts deleted: ${deleted} | Failed: ${failed}`);
  }
  console.log('Done.\n');
}

main().catch((err) => {
  console.error('Fatal:', err instanceof Error ? err.message : err);
  process.exit(1);
});
