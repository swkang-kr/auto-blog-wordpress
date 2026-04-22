/**
 * 지정한 영상 1개를 제외하고 채널의 모든 영상 삭제
 * 실행: node --env-file=.env --import tsx/esm src/scripts/delete-youtube-videos.ts
 */
import 'dotenv/config';
import { google } from 'googleapis';

const KEEP_ID = 'A8ydohuloEg';

const oauth2Client = new google.auth.OAuth2(
  process.env.YOUTUBE_CLIENT_ID!,
  process.env.YOUTUBE_CLIENT_SECRET!,
  'urn:ietf:wg:oauth:2.0:oob',
);
oauth2Client.setCredentials({ refresh_token: process.env.YOUTUBE_REFRESH_TOKEN! });

const youtube = google.youtube({ version: 'v3', auth: oauth2Client });

async function getAllVideoIds(): Promise<{ id: string; title: string }[]> {
  const videos: { id: string; title: string }[] = [];
  let pageToken: string | undefined;

  // 채널 ID 조회
  const meRes = await youtube.channels.list({ part: ['id'], mine: true });
  const channelId = meRes.data.items?.[0]?.id;
  if (!channelId) throw new Error('채널 ID를 찾을 수 없습니다');
  console.log(`채널 ID: ${channelId}`);

  do {
    const res = await youtube.search.list({
      part: ['id', 'snippet'],
      channelId,
      type: ['video'],
      maxResults: 50,
      pageToken,
    });

    for (const item of res.data.items ?? []) {
      if (item.id?.videoId) {
        videos.push({
          id: item.id.videoId,
          title: item.snippet?.title ?? '(제목 없음)',
        });
      }
    }

    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);

  return videos;
}

async function main() {
  console.log('=== YouTube 영상 삭제 시작 ===\n');

  const all = await getAllVideoIds();
  console.log(`총 영상 수: ${all.length}개`);

  const toDelete = all.filter(v => v.id !== KEEP_ID);
  const kept = all.find(v => v.id === KEEP_ID);

  console.log(`유지: ${kept ? `"${kept.title}" (${KEEP_ID})` : `(채널에 없음 — 이미 처리됨)`}`);
  console.log(`삭제 대상: ${toDelete.length}개\n`);

  if (toDelete.length === 0) {
    console.log('삭제할 영상이 없습니다.');
    return;
  }

  let deleted = 0;
  let failed = 0;

  for (const video of toDelete) {
    try {
      await youtube.videos.delete({ id: video.id });
      console.log(`✅ 삭제: "${video.title}" (${video.id})`);
      deleted++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`❌ 실패: "${video.title}" (${video.id}) — ${msg}`);
      failed++;
    }
  }

  console.log(`\n완료 — 삭제: ${deleted}개, 실패: ${failed}개`);
}

main().catch(console.error);
