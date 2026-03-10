import axios from 'axios';
import { logger } from './logger.js';

const TELEGRAM_MAX_LENGTH = 4096;

/**
 * Send a Telegram notification via Bot API.
 * Non-critical: silently fails if bot token or chat ID is not set or request fails.
 */
export async function sendTelegramAlert(
  botToken: string,
  chatId: string,
  message: string,
  severity: 'info' | 'warning' | 'error' = 'info',
): Promise<void> {
  if (!botToken || !chatId) return;

  const emoji = severity === 'error' ? '🔴' : severity === 'warning' ? '⚠️' : '🔵';
  const fullText = `${emoji} <b>Auto Blog WordPress</b>\n${message}\n<i>${new Date().toISOString()}</i>`;

  try {
    // Split long messages to respect Telegram's 4096 char limit
    const chunks = splitMessage(fullText, TELEGRAM_MAX_LENGTH);
    for (const chunk of chunks) {
      await axios.post(
        `https://api.telegram.org/bot${botToken}/sendMessage`,
        { chat_id: chatId, text: chunk, parse_mode: 'HTML' },
        { timeout: 10000 },
      );
    }
    logger.debug(`Telegram alert sent: ${severity}`);
  } catch (error) {
    logger.warn(`Telegram alert failed: ${error instanceof Error ? error.message : error}`);
  }
}

/** Split a message into chunks respecting Telegram's character limit */
function splitMessage(text: string, maxLength: number): string[] {
  if (text.length <= maxLength) return [text];
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= maxLength) {
      chunks.push(remaining);
      break;
    }
    // Try to split at a newline boundary
    let splitIdx = remaining.lastIndexOf('\n', maxLength);
    if (splitIdx <= 0) splitIdx = maxLength;
    chunks.push(remaining.slice(0, splitIdx));
    remaining = remaining.slice(splitIdx).replace(/^\n/, '');
  }
  return chunks;
}

/**
 * Send quality alert when a post has low quality score.
 * Triggers immediate notification for manual review.
 */
export async function sendQualityAlert(
  botToken: string,
  chatId: string,
  postTitle: string,
  postUrl: string,
  qualityScore: number,
  minScore: number,
  issues: string[],
): Promise<void> {
  if (!botToken || !chatId) return;

  const lines = [
    `<b>Quality Alert: Post Below Threshold</b>`,
    `Title: "${postTitle}"`,
    `URL: ${postUrl}`,
    `Score: ${qualityScore}/${minScore} (minimum required)`,
    '',
    '<b>Issues:</b>',
    ...issues.slice(0, 5).map(i => `  - ${i}`),
    '',
    '<i>Action: Review and improve the post, or it may be auto-reverted to draft.</i>',
  ];

  await sendTelegramAlert(botToken, chatId, lines.join('\n'), 'warning');
}

/**
 * Send content decay alert for declining posts.
 */
export async function sendDecayAlert(
  botToken: string,
  chatId: string,
  decliningPages: Array<{ page: string; position: number; clicks: number; impressions: number }>,
): Promise<void> {
  if (!botToken || !chatId || decliningPages.length === 0) return;

  const lines = [
    `<b>Content Decay Alert: ${decliningPages.length} declining page(s)</b>`,
    '',
    ...decliningPages.slice(0, 5).map(p =>
      `  - ${p.page} (pos ${p.position.toFixed(1)}, ${p.clicks} clicks, ${p.impressions} imp)`,
    ),
    '',
    '<i>Run: npx tsx src/scripts/refresh-stale-posts.ts</i>',
  ];

  await sendTelegramAlert(botToken, chatId, lines.join('\n'), 'warning');
}

/**
 * Send health check notification at batch start.
 */
export async function sendHealthCheck(
  botToken: string,
  chatId: string,
  stats: { totalPosts: number; activeNiches: number; postCount: number },
): Promise<void> {
  if (!botToken || !chatId) return;

  await sendTelegramAlert(
    botToken,
    chatId,
    `<b>Batch Starting</b> — ${stats.activeNiches} niche(s), ${stats.postCount} post(s) planned, ${stats.totalPosts} total published`,
    'info',
  );
}

/**
 * Send batch completion summary to Telegram.
 */
export async function sendBatchSummary(
  botToken: string,
  chatId: string,
  stats: {
    successCount: number;
    failureCount: number;
    skippedCount: number;
    totalDuration: number;
    results: Array<{ keyword: string; niche: string; success: boolean; postUrl?: string; error?: string }>;
  },
): Promise<void> {
  if (!botToken || !chatId) return;

  const durationMin = (stats.totalDuration / 1000 / 60).toFixed(1);
  const allFailed = stats.successCount === 0 && stats.failureCount > 0;
  const severity = allFailed ? 'error' : stats.failureCount > 0 ? 'warning' : 'info';

  const lines: string[] = [
    `<b>Batch Complete</b> (${durationMin} min)`,
    `Success: ${stats.successCount} | Failed: ${stats.failureCount} | Skipped: ${stats.skippedCount}`,
  ];

  // Show published posts
  const published = stats.results.filter(r => r.success);
  if (published.length > 0) {
    lines.push('');
    lines.push('<b>Published:</b>');
    for (const r of published) {
      lines.push(`  - [${r.niche}] "${r.keyword}" → ${r.postUrl}`);
    }
  }

  // Show failures
  const failed = stats.results.filter(r => !r.success);
  if (failed.length > 0) {
    lines.push('');
    lines.push('<b>Failed:</b>');
    for (const r of failed) {
      const errShort = r.error ? r.error.substring(0, 100) : 'Unknown';
      lines.push(`  - [${r.niche}] "${r.keyword}": ${errShort}`);
    }
  }

  await sendTelegramAlert(botToken, chatId, lines.join('\n'), severity);
}
