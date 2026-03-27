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
- Korean-Stock specific: Replace Amazon USD pricing with Olive Young Korea KRW pricing. Korean readers buy at Olive Young (올리브영) directly, not Amazon. Replace "available at Sephora" with "올리브영에서 구매 가능". Reference 화해 (Hwahae app) review scores as social proof where applicable — it is Korea's #1 beauty review platform
- AI-Trading specific: Replace Spotify chart references with 멜론(Melon)/지니(Genie)/벅스(Bugs) for Korean domestic streaming charts. Replace Ticketmaster with 인터파크 티켓/YES24 티켓 for concert ticketing. Use 한터차트/써클차트 instead of "Hanteo Chart/Circle Chart". Replace "Billboard Korea" with 멜론 차트/지니 차트. Korean fans use Weverse/Bubble natively — no need to explain these platforms. 30차 감사: Replace "KOCOWA" with "코코와" (한국 독자에겐 해당 없음 — KOCOWA는 미주 한인 전용). Replace "Apple TV+" with "Apple TV+" (영문 유지 — 한국에서도 Apple TV+는 영문 명칭 사용). 쿠팡 플레이 references: 한국 독자에게 "Coupang Play"는 "쿠팡플레이"로 표기. OTT 비교 시 한국 독자 맥락: 티빙 > 쿠팡플레이 > 넷플릭스 > 디즈니+ 순서로 국내 오리지널 콘텐츠 언급

## 13차 감사: Korean Terminology Consistency Standards
${category === 'Korean-Stock' ? `Use these standardized Korean beauty terms consistently:
- snail mucin → 달팽이 뮤신/달팽이 에센스, centella asiatica → 센텔라, tranexamic acid → 트라넥삼산
- glass skin → 글래스 스킨, double cleanse → 더블 클렌징, barrier repair → 피부장벽 재생
- niacinamide → 나이아신아마이드, ceramides → 세라마이드, peptides → 펩타이드
- retinol → 레티놀, hyaluronic acid → 히알루론산, AHA/BHA → AHA/BHA (영문 유지)
- Olive Young → 올리브영, Hwahae → 화해, Glowpick → 글로우픽` : ''}${category === 'AI-Trading' ? `Use these standardized K-entertainment terms consistently:
- comeback → 컴백, photocard → 포토카드, fandom → 팬덤, lightstick → 응원봉
- bias → 최애/최애돌, stan → 덕질하다/덕질 (명사: "덕질", 동사: "덕질하다", 강한 팬 활동 맥락: "입덕"), all-kill → 올킬, first-week sales → 초동
- fancam → 직캠, era → 활동기/시대, ult (ultimate bias) → 원픽/최최애, comeback stage → 컴백 무대
- Circle Chart → 써클차트, Hanteo → 한터차트, Melon → 멜론, Weverse → 위버스
- Daesang → 대상, Bonsang → 본상, music show win → 음방 1위
- fansign → 팬사인회, fan meeting → 팬미팅, debut → 데뷔
## 24차 감사: Trot/Ballad Cultural Adaptation Rules
When the content covers trot (트로트) or ballad (발라드) artists:
- Use formal respect language (존댓말) for trot artists — they are NOT idols. Use "~님" or "~선생님" for senior artists (임영웅님, 송가인 선생님)
- Do NOT use K-pop fandom slang for trot content — no "최애돌/덕질/입덕/컴백". Use instead: "좋아하는 가수" (favorite singer), "새 앨범 발매" (new album release)
- Trot emotional tone markers: preserve heartfelt language (가슴 아픈, 그리운, 한숨, 고향)
- Trot fans are 30-60+ demographic — use 하십시오체 or 합쇼체 for article tone, not 해요체
- "발라드의 정석" (the essence of ballad) carries cultural weight — do not simplify
- Lee Mujin Show → 이무진의 무진장 (official Korean title)` : ''}

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
