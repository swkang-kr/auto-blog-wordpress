import { logger } from './logger.js';

/** Per-million-token pricing (USD) as of 2026 */
const PRICING: Record<string, { input: number; output: number }> = {
  'claude-sonnet-4-6':  { input: 3.00, output: 15.00 },
  'claude-haiku-4-5':   { input: 0.80, output: 4.00 },
  'claude-opus-4-6':    { input: 15.00, output: 75.00 },
  // Gemini image generation (per-image estimate, not per-token)
  'imagen-3.0':         { input: 0, output: 0 },
};

interface CostEntry {
  service: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCost: number;
  timestamp: string;
}

/**
 * Simple in-memory cost tracker for API calls within a single batch run.
 * Logs a summary at the end of the batch.
 */
export class CostTracker {
  private entries: CostEntry[] = [];
  private imageCount = 0;
  private static readonly IMAGE_COST_ESTIMATE = 0.04; // ~$0.04 per Gemini image

  /**
   * Record a Claude API call's token usage.
   */
  addClaudeCall(model: string, inputTokens: number, outputTokens: number): void {
    const pricing = PRICING[model] || PRICING['claude-sonnet-4-6'];
    const cost = (inputTokens / 1_000_000) * pricing.input + (outputTokens / 1_000_000) * pricing.output;
    this.entries.push({
      service: 'Claude',
      model,
      inputTokens,
      outputTokens,
      estimatedCost: cost,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Record a Gemini image generation call.
   */
  addImageCall(count: number = 1): void {
    this.imageCount += count;
  }

  /**
   * Get total estimated cost for this batch.
   */
  getTotalCost(): number {
    const claudeCost = this.entries.reduce((sum, e) => sum + e.estimatedCost, 0);
    const imageCost = this.imageCount * CostTracker.IMAGE_COST_ESTIMATE;
    return claudeCost + imageCost;
  }

  /**
   * Get breakdown of token usage.
   */
  getTokenSummary(): { totalInput: number; totalOutput: number; callCount: number } {
    return {
      totalInput: this.entries.reduce((sum, e) => sum + e.inputTokens, 0),
      totalOutput: this.entries.reduce((sum, e) => sum + e.outputTokens, 0),
      callCount: this.entries.length,
    };
  }

  /**
   * Log the cost summary for this batch.
   */
  logSummary(): void {
    const { totalInput, totalOutput, callCount } = this.getTokenSummary();
    const claudeCost = this.entries.reduce((sum, e) => sum + e.estimatedCost, 0);
    const imageCost = this.imageCount * CostTracker.IMAGE_COST_ESTIMATE;
    const totalCost = claudeCost + imageCost;

    logger.info('\n=== API Cost Summary ===');
    logger.info(`Claude API: ${callCount} calls, ${(totalInput / 1000).toFixed(1)}K input + ${(totalOutput / 1000).toFixed(1)}K output tokens → $${claudeCost.toFixed(4)}`);
    if (this.imageCount > 0) {
      logger.info(`Gemini Images: ${this.imageCount} images → ~$${imageCost.toFixed(4)}`);
    }
    logger.info(`Total Estimated Cost: $${totalCost.toFixed(4)}`);
    logger.info('========================');
  }
}

/** Global singleton for the current batch run */
export const costTracker = new CostTracker();
