import path from 'node:path';
import fs from 'node:fs/promises';
import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';
import { ClovaTtsService } from './clova-tts.service.js';
import { ShortsScriptService } from './shorts-script.service.js';
import { logger } from '../utils/logger.js';
import type { BlogContent } from '../types/index.js';
import type { PublishedPost } from '../types/index.js';

const OUTPUT_DIR = path.resolve('output/shorts');

export class ShortsGeneratorService {
  private tts: ClovaTtsService;
  private scriptService: ShortsScriptService;

  constructor(clovaClientId: string, clovaClientSecret: string) {
    this.tts = new ClovaTtsService(clovaClientId, clovaClientSecret);
    this.scriptService = new ShortsScriptService();
  }

  async generate(content: BlogContent, post: PublishedPost, keyword: string): Promise<string | null> {
    try {
      await fs.mkdir(OUTPUT_DIR, { recursive: true });
      const safeSlug = (post.slug || String(post.postId)).replace(/[^a-z0-9가-힣-]/gi, '-').slice(0, 60);

      logger.info(`[Shorts] Generating script for: "${content.title}"`);
      const script = this.scriptService.generateScript(content.title, content.excerpt || '', keyword);

      // TTS 음성 합성
      const audioPath = path.join(OUTPUT_DIR, `${safeSlug}.mp3`);
      logger.info(`[Shorts] Synthesizing TTS audio...`);
      await this.tts.synthesize(script.narration, audioPath);

      // Remotion 번들 + 렌더링
      logger.info(`[Shorts] Bundling Remotion composition...`);
      const bundleLocation = await bundle({
        entryPoint: path.resolve('src/remotion/index.tsx'),
        webpackOverride: (config) => config,
      });

      const composition = await selectComposition({
        serveUrl: bundleLocation,
        id: 'Shorts',
        inputProps: {
          scenes: script.scenes,
          audioSrc: audioPath,
          keyword,
        },
      });

      const outputPath = path.join(OUTPUT_DIR, `${safeSlug}.mp4`);
      logger.info(`[Shorts] Rendering MP4 (${composition.durationInFrames} frames)...`);

      await renderMedia({
        composition,
        serveUrl: bundleLocation,
        codec: 'h264',
        outputLocation: outputPath,
        inputProps: {
          scenes: script.scenes,
          audioSrc: audioPath,
          keyword,
        },
        chromiumOptions: { disableWebSecurity: true },
        onProgress: ({ progress }) => {
          if (Math.round(progress * 100) % 20 === 0) {
            logger.info(`[Shorts] Render progress: ${Math.round(progress * 100)}%`);
          }
        },
      });

      logger.info(`[Shorts] MP4 saved: ${outputPath}`);
      return outputPath;
    } catch (err) {
      logger.warn(`[Shorts] Generation failed (non-fatal): ${err instanceof Error ? err.message : err}`);
      return null;
    }
  }
}
