/** Korean seasonal events calendar for proactive content production */
export const KOREAN_SEASONAL_EVENTS: Array<{
  name: string;
  /** Approximate date range (month-day) */
  startMonth: number;
  startDay: number;
  endMonth: number;
  endDay: number;
  /** Days before event to start producing content */
  leadTimeDays: number;
  /** Which niche categories benefit from this event */
  relevantNiches: string[];
  /** Suggested content angles */
  contentAngles: string[];
}> = [
  // Lead times extended to 45-60 days for major events (SEO indexing + ranking takes 30-45 days)
  { name: 'Seollal (Lunar New Year)', startMonth: 1, startDay: 20, endMonth: 2, endDay: 10, leadTimeDays: 60, relevantNiches: ['K-Entertainment', 'K-Beauty'], contentAngles: ['best K-dramas to watch during Seollal', 'K-pop idol Seollal greetings ranked', 'Korean holiday skincare gift sets', 'Hanbok beauty makeup looks'] },
  { name: 'Valentine\'s Day / White Day', startMonth: 2, startDay: 14, endMonth: 3, endDay: 14, leadTimeDays: 45, relevantNiches: ['K-Beauty', 'K-Entertainment'], contentAngles: ['best K-beauty gift sets for Valentine\'s Day', 'Korean skincare gift guide for her him', 'K-pop idol Valentine messages fan culture', 'White Day Korean gift guide skincare sets'] },
  { name: 'Cherry Blossom Season', startMonth: 3, startDay: 25, endMonth: 4, endDay: 15, leadTimeDays: 60, relevantNiches: ['K-Beauty', 'K-Entertainment'], contentAngles: ['spring skincare routine', 'K-beauty spring essentials', 'cherry blossom K-drama filming locations', 'spring comeback season K-pop preview'] },
  { name: 'Seoul Fashion Week', startMonth: 3, startDay: 24, endMonth: 4, endDay: 2, leadTimeDays: 30, relevantNiches: ['K-Beauty', 'K-Entertainment'], contentAngles: ['Seoul Fashion Week beauty trends 2026', 'K-pop idol Seoul Fashion Week looks', 'Korean runway makeup trends to try', 'best Korean beauty brands at Seoul Fashion Week'] },
  { name: 'Buddha\'s Birthday', startMonth: 5, startDay: 1, endMonth: 5, endDay: 15, leadTimeDays: 45, relevantNiches: ['K-Entertainment', 'K-Beauty'], contentAngles: ['K-pop idols spring comeback ranked', 'natural K-beauty skincare inspired by Korean traditions'] },
  { name: 'Summer Monsoon Season', startMonth: 6, startDay: 15, endMonth: 8, endDay: 15, leadTimeDays: 45, relevantNiches: ['K-Beauty', 'K-Entertainment'], contentAngles: ['summer skincare for humidity', 'best Korean sunscreen for summer', 'summer comeback season K-pop ranked', 'best K-dramas to watch this summer'] },
  { name: 'Chuseok (Korean Thanksgiving)', startMonth: 9, startDay: 5, endMonth: 9, endDay: 25, leadTimeDays: 60, relevantNiches: ['K-Entertainment', 'K-Beauty'], contentAngles: ['best K-dramas to binge during Chuseok', 'K-pop idol Chuseok content ranked', 'Korean beauty gift sets for Chuseok holiday'] },
  { name: 'Seoul Fashion Week (Fall)', startMonth: 10, startDay: 14, endMonth: 10, endDay: 22, leadTimeDays: 30, relevantNiches: ['K-Beauty', 'K-Entertainment'], contentAngles: ['Seoul Fashion Week fall beauty trends', 'K-pop idol fashion week street style', 'Korean fall skincare prep beauty guide'] },
  { name: 'MAMA Awards Season', startMonth: 11, startDay: 15, endMonth: 12, endDay: 5, leadTimeDays: 45, relevantNiches: ['K-Entertainment'], contentAngles: ['MAMA Awards predictions', 'K-pop year-end awards guide', 'best K-pop performances'] },
  { name: 'Pepero Day', startMonth: 11, startDay: 11, endMonth: 11, endDay: 11, leadTimeDays: 30, relevantNiches: ['K-Beauty', 'K-Entertainment'], contentAngles: ['Pepero Day K-beauty gift sets ranked', 'best Korean skincare gift box ideas Pepero Day', 'K-pop idol Pepero Day fan events guide'] },
  { name: 'Black Friday / Singles Day', startMonth: 11, startDay: 1, endMonth: 11, endDay: 30, leadTimeDays: 45, relevantNiches: ['K-Beauty'], contentAngles: ['best K-beauty Black Friday deals ranked', 'Olive Young sale picks', 'Amazon K-beauty holiday deals guide'] },
  { name: 'Year-End / New Year', startMonth: 12, startDay: 15, endMonth: 1, endDay: 5, leadTimeDays: 45, relevantNiches: ['K-Entertainment', 'K-Beauty'], contentAngles: ['best K-pop songs of the year ranked', 'K-drama year-end awards winners', 'best K-beauty products of the year', 'new year skincare reset routine'] },
  { name: 'Summer Olympics (if applicable)', startMonth: 7, startDay: 20, endMonth: 8, endDay: 12, leadTimeDays: 60, relevantNiches: ['K-Entertainment'], contentAngles: ['Korean athletes to watch at Olympics', 'K-pop songs for Olympic hype playlist'] },
  { name: 'K-Beauty Awards Season', startMonth: 12, startDay: 1, endMonth: 12, endDay: 31, leadTimeDays: 45, relevantNiches: ['K-Beauty'], contentAngles: ['best K-beauty products of the year', 'Olive Young award winners', 'skincare trends next year'] },
  { name: 'Circle Chart (Gaon) Year-End Awards', startMonth: 12, startDay: 20, endMonth: 12, endDay: 31, leadTimeDays: 45, relevantNiches: ['K-Entertainment'], contentAngles: ['Circle Chart year-end awards predictions', 'Gaon chart best songs of the year ranked', 'K-pop year-end chart winners 2026', 'Gayo Daejun SBS year-end show performers guide'] },
  { name: 'K-pop Spring Comeback Season', startMonth: 2, startDay: 1, endMonth: 4, endDay: 30, leadTimeDays: 60, relevantNiches: ['K-Entertainment'], contentAngles: ['spring comeback preview K-pop 2026', 'best K-pop comebacks spring ranked', 'new K-pop releases to watch'] },
  { name: 'K-pop Summer Comeback Season', startMonth: 6, startDay: 1, endMonth: 8, endDay: 31, leadTimeDays: 60, relevantNiches: ['K-Entertainment'], contentAngles: ['summer comeback season K-pop 2026', 'best K-pop summer releases ranked', 'K-pop festival season guide'] },
  { name: 'BIFF (Busan Film Festival)', startMonth: 10, startDay: 1, endMonth: 10, endDay: 12, leadTimeDays: 45, relevantNiches: ['K-Entertainment'], contentAngles: ['BIFF highlights', 'Korean cinema spotlight', 'best Korean films at BIFF'] },
];

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

/** Niche-specific author profiles for visible E-E-A-T bio sections (primary persona) */
export const NICHE_AUTHOR_PROFILES: Record<string, AuthorProfile> = {
  'K-Beauty': {
    name: 'Sophie Kim',
    title: 'K-Beauty & Skincare Specialist',
    bio: 'Researching Korean skincare innovations, ingredient science, and beauty industry trends. Providing evidence-based product analysis and routine recommendations backed by dermatological research and Korean cosmetic formulation expertise.',
    expertise: ['Korean skincare formulations', 'K-beauty ingredient analysis', 'Olive Young product reviews', 'Korean sunscreen technology', 'Glass skin routines'],
    credentials: ['Cosmetic Science Researcher', 'Korean Beauty Industry Analyst'],
    yearsExperience: 6,
  },
  'K-Entertainment': {
    name: 'Jamie Yoon',
    title: 'K-Pop & K-Drama Culture Writer',
    bio: 'Deeply embedded in the global K-pop and K-drama fan community. Covering comeback seasons, idol news, drama recommendations, award show predictions, and the fan experiences that define Hallyu culture worldwide.',
    expertise: ['K-pop fandom culture', 'K-drama recommendations & rankings', 'Idol comeback news', 'Award show predictions', 'Fan community & Hallyu culture'],
    credentials: ['Hallyu Culture Researcher', 'K-Entertainment Content Writer'],
    yearsExperience: 7,
  },
};

/** Multiple author personas per niche for voice rotation (academic, casual, enthusiast) */
export const NICHE_AUTHOR_PERSONAS: Record<string, AuthorProfile[]> = {
  'K-Beauty': [
    NICHE_AUTHOR_PROFILES['K-Beauty'],
    {
      name: 'Mia Cho',
      title: 'K-Beauty Product Tester',
      bio: 'Testing and reviewing Korean skincare products hands-on, with a focus on ingredient transparency, texture analysis, and real-world routine results. Sensitive skin perspective.',
      expertise: ['Product texture analysis', 'Sensitive skin routines', 'Olive Young hauls', 'Korean drugstore picks'],
      credentials: ['Certified Cosmetic Ingredient Reviewer', 'K-Beauty Content Creator'],
      yearsExperience: 5,
    },
    {
      name: 'Ella Park',
      title: 'K-Beauty Hair & Makeup Specialist',
      bio: 'Covering the full spectrum of Korean beauty — from viral makeup looks and K-pop idol beauty trends to hair loss treatments and scalp care innovations. Focused on products available on Amazon and Olive Young.',
      expertise: ['Korean makeup brands', 'K-pop idol makeup looks', 'Korean hair loss treatments', 'Scalp care', 'Korean cosmetics on Amazon'],
      credentials: ['Korean Beauty Content Specialist', 'Makeup & Haircare Product Reviewer'],
      yearsExperience: 4,
    },
  ],
  'K-Entertainment': [
    NICHE_AUTHOR_PROFILES['K-Entertainment'],
    {
      name: 'Alex Han',
      title: 'K-Pop & Hallyu Culture Writer',
      bio: 'Exploring Korean pop culture through the lens of global fandom, concert economics, and digital content trends. Covering everything from comeback strategies to fan community dynamics.',
      expertise: ['K-pop fandom economics', 'Concert & tour analysis', 'Digital content trends', 'Fan community dynamics'],
      credentials: ['Hallyu Culture Researcher', 'Digital Media Analyst'],
      yearsExperience: 5,
    },
    {
      name: 'Sora Lee',
      title: 'K-Drama & Korean Cinema Critic',
      bio: 'Dedicated to Korean drama and film criticism for international audiences. Specializing in webtoon-to-screen adaptations, streaming platform guides, OST rankings, and breakout actor spotlights. Translating the nuances of Korean storytelling for global fans.',
      expertise: ['K-drama reviews & rankings', 'Webtoon adaptation analysis', 'K-drama OST rankings', 'Netflix & streaming platform guides', 'Korean film & cinema'],
      credentials: ['Korean Media Studies Researcher', 'K-Drama Content Specialist'],
      yearsExperience: 6,
    },
  ],
};

/** Content-type to persona voice mapping for automatic rotation */
export const CONTENT_TYPE_PERSONA_MAP: Record<string, 'primary' | 'secondary' | 'tertiary'> = {
  'deep-dive': 'primary',
  'analysis': 'primary',
  'case-study': 'primary',
  'news-explainer': 'primary',
  'how-to': 'tertiary',       // K-Beauty: Ella Park (makeup/hair how-to); K-Entertainment: Sora Lee (drama how-to)
  'listicle': 'secondary',
  'best-x-for-y': 'secondary',
  'x-vs-y': 'tertiary',       // K-Beauty: Ella Park (product comparisons); K-Entertainment: Sora Lee (drama vs drama)
  'product-review': 'secondary',
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
  /** Whether this niche is enabled (default true) */
  enabled?: boolean;
}

/** Per-category optimal publish timing (override GA4 when no data available) */
export const CATEGORY_PUBLISH_TIMING: Record<string, { optimalHour: number; bestDays: number[] }> = {
  'Korean Tech': { optimalHour: 8, bestDays: [1, 2, 3] },        // Mon-Wed morning (tech news cycle)
  'Korean Finance': { optimalHour: 7, bestDays: [1, 2] },         // Mon-Tue early morning (market open)
  'K-Beauty': { optimalHour: 10, bestDays: [5, 6, 0] },           // Weekend morning (lifestyle shopping)
  'Korea Travel': { optimalHour: 10, bestDays: [6, 0, 5] },       // Weekend + Friday (trip planning)
  'K-Entertainment': { optimalHour: 9, bestDays: [4, 5, 6] },     // Thu-Sat KST morning = Wed-Fri EST evening (global fan prime time)
};

/** Niche-specific disclaimer templates for legal compliance */
export const NICHE_DISCLAIMERS: Record<string, string> = {
  'Korean Finance': '<div class="ab-disclaimer-finance" style="margin:0 0 24px 0; padding:16px 20px; background:#fff8e1; border:1px solid #ffe082; border-radius:8px; font-size:13px; color:#666; line-height:1.6;"><strong>Financial Disclaimer:</strong> The information in this article is for educational and informational purposes only and should not be construed as financial, investment, or tax advice. Past performance does not guarantee future results. Investing in Korean securities involves risks, including currency exchange risk and potential loss of principal. Always consult a qualified financial advisor before making investment decisions. The author and TrendHunt are not licensed financial advisors.</div>',
  'K-Beauty': '<div class="ab-disclaimer-beauty" style="margin:0 0 24px 0; padding:16px 20px; background:#f0fff4; border:1px solid #c6f6d5; border-radius:8px; font-size:13px; color:#666; line-height:1.6;"><strong>Skincare Disclaimer:</strong> Product recommendations are based on research and editorial analysis. Individual results may vary. Always patch-test new products and consult a dermatologist for specific skin concerns. This content is not medical advice.</div>',
  'K-Entertainment': '<div class="ab-disclaimer-entertainment" style="margin:0 0 24px 0; padding:16px 20px; background:#f0f4ff; border:1px solid #c6d6f6; border-radius:8px; font-size:13px; color:#666; line-height:1.6;"><strong>Entertainment Disclaimer:</strong> Schedule, comeback, and project information is based on publicly available sources and may change without notice. This content represents editorial analysis and fan perspective, not official announcements from artists or agencies.</div>',
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
  /** Poll question for engagement (generated by Claude) */
  pollQuestion?: { question: string; options: string[] };
  /** Product mentions for affiliate link injection */
  productMentions?: Array<{ name: string; category: string }>;
  /** Shorter social-optimized title for OG/Facebook (max 50 chars) */
  ogTitle?: string;
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
  slug?: string;
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
  /** Estimated RPM for this post (from GA4 pageviews × niche RPM) */
  estimatedRpm?: number;
  /** Estimated monthly revenue for this post */
  estimatedRevenue?: number;
  /** Number of affiliate links in the post (for ROI tracking) */
  affiliateLinkCount?: number;
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
  /** Korean version post URL (hreflang sync) */
  koreanPostUrl?: string;
  /** Last time this post was refreshed/rewritten */
  lastRefreshedAt?: string;
  /** Last modified date for content freshness signal (visible to users + JSON-LD dateModified) */
  lastModifiedDate?: string;
  /** A/B test excerpt variants */
  excerptCandidates?: string[];
  /** A/B test: active excerpt variant index */
  activeExcerptVariant?: number;
  /** Search intent classification for funnel stage mapping */
  searchIntent?: string;
  /** Featured image URL for performance tracking and reuse */
  featuredImageUrl?: string;
  /** Featured image WordPress media ID */
  featuredImageMediaId?: number;
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
  /** Actual AdSense revenue from GA4 (for RPM feedback loop) */
  actualRevenue?: number;
  /** Actual pageviews from GA4 (for RPM calculation) */
  pageviews?: number;
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
