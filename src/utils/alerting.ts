import axios from 'axios';
import { logger } from './logger.js';

/**
 * Send a Slack notification via incoming webhook.
 * Non-critical: silently fails if webhook URL is not set or request fails.
 */
export async function sendSlackAlert(webhookUrl: string, message: string, severity: 'info' | 'warning' | 'error' = 'info'): Promise<void> {
  if (!webhookUrl) return;

  const emoji = severity === 'error' ? ':red_circle:' : severity === 'warning' ? ':warning:' : ':large_blue_circle:';
  const color = severity === 'error' ? '#FF0000' : severity === 'warning' ? '#FFA500' : '#0066FF';

  try {
    await axios.post(webhookUrl, {
      attachments: [{
        color,
        text: `${emoji} *Auto Blog WordPress*\n${message}`,
        footer: `auto-blog-wordpress | ${new Date().toISOString()}`,
      }],
    }, { timeout: 10000 });
    logger.debug(`Slack alert sent: ${severity}`);
  } catch (error) {
    logger.warn(`Slack alert failed: ${error instanceof Error ? error.message : error}`);
  }
}

/**
 * Send batch completion summary to Slack.
 */
export async function sendBatchSummary(
  webhookUrl: string,
  stats: {
    successCount: number;
    failureCount: number;
    skippedCount: number;
    totalDuration: number;
    results: Array<{ keyword: string; niche: string; success: boolean; postUrl?: string; error?: string }>;
  },
): Promise<void> {
  if (!webhookUrl) return;

  const durationMin = (stats.totalDuration / 1000 / 60).toFixed(1);
  const allFailed = stats.successCount === 0 && stats.failureCount > 0;
  const severity = allFailed ? 'error' : stats.failureCount > 0 ? 'warning' : 'info';

  const lines: string[] = [
    `*Batch Complete* (${durationMin} min)`,
    `Success: ${stats.successCount} | Failed: ${stats.failureCount} | Skipped: ${stats.skippedCount}`,
  ];

  // Show published posts
  const published = stats.results.filter(r => r.success);
  if (published.length > 0) {
    lines.push('');
    lines.push('*Published:*');
    for (const r of published) {
      lines.push(`  - [${r.niche}] "${r.keyword}" → ${r.postUrl}`);
    }
  }

  // Show failures
  const failed = stats.results.filter(r => !r.success);
  if (failed.length > 0) {
    lines.push('');
    lines.push('*Failed:*');
    for (const r of failed) {
      const errShort = r.error ? r.error.substring(0, 100) : 'Unknown';
      lines.push(`  - [${r.niche}] "${r.keyword}": ${errShort}`);
    }
  }

  await sendSlackAlert(webhookUrl, lines.join('\n'), severity);
}
