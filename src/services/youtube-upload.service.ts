import { google } from 'googleapis';
import fs from 'node:fs';
import { logger } from '../utils/logger.js';
import type { ShortsScript } from './shorts-script.service.js';

export class YouTubeUploadService {
  private oauth2Client;

  constructor(
    clientId: string,
    clientSecret: string,
    refreshToken: string,
  ) {
    this.oauth2Client = new google.auth.OAuth2(
      clientId,
      clientSecret,
      'urn:ietf:wg:oauth:2.0:oob',
    );
    this.oauth2Client.setCredentials({ refresh_token: refreshToken });
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

      // OAuth 인증 오류는 로그로 즉시 확인 가능하도록 남김 (Testing 모드 7일 만료 케이스)
      if (/invalid_grant|unauthorized|invalid_token/i.test(msg)) {
        logger.error(`[YouTube] OAuth 만료: 업로드 실패 "${script.title}" — 새 refresh_token 발급 필요 (Google OAuth Testing 모드는 7일마다 만료). 에러: ${msg}`);
      }
      return null;
    }
  }
}
