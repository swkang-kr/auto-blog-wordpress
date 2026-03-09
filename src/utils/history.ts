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

  getPostedKeywordsForNiche(nicheId: string): string[] {
    return this.data.entries
      .filter((e) => e.niche === nicheId)
      .map((e) => e.keyword);
  }

  async addEntry(entry: PostHistoryEntry): Promise<void> {
    this.data.entries.push(entry);
    this.data.totalPosts = this.data.entries.length;
    await this.save();
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
