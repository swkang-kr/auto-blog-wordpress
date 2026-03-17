import Anthropic from '@anthropic-ai/sdk';
import { logger } from '../utils/logger.js';
import { KeywordResearchError } from '../types/errors.js';
import { GoogleTrendsService } from './google-trends.service.js';
import { getSeasonalSuggestionsForNiche } from '../utils/korean-calendar.js';
import { costTracker } from '../utils/cost-tracker.js';
import { RedditTrendsService } from './reddit-trends.service.js';
import type { NicheConfig, TrendsData, RisingQuery, KeywordAnalysis, ResearchedKeyword, ExistingPost } from '../types/index.js';
import { CONTENT_FRESHNESS_MAP, INTENT_CONTENT_TYPE_MAP, type ContentType, type FreshnessClass } from '../types/index.js';
import type { GSCQueryData } from './gsc-analytics.service.js';

/** SERP competition analysis result */
interface SerpAnalysis {
  strikingDistanceKeywords: GSCQueryData[];
  topRankingQueries: GSCQueryData[];
  contentGapHints: string[];
}

export class KeywordResearchService {
  private client: Anthropic;
  private trendsService: GoogleTrendsService;
  private redditService: RedditTrendsService;
  private performanceInsights: string;
  private existingPosts: ExistingPost[];
  private existingPostTitles: string[];
  private serpAnalysis: SerpAnalysis | null;
  private contentTypeDistribution: string;
  private researchModel: string;
  private serpFormatHint: string = '';
  private paaQuestions: string[] = [];
  private rpmByNiche: Record<string, number> = {};

  constructor(apiKey: string, geo: string, redditCredentials?: { clientId: string; clientSecret: string }, serpApiKey?: string) {
    this.client = new Anthropic({ apiKey });
    this.trendsService = new GoogleTrendsService(geo, serpApiKey);
    this.redditService = new RedditTrendsService(redditCredentials?.clientId, redditCredentials?.clientSecret);
    this.performanceInsights = '';
    this.existingPosts = [];
    this.existingPostTitles = [];
    this.serpAnalysis = null;
    this.contentTypeDistribution = '';
    // Use dedicated research model if set, otherwise fall back to main model
    this.researchModel = process.env.CLAUDE_RESEARCH_MODEL || process.env.CLAUDE_MODEL || 'claude-sonnet-4-6';
  }

  /** Set GA4 performance insights to include in keyword research prompts */
  setPerformanceInsights(insights: string): void {
    this.performanceInsights = insights;
  }

  /** Get current performance insights (for appending additional context) */
  getPerformanceInsights(): string {
    return this.performanceInsights;
  }

  /** Set existing post titles for similarity-based dedup */
  setExistingPosts(posts: ExistingPost[]): void {
    this.existingPosts = posts;
    this.existingPostTitles = posts.map(p => p.title.toLowerCase());
  }

  /** Set SERP format hint for content type alignment */
  setSerpFormatHint(hint: string): void {
    this.serpFormatHint = hint;
  }

  /** Set RPM data per niche for revenue-aware keyword prioritization */
  setRpmData(rpmByNiche: Record<string, number>): void {
    this.rpmByNiche = rpmByNiche;
  }

  /** Set People Also Ask questions for FAQ enrichment */
  setPaaQuestions(questions: string[]): void {
    this.paaQuestions = questions;
  }

  /** Get PAA questions for content generation */
  getPaaQuestions(): string[] {
    return this.paaQuestions;
  }

  /** Set content type distribution for diversity-aware keyword selection */
  setContentTypeDistribution(distribution: Record<string, number>): void {
    const total = Object.values(distribution).reduce((a, b) => a + b, 0);
    if (total === 0) { this.contentTypeDistribution = ''; return; }
    const lines = Object.entries(distribution)
      .sort(([, a], [, b]) => b - a)
      .map(([type, count]) => {
        const pct = Math.round((count / total) * 100);
        const overrep = pct > 30 ? ' [OVERREPRESENTED]' : '';
        return `  - ${type}: ${pct}% (${count}/${total})${overrep}`;
      });

    // Freshness ratio: evergreen vs seasonal vs time-sensitive
    const freshnessCounts: Record<FreshnessClass, number> = { 'evergreen': 0, 'seasonal': 0, 'time-sensitive': 0 };
    for (const [type, count] of Object.entries(distribution)) {
      const freshClass = CONTENT_FRESHNESS_MAP[type as ContentType] ?? 'seasonal';
      freshnessCounts[freshClass] += count;
    }
    const evergreenPct = Math.round((freshnessCounts['evergreen'] / total) * 100);
    const freshnessLine = `\n## Content Freshness Balance (Target: 60% evergreen, 30% seasonal, 10% time-sensitive)\n` +
      `  - Evergreen (how-to, deep-dive, case-study): ${evergreenPct}% (${freshnessCounts['evergreen']}/${total})${evergreenPct < 50 ? ' [NEEDS MORE EVERGREEN]' : ''}\n` +
      `  - Seasonal (best-x, comparison, analysis, listicle, review): ${Math.round((freshnessCounts['seasonal'] / total) * 100)}% (${freshnessCounts['seasonal']}/${total})\n` +
      `  - Time-sensitive (news-explainer): ${Math.round((freshnessCounts['time-sensitive'] / total) * 100)}% (${freshnessCounts['time-sensitive']}/${total})\n` +
      `${evergreenPct < 50 ? 'PREFER evergreen content types (how-to, deep-dive, case-study) to build long-term organic traffic.\n' : ''}`;

    this.contentTypeDistribution = `\n## Content Type Distribution (IMPORTANT — maintain diversity)\n${lines.join('\n')}\nTypes marked [OVERREPRESENTED] (above 30%) should be AVOIDED unless the topic strongly demands it. PREFER underrepresented types.\n${freshnessLine}`;
  }

  /** Set per-category content type distribution for category-level diversity warnings */
  setCategoryContentTypeDistribution(categoryDist: Record<string, Record<string, number>>): void {
    const warnings: string[] = [];
    for (const [category, dist] of Object.entries(categoryDist)) {
      const total = Object.values(dist).reduce((a, b) => a + b, 0);
      if (total < 3) continue; // not enough data to judge
      for (const [type, count] of Object.entries(dist)) {
        const pct = Math.round((count / total) * 100);
        if (pct > 70) {
          warnings.push(`  ⚠ "${category}" has ${pct}% "${type}" content (${count}/${total}) — diversify to strengthen topical authority`);
        }
      }
    }
    if (warnings.length > 0) {
      this.contentTypeDistribution += `\n## Category Content Type Imbalance\n${warnings.join('\n')}\nAvoid the dominant type for these categories in this batch.`;
      logger.info(`Content type imbalance detected: ${warnings.length} category warning(s)`);
    }
  }

  /** Set SERP analysis data from GSC for competitive intelligence */
  setSerpAnalysis(strikingDistance: GSCQueryData[], topQueries: GSCQueryData[]): void {
    const contentGapHints: string[] = [];
    // Identify content gaps: striking distance keywords not covered by existing posts
    for (const sd of strikingDistance.slice(0, 15)) {
      const covered = this.existingPosts.some(p =>
        p.title.toLowerCase().includes(sd.query.toLowerCase()) ||
        sd.query.toLowerCase().split(/\s+/).filter(w => w.length > 3).every(w => p.title.toLowerCase().includes(w)),
      );
      if (!covered) {
        contentGapHints.push(`"${sd.query}" (pos ${sd.position.toFixed(1)}, ${sd.impressions} impressions, ${(sd.ctr * 100).toFixed(1)}% CTR) — no dedicated content`);
      }
    }
    this.serpAnalysis = { strikingDistanceKeywords: strikingDistance, topRankingQueries: topQueries, contentGapHints };
    if (contentGapHints.length > 0) {
      logger.info(`SERP analysis: Found ${contentGapHints.length} content gap(s) from striking distance keywords`);
    }
  }

  /**
   * Semantic similarity between two texts using unigram + bigram overlap.
   * Bigrams capture phrase-level meaning (e.g., "korean stocks" vs "korean drama").
   * Returns 0-1 where 1 = identical token sets.
   */
  private textSimilarity(a: string, b: string): number {
    const stopWords = new Set(['the', 'a', 'an', 'in', 'on', 'at', 'to', 'for', 'of', 'and', 'or', 'is', 'are', 'was', 'were', 'be', 'been', 'how', 'what', 'why', 'your', 'you', 'this', 'that', 'with']);
    const tokenize = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 2 && !stopWords.has(w));

    const wordsA = tokenize(a);
    const wordsB = tokenize(b);
    if (wordsA.length === 0 || wordsB.length === 0) return 0;

    // Unigram overlap (weight: 0.4)
    const setA = new Set(wordsA);
    const setB = new Set(wordsB);
    let unigramIntersection = 0;
    for (const word of setA) if (setB.has(word)) unigramIntersection++;
    const unigramScore = unigramIntersection / Math.min(setA.size, setB.size);

    // Bigram overlap (weight: 0.6) — captures phrase-level similarity
    const bigramsA = new Set<string>();
    const bigramsB = new Set<string>();
    for (let i = 0; i < wordsA.length - 1; i++) bigramsA.add(`${wordsA[i]} ${wordsA[i + 1]}`);
    for (let i = 0; i < wordsB.length - 1; i++) bigramsB.add(`${wordsB[i]} ${wordsB[i + 1]}`);

    if (bigramsA.size === 0 || bigramsB.size === 0) return unigramScore;

    let bigramIntersection = 0;
    for (const bg of bigramsA) if (bigramsB.has(bg)) bigramIntersection++;
    const bigramScore = bigramIntersection / Math.min(bigramsA.size, bigramsB.size);

    return 0.4 * unigramScore + 0.6 * bigramScore;
  }

  /**
   * TF-IDF weighted similarity search: finds the most similar existing posts.
   * Uses inverse document frequency weighting so common words (e.g., "korean")
   * contribute less than distinctive terms (e.g., "hbm", "etf", "skincare").
   * Returns top-N matches with similarity scores.
   */
  private findSimilarPosts(candidateText: string, topN: number = 5): Array<{ post: ExistingPost; similarity: number }> {
    if (this.existingPosts.length === 0) return [];

    const stopWords = new Set(['the', 'a', 'an', 'in', 'on', 'at', 'to', 'for', 'of', 'and', 'or', 'is', 'are', 'was', 'were', 'be', 'been', 'how', 'what', 'why', 'your', 'you', 'this', 'that', 'with', 'best', 'top', 'guide', 'complete', 'ultimate']);
    const tokenize = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 2 && !stopWords.has(w));

    // Build document frequency map (how many posts contain each word)
    const docFreq = new Map<string, number>();
    const postTokens = this.existingPosts.map(p => {
      const tokens = tokenize(p.title + (p.keyword ? ' ' + p.keyword : ''));
      const uniqueTokens = new Set(tokens);
      for (const token of uniqueTokens) {
        docFreq.set(token, (docFreq.get(token) || 0) + 1);
      }
      return { post: p, tokens, uniqueTokens };
    });

    const totalDocs = this.existingPosts.length;
    const candidateTokens = tokenize(candidateText);
    const candidateUnique = new Set(candidateTokens);
    if (candidateUnique.size === 0) return [];

    // Compute TF-IDF weighted similarity for each post
    const results = postTokens.map(({ post, uniqueTokens }) => {
      let weightedOverlap = 0;
      let candidateWeight = 0;

      for (const token of candidateUnique) {
        // IDF: rarer words get higher weight (log(totalDocs / docFreq))
        const df = docFreq.get(token) || 0;
        const idf = df > 0 ? Math.log(totalDocs / df) + 1 : 1;
        candidateWeight += idf;

        if (uniqueTokens.has(token)) {
          weightedOverlap += idf;
        }
      }

      const similarity = candidateWeight > 0 ? weightedOverlap / candidateWeight : 0;
      return { post, similarity };
    });

    // Also factor in bigram similarity for phrase-level matching
    return results
      .map(r => ({
        ...r,
        similarity: 0.5 * r.similarity + 0.5 * this.textSimilarity(candidateText, r.post.title + (r.post.keyword ? ' ' + r.post.keyword : '')),
      }))
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, topN);
  }

  async researchKeyword(
    niche: NicheConfig,
    postedKeywords: string[],
    recentContentTypes?: string[],
  ): Promise<ResearchedKeyword> {
    logger.info(`\n--- Keyword Research for niche: "${niche.name}" ---`);

    // 1. Fetch rising queries for the niche's broad term (primary approach)
    let risingQueries: RisingQuery[] = [];
    let topQueries: RisingQuery[] = [];
    let averageInterest = 0;
    let trendDirection: TrendsData['trendDirection'] = 'stable';
    let trendsSource = 'rising';

    try {
      const result = await this.trendsService.fetchRisingQueries(niche.broadTerm);
      risingQueries = result.rising;
      topQueries = result.top;
      averageInterest = result.averageInterest;
      trendDirection = result.trendDirection;
    } catch (error) {
      logger.warn(`Rising trends fetch failed for "${niche.name}": ${error instanceof Error ? error.message : error}`);
    }

    // 2. Fall back to Reddit trends, then seed keywords if no rising queries found
    const trendsData: TrendsData[] = [];
    if (risingQueries.length === 0 && topQueries.length === 0) {
      // 2a. Try Reddit trends as secondary source
      try {
        const redditTrends = await this.redditService.fetchTrendingTopics(niche.category, niche.broadTerm);
        if (redditTrends.length > 0) {
          logger.info(`Reddit trends found ${redditTrends.length} topic(s) for "${niche.name}"`);
          trendsSource = 'reddit';
          // Convert Reddit trends to rising query format
          for (const trend of redditTrends) {
            topQueries.push({ query: trend.query, value: trend.score });
          }
        }
      } catch (error) {
        logger.debug(`Reddit trends fetch failed: ${error instanceof Error ? error.message : error}`);
      }

      // 2b. Fall back to seed keyword scanning if still empty
      //     Sample up to MAX_SEED_SAMPLE random seeds + apply time budget to avoid batch timeout
      if (topQueries.length === 0) {
        const MAX_SEED_SAMPLE = 20;
        const SEED_TIME_BUDGET_MS = 3 * 60 * 1000; // 3 minutes per niche
        const seedStart = Date.now();

        // Fisher-Yates shuffle and take first MAX_SEED_SAMPLE
        const shuffled = [...niche.seedKeywords];
        for (let i = shuffled.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        const sampled = shuffled.slice(0, MAX_SEED_SAMPLE);

        logger.warn(`No rising queries for "${niche.name}", falling back to ${sampled.length}/${niche.seedKeywords.length} sampled seed keywords`);
        trendsSource = 'seed';

        for (const seed of sampled) {
          if (Date.now() - seedStart > SEED_TIME_BUDGET_MS) {
            logger.warn(`Seed scanning time budget exceeded (${Math.round(SEED_TIME_BUDGET_MS / 1000)}s), stopping with ${trendsData.length} results`);
            break;
          }
          try {
            const data = await this.trendsService.fetchTrendsData(seed);
            trendsData.push(data);
          } catch (error) {
            logger.warn(`Trends data failed for seed "${seed}": ${error instanceof Error ? error.message : error}`);
          }
        }
      }
    }

    // 3. Ask Claude to select the best keyword (retry on Korea relevance or cannibalization)
    const MAX_ATTEMPTS = 4;
    let analysis: KeywordAnalysis | undefined;
    const rejectedKeywords: string[] = [];

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        analysis = await this.analyzeWithClaude(
          niche,
          { risingQueries, topQueries, averageInterest, trendDirection, trendsSource },
          trendsData,
          [...postedKeywords, ...rejectedKeywords],
          recentContentTypes,
        );
      } catch (error) {
        if (attempt < MAX_ATTEMPTS && error instanceof KeywordResearchError && error.message.includes('no Korea relevance')) {
          logger.warn(`Attempt ${attempt}/${MAX_ATTEMPTS}: Korea relevance check failed, retrying...`);
          continue;
        }
        throw error;
      }

      if (!analysis) continue;

      // Enhanced cannibalization detection: TF-IDF weighted similarity against top-5 matches
      if (this.existingPosts.length > 0) {
        const candidateText = `${analysis.selectedKeyword} ${analysis.suggestedTitle} ${analysis.uniqueAngle}`;
        const similarPosts = this.findSimilarPosts(candidateText, 5);
        const matchingPost = similarPosts.find(p => p.similarity > 0.55);
        if (matchingPost) {
          logger.warn(
            `Attempt ${attempt}/${MAX_ATTEMPTS}: "${analysis.selectedKeyword}" too similar to existing "${matchingPost.post.title}" ` +
            `(similarity: ${(matchingPost.similarity * 100).toFixed(0)}%, ID: ${matchingPost.post.postId}). ` +
            `Consider updating existing post instead. Retrying with different keyword.`,
          );
          rejectedKeywords.push(analysis.selectedKeyword);
          analysis = undefined;
          continue;
        }
      }

      // Validate search intent matches content type
      if (analysis.searchIntent && analysis.contentType) {
        const validTypes = INTENT_CONTENT_TYPE_MAP[analysis.searchIntent];
        if (validTypes && !validTypes.includes(analysis.contentType)) {
          logger.warn(
            `Intent-type mismatch: "${analysis.searchIntent}" intent got "${analysis.contentType}" type. ` +
            `Valid types: ${validTypes.join(', ')}. Auto-correcting to "${validTypes[0]}".`,
          );
          analysis.contentType = validTypes[0] as ContentType;
        }
      }

      // Estimate volume/difficulty inside loop so KD check can trigger retry
      if (!analysis.volumeEstimate) {
        analysis.volumeEstimate = this.estimateVolumeFromTrends(averageInterest, risingQueries, analysis.selectedKeyword);
        logger.debug(`Volume auto-estimated from Trends: ${analysis.volumeEstimate}`);
      }
      if (!analysis.estimatedMonthlySearches) {
        analysis.estimatedMonthlySearches = this.estimateMonthlySearches(averageInterest, risingQueries, analysis.selectedKeyword);
      }
      if (!analysis.keywordDifficulty) {
        analysis.keywordDifficulty = this.estimateKeywordDifficulty(analysis.selectedKeyword, averageInterest, analysis.estimatedCompetition);
      }

      // Dynamic KD threshold: short keywords (≤3 words) → stricter limit, long-tail (4+) → more lenient
      const maxKd = KeywordResearchService.getMaxKd(analysis.selectedKeyword);
      if (analysis.keywordDifficulty > maxKd && attempt < MAX_ATTEMPTS) {
        logger.warn(
          `Attempt ${attempt}/${MAX_ATTEMPTS}: "${analysis.selectedKeyword}" has KD=${analysis.keywordDifficulty} (>${maxKd} for ${analysis.selectedKeyword.split(/\s+/).length}-word keyword). ` +
          `Too competitive for ranking. Retrying with lower-difficulty keyword.`,
        );
        rejectedKeywords.push(analysis.selectedKeyword);
        analysis = undefined;
        continue;
      }
      if (analysis.keywordDifficulty > maxKd) {
        logger.warn(
          `Final attempt: accepting "${analysis.selectedKeyword}" with high KD=${analysis.keywordDifficulty} (limit=${maxKd}). ` +
          `No lower-difficulty keywords found after ${MAX_ATTEMPTS} attempts.`,
        );
      }

      break;
    }

    if (!analysis) {
      throw new KeywordResearchError(`Failed to find unique Korea-relevant keyword for niche "${niche.name}" after ${MAX_ATTEMPTS} attempts`);
    }

    // SERP format analysis: validate content type against actual SERP
    const serpFormat = await this.analyzeSerpFormat(analysis.selectedKeyword);
    if (serpFormat) {
      const suggestedType = analysis.contentType;
      if (serpFormat.dominantFormat !== suggestedType && serpFormat.dominantFormat !== 'analysis') {
        logger.info(`SERP format mismatch: AI selected "${suggestedType}" but SERP shows "${serpFormat.dominantFormat}" dominates. Aligning.`);
        analysis.contentType = serpFormat.dominantFormat as any;
      }
      if (serpFormat.serpFeatures.length > 0) {
        this.serpFormatHint = `SERP features for "${analysis.selectedKeyword}": ${serpFormat.serpFeatures.join(', ')}. Dominant format: ${serpFormat.dominantFormat}.`;
      }
    }

    // Fetch People Also Ask questions for FAQ enrichment
    if (this.trendsService.hasSerpApi()) {
      try {
        const serpData = await this.trendsService.searchSerpApi(analysis.selectedKeyword);
        if (serpData) {
          const paaResults = (serpData as any).related_questions || [];
          this.paaQuestions = paaResults.map((r: any) => r.question as string).filter(Boolean).slice(0, 8);
          if (this.paaQuestions.length > 0) {
            logger.info(`PAA: ${this.paaQuestions.length} "People Also Ask" questions for "${analysis.selectedKeyword}"`);
          }
        }
      } catch (paaErr) {
        logger.debug(`PAA fetch failed: ${paaErr instanceof Error ? paaErr.message : paaErr}`);
      }
    }

    logger.info(
      `Research result for "${niche.name}": keyword="${analysis.selectedKeyword}", ` +
      `type=${analysis.contentType}, competition=${analysis.estimatedCompetition}, ` +
      `volume=${analysis.volumeEstimate} (~${analysis.estimatedMonthlySearches}/mo), KD=${analysis.keywordDifficulty}`,
    );

    return { niche, trendsData, analysis };
  }

  /** Dynamic KD threshold: short keywords are harder to rank for, long-tail are easier */
  static getMaxKd(keyword: string): number {
    const wordCount = keyword.split(/\s+/).length;
    return wordCount >= 4 ? 80 : 60;
  }

  private async analyzeWithClaude(
    niche: NicheConfig,
    risingData: {
      risingQueries: RisingQuery[];
      topQueries: RisingQuery[];
      averageInterest: number;
      trendDirection: string;
      trendsSource: string;
    },
    fallbackTrendsData: TrendsData[],
    postedKeywords: string[],
    recentContentTypes?: string[],
  ): Promise<KeywordAnalysis> {
    const today = new Date().toISOString().split('T')[0];
    const year = new Date().getFullYear();

    // Build trends context
    let trendsContext: string;

    if (risingData.trendsSource === 'rising' && (risingData.risingQueries.length > 0 || risingData.topQueries.length > 0)) {
      // Score trend velocity: Breakout = 100, percentage = normalized score
      const scoredRising = risingData.risingQueries.map(q => {
        const velocity = q.value === 'Breakout' ? 100 : Math.min(100, parseInt(String(q.value)) || 0);
        const tier = velocity >= 80 ? '🔥 HOT' : velocity >= 40 ? '📈 RISING' : '📊 GROWING';
        return { ...q, velocity, tier };
      }).sort((a, b) => b.velocity - a.velocity);

      const risingLines = scoredRising.length > 0
        ? scoredRising
            .map(q => `  - "${q.query}" (${q.value === 'Breakout' ? 'Breakout 🔥' : `+${q.value}%`} | velocity: ${q.velocity}/100 ${q.tier})`)
            .join('\n')
        : '  (none found)';

      const topLines = risingData.topQueries.length > 0
        ? risingData.topQueries
            .map(q => `  - "${q.query}"`)
            .join('\n')
        : '  (none found)';

      trendsContext = `## Google Trends Data for broad term: "${niche.broadTerm}" (last 3 months)
- Overall interest: avg=${risingData.averageInterest}, direction=${risingData.trendDirection}

### RISING Queries (growing fast — PRIORITISE THESE):
${risingLines}

### TOP Queries (consistently searched):
${topLines}

IMPORTANT: The RISING queries above represent actual search demand that is growing RIGHT NOW.
Use them as your primary source for keyword selection. You may:
1. Use a rising query directly as your target keyword (if it's 4+ words)
2. Create a specific long-tail variation of a rising query (add context like "for beginners", "at home", "step by step")
3. Combine a rising topic with a top query for a unique angle`;
    } else {
      // Fallback: use seed keyword trends data
      trendsContext = fallbackTrendsData.length > 0
        ? `## Google Trends Data (seed keyword analysis)\n` +
          fallbackTrendsData.map((t) =>
            `- "${t.keyword}": avg interest=${t.averageInterest}, trend=${t.trendDirection}, ` +
            `breakout=${t.hasBreakout}, related queries=[${t.relatedQueries.slice(0, 5).join(', ')}]`,
          ).join('\n')
        : 'No trends data available. Use your knowledge to select the best keyword from the seed keywords.';
    }

    const prompt = `You are an SEO keyword research expert specializing in Korea-focused English content for global readers. Analyze the following data for the "${niche.name}" niche and select the BEST keyword and content type for a blog post.

IMPORTANT: Today's date is ${today}. All content must be written for ${year}.

## Niche Info
- Name: ${niche.name}
- Category: ${niche.category}
- Broad Topic: ${niche.broadTerm}
- Allowed Content Types: ${niche.contentTypes.join(', ')}
- Fallback Seed Keywords: ${niche.seedKeywords.join(', ')}

${trendsContext}

## Already Posted Keywords (AVOID these AND semantically similar topics)
${postedKeywords.length > 0 ? postedKeywords.map((k) => `- ${k}`).join('\n') : 'None yet'}

CRITICAL ANTI-CANNIBALIZATION RULES:
1. Do NOT just avoid exact matches — avoid ANY topic that covers the same core subject, even with different wording.
2. Examples of FORBIDDEN overlaps (if the first is posted, ALL others must be avoided):
   - "best Korean toner for dry skin" → "Korean toner dry skin recommendations", "which Korean toner for dehydrated skin", "top Korean hydrating toners ranked"
   - "best Korean skincare routine" → "Korean skincare routine for beginners", "how to do Korean skincare", "K-beauty skincare steps"
   - "BTS comeback 2026 what to expect" → "BTS 2026 return date", "BTS new album 2026 guide", "when is BTS coming back 2026"
   - "COSRX snail mucin review" → "COSRX snail essence before after", "is COSRX snail mucin worth it", "COSRX snail mucin results"
3. The test: if a reader searching for your keyword would find an existing post equally relevant, your keyword is TOO SIMILAR.
4. Choose a GENUINELY DIFFERENT subtopic within the niche — not the same topic reworded.
${this.performanceInsights}
${this.getSerpAnalysisSection()}${this.getCompetitorGapSection()}${this.contentTypeDistribution}
${this.getRpmSection(niche.category)}
${this.getSeasonalSection(niche.category)}
${recentContentTypes && recentContentTypes.length > 0 ? `## Content Type Diversity (IMPORTANT)\nRecent content types for this niche: ${recentContentTypes.join(', ')}\nAvoid overusing the same content type. If "${recentContentTypes[recentContentTypes.length - 1]}" was used recently, PREFER a different type to maintain reader variety.\n` : ''}
${this.serpFormatHint ? `\n## SERP Format Intelligence\n${this.serpFormatHint}\nThe content type MUST match the dominant SERP format unless there's a compelling reason to differentiate.` : ''}
${this.paaQuestions.length > 0 ? `\n## People Also Ask (PAA) Questions\nThese questions appear in Google's PAA box for related queries — HIGH VALUE for FAQ sections:\n${this.paaQuestions.map(q => `- ${q}`).join('\n')}\nInclude answers to at least 3 of these in your FAQ section for featured snippet targeting.` : ''}
## Instructions
1. Select the best keyword to target — MUST be a long-tail keyword (4+ words).
2. Choose the best content type from: ${niche.contentTypes.join(', ')}
   - analysis: Multi-angle analysis with data and market context
   - deep-dive: Comprehensive single-topic exploration with historical context
   - news-explainer: Recent Korean event breakdown for international readers
   - how-to: Step-by-step guide
   - best-x-for-y: Ranked list with comparisons
   - x-vs-y: Comparison analysis
   - listicle: Curated list of 10-20 items with brief descriptions per item
   - case-study: Real-world example analysis (Background → Challenge → Strategy → Results → Lessons)
   - product-review: In-depth product/service review with pros, cons, rating, and Korean market context
3. Suggest a unique angle that differentiates from existing content
4. Generate a suggestedTitle that is search-intent-first. Rules for suggestedTitle:
   - MUST contain the selectedKeyword verbatim or within 1-2 filler words
   - MUST include "Korea", "Korean", or a specific Korean brand/entity
   - Choose the pattern matching the content type:
     * how-to / explainer: "[How/What] [Korea topic] [qualifier]" or "[Primary Keyword] ([Year] Guide)"
       e.g. "How to Build a Korean Glass Skin Routine (2026 Guide)"
     * best-x-for-y / x-vs-y: "[Number] Best [thing] for [audience] in [Year]" or "[X] vs [Y]: [insight]"
       e.g. "7 Best Korean Toner Pads for Sensitive Skin in 2026"
     * analysis / deep-dive / news-explainer: "[Korea topic]: [what the analysis reveals]"
       e.g. "K-pop Training System: How Idols Are Made From Audition to Debut"
   - Target 50-65 characters total
   - NEVER use: "changing everything", "things you need to know", "the real reason X matters"
5. Identify the search intent and competition level
6. List 5-8 LSI (related) keywords to naturally include in the content

CRITICAL keyword selection rules — follow in strict priority order:
1. PRIORITISE rising queries — they have real search momentum and growing demand
2. KOREA FOCUS MANDATORY: The keyword MUST relate to South Korea, Korean companies, Korean markets, K-pop/K-drama, or Korean industry. Keywords without clear Korea relevance are NOT acceptable.
3. MUST be low competition (estimatedCompetition: "low")
4. MUST be long-tail (4+ words). Short head terms are NOT acceptable.
5. PREFER question-based keywords ("how to", "what is", "best way to")
6. PREFER keywords with clear informational or commercial investigation intent
7. MUST be different from already posted keywords
8. AVOID head terms dominated by high-authority sites
9. TARGET global English-speaking audience interested in Korea (K-culture fans, K-beauty shoppers, K-drama viewers)
10. EXCLUDED TOPICS — NEVER select keywords about: business models, revenue, profits, earnings, stock prices, investments, financial analysis, company valuations, money-making, economic forecasts, or any finance/economics angle. This blog focuses on CULTURE and PRODUCTS, not business/finance.

7. Estimate keyword difficulty (0-100) based on:
   - SERP competition (are top results from high-DA sites like Wikipedia, Forbes?)
   - Content saturation (how many dedicated articles exist for this exact query?)
   - Commercial intent (higher intent = more competition)
   Target keywords with difficulty < 40 for best ranking potential.
8. Estimate monthly search volume as a number (rough estimate based on niche knowledge)
9. Classify search intent precisely: informational, commercial, commercial-investigation, transactional, or navigational
   - commercial-investigation: User is comparing options before purchase (e.g., "COSRX vs Anua toner which is better", "Numbuzin vs TIRTIR cushion comparison")
   - commercial: User wants to buy/find a product (e.g., "best Korean sunscreen for dark skin")
   - transactional: User is ready to act (e.g., "where to buy Anua toner online", "buy COSRX snail mucin Amazon")
10. CRITICAL intent-type alignment:
   - transactional intent → MUST use: product-review, best-x-for-y, or how-to
   - commercial intent → MUST use: best-x-for-y, x-vs-y, product-review, listicle, or analysis
   - commercial-investigation intent → MUST use: x-vs-y, best-x-for-y, product-review, analysis, listicle, or deep-dive
   - informational intent → MUST use: how-to, deep-dive, analysis, news-explainer, case-study, or listicle
   - navigational intent → MUST use: deep-dive, news-explainer, or how-to
11. Generate 3-5 long-tail keyword variants related to your selected keyword for satellite content strategy

Respond with pure JSON only. No markdown code blocks.
{"selectedKeyword":"...","contentType":"analysis|deep-dive|news-explainer|how-to|best-x-for-y|x-vs-y|listicle|case-study|product-review","suggestedTitle":"...","uniqueAngle":"...","searchIntent":"informational|commercial|commercial-investigation|transactional|navigational","estimatedCompetition":"low|medium|high","keywordDifficulty":25,"volumeEstimate":"high|medium|low|minimal","estimatedMonthlySearches":1500,"reasoning":"...","relatedKeywordsToInclude":["...","..."],"longTailVariants":["variant 1","variant 2","variant 3"]}`;

    try {
      const response = await this.client.messages.create({
        model: this.researchModel,
        max_tokens: 2000,
        temperature: 0.5,
        messages: [{ role: 'user', content: prompt }],
      });

      const text = response.content[0].type === 'text' ? response.content[0].text : '';
      costTracker.addClaudeCallForPhase(
        process.env.CLAUDE_MODEL || 'claude-sonnet-4-6',
        response.usage?.input_tokens || 0,
        response.usage?.output_tokens || 0,
        'keywordResearch',
      );
      return this.parseAnalysis(text, niche);
    } catch (error) {
      throw new KeywordResearchError(
        `Claude analysis failed for niche "${niche.name}": ${error instanceof Error ? error.message : error}`,
        error,
      );
    }
  }

  private getSerpAnalysisSection(): string {
    if (!this.serpAnalysis || this.serpAnalysis.contentGapHints.length === 0) return '';
    const gapLines = this.serpAnalysis.contentGapHints.slice(0, 8).map(h => `  - ${h}`).join('\n');
    return `
## SERP Competition Analysis (Content Gaps — HIGH PRIORITY)
These are keywords where the site ranks position 5-20 but has NO dedicated content page.
Creating targeted content for these can dramatically improve rankings:
${gapLines}

STRATEGY: Consider creating content that directly targets one of these content gaps, or use them as LSI keywords in your chosen topic.`;
  }

  private getRpmSection(currentCategory: string): string {
    if (Object.keys(this.rpmByNiche).length === 0) return '';
    const lines = Object.entries(this.rpmByNiche)
      .sort(([, a], [, b]) => b - a)
      .map(([cat, rpm]) => {
        const tier = rpm >= 10 ? 'high revenue' : rpm >= 5 ? 'moderate revenue' : 'low revenue';
        const marker = cat === currentCategory ? ' ← THIS NICHE' : '';
        return `  - ${cat}: $${rpm.toFixed(2)}/1k RPM (${tier})${marker}`;
      });
    return `\n## Ad Revenue by Niche (RPM Data — prioritize high-RPM topics)\n${lines.join('\n')}\nPRIORITIZE keywords in high-RPM niches when quality and relevance are equal. Higher RPM = more revenue per visitor.\n`;
  }

  private getSeasonalSection(category: string): string {
    const suggestions = getSeasonalSuggestionsForNiche(category);
    if (suggestions.length === 0) return '';
    return `\n## Korean Seasonal Context (consider these angles)\n${suggestions.map(s => `- ${s}`).join('\n')}\n`;
  }

  private getCompetitorGapSection(): string {
    if (!this.serpAnalysis) return '';
    // Identify queries with high impressions but position > 10 (page 2+) — competitor territory
    const competitorGaps = this.serpAnalysis.strikingDistanceKeywords
      .filter(sd => sd.position > 10 && sd.impressions > 30)
      .slice(0, 5);
    if (competitorGaps.length === 0) return '';

    const gapLines = competitorGaps.map(g =>
      `  - "${g.query}" (pos ${g.position.toFixed(1)}, ${g.impressions} impressions) — competitors rank higher`
    ).join('\n');

    return `\n## Competitor Content Gaps (Page 2 opportunities)\nThese queries have high impressions but we rank on page 2+. Creating dedicated, superior content can capture this traffic:\n${gapLines}\n`;
  }

  private validateKoreaRelevance(analysis: KeywordAnalysis, niche?: NicheConfig): KeywordAnalysis {
    const koreaTerms = [
      // Core Korea terms
      'korea', 'korean', 'seoul', 'samsung', 'hyundai', 'lg', 'sk', 'kospi', 'kosdaq',
      'hallyu', 'k-pop', 'kpop', 'k-drama', 'kdrama', 'k-entertainment', 'kimchi',
      'chaebol', 'won', 'krw', 'naver', 'kakao', 'hybe', 'bts', 'blackpink',
      'webtoon', 'hanwha', 'posco', 'kia', 'lotte', 'cj', 'pangyo', 'gangnam',
      'bibimbap', 'soju', 'hanbok', 'tteokbokki', 'busan', 'jeju', 'incheon',
      'chaebols', 'kbank', 'toss', 'coupang', 'baemin', 'daum', 'musinsa',
      // K-Beauty brands — must pass Korea relevance for skincare/beauty keywords
      'cosrx', 'anua', 'laneige', 'innisfree', 'sulwhasoo', 'missha', 'etude',
      'skin1004', 'torriden', 'beauty of joseon', 'medicube', 'isntree',
      'haruharu', 'round lab', 'mixsoon', 'olive young', 'rom&nd', 'clio',
      'peripera', 'wakemake', 'daeng gi meo ri', 'ryo', 'some by mi',
      'klairs', 'd.i.y', 'axis-y', 'purito', 'abib', 'numbuzin',
      // Breakout 2025-2026 K-Beauty brands
      'tirtir', 'by wishtrend', 'tonymoly', 'holika holika', 'dr. jart',
      'iope', 'hanyul', 'o hui', 'whoo', 'su:m37', 'heimish', 'benton',
      'ma:nyo', 'illiyoon', 'aestura', 'ample:n', 'dr.g', 'no7 korea', 'nacific',
      'sun pad', 'lip oil',
      // K-Beauty generic terms that are strongly Korea-associated
      'centella', 'glass skin', 'mugwort', '10-step', '10 step',
      'heartleaf', 'propolis', 'snail mucin', 'rice water', 'rice toner',
      'essence review', 'cushion foundation', 'toner pad', 'skin barrier',
      'chok-chok', 'skip-care', 'slugging korean', 'pa++++',
      // K-Beauty ingredient terms strongly associated with Korean skincare
      'bakuchiol', 'tranexamic acid', 'adenosine', 'madecassoside',
      'polyglutamic acid', 'pdrn', 'salmon dna', 'galactomyces', 'bifida',
      'glass body', 'skin flooding', 'hanbang',
      // 5차 감사 추가
      'azelaic acid', 'cica balm', 'cica pad', 'refillable', 'j-beauty', 'lip serum',
      'retinal', 'retinaldehyde', 'exosome', 'nmixx', 'xikers', 'vcha', 'bl drama',
      // 6차 감사 추가
      'tamburins', 'nonfiction perfume', 'granhand', 'k-fragrance', 'korean perfume',
      '3ce', 'espoir', 'amuse', 'laka', 'peach c', 'wakemake',
      'peach & lily', 'peach and lily', 'krave beauty',
      'itzy', 'dreamcatcher', 'fromis_9', 'street woman fighter', 'trot', 'manhwa anime',
      // 7차 감사 추가
      '(g)i-dle', 'gidle', 'idle', 'stylevana', 'neverdie',
      'enhypen', 'txt', 'le sserafim', 'ateez', 'ive',
      'blue dragon', 'cheongryong', 'grand bell', 'daejong',
      // 8차 감사 추가
      'copper peptide', 'ghk-cu', 'matrixyl', 'argireline', 'alpha-arbutin', 'arbutin',
      'the show', 'bong joon-ho', 'hwang dong-hyuk', 'squid game', 'train to busan',
      'baby k-beauty', 'green finger', 'goongbe', 'intimate wash',
      '@cosme', 'cosme ranking', 'glowpick',
      // K-Beauty brands (additional coverage)
      'banila co', 'hince', 'vt cosmetics',
      // K-Entertainment groups — 2nd gen: SNSD/Big Bang/SHINee
      // 3rd gen (2012-2017 debuts): EXO, BTS, BLACKPINK, TWICE, SEVENTEEN, GOT7, MAMAMOO, Red Velvet
      // 3.5/4th gen (2018+ debuts): Stray Kids, ATEEZ, TXT, ENHYPEN, ITZY, aespa, IVE, LE SSERAFIM etc.
      'twice', 'seventeen', 'stray kids', 'ateez', 'txt', 'enhypen',
      'le sserafim', 'ive', 'newjeans', 'aespa', 'babymonster',
      'illit', 'kiss of life', 'tws', 'xg', 'kep1er',
      'shinee', 'exo', 'nct', 'got7', 'monsta x', 'super junior',
      'mamamoo', 'red velvet', 'f(x)', 'girls generation',
      // 2023-2025 debut groups gaining global search traffic
      'riize', 'boynextdoor', 'boy next door', 'zerobaseone', 'zb1',
      'meovv', 'triples', 'tripless', 'hearts2hearts', 'izna', 'ciipher',
      'drippin', 'cravity', 'the boyz', 'treasure', 'day6', 'btob',
      // K-Hip-Hop / K-R&B 아티스트 — 아이돌 외 K-Music 커버리지 확장
      'dean', 'crush', 'zion.t', 'ph-1', 'jay park', 'epik high',
      'dpr live', 'offonoff', 'colde', 'heize', 'lee hi',
      'k-rnb', 'k-hiphop', 'korean rnb', 'korean hip hop',
      // 2024-2025 신규 걸그룹 (누락 보완)
      'young posse', 'badvillain', 'unis',
      // 2024-2026 신규 그룹/아티스트 (seed keywords에 추가됨 — 검증 일관성 필수)
      'plave',            // 버추얼 아이돌, VLAST 소속 (팬덤명 ASTERDOM)
      'g-dragon', 'gdragon', 'kwon jiyong', // YG 솔로 아티스트, BIGBANG 멤버
      'qwer',             // 밴드돌 걸그룹, Million Market/밀리언마켓 (팬덤명 AUBE)
      'whiplash',         // SM Entertainment 4세대 보이그룹 (2024 데뷔)
      '8turn',            // MNH Entertainment 4세대 보이그룹
      'ampers&one', 'ampersone', // FNC Entertainment 걸그룹 (2023 데뷔)
      'katseye',          // HYBE/Geffen 글로벌 걸그룹
      'njz',              // NJZ (NewJeans 2025-2026 활동명)
      // K-Beauty 신규 브랜드 (seed keywords에 추가됨 — 검증 일관성 필수)
      'jumiso',           // 성분 투명성 인디 K-Beauty 브랜드
      'biodance',         // 바이오셀룰로오스 콜라겐 패치 전문
      "d'alba", 'dalba',  // 달바 — Olive Young 글로벌 탑 5 (화이트 트러플)
      'fwee',             // 아이돌 메이크업 브랜드, 지수 콜라보
      'rovectin',         // 피부과 기반 민감성 전문 브랜드
      'cos de baha',      // 성분 집중 최저가 포지셔닝, Amazon K-Beauty
      'skin&lab',         // 비타민C·레티놀 전문 브랜드
      'klavuu',           // 진주/마린 콜라겐 특화
      "ample:n",          // 펩타이드 전문, 가성비 안티에이징
      'aestura',          // 아모레퍼시픽 더마 브랜드, AtoBarrier
      'dr.g',             // 피부과 브랜드, 브라이트닝 필링젤
    ];
    const keywordLower = analysis.selectedKeyword.toLowerCase();
    const titleLower = analysis.suggestedTitle.toLowerCase();
    const combined = keywordLower + ' ' + titleLower + ' ' + analysis.uniqueAngle.toLowerCase();

    const hasKoreaTerm = koreaTerms.some((term) => combined.includes(term));
    if (!hasKoreaTerm) {
      // Reject entirely instead of blindly prepending "Korean"
      logger.warn(`REJECTED keyword "${analysis.selectedKeyword}" — no Korea relevance detected. Forcing Korea-focused fallback.`);
      throw new KeywordResearchError(
        `Keyword "${analysis.selectedKeyword}" has no Korea relevance. Claude must select a Korea-focused keyword.`,
      );
    }

    // Post-parse finance keyword blocker for K-Entertainment niches (strict)
    // K-Beauty case-study/deep-dive may legitimately discuss brand market growth — allow with softer block
    const financeTerms = [
      'revenue', 'profit', 'earnings', 'stock price', 'valuation', 'investment',
      'financial', 'market cap', 'ipo', 'dividend', 'quarterly report', 'annual report',
      'balance sheet', 'income statement', 'fiscal year', 'shareholder',
    ];
    const hasFinanceTerm = financeTerms.some(t => keywordLower.includes(t));
    if (hasFinanceTerm) {
      // K-Beauty case-study and deep-dive can discuss brand market performance
      const isKBeautyAnalysis = niche?.category === 'K-Beauty' && ['case-study', 'deep-dive'].includes(analysis.contentType);
      if (!isKBeautyAnalysis) {
        logger.warn(`REJECTED keyword "${analysis.selectedKeyword}" — finance/business topic blocked for ${niche?.category ?? 'unknown'} niche`);
        throw new KeywordResearchError(
          `Keyword "${analysis.selectedKeyword}" contains finance/business terms. Select a fan-focused or product-focused keyword instead.`,
        );
      }
      logger.info(`Allowed finance term in K-Beauty ${analysis.contentType}: "${analysis.selectedKeyword}" (brand market analysis permitted)`);
    }

    return analysis;
  }

  /**
   * Estimate search volume from Google Trends signals when Claude doesn't provide it.
   * Uses averageInterest + rising query growth to bucket into volume tiers.
   */
  private estimateVolumeFromTrends(
    averageInterest: number,
    risingQueries: RisingQuery[],
    keyword: string,
  ): 'high' | 'medium' | 'low' | 'minimal' {
    // Find if our keyword matches a rising query
    const matchingRising = risingQueries.find(
      (q) => keyword.toLowerCase().includes(q.query.toLowerCase()) || q.query.toLowerCase().includes(keyword.toLowerCase()),
    );
    const hasBreakout = matchingRising?.value === 'Breakout';
    const growthPct = typeof matchingRising?.value === 'number' ? matchingRising.value : 0;

    if (hasBreakout || averageInterest >= 70) return 'high';
    if (growthPct >= 200 || averageInterest >= 40) return 'medium';
    if (averageInterest >= 15 || growthPct >= 50) return 'low';
    return 'minimal';
  }

  /**
   * Estimate monthly search volume number from Google Trends relative interest.
   * Google Trends gives 0-100 relative interest; we estimate actual volume
   * using category-specific multipliers based on known benchmarks.
   */
  private estimateMonthlySearches(
    averageInterest: number,
    risingQueries: RisingQuery[],
    keyword: string,
  ): number {
    // Base multiplier: Trends interest 50 ≈ 5,000 monthly searches for Korea-focused topics
    const baseMultiplier = 100;
    let estimate = averageInterest * baseMultiplier;

    // Boost for matching rising queries (indicates growing demand)
    const matchingRising = risingQueries.find(
      (q) => keyword.toLowerCase().includes(q.query.toLowerCase()) || q.query.toLowerCase().includes(keyword.toLowerCase()),
    );
    if (matchingRising) {
      if (matchingRising.value === 'Breakout') {
        estimate *= 3; // Breakout queries have 3x expected volume
      } else if (typeof matchingRising.value === 'number' && matchingRising.value >= 200) {
        estimate *= 1.5;
      }
    }

    // Long-tail penalty: 4+ word keywords typically have 30-50% less volume
    const wordCount = keyword.split(/\s+/).length;
    if (wordCount >= 6) estimate *= 0.3;
    else if (wordCount >= 4) estimate *= 0.5;

    return Math.round(Math.max(10, estimate));
  }

  /**
   * Estimate keyword difficulty (0-100) using available SERP signals.
   * Combines: Trends competition level, GSC data (if available),
   * keyword length (longer = easier), and topic freshness.
   */
  private estimateKeywordDifficulty(
    keyword: string,
    averageInterest: number,
    competition: 'low' | 'medium' | 'high',
  ): number {
    let difficulty = 0;

    // 1. Competition level from Claude analysis (0-40 points)
    if (competition === 'high') difficulty += 40;
    else if (competition === 'medium') difficulty += 25;
    else difficulty += 10;

    // 2. Search volume proxy from Trends interest (0-25 points)
    // Higher interest = more competition
    difficulty += Math.min(25, Math.round(averageInterest * 0.25));

    // 3. Keyword length bonus (longer = easier, -0 to -15 points)
    const wordCount = keyword.split(/\s+/).length;
    if (wordCount >= 6) difficulty -= 15;
    else if (wordCount >= 5) difficulty -= 10;
    else if (wordCount >= 4) difficulty -= 5;

    // 4. SERP data bonus: use GSC position data for granular difficulty adjustment
    if (this.serpAnalysis) {
      const keywordLower = keyword.toLowerCase();
      const matchingQuery = this.serpAnalysis.strikingDistanceKeywords.find(
        sd => sd.query.toLowerCase().includes(keywordLower) || keywordLower.includes(sd.query.toLowerCase()),
      );
      if (matchingQuery) {
        // Position-based difficulty reduction (closer to top = easier to improve)
        if (matchingQuery.position <= 10) difficulty -= 15;
        else if (matchingQuery.position <= 20) difficulty -= 10;
        else if (matchingQuery.position <= 30) difficulty -= 5;

        // High impressions + low position = competitive keyword (harder than it looks)
        if (matchingQuery.impressions > 1000 && matchingQuery.position > 15) {
          difficulty += 5;
        }
      }
    }

    // 5. Korea-specific niche discount (Korea topics have less English competition)
    const koreaTerms = ['korea', 'korean', 'k-pop', 'k-beauty', 'kospi', 'seoul'];
    if (koreaTerms.some(t => keyword.toLowerCase().includes(t))) {
      difficulty -= 10;
    }

    return Math.max(0, Math.min(100, difficulty));
  }

  /**
   * Analyze actual SERP results to determine optimal content format.
   * Uses SerpAPI to check what format ranks for this keyword.
   */
  private async analyzeSerpFormat(keyword: string): Promise<{
    dominantFormat: string;
    hasListicle: boolean;
    hasVideo: boolean;
    hasFeaturedSnippet: boolean;
    avgWordCount: 'short' | 'medium' | 'long';
    serpFeatures: string[];
  } | null> {
    if (!this.trendsService.hasSerpApi()) return null;

    try {
      const serpData = await this.trendsService.searchSerpApi(keyword);
      if (!serpData) return null;

      const organicResults = (serpData as any).organic_results || [];
      const serpFeatures: string[] = [];

      // Detect SERP features
      if ((serpData as any).answer_box) serpFeatures.push('featured_snippet');
      if ((serpData as any).knowledge_graph) serpFeatures.push('knowledge_panel');
      if ((serpData as any).related_questions) serpFeatures.push('people_also_ask');
      if ((serpData as any).shopping_results) serpFeatures.push('shopping');
      if ((serpData as any).video_results?.length > 0) serpFeatures.push('video_carousel');

      // Analyze top 5 organic results for format patterns
      const top5 = organicResults.slice(0, 5);
      let listicleCount = 0;
      let howToCount = 0;
      let reviewCount = 0;

      for (const result of top5) {
        const title = (result.title || '').toLowerCase();
        const snippet = (result.snippet || '').toLowerCase();
        if (/\d+\s+(best|top|ways|tips|things|reasons)/.test(title)) listicleCount++;
        if (/how to|step.by.step|guide|tutorial/.test(title)) howToCount++;
        if (/review|comparison|vs|versus/.test(title)) reviewCount++;
      }

      const dominantFormat = listicleCount >= 2 ? 'listicle' :
        howToCount >= 2 ? 'how-to' :
        reviewCount >= 2 ? 'product-review' : 'analysis';

      return {
        dominantFormat,
        hasListicle: listicleCount >= 2,
        hasVideo: serpFeatures.includes('video_carousel'),
        hasFeaturedSnippet: serpFeatures.includes('featured_snippet'),
        avgWordCount: 'medium',
        serpFeatures,
      };
    } catch (error) {
      logger.debug(`SERP format analysis failed: ${error instanceof Error ? error.message : error}`);
      return null;
    }
  }

  private parseAnalysis(text: string, niche: NicheConfig): KeywordAnalysis {
    let cleaned = text.replace(/```(?:json)?\s*/g, '').replace(/```\s*$/g, '').trim();

    try {
      return this.validateKoreaRelevance(JSON.parse(cleaned) as KeywordAnalysis, niche);
    } catch {
      // continue
    }

    const startIdx = cleaned.indexOf('{');
    if (startIdx === -1) {
      throw new KeywordResearchError(`No JSON found in Claude analysis for niche "${niche.name}"`);
    }

    let depth = 0;
    let endIdx = -1;
    for (let i = startIdx; i < cleaned.length; i++) {
      const ch = cleaned[i];
      if (ch === '\\') { i++; continue; }
      if (ch === '"') {
        i++;
        while (i < cleaned.length && cleaned[i] !== '"') {
          if (cleaned[i] === '\\') i++;
          i++;
        }
        continue;
      }
      if (ch === '{') depth++;
      if (ch === '}') { depth--; if (depth === 0) { endIdx = i; break; } }
    }

    if (endIdx === -1) {
      throw new KeywordResearchError(`Incomplete JSON in Claude analysis for niche "${niche.name}"`);
    }

    const jsonStr = cleaned.slice(startIdx, endIdx + 1);
    try {
      return this.validateKoreaRelevance(JSON.parse(jsonStr) as KeywordAnalysis, niche);
    } catch (e) {
      throw new KeywordResearchError(
        `Failed to parse analysis JSON for niche "${niche.name}": ${(e as Error).message}`,
      );
    }
  }
}
