/**
 * 단일 종목 테스트 발행 스크립트 (WordPress + SNS + Shorts 전체 파이프라인)
 * 사용법: node --env-file=.env --import tsx/esm src/scripts/test-single-stock.ts 011500 한농화성
 */
import { loadConfig } from '../config/env.js';
import { buildStockNiches } from '../config/niches.js';
import { TradeEngineBridge } from '../services/trade-engine-bridge.service.js';
import { KeywordResearchService } from '../services/keyword-research.service.js';
import { ContentGeneratorService } from '../services/content-generator.service.js';
import { ImageGeneratorService } from '../services/image-generator.service.js';
import { WordPressService } from '../services/wordpress.service.js';
import { NaverMarketDataService } from '../services/naver-market-data.service.js';
import { TwitterService } from '../services/twitter.service.js';
import { FacebookService } from '../services/facebook.service.js';
import { ThreadsService } from '../services/threads.service.js';
import { LinkedInService } from '../services/linkedin.service.js';
import { ShortsGeneratorService } from '../services/shorts-generator.service.js';
import { PostHistory } from '../utils/history.js';
import { logger } from '../utils/logger.js';
import { resolvePostUrl } from '../utils/utm.js';
import type { LiveWatchlistItem } from '../services/trade-engine-bridge.service.js';

const [stockCode, ...nameParts] = process.argv.slice(2);
const stockName = nameParts.join(' ');

if (!stockCode || !stockName) {
  logger.error('Usage: test-single-stock.ts <stock_code> <stock_name>');
  logger.error('Example: test-single-stock.ts 011500 한농화성');
  process.exit(1);
}

async function main() {
  logger.info(`=== 단일 종목 테스트 발행 (전체 파이프라인): ${stockName}(${stockCode}) ===`);

  const config = loadConfig();
  const history = new PostHistory();
  await history.load();

  // [1] Naver Finance 실시간 데이터 fetch
  const marketDataService = new NaverMarketDataService();
  logger.info('[1] 네이버 금융 실시간 데이터 fetch...');
  const stockData = await marketDataService.fetchStockSummary(stockCode, stockName);
  if (stockData) {
    const rateSign = stockData.rate >= 0 ? '+' : '';
    logger.info(`현재가: ${stockData.price.toLocaleString('ko-KR')}원, 등락: ${rateSign}${stockData.rate}%`);
  } else {
    logger.warn('네이버 금융 데이터 없음 — 지표 없이 진행');
  }

  // mock LiveWatchlistItem
  const mockStock: LiveWatchlistItem = {
    stock_code: stockCode,
    stock_name: stockName,
    score: 80,
    ranked_score: 80,
    confidence: 0.8,
    signal_count: 3,
    sector: '화학',
    indicators: {
      rsi: 40,
      macd: 0,
      macd_signal: 0,
      bb_upper: stockData ? stockData.price * 1.05 : 0,
      bb_lower: stockData ? stockData.price * 0.95 : 0,
      close: stockData?.price ?? 0,
      atr_14: 0,
      vol_surge: 0,
      day_change_pct: stockData ? String(stockData.rate) : '0',
      foreign_net_buy: 0,
      institution_net_buy: 0,
      individual_net_buy: 0,
      swing_reasons: '기술적 매수 시그널 발생',
      market: 'KOSPI',
    },
  };

  // [2] 종목 니치 생성
  const [niche] = buildStockNiches([mockStock], 1);
  logger.info(`[2] 니치 생성: "${niche.name}"`);

  // [3] Trade Engine 컨텍스트 로드
  const tradeEngineBridge = new TradeEngineBridge();
  const tradeEngineData = tradeEngineBridge.loadData();

  // 서비스 초기화
  const authorLinks = {
    linkedin: config.AUTHOR_LINKEDIN,
    twitter: config.AUTHOR_TWITTER,
    website: config.AUTHOR_WEBSITE,
    credentials: config.AUTHOR_CREDENTIALS,
  };
  const researchService = new KeywordResearchService(
    config.ANTHROPIC_API_KEY, config.TRENDS_GEO,
    config.REDDIT_CLIENT_ID && config.REDDIT_CLIENT_SECRET
      ? { clientId: config.REDDIT_CLIENT_ID, clientSecret: config.REDDIT_CLIENT_SECRET }
      : undefined,
    config.SERPAPI_KEY || undefined,
  );
  const contentService = new ContentGeneratorService(
    config.ANTHROPIC_API_KEY, config.SITE_OWNER, config.WP_URL,
    config.MIN_QUALITY_SCORE, authorLinks,
  );
  const imageService = new ImageGeneratorService(config.GEMINI_API_KEY, config.IMAGE_FORMAT);
  const wpService = new WordPressService(
    config.WP_URL, config.WP_USERNAME, config.WP_APP_PASSWORD,
    config.SITE_OWNER, authorLinks, config.ADSENSE_PUB_ID || undefined,
  );

  // SNS 서비스 초기화
  const twitterService = config.X_API_KEY && config.X_API_SECRET && config.X_ACCESS_TOKEN && config.X_ACCESS_TOKEN_SECRET
    ? new TwitterService(config.X_API_KEY, config.X_API_SECRET, config.X_ACCESS_TOKEN, config.X_ACCESS_TOKEN_SECRET)
    : null;
  const facebookService = config.FB_ACCESS_TOKEN && config.FB_PAGE_ID
    ? new FacebookService(config.FB_ACCESS_TOKEN, config.FB_PAGE_ID)
    : null;
  const threadsService = config.THREADS_ACCESS_TOKEN && config.THREADS_USER_ID
    ? new ThreadsService(config.THREADS_ACCESS_TOKEN, config.THREADS_USER_ID)
    : null;
  const linkedinService = config.LINKEDIN_ACCESS_TOKEN && config.LINKEDIN_PERSON_ID
    ? new LinkedInService(config.LINKEDIN_ACCESS_TOKEN, config.LINKEDIN_PERSON_ID)
    : null;
  const shortsService = new ShortsGeneratorService(
    '', '',
    process.env.YOUTUBE_CLIENT_ID,
    process.env.YOUTUBE_CLIENT_SECRET,
    process.env.YOUTUBE_REFRESH_TOKEN,
  );

  logger.info(`SNS: Twitter=${!!twitterService}, Facebook=${!!facebookService}, Threads=${!!threadsService}, LinkedIn=${!!linkedinService}`);

  // [4] 키워드 리서치
  logger.info('[4] 키워드 리서치...');
  const postedKeywords = history.getPostedKeywordsForNiche(niche.id);
  const recentContentTypes = history.getRecentContentTypes(niche.id, 5);
  const researched = await researchService.researchKeyword(niche, postedKeywords, recentContentTypes);
  logger.info(`키워드 선정: "${researched.analysis.selectedKeyword}" (${researched.analysis.contentType})`);

  // [5] 종목 컨텍스트 주입
  logger.info('[5] 종목 컨텍스트 주입...');
  const buyCandidateCtx = tradeEngineBridge.buildBuyCandidateContext(tradeEngineData, 0, 1);
  let stockCtx = buyCandidateCtx;
  if (stockData) stockCtx += '\n' + stockData.promptContext;
  contentService.setStockContext(stockCtx);

  // [6] 콘텐츠 생성
  logger.info('[6] 콘텐츠 생성 (Claude Opus)...');
  const rankingKeywords = new Map<string, { keyword: string; position: number; impressions: number }>();
  const content = await contentService.generateContent(researched, [], [], {
    postCount: postedKeywords.length,
    rankingKeywords,
    similarPostTitles: [],
  });
  logger.info(`생성 완료: "${content.title}"`);

  // [7] 이미지 생성 & 업로드
  logger.info('[7] 이미지 생성 & 업로드...');
  let featuredImageId: number | undefined;
  let featuredImageUrl: string | undefined;
  try {
    const images = await imageService.generateImages(content.imagePrompts);
    const filename = `${stockCode}-${Date.now()}.jpg`;
    const mediaResult = await wpService.uploadMedia(images.featured, filename, `${researched.analysis.selectedKeyword} 매수후보 분석`);
    featuredImageId = mediaResult.mediaId;
    featuredImageUrl = mediaResult.sourceUrl;
    logger.info(`이미지 업로드 완료 (ID: ${featuredImageId})`);
  } catch (e) {
    logger.warn(`이미지 생성/업로드 실패 (non-fatal): ${e instanceof Error ? e.message : e}`);
  }

  // [8] WordPress 발행 (publish)
  logger.info('[8] WordPress 발행 (publish)...');
  const post = await wpService.createPost(
    content,
    featuredImageId,
    undefined,
    {
      contentType: researched.analysis.contentType,
      keyword: researched.analysis.selectedKeyword,
      publishStatus: 'publish',
    },
  );
  logger.info(`발행 완료: ${post.url}`);

  // [9] SNS 발행
  logger.info('[9] SNS 발행...');

  if (facebookService) {
    try {
      const fbId = await facebookService.promoteBlogPost(content, post);
      if (fbId) logger.info(`Facebook 발행 완료: ${fbId}`);
    } catch (e) {
      logger.warn(`Facebook 실패: ${e instanceof Error ? e.message : e}`);
    }
  }

  if (threadsService) {
    try {
      const threadsId = await threadsService.promoteBlogPost(content, post);
      if (threadsId) logger.info(`Threads 발행 완료: ${threadsId}`);
    } catch (e) {
      logger.warn(`Threads 실패: ${e instanceof Error ? e.message : e}`);
    }
  }

  if (linkedinService) {
    try {
      const linkedinId = await linkedinService.promoteBlogPost(content.title, content.excerpt, resolvePostUrl(post), featuredImageUrl);
      if (linkedinId) logger.info(`LinkedIn 발행 완료: ${linkedinId}`);
    } catch (e) {
      logger.warn(`LinkedIn 실패: ${e instanceof Error ? e.message : e}`);
    }
  }

  if (twitterService) {
    try {
      const tweetId = await twitterService.promoteBlogPost(content, post);
      if (tweetId) logger.info(`Twitter(X) 발행 완료: ${tweetId}`);
    } catch (e) {
      logger.warn(`Twitter 실패: ${e instanceof Error ? e.message : e}`);
    }
  }

  // [10] YouTube Shorts 생성
  logger.info('[10] YouTube Shorts 생성...');
  try {
    const shortsPath = await shortsService.generate(content, post, researched.analysis.selectedKeyword, stockCode);
    if (shortsPath) logger.info(`Shorts 생성 완료: ${shortsPath}`);
  } catch (e) {
    logger.warn(`Shorts 실패: ${e instanceof Error ? e.message : e}`);
  }

  logger.info('=== 테스트 완료 ===');
  logger.info(`WordPress: ${post.url}`);
  logger.info(`관리자: ${config.WP_URL}/wp-admin/post.php?post=${post.postId}&action=edit`);
}

main().catch(err => {
  logger.error(`테스트 실패: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
