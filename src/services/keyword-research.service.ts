import Anthropic from '@anthropic-ai/sdk';
import { logger } from '../utils/logger.js';
import { KeywordResearchError } from '../types/errors.js';
import { GoogleTrendsService } from './google-trends.service.js';
import type { NicheConfig, TrendsData, KeywordAnalysis, ResearchedKeyword } from '../types/index.js';

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

    // 1. Collect Google Trends data for each seed keyword (individual failures allowed)
    const trendsData: TrendsData[] = [];
    for (const seed of niche.seedKeywords) {
      try {
        const data = await this.trendsService.fetchTrendsData(seed);
        trendsData.push(data);
      } catch (error) {
        logger.warn(
          `Trends data failed for seed "${seed}": ${error instanceof Error ? error.message : error}`,
        );
      }
    }

    if (trendsData.length === 0) {
      logger.warn(`All trends data failed for niche "${niche.name}", using fallback mode`);
    }

    // 2. Ask Claude to analyze and select the best keyword + content type
    const analysis = await this.analyzeWithClaude(niche, trendsData, postedKeywords);

    logger.info(
      `Research result for "${niche.name}": keyword="${analysis.selectedKeyword}", ` +
      `type=${analysis.contentType}, competition=${analysis.estimatedCompetition}`,
    );

    return { niche, trendsData, analysis };
  }

  private async analyzeWithClaude(
    niche: NicheConfig,
    trendsData: TrendsData[],
    postedKeywords: string[],
  ): Promise<KeywordAnalysis> {
    const trendsContext = trendsData.length > 0
      ? trendsData.map((t) =>
          `- "${t.keyword}": avg interest=${t.averageInterest}, trend=${t.trendDirection}, ` +
          `breakout=${t.hasBreakout}, related queries=[${t.relatedQueries.slice(0, 5).join(', ')}], ` +
          `related topics=[${t.relatedTopics.slice(0, 5).join(', ')}]`,
        ).join('\n')
      : 'No trends data available. Use your knowledge to select the best keyword from the seed keywords.';

    const today = new Date().toISOString().split('T')[0];
    const year = new Date().getFullYear();

    const prompt = `You are an SEO keyword research expert. Analyze the following data for the "${niche.name}" niche and select the BEST keyword and content type for a blog post.

IMPORTANT: Today's date is ${today}. All content must be written for ${year}. Use the most current information, trends, and data available for ${year}.

## Niche Info
- Name: ${niche.name}
- Category: ${niche.category}
- Seed Keywords: ${niche.seedKeywords.join(', ')}
- Allowed Content Types: ${niche.contentTypes.join(', ')}

## Google Trends Data (12-month analysis)
${trendsContext}

## Already Posted Keywords (AVOID these or similar topics)
${postedKeywords.length > 0 ? postedKeywords.map((k) => `- ${k}`).join('\n') : 'None yet'}

## Instructions
1. Select the best keyword to target (can be a seed keyword, a related query, or a variation)
2. Choose the best content type from: ${niche.contentTypes.join(', ')}
   - how-to: Step-by-step guide (e.g., "How to Make Korean Fried Chicken at Home")
   - best-x-for-y: Ranked list with comparisons (e.g., "Best AI Writing Tools for Bloggers in 2026")
   - x-vs-y: Comparison analysis (e.g., "ChatGPT vs Gemini: Which AI Assistant Is Better?")
3. Suggest a unique angle that differentiates from existing content
4. Identify the search intent and competition level
5. List 5-8 LSI (related) keywords to naturally include in the content

IMPORTANT: Choose a keyword that is DIFFERENT from the already posted keywords. Prioritize:
- Rising trends and breakout topics
- Low-to-medium competition keywords
- High search intent keywords
- Keywords that match the niche well

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

    // Try direct parse
    try {
      return JSON.parse(cleaned) as KeywordAnalysis;
    } catch {
      // continue
    }

    // Extract JSON with brace matching
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
