import { loadConfig } from './config/env.js';
import { GoogleTrendsService } from './services/google-trends.service.js';
import { ContentGeneratorService } from './services/content-generator.service.js';
import { ImageGeneratorService } from './services/image-generator.service.js';
import { WordPressService } from './services/wordpress.service.js';
import { PostHistory } from './utils/history.js';
import { logger } from './utils/logger.js';
import type { PostResult, BatchResult, MediaUploadResult } from './types/index.js';

async function main(): Promise<void> {
  const startedAt = new Date().toISOString();
  logger.info('=== Auto Blog WordPress - Batch Start ===');

  // 1. Config
  const config = loadConfig();
  logger.info(`Country: ${config.TRENDS_COUNTRY}, Posts: ${config.POST_COUNT}`);

  // 2. Services
  const trendsService = new GoogleTrendsService();
  const contentService = new ContentGeneratorService(config.ANTHROPIC_API_KEY);
  const imageService = new ImageGeneratorService(config.GEMINI_API_KEY);
  const wpService = new WordPressService(config.WP_URL, config.WP_USERNAME, config.WP_APP_PASSWORD);

  // 3. History
  const history = new PostHistory();
  await history.load();

  // 4. Fetch trends
  const keywords = await trendsService.fetchTrendingKeywords(
    config.TRENDS_COUNTRY,
    config.POST_COUNT,
  );

  if (keywords.length === 0) {
    logger.warn('No trending keywords found. Exiting.');
    return;
  }

  // 5. Filter duplicates
  const newKeywords = keywords.filter((k) => !history.isPosted(k.title));
  const skippedCount = keywords.length - newKeywords.length;

  if (skippedCount > 0) {
    logger.info(`Skipped ${skippedCount} already-posted keywords`);
  }

  if (newKeywords.length === 0) {
    logger.info('All keywords already posted. Nothing to do.');
    await history.updateLastRun();
    return;
  }

  // 6. Process each keyword
  const results: PostResult[] = [];

  for (const keyword of newKeywords) {
    const postStart = Date.now();
    logger.info(`\n--- Processing: "${keyword.title}" ---`);

    try {
      // 6a. Generate content (Claude)
      const content = await contentService.generateContent(keyword);

      // 6b. Generate images (Gemini)
      const images = await imageService.generateImages(content.imagePrompts);

      // 6c. Upload featured image (MANDATORY)
      let featuredMediaResult: MediaUploadResult | undefined;
      if (images.featured.length > 0) {
        const slug = `post-${Date.now()}`;
        featuredMediaResult = await wpService.uploadMedia(
          images.featured,
          `${slug}-featured.png`,
        );
      }
      if (!featuredMediaResult) {
        throw new Error(`Featured image is required but generation failed for "${keyword.title}"`);
      }

      // 6d. Upload inline images (graceful - individual failures skipped)
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
              caption: content.imageCaptions?.[i + 1] ?? `${content.title} 이미지 ${i + 1}`,
            });
          }
        } catch (error) {
          logger.warn(
            `Inline image ${i + 1} upload failed, skipping: ${error instanceof Error ? error.message : error}`,
          );
        }
      }

      // 6e. Create WordPress post
      const post = await wpService.createPost(
        content,
        featuredMediaResult.mediaId,
        inlineImages,
      );

      // 6f. Record history
      await history.addEntry({
        keyword: keyword.title,
        postId: post.postId,
        postUrl: post.url,
        publishedAt: new Date().toISOString(),
      });

      results.push({
        keyword: keyword.title,
        success: true,
        postId: post.postId,
        postUrl: post.url,
        duration: Date.now() - postStart,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to process "${keyword.title}": ${message}`);
      results.push({
        keyword: keyword.title,
        success: false,
        error: message,
        duration: Date.now() - postStart,
      });
    }
  }

  // 7. Update last run
  await history.updateLastRun();

  // 8. Summary
  const batch: BatchResult = {
    startedAt,
    completedAt: new Date().toISOString(),
    totalKeywords: keywords.length,
    successCount: results.filter((r) => r.success).length,
    failureCount: results.filter((r) => !r.success).length,
    skippedCount,
    results,
  };

  logger.info('\n=== Batch Summary ===');
  logger.info(`Total: ${batch.totalKeywords} | Success: ${batch.successCount} | Failed: ${batch.failureCount} | Skipped: ${batch.skippedCount}`);

  for (const r of results) {
    if (r.success) {
      logger.info(`  [OK] "${r.keyword}" → ${r.postUrl} (${r.duration}ms)`);
    } else {
      logger.error(`  [FAIL] "${r.keyword}" → ${r.error}`);
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
