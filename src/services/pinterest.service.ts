import axios from 'axios';
import { logger } from '../utils/logger.js';
import { buildUtmUrl, extractSlugFromUrl } from '../utils/utm.js';
import type { BlogContent, PublishedPost } from '../types/index.js';

/** Pinterest-eligible categories for auto-pinning */
const PINTEREST_CATEGORIES = new Set([
  '시장분석',
  '업종분석',
  '테마분석',
  '종목분석',
]);

/** Map blog categories to Pinterest board names */
const CATEGORY_BOARD_MAP: Record<string, string> = {
  '시장분석': 'Korean Stock Market Analysis',
  '업종분석': 'Korean Sector & Industry Analysis',
  '테마분석': 'Korean Theme & Trend Investing',
  '종목분석': 'Korean Stock Picks & Quant Strategy',
};

export class PinterestService {
  private accessToken: string;
  private boardIds: Map<string, string> = new Map();

  constructor(accessToken: string) {
    this.accessToken = accessToken;
  }

  /**
   * Check if a category is eligible for Pinterest pinning.
   */
  static isEligible(category: string): boolean {
    return PINTEREST_CATEGORIES.has(category);
  }

  /**
   * Create a pin for a blog post on the appropriate board.
   */
  async pinBlogPost(
    content: BlogContent,
    post: PublishedPost,
    featuredImageUrl: string,
  ): Promise<void> {
    if (!PinterestService.isEligible(content.category)) {
      logger.debug(`Pinterest: Skipping "${content.category}" (not eligible)`);
      return;
    }

    // Image URL is required for Pinterest pins
    if (!featuredImageUrl) {
      logger.warn(`Pinterest: Skipping "${content.title}" — no featured image URL provided (required for pin creation)`);
      return;
    }

    try {
      logger.info(`Pinterest: Creating pin for "${content.title}" (category: ${content.category})`);
      const boardName = CATEGORY_BOARD_MAP[content.category] || content.category;
      const boardId = await this.getOrCreateBoard(boardName);
      if (!boardId) {
        logger.warn(`Pinterest: Could not find/create board "${boardName}"`);
        return;
      }

      // Build Pinterest-optimized description (max 500 chars)
      const description = this.buildPinDescription(content);

      const utmUrl = buildUtmUrl(post.url, 'pinterest', 'social', extractSlugFromUrl(post.url));
      logger.debug(`Pinterest: POST /v5/pins — board=${boardId}, image=${featuredImageUrl.substring(0, 80)}...`);
      await axios.post(
        'https://api.pinterest.com/v5/pins',
        {
          board_id: boardId,
          title: content.title.slice(0, 100),
          description,
          link: utmUrl,
          media_source: {
            source_type: 'image_url',
            url: featuredImageUrl,
          },
          alt_text: `${content.tags[0] || content.title} — ${content.category} guide with expert tips and analysis`.slice(0, 500),
        },
        {
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json',
          },
          timeout: 15000,
        },
      );

      logger.info(`Pinterest: Pinned "${content.title}" to board "${boardName}"`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (axios.isAxiosError(error)) {
        logger.warn(`Pinterest API error: ${error.response?.status} ${JSON.stringify(error.response?.data || msg)}`);
      } else {
        logger.warn(`Pinterest pin failed: ${msg}`);
      }
    }
  }

  /**
   * Build a Pinterest-optimized pin description with keywords and hashtags.
   * Pinterest SEO: first 50 chars are most important, include primary keyword.
   */
  private buildPinDescription(content: BlogContent): string {
    // Extract primary keyword from tags or title
    const primaryKeyword = content.tags[0] || content.title.split(':')[0].trim();

    // Pinterest-optimized structure with niche-aware opening
    const nichePrefix: Record<string, string> = {
      '시장분석': '한국 시장분석 Guide: ',
      '업종분석': '한국 업종분석 Guide: ',
      '테마분석': '한국 테마분석 Guide: ',
      '종목분석': '한국 종목분석 Guide: ',
    };
    const keywordOpening = `${nichePrefix[content.category] || ''}${primaryKeyword} — `;
    const valueExcerpt = content.excerpt.slice(0, 250 - keywordOpening.length);
    const hashtags = this.getCategoryHashtags(content.category);

    // Add niche-aware CTA for Pinterest engagement
    const nicheCta: Record<string, string> = {
      '시장분석': '\n\nSave for later! Tap for full Korean market analysis.',
      '업종분석': '\n\nSave for later! Tap for full Korean sector analysis.',
      '테마분석': '\n\nSave for later! Tap for full Korean theme investing guide.',
      '종목분석': '\n\nSave for later! Tap for the full stock analysis and strategy.',
    };
    const cta = nicheCta[content.category] || '\n\nSave this pin for later! Click through for the full guide.';

    const desc = `${keywordOpening}${valueExcerpt}${cta}\n\n${hashtags.join(' ')}`;
    return desc.slice(0, 500);
  }

  /**
   * Category-specific hashtags for Pinterest discoverability.
   */
  private getCategoryHashtags(category: string): string[] {
    const base = ['#한국주식', '#KoreanStocks', '#KOSPI', '#KOSDAQ'];
    const categoryTags: Record<string, string[]> = {
      '시장분석': ['#시장분석', '#StockMarket', '#KoreanMarket', '#Investing', '#MarketAnalysis'],
      '업종분석': ['#업종분석', '#SectorAnalysis', '#KoreanSectors', '#Samsung', '#SKHynix'],
      '테마분석': ['#테마분석', '#ThemeInvesting', '#KoreanThemes', '#TechStocks', '#Battery'],
      '종목분석': ['#종목분석', '#AlgoTrading', '#QuantTrading', '#StockAnalysis', '#KoreanInvesting'],
    };
    return [...base, ...(categoryTags[category] || [])];
  }

  /**
   * Get or create a Pinterest board by name.
   */
  private async getOrCreateBoard(boardName: string): Promise<string | null> {
    // Check cache first
    if (this.boardIds.has(boardName)) {
      return this.boardIds.get(boardName) || null;
    }

    try {
      // Fetch existing boards
      const { data } = await axios.get('https://api.pinterest.com/v5/boards', {
        headers: { Authorization: `Bearer ${this.accessToken}` },
        params: { page_size: 50 },
        timeout: 10000,
      });

      const boards = data.items as Array<{ id: string; name: string }>;
      const existing = boards.find(
        (b) => b.name.toLowerCase() === boardName.toLowerCase(),
      );

      if (existing) {
        this.boardIds.set(boardName, existing.id);
        return existing.id;
      }

      // Create board if it doesn't exist
      const { data: newBoard } = await axios.post(
        'https://api.pinterest.com/v5/boards',
        {
          name: boardName,
          description: `${boardName} - curated content from TrendHunt`,
          privacy: 'PUBLIC',
        },
        {
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json',
          },
          timeout: 10000,
        },
      );

      const newId = (newBoard as { id: string }).id;
      this.boardIds.set(boardName, newId);
      logger.info(`Pinterest: Created board "${boardName}" (ID: ${newId})`);
      return newId;
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.warn(`Pinterest board lookup failed: ${errMsg}`);
      if (errMsg.includes('401') || errMsg.includes('Unauthorized')) {
        logger.warn('Pinterest: Access token expired. Regenerate at https://developers.pinterest.com/tools/access_token/ and update PINTEREST_ACCESS_TOKEN secret.');
      }
      return null;
    }
  }
}
