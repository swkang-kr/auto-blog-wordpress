#!/usr/bin/env npx tsx
/**
 * Threads 포스팅 테스트 스크립트 (텍스트 + 이미지)
 *
 * Usage:
 *   npx tsx src/scripts/test-threads.ts          # 텍스트만
 *   npx tsx src/scripts/test-threads.ts --image  # 텍스트 + 이미지
 */

import { loadConfig } from '../config/env.js';
import { ThreadsService } from '../services/threads.service.js';
import type { BlogContent, PublishedPost } from '../types/index.js';

// 공개적으로 접근 가능한 테스트 이미지 URL (Threads API 요구사항)
const TEST_IMAGE_URL = 'https://images.unsplash.com/photo-1598440947619-2c35fc9aa908?w=1080&q=80';

const TEST_CONTENT: BlogContent = {
  title: 'Best Korean Skincare Routine for Glass Skin 2026',
  html: '',
  excerpt: 'Discover the top K-Beauty products Korean dermatologists actually recommend for achieving that coveted glass skin look. From COSRX snail mucin to Anua heartleaf toner — here\'s your complete guide.',
  tags: ['KBeauty', 'GlassSkin', 'KoreanSkincare'],
  category: 'K-Beauty',
  imagePrompts: [],
  imageCaptions: [],
};

const TEST_POST: PublishedPost = {
  postId: 99999,
  url: 'https://trendhunt.site/best-korean-skincare-routine-glass-skin-2026/',
  title: TEST_CONTENT.title,
  featuredImageId: 0,
};

async function main() {
  const withImage = process.argv.includes('--image');

  console.log('=== Threads 포스팅 테스트 ===\n');
  console.log(`모드: ${withImage ? '텍스트 + 이미지' : '텍스트만'}\n`);

  const config = loadConfig();

  if (!config.THREADS_ACCESS_TOKEN || !config.THREADS_USER_ID) {
    console.error('❌ THREADS_ACCESS_TOKEN 또는 THREADS_USER_ID가 설정되지 않았습니다.');
    console.error('   .env 파일을 확인해주세요.');
    process.exit(1);
  }

  console.log(`THREADS_USER_ID: ${config.THREADS_USER_ID}`);
  console.log(`THREADS_ACCESS_TOKEN: ${config.THREADS_ACCESS_TOKEN.slice(0, 8)}...***\n`);

  const service = new ThreadsService(config.THREADS_ACCESS_TOKEN, config.THREADS_USER_ID);

  console.log('포스팅 내용:');
  console.log(`  제목: ${TEST_CONTENT.title}`);
  console.log(`  카테고리: ${TEST_CONTENT.category}`);
  console.log(`  태그: ${TEST_CONTENT.tags.join(', ')}`);
  if (withImage) console.log(`  이미지: ${TEST_IMAGE_URL}`);
  console.log();

  const imageUrl = withImage ? TEST_IMAGE_URL : undefined;
  const threadId = await service.promoteBlogPost(TEST_CONTENT, TEST_POST, imageUrl);

  if (threadId) {
    console.log(`✅ 성공! Thread ID: ${threadId}`);
    console.log(`   https://www.threads.net/t/${threadId}`);
  } else {
    console.log('❌ 포스팅 실패 (null 반환) — 로그를 확인하세요.');
  }
}

main().catch(err => {
  console.error(`Fatal: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
