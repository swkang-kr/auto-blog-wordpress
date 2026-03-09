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
    const minLen = Math.min(wordsA.length, wordsB.length);

    return minLen > 0 && overlap / minLen >= 0.7;
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

  /** Mark A/B title test as resolved for a given post */
  async markTitleTestResolved(postId: number): Promise<void> {
    const entry = this.data.entries.find(e => e.postId === postId);
    if (entry) {
      entry.titleTestResolved = true;
      await this.save();
    }
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
