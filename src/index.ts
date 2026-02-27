import axios from 'axios';
import { loadConfig } from './config/env.js';
import { NICHES } from './config/niches.js';
import { KeywordResearchService } from './services/keyword-research.service.js';
import { ContentGeneratorService } from './services/content-generator.service.js';
import { ImageGeneratorService } from './services/image-generator.service.js';
import { WordPressService } from './services/wordpress.service.js';
import { PagesService } from './services/pages.service.js';
import { SeoService } from './services/seo.service.js';
import { TranslationService } from './services/translation.service.js';
import { TwitterService } from './services/twitter.service.js';
import { PostHistory } from './utils/history.js';
import { logger } from './utils/logger.js';
import type { PostResult, BatchResult, MediaUploadResult } from './types/index.js';

async function main(): Promise<void> {
  const startedAt = new Date().toISOString();
  logger.info('=== Auto Blog WordPress - Niche SEO Batch Start ===');

  // 1. Config
  const config = loadConfig();
  logger.info(`Geo: ${config.TRENDS_GEO}, Niches: ${NICHES.length}`);

  // 2. Services
  const researchService = new KeywordResearchService(config.ANTHROPIC_API_KEY, config.TRENDS_GEO);
  const contentService = new ContentGeneratorService(config.ANTHROPIC_API_KEY, config.SITE_OWNER);
  const imageService = new ImageGeneratorService(config.GEMINI_API_KEY);
  const wpService = new WordPressService(config.WP_URL, config.WP_USERNAME, config.WP_APP_PASSWORD, config.SITE_OWNER);
  const translationService = config.DEEPL_API_KEY ? new TranslationService(config.DEEPL_API_KEY) : null;
  if (translationService) {
    logger.info('DeepL translation service enabled');
  } else {
    logger.warn('DEEPL_API_KEY not set, Korean content will use Claude-generated fallback');
  }

  const twitterService =
    config.X_API_KEY && config.X_API_SECRET && config.X_ACCESS_TOKEN && config.X_ACCESS_TOKEN_SECRET
      ? new TwitterService(config.X_API_KEY, config.X_API_SECRET, config.X_ACCESS_TOKEN, config.X_ACCESS_TOKEN_SECRET)
      : null;
  if (twitterService) {
    logger.info('X (Twitter) promotion service enabled');
  } else {
    logger.info('X_API_KEY not set, skipping X promotion');
  }

  // 2.5. Ensure required pages exist (AdSense compliance)
  const pagesService = new PagesService(config.WP_URL, config.WP_USERNAME, config.WP_APP_PASSWORD);
  try {
    await pagesService.ensureRequiredPages(config.SITE_NAME, config.SITE_OWNER, config.CONTACT_EMAIL);
  } catch (error) {
    logger.warn(`Failed to create required pages: ${error instanceof Error ? error.message : error}`);
  }

  // 2.6. Ensure search engine verification meta tags + GA4
  const seoService = new SeoService(config.WP_URL, config.WP_USERNAME, config.WP_APP_PASSWORD, config.INDEXNOW_KEY);
  try {
    await seoService.ensureHeaderScripts({
      googleCode: config.GOOGLE_SITE_VERIFICATION,
      naverCode: config.NAVER_SITE_VERIFICATION,
      gaMeasurementId: config.GA_MEASUREMENT_ID,
    });
  } catch (error) {
    logger.warn(`SEO/GA setup failed: ${error instanceof Error ? error.message : error}`);
  }

  // 2.7. Ensure hreflang PHP snippet for bilingual SEO
  try {
    await seoService.ensureHreflangSnippet();
  } catch (error) {
    logger.warn(`hreflang snippet setup failed: ${error instanceof Error ? error.message : error}`);
  }

  // 2.8. Ensure mobile AdSense padding (prevent bottom banner covering navigation)
  try {
    await seoService.ensureAdSensePaddingSnippet();
  } catch (error) {
    logger.warn(`AdSense padding snippet setup failed: ${error instanceof Error ? error.message : error}`);
  }

  // 2.9. Ensure IndexNow key file is served (for Naver Search Advisor)
  try {
    await seoService.ensureIndexNowKeySnippet();
  } catch (error) {
    logger.warn(`IndexNow key snippet setup failed: ${error instanceof Error ? error.message : error}`);
  }

  // 3. History
  const history = new PostHistory();
  await history.load();

  // 3.5. Fetch existing posts for internal linking
  const existingPosts = await wpService.getRecentPosts(50);
  logger.info(`Fetched ${existingPosts.length} existing posts for internal linking`);

  // 4. Process each niche
  const results: PostResult[] = [];
  let skippedCount = 0;

  for (const niche of NICHES) {
    const postStart = Date.now();
    logger.info(`\n=== Processing Niche: "${niche.name}" ===`);

    try {
      // 4a. Keyword research
      const postedKeywords = history.getPostedKeywordsForNiche(niche.id);
      const researched = await researchService.researchKeyword(niche, postedKeywords);

      // 4b. Check if already posted
      if (history.isPosted(researched.analysis.selectedKeyword, niche.id)) {
        logger.info(`Keyword "${researched.analysis.selectedKeyword}" already posted for niche "${niche.name}", skipping`);
        skippedCount++;
        continue;
      }

      // 4c. Generate content (Claude EN-only) with internal links
      // Prioritise same-category posts for topical relevance, pad with recent cross-niche
      const nichePosts = existingPosts
        .filter((p) => p.category.toLowerCase() === niche.category.toLowerCase())
        .slice(0, 15);
      const otherPosts = existingPosts
        .filter((p) => p.category.toLowerCase() !== niche.category.toLowerCase())
        .slice(0, 10);
      const filteredPosts = [...nichePosts, ...otherPosts];

      let content = await contentService.generateContent(researched, filteredPosts);

      // 4c-2. Translate to Korean via DeepL
      if (translationService) {
        content = await translationService.translateContent(content);
      }

      // 4d. Generate images (Gemini)
      const images = await imageService.generateImages(content.imagePrompts);

      // 4e. Upload featured image (MANDATORY) - WebP with SEO filename & ALT
      const keyword = researched.analysis.selectedKeyword;
      let featuredMediaResult: MediaUploadResult | undefined;
      if (images.featured.length > 0) {
        const filename = ImageGeneratorService.buildFilename(keyword, 'featured');
        const altText = content.imageCaptions?.[0] ?? content.title;
        featuredMediaResult = await wpService.uploadMedia(images.featured, filename, altText);
      }
      if (!featuredMediaResult) {
        throw new Error(`Featured image is required but generation failed for "${keyword}"`);
      }

      // 4f. Upload inline images (graceful) - WebP with SEO filename & ALT
      const inlineImages: Array<{ url: string; caption: string }> = [];
      for (let i = 0; i < images.inline.length; i++) {
        try {
          if (images.inline[i].length > 0) {
            const filename = ImageGeneratorService.buildFilename(keyword, `section-${i + 1}`);
            const caption = content.imageCaptions?.[i + 1] ?? `${content.title} image ${i + 1}`;
            const mediaResult = await wpService.uploadMedia(images.inline[i], filename, caption);
            inlineImages.push({ url: mediaResult.sourceUrl, caption });
          }
        } catch (error) {
          logger.warn(
            `Inline image ${i + 1} upload failed, skipping: ${error instanceof Error ? error.message : error}`,
          );
        }
      }

      // 4g. Create WordPress post (English)
      const post = await wpService.createPost(
        content,
        featuredMediaResult.mediaId,
        inlineImages,
        {
          contentType: researched.analysis.contentType,
          keyword: researched.analysis.selectedKeyword,
          featuredImageUrl: featuredMediaResult.sourceUrl,
        },
      );

      // 4h. Create standalone Korean post + hreflang linking
      // Brief delay to avoid WordPress server socket hang up on consecutive requests
      await new Promise((r) => setTimeout(r, 3000));

      let krPostId: number | undefined;
      let krPostUrl: string | undefined;
      try {
        const krPost = await wpService.createKoreanPost(
          content,
          featuredMediaResult.mediaId,
          inlineImages,
          post.url,
        );
        krPostId = krPost.postId;
        krPostUrl = krPost.url;

        // Update EN post meta with hreflang_ko pointing to KR post
        await new Promise((r) => setTimeout(r, 2000));
        await wpService.updatePostMeta(post.postId, { hreflang_ko: krPost.url });

        logger.info(`Bilingual posts linked: EN(${post.postId}) <-> KR(${krPost.postId})`);
      } catch (error) {
        logger.warn(`Korean post creation failed (EN post is still live): ${error instanceof Error ? error.message : error}`);
      }

      // 4i. Notify Naver Search Advisor via IndexNow
      const indexNowUrls = [post.url, ...(krPostUrl ? [krPostUrl] : [])];
      await seoService.notifyIndexNow(indexNowUrls);

      // 4j. X (Twitter) promotion (optional, non-blocking)
      if (twitterService) {
        await twitterService.promoteBlogPost(content, post);
      }

      // 4k. Record history
      await history.addEntry({
        keyword: researched.analysis.selectedKeyword,
        postId: post.postId,
        postUrl: post.url,
        postIdKr: krPostId,
        postUrlKr: krPostUrl,
        publishedAt: new Date().toISOString(),
        niche: niche.id,
        contentType: researched.analysis.contentType,
      });

      results.push({
        keyword: researched.analysis.selectedKeyword,
        niche: niche.id,
        success: true,
        postId: post.postId,
        postUrl: post.url,
        postIdKr: krPostId,
        postUrlKr: krPostUrl,
        duration: Date.now() - postStart,
      });
    } catch (error) {
      const message = axios.isAxiosError(error)
        ? `${error.response?.status} ${JSON.stringify(error.response?.data ?? error.message)}`
        : (error instanceof Error ? error.message : String(error));
      logger.error(`Failed to process niche "${niche.name}": ${message}`);
      results.push({
        keyword: niche.name,
        niche: niche.id,
        success: false,
        error: message,
        duration: Date.now() - postStart,
      });
    }
  }

  // 5. Update last run
  await history.updateLastRun();

  // 6. Summary
  const batch: BatchResult = {
    startedAt,
    completedAt: new Date().toISOString(),
    totalKeywords: NICHES.length,
    successCount: results.filter((r) => r.success).length,
    failureCount: results.filter((r) => !r.success).length,
    skippedCount,
    results,
  };

  logger.info('\n=== Batch Summary ===');
  logger.info(`Total: ${batch.totalKeywords} | Success: ${batch.successCount} | Failed: ${batch.failureCount} | Skipped: ${batch.skippedCount}`);

  for (const r of results) {
    if (r.success) {
      const krInfo = r.postUrlKr ? ` | KR: ${r.postUrlKr}` : '';
      logger.info(`  [OK] [${r.niche}] "${r.keyword}" → ${r.postUrl}${krInfo} (${r.duration}ms)`);
    } else {
      logger.error(`  [FAIL] [${r.niche}] "${r.keyword}" → ${r.error}`);
    }
  }

  logger.info('=== Batch Complete ===');

  // Exit with error code if all posts failed
  if (batch.successCount === 0 && batch.failureCount > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  logger.error(`Fatal error: ${error instanceof Error ? error.message : error}`);
  process.exit(1);
});
