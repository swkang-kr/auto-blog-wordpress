import fs from 'node:fs/promises';
import path from 'node:path';
import { logger } from './logger.js';
import type { PostHistoryData, PostHistoryEntry } from '../types/index.js';

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

  isPosted(keyword: string): boolean {
    const normalized = keyword.trim().toLowerCase();
    return this.data.entries.some(
      (e) => e.keyword.trim().toLowerCase() === normalized,
    );
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
