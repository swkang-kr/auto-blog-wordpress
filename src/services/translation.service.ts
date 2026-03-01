import Anthropic from '@anthropic-ai/sdk';
import axios from 'axios';
import { logger } from '../utils/logger.js';
import type { BlogContent } from '../types/index.js';

const TRANSLATION_MODEL = 'claude-haiku-4-5-20251001';
const DEEPL_API_URL = 'https://api-free.deepl.com/v2/translate';

const TRANSLATION_SYSTEM = `You are a professional English-to-Korean translator for HTML blog posts.

Rules:
- Translate ALL visible English text content to Korean
- Preserve ALL HTML tags and attributes EXACTLY as-is (including style="S0", style="S1", etc.)
- Preserve all URLs (href/src values) unchanged
- Preserve brand and product names (Claude, ChatGPT, Google, WordPress, Notion, etc.)
- Return ONLY the translated HTML with no extra explanation or markdown fences`;

export class TranslationService {
  private client: Anthropic;
  private deeplApiKey: string | null;
  private deeplQuotaExhausted = false;

  constructor(apiKey: string, deeplApiKey?: string) {
    this.client = new Anthropic({ apiKey });
    this.deeplApiKey = deeplApiKey && deeplApiKey.trim() ? deeplApiKey.trim() : null;
  }

  private get canUseDeepL(): boolean {
    return !!this.deeplApiKey && !this.deeplQuotaExhausted;
  }

  async checkDeepLUsage(): Promise<void> {
    if (!this.deeplApiKey) return;

    try {
      const response = await axios.get<{ character_count: number; character_limit: number }>(
        'https://api-free.deepl.com/v2/usage',
        { headers: { Authorization: `DeepL-Auth-Key ${this.deeplApiKey}` } },
      );
      const { character_count, character_limit } = response.data;
      const remaining = character_limit - character_count;
      const pct = ((character_count / character_limit) * 100).toFixed(1);
      logger.info(
        `DeepL usage: ${character_count.toLocaleString()} / ${character_limit.toLocaleString()} chars used (${pct}%) — ${remaining.toLocaleString()} remaining`,
      );
      if (remaining === 0) {
        this.deeplQuotaExhausted = true;
        logger.warn('DeepL quota already exhausted — will use Claude Haiku');
      }
    } catch (error) {
      logger.warn(`DeepL usage check failed: ${error instanceof Error ? error.message : error}`);
    }
  }

  async translateContent(content: BlogContent): Promise<BlogContent> {
    const provider = this.canUseDeepL ? 'DeepL (Haiku fallback)' : 'Claude Haiku';
    logger.info(`Translating content to Korean via ${provider}...`);

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

  // ── DeepL ────────────────────────────────────────────────────────────────

  /**
   * Returns true when the error is a 456 quota-exceeded response.
   * Sets deeplQuotaExhausted so all subsequent calls skip DeepL.
   */
  private handleDeepLError(error: unknown): boolean {
    if (axios.isAxiosError(error) && error.response?.status === 456) {
      this.deeplQuotaExhausted = true;
      logger.warn('DeepL free quota exhausted — switching to Claude Haiku for remaining translations');
      return true;
    }
    return false;
  }

  private async deeplTranslateHtml(html: string): Promise<string> {
    const response = await axios.post<{ translations: Array<{ text: string }> }>(
      DEEPL_API_URL,
      {
        text: [html],
        source_lang: 'EN',
        target_lang: 'KO',
        tag_handling: 'html',
      },
      {
        headers: {
          Authorization: `DeepL-Auth-Key ${this.deeplApiKey}`,
          'Content-Type': 'application/json',
        },
      },
    );
    return response.data.translations[0].text;
  }

  private async deeplTranslateTexts(texts: string[]): Promise<string[]> {
    const response = await axios.post<{ translations: Array<{ text: string }> }>(
      DEEPL_API_URL,
      {
        text: texts,
        source_lang: 'EN',
        target_lang: 'KO',
      },
      {
        headers: {
          Authorization: `DeepL-Auth-Key ${this.deeplApiKey}`,
          'Content-Type': 'application/json',
        },
      },
    );
    return response.data.translations.map((t) => t.text);
  }

  // ── Haiku helpers (style-compressed) ─────────────────────────────────────

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

  // ── Main translation methods ──────────────────────────────────────────────

  private async translateHtml(html: string): Promise<string> {
    const chunks = this.splitByH2(html);
    logger.debug(`Translating HTML in ${chunks.length} chunks`);

    const translated: string[] = [];

    for (let i = 0; i < chunks.length; i++) {
      // DeepL path
      if (this.canUseDeepL) {
        try {
          const result = await this.deeplTranslateHtml(chunks[i]);
          translated.push(result);
          logger.debug(`Chunk ${i + 1}/${chunks.length} → DeepL`);
          continue;
        } catch (error) {
          const isQuota = this.handleDeepLError(error);
          if (!isQuota) {
            logger.warn(`DeepL chunk ${i + 1} failed, falling back to Haiku: ${error instanceof Error ? error.message : error}`);
          }
          // fall through to Haiku
        }
      }

      // Haiku path
      try {
        const result = await this.translateChunk(chunks[i], i, chunks.length);
        translated.push(result);
        logger.debug(`Chunk ${i + 1}/${chunks.length} → Haiku`);
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
    // DeepL path
    if (this.canUseDeepL) {
      try {
        const texts = [title, excerpt, ...tags];
        const results = await this.deeplTranslateTexts(texts);
        logger.debug('Metadata → DeepL');
        return {
          titleKr: results[0] ?? title,
          excerptKr: results[1] ?? excerpt,
          tagsKr: results.slice(2).length > 0 ? results.slice(2) : tags,
        };
      } catch (error) {
        const isQuota = this.handleDeepLError(error);
        if (!isQuota) {
          logger.warn(`DeepL metadata failed, falling back to Haiku: ${error instanceof Error ? error.message : error}`);
        }
        // fall through to Haiku
      }
    }

    // Haiku path
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
