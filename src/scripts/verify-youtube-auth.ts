/**
 * verify-youtube-auth.ts
 * YouTube OAuth refresh_token 유효성 검증 (업로드 없이 access_token 갱신 + channel.list 호출).
 * 매일 cron으로 실행되며, 실패 시 Telegram 알림 전송.
 * Usage: node --env-file=.env --import tsx/esm src/scripts/verify-youtube-auth.ts
 */
import { google } from 'googleapis';
import { sendTelegramAlert } from '../utils/alerting.js';

const clientId = process.env.YOUTUBE_CLIENT_ID;
const clientSecret = process.env.YOUTUBE_CLIENT_SECRET;
const refreshToken = process.env.YOUTUBE_REFRESH_TOKEN;
const telegramBotToken = process.env.TELEGRAM_BOT_TOKEN || '';
const telegramChatId = process.env.TELEGRAM_CHAT_ID || '';

async function alertAndExit(msg: string, code: number): Promise<never> {
  console.error(`[FAIL] ${msg}`);
  await sendTelegramAlert(
    telegramBotToken,
    telegramChatId,
    `<b>YouTube OAuth 헬스체크 실패</b>\n` +
    `${msg}\n\n` +
    `<i>조치: 새 refresh_token 발급 필요. Google OAuth Testing 모드 앱은 7일마다 만료됩니다.</i>`,
    'error',
  );
  process.exit(code);
}

if (!clientId || !clientSecret || !refreshToken) {
  await alertAndExit('YOUTUBE_CLIENT_ID / YOUTUBE_CLIENT_SECRET / YOUTUBE_REFRESH_TOKEN 미설정', 1);
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
    await alertAndExit('mine=true 채널 조회 결과 없음', 2);
  }
  console.log(`[OK] 채널 인증 확인 — ${ch!.snippet?.title} (${ch!.id})`);
  process.exit(0);
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  await alertAndExit(msg, 3);
}
