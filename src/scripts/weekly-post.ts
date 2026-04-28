/**
 * weekly-post.ts — Phase A
 * 주간 매매 결산 포스트 생성 (로컬 실행)
 * 출력: data/generated/weekly-YYYY-MM-DD.json
 */
import fs from 'node:fs/promises';
import { WeeklyTradingReviewService } from '../services/weekly-trading-review.service.js';
import { logger } from '../utils/logger.js';

async function main() {
  const refDate = process.env.WEEKLY_DATE
    ? new Date(process.env.WEEKLY_DATE)
    : new Date();

  logger.info(`[WeeklyPost] Phase A 시작 (기준일: ${refDate.toISOString().slice(0, 10)})`);

  const service = new WeeklyTradingReviewService();
  const content = service.generatePost(refDate);

  const date = refDate.toISOString().slice(0, 10);
  const outPath = `data/generated/weekly-${date}.json`;
  await fs.mkdir('data/generated', { recursive: true });
  await fs.writeFile(outPath, JSON.stringify({ date, content }, null, 2));

  logger.info(`[WeeklyPost] Phase A 완료 → ${outPath}`);
  logger.info(`[WeeklyPost] Phase B: PUBLISH_WEEKLY_FILE=${outPath} 로 GH Actions 트리거`);
}

main().catch(err => {
  console.error('[WeeklyPost] Fatal:', err);
  process.exit(1);
});
