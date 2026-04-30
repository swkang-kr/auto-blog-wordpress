/**
 * upload-shorts-youtube.ts
 * 특정 날짜의 Shorts MP4를 YouTube에 단독 업로드
 * Usage: DATE=2026-04-29 node --env-file=.env --import tsx/esm src/scripts/upload-shorts-youtube.ts
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { ShortsGeneratorService } from '../services/shorts-generator.service.js';
import { logger } from '../utils/logger.js';

const DATE = process.env.DATE ?? new Date().toISOString().slice(0, 10);
const GENERATED_FILE = `data/generated/${DATE}.json`;

const shortsService = new ShortsGeneratorService(
  process.env.CLOVA_CLIENT_ID ?? '',
  process.env.CLOVA_CLIENT_SECRET ?? '',
  process.env.YOUTUBE_CLIENT_ID,
  process.env.YOUTUBE_CLIENT_SECRET,
  process.env.YOUTUBE_REFRESH_TOKEN,
);

async function main() {
  logger.info(`[YouTube] ${DATE} Shorts 업로드 시작`);

  const raw = await fs.readFile(GENERATED_FILE, 'utf-8').catch(() => null);
  if (!raw) { logger.error(`파일 없음: ${GENERATED_FILE}`); process.exit(1); }

  const generated = JSON.parse(raw) as { shortsPath?: string; shortsScript?: unknown; content?: { title?: string } }[];

  let uploaded = 0;
  for (const item of generated) {
    if (!item.shortsPath || !item.shortsScript) {
      logger.warn(`shortsPath/shortsScript 없음 — 건너뜀`);
      continue;
    }

    // 절대경로 → 상대경로 정규화
    const shortsPath = item.shortsPath.startsWith('/')
      ? item.shortsPath.replace(/^.*\/output\/shorts\//, 'output/shorts/')
      : item.shortsPath;

    const exists = await fs.access(shortsPath).then(() => true).catch(() => false);
    if (!exists) {
      logger.warn(`파일 없음: ${shortsPath}`);
      continue;
    }

    logger.info(`[YouTube] 업로드: ${path.basename(shortsPath)}`);
    await (shortsService as any).uploadToYouTube(shortsPath, item.shortsScript, '').catch((e: unknown) => {
      logger.error(`업로드 실패: ${e instanceof Error ? e.message : e}`);
    });
    uploaded++;
  }

  logger.info(`[YouTube] 완료 — ${uploaded}/${generated.length}개 업로드`);
}

main().catch(err => {
  logger.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
