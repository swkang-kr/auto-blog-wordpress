import Anthropic from '@anthropic-ai/sdk';
import { logger } from '../utils/logger.js';
import { ContentGenerationError } from '../types/errors.js';
import type { TrendKeyword, BlogContent } from '../types/index.js';

const SYSTEM_PROMPT = `당신은 한국의 네이버 블로그 스타일에 능숙한 SEO 전문 블로그 작가입니다.
주어진 트렌드 키워드를 기반으로 블로그 글을 작성하세요.

규칙:
1. 제목: 검색 유입을 높이는 매력적인 제목 (60자 이내)
2. 본문: 2,000자 이상의 HTML 형식 (네이버 블로그 스타일 inline CSS 적용)
3. 글 시작에 목차를 포함하세요
4. 자연스럽고 전문가적인 한국어 톤 사용
5. 메타 디스크립션: 160자 이내 요약
6. 태그: 관련 키워드 5~10개
7. 카테고리: 가장 적합한 카테고리 1개

★ 이미지 프롬프트 규칙 (매우 중요):
- imagePrompts 배열에 정확히 4개의 영문 이미지 프롬프트를 생성하세요
- 첫 번째(index 0): 대표 이미지 - 글의 핵심 주제를 시각적으로 표현
- 나머지 3개(index 1~3): 본문 각 섹션에 삽입할 이미지
- 4개의 프롬프트는 반드시 서로 완전히 다른 장면/피사체/구도를 묘사해야 합니다 (중복 금지!)
- 각 프롬프트는 반드시 50단어 이상으로 구체적으로 작성하세요
- 장면, 구도, 색감, 분위기, 피사체, 배경을 상세히 묘사하세요
- 블로그 글 내용과 직접적으로 관련된 장면을 묘사하세요
- 절대로 "featured image", "inline image" 같은 일반적 설명을 쓰지 마세요
- 절대로 동일하거나 유사한 프롬프트를 반복하지 마세요

★ imageCaptions 규칙:
- imageCaptions 배열에 정확히 4개의 한국어 이미지 캡션을 생성하세요
- 각 캡션은 해당 이미지를 설명하는 짧은 한국어 문장 (15~30자)

★ HTML 스타일 규칙 (네이버 블로그 스타일):
- 전체를 <div style="max-width:760px; margin:0 auto; font-family:'Noto Sans KR',sans-serif; color:#333; line-height:1.8; font-size:16px;">로 감싸세요
- H2: <h2 style="border-left:5px solid #0066FF; padding-left:15px; font-size:22px; color:#222; margin:40px 0 20px 0;">
- H3: <h3 style="font-size:18px; color:#444; margin:30px 0 15px 0; padding-bottom:8px; border-bottom:1px solid #eee;">
- 본문 단락: <p style="margin:0 0 20px 0; line-height:1.8; color:#333; font-size:16px;">
- 강조 박스: <div style="background:#f8f9fa; border-left:4px solid #0066FF; padding:20px 24px; margin:24px 0; border-radius:0 8px 8px 0;"><p style="margin:0; line-height:1.7; color:#555;">내용</p></div>
- 목차: <div style="background:#f0f4ff; padding:24px 30px; border-radius:12px; margin:24px 0 36px 0;"><p style="font-weight:700; font-size:17px; margin:0 0 12px 0; color:#0066FF;">목차</p><ol style="margin:0; padding-left:20px; line-height:2.0; color:#555;">로 감싸세요
- 구분선: <hr style="border:none; height:1px; background:linear-gradient(to right, #ddd, #eee, #ddd); margin:36px 0;">
- 핵심 포인트 박스: <div style="background:#fff8e1; border:1px solid #ffe082; padding:20px 24px; border-radius:8px; margin:24px 0;"><p style="margin:0; font-weight:600; color:#f57f17; margin-bottom:8px;">핵심 포인트</p><p style="margin:0; color:#555; line-height:1.7;">내용</p></div>
- 본문 중간에 이미지가 들어갈 위치를 <!--IMAGE_PLACEHOLDER_1-->, <!--IMAGE_PLACEHOLDER_2-->, <!--IMAGE_PLACEHOLDER_3--> 주석으로 표시하세요
- 이미지 플레이스홀더는 본문 전체에 고르게 분포시키세요 (각 주요 섹션 뒤에 1개씩)
- 글 말미에 요약 또는 마무리 인사를 포함하세요
- 절대로 이모지(emoji)나 유니코드 특수기호를 HTML에 사용하지 마세요 (WordPress가 저품질 SVG 이미지로 변환합니다)
- 목록 구분이 필요하면 숫자(1. 2. 3.)나 하이픈(-)만 사용하세요

중요: 반드시 순수 JSON만 응답하세요. 마크다운 코드블록(\`\`\`)을 사용하지 마세요.
html 필드의 값에서 큰따옴표(")는 반드시 \\"로 이스케이프하세요.

JSON 형식:
{"title":"제목","html":"<div style=\\"max-width:760px;...\\">...</div>","excerpt":"메타 디스크립션","tags":["태그1","태그2"],"category":"카테고리명","imagePrompts":["A detailed scene of... (50+ words)","...","...","..."],"imageCaptions":["한국어 캡션1","캡션2","캡션3","캡션4"]}`;

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

위 트렌드 키워드에 대해 깊이 있는 블로그 글을 작성해주세요. 순수 JSON으로만 응답하세요.`;

    const response = await this.client.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 16384,
      temperature: 0.7,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const text =
      response.content[0].type === 'text' ? response.content[0].text : '';

    logger.debug(`Raw Claude response length: ${text.length} chars`);

    const content = parseJsonResponse(text, keyword.title);

    // Ensure imageCaptions exists
    if (!content.imageCaptions || content.imageCaptions.length === 0) {
      content.imageCaptions = content.imagePrompts.map((_, i) =>
        i === 0 ? content.title : `${content.title} 관련 이미지 ${i}`
      );
    }

    // Ensure at least 4 image prompts
    while (content.imagePrompts.length < 4) {
      logger.warn(`Only ${content.imagePrompts.length} image prompts, padding to 4`);
      content.imagePrompts.push(`Detailed illustration related to ${keyword.title}, vivid colors, editorial style`);
      content.imageCaptions.push(`${content.title} 관련 이미지`);
    }

    if (!content.title || !content.html) {
      throw new ContentGenerationError(`Incomplete content generated for "${keyword.title}"`);
    }

    logger.info(`Content generated: "${content.title}" (${content.html.length} chars)`);
    return content;
  }
}

function parseJsonResponse(text: string, keyword: string): BlogContent {
  // Strip markdown code fences if present
  let cleaned = text.replace(/```(?:json)?\s*/g, '').replace(/```\s*$/g, '').trim();

  // Try direct parse first
  try {
    return JSON.parse(cleaned) as BlogContent;
  } catch {
    // continue to fallback strategies
  }

  // Extract JSON object with brace matching
  const startIdx = cleaned.indexOf('{');
  if (startIdx === -1) {
    throw new ContentGenerationError(`No JSON object found in Claude response for "${keyword}"`);
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
    throw new ContentGenerationError(`Incomplete JSON in Claude response for "${keyword}"`);
  }

  const jsonStr = cleaned.slice(startIdx, endIdx + 1);

  try {
    return JSON.parse(jsonStr) as BlogContent;
  } catch {
    const fixed = jsonStr
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r')
      .replace(/\t/g, '\\t');
    try {
      return JSON.parse(fixed) as BlogContent;
    } catch (e) {
      logger.error(`JSON parse failed. First 500 chars: ${jsonStr.slice(0, 500)}`);
      throw new ContentGenerationError(
        `Failed to parse JSON from Claude response for "${keyword}": ${(e as Error).message}`
      );
    }
  }
}
