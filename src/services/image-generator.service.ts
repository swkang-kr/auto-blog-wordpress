import { GoogleGenerativeAI } from '@google/generative-ai';
import sharp from 'sharp';
import { logger } from '../utils/logger.js';
import { ImageGenerationError } from '../types/errors.js';
import { costTracker } from '../utils/cost-tracker.js';
import { circuitBreakers } from '../utils/retry.js';
import type { ImageResult } from '../types/index.js';

const TARGET_MAX_KB = 200;
const TARGET_MIN_KB = 100;

/** Fallback image models in priority order */
const GEMINI_MODELS = [
  'gemini-2.5-flash-image',
  'gemini-2.0-flash-exp',
  'imagen-3.0-generate-002',
] as const;

export class ImageGeneratorService {
  private client: GoogleGenerativeAI;
  private imageFormat: 'webp' | 'avif';
  /** Track which model index to use (auto-advances on failure) */
  private activeModelIndex = 0;

  constructor(apiKey: string, imageFormat: 'webp' | 'avif' = 'webp') {
    this.client = new GoogleGenerativeAI(apiKey);
    this.imageFormat = imageFormat;
  }

  /**
   * Get the current Gemini model, with automatic fallback to next model on deprecation/failure.
   */
  private getImageModel() {
    const modelName = GEMINI_MODELS[this.activeModelIndex] || GEMINI_MODELS[0];
    return this.client.getGenerativeModel({
      model: modelName,
      generationConfig: {
        responseModalities: ['IMAGE', 'TEXT'] as unknown as undefined,
      } as Record<string, unknown>,
    });
  }

  /**
   * Advance to the next fallback model after a model-level failure (deprecation, 404, etc.)
   */
  private advanceModel(): boolean {
    if (this.activeModelIndex < GEMINI_MODELS.length - 1) {
      this.activeModelIndex++;
      logger.warn(`Image model fallback: switching to ${GEMINI_MODELS[this.activeModelIndex]}`);
      return true;
    }
    return false;
  }

  /** Common stop words to remove from SEO filenames */
  private static readonly FILENAME_STOP_WORDS = new Set([
    'a', 'an', 'the', 'in', 'on', 'at', 'to', 'for', 'of', 'and', 'or', 'is', 'are',
    'was', 'were', 'be', 'been', 'with', 'from', 'by', 'as', 'it', 'its', 'this', 'that',
    'how', 'what', 'why', 'your', 'you', 'our', 'my', 'can', 'do', 'does', 'will',
  ]);

  /**
   * Generate an SEO-optimized filename from keyword.
   * Removes stop words and limits to 8 meaningful words for better image search ranking.
   * e.g. "how to invest in Korean stocks as a foreigner" → "invest-korean-stocks-foreigner-featured-2026.webp"
   */
  static buildFilename(keyword: string, suffix: string, format: 'webp' | 'avif' = 'webp'): string {
    const year = new Date().getFullYear();
    const words = keyword
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 0 && !ImageGeneratorService.FILENAME_STOP_WORDS.has(w));
    const slug = words.slice(0, 8).join('-');
    return `${slug}-${suffix}-${year}.${format}`;
  }

  /**
   * Convert image buffer to WebP format, compressed to 100-200KB.
   */
  private async toWebP(buffer: Buffer): Promise<Buffer> {
    const originalKB = buffer.length / 1024;

    // Start with quality 80 and adjust
    let quality = 80;
    let result = await sharp(buffer).webp({ quality }).toBuffer();
    let resultKB = result.length / 1024;

    // If too large, reduce quality
    while (resultKB > TARGET_MAX_KB && quality > 20) {
      quality -= 10;
      result = await sharp(buffer).webp({ quality }).toBuffer();
      resultKB = result.length / 1024;
    }

    // If still too large, resize down
    if (resultKB > TARGET_MAX_KB) {
      const meta = await sharp(buffer).metadata();
      const scale = Math.sqrt(TARGET_MAX_KB / resultKB);
      const newWidth = Math.round((meta.width || 1200) * scale);
      result = await sharp(buffer).resize(newWidth).webp({ quality: 75 }).toBuffer();
      resultKB = result.length / 1024;
    }

    logger.debug(`WebP conversion: ${originalKB.toFixed(0)}KB → ${resultKB.toFixed(0)}KB (quality: ${quality})`);
    return result;
  }

  /**
   * Convert image buffer to AVIF format, compressed to 100-200KB.
   */
  private async toAvif(buffer: Buffer): Promise<Buffer> {
    const originalKB = buffer.length / 1024;

    let quality = 70;
    let result = await sharp(buffer).avif({ quality }).toBuffer();
    let resultKB = result.length / 1024;

    while (resultKB > TARGET_MAX_KB && quality > 20) {
      quality -= 10;
      result = await sharp(buffer).avif({ quality }).toBuffer();
      resultKB = result.length / 1024;
    }

    if (resultKB > TARGET_MAX_KB) {
      const meta = await sharp(buffer).metadata();
      const scale = Math.sqrt(TARGET_MAX_KB / resultKB);
      const newWidth = Math.round((meta.width || 1200) * scale);
      result = await sharp(buffer).resize(newWidth).avif({ quality: 60 }).toBuffer();
      resultKB = result.length / 1024;
    }

    logger.debug(`AVIF conversion: ${originalKB.toFixed(0)}KB → ${resultKB.toFixed(0)}KB (quality: ${quality})`);
    return result;
  }

  /** Convert buffer to the configured image format */
  private async convertImage(buffer: Buffer): Promise<Buffer> {
    return this.imageFormat === 'avif' ? this.toAvif(buffer) : this.toWebP(buffer);
  }

  private async generateSingleImage(
    model: ReturnType<GoogleGenerativeAI['getGenerativeModel']>,
    prompt: string,
    index: number,
    existingResults: Buffer[],
  ): Promise<Buffer | null> {
    // Detect niche from prompt content for category-appropriate styling
    const promptLower = prompt.toLowerCase();
    const isKBeauty = /skincare|k-beauty|serum|moisturizer|sunscreen|toner|cleanser|glass skin|olive young/i.test(promptLower);
    const isKEntertainment = /k-pop|idol|k-drama|concert|comeback|fandom|lightstick/i.test(promptLower);

    // K-Beauty sub-category differentiation for richer visual variety
    const isKBeautyMakeup = isKBeauty && /makeup|foundation|cushion|lip\s*tint|blush|eyeshadow|mascara|eyeliner|rom.nd|clio|fwee|hince/i.test(promptLower);
    const isKBeautyHairCare = isKBeauty && /hair|shampoo|scalp|daeng gi|ryo|masil/i.test(promptLower);
    const isKBeautyHanbang = isKBeauty && /sulwhasoo|whoo|hanbang|hanyul|ginseng|herbal|luxury\s*korean|premium\s*korean/i.test(promptLower);
    const isKBeautyTools = isKBeauty && /led\s*mask|gua\s*sha|ice\s*roller|microcurrent|device|tool|facial\s*massage|cellreturn/i.test(promptLower);
    const isKBeautyBodyCare = isKBeauty && /body\s*(?:care|lotion|cream|scrub|exfoli)|italy\s*towel|glass\s*body|spf\s*body/i.test(promptLower);
    const isKBeautyTonerPad = isKBeauty && /toner\s*pad|sun\s*pad|exfoliat.*pad|선패드/i.test(promptLower);
    const isKBeautyAmpoule = isKBeauty && /ampoule|앰플|concentrated\s*(?:serum|essence)/i.test(promptLower);
    const isKBeautyTexture = isKBeauty && /texture|발림성|swatch|consistency|application/i.test(promptLower);

    const nicheSuffix = isKBeautyTools
      ? ', Korean beauty device product photography, clean clinical aesthetic, soft white background, LED glow effect, modern bathroom counter, sleek technology meets skincare, minimalist composition'
      : isKBeautyBodyCare
        ? ', Korean body care editorial, bright bathroom setting, glass body aesthetic, body products flat lay, soft natural lighting, spa-like atmosphere, luxurious texture display'
        : isKBeautyTonerPad
          ? ', Korean toner pad close-up product photography, cotton round pad texture visible, clean glass jar packaging, soft pink and white tones, hydrating dewy aesthetic, minimal clean background'
          : isKBeautyAmpoule
            ? ', Korean ampoule product photography, small glass dropper bottle close-up, golden serum droplet on dropper tip, clean minimal background, concentrated formula aesthetic, luxury skincare editorial, warm amber lighting'
            : isKBeautyTexture
              ? ', Korean skincare texture swatch photography, product spread on glass surface, creamy gel texture close-up, dewy translucent consistency, finger swatch application, clean white marble background, macro lens detail'
              : isKBeautyHanbang
      ? ', luxurious Korean Hanbang aesthetic, gold and deep burgundy accents, traditional Korean motifs, ornate packaging, dark wood vanity, warm ambient lighting, premium editorial beauty photography'
      : isKBeautyMakeup
        ? ', K-beauty makeup flat lay, vibrant coral and pink tones, mirror reflections, beauty editorial style, bright studio lighting, clean modern vanity, texture swatches visible'
        : isKBeautyHairCare
          ? ', Korean hair care editorial, sleek flowing hair texture, salon-quality lighting, minimalist bathroom setting, amber and warm tones, scalp care products arranged neatly'
          : isKBeauty
            ? ', soft pastel aesthetic, Korean beauty product photography, clean white or cream background, glass bottles, subtle gradient lighting, editorial K-beauty style, dewy skin texture'
            : isKEntertainment
              ? ', K-pop aesthetic, vibrant stage lighting, bold graphic design, dynamic composition, Seoul urban style'
              : '';

    const styleSuffix = index === 0
      ? `, digital illustration, wide composition for blog hero banner, vivid colors, high detail, 16:9 aspect ratio, professional editorial quality, absolutely no text, no letters, no words, no Korean characters, no watermark, no captions, text-free image only${nicheSuffix}`
      : `, digital illustration, clean composition, bright natural lighting, detailed and sharp, editorial blog style, absolutely no text, no letters, no words, no Korean characters, no watermark, no captions, text-free image only, 16:9 aspect ratio${nicheSuffix}`;

    const fullPrompt = prompt + styleSuffix;

    // Circuit breaker: skip if Gemini API is consistently failing
    if (circuitBreakers.gemini.isOpen()) {
      logger.warn(`Image ${index + 1}: Gemini circuit breaker OPEN, skipping`);
      return null;
    }

    const MAX_RETRIES = 3;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        logger.debug(`Generating image ${index + 1} (attempt ${attempt}/${MAX_RETRIES}): "${fullPrompt.substring(0, 80)}..."`);
        const response = await model.generateContent(fullPrompt);
        const parts = response.response.candidates?.[0]?.content?.parts ?? [];

        let imageBuffer: Buffer | null = null;
        for (const part of parts) {
          const inlineData = (part as unknown as Record<string, unknown>).inlineData as
            | { data: string; mimeType: string }
            | undefined;
          if (inlineData?.data) {
            imageBuffer = Buffer.from(inlineData.data, 'base64');
            break;
          }
        }

        if (imageBuffer) {
          const isDuplicate = existingResults.some((prev) =>
            prev.length === imageBuffer!.length && prev.compare(imageBuffer!) === 0
          );
          if (isDuplicate) {
            logger.warn(`Image ${index + 1} is duplicate of a previous image, skipping`);
            return null;
          }

          // Image quality validation: check minimum resolution and file size
          const qualityCheck = await this.validateImageQuality(imageBuffer, index);
          if (!qualityCheck.valid) {
            logger.warn(`Image ${index + 1} quality check failed: ${qualityCheck.reason}`);
            if (attempt < MAX_RETRIES) {
              const delay = Math.pow(2, attempt) * 1000;
              logger.debug(`Retrying image ${index + 1} in ${delay / 1000}s due to quality issue...`);
              await new Promise(r => setTimeout(r, delay));
              continue;
            }
            return null;
          }

          costTracker.addImageCall(1);
          circuitBreakers.gemini.recordSuccess();
          const compressedBuffer = await this.convertImage(imageBuffer);
          logger.info(`Image ${index + 1} generated & compressed to ${this.imageFormat.toUpperCase()} (${(compressedBuffer.length / 1024).toFixed(0)}KB)`);
          return compressedBuffer;
        } else {
          logger.warn(`Image ${index + 1} generation returned no image data`);
          if (attempt < MAX_RETRIES) {
            const delay = Math.pow(2, attempt) * 1000; // 2s, 4s
            logger.debug(`Retrying image ${index + 1} in ${delay / 1000}s...`);
            await new Promise(r => setTimeout(r, delay));
            continue;
          }
          return null;
        }
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        const isRateLimit = detail.includes('429') || detail.includes('rate') || detail.includes('quota');
        if (attempt < MAX_RETRIES && isRateLimit) {
          const delay = Math.pow(2, attempt) * 2000; // 4s, 8s for rate limits
          logger.warn(`Image ${index + 1} rate limited, retrying in ${delay / 1000}s...`);
          await new Promise(r => setTimeout(r, delay));
          continue;
        }
        circuitBreakers.gemini.recordFailure();
        logger.warn(new ImageGenerationError(`Image ${index + 1} generation failed: ${detail}`, error).message);
        return null;
      }
    }
    return null;
  }

  /**
   * Generate an OG image (1200x630) with title text and category label.
   * Uses SVG-to-WebP conversion for consistent quality.
   */
  async generateOgImage(title: string, category: string): Promise<Buffer> {
    const gradients: Record<string, [string, string]> = {
      'Korean Tech': ['#1a1a2e', '#16213e'],
      'K-Entertainment': ['#2d1b69', '#6b21a8'],
      'K-Beauty': ['#831843', '#ec4899'],
      'Korean Finance': ['#0c4a6e', '#0369a1'],
      'Korean Food': ['#7c2d12', '#c2410c'],
      'Korea Travel': ['#14532d', '#15803d'],
      'Korean Language': ['#4a1d96', '#7c3aed'],
    };
    const [c1, c2] = gradients[category] || ['#0052CC', '#0066FF'];

    // Truncate and escape title for SVG
    // Strip non-ASCII characters (e.g. Korean/CJK glyphs) that cause rendering artifacts
    // when system fonts lack the required Unicode block — titles should always be English
    const asciiTitle = title.replace(/[^\x00-\x7F]/g, '').trim();
    const safeTitle = asciiTitle.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const truncTitle = safeTitle.length > 60 ? safeTitle.substring(0, 57) + '...' : safeTitle;
    const safeCategory = category.replace(/&/g, '&amp;');

    // Split long titles into two lines
    const words = truncTitle.split(' ');
    let line1 = '';
    let line2 = '';
    for (const word of words) {
      if (line1.length + word.length < 35 || line2.length === 0 && line1.length === 0) {
        line1 += (line1 ? ' ' : '') + word;
      } else {
        line2 += (line2 ? ' ' : '') + word;
      }
    }

    // Category-specific decorative SVG elements for visual differentiation
    const categoryDecorations: Record<string, string> = {
      'Korean Tech': `<circle cx="150" cy="120" r="60" fill="rgba(255,255,255,0.06)"/><circle cx="1050" cy="510" r="80" fill="rgba(255,255,255,0.05)"/><rect x="80" y="60" width="3" height="40" rx="1" fill="rgba(255,255,255,0.15)"/><rect x="95" y="50" width="3" height="50" rx="1" fill="rgba(255,255,255,0.1)"/><rect x="110" y="65" width="3" height="35" rx="1" fill="rgba(255,255,255,0.12)"/>`,
      'K-Entertainment': `<circle cx="120" cy="100" r="50" fill="rgba(255,255,255,0.05)"/><circle cx="180" cy="130" r="30" fill="rgba(255,255,255,0.04)"/><circle cx="1080" cy="520" r="45" fill="rgba(255,255,255,0.05)"/><path d="M1030 80 L1050 50 L1070 80 Z" fill="rgba(255,255,255,0.08)"/>`,
      'Korean Finance': `<polyline points="80,140 200,100 320,120 440,80 560,90" fill="none" stroke="rgba(255,255,255,0.1)" stroke-width="2"/><circle cx="80" cy="140" r="4" fill="rgba(255,255,255,0.15)"/><circle cx="200" cy="100" r="4" fill="rgba(255,255,255,0.15)"/><circle cx="320" cy="120" r="4" fill="rgba(255,255,255,0.15)"/><circle cx="440" cy="80" r="4" fill="rgba(255,255,255,0.15)"/>`,
      'Korean Food': `<circle cx="130" cy="110" r="45" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="2"/><circle cx="130" cy="110" r="25" fill="rgba(255,255,255,0.04)"/><circle cx="1070" cy="530" r="35" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="2"/>`,
      'Korea Travel': `<path d="M80 140 Q200 60 320 140 Q440 60 560 140" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="2"/><circle cx="1050" cy="100" r="40" fill="rgba(255,255,255,0.05)"/>`,
      'Korean Language': `<text x="100" y="120" fill="rgba(255,255,255,0.06)" font-family="sans-serif" font-size="60">&#xD55C;</text><text x="1040" y="560" fill="rgba(255,255,255,0.06)" font-family="sans-serif" font-size="50">&#xAE00;</text>`,
      'K-Beauty': `<circle cx="130" cy="110" r="40" fill="rgba(255,255,255,0.06)"/><circle cx="160" cy="130" r="20" fill="rgba(255,255,255,0.04)"/><ellipse cx="1060" cy="520" rx="50" ry="30" fill="rgba(255,255,255,0.05)"/><circle cx="100" cy="80" r="8" fill="rgba(255,255,255,0.1)"/>`,
    };
    const decoration = categoryDecorations[category] || `<circle cx="150" cy="120" r="60" fill="rgba(255,255,255,0.05)"/>`;

    const svgSource = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
      <defs>
        <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:${c1}"/>
          <stop offset="100%" style="stop-color:${c2}"/>
        </linearGradient>
      </defs>
      <rect width="1200" height="630" fill="url(#bg)"/>
      ${decoration}
      <rect x="60" y="180" width="1080" height="280" rx="16" fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.06)" stroke-width="1"/>
      <text x="600" y="${line2 ? '280' : '305'}" text-anchor="middle" fill="#fff" font-family="'Malgun Gothic','Apple SD Gothic Neo','Noto Sans KR',system-ui,sans-serif" font-size="38" font-weight="bold">${line1}</text>
      ${line2 ? `<text x="600" y="330" text-anchor="middle" fill="#fff" font-family="'Malgun Gothic','Apple SD Gothic Neo','Noto Sans KR',system-ui,sans-serif" font-size="38" font-weight="bold">${line2}</text>` : ''}
      <line x1="520" y1="${line2 ? '355' : '335'}" x2="680" y2="${line2 ? '355' : '335'}" stroke="rgba(255,255,255,0.3)" stroke-width="2"/>
      <text x="600" y="${line2 ? '390' : '370'}" text-anchor="middle" fill="rgba(255,255,255,0.7)" font-family="'Malgun Gothic','Apple SD Gothic Neo','Noto Sans KR',system-ui,sans-serif" font-size="22">${safeCategory}</text>
      <rect x="60" y="580" width="1080" height="3" rx="1" fill="rgba(255,255,255,0.1)"/>
    </svg>`;

    const pipeline = sharp(Buffer.from(svgSource)).resize(1200, 630);
    const ogBuffer = this.imageFormat === 'avif'
      ? await pipeline.avif({ quality: 75 }).toBuffer()
      : await pipeline.webp({ quality: 85 }).toBuffer();
    logger.debug(`OG image generated (${this.imageFormat.toUpperCase()}): ${(ogBuffer.length / 1024).toFixed(0)}KB`);
    return ogBuffer;
  }

  /**
   * Validate image quality before compression.
   * Checks: minimum resolution, file size, and basic corruption detection.
   */
  private async validateImageQuality(
    buffer: Buffer,
    index: number,
  ): Promise<{ valid: boolean; reason?: string }> {
    try {
      const metadata = await sharp(buffer).metadata();

      // Minimum resolution check
      const minWidth = index === 0 ? 800 : 400;  // Featured vs inline
      const minHeight = index === 0 ? 400 : 200;
      if (!metadata.width || !metadata.height) {
        return { valid: false, reason: 'Cannot read image dimensions' };
      }
      if (metadata.width < minWidth || metadata.height < minHeight) {
        return { valid: false, reason: `Too small: ${metadata.width}x${metadata.height} (min ${minWidth}x${minHeight})` };
      }

      // Minimum file size (very small images are likely corrupted or blank)
      const sizeKB = buffer.length / 1024;
      if (sizeKB < 5) {
        return { valid: false, reason: `File too small: ${sizeKB.toFixed(1)}KB (likely corrupted)` };
      }

      // Check for mostly single-color images (blank/error images)
      // Sample a few pixel rows and check variance
      const { data, info } = await sharp(buffer)
        .resize(100, 100, { fit: 'cover' })
        .raw()
        .toBuffer({ resolveWithObject: true });

      const channels = info.channels;
      let totalVariance = 0;
      const sampleSize = Math.min(data.length, 300 * channels);

      // Calculate pixel value variance across sample
      let sum = 0;
      for (let i = 0; i < sampleSize; i++) sum += data[i];
      const mean = sum / sampleSize;
      for (let i = 0; i < sampleSize; i++) totalVariance += Math.pow(data[i] - mean, 2);
      const variance = totalVariance / sampleSize;

      if (variance < 50) {
        return { valid: false, reason: `Low pixel variance (${variance.toFixed(0)}) — likely blank or solid color image` };
      }

      logger.debug(`Image ${index + 1} quality OK: ${metadata.width}x${metadata.height}, ${sizeKB.toFixed(0)}KB, variance=${variance.toFixed(0)}`);
      return { valid: true };
    } catch (error) {
      return { valid: false, reason: `Quality check error: ${error instanceof Error ? error.message : String(error)}` };
    }
  }

  /**
   * Generate a Pinterest-optimized image (2:3 aspect ratio, 1000x1500).
   * Pinterest favors tall pins — this variant improves click-through on Pinterest shares.
   */
  async generatePinterestImage(
    prompt: string,
    keyword: string,
  ): Promise<{ buffer: Buffer; filename: string } | null> {
    try {
      const model = this.client.getGenerativeModel({
        model: 'gemini-2.5-flash-image',
        generationConfig: {
          responseModalities: ['IMAGE', 'TEXT'] as unknown as undefined,
        } as Record<string, unknown>,
      });

      const pinterestPrompt = prompt +
        ', digital illustration, portrait orientation 2:3 aspect ratio, tall composition optimized for Pinterest, vivid colors, high detail, professional editorial quality, absolutely no text, no letters, no words, no Korean characters, no watermark, no captions, text-free image only';

      const response = await model.generateContent(pinterestPrompt);
      const parts = response.response.candidates?.[0]?.content?.parts ?? [];

      let imageBuffer: Buffer | null = null;
      for (const part of parts) {
        const inlineData = (part as unknown as Record<string, unknown>).inlineData as
          | { data: string; mimeType: string }
          | undefined;
        if (inlineData?.data) {
          imageBuffer = Buffer.from(inlineData.data, 'base64');
          break;
        }
      }

      if (!imageBuffer) {
        logger.warn('Pinterest image generation returned no data');
        return null;
      }

      const qualityCheck = await this.validateImageQuality(imageBuffer, 0);
      if (!qualityCheck.valid) {
        logger.warn(`Pinterest image quality check failed: ${qualityCheck.reason}`);
        return null;
      }

      costTracker.addImageCall(1);

      // Resize to 1000x1500 (2:3 ratio) and compress
      const resized = await sharp(imageBuffer).resize(1000, 1500, { fit: 'cover' });
      const compressed = this.imageFormat === 'avif'
        ? await resized.avif({ quality: 75 }).toBuffer()
        : await resized.webp({ quality: 80 }).toBuffer();

      const filename = ImageGeneratorService.buildFilename(keyword, 'pinterest-pin', this.imageFormat);
      logger.info(`Pinterest image generated: ${filename} (${(compressed.length / 1024).toFixed(0)}KB)`);

      return { buffer: compressed, filename };
    } catch (error) {
      logger.warn(`Pinterest image generation failed: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }

  async generateImages(prompts: string[]): Promise<ImageResult> {
    logger.info(`Generating ${prompts.length} images (batch parallel, model: ${GEMINI_MODELS[this.activeModelIndex]})...`);

    let model = this.getImageModel();

    const results: (Buffer | null)[] = new Array(prompts.length).fill(null);

    // Generate featured image first (must succeed or fallback)
    results[0] = await this.generateSingleImage(model, prompts[0], 0, []);

    // If featured image failed, try fallback models before giving up
    if (!results[0]) {
      while (this.advanceModel()) {
        model = this.getImageModel();
        results[0] = await this.generateSingleImage(model, prompts[0], 0, []);
        if (results[0]) break;
      }
    }

    // Generate inline images in parallel batches of 2
    const inlinePrompts = prompts.slice(1);
    const BATCH_SIZE = 2;
    const existingResults = results[0] ? [results[0]] : [];

    for (let batchStart = 0; batchStart < inlinePrompts.length; batchStart += BATCH_SIZE) {
      const batch = inlinePrompts.slice(batchStart, batchStart + BATCH_SIZE);
      const batchResults = await Promise.allSettled(
        batch.map((prompt, i) =>
          this.generateSingleImage(model, prompt, batchStart + i + 1, existingResults),
        ),
      );

      for (let i = 0; i < batchResults.length; i++) {
        const result = batchResults[i];
        const globalIdx = batchStart + i + 1;
        if (result.status === 'fulfilled' && result.value) {
          results[globalIdx] = result.value;
          existingResults.push(result.value);
        }
      }

      // Brief pause between batches to respect rate limits
      if (batchStart + BATCH_SIZE < inlinePrompts.length) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }
    }

    const validResults = results.filter((r): r is Buffer => r !== null);
    return {
      featured: validResults[0] ?? Buffer.alloc(0),
      inline: validResults.slice(1),
    };
  }
}
