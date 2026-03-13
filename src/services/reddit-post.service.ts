import axios from 'axios';
import { logger } from '../utils/logger.js';
import { buildUtmUrl, extractSlugFromUrl } from '../utils/utm.js';

/** Niche → subreddit mapping for auto-posting */
const NICHE_SUBREDDITS: Record<string, string[]> = {
  'Korean Tech': ['korea', 'technology', 'samsung', 'kpop'],
  'Korean Finance': ['korea', 'investing', 'stocks'],
  'K-Beauty': ['AsianBeauty', 'SkincareAddiction', 'korea'],
  'Korea Travel': ['korea', 'travel', 'solotravel'],
  'K-Entertainment': ['kpop', 'KDRAMA', 'korea'],
};

/**
 * Reddit posting service using password grant OAuth (script app type).
 * Submits links to relevant subreddits for traffic generation.
 */
export class RedditPostService {
  private username: string;
  private password: string;
  private clientId: string;
  private clientSecret: string;
  private accessToken: string = '';
  private tokenExpiry: number = 0;
  private readonly userAgent = 'AutoBlogWP/1.0';

  constructor(clientId: string, clientSecret: string, username: string, password: string) {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.username = username;
    this.password = password;
  }

  /** Obtain OAuth2 access token via password grant (script app) */
  private async getOAuthToken(): Promise<string | null> {
    if (this.accessToken && Date.now() < this.tokenExpiry) return this.accessToken;

    try {
      const { data } = await axios.post(
        'https://www.reddit.com/api/v1/access_token',
        `grant_type=password&username=${encodeURIComponent(this.username)}&password=${encodeURIComponent(this.password)}`,
        {
          auth: { username: this.clientId, password: this.clientSecret },
          headers: { 'User-Agent': this.userAgent, 'Content-Type': 'application/x-www-form-urlencoded' },
          timeout: 10000,
        },
      );
      this.accessToken = data.access_token;
      this.tokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
      logger.debug('Reddit post OAuth token obtained');
      return this.accessToken;
    } catch (error) {
      logger.warn(`Reddit post OAuth failed: ${error instanceof Error ? error.message : error}`);
      return null;
    }
  }

  /** Submit a link post to a subreddit */
  async submitLink(subreddit: string, title: string, url: string): Promise<boolean> {
    const token = await this.getOAuthToken();
    if (!token) return false;

    try {
      const { data } = await axios.post(
        'https://oauth.reddit.com/api/submit',
        new URLSearchParams({
          kind: 'link',
          sr: subreddit,
          title,
          url,
          resubmit: 'true',
          send_replies: 'false',
        }).toString(),
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'User-Agent': this.userAgent,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          timeout: 15000,
        },
      );

      if (data?.success === false || data?.json?.errors?.length > 0) {
        const errors = data?.json?.errors?.map((e: string[]) => e.join(': ')).join(', ') || 'Unknown error';
        logger.warn(`Reddit submit to r/${subreddit} failed: ${errors}`);
        return false;
      }

      const postUrl = data?.json?.data?.url || '';
      logger.info(`Reddit: Posted to r/${subreddit} — ${postUrl}`);
      return true;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      // Rate limit or subreddit restriction — log but don't fail the batch
      if (axios.isAxiosError(error) && error.response?.status === 429) {
        logger.warn(`Reddit rate limited on r/${subreddit}, skipping`);
      } else {
        logger.warn(`Reddit submit to r/${subreddit} failed: ${msg}`);
      }
      return false;
    }
  }

  /** Check account karma and age before posting (prevent shadowban) */
  private async verifyAccountHealth(): Promise<boolean> {
    const token = await this.getOAuthToken();
    if (!token) return false;
    try {
      const { data } = await axios.get('https://oauth.reddit.com/api/v1/me', {
        headers: { Authorization: `Bearer ${token}`, 'User-Agent': this.userAgent },
        timeout: 10000,
      });
      const karma = (data.link_karma || 0) + (data.comment_karma || 0);
      const createdUtc = data.created_utc || 0;
      const accountAgeDays = (Date.now() / 1000 - createdUtc) / 86400;
      if (accountAgeDays < 30) {
        logger.warn(`Reddit: Account too young (${accountAgeDays.toFixed(0)} days) — skipping to avoid shadowban`);
        return false;
      }
      if (karma < 10) {
        logger.warn(`Reddit: Low karma (${karma}) — skipping auto-post to avoid spam filters`);
        return false;
      }
      logger.debug(`Reddit account health: ${karma} karma, ${accountAgeDays.toFixed(0)} days old`);
      return true;
    } catch (error) {
      logger.debug(`Reddit account check failed: ${error instanceof Error ? error.message : error}`);
      return true; // Allow posting on check failure (non-blocking)
    }
  }

  /** Auto-post to relevant subreddits for a given niche category (with UTM tracking) */
  async autoPost(category: string, title: string, url: string): Promise<number> {
    // Verify account health before posting (prevent shadowban on new/low-karma accounts)
    const healthy = await this.verifyAccountHealth();
    if (!healthy) return 0;

    url = buildUtmUrl(url, 'reddit', 'social', extractSlugFromUrl(url));
    const subreddits = NICHE_SUBREDDITS[category];
    if (!subreddits || subreddits.length === 0) {
      logger.debug(`No subreddit mapping for category: ${category}`);
      return 0;
    }

    // Post to first 2 subreddits only (avoid Reddit spam detection)
    let posted = 0;
    for (const sr of subreddits.slice(0, 2)) {
      const success = await this.submitLink(sr, title, url);
      if (success) posted++;
      // 3-second delay between submissions (Reddit rate limiting)
      if (posted < 2) await new Promise(r => setTimeout(r, 3000));
    }
    return posted;
  }

  /** Get subreddits mapped for a category */
  static getSubredditsForCategory(category: string): string[] {
    return NICHE_SUBREDDITS[category] || [];
  }
}
