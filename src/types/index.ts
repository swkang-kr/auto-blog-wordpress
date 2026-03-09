/** 콘텐츠 유형 */
export type ContentType = 'how-to' | 'best-x-for-y' | 'x-vs-y' | 'analysis' | 'deep-dive' | 'news-explainer' | 'listicle' | 'case-study';

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
}

/** Per-category optimal publish timing (override GA4 when no data available) */
export const CATEGORY_PUBLISH_TIMING: Record<string, { optimalHour: number; bestDays: number[] }> = {
  'Korean Tech': { optimalHour: 8, bestDays: [1, 2, 3] },        // Mon-Wed morning
  'K-Entertainment': { optimalHour: 18, bestDays: [4, 5, 6] },    // Thu-Sat evening
  'Korean Finance': { optimalHour: 7, bestDays: [1, 2] },         // Mon-Tue early morning (market open)
  'Korean Food': { optimalHour: 11, bestDays: [5, 6, 0] },        // Fri-Sun late morning
  'Korea Travel': { optimalHour: 10, bestDays: [6, 0, 5] },       // Weekend + Friday
  'Korean Language': { optimalHour: 19, bestDays: [0, 1, 3] },    // Sun-Mon-Wed evening (study time)
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
  searchIntent: string;
  estimatedCompetition: 'low' | 'medium' | 'high';
  volumeEstimate?: 'high' | 'medium' | 'low' | 'minimal';
  reasoning: string;
  relatedKeywordsToInclude: string[];
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
}

/** 전체 포스팅 이력 파일 구조 */
export interface PostHistoryData {
  entries: PostHistoryEntry[];
  lastRunAt: string;
  totalPosts: number;
  categoryLastPublished?: Record<string, string>;
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
