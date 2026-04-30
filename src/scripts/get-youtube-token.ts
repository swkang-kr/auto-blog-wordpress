/**
 * YouTube OAuth2 refresh_token 발급 스크립트
 * 실행: node --env-file=.env --import tsx/esm src/scripts/get-youtube-token.ts
 */
import { google } from 'googleapis';

const CLIENT_ID = process.env.YOUTUBE_CLIENT_ID!;
const CLIENT_SECRET = process.env.YOUTUBE_CLIENT_SECRET!;
const PORT = 4567;
const REDIRECT_URI = `http://localhost:${PORT}/callback`;

const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  scope: [
    'https://www.googleapis.com/auth/youtube.upload',
    'https://www.googleapis.com/auth/youtube.force-ssl',
  ],
  prompt: 'consent',
});

console.log('\n아래 URL을 브라우저에서 열어 Google 계정으로 인증하세요:\n');
console.log(authUrl);
console.log('');
console.log(`인증 완료 후 http://localhost:${PORT}/callback 으로 자동 리다이렉트됩니다...`);

const { createServer } = await import('node:http');
const server = createServer(async (req, res) => {
  const url = new URL(req.url!, `http://localhost:${PORT}`);
  const code = url.searchParams.get('code');
  if (!code) { res.end('인증 코드 없음'); return; }
  res.end('<html><body><h2>인증 완료! 터미널을 확인하세요.</h2></body></html>');
  server.close();

  const { tokens } = await oauth2Client.getToken(code);
  console.log('\n=== 발급된 토큰 ===');
  console.log(`YOUTUBE_REFRESH_TOKEN=${tokens.refresh_token}`);
  console.log('\n1. .env 파일에 위 값을 저장하세요.');
  console.log('2. GitHub Secrets → YOUTUBE_REFRESH_TOKEN 도 업데이트하세요.');
  process.exit(0);
});

server.listen(PORT, () => {
  console.log(`\n[대기 중] http://localhost:${PORT} 에서 콜백 수신 대기...`);
});
