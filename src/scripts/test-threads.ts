#!/usr/bin/env npx tsx
/**
 * Threads 포스팅 테스트 스크립트
 * 블로그 URL을 텍스트에 포함 → Threads가 OG 이미지로 클릭 가능한 링크 프리뷰 카드 자동 생성
 *
 * Usage:
 *   npx tsx src/scripts/test-threads.ts
 */

import { loadConfig } from '../config/env.js';
import { ThreadsService } from '../services/threads.service.js';
import type { BlogContent, PublishedPost } from '../types/index.js';

const TEST_CONTENT: BlogContent = {
  title: 'KOSPI 시황 분석: 반도체 업종 주도 상승 흐름 지속',
  html: '',
  excerpt: '오늘 KOSPI는 반도체 업종 강세로 상승 마감. 삼성전자·SK하이닉스 외국인 순매수 유입. 시장 전망과 주요 지지/저항 레벨을 분석합니다.',
  tags: ['KOSPI', '시장분석', '반도체', '삼성전자', 'SKhynix'],
  category: '시장분석',
  imagePrompts: [],
  imageCaptions: [],
};

const TEST_POST: PublishedPost = {
  postId: 99999,
  url: 'https://trendhunt.net/kospi-시황-반도체-분석/',
  title: TEST_CONTENT.title,
  featuredImageId: 0,
};

async function main() {
  console.log('=== Threads 포스팅 테스트 ===\n');
  console.log('방식: 텍스트 + URL → Threads 링크 프리뷰 카드 (OG 이미지 클릭 시 블로그 이동)\n');

  const config = loadConfig();

  if (!config.THREADS_ACCESS_TOKEN || !config.THREADS_USER_ID) {
    console.error('❌ THREADS_ACCESS_TOKEN 또는 THREADS_USER_ID가 설정되지 않았습니다.');
    process.exit(1);
  }

  console.log(`THREADS_USER_ID: ${config.THREADS_USER_ID}`);
  console.log(`THREADS_ACCESS_TOKEN: ${config.THREADS_ACCESS_TOKEN.slice(0, 8)}...***\n`);

  const service = new ThreadsService(config.THREADS_ACCESS_TOKEN, config.THREADS_USER_ID);

  console.log('포스팅 내용:');
  console.log(`  제목: ${TEST_CONTENT.title}`);
  console.log(`  URL:  ${TEST_POST.url}`);
  console.log(`  카테고리: ${TEST_CONTENT.category}`);
  console.log(`  태그: ${TEST_CONTENT.tags.join(', ')}`);
  console.log();

  const threadId = await service.promoteBlogPost(TEST_CONTENT, TEST_POST);

  if (threadId) {
    console.log(`✅ 성공! Thread ID: ${threadId}`);
    console.log(`   https://www.threads.net/t/${threadId}`);
    console.log('\n💡 Threads 앱에서 링크 프리뷰 카드 이미지 클릭 → 블로그로 이동 확인');
  } else {
    console.log('❌ 포스팅 실패 (null 반환) — 로그를 확인하세요.');
  }
}

main().catch(err => {
  console.error(`Fatal: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
