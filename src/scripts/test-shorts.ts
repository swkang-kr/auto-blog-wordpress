/**
 * 쇼츠 생성 테스트 스크립트
 * 실행: node --env-file=.env --import tsx/esm src/scripts/test-shorts.ts
 */
import 'dotenv/config';
import { ShortsGeneratorService } from '../services/shorts-generator.service.js';
import type { BlogContent, PublishedPost } from '../types/index.js';

const content: BlogContent = {
  title: '4월 21일 한온시스템 볼린저밴드 매수후보 분석: 밴드 수축 스퀴즈 돌파 전략',
  excerpt: '한온시스템(018880) 볼린저밴드 수축 국면에서 스퀴즈 돌파 신호 포착. 현재가 4,280원, 밴드 수축 강도 분석과 최적 매수 타이밍 전략을 제시합니다.',
  html: '',
  tags: ['한온시스템', '볼린저밴드', '매수후보', '종목분석'],
  category: '종목분석',
  imagePrompts: [],
  imageCaptions: [],
};

const post: PublishedPost = {
  postId: 89942,
  url: 'https://trendhunt.net/한온시스템-볼린저밴드-매수후보-분석/',
  slug: '한온시스템-볼린저밴드-매수후보-분석',
  title: content.title,
  featuredImageId: 0,
};

const service = new ShortsGeneratorService(
  process.env.NAVER_TTS_CLIENT_ID!,
  process.env.NAVER_TTS_CLIENT_SECRET!,
  process.env.YOUTUBE_CLIENT_ID,
  process.env.YOUTUBE_CLIENT_SECRET,
  process.env.YOUTUBE_REFRESH_TOKEN,
);

console.log('=== Shorts 생성 테스트 시작 ===\n');
const result = await service.generate(content, post, '한온시스템 볼린저밴드 매수후보 분석');
if (result) {
  console.log(`\n✅ 완료: ${result}`);
} else {
  console.log('\n❌ 실패');
}
