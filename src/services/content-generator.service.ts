import Anthropic from '@anthropic-ai/sdk';
import { logger } from '../utils/logger.js';
import { ContentGenerationError } from '../types/errors.js';
import type { ResearchedKeyword, BlogContent } from '../types/index.js';

const SYSTEM_PROMPT = `You are an SEO expert blog writer skilled in writing engaging, high-quality English content for a global audience.
Given a researched keyword with niche context, write a comprehensive blog post in ENGLISH, and also provide a Korean translation.

## Content Type Guidelines

### How-to Content
- Structure as a step-by-step guide with numbered steps
- Include prerequisite/materials section at the beginning
- Each step should have a clear action and explanation
- Add pro tips and common mistakes to avoid
- End with a summary checklist

### Best X for Y Content
- Create a ranked list with clear #1, #2, #3 etc.
- Include a comparison table with key features
- For each item: brief overview, pros, cons, best for whom
- Include a "How We Evaluated" section for credibility
- End with a clear recommendation summary

### X vs Y Content
- Start with a brief overview of both options
- Create a detailed comparison table
- Compare across 5-7 key criteria
- Provide a clear verdict/winner for each use case
- End with "Which Should You Choose?" recommendation

## Niche-Specific Tone
- Food & Recipes: Friendly, warm, encouraging ("You'll love how easy this is!")
- Personal Finance: Trustworthy, data-driven, reassuring ("Research shows that...")
- AI Tools & Reviews: Technical yet accessible, up-to-date, objective ("Based on our testing...")

## SEO Requirements
- Naturally incorporate all provided LSI/related keywords
- Use the primary keyword in the first paragraph
- Include keyword variations throughout
- Write compelling meta description with primary keyword

Rules:
1. title: Catchy, search-optimized English title (under 60 characters)
2. titleKr: Korean translation of the title
3. html: English blog post in HTML format (800-1,000+ words, inline CSS styled)
4. htmlKr: Korean translation of the SAME content (identical HTML structure, identical IMAGE_PLACEHOLDER positions)
5. Include a table of contents at the beginning
6. Use a natural, authoritative English tone matching the niche
7. excerpt: English meta description under 160 characters
8. tags: 5-10 related English keywords
9. tagsKr: Korean translations of the same tags (same count, same order)
10. category: One best-fit English category name

E-E-A-T (Experience, Expertise, Authoritativeness, Trustworthiness) Rules:
- Cite relevant statistics and data where available
- Include expert analysis ("According to experts...", "Research suggests...")
- Provide at least 3 actionable tips readers can immediately apply
- Cover background, current situation, and future outlook systematically
- Offer deep analysis and insights, not just surface-level lists

Image Prompt Rules (CRITICAL):
- Generate exactly 4 English image prompts in the imagePrompts array
- First (index 0): Featured image - visually represents the core topic
- Remaining 3 (index 1-3): Inline images for each section
- All 4 prompts MUST describe completely different scenes/subjects/compositions (NO duplicates!)
- Each prompt MUST be at least 50 words with specific details
- Describe scene, composition, colors, mood, subjects, and background in detail
- Describe scenes directly related to the blog content
- NEVER use generic descriptions like "featured image" or "inline image"
- NEVER repeat similar prompts

imageCaptions Rules:
- Generate exactly 4 English image captions in the imageCaptions array
- Each caption is a short English sentence describing the image (5-15 words)

HTML Style Rules (Naver Blog Style with inline CSS):
- Wrap everything in <div style="max-width:760px; margin:0 auto; font-family:'Noto Sans KR',sans-serif; color:#333; line-height:1.8; font-size:16px;">
- H2: <h2 style="border-left:5px solid #0066FF; padding-left:15px; font-size:22px; color:#222; margin:40px 0 20px 0;">
- H3: <h3 style="font-size:18px; color:#444; margin:30px 0 15px 0; padding-bottom:8px; border-bottom:1px solid #eee;">
- Paragraphs: <p style="margin:0 0 20px 0; line-height:1.8; color:#333; font-size:16px;">
- Highlight box: <div style="background:#f8f9fa; border-left:4px solid #0066FF; padding:20px 24px; margin:24px 0; border-radius:0 8px 8px 0;"><p style="margin:0; line-height:1.7; color:#555;">content</p></div>
- Table of contents: <div style="background:#f0f4ff; padding:24px 30px; border-radius:12px; margin:24px 0 36px 0;"><p style="font-weight:700; font-size:17px; margin:0 0 12px 0; color:#0066FF;">Table of Contents</p><ol style="margin:0; padding-left:20px; line-height:2.0; color:#555;">
- Divider: <hr style="border:none; height:1px; background:linear-gradient(to right, #ddd, #eee, #ddd); margin:36px 0;">
- Key point box: <div style="background:#fff8e1; border:1px solid #ffe082; padding:20px 24px; border-radius:8px; margin:24px 0;"><p style="margin:0; font-weight:600; color:#f57f17; margin-bottom:8px;">Key Point</p><p style="margin:0; color:#555; line-height:1.7;">content</p></div>
- Comparison table: <table style="width:100%; border-collapse:collapse; margin:24px 0;"><tr style="background:#f0f4ff;"><th style="padding:12px 16px; border:1px solid #ddd; text-align:left;">...</th></tr><tr><td style="padding:12px 16px; border:1px solid #ddd;">...</td></tr></table>
- Mark image positions with <!--IMAGE_PLACEHOLDER_1-->, <!--IMAGE_PLACEHOLDER_2-->, <!--IMAGE_PLACEHOLDER_3--> comments
- Distribute image placeholders evenly across the article (one after each major section)
- Include a summary or closing statement at the end
- NEVER use emoji or unicode special symbols in HTML (WordPress converts them to low-quality SVG)
- Use numbers (1. 2. 3.) or hyphens (-) for lists
- The English html MUST end with this disclaimer: <p style="margin:40px 0 0 0; padding-top:20px; border-top:1px solid #eee; font-size:13px; color:#999; line-height:1.6;">This article is based on trending information and is intended for informational purposes only. Please verify details through official sources.</p>
- The Korean htmlKr MUST end with this disclaimer: <p style="margin:40px 0 0 0; padding-top:20px; border-top:1px solid #eee; font-size:13px; color:#999; line-height:1.6;">이 글은 트렌드 정보를 기반으로 작성되었으며, 정보 제공 목적으로만 활용됩니다. 정확한 내용은 공식 출처를 통해 확인해 주세요.</p>

htmlKr Translation Rules:
- htmlKr must be a COMPLETE Korean translation of the html field
- Keep the EXACT same HTML structure, tags, inline styles, and IMAGE_PLACEHOLDER positions
- Only translate the text content from English to Korean
- Use natural, professional Korean tone
- Table of contents title should be "목차" in Korean version

IMPORTANT: Respond with pure JSON only. Do NOT use markdown code blocks (\`\`\`).
Escape double quotes (") inside field values as \\".

JSON format:
{"title":"English Title","titleKr":"한국어 제목","html":"<div style=\\"max-width:760px;...\\">...English content...</div>","htmlKr":"<div style=\\"max-width:760px;...\\">...Korean translation...</div>","excerpt":"English meta description","tags":["tag1","tag2"],"tagsKr":["태그1","태그2"],"category":"CategoryName","imagePrompts":["A detailed scene of... (50+ words)","...","...","..."],"imageCaptions":["Short English caption 1","caption 2","caption 3","caption 4"]}`;

export class ContentGeneratorService {
  private client: Anthropic;
  private siteOwner: string;

  constructor(apiKey: string, siteOwner?: string) {
    this.client = new Anthropic({ apiKey });
    this.siteOwner = siteOwner || '';
  }

  async generateContent(researched: ResearchedKeyword): Promise<BlogContent> {
    const { niche, analysis } = researched;
    logger.info(`Generating content for: "${analysis.selectedKeyword}" [${niche.name} / ${analysis.contentType}]`);

    const userPrompt = `Niche: "${niche.name}" (${niche.category})
Content Type: ${analysis.contentType}
Primary Keyword: "${analysis.selectedKeyword}"
Suggested Title: "${analysis.suggestedTitle}"
Unique Angle: ${analysis.uniqueAngle}
Search Intent: ${analysis.searchIntent}
Related Keywords to Include: ${analysis.relatedKeywordsToInclude.join(', ')}

Write an in-depth ${analysis.contentType} blog post about "${analysis.selectedKeyword}" for the ${niche.name} niche.
Use the unique angle: "${analysis.uniqueAngle}"
Naturally incorporate these LSI keywords: ${analysis.relatedKeywordsToInclude.join(', ')}

Provide both English (html) and Korean translation (htmlKr). Respond with pure JSON only.`;

    const stream = this.client.messages.stream({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 32000,
      temperature: 0.7,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const response = await stream.finalMessage();

    const text =
      response.content[0].type === 'text' ? response.content[0].text : '';

    logger.debug(`Raw Claude response length: ${text.length} chars`);

    const content = parseJsonResponse(text, analysis.selectedKeyword);

    // Ensure imageCaptions exists
    if (!content.imageCaptions || content.imageCaptions.length === 0) {
      content.imageCaptions = content.imagePrompts.map((_, i) =>
        i === 0 ? content.title : `${content.title} image ${i}`
      );
    }

    // Ensure at least 4 image prompts
    while (content.imagePrompts.length < 4) {
      logger.warn(`Only ${content.imagePrompts.length} image prompts, padding to 4`);
      content.imagePrompts.push(`Detailed illustration related to ${analysis.selectedKeyword}, vivid colors, editorial style`);
      content.imageCaptions.push(`${content.title} related image`);
    }

    // Ensure Korean fields exist (fallback if missing)
    if (!content.htmlKr) {
      logger.warn('htmlKr missing from Claude response, using html as fallback');
      content.htmlKr = content.html;
    }
    if (!content.titleKr) {
      logger.warn('titleKr missing from Claude response, using title as fallback');
      content.titleKr = content.title;
    }
    if (!content.tagsKr || content.tagsKr.length === 0) {
      logger.warn('tagsKr missing from Claude response, using tags as fallback');
      content.tagsKr = content.tags;
    }

    if (!content.title || !content.html) {
      throw new ContentGenerationError(`Incomplete content generated for "${analysis.selectedKeyword}"`);
    }

    // Add author byline if SITE_OWNER is set (dual language)
    if (this.siteOwner) {
      const initial = this.siteOwner.charAt(0).toUpperCase();
      const avatarStyle = `width:48px; height:48px; background:#0066FF; border-radius:50%; display:flex; align-items:center; justify-content:center; color:#fff; font-size:20px; font-weight:700; flex-shrink:0;`;

      // English byline
      const bylineEn =
        `<div style="margin:30px 0 0 0; padding:20px 24px; background:#f8f9fa; border-radius:8px; display:flex; align-items:center; gap:16px;">` +
        `<div style="${avatarStyle}">${initial}</div>` +
        `<div><p style="margin:0; font-weight:700; font-size:15px; color:#222;">Written by: ${this.siteOwner}</p>` +
        `<p style="margin:4px 0 0 0; font-size:13px; color:#888;">Trend Analysis Expert</p></div></div>`;

      // Korean byline
      const bylineKr =
        `<div style="margin:30px 0 0 0; padding:20px 24px; background:#f8f9fa; border-radius:8px; display:flex; align-items:center; gap:16px;">` +
        `<div style="${avatarStyle}">${initial}</div>` +
        `<div><p style="margin:0; font-weight:700; font-size:15px; color:#222;">작성자: ${this.siteOwner}</p>` +
        `<p style="margin:4px 0 0 0; font-size:13px; color:#888;">트렌드 분석 전문가</p></div></div>`;

      // Insert English byline before the closing </div> of the main wrapper
      const lastDivIdxEn = content.html.lastIndexOf('</div>');
      if (lastDivIdxEn !== -1) {
        content.html = content.html.slice(0, lastDivIdxEn) + bylineEn + '\n</div>';
      } else {
        content.html += bylineEn;
      }

      // Insert Korean byline before the closing </div> of the main wrapper
      const lastDivIdxKr = content.htmlKr.lastIndexOf('</div>');
      if (lastDivIdxKr !== -1) {
        content.htmlKr = content.htmlKr.slice(0, lastDivIdxKr) + bylineKr + '\n</div>';
      } else {
        content.htmlKr += bylineKr;
      }
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
