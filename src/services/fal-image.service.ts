import { fal } from '@fal-ai/client';
import fs from 'node:fs/promises';
import https from 'node:https';
import http from 'node:http';

interface FalImageResult {
  images: Array<{ url: string }>;
}

export class FalImageService {
  constructor(apiKey: string) {
    fal.config({ credentials: apiKey });
  }

  async generateDataUrl(prompt: string): Promise<string> {
    const result = await fal.subscribe('fal-ai/flux/schnell', {
      input: {
        prompt,
        image_size: { width: 1080, height: 1920 },
        num_inference_steps: 4,
        num_images: 1,
        enable_safety_checker: false,
      },
    }) as { data: FalImageResult };

    const url = result.data.images[0]?.url;
    if (!url) throw new Error('fal.ai: no image returned');

    const buf = await this.fetchBuffer(url);
    return `data:image/jpeg;base64,${buf.toString('base64')}`;
  }

  private fetchBuffer(url: string): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const mod = url.startsWith('https') ? https : http;
      mod.get(url, (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks)));
        res.on('error', reject);
      }).on('error', reject);
    });
  }
}

// 장면 인덱스별 기본 프롬프트 (imagePrompt 없을 때 폴백)
export const FALLBACK_IMAGE_PROMPTS: Record<number, string> = {
  0: 'dramatic stock market trading floor, large screens with red and green price numbers, cinematic lighting, dark moody atmosphere, photorealistic',
  1: 'financial data visualization dashboard, glowing stock charts and graphs, dark blue background, cityscape reflection, professional',
  2: 'abstract financial analysis, glowing purple data streams, AI neural network visualization, dark background, futuristic',
  3: 'wall street financial district at night, green upward arrows, neon lights reflecting on wet pavement, cinematic',
  4: 'smartphone showing stock market notification alert, modern minimal dark UI, golden light, close-up product shot',
};
