/**
 * publish-weekly.ts — Phase B
 * 주간 매매 결산 포스트를 WordPress에 발행하고 SNS에 배포한다.
 * 환경변수: PUBLISH_WEEKLY_FILE=data/generated/weekly-YYYY-MM-DD.json
 */
import fs from 'node:fs/promises';
import { loadConfig } from '../config/env.js';
import { WordPressService } from '../services/wordpress.service.js';
import { ImageGeneratorService } from '../services/image-generator.service.js';
import { ThreadsService } from '../services/threads.service.js';
import { LinkedInService } from '../services/linkedin.service.js';
import { FacebookService } from '../services/facebook.service.js';
import { logger } from '../utils/logger.js';
import type { BlogContent } from '../types/index.js';

async function main() {
  const filePath = process.env.PUBLISH_WEEKLY_FILE;
  if (!filePath) throw new Error('PUBLISH_WEEKLY_FILE env var required');

  logger.info(`[WeeklyPost] Phase B 시작: ${filePath}`);
  const raw = await fs.readFile(filePath, 'utf-8');
  const { date, content }: { date: string; content: BlogContent } = JSON.parse(raw);

  const config = loadConfig();
  const authorLinks = {
    linkedin: config.AUTHOR_LINKEDIN || '',
    twitter: config.AUTHOR_TWITTER || '',
    website: config.AUTHOR_WEBSITE || '',
  };

  const wpService = new WordPressService(
    config.WP_URL, config.WP_USERNAME, config.WP_APP_PASSWORD,
    config.SITE_OWNER, authorLinks, config.ADSENSE_PUB_ID || undefined,
  );
  const imageService = new ImageGeneratorService(config.GEMINI_API_KEY, config.IMAGE_FORMAT);

  // B-1. 이미지 생성
  const images = await imageService.generateImages(content.imagePrompts);
  let featuredMediaId: number | undefined;
  if (images.featured.length > 0) {
    const filename = `weekly-trading-${date}-featured.${config.IMAGE_FORMAT || 'webp'}`;
    const result = await wpService.uploadMedia(images.featured, filename, content.imageCaptions?.[0] ?? content.title);
    featuredMediaId = result?.mediaId;
    logger.info(`[WeeklyPost] 대표 이미지 업로드: ID=${featuredMediaId}`);
  }

  // B-2. WordPress 발행
  content.slug = `weekly-trading-${date}`;
  const post = await wpService.createPost(
    content,
    featuredMediaId,
    undefined,
    {
      keyword: content.tags[0] ?? '주간결산',
      publishStatus: (config.PUBLISH_STATUS as 'publish' | 'draft') || 'publish',
    },
  );

  logger.info(`[WeeklyPost] 발행 완료: ID=${post.postId} URL=${post.url}`);

  // B-3. SNS 배포
  const postUrl = post.url || '';
  const socialText = `📊 ${content.title}\n\n${content.excerpt}\n\n${postUrl}`;

  if (config.THREADS_ACCESS_TOKEN && config.THREADS_USER_ID) {
    try {
      const threads = new ThreadsService(config.THREADS_ACCESS_TOKEN, config.THREADS_USER_ID);
      await threads.promoteBlogPost(content, post);
      logger.info('[WeeklyPost] Threads 게시 완료');
    } catch (e) {
      logger.warn(`[WeeklyPost] Threads 실패 (non-fatal): ${e instanceof Error ? e.message : e}`);
    }
  }

  if (config.LINKEDIN_ACCESS_TOKEN && config.LINKEDIN_PERSON_ID) {
    try {
      const linkedin = new LinkedInService(config.LINKEDIN_ACCESS_TOKEN, config.LINKEDIN_PERSON_ID);
      await linkedin.promoteBlogPost(content.title, content.excerpt, postUrl, undefined);
      logger.info('[WeeklyPost] LinkedIn 게시 완료');
    } catch (e) {
      logger.warn(`[WeeklyPost] LinkedIn 실패 (non-fatal): ${e instanceof Error ? e.message : e}`);
    }
  }

  if (config.FB_ACCESS_TOKEN && config.FB_PAGE_ID) {
    try {
      const fb = new FacebookService(config.FB_ACCESS_TOKEN, config.FB_PAGE_ID);
      await fb.promoteBlogPost(content, post);
      logger.info('[WeeklyPost] Facebook 게시 완료');
    } catch (e) {
      logger.warn(`[WeeklyPost] Facebook 실패 (non-fatal): ${e instanceof Error ? e.message : e}`);
    }
  }

  logger.info('[WeeklyPost] Phase B 완료');
  void socialText;
}

main().catch(err => {
  console.error('[WeeklyPost] Fatal:', err);
  process.exit(1);
});
