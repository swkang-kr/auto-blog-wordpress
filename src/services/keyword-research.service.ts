import Anthropic from '@anthropic-ai/sdk';
import { logger } from '../utils/logger.js';
import { KeywordResearchError } from '../types/errors.js';
import { GoogleTrendsService } from './google-trends.service.js';
import { getSeasonalSuggestionsForNiche } from '../utils/korean-calendar.js';
import { costTracker } from '../utils/cost-tracker.js';
import { NaverFinanceThemesService } from './naver-finance-themes.service.js';
import type { NicheConfig, TrendsData, RisingQuery, KeywordAnalysis, ResearchedKeyword, ExistingPost } from '../types/index.js';
import { CONTENT_FRESHNESS_MAP, INTENT_CONTENT_TYPE_MAP, type ContentType, type FreshnessClass } from '../types/index.js';
import type { GSCQueryData } from './gsc-analytics.service.js';

/**
 * Stratified seed keyword sampling: clusters seeds by leading topic word,
 * then picks evenly across clusters so minor categories get representation.
 */
function stratifiedSample(seeds: string[], maxSample: number): string[] {
  if (seeds.length <= maxSample) return [...seeds];

  // Cluster by first meaningful word (skip common prefixes like "best", "how", "top", "korean")
  const SKIP_WORDS = new Set(['best', 'how', 'top', 'korean', 'kospi', 'kosdaq', 'the', 'a', 'what', 'why', 'where', 'when', 'complete', 'guide', 'ultimate']);
  const clusters = new Map<string, string[]>();

  for (const seed of seeds) {
    const words = seed.toLowerCase().split(/\s+/);
    const key = words.find(w => w.length > 2 && !SKIP_WORDS.has(w)) || words[0] || 'other';
    if (!clusters.has(key)) clusters.set(key, []);
    clusters.get(key)!.push(seed);
  }

  // Shuffle within each cluster
  for (const arr of clusters.values()) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  }

  // Round-robin pick from clusters
  const result: string[] = [];
  const clusterArrays = [...clusters.values()];
  // Shuffle cluster order too
  for (let i = clusterArrays.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [clusterArrays[i], clusterArrays[j]] = [clusterArrays[j], clusterArrays[i]];
  }

  let idx = 0;
  while (result.length < maxSample) {
    let added = false;
    for (const cluster of clusterArrays) {
      if (idx < cluster.length && result.length < maxSample) {
        result.push(cluster[idx]);
        added = true;
      }
    }
    if (!added) break;
    idx++;
  }

  return result;
}

/** SERP competition analysis result */
interface SerpAnalysis {
  strikingDistanceKeywords: GSCQueryData[];
  topRankingQueries: GSCQueryData[];
  contentGapHints: string[];
}

export class KeywordResearchService {
  private client: Anthropic;
  private trendsService: GoogleTrendsService;
  private naverThemesService: NaverFinanceThemesService;
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
    this.naverThemesService = new NaverFinanceThemesService();
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
      `${evergreenPct < 50 ? 'MANDATORY: You MUST select an evergreen content type (how-to, deep-dive, or case-study) for this post. Evergreen content is at ' + evergreenPct + '% (target 50%+). Seasonal/time-sensitive types are FORBIDDEN until evergreen ratio recovers.\n' : ''}`;

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
    // Keep Korean Hangul syllables (\uAC00-\uD7A3) and compatibility jamo (\u3130-\u318F) alongside ASCII
    const tokenize = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s\uAC00-\uD7A3\u3130-\u318F]/g, '').split(/\s+/).filter(w => w.length > 1 && !stopWords.has(w));

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
   * contribute less than distinctive terms (e.g., "hbm", "etf", "주식분석").
   * Returns top-N matches with similarity scores.
   */
  private findSimilarPosts(candidateText: string, topN: number = 5): Array<{ post: ExistingPost; similarity: number }> {
    if (this.existingPosts.length === 0) return [];

    const stopWords = new Set(['the', 'a', 'an', 'in', 'on', 'at', 'to', 'for', 'of', 'and', 'or', 'is', 'are', 'was', 'were', 'be', 'been', 'how', 'what', 'why', 'your', 'you', 'this', 'that', 'with', 'best', 'top', 'guide', 'complete', 'ultimate']);
    // Keep Korean Hangul syllables (\uAC00-\uD7A3) and compatibility jamo (\u3130-\u318F) alongside ASCII
    const tokenize = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s\uAC00-\uD7A3\u3130-\u318F]/g, '').split(/\s+/).filter(w => w.length > 1 && !stopWords.has(w));

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

    // 1b. Fetch extra broad terms (e.g., 금융분석, Korean movie) to capture non-primary topics
    // Limit to 2 extra terms to reduce API calls (was unlimited, causing 10+ calls per niche)
    if (niche.broadTermsExtra?.length) {
      const limitedExtra = niche.broadTermsExtra.slice(0, 2);
      for (const extraTerm of limitedExtra) {
        try {
          const extra = await this.trendsService.fetchRisingQueries(extraTerm);
          if (extra.rising.length > 0) {
            risingQueries.push(...extra.rising);
            logger.info(`Extra broad term "${extraTerm}" added ${extra.rising.length} rising queries`);
          }
          if (extra.top.length > 0) {
            topQueries.push(...extra.top);
          }
        } catch (error) {
          logger.debug(`Extra broad term "${extraTerm}" fetch failed: ${error instanceof Error ? error.message : error}`);
        }
      }
      // Deduplicate by query text (case-insensitive)
      const seen = new Set<string>();
      risingQueries = risingQueries.filter(q => {
        const key = q.query.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      const seenTop = new Set<string>();
      topQueries = topQueries.filter(q => {
        const key = q.query.toLowerCase();
        if (seenTop.has(key)) return false;
        seenTop.add(key);
        return true;
      });
    }

    // 2. Fall back to Naver Finance themes (theme-analysis) or seed keywords if no rising queries found
    const trendsData: TrendsData[] = [];
    if (risingQueries.length === 0 && topQueries.length === 0) {
      // 2a. For theme-analysis niche: fetch today's top-rising themes from Naver Finance
      //     This gives fresh, market-driven seeds every day instead of a static list.
      if (topQueries.length === 0 && niche.id === 'theme-analysis') {
        try {
          const naverSeeds = await this.naverThemesService.getTopSeedKeywords(25);
          if (naverSeeds.length > 0) {
            logger.info(`NaverFinance themes: ${naverSeeds.length} dynamic seeds for "${niche.name}" — top: ${naverSeeds.slice(0, 3).join(' / ')}`);
            trendsSource = 'naver-finance';
            // Push as top queries so they go straight to Claude selection (no extra Trends calls needed)
            for (const seed of naverSeeds) {
              topQueries.push({ query: seed, value: 0 });
            }
          }
        } catch (error) {
          logger.warn(`NaverFinance themes fallback failed: ${error instanceof Error ? error.message : error}`);
        }
      }

      // 2b. Fall back to seed keyword scanning if still empty
      //     Sample up to MAX_SEED_SAMPLE random seeds + apply time budget to avoid batch timeout
      if (topQueries.length === 0) {
        const MAX_SEED_SAMPLE = 12; // Increased from 10: wider pool reduces duplicate collisions
        const SEED_TIME_BUDGET_MS = 3.5 * 60 * 1000; // 3.5 minutes: Trends takes 60-90s/query so 2min only gave ~1-2 seeds
        const seedStart = Date.now();

        // Stratified sampling: cluster seeds by first significant word, then sample evenly across clusters
        const sampled = stratifiedSample(niche.seedKeywords, MAX_SEED_SAMPLE);

        trendsSource = 'seed';

        // If Trends API is circuit-broken, skip per-seed Trends calls entirely (seed-only mode)
        if (this.trendsService.isTrendsDown) {
          logger.warn(`No rising queries for "${niche.name}" + Trends API is down — using SEED-ONLY mode (${sampled.length}/${niche.seedKeywords.length} seeds, NO Trends data)`);
          // Create minimal TrendsData entries from seeds so AI can pick from them
          for (const seed of sampled) {
            trendsData.push({
              keyword: seed,
              interestOverTime: [],
              relatedTopics: [],
              relatedQueries: [],
              averageInterest: 0,
              trendDirection: 'stable',
              hasBreakout: false,
            });
          }
        } else {
          logger.warn(`No rising queries for "${niche.name}", falling back to ${sampled.length}/${niche.seedKeywords.length} sampled seed keywords`);

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
        const matchingPost = similarPosts.find(p => p.similarity > 0.70);
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

      const allBroadTerms = [niche.broadTerm, ...(niche.broadTermsExtra || [])].join(', ');
      trendsContext = `## Google Trends Data for broad terms: "${allBroadTerms}" (last 3 months)
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
      const hasTrendsSignal = fallbackTrendsData.some(t => t.averageInterest > 0 || t.relatedQueries.length > 0);
      if (fallbackTrendsData.length > 0 && hasTrendsSignal) {
        trendsContext = `## Google Trends Data (seed keyword analysis)\n` +
          fallbackTrendsData.map((t) =>
            `- "${t.keyword}": avg interest=${t.averageInterest}, trend=${t.trendDirection}, ` +
            `breakout=${t.hasBreakout}, related queries=[${t.relatedQueries.slice(0, 5).join(', ')}]`,
          ).join('\n');
      } else if (fallbackTrendsData.length > 0) {
        // SEED-ONLY mode: Trends API was down, provide seed keywords directly
        trendsContext = `## SEED-ONLY 모드 (Google Trends API 사용 불가)\n아래 시드 키워드 중 가장 적합한 한국어 키워드를 선택하세요. 검색 수요가 높고 경쟁이 낮은 키워드를 선택:\n` +
          fallbackTrendsData.map((t) => `- "${t.keyword}"`).join('\n') +
          `\n\n중요: Trends 데이터 없으므로 에버그린 주제(가이드, 비교, 분석) 우선. 한국어 키워드만 선택.`;
      } else {
        trendsContext = 'No trends data available. Use your knowledge to select the best keyword from the seed keywords.';
      }
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
   - "삼성전자 주가 전망 분석" → "삼성전자 목표가 예측", "삼성전자 매수 타이밍", "삼성전자 투자 분석"
   - "RSI MACD 매매 전략" → "RSI 매매법 주식", "MACD 활용법 가이드", "기술적 분석 초보"
   - "배당주 추천 2026" → "고배당주 순위 정리", "배당 투자 방법", "배당수익률 높은 종목"
   - "Python 자동매매 봇 만들기" → "파이썬 주식 자동매매", "KIS API 연동 가이드", "알고리즘 트레이딩 입문"
3. The test: if a reader searching for your keyword would find an existing post equally relevant, your keyword is TOO SIMILAR.
4. Choose a GENUINELY DIFFERENT subtopic within the niche — not the same topic reworded.
${this.performanceInsights}
${this.getSerpAnalysisSection()}${this.getCompetitorGapSection()}${this.contentTypeDistribution}
${this.getRpmSection(niche.category)}
${this.getSeasonalSection(niche.category)}
${recentContentTypes && recentContentTypes.length > 0 ? `## Content Type Diversity (IMPORTANT)\nRecent content types for this niche: ${recentContentTypes.join(', ')}\nAvoid overusing the same content type. If "${recentContentTypes[recentContentTypes.length - 1]}" was used recently, PREFER a different type to maintain reader variety.\n` : ''}
${this.serpFormatHint ? `\n## SERP Format Intelligence\n${this.serpFormatHint}\nThe content type MUST match the dominant SERP format unless there's a compelling reason to differentiate.` : ''}
${this.paaQuestions.length > 0 ? `\n## People Also Ask (PAA) Questions\nThese questions appear in Google's PAA box for related queries — HIGH VALUE for FAQ sections:\n${this.paaQuestions.map(q => `- ${q}`).join('\n')}\nInclude answers to at least 3 of these in your FAQ section for featured snippet targeting.` : ''}
## 지시사항 (모든 출력은 한국어로)
1. 가장 적합한 **한국어** 키워드를 선택하세요 — 반드시 한국어 롱테일 키워드 (3단어 이상).
2. 콘텐츠 유형 선택: ${niche.contentTypes.join(', ')}
   - analysis: 데이터 기반 다각도 분석
   - deep-dive: 단일 주제 심층 탐구
   - news-explainer: 최근 시장 이벤트 해설
   - how-to: 단계별 가이드
   - best-x-for-y: 비교 순위 리스트
   - x-vs-y: 비교 분석
   - listicle: 10-20개 항목 큐레이션 리스트
   - case-study: 실전 사례 분석 (배경 → 전략 → 결과 → 교훈)
3. 기존 콘텐츠와 차별화되는 독창적 앵글 제안
4. suggestedTitle 규칙 (한국어로 작성):
   - selectedKeyword를 그대로 포함
   - 한국어로 20-35자
   - 콘텐츠 유형별 패턴:
     * how-to: "[주제] 방법 완벽 가이드 [연도]" (예: "주식 차트 보는 법 완벽 가이드 2026")
     * best-x-for-y: "[주제] 추천 [수량]선 비교 [연도]" (예: "배당주 추천 TOP 7 비교 분석 2026")
     * analysis: "[종목/지표] 분석: [핵심 발견]" (예: "삼성전자 PER 분석: 저평가 구간인가?")
   - 금지: "~의 모든 것", "완벽 정리", "꼭 알아야 할"
5. 검색 의도와 경쟁도 판단
6. LSI(관련) 키워드 5-8개 (한국어)

핵심 키워드 선택 규칙 (우선순위 순):
1. **종목명이 포함된 키워드 최우선** — seed에 구체적 종목명(예: 태림포장, 삼성전자 등)이 있으면 반드시 해당 종목을 키워드에 포함. 일반적인 "AI 매수 시그널", "스윙 매매" 같은 범용 키워드보다 "태림포장 주가 전망 분석" 같은 종목 특화 키워드 선택.
2. 상승 트렌드 키워드 우선 — 실제 검색 수요가 증가 중인 키워드
3. 한국 금융/투자 주제 필수: 한국 주식, 종목 분석, 투자 전략, DART 공시, 기술적 분석, 자동매매 등
4. 낮은 경쟁도 (estimatedCompetition: "low")
5. 롱테일 키워드 (한국어 3단어 이상, 예: "삼성전자 주가 전망 분석")
6. 한국어 키워드 우선. 영문 키워드 선택 금지.
7. 기존 발행 키워드와 중복 금지
8. 타겟 독자: 한국인 개인 투자자 (네이버 증권, 키움증권 사용자)

7. 키워드 난이도 추정 (0-100)
8. 월간 검색량 추정 (네이버 기준 한국어 검색량)
9. 검색 의도 분류: informational, commercial, commercial-investigation, transactional, navigational
   - commercial-investigation: 비교 검색 (예: "삼성전자 vs SK하이닉스 비교", "KODEX vs TIGER ETF")
   - commercial: 구매 의도 (예: "배당주 추천 2026", "국내 ETF 추천")
   - transactional: 행동 의도 (예: "키움증권 계좌 개설 방법", "공모주 청약 방법")
10. 의도-유형 정합성:
   - transactional intent → MUST use: product-review, best-x-for-y, or how-to
   - commercial intent → MUST use: best-x-for-y, x-vs-y, product-review, listicle, or analysis
   - commercial-investigation intent → MUST use: x-vs-y, best-x-for-y, product-review, analysis, listicle, or deep-dive
   - informational intent → MUST use: how-to, deep-dive, analysis, news-explainer, case-study, or listicle
   - navigational intent → MUST use: deep-dive, news-explainer, or how-to
11. Generate 3-5 long-tail keyword variants related to your selected keyword for satellite content strategy

순수 JSON만 응답. 마크다운 코드 블록 금지. selectedKeyword, suggestedTitle, uniqueAngle, reasoning, relatedKeywordsToInclude, longTailVariants 모두 한국어로 작성.
{"selectedKeyword":"삼성전자 주가 전망 분석 2026","contentType":"analysis|deep-dive|news-explainer|how-to|best-x-for-y|x-vs-y|listicle|case-study|product-review","suggestedTitle":"삼성전자 주가 전망: PER 12배의 의미와 매수 타이밍 분석","uniqueAngle":"한국어로 작성","searchIntent":"informational|commercial|commercial-investigation|transactional|navigational","estimatedCompetition":"low|medium|high","keywordDifficulty":25,"volumeEstimate":"high|medium|low|minimal","estimatedMonthlySearches":1500,"reasoning":"한국어로 이유 설명","relatedKeywordsToInclude":["관련 키워드 1","관련 키워드 2"],"longTailVariants":["롱테일 변형 1","롱테일 변형 2","롱테일 변형 3"]}`;

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
      'chaebol', 'won', 'krw', 'naver', 'kakao', 'hybe',
      'hanwha', 'posco', 'kia', 'lotte', 'cj', 'pangyo', 'gangnam',
      'busan', 'jeju', 'incheon',
      'chaebols', 'kbank', 'toss', 'coupang', 'baemin', 'daum', 'musinsa',
      // Korean stock market / finance terms
      'krx', 'dart', 'bok', 'bank of korea', 'fsc', 'fss',
      'sk hynix', 'samsung electronics', 'lg energy', 'samsung sdi',
      'celltrion', 'samsung biologics', 'naver', 'kakao',
      'hyundai motor', 'kia', 'hd hyundai', 'posco holdings',
      'doosan', 'hanwha aerospace', 'lig nex1',
      'kodex', 'tiger', 'arirang', // Korean ETF brands
      'kis', 'kiwoom', 'mirae asset', 'samsung securities', 'kb securities',
      'interpark', 'koscom',
      // Trading/quant terms associated with Korean market
      'hbm', 'dram', 'nand', 'foundry', // semiconductor
      'ev battery', 'cathode', 'anode', 'solid state battery',
      'biosimilar', 'cdmo', // biotech
      'vi', 'volatility interruption', // Korean market specific
      'dividend', 'ex-dividend', '배당',
      'rsi', 'macd', 'bollinger', 'technical analysis',
      'algorithmic trading', 'backtesting', 'quant',
      // ── 한국어 금융 키워드 (Korea relevance 매칭용) ──
      '주가', '주식', '투자', '매수', '매도', '전망', '분석', '종목', '추천',
      '상승', '하락', '급등', '급락', '수익률', '손절', '익절', '배당',
      '실적', '공시', '시가총액', '목표가', '차트', '캔들', '이동평균',
      '볼린저', '골든크로스', '데드크로스', '과매도', '과매수',
      '업종', '섹터', '테마', '관련주', '수혜주', '대장주',
      '외국인', '기관', '개인', '수급', '순매매', '순매수', '순매도',
      '공매도', '신용', '미수', '대차', '프로그램매매',
      '배당락', '유상증자', '무상증자', '자사주', '액면분할',
      '공모주', '청약', 'IPO', '상장',
      '기준금리', '환율', '원달러', 'GDP', '물가', '인플레이션',
      '자동매매', '알고리즘', '백테스트', '퀀트', '봇',
      '리밸런싱', '포트폴리오', '분산투자', '리스크',
      // 한국 기업명 (한글)
      '삼성전자', 'SK하이닉스', '현대자동차', '기아', 'LG에너지솔루션',
      '삼성SDI', 'POSCO', '셀트리온', '삼성바이오', '네이버', '카카오',
      '한화에어로', '두산에너빌리티', '현대중공업', 'HD현대',
      'LG화학', 'SK이노베이션', 'KB금융', '신한금융', '하나금융',
      // 한국 증권사/플랫폼
      '키움', '미래에셋', '삼성증권', 'KB증권', '한국투자증권',
      '네이버증권', '증권사', '계좌', 'MTS', 'HTS',
      // 2024-2026 추가 한국 기업/ETF/섹터 키워드
      '코스피', '코스닥', '코스피200', '코스닥150',
      '반도체', '이차전지', '바이오', '방산', '조선', '자동차', '금융',
      '리츠', 'REIT', '배당주', '성장주', '가치주', '우선주',
      'TIGER', 'KODEX', 'ARIRANG', 'KBSTAR', 'HANARO',
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

    // Finance keyword blocker REMOVED — this is a finance blog.
    // All finance terms (revenue, earnings, IPO, dividend, etc.) are core content.

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
    const koreaTerms = ['korea', 'korean', 'kospi', 'kosdaq', 'seoul', '한국', '주식', '종목'];
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
