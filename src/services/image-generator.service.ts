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
    const isKEntertainment = /k-pop|idol|k-drama|concert|comeback|fandom|lightstick|k-hip-?hop|k-r&?b|rapper|hip\s*hop/i.test(promptLower);

    // K-Entertainment sub-category differentiation
    const isKHipHopRnB = isKEntertainment && /hip\s*hop|rapper|k-r&?b|k-rnb|r&b|dean|crush|zion\.?t|jay\s*park|ph-1|epik\s*high|dpr\s*live|heize|colde|lee\s*hi|aomg|h1ghr/i.test(promptLower);
    const isKDrama = isKEntertainment && /k-drama|korean\s*drama|netflix.*drama|streaming.*drama|kdrama|sageuk|webtoon.*adapt/i.test(promptLower);
    // 13차 감사: K-드라마 장르별 비주얼 차별화
    const isKDramaRomance = isKDrama && /romance|love|wedding|relationship|dating|rom-com/i.test(promptLower);
    const isKDramaThriller = isKDrama && /thriller|mystery|crime|investigat|murder|suspense|detective/i.test(promptLower);
    const isKDramaSageuk = isKDrama && /sageuk|historical|joseon|goryeo|hanbok|period\s*drama/i.test(promptLower);

    // K-Beauty sub-category differentiation for richer visual variety
    const isKBeautyMakeup = isKBeauty && /makeup|foundation|cushion|lip\s*tint|blush|eyeshadow|mascara|eyeliner|rom.nd|clio|fwee|hince/i.test(promptLower);
    const isKBeautyHairCare = isKBeauty && /hair|shampoo|scalp|daeng gi|ryo|masil/i.test(promptLower);
    const isKBeautyHanbang = isKBeauty && /sulwhasoo|whoo|hanbang|hanyul|ginseng|herbal|luxury\s*korean|premium\s*korean/i.test(promptLower);
    const isKBeautyLedMask = isKBeauty && /led\s*mask|cellreturn|lg\s*pra\.?l|light\s*therapy\s*mask/i.test(promptLower);
    const isKBeautyTools = isKBeauty && /gua\s*sha|ice\s*roller|microcurrent|device|tool|facial\s*massage|derma\s*roller/i.test(promptLower);
    const isKBeautyBarrierRepair = isKBeauty && /barrier\s*(?:repair|cream|restore)|ceramide|damaged\s*barrier|skin\s*barrier/i.test(promptLower);
    const isKBeautyBodyCare = isKBeauty && /body\s*(?:care|lotion|cream|scrub|exfoli)|italy\s*towel|glass\s*body|spf\s*body/i.test(promptLower);
    const isKBeautyTonerPad = isKBeauty && /toner\s*pad|sun\s*pad|exfoliat.*pad|선패드/i.test(promptLower);
    const isKBeautyAmpoule = isKBeauty && /ampoule|앰플|concentrated\s*(?:serum|essence)/i.test(promptLower);
    const isKBeautyTexture = isKBeauty && /texture|발림성|swatch|consistency|application/i.test(promptLower);
    const isKBeautyNailArt = isKBeauty && /nail\s*art|gel\s*nail|press[- ]on\s*nail|manicure|nail\s*sticker|ohora|dashing\s*diva|cat\s*eye\s*nail|magnet\s*nail|aurora\s*nail/i.test(promptLower);
    const isKMusical = isKEntertainment && /musical|theater|theatre|broadway|k-musical/i.test(promptLower);
    const isKBeautyGiftSet = isKBeauty && /gift\s*set|advent\s*calendar|subscription\s*box|holiday\s*set|선물\s*세트|기프트/i.test(promptLower);
    const isKBeautyMens = isKBeauty && /\bmen(?:'?s)?\b|male\s*skincare|grooming/i.test(promptLower);
    const isKBeautyPregnancy = isKBeauty && /pregnan|prenatal|baby\s*safe|expecting\s*mom/i.test(promptLower);
    const isKBeautyFragrance = isKBeauty && /fragrance|perfume|body\s*mist|tamburins|nonfiction|granhand|eau\s*de|cologne|scent/i.test(promptLower);
    const isKPopFanCulture = isKEntertainment && /photocard|lightstick|light\s*stick|unboxing|album\s*(?:haul|collection)|fan\s*(?:merch|merchandise|collect)/i.test(promptLower);
    const isKDramaOST = isKEntertainment && /(?:drama|kdrama).*ost|ost.*(?:drama|kdrama)|soundtrack.*(?:korean|k-drama)/i.test(promptLower);
    const isKVarietyShow = isKEntertainment && /variety\s*show|running\s*man|knowing\s*bros|web\s*(?:variety|entertainment)|youtube\s*variety/i.test(promptLower);
    // 20차 감사: 리얼리티 데이팅 쇼 + 요리 예능 비주얼
    const isKDatingShow = isKEntertainment && /dating\s*show|single.*inferno|heart\s*signal|exchange|transit\s*love|love\s*catcher|i\s*am\s*solo|reality.*dating|연애/i.test(promptLower);
    const isKCookingVariety = isKEntertainment && /cooking|food\s*(?:show|variety)|youn.*kitchen|3\s*meals|kang.*kitchen|mukbang|new\s*journey|삼시세끼|윤식당/i.test(promptLower);
    const isKVirtualIdol = isKEntertainment && /virtual\s*idol|plave|metaverse.*idol|ai\s*idol|virtual\s*avatar|3d\s*idol/i.test(promptLower);
    const isKStreetDance = isKEntertainment && /street\s*(?:woman|man|dance)\s*fighter|swf|smf|dance\s*crew|street\s*dance/i.test(promptLower);
    // 8차 감사 추가
    const isKBeautyBaby = isKBeauty && /baby|infant|newborn|kids?\s*(?:skincare|sunscreen|lotion)|child(?:ren)?\s*(?:skincare|cosmetic)/i.test(promptLower);
    const isKMovie = isKEntertainment && /korean\s*(?:film|movie|cinema)|blue\s*dragon|grand\s*bell|biff|film\s*festival|(?:bong|hwang|yeon|park\s*chan)\s*(?:joon|dong|sang|wook)/i.test(promptLower);
    const isKSurvivalShow = isKEntertainment && /survival\s*show|audition|i-?land|produce\s*101|r\s*u\s*next|boys?\s*planet|girls?\s*planet/i.test(promptLower);
    // 10차 감사 추가
    const isKBandIdol = isKEntertainment && /day6|band\s*idol|밴드돌|live\s*(?:band|instrument)|qwer.*band/i.test(promptLower);
    const isKIdolFashion = isKEntertainment && /airport\s*fashion|idol\s*fashion|best\s*dressed|luxury\s*(?:brand|outfit)/i.test(promptLower);
    // 23차 감사: 트로트/발라드, 웹툰→애니, 립오일 비주얼
    const isKTrotBallad = isKEntertainment && /trot|트로트|mr\.?\s*trot|miss\s*trot|lim\s*young|임영웅|young\s*tak|song\s*ga|ballad\s*(?:singer|artist)|발라드/i.test(promptLower);
    const isKWebtoonAnime = isKEntertainment && /webtoon.*anime|anime.*webtoon|solo\s*leveling.*anime|tower\s*of\s*god.*anime|omniscient.*reader.*anime|manhwa.*anime|webtoon.*adapt.*anime/i.test(promptLower);
    const isKBeautyLipOil = isKBeauty && /lip\s*(?:oil|serum|treatment|gloss)|glass\s*lip|plumping\s*lip/i.test(promptLower);

    const nicheSuffix = isKBeautyNailArt
      ? ', Korean nail art close-up photography, trendy gel nail designs, cat eye magnet nail aurora gradient mirror chrome finish, 3D embedded nail art details, elegant hand pose, salon-quality macro detail, soft pink and lavender tones, clean minimal background, beauty editorial'
      : isKMusical
      ? ', Korean musical theater stage aesthetic, dramatic spotlight on performer, rich red curtain backdrop, warm golden stage lighting, Broadway-style grandeur with Korean sensibility, emotional theatrical atmosphere, cinematic wide shot composition'
      : isKBeautyGiftSet
      ? ', Korean beauty gift set flat lay photography, beautifully wrapped boxes with ribbon, pastel and gold packaging, holiday aesthetic, curated skincare collection, festive warm lighting, premium unboxing experience, elegant arrangement on marble surface'
      : isKBeautyFragrance
      ? ', Korean niche perfume bottle photography, amber and frosted glass bottles, botanical ingredients arrangement, warm diffused golden lighting, luxury minimalist shelf display, clean composition, soft bokeh background'
      : isKBeautyMens
      ? ', men grooming product photography, dark tones with navy and charcoal accents, minimalist modern bathroom, clean geometric composition, masculine skincare bottles, matte finish products, subtle warm lighting'
      : isKBeautyBaby
      ? ', baby skincare product photography, soft pastel pink and mint, gentle safe ingredients, plush cotton texture, warm nursery setting, clean minimal composition, soft natural daylight'
      : isKBeautyPregnancy
      ? ', gentle motherhood skincare aesthetic, soft cream and sage green tones, natural organic ingredients flat lay, warm morning light, calm serene composition, botanical elements, safe gentle products on wooden tray'
      : isKBeautyLedMask
      ? ', Korean LED light therapy mask close-up, red and blue LED wavelength illumination visible, neon glow effect on skin, modern clinical aesthetic, futuristic skincare technology, dark ambient background with LED light reflections, home beauty device editorial'
      : isKBeautyBarrierRepair
      ? ', Korean barrier repair skincare editorial, cream and ceramide product close-up, dewy hydrated skin texture, soft warm tones, glass bottle with rich cream consistency, clean minimal composition, soothing calming aesthetic'
      : isKBeautyTools
      ? ', Korean beauty tool product photography, clean clinical aesthetic, soft white background, modern bathroom counter, sleek gua sha ice roller flat lay, wellness spa minimalist composition'
      : isKBeautyBodyCare
        ? ', Korean body care editorial, bright bathroom setting, glass body aesthetic, body products flat lay, soft natural lighting, spa-like atmosphere, luxurious texture display'
        : isKBeautyTonerPad
          ? ', Korean toner pad close-up product photography, cotton round pad texture visible, clean glass jar packaging, soft pink and white tones, hydrating dewy aesthetic, minimal clean background'
          : isKBeautyAmpoule
            ? ', Korean ampoule product photography, small glass dropper bottle close-up, golden serum droplet on dropper tip, clean minimal background, concentrated formula aesthetic, luxury skincare editorial, warm amber lighting'
            : isKBeautyTexture
              ? ', Korean skincare texture swatch photography, product spread on glass surface, creamy gel texture close-up, dewy translucent consistency, finger swatch application, clean white marble background, macro lens detail'
              : isKBeautyHanbang
      ? ', luxurious Korean Hanbang aesthetic, gold and deep burgundy accents, traditional Korean botanical motifs, ginseng root and mugwort leaf elements, porcelain bottle packaging, heritage luxury cosmetic editorial, dark wood vanity, warm amber ambient lighting'
      : isKBeautyMakeup
        ? ', K-beauty makeup flat lay, vibrant coral and pink tones, mirror reflections, beauty editorial style, bright studio lighting, clean modern vanity, texture swatches visible'
        : isKBeautyHairCare
          ? ', Korean hair care editorial, sleek flowing hair texture, salon-quality lighting, minimalist bathroom setting, amber and warm tones, scalp care products arranged neatly'
          : isKBeautyLipOil
            ? ', Korean lip oil close-up macro photography, glossy dewy lip texture, luminous glass lip finish, serum droplet on applicator tip, plump volumized lips, warm soft lighting, luxury lip care editorial, pink and coral tones'
            : isKBeauty
            ? ', soft pastel aesthetic, Korean beauty product photography, clean white or cream background, glass bottles, subtle gradient lighting, editorial K-beauty style, dewy skin texture'
            : isKVirtualIdol
              ? ', futuristic virtual idol aesthetic, holographic 3D character, neon cyan and purple glow, digital matrix background, metaverse stage, ethereal translucent effects, sci-fi concert atmosphere'
              : isKMovie
                ? ', Korean cinema aesthetic, dark moody noir lighting, film reel and clapperboard, red carpet atmosphere, cinematic widescreen composition, prestigious film festival ambiance, dramatic shadows'
                : isKSurvivalShow
                  ? ', K-pop survival audition show stage, dramatic spotlight from above, nervous contestants in formation, large LED screen background, tension-filled atmosphere, competition stage design, broadcast studio setting'
                  : isKStreetDance
                ? ', Korean street dance aesthetic, dynamic dance crew formation, urban warehouse setting, dramatic spotlights, graffiti backdrop, powerful movement freeze frame, hip-hop street fashion, high energy composition'
                : isKPopFanCulture
                  ? ', K-pop photocard collection flat lay, colorful album packaging, lightstick glow, fan merchandise arrangement, pastel and holographic accents, cozy desk setup, warm ambient lighting, aesthetic fan collection display'
                  : isKDramaOST
                ? ', Korean drama OST aesthetic, piano keys with soft warm lighting, headphones on cozy desk, emotional cinematic mood, warm golden hour tones, vinyl record and coffee, intimate listening atmosphere'
                : isKTrotBallad
                  ? ', Korean trot ballad performance aesthetic, warm golden stage lighting, nostalgic TV studio ambiance, vintage microphone, emotional solo performer spotlight, classic Korean music show backdrop, middle-aged elegance, intimate concert hall, sentimental warm tones'
                  : isKWebtoonAnime
                  ? ', Korean webtoon to anime adaptation aesthetic, vibrant anime character art style, digital animation keyframe composition, dynamic action sequence, bold neon color palette, split-screen webtoon-panel-to-anime-frame comparison, studio anime quality, manga-style speed lines'
                  : isKDatingShow
                  ? ', Korean reality dating show aesthetic, warm romantic villa or beach house setting, golden hour sunset lighting, soft pastel and warm tones, elegant casual outfits, intimate conversation atmosphere, pool party or rooftop terrace, Netflix-style cinematic composition'
                  : isKCookingVariety
                  ? ', Korean cooking variety show aesthetic, bright warm kitchen setting, fresh ingredients flat lay, steaming home-cooked Korean food, rustic countryside or cozy indoor kitchen, warm natural lighting, cheerful colorful table spread, delicious food photography composition'
                : isKVarietyShow
                  ? ', Korean variety show set aesthetic, bright colorful studio background, fun playful atmosphere, game show props, vibrant lighting, energetic cheerful composition, entertainment studio setting'
                  : isKBandIdol
                    ? ', Korean band performance aesthetic, live instruments on stage, guitar bass drums keyboard, intimate concert hall lighting, warm amber spotlights, raw live music atmosphere, indie band editorial composition'
                    : isKIdolFashion
                    ? ', K-pop idol airport fashion editorial, sleek streetwear luxury outfit, modern terminal architecture background, paparazzi flash aesthetic, high fashion meets casual, clean composition, runway-to-airport style'
                    : isKHipHopRnB
                    ? ', Korean hip-hop and R&B aesthetic, moody urban studio setting, grayscale with neon accent lighting, DJ turntable or recording studio mic, streetwear fashion, Seoul Itaewon nightlife atmosphere, artistic and edgy composition'
                    // 13차 감사: K-드라마 장르별 비주얼 차별화
                    : isKDramaSageuk
                    ? ', Korean historical drama sageuk aesthetic, rich sepia and gold tones, traditional Korean architecture and courtyards, hanbok costume details, period-authentic props, elegant palace or temple setting, warm candlelight atmosphere'
                    : isKDramaThriller
                    ? ', Korean thriller drama aesthetic, dramatic noir lighting, cool blue-tinted color grading, suspenseful moody atmosphere, sharp contrast shadows, Seoul urban nighttime setting, tense cinematic composition'
                    : isKDramaRomance
                    ? ', Korean romance drama aesthetic, warm soft-focus lighting, pastel color palette, intimate emotional scene, cherry blossom or cafe setting, gentle bokeh background, cozy Seoul atmosphere'
                    : isKDrama
                      ? ', Korean drama cinematic aesthetic, warm emotional lighting, indoor intimate scene, romantic or dramatic atmosphere, soft bokeh background, Seoul cityscape through window, cozy living room or cafe setting'
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
      'K-Beauty': ['#831843', '#ec4899'],
      'K-Entertainment': ['#2d1b69', '#6b21a8'],
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
      'K-Beauty': `<circle cx="130" cy="110" r="40" fill="rgba(255,255,255,0.06)"/><circle cx="160" cy="130" r="20" fill="rgba(255,255,255,0.04)"/><ellipse cx="1060" cy="520" rx="50" ry="30" fill="rgba(255,255,255,0.05)"/><circle cx="100" cy="80" r="8" fill="rgba(255,255,255,0.1)"/>`,
      'K-Entertainment': `<circle cx="120" cy="100" r="50" fill="rgba(255,255,255,0.05)"/><circle cx="180" cy="130" r="30" fill="rgba(255,255,255,0.04)"/><circle cx="1080" cy="520" r="45" fill="rgba(255,255,255,0.05)"/><path d="M1030 80 L1050 50 L1070 80 Z" fill="rgba(255,255,255,0.08)"/>`,
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
