import fs from 'node:fs/promises';
import https from 'node:https';
import http from 'node:http';
import path from 'node:path';
import { logger } from '../utils/logger.js';

const BGM_DIR = path.resolve('assets/bgm');

// CC0 무료 배경음악 목록 (SoundHelix — 완전 무료, 상업적 사용 가능)
const FREE_TRACKS = [
  'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
  'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3',
  'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-6.mp3',
  'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-9.mp3',
  'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-12.mp3',
];

export class BgmService {
  async getRandomTrack(): Promise<string | null> {
    // 1순위: 환경변수로 직접 지정
    const envPath = process.env.BGM_PATH;
    if (envPath) {
      try {
        await fs.access(envPath);
        return await this.toDataUrl(envPath);
      } catch {
        logger.warn(`[BGM] BGM_PATH not found: ${envPath}`);
      }
    }

    // 2순위: 로컬 캐시 파일 중 랜덤 선택
    await fs.mkdir(BGM_DIR, { recursive: true });
    const cached = await this.listCached();
    if (cached.length > 0) {
      const file = cached[Math.floor(Math.random() * cached.length)];
      logger.info(`[BGM] Using cached track: ${path.basename(file)}`);
      return await this.toDataUrl(file);
    }

    // 3순위: 무료 트랙 다운로드 후 캐시
    logger.info('[BGM] Downloading free BGM tracks...');
    const downloaded = await this.downloadAll();
    if (downloaded.length > 0) {
      const file = downloaded[Math.floor(Math.random() * downloaded.length)];
      return await this.toDataUrl(file);
    }

    logger.warn('[BGM] No BGM available — continuing without music');
    return null;
  }

  private async listCached(): Promise<string[]> {
    try {
      const files = await fs.readdir(BGM_DIR);
      return files
        .filter(f => f.endsWith('.mp3'))
        .map(f => path.join(BGM_DIR, f));
    } catch {
      return [];
    }
  }

  private async downloadAll(): Promise<string[]> {
    const results: string[] = [];
    await Promise.all(FREE_TRACKS.map(async (url, i) => {
      const filename = `bgm-${i + 1}.mp3`;
      const dest = path.join(BGM_DIR, filename);
      try {
        await this.downloadFile(url, dest);
        results.push(dest);
        logger.info(`[BGM] Downloaded: ${filename}`);
      } catch (err) {
        logger.warn(`[BGM] Download failed (${filename}): ${err instanceof Error ? err.message : err}`);
      }
    }));
    return results;
  }

  private downloadFile(url: string, dest: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const mod = url.startsWith('https') ? https : http;
      const req = mod.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          this.downloadFile(res.headers.location!, dest).then(resolve).catch(reject);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', async () => {
          await fs.writeFile(dest, Buffer.concat(chunks));
          resolve();
        });
        res.on('error', reject);
      });
      req.on('error', reject);
      req.setTimeout(30_000, () => { req.destroy(); reject(new Error('timeout')); });
    });
  }

  private async toDataUrl(filePath: string): Promise<string> {
    const buf = await fs.readFile(filePath);
    return `data:audio/mp3;base64,${buf.toString('base64')}`;
  }
}
