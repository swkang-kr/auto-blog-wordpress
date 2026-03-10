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

  /** Mark A/B title test as resolved for a given post */
  async markTitleTestResolved(postId: number): Promise<void> {
    const entry = this.data.entries.find(e => e.postId === postId);
    if (entry) {
      entry.titleTestResolved = true;
      await this.save();
    }
  }

  /**
   * Get next series part number for a given niche.
   * Detects existing series in the niche and returns the next part number.
   * A "series" is defined as 3+ posts in the same niche with high keyword similarity.
   */
  getSeriesInfo(nicheId: string, keyword: string): { seriesId: string; seriesPart: number } | null {
    const nicheEntries = this.data.entries.filter(e => e.niche === nicheId && e.seriesId);
    if (nicheEntries.length === 0) return null;

    // Check if this keyword fits an existing series
    const seriesGroups = new Map<string, PostHistoryEntry[]>();
    for (const entry of nicheEntries) {
      if (entry.seriesId) {
        const group = seriesGroups.get(entry.seriesId) || [];
        group.push(entry);
        seriesGroups.set(entry.seriesId, group);
      }
    }

    // Find matching series by keyword similarity
    for (const [seriesId, entries] of seriesGroups) {
      const seriesKeywords = entries.map(e => e.keyword.toLowerCase());
      const kwLower = keyword.toLowerCase();
      const kwWords = kwLower.split(/\s+/).filter(w => w.length > 3);
      const matchCount = kwWords.filter(w =>
        seriesKeywords.some(sk => sk.includes(w)),
      ).length;
      if (matchCount >= 2 || kwWords.length <= 2) {
        return { seriesId, seriesPart: entries.length + 1 };
      }
    }

    return null;
  }

  /** Get all entries in a specific series, ordered by part number */
  getSeriesEntries(seriesId: string): PostHistoryEntry[] {
    return this.data.entries
      .filter(e => e.seriesId === seriesId)
      .sort((a, b) => (a.seriesPart || 0) - (b.seriesPart || 0));
  }

  async updateLastRun(): Promise<void> {
    this.data.lastRunAt = new Date().toISOString();
    await this.save();
  }

  private async save(): Promise<void> {
    await fs.mkdir(path.dirname(HISTORY_FILE), { recursive: true });
    await fs.writeFile(HISTORY_FILE, JSON.stringify(this.data, null, 2), 'utf-8');
  }
}
