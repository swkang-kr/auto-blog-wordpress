import { TwitterApi } from 'twitter-api-v2';
import { logger } from '../utils/logger.js';
import { buildUtmUrl, extractSlugFromUrl } from '../utils/utm.js';
import type { BlogContent, PublishedPost } from '../types/index.js';

export class TwitterService {
  private client: TwitterApi;

  constructor(apiKey: string, apiSecret: string, accessToken: string, accessSecret: string) {
    this.client = new TwitterApi({
      appKey: apiKey,
      appSecret: apiSecret,
      accessToken: accessToken,
      accessSecret: accessSecret,
    });
  }

  /** Promote blog post as a 5-tweet thread (hook → insights → CTA) */
  async promoteBlogPost(content: BlogContent, post: PublishedPost): Promise<void> {
    const utmUrl = buildUtmUrl(post.url, 'twitter', 'social', extractSlugFromUrl(post.url));
    const thread = this.buildThread(content, utmUrl);

    try {
      // Post first tweet
      const first = await this.client.v2.tweet(thread[0]);
      let lastId = first.data.id;
      logger.info(`X thread started (id: ${lastId}): "${content.title}"`);

      // Reply chain for remaining tweets
      for (let i = 1; i < thread.length; i++) {
        try {
          const reply = await this.client.v2.tweet({
            text: thread[i],
            reply: { in_reply_to_tweet_id: lastId },
          });
          lastId = reply.data.id;
        } catch (replyError) {
          logger.warn(`X thread tweet ${i + 1}/${thread.length} failed: ${replyError instanceof Error ? replyError.message : replyError}`);
          break; // Stop chain on failure to avoid orphaned tweets
        }
      }
      logger.info(`X thread completed: ${thread.length} tweets for "${content.title}"`);
    } catch (error) {
      logger.warn(`X thread failed (non-critical): ${error instanceof Error ? error.message : error}`);
    }
  }

  /**
   * Build a 5-tweet thread from blog content.
   * [0]: Hook — provocative question or key stat + keyword
   * [1-3]: Core insights extracted from FAQ or excerpt
   * [4]: CTA + URL + hashtags
   */
  buildThread(content: BlogContent, url: string): string[] {
    const hashtags = this.buildHashtags(content.tags, content.category);

    // Extract insights from FAQ items or excerpt sentences
    const insights = this.extractInsights(content);

    // [0] Hook tweet: key question or stat to grab attention
    const hookStat = this.extractHookStat(content);
    const hook = this.truncateTweet(
      `${hookStat}\n\nA thread on ${content.title} 🧵👇`,
    );

    // [1-3] Insight tweets
    const insightTweets = insights.slice(0, 3).map((insight, i) => {
      const num = i + 2;
      return this.truncateTweet(`${num}/ ${insight}`);
    });

    // Pad to 3 insights if we don't have enough
    while (insightTweets.length < 3) {
      const sentences = content.excerpt.split(/[.!?]+/).filter(s => s.trim().length > 20);
      const sentence = sentences[insightTweets.length] || sentences[0] || content.excerpt;
      insightTweets.push(this.truncateTweet(`${insightTweets.length + 2}/ ${sentence.trim()}.`));
    }

    // [4] CTA tweet
    const cta = this.truncateTweet(
      `5/ Read the full breakdown:\n\n${url}\n\n${hashtags}`,
    );

    return [hook, ...insightTweets, cta];
  }

  /** Extract key insights from FAQ items or content excerpt */
  private extractInsights(content: BlogContent): string[] {
    const insights: string[] = [];

    // Try FAQ items first (structured, high-quality insights)
    if (content.faqItems && content.faqItems.length > 0) {
      for (const faq of content.faqItems.slice(0, 4)) {
        // Use the answer, trimmed to a tweet-friendly length
        const answer = faq.answer.replace(/<[^>]+>/g, '').trim();
        const firstSentence = answer.split(/[.!?]+/)[0]?.trim();
        if (firstSentence && firstSentence.length > 20) {
          insights.push(`${faq.question}\n\n${firstSentence}.`);
        }
      }
    }

    // Fall back to excerpt sentences
    if (insights.length < 3) {
      const sentences = content.excerpt
        .split(/[.!?]+/)
        .map(s => s.trim())
        .filter(s => s.length > 25 && s.length < 250);
      for (const sentence of sentences) {
        if (insights.length >= 3) break;
        insights.push(`${sentence}.`);
      }
    }

    return insights;
  }

  /** Extract a hook stat or question from content */
  private extractHookStat(content: BlogContent): string {
    // Try to find a compelling number/stat in the excerpt
    const statMatch = content.excerpt.match(/\d[\d,.]*\s*(%|billion|million|trillion|won|USD)/i);
    if (statMatch) {
      const sentence = content.excerpt.split(/[.!?]+/).find(s => s.includes(statMatch[0]));
      if (sentence && sentence.trim().length > 15) {
        return sentence.trim() + '.';
      }
    }

    // Fall back to a question format using the title
    return `Did you know? ${content.excerpt.split('.')[0].trim()}.`;
  }

  /** Build category-aware hashtags for better discoverability */
  private buildHashtags(tags: string[], category: string): string {
    const categoryHashtags: Record<string, string[]> = {
      'Korean Tech': ['#KoreanTech', '#AI', '#Samsung'],
      'Korean Finance': ['#KOSPI', '#KoreanStocks', '#Investing'],
      'K-Beauty': ['#KBeauty', '#Skincare', '#KoreanBeauty'],
      'Korea Travel': ['#KoreaTravel', '#Seoul', '#VisitKorea'],
      'K-Entertainment': ['#KPop', '#KDrama', '#Hallyu'],
    };
    const catTags = categoryHashtags[category] || [];
    const contentTags = tags.slice(0, 2).map((t) => `#${t.replace(/\s+/g, '')}`);
    // Merge: 1-2 content tags + 1-2 category tags, deduplicated
    const all = [...new Set([...contentTags, ...catTags])].slice(0, 4);
    return all.join(' ');
  }

  /** Truncate tweet to 280 characters */
  private truncateTweet(text: string): string {
    return text.length <= 280 ? text : text.substring(0, 277) + '...';
  }
}
