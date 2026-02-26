import Anthropic from '@anthropic-ai/sdk';
import { logger } from '../utils/logger.js';
import { ContentGenerationError } from '../types/errors.js';
import type { ResearchedKeyword, BlogContent, ExistingPost } from '../types/index.js';

const SYSTEM_PROMPT = `You are an SEO expert blog writer skilled in writing engaging, high-quality English content for a global audience.
Given a researched keyword with niche context, write a comprehensive blog post in ENGLISH.

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

## Anti-AI Detection Writing Rules (CRITICAL)
You MUST write like an experienced human blogger, NOT like an AI. Avoid these AI-telltale patterns:
- NEVER use: "In today's fast-paced world", "In the ever-evolving landscape", "It's worth noting that", "When it comes to", "In this comprehensive guide", "Let's dive in", "Without further ado", "At the end of the day", "Game-changer", "Revolutionize", "Cutting-edge", "Seamless", "Leverage", "Robust", "Harness the power"
- NEVER start sentences with "Whether you're a... or a..."
- NEVER use filler transitions like "Moreover", "Furthermore", "Additionally", "It is important to note"
- AVOID overly balanced "on one hand / on the other hand" structures
- AVOID generic conclusions like "In conclusion, X offers a powerful solution for Y"
- Instead: Use specific numbers, personal opinions, concrete examples, casual connectors ("Look,", "Here's the thing:", "Honestly,", "I tested this for 2 weeks and...")
- Write with a clear POINT OF VIEW - take sides, make bold claims, share specific experiences
- Use varied sentence lengths: mix short punchy sentences with longer explanatory ones
- Include imperfections that real writers have: rhetorical questions, mild humor, occasional informality

## Niche-Specific Tone
- Food & Recipes: Friendly, warm, encouraging ("You'll love how easy this is!")
- Personal Finance: Trustworthy, data-driven, reassuring ("Research shows that...")
- AI Tools & Reviews: Technical yet accessible, up-to-date, objective ("Based on our testing...")

## SEO Requirements
- Naturally incorporate all provided LSI/related keywords
- Use the primary keyword in the first paragraph
- Include keyword variations throughout
- Write compelling meta description with primary keyword

## Internal Links (IMPORTANT for SEO)
- You will be given a list of existing blog posts on this site
- Include 2-4 internal links to relevant existing posts within the article body
- Use natural anchor text that fits the sentence context (e.g., "check out our guide on [AI productivity tools](URL)" or "as we covered in our [GPT comparison article](URL)")
- Link style: <a href="URL" style="color:#0066FF; text-decoration:underline;">anchor text</a>
- Distribute internal links throughout the article, not clustered in one section
- Only link to posts that are genuinely relevant to the current topic
- If no existing posts are relevant, skip internal links

## External Links (IMPORTANT for E-E-A-T)
- Include 2-4 external links to authoritative sources
- Examples: official product websites, research papers, reputable news articles, government/educational sites
- Use rel="noopener noreferrer" and target="_blank" for external links
- Link style: <a href="URL" target="_blank" rel="noopener noreferrer" style="color:#0066FF; text-decoration:underline;">anchor text</a>
- External links must point to REAL, well-known URLs (e.g., anthropic.com, openai.com, nerdwallet.com, allrecipes.com)
- NEVER fabricate or guess URLs - only use official domains you are confident exist

Rules:
1. title: High-CTR clickbait-style English title. MUST follow ALL 4 rules below:
   RULE 1 - NUMBERS: Always include a specific number (3, 5, 7, 9, 10, 12, etc.)
   RULE 2 - EMOTION WORDS: Pick ONE that fits best (do NOT reuse the same word across posts):
     Shocking / Surprising / Unbelievable / Hidden / Secret / Proven / Finally / Powerful / Embarrassing / Scary
   RULE 3 - PATTERN: Choose the best-fit pattern based on niche (each pattern maps to recommended niches):
     A. "[N] [Emotion] [Topic] That [Outcome]"          → "5 Genius Meal Preps That Save Your Week"       (Food, Productivity)
     B. "Stop [Doing X]: [N] [Emotion] [Alternatives]"  → "Stop Wasting: 5 Hidden Money Habits That Work"  (Finance, Self-improvement)
     C. "How I [Achievement] in [N] [Emotion] Steps"    → "How I Saved $500 in 3 Surprising Steps"          (Diet, Lifestyle)
     D. "[N] [Emotion] [Topic] Nobody Talks About"      → "7 Scary AI Mistakes Nobody Talks About"         (AI, Tech)
     E. "[N] Surprising Things About [Topic]"           → "9 Surprising Things About Passive Income"       (Finance, Trends)
     F. "Why [N] Experts Are [Emotion] About [Topic]"   → "Why 5 Experts Are Shocked by This AI Tool"      (AI, Marketing)
     G. "[N] [Emotion] Signs You're [Negative State]"   → "7 Alarming Signs You're Bad With Money"         (Finance, Psychology)
   RULE 4 - CONCISE: Keep under 50 characters (translates to ~25 Korean characters)
2. slug: Short, clean URL slug (3-5 words max, lowercase, hyphens, include year). Example: "claude-ai-best-features-2026" NOT "claude-ai-7-best-features-and-how-to-use-them-in-2026"
3. html: English blog post in HTML format (800-1,000+ words, inline CSS styled)
4. Include a table of contents at the beginning
5. Use a natural, authoritative English tone matching the niche
6. excerpt: English meta description under 160 characters
7. tags: 5-10 related English keywords
8. category: One best-fit English category name

Accuracy Rules (CRITICAL):
- NEVER cite specific version numbers for AI/software products that change frequently (e.g., do NOT write "Claude Opus 3.5", "GPT-4o", "Gemini 2.0 Pro")
- Instead, refer to products by brand name only: "Claude by Anthropic", "ChatGPT by OpenAI", "Gemini by Google"
- You may say "the latest version of Claude" but NEVER invent or guess a version number
- NEVER fabricate specific benchmark scores, pricing, or statistics you are not certain about
- If you are unsure about current details, use hedging language: "typically starts around $20/month", "known for strong performance in..."

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
- The html MUST end with this disclaimer: <p style="margin:40px 0 0 0; padding-top:20px; border-top:1px solid #eee; font-size:13px; color:#999; line-height:1.6;">This article is based on trending information and is intended for informational purposes only. Please verify details through official sources.</p>

IMPORTANT: Respond with pure JSON only. Do NOT use markdown code blocks (\`\`\`).
Escape double quotes (") inside field values as \\".

JSON format:
{"title":"English Title","slug":"topic-keyword-2026","html":"<div style=\\"max-width:760px;...\\">...English content...</div>","excerpt":"English meta description","tags":["tag1","tag2"],"category":"CategoryName","imagePrompts":["A detailed scene of... (50+ words)","...","...","..."],"imageCaptions":["Short English caption 1","caption 2","caption 3","caption 4"]}`;

export class ContentGeneratorService {
  private client: Anthropic;
  private siteOwner: string;

  constructor(apiKey: string, siteOwner?: string) {
    this.client = new Anthropic({ apiKey });
    this.siteOwner = siteOwner || '';
  }

  async generateContent(researched: ResearchedKeyword, existingPosts?: ExistingPost[]): Promise<BlogContent> {
    const { niche, analysis } = researched;
    logger.info(`Generating content for: "${analysis.selectedKeyword}" [${niche.name} / ${analysis.contentType}]`);

    const today = new Date().toISOString().split('T')[0];
    const year = new Date().getFullYear();

    // Build internal links section
    let internalLinksSection = '';
    if (existingPosts && existingPosts.length > 0) {
      const postList = existingPosts
        .map((p) => `- "${p.title}" [${p.category}]: ${p.url}`)
        .join('\n');
      internalLinksSection = `\n\nExisting Blog Posts (use for internal links - pick 2-4 relevant ones):\n${postList}`;
    }

    const userPrompt = `Today's Date: ${today}
Niche: "${niche.name}" (${niche.category})
Content Type: ${analysis.contentType}
Primary Keyword: "${analysis.selectedKeyword}"
Suggested Title: "${analysis.suggestedTitle}"
Unique Angle: ${analysis.uniqueAngle}
Search Intent: ${analysis.searchIntent}
Related Keywords to Include: ${analysis.relatedKeywordsToInclude.join(', ')}${internalLinksSection}

Write an in-depth ${analysis.contentType} blog post about "${analysis.selectedKeyword}" for the ${niche.name} niche.
IMPORTANT: All information, statistics, recommendations, and references must be current as of ${year}. Do NOT use outdated data from previous years. Mention "${year}" where relevant (e.g., "Best AI Tools in ${year}", "As of ${year}").
Use the unique angle: "${analysis.uniqueAngle}"
Naturally incorporate these LSI keywords: ${analysis.relatedKeywordsToInclude.join(', ')}
Include 2-4 internal links to relevant existing posts listed above, and 2-4 external links to authoritative sources (official sites, research, reputable articles).

Respond with pure JSON only.`;

    const stream = this.client.messages.stream({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 16000,
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

    // Set EN defaults for KR fields (will be populated by translation service)
    content.htmlKr = content.htmlKr || content.html;
    content.titleKr = content.titleKr || content.title;
    content.tagsKr = content.tagsKr || content.tags;
    content.excerptKr = content.excerptKr || content.excerpt;

    if (!content.title || !content.html) {
      throw new ContentGenerationError(`Incomplete content generated for "${analysis.selectedKeyword}"`);
    }

    // Ensure slug exists (fallback: generate from title)
    if (!content.slug) {
      const yr = new Date().getFullYear();
      content.slug = content.title
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .split('-')
        .slice(0, 5)
        .join('-') + `-${yr}`;
    }

    // Add author byline if SITE_OWNER is set
    if (this.siteOwner) {
      const initial = this.siteOwner.charAt(0).toUpperCase();
      const avatarStyle = `width:48px; height:48px; background:#0066FF; border-radius:50%; display:flex; align-items:center; justify-content:center; color:#fff; font-size:20px; font-weight:700; flex-shrink:0;`;

      const bylineEn =
        `<div style="margin:30px 0 0 0; padding:20px 24px; background:#f8f9fa; border-radius:8px; display:flex; align-items:center; gap:16px;">` +
        `<div style="${avatarStyle}">${initial}</div>` +
        `<div><p style="margin:0; font-weight:700; font-size:15px; color:#222;">Written by: ${this.siteOwner}</p>` +
        `<p style="margin:4px 0 0 0; font-size:13px; color:#888;">Trend Analysis Expert</p></div></div>`;

      const lastDivIdx = content.html.lastIndexOf('</div>');
      if (lastDivIdx !== -1) {
        content.html = content.html.slice(0, lastDivIdx) + bylineEn + '\n</div>';
      } else {
        content.html += bylineEn;
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
