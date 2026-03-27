#!/usr/bin/env npx tsx
/**
 * Backfill Facebook & LinkedIn for current niche posts.
 * Resolves ?p= URLs from WordPress API, then posts to FB + LinkedIn.
 *
 * Usage:
 *   npx tsx src/scripts/backfill-fb-linkedin.ts
 */

import axios from 'axios';
import { loadConfig } from '../config/env.js';
import { FacebookService } from '../services/facebook.service.js';
import { LinkedInService } from '../services/linkedin.service.js';
import { ThreadsService } from '../services/threads.service.js';
import { PostHistory } from '../utils/history.js';
import type { BlogContent, PublishedPost } from '../types/index.js';

const CURRENT_NICHES = ['korean-stock-주식분석', 'ai-trading-business'];
const DELAY_MS = 10_000; // 10s between posts

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function extractTags(keyword: string, category: string): string[] {
  const tags = keyword.split(/\s+/).filter(w => w.length > 3).slice(0, 3);
  tags.push(category.replace(/\s+/g, ''));
  tags.push('Korea');
  return [...new Set(tags)].slice(0, 5);
}

async function main() {
  console.log('=== Facebook & LinkedIn Backfill ===\n');

  const config = loadConfig();

  const wpApi = axios.create({
    baseURL: `${config.WP_URL}/wp-json/wp/v2`,
    auth: { username: config.WP_USERNAME, password: config.WP_APP_PASSWORD },
    timeout: 15000,
  });

  // Init services
  const fbService = config.FB_ACCESS_TOKEN && config.FB_PAGE_ID
    ? new FacebookService(config.FB_ACCESS_TOKEN, config.FB_PAGE_ID)
    : null;
  const liService = config.LINKEDIN_ACCESS_TOKEN && config.LINKEDIN_PERSON_ID
    ? new LinkedInService(config.LINKEDIN_ACCESS_TOKEN, config.LINKEDIN_PERSON_ID)
    : null;
  const threadsService = config.THREADS_ACCESS_TOKEN && config.THREADS_USER_ID
    ? new ThreadsService(config.THREADS_ACCESS_TOKEN, config.THREADS_USER_ID)
    : null;

  console.log(`Facebook: ${fbService ? '✅ enabled' : '❌ disabled'}`);
  console.log(`LinkedIn: ${liService ? '✅ enabled' : '❌ disabled'}`);
  console.log(`Threads:  ${threadsService ? '✅ enabled' : '❌ disabled'}`);

  if (!fbService && !liService && !threadsService) {
    console.log('\nNo platforms enabled. Set FB_ACCESS_TOKEN/FB_PAGE_ID, LINKEDIN_ACCESS_TOKEN/LINKEDIN_PERSON_ID, and/or THREADS_ACCESS_TOKEN/THREADS_USER_ID.');
    process.exit(0);
  }

  // Load post history — filter to current niches
  const history = new PostHistory();
  await history.load();
  const entries = history.getAllEntries()
    .filter(e => e.postId && e.niche && CURRENT_NICHES.includes(e.niche));

  console.log(`\nPosts to process: ${entries.length} (niches: ${CURRENT_NICHES.join(', ')})\n`);

  let fbSuccess = 0, fbFail = 0, liSuccess = 0, liFail = 0, threadsSuccess = 0, threadsFail = 0, skipped = 0;

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    console.log(`[${i + 1}/${entries.length}] #${entry.postId}: "${entry.keyword}"`);

    // Fetch post from WordPress to get title, content, permalink, and status
    let wpPost: { title: string; content: string; link: string; status: string };
    try {
      const { data } = await wpApi.get(`/posts/${entry.postId}`, {
        params: { _fields: 'title,content,link,status' },
      });
      wpPost = {
        title: (data as any).title.rendered,
        content: (data as any).content.rendered,
        link: (data as any).link,
        status: (data as any).status,
      };
    } catch (err) {
      console.log(`  ⚠️ WP fetch failed: ${err instanceof Error ? err.message : err}`);
      skipped++;
      continue;
    }

    // Skip if not published
    if (wpPost.status !== 'publish') {
      console.log(`  ⏭️ Skipping — status: ${wpPost.status}`);
      skipped++;
      continue;
    }

    const url = wpPost.link;
    const excerpt = stripHtml(wpPost.content).substring(0, 300);
    const category = entry.niche === 'korean-stock-주식분석' ? 'Korean-Stock' : 'AI-Trading';

    const blogContent: BlogContent = {
      title: wpPost.title,
      html: wpPost.content,
      excerpt,
      tags: extractTags(entry.keyword || '', category),
      category,
      imagePrompts: [],
      imageCaptions: [],
    };

    const publishedPost: PublishedPost = {
      postId: entry.postId,
      url,
      title: wpPost.title,
      featuredImageId: 0,
    };

    console.log(`  URL: ${url}`);

    // Facebook (skip if already posted in this session — comment out to re-run)
    // if (fbService) {
    //   try {
    //     const fbId = await fbService.promoteBlogPost(blogContent, publishedPost);
    //     if (fbId) { console.log(`  ✅ Facebook: ${fbId}`); fbSuccess++; }
    //     else { console.log(`  ⚠️ Facebook: skipped`); fbFail++; }
    //   } catch (err) { console.log(`  ❌ Facebook: ${err instanceof Error ? err.message : err}`); fbFail++; }
    //   await new Promise(r => setTimeout(r, 3000));
    // }

    // LinkedIn (with featured image upload)
    if (liService) {
      try {
        // Resolve featured image URL for LinkedIn thumbnail
        let featuredImgUrl: string | undefined;
        try {
          const { data: imgData } = await wpApi.get('/posts/' + entry.postId, { params: { _fields: 'featured_media' } });
          const mediaId = (imgData as any).featured_media;
          if (mediaId) {
            const { data: media } = await wpApi.get('/media/' + mediaId, { params: { _fields: 'source_url' } });
            featuredImgUrl = (media as any).source_url;
          }
        } catch { /* ignore */ }
        const liId = await liService.promoteBlogPost(wpPost.title, excerpt, url, featuredImgUrl);
        if (liId) {
          console.log(`  ✅ LinkedIn: ${liId}`);
          liSuccess++;
        } else {
          console.log(`  ⚠️ LinkedIn: returned null`);
          liFail++;
        }
      } catch (err) {
        console.log(`  ❌ LinkedIn: ${err instanceof Error ? err.message : err}`);
        liFail++;
      }
      await new Promise(r => setTimeout(r, 3000));
    }

    // Threads
    if (threadsService) {
      try {
        const threadsId = await threadsService.promoteBlogPost(blogContent, publishedPost);
        if (threadsId) {
          console.log(`  ✅ Threads: ${threadsId}`);
          threadsSuccess++;
        } else {
          console.log(`  ⚠️ Threads: returned null`);
          threadsFail++;
        }
      } catch (err) {
        console.log(`  ❌ Threads: ${err instanceof Error ? err.message : err}`);
        threadsFail++;
      }
      await new Promise(r => setTimeout(r, 3000));
    }

    // Rate limit
    if (i < entries.length - 1) {
      console.log(`  ⏳ ${DELAY_MS / 1000}s delay...`);
      await new Promise(r => setTimeout(r, DELAY_MS));
    }
  }

  console.log('\n' + '='.repeat(50));
  console.log('=== Summary ===');
  console.log(`Processed: ${entries.length - skipped} | Skipped: ${skipped}`);
  if (fbService) console.log(`Facebook: ${fbSuccess} success, ${fbFail} failed`);
  if (liService) console.log(`LinkedIn: ${liSuccess} success, ${liFail} failed`);
  if (threadsService) console.log(`Threads:  ${threadsSuccess} success, ${threadsFail} failed`);
  console.log('='.repeat(50));
}

main().catch(err => {
  console.error(`Fatal: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
