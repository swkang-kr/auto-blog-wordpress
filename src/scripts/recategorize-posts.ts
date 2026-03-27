/**
 * recategorize-posts.ts
 * 기존 포스트를 니치 카테고리(Korean-Stock, AI-Trading)에 재분류합니다.
 * 제목/태그/콘텐츠 키워드 기반으로 자동 매칭 후 카테고리를 업데이트합니다.
 *
 * Usage: npx tsx src/scripts/recategorize-posts.ts [--dry-run]
 */
import 'dotenv/config';
import axios, { type AxiosInstance } from 'axios';
import { NICHES } from '../config/niches.js';

const WP_URL = process.env.WP_URL!;
const WP_USERNAME = process.env.WP_USERNAME!;
const WP_APP_PASSWORD = process.env.WP_APP_PASSWORD!;
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

// Keyword patterns for each niche
const NICHE_KEYWORDS: Record<string, string[]> = {
  'Korean-Stock': [
    'skincare', 'beauty', 'cosmetic', 'moisturizer', 'serum', 'sunscreen', 'spf',
    'toner', 'cleanser', 'mask', 'essence', 'ampoule', 'k-beauty', 'kbeauty',
    'cosrx', 'laneige', 'innisfree', 'sulwhasoo', 'missha', 'etude', 'tirtir',
    'numbuzin', 'biodance', 'anua', 'torriden', 'skin1004', 'olive young',
    'glass skin', 'korean skincare', 'routine', 'ingredient', 'niacinamide',
    'retinol', 'snail mucin', 'centella', 'hyaluronic', 'collagen',
  ],
  'AI-Trading': [
    'k-pop', 'kpop', 'k pop', 'k-drama', 'kdrama', 'k drama', 'bts', 'blackpink',
    'hallyu', 'korean wave', 'idol', 'entertainment', 'music', 'drama', 'movie', 'film',
    'webtoon', 'manhwa', 'netflix', 'streaming', 'concert', 'album',
    'hybe', 'sm entertainment', 'jyp', 'yg', 'agency', 'debut', 'comeback',
    'variety show', 'reality', 'celebrity', 'fan', 'fandom', 'ost', 'soundtrack',
    'korean culture', 'squid game', 'oscar', 'award', 'box office',
    'aespa', 'le sserafim', 'ive', 'newjeans', 'stray kids', '(g)i-dle',
  ],
};

interface WPPost {
  id: number;
  title: { rendered: string };
  categories: number[];
  tags: number[];
  link: string;
  content: { rendered: string };
}

interface WPTag {
  id: number;
  name: string;
}

function decodeHtml(text: string): string {
  return text
    .replace(/&#8217;/g, "'").replace(/&#8216;/g, "'")
    .replace(/&#8211;/g, '-').replace(/&#8212;/g, '--')
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/<[^>]+>/g, ' ');
}

// Posts must mention Korea-related terms to be eligible for niche categorization
const KOREA_FILTER = [
  'korea', 'korean', '한국', 'seoul', 'busan', 'k-pop', 'kpop', 'k-drama', 'kdrama',
  'hallyu', 'samsung', 'naver', 'kakao', 'hyundai', 'sk hynix', 'lg ', 'kospi', 'kosdaq',
  'won ', 'krw', 'hybe', 'sm entertainment', 'sm 복귀', 'jyp', 'webtoon', 'chaebol',
  'bank of korea', 'pangyo', 'gangnam',
  // Korean entertainment names
  '빅플래닛', '태민', '샤이니', '가왕', '복면가왕', '현역가왕',
];

// Exclude food/recipe posts — they don't fit any niche
const FOOD_EXCLUDE = [
  'recipe', 'food', 'cooking', 'chicken', 'meal prep', 'dinner', 'kitchen',
  'tomato', 'garden', 'vegetable', 'street food', '레시피', '음식', '요리', '길거리',
];

function isKoreaRelated(title: string, tagNames: string[]): boolean {
  const text = `${title} ${tagNames.join(' ')}`.toLowerCase();
  if (FOOD_EXCLUDE.some((kw) => text.includes(kw))) return false;
  return KOREA_FILTER.some((kw) => text.includes(kw));
}

function matchNiche(title: string, tagNames: string[], content: string): { category: string; score: number } | null {
  const text = `${title} ${tagNames.join(' ')} ${content}`.toLowerCase();
  let bestMatch: { category: string; score: number } | null = null;

  for (const [category, keywords] of Object.entries(NICHE_KEYWORDS)) {
    let score = 0;
    for (const kw of keywords) {
      const titleLower = title.toLowerCase();
      if (titleLower.includes(kw)) score += 3;
      if (tagNames.some((t) => t.toLowerCase().includes(kw))) score += 2;
      const contentLower = text.slice(0, 3000);
      const regex = new RegExp(kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
      const matches = contentLower.match(regex);
      if (matches) score += Math.min(matches.length, 3);
    }
    if (score > 0 && (!bestMatch || score > bestMatch.score)) {
      bestMatch = { category, score };
    }
  }

  return bestMatch;
}

async function main() {
  console.log(`\n=== Recategorize Posts to Niche Categories ===`);
  console.log(`Site: ${WP_URL}`);
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no changes)' : 'LIVE'}\n`);

  // 1. Ensure niche categories exist and get their IDs
  const catMap = new Map<string, number>();
  for (const niche of NICHES) {
    const catId = await getOrCreateCategory(niche.category);
    catMap.set(niche.category, catId);
    console.log(`Category: "${niche.category}" → ID=${catId}`);
  }

  // 2. Fetch all posts (paginated)
  const allPosts: WPPost[] = [];
  let page = 1;
  while (true) {
    const { data, headers } = await api.get<WPPost[]>('/posts', {
      params: { per_page: 50, page, status: 'publish', _fields: 'id,title,categories,tags,link,content' },
    });
    allPosts.push(...data);
    const totalPages = parseInt(headers['x-wp-totalpages'] || '1', 10);
    if (page >= totalPages) break;
    page++;
  }
  console.log(`\nFetched ${allPosts.length} posts\n`);

  // 3. Fetch all tags for matching
  const tagMap = new Map<number, string>();
  let tagPage = 1;
  while (true) {
    const { data, headers } = await api.get<WPTag[]>('/tags', {
      params: { per_page: 100, page: tagPage, _fields: 'id,name' },
    });
    for (const t of data) tagMap.set(t.id, decodeHtml(t.name));
    const totalPages = parseInt(headers['x-wp-totalpages'] || '1', 10);
    if (tagPage >= totalPages) break;
    tagPage++;
  }

  // 4. Analyze and recategorize each post
  let updated = 0;
  let skipped = 0;
  let noMatch = 0;
  const nicheCatIds = new Set(catMap.values());

  for (const post of allPosts) {
    const title = decodeHtml(post.title.rendered);
    const tagNames = post.tags.map((id) => tagMap.get(id) || '');
    const content = decodeHtml(post.content.rendered);

    // Already in a niche category?
    const alreadyInNiche = post.categories.some((cid) => nicheCatIds.has(cid));

    // Only recategorize Korea-related posts
    if (!isKoreaRelated(title, tagNames)) {
      if (!alreadyInNiche) {
        console.log(`  [SKIP] "${title}" — not Korea-related`);
        noMatch++;
      } else {
        skipped++;
      }
      continue;
    }

    const match = matchNiche(title, tagNames, content);

    if (!match || match.score < 5) {
      if (!alreadyInNiche) {
        console.log(`  [SKIP] "${title}" — ${match ? `low score (${match.score})` : 'no keyword match'}`);
        noMatch++;
      } else {
        skipped++;
      }
      continue;
    }

    const targetCatId = catMap.get(match.category)!;

    // Already assigned to the correct category?
    if (post.categories.includes(targetCatId)) {
      skipped++;
      continue;
    }

    console.log(`  [UPDATE] "${title}" → ${match.category} (score=${match.score})`);

    if (!DRY_RUN) {
      // Replace categories with the matched niche category (keep existing non-niche cats)
      const otherCats = post.categories.filter((cid) => !nicheCatIds.has(cid));
      const newCats = [targetCatId, ...otherCats];
      await api.post(`/posts/${post.id}`, { categories: newCats });
    }
    updated++;
  }

  console.log(`\n=== Summary ===`);
  console.log(`Total: ${allPosts.length} | Updated: ${updated} | Skipped: ${skipped} | No match: ${noMatch}`);
  if (DRY_RUN) console.log('(Dry run — no changes made. Remove --dry-run to apply.)');
  console.log('=== Done ===\n');
}

async function getOrCreateCategory(name: string): Promise<number> {
  try {
    const { data } = await api.get('/categories', { params: { search: name } });
    const cats = data as Array<{ id: number; name: string }>;
    const existing = cats.find((c) => decodeHtml(c.name).toLowerCase() === name.toLowerCase());
    if (existing) return existing.id;
  } catch { /* continue */ }

  try {
    const { data } = await api.post('/categories', {
      name,
      description: `Explore in-depth guides, tips, and analysis on ${name}. Updated regularly with trending topics.`,
    });
    return data.id as number;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 400) {
      const termId = error.response.data?.data?.term_id;
      if (termId) return termId as number;
    }
    throw error;
  }
}

main().catch((err) => {
  console.error('Fatal:', err instanceof Error ? err.message : err);
  process.exit(1);
});
