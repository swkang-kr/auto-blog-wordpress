/**
 * 쇼츠 생성 + YouTube 댓글 등록
 * 실행: node --env-file=.env --import tsx/esm src/scripts/generate-shorts-with-comment.ts
 */
import 'dotenv/config';
import { google } from 'googleapis';
import { ShortsGeneratorService } from '../services/shorts-generator.service.js';
import type { BlogContent, PublishedPost } from '../types/index.js';

const BLOG_URL = 'https://trendhunt.net/와이투솔루션-매수타이밍-분석-2026/';

const content: BlogContent = {
  title: '4월 22일 와이투솔루션 오늘 매수해도 될까: RSI·수급 매수타이밍 분석',
  excerpt: '와이투솔루션(011690) RSI·수급 기반 매수타이밍 분석. 현재가 7,380원, 기술적 신호와 외국인·기관 수급 동향을 종합한 실전 매수 전략을 제시합니다.',
  html: '',
  tags: ['와이투솔루션', 'RSI', '매수타이밍', '종목분석', '수급분석'],
  category: '종목분석',
  imagePrompts: [],
  imageCaptions: [],
};

const post: PublishedPost = {
  postId: 89985,
  url: BLOG_URL,
  slug: '와이투솔루션-매수타이밍-분석-2026',
  title: content.title,
  featuredImageId: 0,
};

const oauth2Client = new google.auth.OAuth2(
  process.env.YOUTUBE_CLIENT_ID!,
  process.env.YOUTUBE_CLIENT_SECRET!,
  'urn:ietf:wg:oauth:2.0:oob',
);
oauth2Client.setCredentials({ refresh_token: process.env.YOUTUBE_REFRESH_TOKEN! });
const youtube = google.youtube({ version: 'v3', auth: oauth2Client });

async function postComment(videoId: string, blogUrl: string) {
  await youtube.commentThreads.insert({
    part: ['snippet'],
    requestBody: {
      snippet: {
        videoId,
        topLevelComment: {
          snippet: {
            textOriginal: `📊 전체 분석 보기 → ${blogUrl}\n\n더 자세한 기술적 분석과 매수 전략이 담겨 있습니다!`,
          },
        },
      },
    },
  });
  console.log(`✅ 댓글 등록 완료: ${blogUrl}`);
}

const service = new ShortsGeneratorService(
  '',
  '',
  process.env.YOUTUBE_CLIENT_ID,
  process.env.YOUTUBE_CLIENT_SECRET,
  process.env.YOUTUBE_REFRESH_TOKEN,
);

console.log('=== 와이투솔루션 Shorts 생성 시작 ===\n');
const result = await service.generate(content, post, '와이투솔루션 RSI 수급 매수타이밍 분석');

if (result) {
  console.log(`\n✅ MP4 저장: ${result}`);

  // YouTube 업로드 결과에서 videoId 추출 (로그에서 URL 파싱)
  // youtube-upload.service.ts가 URL을 반환하므로 여기선 최신 업로드 영상 ID를 조회
  const searchRes = await youtube.search.list({
    part: ['id'],
    forMine: true,
    type: ['video'],
    maxResults: 1,
    order: 'date',
  });
  const videoId = searchRes.data.items?.[0]?.id?.videoId;
  if (videoId) {
    console.log(`YouTube 영상 ID: ${videoId}`);
    await postComment(videoId, BLOG_URL);
  } else {
    console.log('❌ 영상 ID를 찾을 수 없어 댓글 등록 실패');
  }
} else {
  console.log('\n❌ Shorts 생성 실패');
}
