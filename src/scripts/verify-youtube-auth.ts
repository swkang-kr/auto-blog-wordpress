/**
 * verify-youtube-auth.ts
 * YouTube OAuth refresh_token 유효성 검증 (업로드 없이 access_token 갱신 + channel.list 호출만).
 * Usage: node --env-file=.env --import tsx/esm src/scripts/verify-youtube-auth.ts
 */
import { google } from 'googleapis';

const clientId = process.env.YOUTUBE_CLIENT_ID;
const clientSecret = process.env.YOUTUBE_CLIENT_SECRET;
const refreshToken = process.env.YOUTUBE_REFRESH_TOKEN;

if (!clientId || !clientSecret || !refreshToken) {
  console.error('[FAIL] YOUTUBE_CLIENT_ID / YOUTUBE_CLIENT_SECRET / YOUTUBE_REFRESH_TOKEN 미설정');
  process.exit(1);
}

const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, 'urn:ietf:wg:oauth:2.0:oob');
oauth2Client.setCredentials({ refresh_token: refreshToken });

try {
  const { credentials } = await oauth2Client.refreshAccessToken();
  const expiresAt = credentials.expiry_date ? new Date(credentials.expiry_date).toISOString() : 'n/a';
  console.log(`[OK] OAuth refresh 성공 — access_token 만료: ${expiresAt}`);

  const youtube = google.youtube({ version: 'v3', auth: oauth2Client });
  const res = await youtube.channels.list({ part: ['snippet', 'contentDetails'], mine: true });
  const ch = res.data.items?.[0];
  if (!ch) {
    console.error('[FAIL] mine=true 채널 조회 결과 없음');
    process.exit(2);
  }
  console.log(`[OK] 채널 인증 확인 — ${ch.snippet?.title} (${ch.id})`);
  process.exit(0);
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`[FAIL] ${msg}`);
  process.exit(3);
}
