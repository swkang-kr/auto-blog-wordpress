/**
 * 특정 포스트 ID의 이미지를 재생성하여 WP에 업로드 + 대표이미지 설정
 *
 * 실행: node --import tsx/esm src/scripts/fix-missing-images.ts 89590 89582 89573 89564
 */

import axios from 'axios';
import sharp from 'sharp';
import 'dotenv/config';
import { ImageGeneratorService } from '../services/image-generator.service.js';

const POST_IDS = process.argv.slice(2).map(Number).filter(Boolean);
if (POST_IDS.length === 0) {
  console.error('Usage: node --import tsx/esm src/scripts/fix-missing-images.ts <postId1> <postId2> ...');
  process.exit(1);
}

const WP_URL = process.env.WP_URL!.replace(/\/+$/, '');
const AUTH = Buffer.from(`${process.env.WP_USERNAME}:${process.env.WP_APP_PASSWORD}`).toString('base64');
const IMAGE_FORMAT = (process.env.IMAGE_FORMAT as 'webp' | 'avif') || 'webp';

const wpApi = axios.create({
  baseURL: `${WP_URL}/wp-json/wp/v2`,
  headers: { Authorization: `Basic ${AUTH}` },
  timeout: 30_000,
});

const CATEGORY_KEYWORDS: Record<string, string> = {
  '시장분석': 'Korean stock market KOSPI KOSDAQ index analysis financial chart',
  '업종분석': 'Korean industry sector analysis stock market visualization',
  '테마분석': 'Korean stock theme investment trend analysis visualization',
  '종목분석': 'Korean stock technical analysis candlestick chart trading',
};

const CATEGORY_GRADIENTS: Record<string, [string, string]> = {
  '시장분석': ['#1a3a6b', '#2d6bbf'],
  '업종분석': ['#1a5e38', '#2d9e6b'],
  '테마분석': ['#5e1a3a', '#9e2d6b'],
  '종목분석': ['#2d1b69', '#6b21a8'],
};

interface WPPostMeta {
  id: number;
  title: { rendered: string };
  categories: number[];
  featured_media: number;
  slug: string;
}

async function getCategoryName(catId: number): Promise<string> {
  try {
    const { data } = await wpApi.get(`/categories/${catId}`, { params: { _fields: 'name' } });
    return data.name as string;
  } catch {
    return '';
  }
}

function buildImagePrompt(title: string, categoryName: string): string[] {
  // Rich, detail-heavy prompts produce larger files and pass Discover 50KB minimum
  if (categoryName === '종목분석') {
    return [
      'Korean stock market trading terminal showing candlestick chart with RSI MACD Bollinger Band indicators, multiple monitors, green and red candles, technical analysis overlays, dark trading room with glowing screens, photorealistic, ultra high detail, cinematic lighting, 16:9 wide format',
      'Close-up of stock market trading dashboard with live candlestick charts, moving average lines, volume bars in green and red, professional trader workstation, Seoul financial district visible through window, dramatic lighting, high resolution illustration',
      'Financial data visualization with multiple overlapping stock charts, technical indicators, glowing neon lines on dark background, Korean won symbols, investment analysis concept, rich detail, vibrant colors, 16:9 banner',
      'Professional stock analyst reviewing multiple screens showing Korean equity charts, candlestick patterns, buy signal indicators highlighted, modern office setting, Seoul skyline background, photorealistic editorial style',
      'Abstract financial growth visualization with ascending line charts, bar graphs, data streams, blue purple gradient background, particle effects, modern fintech digital art, highly detailed',
    ];
  }
  const base = CATEGORY_KEYWORDS[categoryName] || 'Korean financial market data visualization';
  return [
    `${base}, multiple overlapping charts and data graphs, vibrant blue green color scheme, dark professional background, highly detailed, cinematic editorial illustration, 16:9 wide banner`,
    `${base}, professional financial dashboard with real-time data panels, Seoul skyline in background, dramatic lighting, photorealistic, ultra high detail`,
    `Korean stock market analysis concept, complex financial data visualization with charts indicators metrics, rich colors, modern editorial style, professional photography`,
    `Investment strategy and market analysis, financial charts overlapping, Korean economy context, detailed illustration, vivid colors, wide composition`,
    `Market analysis infographic with multiple data streams charts graphs, Korean financial market, professional editorial style, high resolution`,
  ];
}

async function buildFallbackSvg(title: string, categoryName: string, siteName: string): Promise<Buffer> {
  const [c1, c2] = CATEGORY_GRADIENTS[categoryName] || ['#0052CC', '#0066FF'];
  const safeTitle = title.replace(/<[^>]+>/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').slice(0, 60);
  const safeCategory = categoryName.replace(/&/g, '&amp;');

  const svgSource = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675" viewBox="0 0 1200 675">
    <defs>
      <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" style="stop-color:${c1}"/>
        <stop offset="100%" style="stop-color:${c2}"/>
      </linearGradient>
    </defs>
    <rect width="1200" height="675" fill="url(#bg)"/>
    <circle cx="100" cy="100" r="200" fill="rgba(255,255,255,0.03)"/>
    <circle cx="1100" cy="575" r="250" fill="rgba(255,255,255,0.03)"/>
    <rect x="0" y="0" width="1200" height="50" fill="rgba(0,0,0,0.3)"/>
    <text x="40" y="33" fill="rgba(255,255,255,0.9)" font-family="system-ui,sans-serif" font-size="16" font-weight="bold">${siteName}</text>
    <rect x="80" y="190" width="1040" height="300" rx="20" fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.1)" stroke-width="1"/>
    <text x="600" y="310" text-anchor="middle" fill="#fff" font-family="system-ui,sans-serif" font-size="32" font-weight="bold">${safeTitle}</text>
    <line x1="520" y1="340" x2="680" y2="340" stroke="rgba(255,255,255,0.4)" stroke-width="2"/>
    <text x="600" y="375" text-anchor="middle" fill="rgba(255,255,255,0.7)" font-family="system-ui,sans-serif" font-size="20">${safeCategory}</text>
  </svg>`;

  const pipeline = sharp(Buffer.from(svgSource)).resize(1200, 675);
  return IMAGE_FORMAT === 'avif'
    ? pipeline.avif({ quality: 75 }).toBuffer()
    : pipeline.webp({ quality: 85 }).toBuffer();
}

async function uploadMedia(buffer: Buffer, filename: string, altText: string): Promise<number> {
  const contentType = filename.endsWith('.avif') ? 'image/avif' : 'image/webp';
  const { data } = await wpApi.post('/media', buffer, {
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
    maxBodyLength: Infinity,
    timeout: 60_000,
  });
  const mediaId = data.id as number;
  if (altText) {
    await wpApi.post(`/media/${mediaId}`, { alt_text: altText }).catch(() => {});
  }
  return mediaId;
}

async function setFeaturedImage(postId: number, mediaId: number): Promise<void> {
  await wpApi.post(`/posts/${postId}`, { featured_media: mediaId });
}

async function main() {
  console.log(`=== 이미지 재생성 스크립트 ===`);
  console.log(`대상 포스트 ID: ${POST_IDS.join(', ')}\n`);

  const imageService = new ImageGeneratorService(process.env.GEMINI_API_KEY!, IMAGE_FORMAT);
  const siteName = process.env.SITE_NAME || 'TrendHunt';

  for (const postId of POST_IDS) {
    console.log(`\n[${postId}] 포스트 정보 조회 중...`);
    let post: WPPostMeta;
    try {
      const { data } = await wpApi.get(`/posts/${postId}`, {
        params: { _fields: 'id,title,categories,featured_media,slug' },
      });
      post = data as WPPostMeta;
    } catch (err) {
      console.error(`  ✗ 포스트 조회 실패: ${err instanceof Error ? err.message : err}`);
      continue;
    }

    const title = post.title.rendered.replace(/<[^>]+>/g, '');
    console.log(`  제목: ${title}`);
    console.log(`  현재 대표이미지 ID: ${post.featured_media || '없음'}`);

    // 카테고리명 조회
    const categoryName = post.categories.length > 0
      ? await getCategoryName(post.categories[0])
      : '';
    console.log(`  카테고리: ${categoryName || '없음'}`);

    // 이미지 프롬프트 생성
    const prompts = buildImagePrompt(title, categoryName);

    // 이미지 생성
    console.log(`  이미지 생성 중 (Gemini)...`);
    let featuredBuffer: Buffer | null = null;
    try {
      const images = await imageService.generateImages(prompts);
      if (images.featured && images.featured.length > 0) {
        featuredBuffer = images.featured;
        console.log(`  ✓ 이미지 생성 완료 (${(featuredBuffer.length / 1024).toFixed(0)}KB)`);
      } else {
        console.log(`  ⚠ 이미지 생성 실패 — SVG 폴백 사용`);
      }
    } catch (err) {
      console.log(`  ⚠ 이미지 생성 오류 — SVG 폴백 사용: ${err instanceof Error ? err.message : err}`);
    }

    // SVG 폴백
    if (!featuredBuffer) {
      featuredBuffer = await buildFallbackSvg(title, categoryName, siteName);
      console.log(`  SVG 폴백 이미지 생성 (${(featuredBuffer.length / 1024).toFixed(0)}KB)`);
    }

    // WP 업로드
    const slug = post.slug || `post-${postId}`;
    const filename = `${slug}-featured-${new Date().getFullYear()}.${IMAGE_FORMAT}`;
    const altText = `${title} — ${categoryName}`.slice(0, 125);

    console.log(`  WP 업로드 중: ${filename}`);
    let mediaId: number;
    try {
      mediaId = await uploadMedia(featuredBuffer, filename, altText);
      console.log(`  ✓ 미디어 업로드 완료 (ID=${mediaId})`);
    } catch (err) {
      console.error(`  ✗ 미디어 업로드 실패: ${err instanceof Error ? err.message : err}`);
      continue;
    }

    // 대표이미지 설정
    try {
      await setFeaturedImage(postId, mediaId);
      console.log(`  ✓ 대표이미지 설정 완료 [Post ${postId} ← Media ${mediaId}]`);
    } catch (err) {
      console.error(`  ✗ 대표이미지 설정 실패: ${err instanceof Error ? err.message : err}`);
    }

    // Rate limit
    await new Promise(r => setTimeout(r, 2000));
  }

  console.log('\n=== 완료 ===');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
