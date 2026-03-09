import { GoogleGenerativeAI } from '@google/generative-ai';
import sharp from 'sharp';
import { logger } from '../utils/logger.js';
import { ImageGenerationError } from '../types/errors.js';
import { costTracker } from '../utils/cost-tracker.js';
import type { ImageResult } from '../types/index.js';

const TARGET_MAX_KB = 200;
const TARGET_MIN_KB = 100;

export class ImageGeneratorService {
  private client: GoogleGenerativeAI;
  private imageFormat: 'webp' | 'avif';

  constructor(apiKey: string, imageFormat: 'webp' | 'avif' = 'webp') {
    this.client = new GoogleGenerativeAI(apiKey);
    this.imageFormat = imageFormat;
  }

  /**
   * Generate an SEO-friendly filename from keyword.
   * e.g. "Claude AI: 7 Best Features" → "claude-ai-7-best-features-2026"
   */
  static buildFilename(keyword: string, suffix: string, format: 'webp' | 'avif' = 'webp'): string {
    const year = new Date().getFullYear();
    const slug = keyword
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .substring(0, 60);
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
    const styleSuffix = index === 0
      ? ', digital illustration, wide composition for blog hero banner, vivid colors, high detail, 16:9 aspect ratio, professional editorial quality, no text or watermark'
      : ', digital illustration, clean composition, bright natural lighting, detailed and sharp, editorial blog style, no text or watermark, 16:9 aspect ratio';

    const fullPrompt = prompt + styleSuffix;

    try {
      logger.debug(`Generating image ${index + 1}: "${fullPrompt.substring(0, 80)}..."`);
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
        costTracker.addImageCall(1);
        const compressedBuffer = await this.convertImage(imageBuffer);
        logger.info(`Image ${index + 1} generated & compressed to ${this.imageFormat.toUpperCase()} (${(compressedBuffer.length / 1024).toFixed(0)}KB)`);
        return compressedBuffer;
      } else {
        logger.warn(`Image ${index + 1} generation returned no image data`);
        return null;
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      logger.warn(new ImageGenerationError(`Image ${index + 1} generation failed: ${detail}`, error).message);
      return null;
    }
  }

  /**
   * Generate an OG image (1200x630) with title text and category label.
   * Uses SVG-to-WebP conversion for consistent quality.
   */
  async generateOgImage(title: string, category: string): Promise<Buffer> {
    const gradients: Record<string, [string, string]> = {
      'Korean Tech': ['#1a1a2e', '#16213e'],
      'K-Entertainment': ['#2d1b69', '#6b21a8'],
      'Korean Finance': ['#0c4a6e', '#0369a1'],
      'Korean Food': ['#7c2d12', '#c2410c'],
      'Korea Travel': ['#14532d', '#15803d'],
      'Korean Language': ['#4a1d96', '#7c3aed'],
    };
    const [c1, c2] = gradients[category] || ['#0052CC', '#0066FF'];

    // Truncate and escape title for SVG
    const safeTitle = title.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
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
      <text x="600" y="${line2 ? '280' : '305'}" text-anchor="middle" fill="#fff" font-family="system-ui,sans-serif" font-size="38" font-weight="bold">${line1}</text>
      ${line2 ? `<text x="600" y="330" text-anchor="middle" fill="#fff" font-family="system-ui,sans-serif" font-size="38" font-weight="bold">${line2}</text>` : ''}
      <line x1="520" y1="${line2 ? '355' : '335'}" x2="680" y2="${line2 ? '355' : '335'}" stroke="rgba(255,255,255,0.3)" stroke-width="2"/>
      <text x="600" y="${line2 ? '390' : '370'}" text-anchor="middle" fill="rgba(255,255,255,0.7)" font-family="system-ui,sans-serif" font-size="22">${safeCategory}</text>
      <rect x="60" y="580" width="1080" height="3" rx="1" fill="rgba(255,255,255,0.1)"/>
    </svg>`;

    const pipeline = sharp(Buffer.from(svgSource)).resize(1200, 630);
    const ogBuffer = this.imageFormat === 'avif'
      ? await pipeline.avif({ quality: 75 }).toBuffer()
      : await pipeline.webp({ quality: 85 }).toBuffer();
    logger.debug(`OG image generated (${this.imageFormat.toUpperCase()}): ${(ogBuffer.length / 1024).toFixed(0)}KB`);
    return ogBuffer;
  }

  async generateImages(prompts: string[]): Promise<ImageResult> {
    logger.info(`Generating ${prompts.length} images (batch parallel)...`);

    const model = this.client.getGenerativeModel({
      model: 'imagen-3.0-generate-002',
      generationConfig: {
        responseModalities: ['image', 'text'] as unknown as undefined,
      } as Record<string, unknown>,
    });

    const results: (Buffer | null)[] = new Array(prompts.length).fill(null);

    // Generate featured image first (must succeed or fallback)
    results[0] = await this.generateSingleImage(model, prompts[0], 0, []);

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
