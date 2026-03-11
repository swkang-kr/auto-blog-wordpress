/** 콘텐츠 유형 */
export type ContentType = 'how-to' | 'best-x-for-y' | 'x-vs-y' | 'analysis' | 'deep-dive' | 'news-explainer' | 'listicle' | 'case-study' | 'product-review';

/** Content freshness classification — determines update frequency */
export type FreshnessClass = 'evergreen' | 'seasonal' | 'time-sensitive';

/** Map content types to freshness class for automatic content lifecycle management */
export const CONTENT_FRESHNESS_MAP: Record<ContentType, FreshnessClass> = {
  'how-to': 'evergreen',
  'deep-dive': 'evergreen',
  'case-study': 'evergreen',
  'best-x-for-y': 'seasonal',      // Rankings change, update quarterly
  'x-vs-y': 'seasonal',             // Specs/features change
  'analysis': 'seasonal',            // Data-driven, update quarterly
  'listicle': 'seasonal',            // Lists evolve
  'product-review': 'seasonal',
  'news-explainer': 'time-sensitive', // Decays fast, flag for archive after 6 months
};

/** Recommended update intervals in days per freshness class */
export const FRESHNESS_UPDATE_INTERVALS: Record<FreshnessClass, number> = {
  'evergreen': 180,       // Semi-annual review (more aggressive freshness)
  'seasonal': 60,         // Bi-monthly update
  'time-sensitive': 180,  // Archive or update flag after 6 months
};

/** Author profile for E-E-A-T credibility signals */
export interface AuthorProfile {
  name: string;
  title: string;
  bio: string;
  expertise: string[];
  credentials: string[];
  /** Years of experience in the domain */
  yearsExperience: number;
}

/** Niche-specific author profiles for visible E-E-A-T bio sections */
export const NICHE_AUTHOR_PROFILES: Record<string, AuthorProfile> = {
  'Korean Tech': {
    name: '', // Filled from SITE_OWNER env
    title: 'Korea Tech & Semiconductor Analyst',
    bio: 'Covering Korean technology, AI, and semiconductor industries with a focus on Samsung, SK Hynix, and the broader Korean tech ecosystem. Tracking Korea\'s role in global AI infrastructure, chip manufacturing, and digital innovation.',
    expertise: ['Korean semiconductor industry', 'AI & machine learning in Korea', 'Korean tech startups', 'Samsung Electronics strategy', 'SK Hynix HBM memory'],
    credentials: ['Korea Technology Market Researcher', 'Published analyst covering KOSDAQ tech sector'],
    yearsExperience: 5,
  },
  'Korean Finance': {
    name: '',
    title: 'Korean Markets & Investment Analyst',
    bio: 'Analyzing Korean financial markets, KOSPI/KOSDAQ indices, and investment opportunities for international investors. Specializing in Korean economic policy, BOK interest rate analysis, and cross-border investment strategies.',
    expertise: ['KOSPI & KOSDAQ analysis', 'Korean ETF investing', 'BOK monetary policy', 'Korean won forex', 'Chaebol financial analysis'],
    credentials: ['Certified Financial Analyst', 'Korean Capital Markets Specialist'],
    yearsExperience: 7,
  },
  'K-Beauty': {
    name: '',
    title: 'K-Beauty & Skincare Specialist',
    bio: 'Researching Korean skincare innovations, ingredient science, and beauty industry trends. Providing evidence-based product analysis and routine recommendations backed by dermatological research and Korean cosmetic formulation expertise.',
    expertise: ['Korean skincare formulations', 'K-beauty ingredient analysis', 'Olive Young product reviews', 'Korean sunscreen technology', 'Glass skin routines'],
    credentials: ['Cosmetic Science Researcher', 'Korean Beauty Industry Analyst'],
    yearsExperience: 4,
  },
  'Korea Travel': {
    name: '',
    title: 'Korea Travel & Expat Life Writer',
    bio: 'Writing practical guides for travelers and expats navigating South Korea. From Seoul subway tips to countryside adventures, providing first-hand insights on Korean culture, costs, visas, and daily life for international visitors.',
    expertise: ['Seoul travel logistics', 'Korean visa requirements', 'Cost of living in Korea', 'Korean food culture', 'Expat life in Seoul'],
    credentials: ['Resident Korea Travel Writer', 'Published in major travel platforms'],
    yearsExperience: 5,
  },
  'K-Entertainment': {
    name: '',
    title: 'K-Entertainment Business Analyst',
    bio: 'Analyzing the business side of K-pop, K-drama, and Korean content industries. Covering agency financials (HYBE, SM, JYP), global streaming strategies, and the economics behind Korea\'s cultural export dominance.',
    expertise: ['K-pop business models', 'Korean entertainment stocks', 'K-drama streaming economics', 'Webtoon industry', 'Korean content global expansion'],
    credentials: ['Korean Entertainment Industry Researcher', 'Media & Entertainment Analyst'],
    yearsExperience: 4,
  },
};

/** 니치 설정 */
export interface NicheConfig {
  id: string;
  name: string;
  category: string;
  /** Broad 1-2 word term used for Google Trends rising query discovery */
  broadTerm: string;
  /** Fallback seed keywords used when Trends API returns no rising queries */
  seedKeywords: string[];
  contentTypes: ContentType[];
  /** AdSense RPM tier for niche-specific ad density tuning */
  adSenseRpm?: 'high' | 'medium' | 'low';
  /** Dynamic RPM value learned from GA4 (overrides static tier) */
  dynamicRpmValue?: number;
}

/** Per-category optimal publish timing (override GA4 when no data available) */
export const CATEGORY_PUBLISH_TIMING: Record<string, { optimalHour: number; bestDays: number[] }> = {
  'Korean Tech': { optimalHour: 8, bestDays: [1, 2, 3] },        // Mon-Wed morning (tech news cycle)
  'Korean Finance': { optimalHour: 7, bestDays: [1, 2] },         // Mon-Tue early morning (market open)
  'K-Beauty': { optimalHour: 10, bestDays: [5, 6, 0] },           // Weekend morning (lifestyle shopping)
  'Korea Travel': { optimalHour: 10, bestDays: [6, 0, 5] },       // Weekend + Friday (trip planning)
  'K-Entertainment': { optimalHour: 18, bestDays: [4, 5, 6] },    // Thu-Sat evening (leisure time)
};

/** Niche-specific disclaimer templates for legal compliance */
export const NICHE_DISCLAIMERS: Record<string, string> = {
  'Korean Finance': '<div class="ab-disclaimer-finance" style="margin:0 0 24px 0; padding:16px 20px; background:#fff8e1; border:1px solid #ffe082; border-radius:8px; font-size:13px; color:#666; line-height:1.6;"><strong>Financial Disclaimer:</strong> The information in this article is for educational and informational purposes only and should not be construed as financial, investment, or tax advice. Past performance does not guarantee future results. Investing in Korean securities involves risks, including currency exchange risk and potential loss of principal. Always consult a qualified financial advisor before making investment decisions. The author and TrendHunt are not licensed financial advisors.</div>',
  'K-Beauty': '<div class="ab-disclaimer-beauty" style="margin:0 0 24px 0; padding:16px 20px; background:#f0fff4; border:1px solid #c6f6d5; border-radius:8px; font-size:13px; color:#666; line-height:1.6;"><strong>Skincare Disclaimer:</strong> Product recommendations are based on research and editorial analysis. Individual results may vary. Always patch-test new products and consult a dermatologist for specific skin concerns. This content is not medical advice.</div>',
};

/** Search intent to valid content type mapping for enforcement */
export const INTENT_CONTENT_TYPE_MAP: Record<string, string[]> = {
  'transactional': ['product-review', 'best-x-for-y', 'how-to'],
  'commercial': ['best-x-for-y', 'x-vs-y', 'product-review', 'listicle', 'analysis'],
  'commercial-investigation': ['x-vs-y', 'best-x-for-y', 'product-review', 'analysis', 'listicle', 'deep-dive'],
  'informational': ['how-to', 'deep-dive', 'analysis', 'news-explainer', 'case-study', 'listicle'],
  'navigational': ['deep-dive', 'news-explainer', 'how-to'],
};

/** Google Trends rising query entry */
export interface RisingQuery {
  query: string;
  /** Growth percentage or "Breakout" (5000%+) */
  value: number | 'Breakout';
}

/** Google Trends API 결과 */
export interface TrendsData {
  keyword: string;
  interestOverTime: number[];
  relatedTopics: string[];
  relatedQueries: string[];
  averageInterest: number;
  trendDirection: 'rising' | 'stable' | 'declining';
  hasBreakout: boolean;
}

/** Claude 키워드 분석 결과 */
export interface KeywordAnalysis {
  selectedKeyword: string;
  contentType: ContentType;
  suggestedTitle: string;
  uniqueAngle: string;
  searchIntent: 'informational' | 'commercial' | 'commercial-investigation' | 'transactional' | 'navigational';
  estimatedCompetition: 'low' | 'medium' | 'high';
  /** Keyword difficulty score 0-100 (estimated from SERP signals + trend data) */
  keywordDifficulty?: number;
  /** Estimated monthly search volume tier */
  volumeEstimate?: 'high' | 'medium' | 'low' | 'minimal';
  /** Estimated monthly search volume number (rough estimate from Trends data) */
  estimatedMonthlySearches?: number;
  reasoning: string;
  relatedKeywordsToInclude: string[];
  /** Long-tail keyword variants for satellite content strategy */
  longTailVariants?: string[];
}

/** 최종 키워드 리서치 결과 */
export interface ResearchedKeyword {
  niche: NicheConfig;
  trendsData: TrendsData[];
  analysis: KeywordAnalysis;
}

/** Claude API가 생성한 블로그 콘텐츠 */
export interface BlogContent {
  title: string;
  slug?: string;
  html: string;
  excerpt: string;
  tags: string[];
  category: string;
  imagePrompts: string[];
  imageCaptions: string[];
  /** Content quality score (0-100) from post-generation validation */
  qualityScore?: number;
  /** SEO-optimized meta description (separate from excerpt, 145-158 chars) */
  metaDescription?: string;
  /** Alternative title candidates for A/B testing (2-3 options) */
  titleCandidates?: string[];
  /** CTR-optimized meta description (benefit + keyword + CTA, 145-158 chars) */
  ctrMetaDescription?: string;
  /** Number of affiliate links detected in content */
  affiliateLinksCount?: number;
  /** Search intent from keyword research */
  searchIntent?: 'informational' | 'commercial' | 'commercial-investigation' | 'transactional' | 'navigational';
  /** FAQ items extracted from content for FAQ JSON-LD schema */
  faqItems?: Array<{ question: string; answer: string }>;
  /** HowTo steps extracted from content for HowTo JSON-LD schema */
  howToSteps?: Array<{ name: string; text: string }>;
  /** YouTube video URL to embed in the post */
  youtubeVideoUrl?: string;
  /** YouTube video title for Video schema */
  youtubeVideoTitle?: string;
  /** Whether this is an original research/survey-based post */
  isOriginalResearch?: boolean;
  /** Lead magnet CTA text injected in content */
  leadMagnetCta?: string;
}

/** WordPress 미디어 업로드 결과 */
export interface MediaUploadResult {
  mediaId: number;
  sourceUrl: string;
}

/** Gemini API가 생성한 이미지 결과 */
export interface ImageResult {
  featured: Buffer;
  inline: Buffer[];
}

/** WordPress에 발행된 포스트 정보 */
export interface PublishedPost {
  postId: number;
  url: string;
  title: string;
  featuredImageId: number;
}

/** 내부 링크용 기존 포스트 정보 */
export interface ExistingPost {
  title: string;
  url: string;
  category: string;
  /** Primary keyword for better anchor text generation */
  keyword?: string;
  /** Post slug for context */
  slug?: string;
  /** WordPress post ID for update targeting */
  postId?: number;
  /** Original publish date ISO string */
  publishedAt?: string;
  /** Sub-niche ID for topic cluster linking */
  subNiche?: string;
}

/** GA4 performance data for feedback loop */
export interface PostPerformance {
  url: string;
  pageviews: number;
  avgEngagementTime: number;
  bounceRate: number;
  keyword?: string;
  category?: string;
}

/** 포스팅 이력 (중복 방지용) */
export interface PostHistoryEntry {
  keyword: string;
  postId: number;
  postUrl: string;
  publishedAt: string;
  niche?: string;
  contentType?: ContentType;
  engagementScore?: number;
  /** A/B title candidates for testing */
  titleCandidates?: string[];
  /** Whether A/B title test has been resolved */
  titleTestResolved?: boolean;
  /** Winning title variant from A/B test (for learning) */
  titleTestWinner?: string;
  /** A/B rotation Phase A CTR (recorded at day 3) */
  titleTestPhaseACtr?: number;
  /** A/B rotation Phase A title text */
  titleTestPhaseATitle?: string;
  /** Whether Phase B (alternative title) rotation has started */
  titleTestPhaseBStarted?: boolean;
  /** A/B rotation Phase B title text */
  titleTestPhaseBTitle?: string;
  /** A/B rotation Phase B CTR (recorded at day 6) */
  titleTestPhaseBCtr?: number;
  /** Original post title (for A/B test revert) */
  originalTitle?: string;
  /** Series ID for multi-part content (e.g., "korean-stocks-101") */
  seriesId?: string;
  /** Part number within a series */
  seriesPart?: number;
  /** Keyword position tracking history (date → position) */
  rankingHistory?: Array<{ date: string; position: number; clicks: number; impressions: number }>;
  /** Last known keyword ranking position */
  lastPosition?: number;
  /** Title pattern classification for CTR analysis */
  titlePattern?: string;
}

/** Ranking milestone event for Telegram alerts */
export interface RankingMilestone {
  keyword: string;
  postUrl: string;
  event: 'hit-top1' | 'hit-top3' | 'hit-top10' | 'dropped-from-top10';
  previousPosition: number;
  currentPosition: number;
}

/** Featured snippet opportunity from GSC */
export interface FeaturedSnippetOpportunity {
  query: string;
  position: number;
  impressions: number;
  ctr: number;
  /** Type of snippet to target */
  snippetType: 'paragraph' | 'list' | 'table';
}

/** Dynamic RPM data learned from GA4 */
export interface DynamicRpmData {
  category: string;
  contentType?: string;
  rpm: number;
  sampleSize: number;
  lastUpdated: string;
}

/** 전체 포스팅 이력 파일 구조 */
export interface PostHistoryData {
  entries: PostHistoryEntry[];
  lastRunAt: string;
  totalPosts: number;
  categoryLastPublished?: Record<string, string>;
  /** Learned RPM data from GA4 (updated monthly) */
  dynamicRpm?: DynamicRpmData[];
}

/** 개별 포스트 처리 결과 */
export interface PostResult {
  keyword: string;
  niche: string;
  success: boolean;
  postId?: number;
  postUrl?: string;
  error?: string;
  duration: number;
}

/** Topic cluster mapping for explicit pillar-supporting relationship tracking */
export interface TopicCluster {
  /** Unique cluster identifier (e.g., niche id or topic slug) */
  clusterId: string;
  /** WordPress post ID of the pillar page */
  pillarPostId?: number;
  /** WordPress post IDs of supporting (satellite) posts */
  supportingPostIds: number[];
  /** Niche category this cluster belongs to */
  category: string;
  /** Sub-topics covered by supporting posts */
  coveredSubTopics: string[];
  /** Last time cluster was analyzed */
  lastAnalyzed?: string;
}

/** 배치 실행 전체 결과 */
export interface BatchResult {
  startedAt: string;
  completedAt: string;
  totalKeywords: number;
  successCount: number;
  failureCount: number;
  skippedCount: number;
  results: PostResult[];
}
