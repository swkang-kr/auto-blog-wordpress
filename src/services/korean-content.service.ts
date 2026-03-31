import Anthropic from '@anthropic-ai/sdk';
import { logger } from '../utils/logger.js';
import { costTracker } from '../utils/cost-tracker.js';

/**
 * Korean content generation service.
 * Translates high-performing English posts into Korean for hreflang SEO.
 * Uses Claude API for natural Korean localization (not machine translation).
 */
export class KoreanContentService {
  private client: Anthropic;
  private model: string;

  constructor(apiKey: string, model: string = 'claude-sonnet-4-6') {
    this.client = new Anthropic({ apiKey });
    this.model = model;
  }

  /**
   * Generate Korean version of an English blog post.
   * Returns localized title, HTML content, and excerpt.
   * Uses cultural adaptation rather than direct translation.
   */
  async generateKoreanVersion(
    englishTitle: string,
    englishHtml: string,
    englishExcerpt: string,
    category: string,
    keyword: string,
  ): Promise<{ title: string; html: string; excerpt: string; tags: string[] } | null> {
    try {
      // Strip inline CSS and extract text-heavy content for translation
      const strippedHtml = englishHtml
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
      // Safe HTML truncation: cut at a closing tag boundary to avoid malformed HTML
      // 25K chars to prevent deep-dive content (3,500 word target) from being truncated
      const contentForTranslation = KoreanContentService.safeHtmlTruncate(strippedHtml, 25000);

      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 12000,
        messages: [{
          role: 'user',
          content: `You are a professional Korean content localizer. Convert this English blog post into natural, native-sounding Korean content. This is NOT a direct translation — adapt the content for a Korean audience.

## Rules:
- Write in natural Korean (not translationese)
- Keep the same HTML structure and styling
- Adapt examples/references for Korean readers where appropriate
- Keep English brand names, technical terms, and proper nouns as-is
- Korean SEO: include the keyword naturally in Korean context
- Title: Create a compelling Korean title (not direct translation)
- Excerpt: Korean meta description, 60-80 characters (한글은 Google SERP에서 픽셀 너비 기준 ~920px 이내로 렌더링 — 영어보다 글자당 넓으므로 짧게)
- Tags: 5-8 Korean tags related to the topic
- 한국주식 specific: Replace USD pricing with KRW pricing from 네이버금융. Reference DART, KRX, BOK as authoritative sources. Use Korean financial terminology: PER/PBR/ROE/시가총액/배당수익률.

## 13차 감사: Korean Terminology Consistency Standards
${['시장분석', '업종분석'].includes(category) ? `Use standardized Korean market analysis terms:
- KOSPI/KOSDAQ 지수, 시장지수, 코스피/코스닥
- 시장 흐름, 매크로, 금리, 환율, 외국인 순매수/순매도
- 주도주, 낙폭과대, 기술적 반등, 지지/저항` : ''}${category === '테마분석' ? `Use standardized Korean theme investing terms:
- 테마주, 주도 테마, 모멘텀, 수혜주, 관련주
- 정책 모멘텀, 실적 시즌, 공시, 뉴스 플로우` : ''}${category === '종목분석' ? `Use standardized Korean stock analysis terms:
- PER, PBR, ROE, 영업이익률, 시가총액, 배당수익률
- 알고리즘 트레이딩, 퀀트, 백테스트, 매수/매도 시그널
- DART 공시, 실적 발표, 어닝 서프라이즈/쇼크` : ''}

## 24차 감사: Korean Punctuation Style
- Use Korean quotation marks where appropriate: 「」 for titles, 『』 for publications
- Use standard Korean ellipsis: ··· (가운뎃점) or … (말줄임표)
- Maintain natural Korean sentence endings — avoid translationese patterns

## English Title: ${englishTitle}
## Category: ${category}
## Keyword: ${keyword}
## English Excerpt: ${englishExcerpt}

## English Content:
${contentForTranslation}

Respond ONLY in this JSON format:
{
  "title": "Korean title here",
  "html": "Korean HTML content here",
  "excerpt": "Korean meta description here",
  "tags": ["태그1", "태그2", "태그3"]
}`,
        }],
      });

      // Track API cost
      if (response.usage) {
        costTracker.addClaudeCall(this.model, response.usage.input_tokens, response.usage.output_tokens);
      }

      const text = response.content[0].type === 'text' ? response.content[0].text : '';

      // Parse JSON response
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        logger.warn('Korean content generation: Failed to parse JSON response');
        return null;
      }

      const { jsonrepair } = await import('jsonrepair');
      const parsed = JSON.parse(jsonrepair(jsonMatch[0])) as {
        title: string;
        html: string;
        excerpt: string;
        tags: string[];
      };

      if (!parsed.title || !parsed.html) {
        logger.warn('Korean content generation: Missing required fields in response');
        return null;
      }

      logger.info(`Korean version generated: "${parsed.title}" (${parsed.html.length} chars)`);
      return parsed;
    } catch (error) {
      logger.warn(`Korean content generation failed: ${error instanceof Error ? error.message : error}`);
      return null;
    }
  }

  /**
   * Generate Korean keyword suggestions for a given English keyword.
   * Returns Korean search terms that Korean users would actually use.
   */
  async researchKoreanKeyword(
    englishKeyword: string,
    category: string,
  ): Promise<{ koreanKeyword: string; searchTerms: string[]; naverTags: string[] } | null> {
    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 1000,
        messages: [{
          role: 'user',
          content: `You are a Korean SEO expert. For the English keyword "${englishKeyword}" in the "${category}" category, provide:
1. The primary Korean search keyword (what Korean users would type in Naver/Google Korea)
2. 5 related Korean search terms (long-tail variants)
3. 5 Naver blog tags (Korean hashtags for Naver Blog/Cafe visibility)

Rules:
- Use natural Korean search patterns (not translations)
- Include both pure Korean and mixed Korean-English terms
- Consider Naver search behavior (shorter, more colloquial)
- Tags should be without # prefix

Respond in JSON:
{"koreanKeyword":"한국어 키워드","searchTerms":["관련 검색어1","관련 검색어2"],"naverTags":["태그1","태그2"]}`,
        }],
      });

      if (response.usage) {
        costTracker.addClaudeCall(this.model, response.usage.input_tokens, response.usage.output_tokens);
      }

      const text = response.content[0].type === 'text' ? response.content[0].text : '';
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return null;

      const { jsonrepair } = await import('jsonrepair');
      const parsed = JSON.parse(jsonrepair(jsonMatch[0])) as {
        koreanKeyword: string;
        searchTerms: string[];
        naverTags: string[];
      };

      if (!parsed.koreanKeyword) return null;

      logger.info(`Korean keyword research: "${englishKeyword}" → "${parsed.koreanKeyword}"`);
      return parsed;
    } catch (error) {
      logger.warn(`Korean keyword research failed: ${error instanceof Error ? error.message : error}`);
      return null;
    }
  }

  /**
   * Build Naver-specific meta tags for Korean content.
   * Naver respects standard meta tags + Open Graph, but also uses specific conventions.
   */
  /**
   * Safely truncate HTML at a tag boundary to prevent malformed input.
   * Finds the last closing tag before the limit and cuts there.
   */
  private static safeHtmlTruncate(html: string, maxLength: number): string {
    if (html.length <= maxLength) return html;

    // Find the last complete closing tag before the limit
    const truncated = html.slice(0, maxLength);
    const lastClosingTag = truncated.lastIndexOf('</');
    if (lastClosingTag > maxLength * 0.7) {
      // Find the end of this closing tag
      const tagEnd = truncated.indexOf('>', lastClosingTag);
      if (tagEnd !== -1) {
        return truncated.slice(0, tagEnd + 1);
      }
    }

    // Fallback: cut at last '>' to avoid splitting a tag
    const lastGt = truncated.lastIndexOf('>');
    if (lastGt > maxLength * 0.7) {
      return truncated.slice(0, lastGt + 1);
    }

    return truncated;
  }

  static buildNaverMetaTags(
    koreanTitle: string,
    koreanExcerpt: string,
    naverTags: string[],
    postUrl: string,
  ): Record<string, string> {
    return {
      // Standard Naver-compatible meta
      'og:title': koreanTitle,
      'og:description': koreanExcerpt,
      'og:url': postUrl,
      'og:type': 'article',
      'og:locale': 'ko_KR',
      // Naver Blog/Cafe discovery
      'article:tag': naverTags.join(','),
      // Korean content signal
      'content-language': 'ko',
    };
  }
}
