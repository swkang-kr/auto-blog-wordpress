import Anthropic from '@anthropic-ai/sdk';
import { logger } from '../utils/logger.js';
import { ContentGenerationError } from '../types/errors.js';
import type { TrendKeyword, BlogContent } from '../types/index.js';

const SYSTEM_PROMPT = `당신은 한국어 SEO 전문 블로그 작가입니다.
주어진 트렌드 키워드를 기반으로 블로그 글을 작성하세요.

규칙:
1. 제목: 검색 유입을 높이는 매력적인 제목 (60자 이내)
2. 본문: 1,500자 이상의 HTML 형식 (H2/H3 구조 사용)
3. 글 시작에 목차를 포함하세요
4. 자연스럽고 전문가적인 한국어 톤 사용
5. 메타 디스크립션: 160자 이내 요약
6. 태그: 관련 키워드 5~10개
7. 카테고리: 가장 적합한 카테고리 1개
8. 이미지 프롬프트: 대표 이미지 1개 + 본문 삽입 이미지 2개의 영문 프롬프트

반드시 아래 JSON 형식으로만 응답하세요:
{
  "title": "포스트 제목",
  "html": "<h2>목차</h2>...<h2>본문</h2>...",
  "excerpt": "메타 디스크립션",
  "tags": ["태그1", "태그2"],
  "category": "카테고리명",
  "imagePrompts": ["featured image prompt", "inline image 1 prompt", "inline image 2 prompt"]
}`;

export class ContentGeneratorService {
  private client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async generateContent(keyword: TrendKeyword): Promise<BlogContent> {
    logger.info(`Generating content for keyword: "${keyword.title}"`);

    const userPrompt = `키워드: "${keyword.title}"
설명: "${keyword.description}"
출처: ${keyword.source}
검색량: ${keyword.traffic}

위 트렌드 키워드에 대해 깊이 있는 블로그 글을 작성해주세요.`;

    const response = await this.client.messages.create({
      model: 'claude-sonnet-4-6-20250514',
      max_tokens: 4096,
      temperature: 0.7,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const text =
      response.content[0].type === 'text' ? response.content[0].text : '';

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new ContentGenerationError(`Failed to parse JSON from Claude response for "${keyword.title}"`);
    }

    const content = JSON.parse(jsonMatch[0]) as BlogContent;

    if (!content.title || !content.html) {
      throw new ContentGenerationError(`Incomplete content generated for "${keyword.title}"`);
    }

    logger.info(`Content generated: "${content.title}" (${content.html.length} chars)`);
    return content;
  }
}
