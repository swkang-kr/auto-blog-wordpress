import { GoogleGenerativeAI } from '@google/generative-ai';
import sharp from 'sharp';
import { logger } from '../utils/logger.js';
import { ImageGenerationError } from '../types/errors.js';
import type { ImageResult } from '../types/index.js';

const TARGET_MAX_KB = 200;
const TARGET_MIN_KB = 100;

export class ImageGeneratorService {
  private client: GoogleGenerativeAI;

  constructor(apiKey: string) {
    this.client = new GoogleGenerativeAI(apiKey);
  }

  /**
   * Generate an SEO-friendly filename from keyword.
   * e.g. "Claude AI: 7 Best Features" → "claude-ai-7-best-features-2026"
   */
  static buildFilename(keyword: string, suffix: string): string {
    const year = new Date().getFullYear();
    const slug = keyword
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .substring(0, 60);
    return `${slug}-${suffix}-${year}.webp`;
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

  async generateImages(prompts: string[]): Promise<ImageResult> {
    logger.info(`Generating ${prompts.length} images...`);

    const model = this.client.getGenerativeModel({
      model: 'gemini-2.0-flash-exp-image-generation',
      generationConfig: {
        responseModalities: ['image', 'text'] as unknown as undefined,
      } as Record<string, unknown>,
    });

    const results: Buffer[] = [];

    for (let i = 0; i < prompts.length; i++) {
      const styleSuffix = i === 0
        ? ', digital illustration, wide composition for blog hero banner, vivid colors, high detail, 16:9 aspect ratio, professional editorial quality, no text or watermark'
        : ', digital illustration, clean composition, bright natural lighting, detailed and sharp, editorial blog style, no text or watermark, 16:9 aspect ratio';

      const fullPrompt = prompts[i] + styleSuffix;

      try {
        logger.debug(`Generating image ${i + 1}: "${fullPrompt.substring(0, 80)}..."`);
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
          // Check for duplicate: skip if identical size to any previous image
          const isDuplicate = results.some((prev) =>
            prev.length === imageBuffer!.length && prev.compare(imageBuffer!) === 0
          );
          if (isDuplicate) {
            logger.warn(`Image ${i + 1} is duplicate of a previous image, skipping`);
          } else {
            // Convert to WebP and compress
            const webpBuffer = await this.toWebP(imageBuffer);
            results.push(webpBuffer);
            logger.info(`Image ${i + 1} generated & compressed to WebP (${(webpBuffer.length / 1024).toFixed(0)}KB)`);
          }
        } else {
          logger.warn(`Image ${i + 1} generation returned no image data`);
        }
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        const imgError = new ImageGenerationError(`Image ${i + 1} generation failed: ${detail}`, error);
        logger.warn(imgError.message);
      }

      // Rate limit: wait between requests
      if (i < prompts.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }
    }

    return {
      featured: results[0] ?? Buffer.alloc(0),
      inline: results.slice(1),
    };
  }
}
