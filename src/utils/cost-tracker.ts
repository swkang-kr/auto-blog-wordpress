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

/** Per-post cost attribution for ROI tracking */
interface PostCostAttribution {
  postId?: number;
  keyword: string;
  niche: string;
  costs: {
    keywordResearch: number;
    contentGeneration: number;
    imageGeneration: number;
    total: number;
  };
  estimatedMonthlyRevenue: number;
  estimatedPaybackDays: number;
}

/**
 * Simple in-memory cost tracker for API calls within a single batch run.
 * Logs a summary at the end of the batch.
 */
export class CostTracker {
  private entries: CostEntry[] = [];
  private imageCount = 0;
  private totalCost = 0;
  private static readonly IMAGE_COST_ESTIMATE = 0.04; // ~$0.04 per Gemini image
  /** Per-post cost tracking for ROI attribution */
  private postCosts = new Map<string, { keywordResearch: number; contentGeneration: number; imageGeneration: number; totalCost?: number; estimatedRevenue?: number; pageviews?: number; rpm?: number; roiDays?: number }>();
  private currentPostKey: string = '';
  private apiUsage: Map<string, { calls: number; limit: number; resetAt: number }> = new Map();

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
    this.totalCost += cost;
    // Auto-track API call for quota monitoring (1000 RPD default for Claude)
    this.trackApiCall('Claude', 1000);
  }

  /**
   * Start tracking costs for a specific post.
   */
  startPostTracking(keyword: string): void {
    this.currentPostKey = keyword;
    if (!this.postCosts.has(keyword)) {
      this.postCosts.set(keyword, { keywordResearch: 0, contentGeneration: 0, imageGeneration: 0 });
    }
  }

  /**
   * Record a Claude API call's token usage for current post phase.
   */
  addClaudeCallForPhase(model: string, inputTokens: number, outputTokens: number, phase: 'keywordResearch' | 'contentGeneration'): void {
    this.addClaudeCall(model, inputTokens, outputTokens);
    if (this.currentPostKey) {
      const pricing = PRICING[model] || PRICING['claude-sonnet-4-6'];
      const cost = (inputTokens / 1_000_000) * pricing.input + (outputTokens / 1_000_000) * pricing.output;
      const postCost = this.postCosts.get(this.currentPostKey);
      if (postCost) postCost[phase] += cost;
    }
  }

  /**
   * Record a Gemini image generation call.
   */
  addImageCall(count: number = 1): void {
    this.imageCount += count;
    if (this.currentPostKey) {
      const postCost = this.postCosts.get(this.currentPostKey);
      if (postCost) postCost.imageGeneration += count * CostTracker.IMAGE_COST_ESTIMATE;
    }
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

  /**
   * Estimate revenue per niche based on industry RPM averages.
   * RPM = Revenue per 1000 pageviews (AdSense industry averages for English content).
   */
  static readonly NICHE_RPM_ESTIMATES: Record<string, number> = {
    'Korean Tech': 8.50,       // Tech/software RPM
    'Korean Finance': 12.00,   // Finance RPM (highest)
    'K-Beauty': 6.00,          // Beauty/lifestyle RPM
    'Korea Travel': 5.50,      // Travel RPM
    'K-Entertainment': 4.00,   // Entertainment RPM (lowest)
  };

  /**
   * Seasonal RPM multipliers — certain niches earn significantly more during peak seasons.
   * Month is 1-based (1=Jan, 12=Dec). Multipliers are applied to base RPM.
   */
  static readonly SEASONAL_RPM_MULTIPLIERS: Record<string, Record<number, number>> = {
    'Korea Travel': { 3: 1.5, 4: 2.0, 5: 2.5, 6: 3.0, 7: 3.0, 8: 2.5, 9: 2.0, 10: 1.5 }, // Spring-Summer peak
    'Korean Finance': { 1: 1.5, 3: 1.3, 6: 1.3, 10: 1.5, 11: 2.0, 12: 2.0 }, // Year-end + tax season
    'K-Beauty': { 3: 1.3, 4: 1.5, 10: 1.5, 11: 2.0, 12: 1.8 }, // Spring routine + holiday gifting
    'Korean Tech': { 1: 1.8, 2: 1.5, 8: 1.3, 9: 1.5 }, // CES + product launch season
    'K-Entertainment': { 11: 1.5, 12: 1.8 }, // Award season (MAMA, etc.)
  };

  /** Get RPM with seasonal multiplier applied */
  static getSeasonalRpm(category: string, month?: number): number {
    const baseRpm = CostTracker.NICHE_RPM_ESTIMATES[category] || 5;
    const m = month || (new Date().getMonth() + 1);
    const multiplier = CostTracker.SEASONAL_RPM_MULTIPLIERS[category]?.[m] || 1.0;
    return baseRpm * multiplier;
  }

  /**
   * Estimate monthly revenue based on published post count and niche.
   * Assumes average of 200 pageviews/month per post (conservative for new sites).
   */
  static estimateMonthlyRevenue(
    postsByNiche: Record<string, number>,
    avgPageviewsPerPost: number = 200,
  ): { totalEstimate: number; byNiche: Record<string, number> } {
    const byNiche: Record<string, number> = {};
    let totalEstimate = 0;

    for (const [niche, count] of Object.entries(postsByNiche)) {
      const rpm = CostTracker.NICHE_RPM_ESTIMATES[niche] || 5.00;
      const monthlyPv = count * avgPageviewsPerPost;
      const revenue = (monthlyPv / 1000) * rpm;
      byNiche[niche] = revenue;
      totalEstimate += revenue;
    }

    return { totalEstimate, byNiche };
  }

  /**
   * Log revenue estimate alongside cost summary.
   */
  logRevenueEstimate(postsByNiche: Record<string, number>): void {
    const { totalEstimate, byNiche } = CostTracker.estimateMonthlyRevenue(postsByNiche);
    const totalCost = this.getTotalCost();
    const roi = totalCost > 0 ? ((totalEstimate - totalCost) / totalCost * 100).toFixed(0) : 'N/A';

    logger.info('\n=== Revenue Estimate (Monthly) ===');
    for (const [niche, revenue] of Object.entries(byNiche)) {
      const rpm = CostTracker.NICHE_RPM_ESTIMATES[niche] || 5.00;
      logger.info(`  ${niche}: $${revenue.toFixed(2)}/mo (RPM ~$${rpm.toFixed(2)})`);
    }
    logger.info(`Total Estimated Revenue: $${totalEstimate.toFixed(2)}/mo`);
    logger.info(`Batch Cost: $${totalCost.toFixed(4)} | Estimated Monthly ROI: ${roi}%`);
    logger.info('=================================');
  }

  /**
   * Get per-post cost attribution for ROI analysis.
   */
  getPostCostAttribution(niche: string, avgPageviewsPerPost: number = 200): PostCostAttribution[] {
    const results: PostCostAttribution[] = [];
    const rpm = CostTracker.NICHE_RPM_ESTIMATES[niche] || 5.00;

    for (const [keyword, costs] of this.postCosts) {
      const totalCost = costs.keywordResearch + costs.contentGeneration + costs.imageGeneration;
      const monthlyRevenue = (avgPageviewsPerPost / 1000) * rpm;
      const paybackDays = monthlyRevenue > 0 ? Math.ceil((totalCost / monthlyRevenue) * 30) : 999;

      results.push({
        keyword,
        niche,
        costs: { ...costs, total: totalCost },
        estimatedMonthlyRevenue: monthlyRevenue,
        estimatedPaybackDays: paybackDays,
      });
    }
    return results;
  }

  /**
   * Log per-post ROI summary.
   */
  logPostRoiSummary(): void {
    if (this.postCosts.size === 0) return;

    logger.info('\n=== Per-Post ROI Attribution ===');
    for (const [keyword, costs] of this.postCosts) {
      const total = costs.keywordResearch + costs.contentGeneration + costs.imageGeneration;
      logger.info(
        `  "${keyword.slice(0, 50)}": research=$${costs.keywordResearch.toFixed(4)}, ` +
        `content=$${costs.contentGeneration.toFixed(4)}, images=$${costs.imageGeneration.toFixed(4)} → ` +
        `total=$${total.toFixed(4)}`,
      );
    }
    logger.info('================================');
  }

  /** Track estimated revenue per post using AdSense URL channel data */
  trackPostRevenue(postUrl: string, pageviews: number, rpm: number): void {
    const estimatedRevenue = (pageviews / 1000) * rpm;
    const existingPost = this.postCosts.get(postUrl);
    if (existingPost) {
      existingPost.estimatedRevenue = estimatedRevenue;
      existingPost.pageviews = pageviews;
      existingPost.rpm = rpm;
      existingPost.totalCost = existingPost.keywordResearch + existingPost.contentGeneration + existingPost.imageGeneration;
      existingPost.roiDays = existingPost.totalCost > 0
        ? Math.ceil(existingPost.totalCost / (estimatedRevenue / 30))
        : 0;
    }
  }

  /** Track API call for rate limit monitoring */
  trackApiCall(apiName: string, dailyLimit: number = 1000): void {
    const today = new Date().toISOString().slice(0, 10);
    const key = `${apiName}:${today}`;
    const existing = this.apiUsage.get(key);
    if (existing) {
      existing.calls++;
    } else {
      this.apiUsage.set(key, { calls: 1, limit: dailyLimit, resetAt: Date.now() + 24 * 60 * 60 * 1000 });
    }
  }

  /** Check if daily quota is exceeded for a given API */
  isQuotaExceeded(apiName: string): boolean {
    const today = new Date().toISOString().slice(0, 10);
    const key = `${apiName}:${today}`;
    const usage = this.apiUsage.get(key);
    return usage ? usage.calls >= usage.limit : false;
  }

  /** Get current daily spend estimate */
  getDailySpend(): number {
    return this.totalCost;
  }

  /** Get API usage summary for rate limit dashboard */
  getApiUsageSummary(): Array<{ api: string; calls: number; limit: number; usagePct: number; warning: boolean }> {
    const today = new Date().toISOString().slice(0, 10);
    const summary: Array<{ api: string; calls: number; limit: number; usagePct: number; warning: boolean }> = [];
    for (const [key, usage] of this.apiUsage) {
      if (!key.endsWith(today)) continue;
      const api = key.split(':')[0];
      const usagePct = Math.round((usage.calls / usage.limit) * 100);
      summary.push({ api, calls: usage.calls, limit: usage.limit, usagePct, warning: usagePct > 80 });
    }
    return summary;
  }

  /**
   * RPM feedback loop: adjust niche RPM estimates based on actual GA4 revenue data.
   * Compares estimated RPM vs actual, and logs adjustment recommendations.
   * Call after each batch with real AdSense/GA4 revenue data when available.
   */
  static adjustRpmFromActual(
    actualRpmByNiche: Record<string, number>,
  ): Record<string, { estimated: number; actual: number; adjustment: string }> {
    const adjustments: Record<string, { estimated: number; actual: number; adjustment: string }> = {};

    for (const [niche, actualRpm] of Object.entries(actualRpmByNiche)) {
      const estimated = CostTracker.NICHE_RPM_ESTIMATES[niche];
      if (!estimated) continue;

      const diff = ((actualRpm - estimated) / estimated) * 100;
      let adjustment: string;

      if (Math.abs(diff) < 10) {
        adjustment = 'accurate';
      } else if (actualRpm > estimated) {
        adjustment = `underestimated by ${diff.toFixed(0)}% — consider increasing content volume`;
        // Update estimate towards actual (weighted moving average: 70% old + 30% new)
        CostTracker.NICHE_RPM_ESTIMATES[niche] = estimated * 0.7 + actualRpm * 0.3;
      } else {
        adjustment = `overestimated by ${Math.abs(diff).toFixed(0)}% — review content quality`;
        CostTracker.NICHE_RPM_ESTIMATES[niche] = estimated * 0.7 + actualRpm * 0.3;
      }

      adjustments[niche] = { estimated, actual: actualRpm, adjustment };
    }

    if (Object.keys(adjustments).length > 0) {
      logger.info('\n=== RPM Feedback Loop ===');
      for (const [niche, data] of Object.entries(adjustments)) {
        logger.info(`  ${niche}: est $${data.estimated.toFixed(2)} vs actual $${data.actual.toFixed(2)} → ${data.adjustment}`);
      }
      logger.info('========================');
    }

    return adjustments;
  }

  /**
   * [#16] Update actual RPM from GA4 revenue data with weighted moving average.
   * Automatically adjusts NICHE_RPM_ESTIMATES toward actual performance.
   */
  updateActualRpm(categoryRpmData: Map<string, { rpm: number; pageviews: number; revenue: number }>): void {
    for (const [category, data] of categoryRpmData) {
      const currentEstimate = CostTracker.NICHE_RPM_ESTIMATES[category];
      if (currentEstimate === undefined || data.pageviews < 100) continue;
      // Weighted moving average: 60% historical + 40% new (higher weight for actual data)
      const newEstimate = currentEstimate * 0.6 + data.rpm * 0.4;
      const diff = ((data.rpm - currentEstimate) / currentEstimate) * 100;
      CostTracker.NICHE_RPM_ESTIMATES[category] = Math.round(newEstimate * 100) / 100;
      logger.info(`RPM auto-adjust: ${category} $${currentEstimate.toFixed(2)} → $${newEstimate.toFixed(2)} (actual: $${data.rpm.toFixed(2)}, delta: ${diff > 0 ? '+' : ''}${diff.toFixed(0)}%)`);
    }
  }
}

/** Global singleton for the current batch run */
export const costTracker = new CostTracker();
