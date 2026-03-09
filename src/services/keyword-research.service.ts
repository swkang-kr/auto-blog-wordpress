import Anthropic from '@anthropic-ai/sdk';
import { logger } from '../utils/logger.js';
import { KeywordResearchError } from '../types/errors.js';
import { GoogleTrendsService } from './google-trends.service.js';
import { getSeasonalSuggestionsForNiche } from '../utils/korean-calendar.js';
import { costTracker } from '../utils/cost-tracker.js';
import type { NicheConfig, TrendsData, RisingQuery, KeywordAnalysis, ResearchedKeyword, ExistingPost } from '../types/index.js';
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
  private performanceInsights: string;
  private existingPosts: ExistingPost[];
  private existingPostTitles: string[];
  private serpAnalysis: SerpAnalysis | null;

  constructor(apiKey: string, geo: string) {
    this.client = new Anthropic({ apiKey });
    this.trendsService = new GoogleTrendsService(geo);
    this.performanceInsights = '';
    this.existingPosts = [];
    this.existingPostTitles = [];
    this.serpAnalysis = null;
  }

  /** Set GA4 performance insights to include in keyword research prompts */
  setPerformanceInsights(insights: string): void {
    this.performanceInsights = insights;
  }

  /** Set existing post titles for similarity-based dedup */
  setExistingPosts(posts: ExistingPost[]): void {
    this.existingPosts = posts;
    this.existingPostTitles = posts.map(p => p.title.toLowerCase());
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

    // 2. Fall back to seed keyword scanning if no rising queries found
    const trendsData: TrendsData[] = [];
    if (risingQueries.length === 0 && topQueries.length === 0) {
      logger.warn(`No rising queries for "${niche.name}", falling back to seed keywords`);
      trendsSource = 'seed';

      for (const seed of niche.seedKeywords) {
        try {
          const data = await this.trendsService.fetchTrendsData(seed);
          trendsData.push(data);
        } catch (error) {
          logger.warn(`Trends data failed for seed "${seed}": ${error instanceof Error ? error.message : error}`);
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

      // Similarity-based dedup: skip cannibalized keywords and retry
      if (this.existingPosts.length > 0) {
        const candidateText = `${analysis.selectedKeyword} ${analysis.suggestedTitle}`;
        const matchingPost = this.existingPosts.find(
          p => this.textSimilarity(candidateText, p.title) > 0.6,
        );
        if (matchingPost) {
          logger.warn(
            `Attempt ${attempt}/${MAX_ATTEMPTS}: "${analysis.selectedKeyword}" too similar to existing "${matchingPost.title}" (ID: ${matchingPost.postId}). Retrying with different keyword.`,
          );
          rejectedKeywords.push(analysis.selectedKeyword);
          analysis = undefined;
          continue;
        }
      }

      break;
    }

    if (!analysis) {
      throw new KeywordResearchError(`Failed to find unique Korea-relevant keyword for niche "${niche.name}" after ${MAX_ATTEMPTS} attempts`);
    }

    // Fallback volume estimation from Trends data if Claude didn't provide it
    if (!analysis.volumeEstimate) {
      analysis.volumeEstimate = this.estimateVolumeFromTrends(
        averageInterest,
        risingQueries,
        analysis.selectedKeyword,
      );
      logger.debug(`Volume auto-estimated from Trends: ${analysis.volumeEstimate}`);
    }

    logger.info(
      `Research result for "${niche.name}": keyword="${analysis.selectedKeyword}", ` +
      `type=${analysis.contentType}, competition=${analysis.estimatedCompetition}, volume=${analysis.volumeEstimate}`,
    );

    return { niche, trendsData, analysis };
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
      const risingLines = risingData.risingQueries.length > 0
        ? risingData.risingQueries
            .map(q => `  - "${q.query}" (${q.value === 'Breakout' ? 'Breakout 🔥' : `+${q.value}%`})`)
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
${postedKeywords.length > 0 ? postedKeywords.slice(-30).map((k) => `- ${k}`).join('\n') : 'None yet'}
${postedKeywords.length > 30 ? `(showing most recent 30 of ${postedKeywords.length} total)` : ''}

IMPORTANT: Do NOT just avoid exact matches — avoid topics that would create content cannibalization.
For example, if "how to invest in Korean stocks" is posted, do NOT select "investing in Korean stocks for beginners" or "Korean stock investment guide".
${this.performanceInsights}
${this.getSerpAnalysisSection()}
${this.getSeasonalSection(niche.category)}
${recentContentTypes && recentContentTypes.length > 0 ? `## Content Type Diversity (IMPORTANT)\nRecent content types for this niche: ${recentContentTypes.join(', ')}\nAvoid overusing the same content type. If "${recentContentTypes[recentContentTypes.length - 1]}" was used recently, PREFER a different type to maintain reader variety.\n` : ''}
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
3. Suggest a unique angle that differentiates from existing content
4. Generate a suggestedTitle that is search-intent-first. Rules for suggestedTitle:
   - MUST contain the selectedKeyword verbatim or within 1-2 filler words
   - MUST include "Korea", "Korean", or a specific Korean brand/entity
   - Choose the pattern matching the content type:
     * how-to / explainer: "[How/What] [Korea topic] [qualifier]" or "[Primary Keyword] ([Year] Guide)"
       e.g. "How to Invest in Korean Stocks as a Foreigner (2026 Guide)"
     * best-x-for-y / x-vs-y: "[Number] Best [thing] for [audience] in [Year]" or "[X] vs [Y]: [insight]"
       e.g. "5 Best Korean ETFs for Foreign Investors in 2026"
     * analysis / deep-dive / news-explainer: "[Korea topic]: [what the analysis reveals]"
       e.g. "K-pop's Business Model: How Agencies Turn Fans Into Revenue"
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
9. TARGET global English-speaking audience interested in Korea (investors, K-culture fans, tech watchers)

Respond with pure JSON only. No markdown code blocks.
{"selectedKeyword":"...","contentType":"analysis|deep-dive|news-explainer|how-to|best-x-for-y|x-vs-y|listicle|case-study","suggestedTitle":"...","uniqueAngle":"...","searchIntent":"...","estimatedCompetition":"low|medium|high","volumeEstimate":"high|medium|low|minimal","reasoning":"...","relatedKeywordsToInclude":["...","..."]}`;

    try {
      const response = await this.client.messages.create({
        model: process.env.CLAUDE_MODEL || 'claude-sonnet-4-6',
        max_tokens: 2000,
        temperature: 0.5,
        messages: [{ role: 'user', content: prompt }],
      });

      const text = response.content[0].type === 'text' ? response.content[0].text : '';
      costTracker.addClaudeCall(
        process.env.CLAUDE_MODEL || 'claude-sonnet-4-6',
        response.usage?.input_tokens || 0,
        response.usage?.output_tokens || 0,
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

  private getSeasonalSection(category: string): string {
    const suggestions = getSeasonalSuggestionsForNiche(category);
    if (suggestions.length === 0) return '';
    return `\n## Korean Seasonal Context (consider these angles)\n${suggestions.map(s => `- ${s}`).join('\n')}\n`;
  }

  private validateKoreaRelevance(analysis: KeywordAnalysis): KeywordAnalysis {
    const koreaTerms = [
      'korea', 'korean', 'seoul', 'samsung', 'hyundai', 'lg', 'sk', 'kospi', 'kosdaq',
      'hallyu', 'k-pop', 'kpop', 'k-drama', 'kdrama', 'k-entertainment', 'kimchi',
      'chaebol', 'won', 'krw', 'naver', 'kakao', 'hybe', 'bts', 'blackpink',
      'webtoon', 'hanwha', 'posco', 'kia', 'lotte', 'cj', 'pangyo', 'gangnam',
      'bibimbap', 'soju', 'hanbok', 'tteokbokki', 'busan', 'jeju', 'incheon',
      'chaebols', 'kbank', 'toss', 'coupang', 'baemin', 'daum', 'musinsa',
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

  private parseAnalysis(text: string, niche: NicheConfig): KeywordAnalysis {
    let cleaned = text.replace(/```(?:json)?\s*/g, '').replace(/```\s*$/g, '').trim();

    try {
      return this.validateKoreaRelevance(JSON.parse(cleaned) as KeywordAnalysis);
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
      return this.validateKoreaRelevance(JSON.parse(jsonStr) as KeywordAnalysis);
    } catch (e) {
      throw new KeywordResearchError(
        `Failed to parse analysis JSON for niche "${niche.name}": ${(e as Error).message}`,
      );
    }
  }
}
