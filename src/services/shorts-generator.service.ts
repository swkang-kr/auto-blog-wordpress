import path from 'node:path';
import fs from 'node:fs/promises';
import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';
import { ClovaTtsService } from './clova-tts.service.js';
import { ShortsScriptService } from './shorts-script.service.js';
import { YouTubeUploadService } from './youtube-upload.service.js';
import { FalImageService, FALLBACK_IMAGE_PROMPTS } from './fal-image.service.js';
import { BgmService } from './bgm.service.js';
import { logger } from '../utils/logger.js';
import type { BlogContent, PublishedPost } from '../types/index.js';

const OUTPUT_DIR = path.resolve('output/shorts');

export class ShortsGeneratorService {
  private tts: ClovaTtsService;
  private scriptService: ShortsScriptService;
  private youtube: YouTubeUploadService | null;
  private falImage: FalImageService | null;
  private bgm: BgmService;

  constructor(
    clovaClientId: string,
    clovaClientSecret: string,
    youtubeClientId?: string,
    youtubeClientSecret?: string,
    youtubeRefreshToken?: string,
  ) {
    this.tts = new ClovaTtsService(clovaClientId, clovaClientSecret);
    this.scriptService = new ShortsScriptService();
    this.youtube = youtubeClientId && youtubeClientSecret && youtubeRefreshToken
      ? new YouTubeUploadService(youtubeClientId, youtubeClientSecret, youtubeRefreshToken)
      : null;
    const falKey = process.env.FAL_KEY;
    this.falImage = falKey ? new FalImageService(falKey) : null;
    this.bgm = new BgmService();
    if (this.youtube) logger.info('[Shorts] YouTube auto-upload enabled');
    if (this.falImage) logger.info('[Shorts] fal.ai image generation enabled');
    else logger.info('[Shorts] fal.ai disabled (FAL_KEY not set) — using solid backgrounds');
  }

  async generate(content: BlogContent, post: PublishedPost, keyword: string): Promise<string | null> {
    try {
      await fs.mkdir(OUTPUT_DIR, { recursive: true });
      const safeSlug = (post.slug || String(post.postId)).replace(/[^a-z0-9가-힣-]/gi, '-').slice(0, 60);

      logger.info(`[Shorts] Generating script for: "${content.title}"`);
      const script = this.scriptService.generateScript(content.title, content.excerpt || '', keyword);

      // 장면별 배경 이미지 생성
      if (this.falImage) {
        logger.info(`[Shorts] Generating scene background images (fal.ai)...`);
        await Promise.all(script.scenes.map(async (scene, i) => {
          try {
            const prompt = scene.imagePrompt || FALLBACK_IMAGE_PROMPTS[i] || FALLBACK_IMAGE_PROMPTS[0];
            scene.imageSrc = await this.falImage!.generateDataUrl(prompt);
            logger.info(`[Shorts] Image ${i + 1}/${script.scenes.length} generated`);
          } catch (err) {
            logger.warn(`[Shorts] Image ${i + 1} failed (non-fatal): ${err instanceof Error ? err.message : err}`);
          }
        }));
      }

      // TTS + BGM 병렬 처리
      const audioPath = path.join(OUTPUT_DIR, `${safeSlug}.mp3`);
      logger.info(`[Shorts] Synthesizing TTS audio + fetching BGM...`);
      const [audioBuffer, bgmDataUrl] = await Promise.all([
        this.tts.synthesize(script.narration, audioPath).then(() => fs.readFile(audioPath)),
        this.bgm.getRandomTrack(),
      ]);
      const audioDataUrl = `data:audio/mp3;base64,${audioBuffer.toString('base64')}`;
      if (bgmDataUrl) logger.info('[Shorts] BGM ready');

      // Remotion 번들 + 렌더링
      logger.info(`[Shorts] Bundling Remotion composition...`);
      const bundleLocation = await bundle({
        entryPoint: path.resolve('src/remotion/index.tsx'),
        webpackOverride: (config) => ({
          ...config,
          resolve: {
            ...config.resolve,
            extensionAlias: { '.js': ['.tsx', '.ts', '.js'] },
          },
        }),
      });

      const inputProps = { scenes: script.scenes, audioSrc: audioDataUrl, bgmSrc: bgmDataUrl ?? '', keyword };

      const composition = await selectComposition({
        serveUrl: bundleLocation,
        id: 'Shorts',
        inputProps,
      });

      const outputPath = path.join(OUTPUT_DIR, `${safeSlug}.mp4`);
      logger.info(`[Shorts] Rendering MP4 (${composition.durationInFrames} frames)...`);

      await renderMedia({
        composition,
        serveUrl: bundleLocation,
        codec: 'h264',
        outputLocation: outputPath,
        inputProps,
        chromiumOptions: { disableWebSecurity: true },
        onProgress: (() => {
          let lastLogged = -1;
          return ({ progress }: { progress: number }) => {
            const pct = Math.floor(progress * 100 / 20) * 20;
            if (pct > lastLogged) {
              lastLogged = pct;
              logger.info(`[Shorts] Render progress: ${pct}%`);
            }
          };
        })(),
      });

      logger.info(`[Shorts] MP4 saved: ${outputPath}`);

      // YouTube 업로드
      if (this.youtube) {
        const postUrl = post.url || '';
        const videoUrl = await this.youtube.upload(outputPath, script, postUrl);
        if (videoUrl) logger.info(`[Shorts] YouTube: ${videoUrl}`);
      }

      return outputPath;
    } catch (err) {
      logger.warn(`[Shorts] Generation failed (non-fatal): ${err instanceof Error ? err.message : err}`);
      return null;
    }
  }
}
