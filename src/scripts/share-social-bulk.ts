/**
 * share-social-bulk.ts
 * Bulk share all published posts to Facebook and LinkedIn.
 * Skips posts that have already been shared (tracked via WP post meta).
 *
 * Usage: npx tsx src/scripts/share-social-bulk.ts [--dry-run] [--limit=N]
 */
import 'dotenv/config';
import axios from 'axios';
import { FacebookService } from '../services/facebook.service.js';
import { LinkedInService } from '../services/linkedin.service.js';
import { PinterestService } from '../services/pinterest.service.js';
import { buildUtmUrl, extractSlugFromUrl } from '../utils/utm.js';

// ── Config ──
const WP_URL = process.env.WP_URL!;
const WP_AUTH = Buffer.from(`${process.env.WP_USERNAME}:${process.env.WP_APP_PASSWORD}`).toString('base64');

const FB_TOKEN = process.env.FB_ACCESS_TOKEN || '';
const FB_PAGE_ID = process.env.FB_PAGE_ID || '';
const LI_TOKEN = process.env.LINKEDIN_ACCESS_TOKEN || '';
const LI_PERSON_ID = process.env.LINKEDIN_PERSON_ID || '';
const PINTEREST_TOKEN = process.env.PINTEREST_ACCESS_TOKEN || '';

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const limitArg = args.find(a => a.startsWith('--limit='));
const LIMIT = limitArg ? parseInt(limitArg.split('=')[1]) : 999;

// Delay between shares to avoid rate limits
const DELAY_MS = 5000;

interface WpPost {
  id: number;
  title: { rendered: string };
  link: string;
  excerpt: { rendered: string };
  date: string;
  featured_media: number;
  categories?: number[];
  meta?: Record<string, unknown>;
}

const wpHeaders = {
  Authorization: `Basic ${WP_AUTH}`,
  'Content-Type': 'application/json',
};

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').replace(/&#\d+;/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').trim();
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** Get featured image URL for a post */
async function getFeaturedImageUrl(mediaId: number): Promise<string | undefined> {
  if (!mediaId) return undefined;
  try {
    const { data } = await axios.get(`${WP_URL}/wp-json/wp/v2/media/${mediaId}?_fields=source_url`, { headers: wpHeaders });
    return data.source_url;
  } catch {
    return undefined;
  }
}

/** Mark post as shared via WP post meta */
async function markAsShared(postId: number, platform: string): Promise<void> {
  try {
    await axios.post(`${WP_URL}/wp-json/wp/v2/posts/${postId}`, {
      meta: { [`_social_shared_${platform}`]: new Date().toISOString() },
    }, { headers: wpHeaders });
  } catch {
    // Meta update failure is non-critical
  }
}

/** Check if post was already shared */
async function wasShared(postId: number, platform: string): Promise<boolean> {
  try {
    const { data } = await axios.get(`${WP_URL}/wp-json/wp/v2/posts/${postId}?_fields=meta`, { headers: wpHeaders });
    return !!data.meta?.[`_social_shared_${platform}`];
  } catch {
    return false;
  }
}

// ── Main ──
async function main() {
  console.log('═══════════════════════════════════════════════');
  console.log('  Social Media Bulk Share');
  console.log(`  Facebook:  ${FB_TOKEN ? '✅ configured' : '❌ missing FB_ACCESS_TOKEN'}`);
  console.log(`  LinkedIn:  ${LI_TOKEN ? '✅ configured' : '❌ missing LINKEDIN_ACCESS_TOKEN'}`);
  console.log(`  Pinterest: ${PINTEREST_TOKEN ? '✅ configured' : '❌ missing PINTEREST_ACCESS_TOKEN'}`);
  console.log(`  Mode: ${DRY_RUN ? '🔍 DRY RUN' : '🚀 LIVE'}`);
  console.log('═══════════════════════════════════════════════\n');

  if (!FB_TOKEN && !LI_TOKEN && !PINTEREST_TOKEN) {
    console.error('No social platform tokens configured. Set FB_ACCESS_TOKEN, LINKEDIN_ACCESS_TOKEN, and/or PINTEREST_ACCESS_TOKEN.');
    process.exit(1);
  }

  // Fetch all published posts (include categories for Pinterest eligibility check)
  const allPosts: WpPost[] = [];
  let page = 1;
  while (true) {
    const { data } = await axios.get<WpPost[]>(
      `${WP_URL}/wp-json/wp/v2/posts?status=publish&per_page=100&page=${page}&orderby=date&order=desc&_fields=id,title,link,excerpt,date,featured_media,categories`,
      { headers: wpHeaders },
    );
    allPosts.push(...data);
    if (data.length < 100) break;
    page++;
  }

  // Build category ID → name map for Pinterest eligibility
  const categoryMap = new Map<number, string>();
  try {
    let catPage = 1;
    while (true) {
      const { data } = await axios.get<Array<{ id: number; name: string }>>(
        `${WP_URL}/wp-json/wp/v2/categories?per_page=100&page=${catPage}&_fields=id,name`,
        { headers: wpHeaders },
      );
      for (const cat of data) categoryMap.set(cat.id, cat.name);
      if (data.length < 100) break;
      catPage++;
    }
  } catch { /* category map optional */ }

  console.log(`Found ${allPosts.length} published posts. Limit: ${LIMIT}\n`);

  const fb = FB_TOKEN && FB_PAGE_ID ? new FacebookService(FB_TOKEN, FB_PAGE_ID) : null;
  const li = LI_TOKEN && LI_PERSON_ID ? new LinkedInService(LI_TOKEN, LI_PERSON_ID) : null;
  const pin = PINTEREST_TOKEN ? new PinterestService(PINTEREST_TOKEN) : null;

  let fbCount = 0;
  let liCount = 0;
  let pinCount = 0;
  let skipCount = 0;

  for (const post of allPosts.slice(0, LIMIT)) {
    const title = stripHtml(post.title.rendered);
    const excerpt = stripHtml(post.excerpt.rendered);
    const url = post.link;

    console.log(`\n📝 [${post.id}] ${title}`);
    console.log(`   ${url}`);

    // Facebook
    if (fb) {
      const alreadyShared = await wasShared(post.id, 'facebook');
      if (alreadyShared) {
        console.log('   FB: ⏭️ already shared');
      } else if (DRY_RUN) {
        console.log('   FB: 🔍 would share (dry run)');
        fbCount++;
      } else {
        try {
          const content = {
            title,
            excerpt,
            category: '', // Not needed for caption
            tags: [] as string[],
          };
          const result = await fb.promoteBlogPost(
            content as any,
            { postId: post.id, url, slug: extractSlugFromUrl(url) } as any,
          );
          if (result) {
            console.log(`   FB: ✅ posted (${result})`);
            await markAsShared(post.id, 'facebook');
            fbCount++;
          } else {
            console.log('   FB: ⚠️ skipped (no result)');
          }
        } catch (err) {
          console.log(`   FB: ❌ error: ${err instanceof Error ? err.message : err}`);
        }
        await sleep(DELAY_MS);
      }
    }

    // LinkedIn
    if (li) {
      const alreadyShared = await wasShared(post.id, 'linkedin');
      if (alreadyShared) {
        console.log('   LI: ⏭️ already shared');
      } else if (DRY_RUN) {
        console.log('   LI: 🔍 would share (dry run)');
        liCount++;
      } else {
        try {
          const imageUrl = await getFeaturedImageUrl(post.featured_media);
          const result = await li.promoteBlogPost(title, excerpt, url, imageUrl);
          if (result) {
            console.log(`   LI: ✅ posted (${result})`);
            await markAsShared(post.id, 'linkedin');
            liCount++;
          } else {
            console.log('   LI: ⚠️ skipped (no result)');
          }
        } catch (err) {
          console.log(`   LI: ❌ error: ${err instanceof Error ? err.message : err}`);
        }
        await sleep(DELAY_MS);
      }
    }

    // Pinterest
    if (pin) {
      // Resolve category name for Pinterest eligibility check
      const postCategoryIds = post.categories || [];
      const postCategoryName = postCategoryIds.map(id => categoryMap.get(id)).find(Boolean) || '';
      if (!PinterestService.isEligible(postCategoryName)) {
        console.log(`   PIN: ⏭️ not eligible (category: ${postCategoryName || 'unknown'})`);
      } else {
        const alreadyShared = await wasShared(post.id, 'pinterest');
        if (alreadyShared) {
          console.log('   PIN: ⏭️ already shared');
        } else if (DRY_RUN) {
          console.log('   PIN: 🔍 would share (dry run)');
          pinCount++;
        } else {
          try {
            const imageUrl = await getFeaturedImageUrl(post.featured_media);
            if (!imageUrl) {
              console.log('   PIN: ⏭️ no featured image (required for pins)');
            } else {
              const blogContent = {
                title,
                excerpt,
                category: postCategoryName,
                tags: [] as string[],
                html: '',
                imagePrompts: [],
                imageCaptions: [],
                qualityScore: 0,
                metaDescription: '',
                slug: extractSlugFromUrl(url),
              };
              await pin.pinBlogPost(
                blogContent as any,
                { postId: post.id, url, title, featuredImageId: post.featured_media } as any,
                imageUrl,
              );
              console.log(`   PIN: ✅ pinned`);
              await markAsShared(post.id, 'pinterest');
              pinCount++;
            }
          } catch (err) {
            console.log(`   PIN: ❌ error: ${err instanceof Error ? err.message : err}`);
          }
          await sleep(DELAY_MS);
        }
      }
    }

    if (!fb && !li && !pin) skipCount++;
  }

  console.log('\n═══════════════════════════════════════════════');
  console.log(`  Results: FB ${fbCount} | LI ${liCount} | PIN ${pinCount} | Skipped ${skipCount}`);
  console.log('═══════════════════════════════════════════════');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
