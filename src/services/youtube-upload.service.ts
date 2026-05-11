import { google } from 'googleapis';
import fs from 'node:fs';
import { logger } from '../utils/logger.js';
import { sendTelegramAlert } from '../utils/alerting.js';
import type { ShortsScript } from './shorts-script.service.js';

export class YouTubeUploadService {
  private oauth2Client;
  private telegramBotToken: string;
  private telegramChatId: string;

  constructor(
    clientId: string,
    clientSecret: string,
    refreshToken: string,
    telegramBotToken: string = '',
    telegramChatId: string = '',
  ) {
    this.oauth2Client = new google.auth.OAuth2(
      clientId,
      clientSecret,
      'urn:ietf:wg:oauth:2.0:oob',
    );
    this.oauth2Client.setCredentials({ refresh_token: refreshToken });
    this.telegramBotToken = telegramBotToken;
    this.telegramChatId = telegramChatId;
  }

  async upload(mp4Path: string, script: ShortsScript, postUrl: string): Promise<string | null> {
    try {
      const youtube = google.youtube({ version: 'v3', auth: this.oauth2Client });

      const description = [
        script.narration,
        '',
        `🔗 자세히 보기: ${postUrl}`,
        '',
        script.hashtags.join(' '),
      ].join('\n');

      logger.info(`[YouTube] Uploading: "${script.title}"`);

      const response = await youtube.videos.insert({
        part: ['snippet', 'status'],
        requestBody: {
          snippet: {
            title: script.title,
            description,
            tags: script.hashtags.map(h => h.replace('#', '')),
            categoryId: '25', // News & Politics
            defaultLanguage: 'ko',
          },
          status: {
            privacyStatus: 'public',
            selfDeclaredMadeForKids: false,
          },
        },
        media: {
          body: fs.createReadStream(mp4Path),
        },
      });

      const videoId = response.data.id!;
      const videoUrl = `https://www.youtube.com/shorts/${videoId}`;
      logger.info(`[YouTube] Uploaded: ${videoUrl}`);

      // 블로그 URL 댓글 등록
      if (postUrl) {
        try {
          await youtube.commentThreads.insert({
            part: ['snippet'],
            requestBody: {
              snippet: {
                videoId,
                topLevelComment: {
                  snippet: {
                    textOriginal: `📊 전체 분석 보기 → ${postUrl}\n\n더 자세한 기술적 분석과 매수 전략이 담겨 있습니다!`,
                  },
                },
              },
            },
          });
          logger.info(`[YouTube] Comment posted: ${postUrl}`);
        } catch (commentErr) {
          logger.warn(`[YouTube] Comment failed (non-fatal): ${commentErr instanceof Error ? commentErr.message : commentErr}`);
        }
      }

      return videoUrl;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn(`[YouTube] Upload failed (non-fatal): ${msg}`);

      // OAuth 인증 오류는 즉시 운영자 알림 (Testing 모드 7일 만료 케이스)
      if (/invalid_grant|unauthorized|invalid_token/i.test(msg)) {
        await sendTelegramAlert(
          this.telegramBotToken,
          this.telegramChatId,
          `<b>YouTube OAuth 만료</b>\n` +
          `업로드 실패: "${script.title}"\n` +
          `에러: ${msg}\n\n` +
          `<i>조치: 새 refresh_token 발급 필요 (Google OAuth Testing 모드는 7일마다 만료).</i>`,
          'error',
        );
      }
      return null;
    }
  }
}
