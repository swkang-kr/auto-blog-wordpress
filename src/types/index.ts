
/** Korean financial events calendar for proactive content production */
export const KOREAN_SEASONAL_EVENTS: Array<{
  name: string;
  startMonth: number;
  startDay: number;
  endMonth: number;
  endDay: number;
  leadTimeDays: number;
  relevantNiches: string[];
  contentAngles: string[];
}> = [
  { name: 'Q4 Earnings Season Korea', startMonth: 1, startDay: 15, endMonth: 2, endDay: 15, leadTimeDays: 30, relevantNiches: ['시장분석'], contentAngles: ['Korean stock Q4 earnings preview', 'Samsung SK Hynix earnings impact'] },
  { name: 'Q1 Earnings Season Korea', startMonth: 4, startDay: 15, endMonth: 5, endDay: 15, leadTimeDays: 30, relevantNiches: ['시장분석'], contentAngles: ['Korean stock Q1 earnings preview', 'semiconductor earnings outlook'] },
  { name: 'Q2 Earnings Season Korea', startMonth: 7, startDay: 15, endMonth: 8, endDay: 15, leadTimeDays: 30, relevantNiches: ['시장분석'], contentAngles: ['Korean stock Q2 mid-year review'] },
  { name: 'Q3 Earnings Season Korea', startMonth: 10, startDay: 15, endMonth: 11, endDay: 15, leadTimeDays: 30, relevantNiches: ['시장분석'], contentAngles: ['Korean stock Q3 earnings preview'] },
  { name: 'BOK Rate Decision (Jan)', startMonth: 1, startDay: 10, endMonth: 1, endDay: 20, leadTimeDays: 14, relevantNiches: ['시장분석'], contentAngles: ['Bank of Korea rate decision analysis'] },
  { name: 'BOK Rate Decision (Apr)', startMonth: 4, startDay: 1, endMonth: 4, endDay: 15, leadTimeDays: 14, relevantNiches: ['시장분석'], contentAngles: ['BOK April rate impact analysis'] },
  { name: 'BOK Rate Decision (Jul)', startMonth: 7, startDay: 1, endMonth: 7, endDay: 15, leadTimeDays: 14, relevantNiches: ['시장분석'], contentAngles: ['BOK July rate decision analysis'] },
  { name: 'BOK Rate Decision (Oct)', startMonth: 10, startDay: 1, endMonth: 10, endDay: 15, leadTimeDays: 14, relevantNiches: ['시장분석'], contentAngles: ['BOK October rate decision analysis'] },
  { name: 'FOMC Meeting (Mar)', startMonth: 3, startDay: 15, endMonth: 3, endDay: 25, leadTimeDays: 14, relevantNiches: ['시장분석', '수급분석'], contentAngles: ['FOMC March Korean market impact'] },
  { name: 'FOMC Meeting (Jun)', startMonth: 6, startDay: 10, endMonth: 6, endDay: 20, leadTimeDays: 14, relevantNiches: ['시장분석', '수급분석'], contentAngles: ['FOMC June Korean market forecast'] },
  { name: 'FOMC Meeting (Sep)', startMonth: 9, startDay: 15, endMonth: 9, endDay: 25, leadTimeDays: 14, relevantNiches: ['시장분석', '수급분석'], contentAngles: ['FOMC September Korean stock analysis'] },
  { name: 'FOMC Meeting (Dec)', startMonth: 12, startDay: 10, endMonth: 12, endDay: 20, leadTimeDays: 14, relevantNiches: ['시장분석', '수급분석'], contentAngles: ['FOMC December year-end impact'] },
  { name: 'Korean Dividend Season', startMonth: 12, startDay: 1, endMonth: 12, endDay: 31, leadTimeDays: 45, relevantNiches: ['시장분석'], contentAngles: ['Korean high dividend stocks year-end'] },
  { name: 'MSCI Rebalancing (May)', startMonth: 5, startDay: 20, endMonth: 6, endDay: 5, leadTimeDays: 30, relevantNiches: ['시장분석'], contentAngles: ['MSCI rebalancing Korean stock impact'] },
  { name: 'MSCI Rebalancing (Nov)', startMonth: 11, startDay: 10, endMonth: 11, endDay: 30, leadTimeDays: 30, relevantNiches: ['시장분석'], contentAngles: ['MSCI November Korean rebalancing'] },
  { name: 'CES', startMonth: 1, startDay: 5, endMonth: 1, endDay: 12, leadTimeDays: 30, relevantNiches: ['시장분석', '수급분석'], contentAngles: ['CES Korean tech Samsung LG stock impact'] },
  { name: 'Year-End Tax Loss Selling', startMonth: 11, startDay: 15, endMonth: 12, endDay: 28, leadTimeDays: 30, relevantNiches: ['시장분석'], contentAngles: ['Korean stock tax loss selling strategy'] },
  { name: 'Korean IPO Season (Spring)', startMonth: 3, startDay: 1, endMonth: 5, endDay: 31, leadTimeDays: 30, relevantNiches: ['시장분석'], contentAngles: ['upcoming Korean IPO stocks guide'] },
  { name: 'Korean IPO Season (Fall)', startMonth: 9, startDay: 1, endMonth: 11, endDay: 30, leadTimeDays: 30, relevantNiches: ['시장분석'], contentAngles: ['fall Korean IPO pipeline analysis'] },
  { name: 'Options Expiry (Mar)', startMonth: 3, startDay: 8, endMonth: 3, endDay: 15, leadTimeDays: 7, relevantNiches: ['시장분석', '수급분석'], contentAngles: ['Korean options expiry volatility impact'] },
  { name: 'Options Expiry (Jun)', startMonth: 6, startDay: 8, endMonth: 6, endDay: 15, leadTimeDays: 7, relevantNiches: ['시장분석', '수급분석'], contentAngles: ['Korean options expiry June impact'] },
  { name: 'Options Expiry (Sep)', startMonth: 9, startDay: 8, endMonth: 9, endDay: 15, leadTimeDays: 7, relevantNiches: ['시장분석', '수급분석'], contentAngles: ['Korean options expiry September'] },
  { name: 'Options Expiry (Dec)', startMonth: 12, startDay: 8, endMonth: 12, endDay: 15, leadTimeDays: 7, relevantNiches: ['시장분석', '수급분석'], contentAngles: ['year-end options expiry Korean market'] },
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
  'evergreen': 180,       // Semi-annual review
  'seasonal': 60,         // Bi-monthly update
  'time-sensitive': 30,   // AI-Trading 실적발표 news expires in 30 days; archive/update promptly to avoid stale content
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
  '시장분석': {
    name: 'Daniel Park',
    title: '시장 분석 전문가',
    bio: 'KOSPI/KOSDAQ 시장 흐름을 매일 추적하는 시장 분석가. 거시경제 지표, 금리 정책, 환율 변동이 한국 주식시장에 미치는 영향을 분석합니다.',
    expertise: ['KOSPI/KOSDAQ 시장 분석', '거시경제 지표', '금리 정책 영향', '환율 분석', 'ETF 투자 전략'],
    credentials: ['시장분석 전문가', 'CFA Level III'],
    yearsExperience: 8,
  },
  '업종분석': {
    name: 'Jiwon Lee',
    title: '업종 분석 전문가',
    bio: '반도체, 2차전지, 바이오 등 핵심 업종의 실적과 밸류에이션을 분석합니다. DART 공시와 재무제표 기반 기업 분석을 제공합니다.',
    expertise: ['섹터 로테이션', '기업 재무 분석', 'DART 공시 분석', 'PER PBR ROE 밸류에이션', '배당주 분석'],
    credentials: ['업종분석 전문가', '재무분석사'],
    yearsExperience: 7,
  },
  '테마분석': {
    name: 'Alex Kwon',
    title: '테마주 분석 전문가',
    bio: 'AI, 2차전지, 로봇, 우주항공 등 성장 테마의 관련주를 발굴하고 분석합니다. 정책 변화와 글로벌 트렌드가 테마주에 미치는 영향을 추적합니다.',
    expertise: ['테마주 발굴', 'AI 관련주', '2차전지 관련주', '정책 수혜주', '글로벌 트렌드 분석'],
    credentials: ['테마분석 전문가', '투자 전략가'],
    yearsExperience: 6,
  },
  '추천주': {
    name: 'Sungho Choi',
    title: '수급 분석 전문가',
    bio: '외국인, 기관, 개인 투자자의 매매 동향을 추적하고 수급 데이터 기반 투자 전략을 제시합니다. 공매도, 프로그램 매매, MSCI 리밸런싱 분석을 전문으로 합니다.',
    expertise: ['투자자별 수급 분석', '외국인 매매 추적', '공매도 분석', '프로그램 매매', 'MSCI 리밸런싱'],
    credentials: ['수급분석 전문가', '퀀트 애널리스트'],
    yearsExperience: 7,
  },
};

export const NICHE_AUTHOR_PERSONAS: Record<string, AuthorProfile[]> = {
  '시장분석': [NICHE_AUTHOR_PROFILES['시장분석']],
  '업종분석': [NICHE_AUTHOR_PROFILES['업종분석']],
  '테마분석': [NICHE_AUTHOR_PROFILES['테마분석']],
  '추천주': [NICHE_AUTHOR_PROFILES['추천주']],
};

/** Content-type to persona voice mapping */
export const CONTENT_TYPE_PERSONA_MAP: Record<string, 'primary' | 'secondary' | 'tertiary'> = {
  'deep-dive': 'primary',
  'analysis': 'primary',
  'case-study': 'primary',
  'news-explainer': 'primary',
  'how-to': 'secondary',
  'listicle': 'secondary',
  'best-x-for-y': 'primary',
  'x-vs-y': 'primary',
  'product-review': 'secondary',
};

// Finance pivot: Korean-Stock/AI-Trading tertiary keywords removed

// Finance pivot: AI-Trading tertiary keywords removed

/** 니치 설정 */
export interface NicheConfig {
  id: string;
  name: string;
  category: string;
  /** Broad 1-2 word term used for Google Trends rising query discovery */
  broadTerm: string;
  /** Additional broad terms for multi-topic niches (e.g., AI-Trading covers 한국주식 + 금융분석 + K-movie) */
  broadTermsExtra?: string[];
  /** Fallback seed keywords used when Trends API returns no rising queries */
  seedKeywords: string[];
  contentTypes: ContentType[];
  /** AdSense RPM tier for niche-specific ad density tuning */
  adSenseRpm?: 'high' | 'medium' | 'low';
  /** Dynamic RPM value learned from GA4 (overrides static tier) */
  dynamicRpmValue?: number;
  /** Whether this niche is enabled (default true) */
  enabled?: boolean;
  /** Pillar topics for internal link hub structure — each topic becomes a comprehensive guide page */
  pillarTopics?: string[];
}

/** Per-category optimal publish timing (override GA4 when no data available) */
/** 카테고리별 발행 시간 — 현재 즉시 발행 모드(MANUAL_REVIEW_THRESHOLD=0)에서는
 * 배치 실행 시간(23:00 KST)에 5개 포스트가 순차 즉시 발행됨.
 * 이 설정은 GA4 기반 최적 발행 시간 계산의 fallback으로만 사용. */
export const CATEGORY_PUBLISH_TIMING: Record<string, { optimalHour: number; bestDays: number[] }> = {
  '시장분석': { optimalHour: 23, bestDays: [1, 2, 3, 4, 5] },
  '업종분석': { optimalHour: 23, bestDays: [1, 2, 3, 4, 5] },
  '테마분석': { optimalHour: 23, bestDays: [1, 2, 3, 4, 5] },
  '수급분석': { optimalHour: 23, bestDays: [1, 2, 3, 4, 5] },
  '추천주': { optimalHour: 23, bestDays: [1, 2, 3, 4, 5] },
};

/** Niche-specific disclaimer templates for legal compliance */
const FINANCE_DISCLAIMER = '<div class="ab-disclaimer-finance" style="margin:0 0 24px 0; padding:16px 20px; background:#fff8f0; border:1px solid #fed7aa; border-radius:8px; font-size:13px; color:#666; line-height:1.6;"><strong>투자 면책조항:</strong> 본 콘텐츠는 정보 제공 및 교육 목적으로만 작성되었으며, 투자 권유가 아닙니다. 주식 투자는 원금 손실 위험이 있습니다. 과거 실적이 미래 수익을 보장하지 않습니다. 투자 결정 시 반드시 본인의 판단과 전문가 상담을 거치시기 바랍니다.</div>';
export const NICHE_DISCLAIMERS: Record<string, string> = {
  '시장분석': FINANCE_DISCLAIMER,
  '업종분석': FINANCE_DISCLAIMER,
  '테마분석': FINANCE_DISCLAIMER,
  '수급분석': FINANCE_DISCLAIMER,
  '추천주': FINANCE_DISCLAIMER,
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
  /** Content quality score from validator (0-100+) */
  qualityScore?: number;
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
