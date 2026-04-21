import { google } from 'googleapis';
import fs from 'node:fs';
import { logger } from '../utils/logger.js';
import type { ShortsScript } from './shorts-script.service.js';

export class YouTubeUploadService {
  private oauth2Client;

  constructor(clientId: string, clientSecret: string, refreshToken: string) {
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
      return videoUrl;
    } catch (err) {
      logger.warn(`[YouTube] Upload failed (non-fatal): ${err instanceof Error ? err.message : err}`);
      return null;
    }
  }
}
