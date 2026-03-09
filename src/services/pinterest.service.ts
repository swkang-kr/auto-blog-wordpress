import axios from 'axios';
import { logger } from '../utils/logger.js';
import type { BlogContent, PublishedPost } from '../types/index.js';

/** Pinterest-eligible categories for auto-pinning */
const PINTEREST_CATEGORIES = new Set([
  'Korea Travel',
  'Korean Food',
  'K-Beauty',
  'K-Entertainment',
  'Korean Language',
  'Korean Automotive',
]);

/** Map blog categories to Pinterest board names */
const CATEGORY_BOARD_MAP: Record<string, string> = {
  'Korea Travel': 'Korea Travel Tips',
  'Korean Food': 'Korean Recipes & Food',
  'K-Beauty': 'K-Beauty & Skincare',
  'K-Entertainment': 'K-Pop & K-Drama',
  'Korean Language': 'Learn Korean',
  'Korean Automotive': 'Korean Cars & EVs',
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

    try {
      const boardName = CATEGORY_BOARD_MAP[content.category] || content.category;
      const boardId = await this.getOrCreateBoard(boardName);
      if (!boardId) {
        logger.warn(`Pinterest: Could not find/create board "${boardName}"`);
        return;
      }

      // Build Pinterest-optimized description (max 500 chars)
      const description = this.buildPinDescription(content);

      await axios.post(
        'https://api.pinterest.com/v5/pins',
        {
          board_id: boardId,
          title: content.title.slice(0, 100),
          description,
          link: post.url,
          media_source: {
            source_type: 'image_url',
            url: featuredImageUrl,
          },
          alt_text: `${content.title} - ${content.category}`,
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
   * Build a Pinterest-optimized pin description with hashtags.
   */
  private buildPinDescription(content: BlogContent): string {
    const excerpt = content.excerpt.slice(0, 300);
    const hashtags = this.getCategoryHashtags(content.category);
    const desc = `${excerpt}\n\n${hashtags.join(' ')}`;
    return desc.slice(0, 500);
  }

  /**
   * Category-specific hashtags for Pinterest discoverability.
   */
  private getCategoryHashtags(category: string): string[] {
    const base = ['#Korea', '#SouthKorea'];
    const categoryTags: Record<string, string[]> = {
      'Korea Travel': ['#KoreaTravel', '#Seoul', '#TravelKorea', '#VisitKorea', '#KoreanTravel'],
      'Korean Food': ['#KoreanFood', '#KoreanRecipe', '#KoreanCooking', '#Kimchi', '#KFood'],
      'K-Beauty': ['#KBeauty', '#KoreanSkincare', '#Skincare', '#KoreanBeauty', '#GlassSkin'],
      'K-Entertainment': ['#KPop', '#KDrama', '#Hallyu', '#KoreanDrama', '#KPopBusiness'],
      'Korean Language': ['#LearnKorean', '#Korean', '#Hangul', '#TOPIK', '#KoreanLanguage'],
      'Korean Automotive': ['#KoreanCars', '#Hyundai', '#Kia', '#ElectricVehicle', '#KoreanEV'],
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
      logger.warn(`Pinterest board lookup failed: ${error instanceof Error ? error.message : error}`);
      return null;
    }
  }
}
