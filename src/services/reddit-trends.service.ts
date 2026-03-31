import axios from 'axios';
import { logger } from '../utils/logger.js';

interface RedditPost {
  title: string;
  score: number;
  num_comments: number;
  url: string;
  created_utc: number;
}

interface RedditTrend {
  query: string;
  score: number;
  comments: number;
  source: string;
}

/** Subreddits relevant to Korea-focused content */
const KOREA_SUBREDDITS: Record<string, string[]> = {
  '시장분석': ['korea', 'investing', 'stocks', 'worldnews', 'Economics'],
  '업종분석': ['investing', 'stocks', 'StockMarket', 'semiconductors', 'EVs'],
  '테마분석': ['investing', 'stocks', 'SecurityAnalysis', 'theinvestmentclub'],
  '종목분석': ['algotrading', 'quantfinance', 'python', 'learnpython', 'SecurityAnalysis'],
};

/**
 * Reddit trends service — fetches trending posts from Korea-related subreddits
 * as a fallback trend source when Google Trends is unavailable or returns no data.
 * Supports OAuth API (preferred) with fallback to public JSON API.
 */
export class RedditTrendsService {
  private userAgent: string;
  private clientId: string;
  private clientSecret: string;
  private accessToken: string | null = null;
  private tokenExpiry = 0;

  constructor(clientId?: string, clientSecret?: string) {
    this.userAgent = 'auto-blog-wordpress/1.0 (Korea-focused blog content research)';
    this.clientId = clientId || '';
    this.clientSecret = clientSecret || '';
  }

  /** Obtain OAuth2 access token from Reddit (client_credentials flow) */
  private async getOAuthToken(): Promise<string | null> {
    if (!this.clientId || !this.clientSecret) return null;
    if (this.accessToken && Date.now() < this.tokenExpiry) return this.accessToken;

    try {
      const { data } = await axios.post(
        'https://www.reddit.com/api/v1/access_token',
        'grant_type=client_credentials',
        {
          auth: { username: this.clientId, password: this.clientSecret },
          headers: { 'User-Agent': this.userAgent, 'Content-Type': 'application/x-www-form-urlencoded' },
          timeout: 5000,
        },
      );
      this.accessToken = data.access_token;
      this.tokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
      logger.debug('Reddit OAuth token obtained');
      return this.accessToken;
    } catch (error) {
      logger.debug(`Reddit OAuth failed, falling back to public API: ${error instanceof Error ? error.message : error}`);
      return null;
    }
  }

  /**
   * Fetch trending topics from relevant subreddits for a given category.
   * Returns up to 10 trending queries sorted by engagement.
   */
  async fetchTrendingTopics(category: string, broadTerm: string): Promise<RedditTrend[]> {
    const subreddits = KOREA_SUBREDDITS[category] || ['korea'];
    const allTrends: RedditTrend[] = [];

    for (const subreddit of subreddits.slice(0, 2)) { // Max 2 subreddits to avoid rate limits
      try {
        const posts = await this.fetchSubredditHot(subreddit);
        const koreaRelevant = posts.filter(p => {
          const title = p.title.toLowerCase();
          return title.includes('korea') || title.includes('korean') ||
            title.includes('seoul') || title.includes('kospi') || title.includes('kosdaq') ||
            title.includes('samsung') || title.includes('hyundai') || title.includes('sk hynix') ||
            broadTerm.toLowerCase().split(/\s+/).some(w => w.length > 3 && title.includes(w));
        });

        for (const post of koreaRelevant) {
          // Extract a search-worthy query from the post title
          const query = this.extractQuery(post.title);
          if (query && query.split(/\s+/).length >= 3) {
            allTrends.push({
              query,
              score: post.score,
              comments: post.num_comments,
              source: `r/${subreddit}`,
            });
          }
        }

        // Rate limit between subreddit fetches
        await new Promise(r => setTimeout(r, 1500));
      } catch (error) {
        logger.debug(`Reddit fetch failed for r/${subreddit}: ${error instanceof Error ? error.message : error}`);
      }
    }

    // Sort by engagement (score + comments) and deduplicate
    const seen = new Set<string>();
    return allTrends
      .sort((a, b) => (b.score + b.comments * 3) - (a.score + a.comments * 3))
      .filter(t => {
        const key = t.query.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 10);
  }

  private async fetchSubredditHot(subreddit: string): Promise<RedditPost[]> {
    // Prefer OAuth API (higher rate limits, more reliable)
    const token = await this.getOAuthToken();
    const baseUrl = token ? 'https://oauth.reddit.com' : 'https://www.reddit.com';
    const headers: Record<string, string> = { 'User-Agent': this.userAgent };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const response = await axios.get(
      `${baseUrl}/r/${subreddit}/hot.json`,
      {
        params: { limit: 25, t: 'week' },
        headers,
        timeout: 5000,
      },
    );

    const posts = response.data?.data?.children || [];
    return posts.map((child: { data: RedditPost }) => ({
      title: child.data.title,
      score: child.data.score,
      num_comments: child.data.num_comments,
      url: child.data.url,
      created_utc: child.data.created_utc,
    }));
  }

  /**
   * Extract a clean search query from a Reddit post title.
   * Removes meta prefixes, brackets, and normalizes the text.
   */
  private extractQuery(title: string): string {
    return title
      .replace(/\[.*?\]/g, '')           // Remove [tags]
      .replace(/\(.*?\)/g, '')           // Remove (parenthetical)
      .replace(/^(TIL|PSA|ELI5|CMV|AITA|DAE)\s*:?\s*/i, '') // Remove Reddit prefixes
      .replace(/\?+$/, '')              // Remove trailing question marks
      .replace(/[^\w\s'-]/g, ' ')       // Remove special chars
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 80);                    // Limit length
  }
}
