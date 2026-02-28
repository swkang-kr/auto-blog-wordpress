import Anthropic from '@anthropic-ai/sdk';
import { logger } from '../utils/logger.js';
import { KeywordResearchError } from '../types/errors.js';
import { GoogleTrendsService } from './google-trends.service.js';
import type { NicheConfig, TrendsData, RisingQuery, KeywordAnalysis, ResearchedKeyword } from '../types/index.js';

export class KeywordResearchService {
  private client: Anthropic;
  private trendsService: GoogleTrendsService;

  constructor(apiKey: string, geo: string) {
    this.client = new Anthropic({ apiKey });
    this.trendsService = new GoogleTrendsService(geo);
  }

  async researchKeyword(
    niche: NicheConfig,
    postedKeywords: string[],
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

    // 3. Ask Claude to select the best keyword
    const analysis = await this.analyzeWithClaude(
      niche,
      { risingQueries, topQueries, averageInterest, trendDirection, trendsSource },
      trendsData,
      postedKeywords,
    );

    logger.info(
      `Research result for "${niche.name}": keyword="${analysis.selectedKeyword}", ` +
      `type=${analysis.contentType}, competition=${analysis.estimatedCompetition}`,
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

    const prompt = `You are an SEO keyword research expert. Analyze the following data for the "${niche.name}" niche and select the BEST keyword and content type for a blog post.

IMPORTANT: Today's date is ${today}. All content must be written for ${year}.

## Niche Info
- Name: ${niche.name}
- Category: ${niche.category}
- Broad Topic: ${niche.broadTerm}
- Allowed Content Types: ${niche.contentTypes.join(', ')}
- Fallback Seed Keywords: ${niche.seedKeywords.join(', ')}

${trendsContext}

## Already Posted Keywords (AVOID these or similar topics)
${postedKeywords.length > 0 ? postedKeywords.map((k) => `- ${k}`).join('\n') : 'None yet'}

## Instructions
1. Select the best keyword to target — MUST be a long-tail keyword (4+ words).
2. Choose the best content type from: ${niche.contentTypes.join(', ')}
   - how-to: Step-by-step guide
   - best-x-for-y: Ranked list with comparisons
   - x-vs-y: Comparison analysis
3. Suggest a unique angle that differentiates from existing content
4. Identify the search intent and competition level
5. List 5-8 LSI (related) keywords to naturally include in the content

CRITICAL keyword selection rules — follow in strict priority order:
1. PRIORITISE rising queries — they have real search momentum and growing demand
2. MUST be low competition (estimatedCompetition: "low")
3. MUST be long-tail (4+ words). Short head terms are NOT acceptable.
4. PREFER question-based keywords ("how to", "what is", "best way to")
5. PREFER keywords with clear informational or commercial investigation intent
6. MUST be different from already posted keywords
7. AVOID head terms dominated by high-authority sites

Respond with pure JSON only. No markdown code blocks.
{"selectedKeyword":"...","contentType":"how-to|best-x-for-y|x-vs-y","suggestedTitle":"...","uniqueAngle":"...","searchIntent":"...","estimatedCompetition":"low|medium|high","reasoning":"...","relatedKeywordsToInclude":["...","..."]}`;

    try {
      const response = await this.client.messages.create({
        model: process.env.CLAUDE_MODEL || 'claude-sonnet-4-6',
        max_tokens: 2000,
        temperature: 0.5,
        messages: [{ role: 'user', content: prompt }],
      });

      const text = response.content[0].type === 'text' ? response.content[0].text : '';
      return this.parseAnalysis(text, niche);
    } catch (error) {
      throw new KeywordResearchError(
        `Claude analysis failed for niche "${niche.name}": ${error instanceof Error ? error.message : error}`,
        error,
      );
    }
  }

  private parseAnalysis(text: string, niche: NicheConfig): KeywordAnalysis {
    let cleaned = text.replace(/```(?:json)?\s*/g, '').replace(/```\s*$/g, '').trim();

    try {
      return JSON.parse(cleaned) as KeywordAnalysis;
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
      return JSON.parse(jsonStr) as KeywordAnalysis;
    } catch (e) {
      throw new KeywordResearchError(
        `Failed to parse analysis JSON for niche "${niche.name}": ${(e as Error).message}`,
      );
    }
  }
}
