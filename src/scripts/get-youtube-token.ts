/**
 * YouTube OAuth2 refresh_token 발급 스크립트
 * 실행: node --env-file=.env --import tsx/esm src/scripts/get-youtube-token.ts
 */
import { google } from 'googleapis';
import * as readline from 'node:readline/promises';
import 'dotenv/config';

const CLIENT_ID = process.env.YOUTUBE_CLIENT_ID!;
const CLIENT_SECRET = process.env.YOUTUBE_CLIENT_SECRET!;
const REDIRECT_URI = 'urn:ietf:wg:oauth:2.0:oob';

const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  scope: ['https://www.googleapis.com/auth/youtube.upload'],
  prompt: 'consent',
});

console.log('\n아래 URL을 브라우저에서 열고 인증 후 코드를 붙여넣으세요:\n');
console.log(authUrl);
console.log('');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const code = await rl.question('인증 코드 입력: ');
rl.close();

const { tokens } = await oauth2Client.getToken(code.trim());
console.log('\n=== 발급된 토큰 ===');
console.log(`YOUTUBE_REFRESH_TOKEN=${tokens.refresh_token}`);
console.log('\n위 값을 .env에 저장하세요.');
