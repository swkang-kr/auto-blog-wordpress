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
  // 실적 시즌 (1월, 4월, 7월, 10월)
  { name: 'Q4 Earnings Season Korea', startMonth: 1, startDay: 15, endMonth: 2, endDay: 15, leadTimeDays: 30, relevantNiches: ['Korean-Stock'], contentAngles: ['Korean stock Q4 earnings preview what to watch', 'Samsung SK Hynix earnings analysis investment impact', 'Korean stock earnings season strategy guide'] },
  { name: 'Q1 Earnings Season Korea', startMonth: 4, startDay: 15, endMonth: 5, endDay: 15, leadTimeDays: 30, relevantNiches: ['Korean-Stock'], contentAngles: ['Korean stock Q1 earnings preview analysis', 'semiconductor earnings outlook Samsung SK Hynix', 'Korean corporate earnings strategy what to expect'] },
  { name: 'Q2 Earnings Season Korea', startMonth: 7, startDay: 15, endMonth: 8, endDay: 15, leadTimeDays: 30, relevantNiches: ['Korean-Stock'], contentAngles: ['Korean stock Q2 earnings preview semiconductor battery', 'mid-year Korean stock market review investment outlook'] },
  { name: 'Q3 Earnings Season Korea', startMonth: 10, startDay: 15, endMonth: 11, endDay: 15, leadTimeDays: 30, relevantNiches: ['Korean-Stock'], contentAngles: ['Korean stock Q3 earnings preview analysis', 'Korean tech earnings semiconductor AI chip outlook'] },

  // 한국은행 금리 결정 (1월, 2월, 4월, 5월, 7월, 8월, 10월, 11월)
  { name: 'BOK Rate Decision (Jan)', startMonth: 1, startDay: 10, endMonth: 1, endDay: 20, leadTimeDays: 14, relevantNiches: ['Korean-Stock'], contentAngles: ['Bank of Korea interest rate decision analysis', 'BOK rate impact Korean stock market forecast', 'Korean bond yield stock market correlation analysis'] },
  { name: 'BOK Rate Decision (Apr)', startMonth: 4, startDay: 1, endMonth: 4, endDay: 15, leadTimeDays: 14, relevantNiches: ['Korean-Stock'], contentAngles: ['Bank of Korea April rate decision analysis impact', 'Korean interest rate outlook stock market forecast'] },
  { name: 'BOK Rate Decision (Jul)', startMonth: 7, startDay: 1, endMonth: 7, endDay: 15, leadTimeDays: 14, relevantNiches: ['Korean-Stock'], contentAngles: ['Bank of Korea July rate decision stock market impact'] },
  { name: 'BOK Rate Decision (Oct)', startMonth: 10, startDay: 1, endMonth: 10, endDay: 15, leadTimeDays: 14, relevantNiches: ['Korean-Stock'], contentAngles: ['Bank of Korea October rate decision analysis'] },

  // FOMC (미국 연준 금리 결정 — 한국 시장 영향 큼)
  { name: 'FOMC Meeting (Mar)', startMonth: 3, startDay: 15, endMonth: 3, endDay: 25, leadTimeDays: 14, relevantNiches: ['Korean-Stock', 'AI-Trading'], contentAngles: ['FOMC March decision impact Korean stock market analysis', 'US rate decision Korean won exchange rate stock impact'] },
  { name: 'FOMC Meeting (Jun)', startMonth: 6, startDay: 10, endMonth: 6, endDay: 20, leadTimeDays: 14, relevantNiches: ['Korean-Stock', 'AI-Trading'], contentAngles: ['FOMC June meeting Korean market impact forecast'] },
  { name: 'FOMC Meeting (Sep)', startMonth: 9, startDay: 15, endMonth: 9, endDay: 25, leadTimeDays: 14, relevantNiches: ['Korean-Stock', 'AI-Trading'], contentAngles: ['FOMC September decision Korean stock market analysis'] },
  { name: 'FOMC Meeting (Dec)', startMonth: 12, startDay: 10, endMonth: 12, endDay: 20, leadTimeDays: 14, relevantNiches: ['Korean-Stock', 'AI-Trading'], contentAngles: ['FOMC December meeting year-end Korean market impact'] },

  // 배당 시즌
  { name: 'Korean Stock Dividend Season', startMonth: 12, startDay: 1, endMonth: 12, endDay: 31, leadTimeDays: 45, relevantNiches: ['Korean-Stock'], contentAngles: ['Korean stock best dividend stocks year-end picks', 'ex-dividend date calendar Korean stocks what to buy', 'Korean high dividend yield stocks analysis guide'] },

  // 옵션 만기일 (매월 둘째 목요일)
  { name: 'Options Expiry / Quad Witching', startMonth: 3, startDay: 8, endMonth: 3, endDay: 15, leadTimeDays: 7, relevantNiches: ['Korean-Stock', 'AI-Trading'], contentAngles: ['Korean stock options expiry volatility impact analysis', 'quad witching day Korean market strategy guide'] },
  { name: 'Options Expiry (Jun)', startMonth: 6, startDay: 8, endMonth: 6, endDay: 15, leadTimeDays: 7, relevantNiches: ['Korean-Stock', 'AI-Trading'], contentAngles: ['Korean stock options expiry June impact analysis'] },
  { name: 'Options Expiry (Sep)', startMonth: 9, startDay: 8, endMonth: 9, endDay: 15, leadTimeDays: 7, relevantNiches: ['Korean-Stock', 'AI-Trading'], contentAngles: ['Korean stock options expiry September impact'] },
  { name: 'Options Expiry (Dec)', startMonth: 12, startDay: 8, endMonth: 12, endDay: 15, leadTimeDays: 7, relevantNiches: ['Korean-Stock', 'AI-Trading'], contentAngles: ['year-end options expiry Korean stock market impact'] },

  // MSCI/FTSE 리밸런싱
  { name: 'MSCI Rebalancing', startMonth: 5, startDay: 20, endMonth: 6, endDay: 5, leadTimeDays: 30, relevantNiches: ['Korean-Stock'], contentAngles: ['MSCI rebalancing Korean stock additions deletions impact', 'MSCI Korea index weight changes investment analysis'] },
  { name: 'MSCI Rebalancing (Nov)', startMonth: 11, startDay: 10, endMonth: 11, endDay: 30, leadTimeDays: 30, relevantNiches: ['Korean-Stock'], contentAngles: ['MSCI November rebalancing Korean stock market impact analysis'] },

  // 기술 전시회 (한국 반도체/배터리 테마)
  { name: 'CES (Consumer Electronics)', startMonth: 1, startDay: 5, endMonth: 1, endDay: 12, leadTimeDays: 30, relevantNiches: ['Korean-Stock', 'AI-Trading'], contentAngles: ['CES Korean tech companies Samsung LG stock impact', 'CES AI chip announcements Korean semiconductor stock analysis'] },
  { name: 'MWC (Mobile World Congress)', startMonth: 2, startDay: 24, endMonth: 2, endDay: 28, leadTimeDays: 21, relevantNiches: ['Korean-Stock'], contentAngles: ['MWC Korean tech stocks Samsung SK Telecom impact'] },
  { name: 'InterBattery Korea', startMonth: 3, startDay: 10, endMonth: 3, endDay: 12, leadTimeDays: 21, relevantNiches: ['Korean-Stock'], contentAngles: ['InterBattery Korea battery stocks LG Samsung SDI analysis'] },

  // 연말 세금/정산
  { name: 'Year-End Tax Loss Selling', startMonth: 11, startDay: 15, endMonth: 12, endDay: 28, leadTimeDays: 30, relevantNiches: ['Korean-Stock'], contentAngles: ['Korean stock tax loss selling strategy year-end guide', 'Korean stock capital gains tax guide foreign investors', 'year-end portfolio rebalancing Korean stock strategy'] },

  // IPO 시즌
  { name: 'Korean IPO Season (Spring)', startMonth: 3, startDay: 1, endMonth: 5, endDay: 31, leadTimeDays: 30, relevantNiches: ['Korean-Stock'], contentAngles: ['upcoming Korean IPO stocks what to watch guide', 'Korean IPO investing guide how to apply tips'] },
  { name: 'Korean IPO Season (Fall)', startMonth: 9, startDay: 1, endMonth: 11, endDay: 30, leadTimeDays: 30, relevantNiches: ['Korean-Stock'], contentAngles: ['fall Korean IPO pipeline stocks to watch analysis', 'how to invest in Korean IPOs foreign investor guide'] },
];

/** Google Trends data */
export interface TrendsData {
  keyword: string;
  interestOverTime: number[];
  relatedTopics: string[];
  relatedQueries: string[];
  averageInterest: number;
  trendDirection: 'rising' | 'declining' | 'stable';
  hasBreakout: boolean;
}

export interface RisingQuery {
  query: string;
  value: number | 'Breakout';
}

export interface KeywordAnalysis {
  selectedKeyword: string;
  contentType: ContentType;
  suggestedTitle: string;
  uniqueAngle: string;
  searchIntent: SearchIntent;
  estimatedCompetition: string;
  keywordDifficulty: number;
  volumeEstimate: string;
  estimatedMonthlySearches: number;
  reasoning: string;
  relatedKeywordsToInclude: string[];
  longTailVariants?: string[];
}

export interface PostPerformance {
  page: string;
  pageviews: number;
  bounceRate: number;
  avgEngagementTime: number;
}

export interface ImageResult {
  buffer: Buffer;
  index: number;
}

export interface PostHistoryData {
  entries: PostHistoryEntry[];
  version: number;
}

/** 콘텐츠 유형 */
export type ContentType = 'how-to' | 'best-x-for-y' | 'x-vs-y' | 'analysis' | 'deep-dive' | 'news-explainer' | 'listicle' | 'case-study' | 'product-review';

/** 검색 의도 */
export type SearchIntent = 'informational' | 'commercial' | 'commercial-investigation' | 'transactional' | 'navigational';

/** Author profiles */
export interface AuthorProfile {
  name: string;
  title: string;
  bio: string;
  expertise: string[];
  credentials: string[];
  yearsExperience: number;
}

export const NICHE_AUTHOR_PROFILES: Record<string, AuthorProfile> = {
  'Korean-Stock': {
    name: 'Daniel Park',
    title: 'Korean Stock Market Analyst',
    bio: 'Seoul-based equity analyst tracking KOSPI/KOSDAQ daily. Analyzes Samsung, SK Hynix, and Korean semiconductor supply chains using DART filings, KRX data, and technical indicators. 8+ years covering Korean capital markets.',
    expertise: ['Korean equity analysis', 'Semiconductor stocks', 'DART disclosure analysis', 'Technical analysis', 'Korean macroeconomics', 'Foreign investor regulations'],
    credentials: ['CFA Level III Candidate', 'Korean Capital Market Analyst'],
    yearsExperience: 8,
  },
  'AI-Trading': {
    name: 'Alex Kwon',
    title: 'Quantitative Trading Strategist',
    bio: 'Building and deploying algorithmic trading systems for Korean stock markets. Specializes in RSI/MACD-based strategies, DART disclosure momentum, and Claude AI-powered trade analysis. Open-source contributor to Korean stock API libraries.',
    expertise: ['Algorithmic trading systems', 'Python quantitative finance', 'Backtesting and validation', 'Risk management', 'KIS API integration', 'AI/ML stock prediction'],
    credentials: ['Quantitative Developer', 'AI Trading Systems Architect'],
    yearsExperience: 6,
  },
};

/** Multiple author personas per niche for voice rotation */
export const NICHE_AUTHOR_PERSONAS: Record<string, AuthorProfile[]> = {
  'Korean-Stock': [
    NICHE_AUTHOR_PROFILES['Korean-Stock'],
    {
      name: 'Jiwon Lee',
      title: 'Korean Market Macro Strategist',
      bio: 'Tracking BOK rate decisions, Korean won dynamics, and cross-border capital flows. Focused on how global macro shifts impact Korean equity markets.',
      expertise: ['Macroeconomic analysis', 'BOK monetary policy', 'Currency impact analysis', 'Cross-border flows'],
      credentials: ['Economics Researcher', 'Fixed Income Analyst'],
      yearsExperience: 5,
    },
  ],
  'AI-Trading': [
    NICHE_AUTHOR_PROFILES['AI-Trading'],
    {
      name: 'Sungho Choi',
      title: 'Trading Systems Engineer',
      bio: 'Designing production-grade trading infrastructure — WebSocket feeds, order execution pipelines, and risk management systems for Korean stock markets.',
      expertise: ['Trading system architecture', 'Real-time data processing', 'Order execution', 'System reliability'],
      credentials: ['Backend Systems Engineer', 'Trading Infrastructure Specialist'],
      yearsExperience: 7,
    },
  ],
};

/** Content-type to persona voice mapping */
export const CONTENT_TYPE_PERSONA_MAP: Record<string, 'primary' | 'secondary'> = {
  'analysis': 'primary',
  'deep-dive': 'primary',
  'case-study': 'primary',
  'news-explainer': 'primary',
  'how-to': 'secondary',
  'listicle': 'secondary',
  'best-x-for-y': 'primary',
  'x-vs-y': 'primary',
  'product-review': 'secondary',
};

/** Per-category optimal publish timing */
export const CATEGORY_PUBLISH_TIMING: Record<string, { optimalHour: number; bestDays: number[] }> = {
  'Korean-Stock': { optimalHour: 7, bestDays: [1, 2, 3, 4, 5] },     // Weekday mornings KST (pre-market)
  'AI-Trading': { optimalHour: 9, bestDays: [1, 2, 3, 4, 5] },       // Weekday morning (market open)
};

/** Niche-specific disclaimer templates */
export const NICHE_DISCLAIMERS: Record<string, string> = {
  'Korean-Stock': '<div class="ab-disclaimer-finance" style="margin:0 0 24px 0; padding:16px 20px; background:#fff8f0; border:1px solid #fed7aa; border-radius:8px; font-size:13px; color:#666; line-height:1.6;"><strong>Investment Disclaimer:</strong> This content is for informational and educational purposes only, not investment advice. Stock market investments carry risk of loss. Past performance does not guarantee future results. Always conduct your own research and consult a qualified financial advisor before making investment decisions. The author may hold positions in securities discussed.</div>',
  'AI-Trading': '<div class="ab-disclaimer-trading" style="margin:0 0 24px 0; padding:16px 20px; background:#f0f4ff; border:1px solid #c6d6f6; border-radius:8px; font-size:13px; color:#666; line-height:1.6;"><strong>Trading Disclaimer:</strong> Algorithmic trading involves substantial risk. Backtested results do not guarantee live trading performance. This content describes trading concepts for educational purposes and does not constitute a recommendation to trade. You may lose more than your initial investment. Trade at your own risk.</div>',
};

/** Search intent to valid content type mapping */
export const INTENT_CONTENT_TYPE_MAP: Record<string, string[]> = {
  'transactional': ['how-to', 'best-x-for-y', 'listicle'],
  'commercial': ['best-x-for-y', 'x-vs-y', 'analysis', 'listicle'],
  'commercial-investigation': ['x-vs-y', 'best-x-for-y', 'analysis', 'deep-dive', 'listicle'],
  'informational': ['how-to', 'deep-dive', 'analysis', 'news-explainer', 'case-study', 'listicle'],
  'navigational': ['deep-dive', 'news-explainer', 'how-to'],
};

/** 니치 설정 */
export interface NicheConfig {
  id: string;
  name: string;
  category: string;
  broadTerm: string;
  broadTermsExtra?: string[];
  seedKeywords: string[];
  contentTypes: ContentType[];
  adSenseRpm?: 'high' | 'medium' | 'low';
  dynamicRpmValue?: number;
  enabled?: boolean;
  pillarTopics?: string[];
}

/** 내부 링크용 기존 포스트 정보 */
export interface ExistingPost {
  postId: number;
  title: string;
  url: string;
  slug: string;
  category: string;
  subNiche?: string;
  keyword?: string;
  excerpt?: string;
  meta?: Record<string, string>;
}

/** Freshness classification */
export type FreshnessClass = 'evergreen' | 'seasonal' | 'time-sensitive';

export const CONTENT_FRESHNESS_MAP: Record<string, FreshnessClass> = {
  'how-to': 'evergreen',
  'deep-dive': 'evergreen',
  'case-study': 'evergreen',
  'analysis': 'seasonal',
  'best-x-for-y': 'seasonal',
  'x-vs-y': 'seasonal',
  'listicle': 'seasonal',
  'product-review': 'seasonal',
  'news-explainer': 'time-sensitive',
};

export const FRESHNESS_UPDATE_INTERVALS: Record<FreshnessClass, number> = {
  'evergreen': 90,
  'seasonal': 45,
  'time-sensitive': 14,
};

/** Blog content output */
export interface BlogContent {
  title: string;
  html: string;
  excerpt: string;
  tags: string[];
  category: string;
  imagePrompts: string[];
  imageCaptions: string[];
  qualityScore: number;
  metaDescription: string;
  slug: string;
  ogTitle?: string;
  titleCandidates?: string[];
  pollQuestion?: { question: string; options: string[] };
  productMentions?: Array<{ name: string; category: string }>;
  affiliateLinksCount?: number;
}

/** Researched keyword */
export interface ResearchedKeyword {
  niche: NicheConfig;
  keyword: string;
  trendsData?: Array<{ keyword: string; averageInterest: number; trendDirection: string; hasBreakout?: boolean }>;
  analysis: {
    selectedKeyword: string;
    contentType: ContentType;
    suggestedTitle: string;
    uniqueAngle: string;
    searchIntent: SearchIntent;
    estimatedCompetition: string;
    keywordDifficulty: number;
    volumeEstimate: string;
    estimatedMonthlySearches: number;
    reasoning: string;
    relatedKeywordsToInclude: string[];
    longTailVariants?: string[];
  };
}

/** Published post */
export interface PublishedPost {
  postId: number;
  url: string;
  slug?: string;
  title: string;
  featuredImageId: number;
}

/** Media upload result */
export interface MediaUploadResult {
  mediaId: number;
  sourceUrl: string;
}

/** Post history entry */
export interface PostHistoryEntry {
  keyword: string;
  title: string;
  slug: string;
  url: string;
  postUrl?: string;
  postId?: number;
  niche: string;
  category: string;
  contentType?: string;
  searchIntent?: string;
  qualityScore?: number;
  publishedAt: string;
  wordCount?: number;
  rankingHistory?: Array<{ date: string; position: number; keyword: string; clicks?: number; impressions?: number }>;
  lastPosition?: number;
  titleCandidates?: string[];
  titleTestResolved?: boolean;
  titleTestPhaseACtr?: number;
  titleTestPhaseATitle?: string;
  titleTestPhaseBStarted?: string;
  originalTitle?: string;
}

/** Post result from batch processing */
export interface PostResult {
  niche: string;
  keyword: string;
  title: string;
  url: string;
  postUrl?: string;
  postId: number;
  qualityScore: number;
  success: boolean;
  error?: string;
  duration?: number;
}

/** Batch processing result */
export interface BatchResult {
  total: number;
  success: number;
  failed: number;
  skipped: number;
  results: PostResult[];
  startedAt: string;
  completedAt: string;
  totalCost: number;
}
