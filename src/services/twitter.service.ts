import { TwitterApi } from 'twitter-api-v2';
import { logger } from '../utils/logger.js';
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

  /** 블로그 포스트 기반 홍보 트윗 발행 (실패해도 전체 파이프라인에 영향 없음) */
  async promoteBlogPost(content: BlogContent, post: PublishedPost): Promise<void> {
    const tweet = this.buildTweet(content, post.url);

    try {
      const result = await this.client.v2.tweet(tweet);
      logger.info(`X tweet posted (id: ${result.data.id}): "${content.title}"`);
    } catch (error) {
      logger.warn(`X tweet failed (non-critical): ${error instanceof Error ? error.message : error}`);
    }
  }

  private buildTweet(content: BlogContent, url: string): string {
    // 해시태그: 공백 제거 후 최대 3개
    const hashtags = content.tags
      .slice(0, 3)
      .map((tag) => `#${tag.replace(/\s+/g, '')}`)
      .join(' ');

    // excerpt 첫 문장을 요약으로 사용
    const summary = content.excerpt.split('.')[0].trim();

    const body = `${content.title}\n\n${summary}.\n\n${url}\n\n${hashtags}`;

    // 트위터 280자 제한
    return body.length <= 280 ? body : `${body.substring(0, 277)}...`;
  }
}
