import Anthropic from '@anthropic-ai/sdk';
import { logger } from '../utils/logger.js';
import type { BlogContent } from '../types/index.js';

const TRANSLATION_MODEL = 'claude-haiku-4-5-20251001';

const TRANSLATION_SYSTEM = `You are a professional English-to-Korean translator for HTML blog posts.

Rules:
- Translate ALL visible English text content to Korean
- Preserve ALL HTML tags and attributes EXACTLY as-is (including style="S0", style="S1", etc.)
- Preserve all URLs (href/src values) unchanged
- Preserve brand and product names (Claude, ChatGPT, Google, WordPress, Notion, etc.)
- Return ONLY the translated HTML with no extra explanation or markdown fences`;

export class TranslationService {
  private client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async translateContent(content: BlogContent): Promise<BlogContent> {
    logger.info('Translating content to Korean via Claude Haiku...');

    try {
      content.htmlKr = await this.translateHtml(content.html);
    } catch (error) {
      logger.warn(`HTML translation failed, using EN fallback: ${error instanceof Error ? error.message : error}`);
      content.htmlKr = content.html;
    }

    try {
      const { titleKr, excerptKr, tagsKr } = await this.translateMetadata(
        content.title,
        content.excerpt,
        content.tags,
      );
      content.titleKr = titleKr;
      content.excerptKr = excerptKr;
      content.tagsKr = tagsKr;
    } catch (error) {
      logger.warn(`Metadata translation failed, using EN fallback: ${error instanceof Error ? error.message : error}`);
      content.titleKr = content.title;
      content.excerptKr = content.excerpt;
      content.tagsKr = content.tags;
    }

    logger.info(`Translation complete: title="${content.titleKr}"`);
    return content;
  }

  /**
   * Split HTML into chunks at <h2 boundaries.
   * Each chunk is small enough to fit within Haiku's 8K output token limit.
   */
  private splitByH2(html: string): string[] {
    const chunks = html.split(/(?=<h2[\s>])/i);
    return chunks.filter(chunk => chunk.trim().length > 0);
  }

  /**
   * Replace inline style values with short index placeholders to reduce token count.
   * Deduplicates identical style values so repeated patterns share the same index.
   * e.g. style="margin:0 0 20px 0; color:#333; ..." → style="S0"
   */
  private compressStyles(html: string): { compressed: string; styleValues: string[] } {
    const valueToIdx = new Map<string, number>();
    const styleValues: string[] = [];

    const compressed = html.replace(/ style="([^"]*)"/g, (_match, val: string) => {
      if (!valueToIdx.has(val)) {
        valueToIdx.set(val, styleValues.length);
        styleValues.push(val);
      }
      return ` style="S${valueToIdx.get(val)}"`;
    });

    return { compressed, styleValues };
  }

  /** Restore original style values from index placeholders. */
  private restoreStyles(html: string, styleValues: string[]): string {
    return html.replace(/ style="S(\d+)"/g, (_match, idx) => {
      const value = styleValues[parseInt(idx, 10)];
      return value !== undefined ? ` style="${value}"` : _match;
    });
  }

  /**
   * Translate a single HTML chunk via Haiku.
   * Returns the original chunk on failure (EN fallback).
   */
  private async translateChunk(chunk: string, chunkIdx: number, total: number): Promise<string> {
    const { compressed, styleValues } = this.compressStyles(chunk);

    const response = await this.client.messages.create({
      model: TRANSLATION_MODEL,
      max_tokens: 8192,
      system: TRANSLATION_SYSTEM,
      messages: [
        { role: 'user', content: `Translate this HTML to Korean:\n\n${compressed}` },
      ],
    });

    if (response.stop_reason === 'max_tokens') {
      logger.warn(`Chunk ${chunkIdx + 1}/${total} hit token limit, using EN for this chunk`);
      return chunk;
    }

    let translated = response.content[0].type === 'text' ? response.content[0].text.trim() : compressed;
    // Strip markdown code fences Haiku occasionally wraps around HTML
    translated = translated.replace(/^```(?:html)?\s*/i, '').replace(/\s*```$/g, '').trim();
    return this.restoreStyles(translated, styleValues);
  }

  private async translateHtml(html: string): Promise<string> {
    const chunks = this.splitByH2(html);
    logger.debug(`Translating HTML in ${chunks.length} chunks (style-compressed)`);

    const translated: string[] = [];
    for (let i = 0; i < chunks.length; i++) {
      try {
        const result = await this.translateChunk(chunks[i], i, chunks.length);
        translated.push(result);
      } catch (error) {
        logger.warn(`Chunk ${i + 1}/${chunks.length} failed, using EN: ${error instanceof Error ? error.message : error}`);
        translated.push(chunks[i]);
      }
    }

    return translated.join('');
  }

  private async translateMetadata(
    title: string,
    excerpt: string,
    tags: string[],
  ): Promise<{ titleKr: string; excerptKr: string; tagsKr: string[] }> {
    const response = await this.client.messages.create({
      model: TRANSLATION_MODEL,
      max_tokens: 512,
      messages: [
        {
          role: 'user',
          content: `Translate to Korean. Respond with JSON only, no markdown.
{"title":"${title}","excerpt":"${excerpt}","tags":${JSON.stringify(tags)}}`,
        },
      ],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '';
    const cleaned = text.replace(/```(?:json)?\s*/g, '').replace(/```\s*$/g, '').trim();

    try {
      const parsed = JSON.parse(cleaned) as { title?: string; excerpt?: string; tags?: string[] };
      return {
        titleKr: typeof parsed.title === 'string' ? parsed.title : title,
        excerptKr: typeof parsed.excerpt === 'string' ? parsed.excerpt : excerpt,
        tagsKr: Array.isArray(parsed.tags) ? parsed.tags : tags,
      };
    } catch {
      return { titleKr: title, excerptKr: excerpt, tagsKr: tags };
    }
  }
}
