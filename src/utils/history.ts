import fs from 'node:fs/promises';
import path from 'node:path';
import { logger } from './logger.js';
import type { PostHistoryData, PostHistoryEntry, ContentType } from '../types/index.js';

const HISTORY_FILE = path.resolve('data', 'post-history.json');

const EMPTY_HISTORY: PostHistoryData = {
  entries: [],
  lastRunAt: '',
  totalPosts: 0,
};

export class PostHistory {
  private data: PostHistoryData = { ...EMPTY_HISTORY, entries: [] };

  async load(): Promise<void> {
    try {
      const raw = await fs.readFile(HISTORY_FILE, 'utf-8');
      this.data = JSON.parse(raw) as PostHistoryData;
      logger.info(`Loaded post history: ${this.data.entries.length} entries`);
    } catch {
      logger.info('No existing post history found, starting fresh');
      this.data = { ...EMPTY_HISTORY, entries: [] };
    }
  }

  isPosted(keyword: string, nicheId?: string): boolean {
    const normalized = keyword.trim().toLowerCase();
    return this.data.entries.some((e) => {
      const existing = e.keyword.trim().toLowerCase();
      // Exact match or fuzzy similarity check (prevents cannibalization)
      const isMatch = existing === normalized || this.isSimilarKeyword(existing, normalized);
      if (nicheId && e.niche) {
        return isMatch && e.niche === nicheId;
      }
      return isMatch;
    });
  }

  /**
   * Check if two keywords are similar enough to cause cannibalization.
   * Uses word overlap ratio — if 70%+ of significant words overlap, consider them similar.
   */
  private isSimilarKeyword(a: string, b: string): boolean {
    const stopWords = new Set(['a', 'an', 'the', 'in', 'on', 'at', 'to', 'for', 'of', 'and', 'or', 'is', 'are', 'was', 'were', 'your', 'you', 'how', 'what', 'why', 'best', 'top']);
    const wordsA = a.split(/\s+/).filter((w) => w.length > 2 && !stopWords.has(w));
    const wordsB = b.split(/\s+/).filter((w) => w.length > 2 && !stopWords.has(w));

    if (wordsA.length === 0 || wordsB.length === 0) return false;

    const setA = new Set(wordsA);
    const overlap = wordsB.filter((w) => setA.has(w)).length;
    // Use max length to prevent short keywords from over-matching long ones
    // e.g. "Korean ETF" should not match "how to use Korean ETF platforms for foreign investors"
    const maxLen = Math.max(wordsA.length, wordsB.length);

    return maxLen > 0 && overlap / maxLen >= 0.6;
  }

  /** Find a history entry by WordPress post ID */
  findByPostId(postId: number): PostHistoryEntry | undefined {
    return this.data.entries.find((e) => e.postId === postId);
  }

  getPostedKeywordsForNiche(nicheId: string): string[] {
    return this.data.entries
      .filter((e) => e.niche === nicheId)
      .map((e) => e.keyword);
  }

  /**
   * Get recent content types for a niche to enable diversity tracking.
   * Returns last N content types used for this niche.
   */
  getRecentContentTypes(nicheId: string, count: number = 5): string[] {
    return this.data.entries
      .filter((e) => e.niche === nicheId && e.contentType)
      .slice(-count)
      .map((e) => e.contentType!);
  }

  /**
   * Compute content freshness score (0-100) for a post based on time decay.
   * Score decreases as content ages, weighted by content type volatility.
   * Higher scores = fresher content, lower scores = needs refresh.
   */
  computeFreshnessScore(entry: PostHistoryEntry): number {
    const ageDays = (Date.now() - new Date(entry.publishedAt).getTime()) / (1000 * 60 * 60 * 24);

    // Content type decay rates (days until score drops to 50%)
    const halfLifeDays: Record<string, number> = {
      'news-explainer': 30,   // News ages fast
      'analysis': 60,          // Analysis stays relevant longer
      'how-to': 120,           // How-to guides are more evergreen
      'best-x-for-y': 90,     // Lists need periodic updates
      'x-vs-y': 90,           // Comparisons change with products
      'deep-dive': 120,        // Deep dives are relatively evergreen
      'listicle': 60,          // Listicles need fresh items
      'product-review': 60,     // Product reviews need frequent updates
      'case-study': 180,       // Case studies are most evergreen
    };

    const halfLife = halfLifeDays[entry.contentType || 'analysis'] || 90;
    // Exponential decay: score = 100 * e^(-ln(2) * ageDays / halfLife)
    const score = 100 * Math.exp(-0.693 * ageDays / halfLife);

    // Engagement bonus: well-performing content decays slower
    const engagementBonus = entry.engagementScore
      ? Math.min(15, entry.engagementScore * 0.1)
      : 0;

    return Math.max(0, Math.min(100, Math.round(score + engagementBonus)));
  }

  /**
   * Get posts sorted by freshness score (lowest first = needs refresh most).
   * Useful for prioritizing content refresh candidates.
   */
  getPostsByFreshnessScore(minAgeDays: number = 14): Array<PostHistoryEntry & { freshnessScore: number }> {
    const cutoff = new Date(Date.now() - minAgeDays * 24 * 60 * 60 * 1000).toISOString();
    return this.data.entries
      .filter(e => e.publishedAt < cutoff)
      .map(e => ({ ...e, freshnessScore: this.computeFreshnessScore(e) }))
      .sort((a, b) => a.freshnessScore - b.freshnessScore);
  }

  /** Get entries published within the last N days (for indexing verification). */
  getRecentEntries(days: number): PostHistoryEntry[] {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    return this.data.entries.filter((e) => e.publishedAt >= cutoff);
  }

  /** Get the last publish date for a category (niche ID). */
  getLastPublishDate(nicheId: string): string | null {
    return this.data.categoryLastPublished?.[nicheId] || null;
  }

  /** Record that a category was just published. */
  async recordCategoryPublish(nicheId: string): Promise<void> {
    if (!this.data.categoryLastPublished) {
      this.data.categoryLastPublished = {};
    }
    this.data.categoryLastPublished[nicheId] = new Date().toISOString();
    await this.save();
  }

  /**
   * Get categories sorted by staleness (least recently published first).
   * Categories that have never been published come first.
   */
  getCategoriesByStalenessPriority(nicheIds: string[]): string[] {
    return [...nicheIds].sort((a, b) => {
      const dateA = this.data.categoryLastPublished?.[a] || '1970-01-01';
      const dateB = this.data.categoryLastPublished?.[b] || '1970-01-01';
      return dateA.localeCompare(dateB);
    });
  }

  /** Get all history entries (for analytics enrichment). */
  getAllEntries(): PostHistoryEntry[] {
    return this.data.entries;
  }

  async addEntry(entry: PostHistoryEntry): Promise<void> {
    this.data.entries.push(entry);
    this.data.totalPosts = this.data.entries.length;
    await this.save();
  }

  /**
   * Update engagement scores for history entries using GA4 performance data.
   * Called after GA4 data is loaded to populate the engagementScore field
   * used by freshness decay calculations.
   */
  async updateEngagementScores(performanceData: Array<{ url: string; pageviews: number; bounceRate: number; avgEngagementTime: number }>): Promise<void> {
    if (performanceData.length === 0) return;

    let updated = 0;
    for (const perf of performanceData) {
      // Match by URL slug
      const slug = '/' + perf.url.replace(/^\/|\/$/g, '') + '/';
      const entry = this.data.entries.find(e =>
        e.postUrl.includes(slug) || e.postUrl.includes(perf.url.replace(/^\//, '')),
      );
      if (!entry) continue;

      // Engagement score (0-100): weighted combination of pageviews, bounce rate, and engagement time
      // Higher pageviews + lower bounce + longer engagement = higher score
      const pvScore = Math.min(40, perf.pageviews * 0.4); // up to 40 points for 100+ views
      const bounceScore = Math.max(0, 30 * (1 - perf.bounceRate)); // up to 30 points for 0% bounce
      const engScore = Math.min(30, perf.avgEngagementTime * 0.2); // up to 30 points for 150s+ engagement
      const score = Math.round(pvScore + bounceScore + engScore);

      if (entry.engagementScore !== score) {
        entry.engagementScore = score;
        updated++;
      }
    }

    if (updated > 0) {
      await this.save();
      logger.info(`Engagement scores updated for ${updated} post(s)`);
    }
  }

  /** Mark A/B title test as resolved for a given post, optionally storing the winning title */
  async markTitleTestResolved(postId: number, winningTitle?: string): Promise<void> {
    const entry = this.data.entries.find(e => e.postId === postId);
    if (entry) {
      entry.titleTestResolved = true;
      if (winningTitle) {
        entry.titleTestWinner = winningTitle;
      }
      await this.save();
    }
  }

  /** Predefined series patterns: niche → series ID → keyword patterns */
  private static readonly MANUAL_SERIES: Record<string, Record<string, string[]>> = {
    'korean-tech-ai': {
      'samsung-semiconductor': ['samsung', 'semiconductor', 'chip', 'hbm', 'foundry', 'memory'],
      'korean-ai-ecosystem': ['ai', 'artificial intelligence', 'machine learning', 'llm', 'naver ai'],
    },
    'korean-finance-stocks': {
      'kospi-investing-101': ['kospi', 'kosdaq', 'korean stocks', 'etf', 'index fund'],
      'bok-monetary-policy': ['bok', 'bank of korea', 'interest rate', 'monetary policy', 'korean won'],
    },
    'k-beauty-skincare': {
      'skincare-routine-guide': ['routine', 'skincare', 'glass skin', 'step', 'regimen'],
      'ingredient-deep-dive': ['ingredient', 'niacinamide', 'retinol', 'vitamin c', 'hyaluronic', 'centella'],
    },
    'korea-travel-guide': {
      'seoul-travel-essentials': ['seoul', 'subway', 'transport', 'accommodation', 'hotel'],
      'korea-food-guide': ['food', 'restaurant', 'street food', 'korean bbq', 'kimchi'],
    },
    'k-entertainment-business': {
      'kpop-business-analysis': ['kpop', 'k-pop', 'hybe', 'sm entertainment', 'jyp', 'yg'],
      'kdrama-streaming': ['kdrama', 'k-drama', 'netflix', 'streaming', 'webtoon'],
    },
  };

  /**
   * Get next series part number for a given niche.
   * Uses both manual series definitions and automatic detection.
   * Manual series: keyword pattern matching against predefined series.
   * Auto series: 3+ posts in the same niche with high keyword overlap (bigram similarity).
   */
  getSeriesInfo(nicheId: string, keyword: string): { seriesId: string; seriesPart: number } | null {
    const kwLower = keyword.toLowerCase();
    const kwWords = kwLower.split(/\s+/).filter(w => w.length > 2);

    // 1. Check manual series definitions first
    const manualSeries = PostHistory.MANUAL_SERIES[nicheId];
    if (manualSeries) {
      for (const [seriesId, patterns] of Object.entries(manualSeries)) {
        const matchCount = patterns.filter(p => kwLower.includes(p)).length;
        if (matchCount >= 2 || (matchCount >= 1 && kwWords.length <= 3)) {
          const existingInSeries = this.data.entries.filter(e => e.seriesId === seriesId);
          return { seriesId, seriesPart: existingInSeries.length + 1 };
        }
      }
    }

    // 2. Check existing auto-detected series
    const nicheEntries = this.data.entries.filter(e => e.niche === nicheId && e.seriesId);
    if (nicheEntries.length === 0) return null;

    const seriesGroups = new Map<string, PostHistoryEntry[]>();
    for (const entry of nicheEntries) {
      if (entry.seriesId) {
        const group = seriesGroups.get(entry.seriesId) || [];
        group.push(entry);
        seriesGroups.set(entry.seriesId, group);
      }
    }

    // Enhanced matching: use bigram overlap for better semantic similarity
    for (const [seriesId, entries] of seriesGroups) {
      const seriesKeywords = entries.map(e => e.keyword.toLowerCase());
      const kwBigrams = this.getBigrams(kwLower);

      // Check bigram overlap with each series keyword
      let bestOverlap = 0;
      for (const sk of seriesKeywords) {
        const skBigrams = this.getBigrams(sk);
        const intersection = kwBigrams.filter(b => skBigrams.includes(b)).length;
        const union = new Set([...kwBigrams, ...skBigrams]).size;
        const overlap = union > 0 ? intersection / union : 0;
        bestOverlap = Math.max(bestOverlap, overlap);
      }

      // Word-level overlap as secondary signal
      const wordMatchCount = kwWords.filter(w =>
        seriesKeywords.some(sk => sk.includes(w)),
      ).length;

      if (bestOverlap >= 0.3 || wordMatchCount >= 2) {
        return { seriesId, seriesPart: entries.length + 1 };
      }
    }

    return null;
  }

  /** Extract character bigrams from text for fuzzy matching */
  private getBigrams(text: string): string[] {
    const words = text.split(/\s+/).filter(w => w.length > 2);
    const bigrams: string[] = [];
    for (let i = 0; i < words.length - 1; i++) {
      bigrams.push(`${words[i]} ${words[i + 1]}`);
    }
    return bigrams;
  }

  /** Get all entries in a specific series, ordered by part number */
  getSeriesEntries(seriesId: string): PostHistoryEntry[] {
    return this.data.entries
      .filter(e => e.seriesId === seriesId)
      .sort((a, b) => (a.seriesPart || 0) - (b.seriesPart || 0));
  }

  /**
   * Get posts with pending A/B title tests (have titleCandidates but not resolved).
   */
  getPendingTitleTests(): PostHistoryEntry[] {
    return this.data.entries.filter(e =>
      e.titleCandidates && e.titleCandidates.length > 0 && !e.titleTestResolved,
    );
  }

  /**
   * Get posts ready for excerpt A/B testing.
   * Returns entries with multiple excerpt candidates that haven't been tested yet.
   */
  getExcerptTestCandidates(): PostHistoryEntry[] {
    return this.data.entries.filter(e =>
      e.excerptCandidates &&
      e.excerptCandidates.length > 1 &&
      e.activeExcerptVariant === undefined,
    );
  }

  /**
   * Get aggregated title pattern win rates from resolved A/B tests.
   * Returns pattern → { wins, total, winRate } for learning which title styles perform best.
   */
  getTitlePatternWinRates(): Record<string, { wins: number; total: number; winRate: number }> {
    const resolved = this.data.entries.filter(e => e.titleTestResolved && e.titlePattern);
    const patternStats: Record<string, { wins: number; total: number }> = {};

    for (const entry of resolved) {
      const pattern = entry.titlePattern || 'unknown';
      if (!patternStats[pattern]) patternStats[pattern] = { wins: 0, total: 0 };
      patternStats[pattern].total++;

      // A win means the original title won (or the A/B test resulted in a winner)
      if (entry.titleTestWinner) {
        patternStats[pattern].wins++;
      }
    }

    const result: Record<string, { wins: number; total: number; winRate: number }> = {};
    for (const [pattern, stats] of Object.entries(patternStats)) {
      result[pattern] = {
        ...stats,
        winRate: stats.total > 0 ? Math.round((stats.wins / stats.total) * 100) : 0,
      };
    }

    return result;
  }

  async updateLastRun(): Promise<void> {
    this.data.lastRunAt = new Date().toISOString();
    await this.save();
  }

  /**
   * [#13] Update lastModifiedDate for a post entry (content freshness signal).
   * Called when content is refreshed/rewritten.
   */
  async updateLastModified(postId: number, modifiedDate?: string): Promise<void> {
    const entry = this.data.entries.find(e => e.postId === postId);
    if (entry) {
      entry.lastModifiedDate = modifiedDate || new Date().toISOString();
      await this.save();
    }
  }

  /**
   * [#1] Get topic coverage for a niche against a topical map.
   * Returns covered and uncovered topics based on keyword overlap.
   */
  getTopicCoverage(nicheId: string, topicalMap: string[]): { covered: string[]; uncovered: string[]; coveragePct: number } {
    const nicheEntries = this.data.entries.filter(e => e.niche === nicheId);
    const coveredKeywords = nicheEntries.map(e => e.keyword.toLowerCase());

    const covered: string[] = [];
    const uncovered: string[] = [];

    for (const topic of topicalMap) {
      const topicLower = topic.toLowerCase();
      const topicWords = topicLower.split(/\s+/).filter(w => w.length > 2);
      const isCovered = coveredKeywords.some(kw => {
        const kwWords = kw.split(/\s+/).filter(w => w.length > 2);
        const overlap = topicWords.filter(tw => kwWords.some(kw2 => kw2.includes(tw) || tw.includes(kw2))).length;
        return overlap >= Math.min(2, topicWords.length);
      });
      if (isCovered) covered.push(topic);
      else uncovered.push(topic);
    }

    const coveragePct = topicalMap.length > 0 ? Math.round((covered.length / topicalMap.length) * 100) : 0;
    return { covered, uncovered, coveragePct };
  }

  /**
   * Map posts to content funnel stages (TOFU/MOFU/BOFU).
   * Uses content type and search intent to classify.
   */
  static classifyFunnelStage(contentType?: string, searchIntent?: string): 'tofu' | 'mofu' | 'bofu' {
    // BOFU: transactional intent, product reviews, how-to purchase
    if (searchIntent === 'transactional' || contentType === 'product-review') return 'bofu';
    // MOFU: commercial investigation, comparisons, best-x-for-y
    if (searchIntent === 'commercial' || searchIntent === 'commercial-investigation' ||
        contentType === 'x-vs-y' || contentType === 'best-x-for-y') return 'mofu';
    // TOFU: informational, news, deep-dive, analysis
    return 'tofu';
  }

  /** Get funnel distribution statistics */
  getFunnelDistribution(): { tofu: number; mofu: number; bofu: number; total: number } {
    const dist = { tofu: 0, mofu: 0, bofu: 0, total: this.data.entries.length };
    for (const entry of this.data.entries) {
      const stage = PostHistory.classifyFunnelStage(entry.contentType, entry.searchIntent);
      dist[stage]++;
    }
    return dist;
  }

  /** Persist current history data to disk (for external callers like ranking updates) */
  async persist(): Promise<void> {
    await this.save();
  }

  /** Save batch checkpoint for crash recovery (#21) */
  async saveCheckpoint(checkpoint: {
    batchId: string;
    completedNiches: string[];
    currentNicheIdx: number;
    generatedPosts: number;
    publishedPosts: number;
    startedAt: string;
  }): Promise<void> {
    const checkpointFile = path.resolve('data', 'batch-checkpoint.json');
    await fs.mkdir(path.dirname(checkpointFile), { recursive: true });
    await fs.writeFile(checkpointFile, JSON.stringify(checkpoint, null, 2), 'utf-8');
    logger.debug(`Checkpoint saved: ${checkpoint.completedNiches.length} niches completed`);
  }

  /** Load batch checkpoint for resume after crash (#21) */
  async loadCheckpoint(): Promise<{
    batchId: string;
    completedNiches: string[];
    currentNicheIdx: number;
    generatedPosts: number;
    publishedPosts: number;
    startedAt: string;
  } | null> {
    const checkpointFile = path.resolve('data', 'batch-checkpoint.json');
    try {
      const raw = await fs.readFile(checkpointFile, 'utf-8');
      const checkpoint = JSON.parse(raw);
      // Only resume if checkpoint is less than 2 hours old
      const age = Date.now() - new Date(checkpoint.startedAt).getTime();
      if (age > 2 * 60 * 60 * 1000) {
        logger.info('Stale checkpoint found (>2h old), starting fresh batch');
        return null;
      }
      logger.info(`Resuming from checkpoint: ${checkpoint.completedNiches.length} niches already done`);
      return checkpoint;
    } catch {
      return null;
    }
  }

  /** Clear checkpoint after successful batch completion */
  async clearCheckpoint(): Promise<void> {
    const checkpointFile = path.resolve('data', 'batch-checkpoint.json');
    try {
      await fs.unlink(checkpointFile);
    } catch { /* file doesn't exist, OK */ }
  }

  private async save(): Promise<void> {
    await fs.mkdir(path.dirname(HISTORY_FILE), { recursive: true });
    await fs.writeFile(HISTORY_FILE, JSON.stringify(this.data, null, 2), 'utf-8');
  }
}
