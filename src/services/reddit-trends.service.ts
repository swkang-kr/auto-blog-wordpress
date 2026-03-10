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
  'Korean Tech': ['korea', 'samsung', 'technology'],
  'K-Entertainment': ['kpop', 'kdrama', 'korea'],
  'Korean Finance': ['korea', 'investing', 'stocks'],
  'Korean Food': ['KoreanFood', 'korea', 'cooking'],
  'Korea Travel': ['korea', 'travel', 'solotravel'],
  'Korean Language': ['Korean', 'languagelearning'],
  'K-Beauty': ['AsianBeauty', 'SkincareAddiction'],
  'Korean Crypto': ['CryptoCurrency', 'korea'],
  'Korean Automotive': ['electricvehicles', 'cars', 'korea'],
};

/**
 * Reddit trends service — fetches trending posts from Korea-related subreddits
 * as a fallback trend source when Google Trends is unavailable or returns no data.
 */
export class RedditTrendsService {
  private userAgent: string;

  constructor() {
    this.userAgent = 'auto-blog-wordpress/1.0 (Korea-focused blog content research)';
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
            title.includes('seoul') || title.includes('kpop') || title.includes('k-pop') ||
            title.includes('samsung') || title.includes('hyundai') ||
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
    const response = await axios.get(
      `https://www.reddit.com/r/${subreddit}/hot.json`,
      {
        params: { limit: 25, t: 'week' },
        headers: { 'User-Agent': this.userAgent },
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
