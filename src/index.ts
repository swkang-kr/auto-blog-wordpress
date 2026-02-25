import { loadConfig } from './config/env.js';
import { NICHES } from './config/niches.js';
import { KeywordResearchService } from './services/keyword-research.service.js';
import { ContentGeneratorService } from './services/content-generator.service.js';
import { ImageGeneratorService } from './services/image-generator.service.js';
import { WordPressService } from './services/wordpress.service.js';
import { PagesService } from './services/pages.service.js';
import { SeoService } from './services/seo.service.js';
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

  // 2.5. Ensure required pages exist (AdSense compliance)
  const pagesService = new PagesService(config.WP_URL, config.WP_USERNAME, config.WP_APP_PASSWORD);
  try {
    await pagesService.ensureRequiredPages(config.SITE_NAME, config.SITE_OWNER, config.CONTACT_EMAIL);
  } catch (error) {
    logger.warn(`Failed to create required pages: ${error instanceof Error ? error.message : error}`);
  }

  // 2.6. Ensure search engine verification meta tags + GA4
  const seoService = new SeoService(config.WP_URL, config.WP_USERNAME, config.WP_APP_PASSWORD);
  try {
    await seoService.ensureHeaderScripts({
      googleCode: config.GOOGLE_SITE_VERIFICATION,
      naverCode: config.NAVER_SITE_VERIFICATION,
      gaMeasurementId: config.GA_MEASUREMENT_ID,
    });
  } catch (error) {
    logger.warn(`SEO/GA setup failed: ${error instanceof Error ? error.message : error}`);
  }

  // 3. History
  const history = new PostHistory();
  await history.load();

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

      // 4c. Generate content (Claude)
      const content = await contentService.generateContent(researched);

      // 4d. Generate images (Gemini)
      const images = await imageService.generateImages(content.imagePrompts);

      // 4e. Upload featured image (MANDATORY)
      let featuredMediaResult: MediaUploadResult | undefined;
      if (images.featured.length > 0) {
        const slug = `post-${Date.now()}`;
        featuredMediaResult = await wpService.uploadMedia(
          images.featured,
          `${slug}-featured.png`,
        );
      }
      if (!featuredMediaResult) {
        throw new Error(`Featured image is required but generation failed for "${researched.analysis.selectedKeyword}"`);
      }

      // 4f. Upload inline images (graceful - individual failures skipped)
      const inlineImages: Array<{ url: string; caption: string }> = [];
      for (let i = 0; i < images.inline.length; i++) {
        try {
          if (images.inline[i].length > 0) {
            const slug = `post-${Date.now()}`;
            const mediaResult = await wpService.uploadMedia(
              images.inline[i],
              `${slug}-inline-${i + 1}.png`,
            );
            inlineImages.push({
              url: mediaResult.sourceUrl,
              caption: content.imageCaptions?.[i + 1] ?? `${content.title} image ${i + 1}`,
            });
          }
        } catch (error) {
          logger.warn(
            `Inline image ${i + 1} upload failed, skipping: ${error instanceof Error ? error.message : error}`,
          );
        }
      }

      // 4g. Create WordPress post
      const post = await wpService.createPost(
        content,
        featuredMediaResult.mediaId,
        inlineImages,
      );

      // 4h. Record history
      await history.addEntry({
        keyword: researched.analysis.selectedKeyword,
        postId: post.postId,
        postUrl: post.url,
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
        duration: Date.now() - postStart,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
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
      logger.info(`  [OK] [${r.niche}] "${r.keyword}" → ${r.postUrl} (${r.duration}ms)`);
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
