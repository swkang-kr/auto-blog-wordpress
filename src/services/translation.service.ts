import * as deepl from 'deepl-node';
import { logger } from '../utils/logger.js';
import type { BlogContent } from '../types/index.js';

export class TranslationService {
  private translator: deepl.Translator;

  constructor(apiKey: string) {
    this.translator = new deepl.Translator(apiKey);
  }

  /**
   * Translate English BlogContent fields to Korean using DeepL.
   * Mutates and returns the same content object with KR fields populated.
   * On failure, EN content is used as fallback (graceful).
   */
  async translateContent(content: BlogContent): Promise<BlogContent> {
    logger.info('Translating content to Korean via DeepL...');

    // Translate HTML (preserving tags/styles)
    try {
      const htmlResult = await this.translator.translateText(
        content.html,
        'en',
        'ko',
        { tagHandling: 'html' },
      );
      content.htmlKr = htmlResult.text;
    } catch (error) {
      logger.warn(`DeepL HTML translation failed, using EN fallback: ${error instanceof Error ? error.message : error}`);
      content.htmlKr = content.html;
    }

    // Translate title
    try {
      const titleResult = await this.translator.translateText(content.title, 'en', 'ko');
      content.titleKr = titleResult.text;
    } catch {
      content.titleKr = content.title;
    }

    // Translate excerpt
    try {
      const excerptResult = await this.translator.translateText(content.excerpt, 'en', 'ko');
      content.excerptKr = excerptResult.text;
    } catch {
      content.excerptKr = content.excerpt;
    }

    // Translate tags
    try {
      const tagResults = await this.translator.translateText(content.tags, 'en', 'ko');
      content.tagsKr = tagResults.map((r) => r.text);
    } catch {
      content.tagsKr = content.tags;
    }

    logger.info(`Translation complete: title="${content.titleKr}"`);
    return content;
  }
}
