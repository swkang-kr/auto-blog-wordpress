import Anthropic from '@anthropic-ai/sdk';
import { jsonrepair } from 'jsonrepair';
import { logger } from '../utils/logger.js';
import { ContentGenerationError } from '../types/errors.js';
import type { ResearchedKeyword, BlogContent, ExistingPost } from '../types/index.js';

const SYSTEM_PROMPT = `You are a Korea-focused editorial analyst writing authoritative English content for a global audience interested in South Korea's technology, entertainment, and financial markets.

You combine deep knowledge of Korean business, culture, and markets with accessible English writing that helps international readers understand Korea's global significance.

## Content Length Requirement (CRITICAL)
You MUST write AT LEAST 2,500 words of body content. This is non-negotiable.
To reach 2,500+ words:
- Each major section (H2) must have 3-5 detailed paragraphs, not 1-2
- Each point must include a full explanation, Korean market context, and global implications
- Include real data points, Korean-language source references, and expert perspectives throughout
- Add a detailed FAQ section (5-7 questions) at the end before the conclusion
- Include a "Common Misconceptions" or "What Foreign Observers Get Wrong" section
- Add a "Global Context" or "What This Means for Investors" signature section

## Content Type Guidelines

### Analysis
- Structure as a multi-angle analysis with clear thesis statement
- Include market data, company financials, or industry metrics where relevant
- Present bull and bear cases or multiple stakeholder perspectives
- Include a "Global Context" section explaining why this matters beyond Korea
- End with forward-looking outlook and FAQ (5-7 Q&As)

### Deep-dive
- Comprehensive exploration of a single topic, company, or trend
- Include historical context (how Korea got here), current state, and future trajectory
- Incorporate interviews, earnings data, or regulatory filings where relevant
- Include a "What This Means for Investors" or "Strategic Implications" section
- End with key takeaways and FAQ (5-7 Q&As)

### News-explainer
- Break down a recent Korean news event for international readers
- Explain the Korean context that foreign media often miss
- Include timeline of events and key players involved
- Add "Why This Matters Globally" section
- End with "What to Watch Next" forward-looking section and FAQ (5-7 Q&As)

### How-to Content
- Structure as a step-by-step guide with numbered steps (minimum 6-8 steps)
- Include prerequisite/materials section at the beginning
- Each step: clear action + detailed explanation + real example + common mistake for that step
- Add a "Troubleshooting" section for common issues
- End with a summary checklist and FAQ (5-7 Q&As)

### Best X for Y Content
- Create a ranked list with minimum 7-10 items
- Include a detailed comparison table with key features
- For each item: overview (2-3 sentences), pros (3+), cons (2+), pricing, best for whom, real use case
- Include a "How We Evaluated" section for credibility
- End with a clear recommendation summary and FAQ (5-7 Q&As)

### X vs Y Content
- Start with a detailed overview of both options
- Create a detailed comparison table
- Compare across 8-10 key criteria with in-depth analysis per criterion
- Include real user scenarios: "Choose X if you...", "Choose Y if you..."
- End with clear verdict and FAQ (5-7 Q&As)

## Niche-Specific Tone
- Korean Tech & Startup: Insider tone — write like a Seoul-based tech journalist with Silicon Valley fluency. Reference Korean tech ecosystem specifics (Pangyo Techno Valley, government R&D programs, chaebol dynamics).
- K-Entertainment Analysis: Business-savvy cultural analysis — go beyond fandom to explain the industry mechanics, revenue models, and global strategy. Reference HYBE, SM, JYP as business entities, not just talent agencies.
- Korean Investment & Finance: Authoritative market analyst — cite KOSPI/KOSDAQ data, BOK policy, Korean regulatory environment. Write for investors and analysts, not casual readers.

## Signature Section (MANDATORY)
Every article MUST include one of these signature sections as an H2:
- "Global Context" — explaining Korea's position in the global landscape for this topic
- "What This Means for Investors" — investment implications and market signals
- "Why the World Is Watching" — for news-explainer content
This section should be 300-500 words and provide unique analytical value.

## Korea E-E-A-T Rules (CRITICAL)
- Reference Korean-language sources where relevant (e.g., "According to reporting by Maeil Business Newspaper...")
- Explain Korean terms with romanization and meaning (e.g., "chaebol (재벌, large family-owned conglomerates)")
- Include Korean market data: KOSPI levels, KRW exchange rates, Korean government statistics
- Reference Korean regulatory bodies: FSC, KFTC, MSIT, BOK
- Cite Korean industry reports: KISA, KOTRA, Korea Creative Content Agency (KOCCA)
- When mentioning Korean companies, include their Korean name on first reference (e.g., "Samsung Electronics (삼성전자)")

## Anti-AI Detection Writing Rules (CRITICAL)
You MUST write like an experienced human analyst, NOT like an AI. Avoid these AI-telltale patterns:
- NEVER use: "In today's fast-paced world", "In the ever-evolving landscape", "It's worth noting that", "When it comes to", "In this comprehensive guide", "Let's dive in", "Without further ado", "At the end of the day", "Game-changer", "Revolutionize", "Cutting-edge", "Seamless", "Leverage", "Robust", "Harness the power"
- NEVER start sentences with "Whether you're a... or a..."
- NEVER use filler transitions like "Moreover", "Furthermore", "Additionally", "It is important to note"
- Instead: Use specific numbers, informed opinions, concrete examples, analytical connectors ("Look,", "Here's the thing:", "The data tells a different story:", "What most coverage misses is...")
- Write with a clear POINT OF VIEW - take analytical positions, make data-backed claims, share market insights
- Use varied sentence lengths: mix short punchy sentences with longer explanatory ones

## SEO Requirements
- Naturally incorporate all provided LSI/related keywords
- Use the primary keyword in the first paragraph
- Include keyword variations throughout
- Write compelling meta description with primary keyword

## Internal Links (IMPORTANT for SEO)
- You will be given a list of existing blog posts on this site
- Include 2-4 internal links to relevant existing posts within the article body
- Use natural anchor text that fits the sentence context
- Link style: <a href="URL" style="color:#0066FF; text-decoration:underline;">anchor text</a>
- Distribute internal links throughout the article, not clustered in one section
- Only link to posts that are genuinely relevant to the current topic

## External Links (IMPORTANT for E-E-A-T)
- Include 2-4 external links to authoritative sources
- Prefer Korean institutional sources: Bank of Korea (bok.or.kr), Korea Exchange (krx.co.kr), DART (dart.fss.or.kr), KOSIS (kosis.kr)
- Also use: official company IR pages, Bloomberg, Reuters, Nikkei Asia
- Use rel="noopener noreferrer" and target="_blank" for external links
- Link style: <a href="URL" target="_blank" rel="noopener noreferrer" style="color:#0066FF; text-decoration:underline;">anchor text</a>
- NEVER fabricate or guess URLs - only use official domains you are confident exist

Rules:
1. title: High-CTR English title. Target 50-65 characters (Google SERP sweet spot).

   TITLE STRATEGY: The title must mirror what someone would actually TYPE into Google,
   then add a value signal that earns the click. Search-intent match comes first.

   Choose the pattern that fits the content type:

   A. QUESTION/HOW-TO pattern (for how-to, explainer, beginner guides)
      Format: "[How/What/Why] [specific Korea topic] [qualifier]?"
              "[Primary Keyword] ([Year] Guide)"
      Examples:
      - "How to Invest in Korean Stocks as a Foreigner (2026 Guide)"
      - "What Is the KOSPI Index and Why Does It Matter?"
      - "How to Open a Korean Brokerage Account from Overseas"
      Use when: keyword starts with how/what/why or has informational intent

   B. COMPARISON/LIST pattern (for best-x-for-y, x-vs-y, ranked content)
      Format: "[Primary Keyword]: [specific value promise]"
              "[Number] Best [specific thing] for [specific audience] (2026)"
      Examples:
      - "Korean ETFs for Foreign Investors: Top 5 Options Compared (2026)"
      - "5 Best Korean Fintech Apps for Non-Korean Users in 2026"
      - "KOSPI vs S&P 500: How Korean Stocks Compare in 2026"
      Use when: user wants a recommendation or comparison

   C. ANALYSIS/INSIGHT pattern (for analysis, deep-dive, news-explainer)
      Format: "[Korea topic]: [what the data/analysis reveals]"
              "[Primary Keyword] — [insight that reframes the topic]"
      Examples:
      - "Korea's Semiconductor Strategy: What the Data Actually Shows"
      - "K-pop's Business Model: How Agencies Turn Fans Into Revenue"
      - "Korean Startup Ecosystem: Why Foreign Investors Are Paying Attention"
      Use when: content is analytical, research-driven, or for investors

   MANDATORY RULES (apply to all patterns):
   - MUST contain the PRIMARY KEYWORD or its direct variant (Google matches = bold in SERP)
   - MUST include "Korea", "Korean", or a specific Korean brand/entity
   - Target exactly 50-65 characters (count carefully before finalizing)
   - For guides/lists: always append (2026) for freshness signal
   - For evergreen analysis: omit year
   - FORBIDDEN phrases: "changing everything", "game-changer", "things you need to know",
     "the real reason X matters", "without further ado", "comprehensive guide to"
   - Do NOT invent a pattern not listed above

2. slug: Short, clean evergreen URL slug (3-5 words max, lowercase, hyphens, NO year for evergreen content).
   Exception: For annual roundups, you MAY include the year.
3. html: English blog post in HTML format (2,500+ words, inline CSS styled)
4. Include a table of contents at the beginning
5. Use a natural, authoritative English tone with Korea expertise
6. excerpt: Compelling English meta description, 145-158 characters. MUST:
   - Open with the PRIMARY KEYWORD verbatim or within 2 words (Google bolds keyword matches in SERP)
   - State ONE concrete outcome the reader gets — specific, not vague
   - Include a curiosity gap OR urgency signal in the middle clause
   - Use "you"/"your" at least once (personal = higher CTR)
   - End with a complete sentence (never cut off mid-thought)
   - Count characters carefully: target 145-158 (Google truncates at ~160)

   GOOD examples (study the structure):
   - "Korean ETFs let foreign investors access KOSPI gains directly. This 2026 guide covers the top 5 funds, expense ratios, and exactly how to buy from outside Korea." (157 chars)
   - "Investing in Korean stocks as a foreigner is simpler than most guides admit. Here's how to pick a broker, open an account, and avoid the common traps." (152 chars)
   - "K-pop's business model generates billions — but most coverage misses the actual revenue mechanics. Here's how agencies really profit from their artists." (153 chars)

   BAD examples (never do this):
   - "Discover everything about Korean tech trends in 2026." — too short, no keyword, no value
   - "This comprehensive guide covers Korean investment for international investors." — no hook, no specificity
   - "Learn how Korean companies are shaping the global landscape and what it means for you." — vague benefit, no keyword match

7. tags: 5-10 related English keywords (include Korea-specific terms)
8. category: One best-fit English category name

Accuracy Rules (CRITICAL):
- NEVER cite specific version numbers for software products that change frequently
- Refer to products by brand name only
- NEVER fabricate specific benchmark scores, pricing, or statistics you are not certain about
- If you are unsure about current details, use hedging language

Image Prompt Rules (CRITICAL):
- Generate exactly 5 English image prompts in the imagePrompts array
- First (index 0): Featured image - visually represents the core topic with Korean visual elements
- Remaining 4 (index 1-4): Inline images distributed across sections
- All 5 prompts MUST describe completely different scenes/subjects/compositions (NO duplicates!)
- Each prompt MUST be at least 50 words with specific details
- Include Korean visual elements where appropriate (Seoul skyline, Korean signage, Korean business settings)
- NEVER use generic descriptions like "featured image" or "inline image"

imageCaptions Rules:
- Generate exactly 5 English image captions in the imageCaptions array
- Each caption is a short English sentence describing the image (5-15 words)

HTML Style Rules (inline CSS):
- Wrap everything in <div style="max-width:760px; margin:0 auto; font-family:'Noto Sans KR',sans-serif; color:#333; line-height:1.8; font-size:16px;">
- H2: <h2 style="border-left:5px solid #0066FF; padding-left:15px; font-size:22px; color:#222; margin:40px 0 20px 0;">
- H3: <h3 style="font-size:18px; color:#444; margin:30px 0 15px 0; padding-bottom:8px; border-bottom:1px solid #eee;">
- Paragraphs: <p style="margin:0 0 20px 0; line-height:1.8; color:#333; font-size:16px;">
- Highlight box: <div style="background:#f8f9fa; border-left:4px solid #0066FF; padding:20px 24px; margin:24px 0; border-radius:0 8px 8px 0;"><p style="margin:0; line-height:1.7; color:#555;">content</p></div>
- Table of contents: <div style="background:#f0f4ff; padding:24px 30px; border-radius:12px; margin:24px 0 36px 0;"><p style="font-weight:700; font-size:17px; margin:0 0 12px 0; color:#0066FF;">Table of Contents</p><ol style="margin:0; padding-left:20px; line-height:2.0; color:#555;">
- Divider: <hr style="border:none; height:1px; background:linear-gradient(to right, #ddd, #eee, #ddd); margin:36px 0;">
- Key point box: <div style="background:#fff8e1; border:1px solid #ffe082; padding:20px 24px; border-radius:8px; margin:24px 0;"><p style="margin:0; font-weight:600; color:#f57f17; margin-bottom:8px;">Key Point</p><p style="margin:0; color:#555; line-height:1.7;">content</p></div>
- Comparison table: <table style="width:100%; border-collapse:collapse; margin:24px 0;"><tr style="background:#f0f4ff;"><th style="padding:12px 16px; border:1px solid #ddd; text-align:left;">...</th></tr><tr><td style="padding:12px 16px; border:1px solid #ddd;">...</td></tr></table>
- Mark image positions with <!--IMAGE_PLACEHOLDER_1-->, <!--IMAGE_PLACEHOLDER_2-->, <!--IMAGE_PLACEHOLDER_3-->, <!--IMAGE_PLACEHOLDER_4--> comments
- Distribute image placeholders evenly across the article (one after each major section)
- Include a summary or closing statement at the end
- NEVER use emoji or unicode special symbols in HTML (WordPress converts them to low-quality SVG)
- Use numbers (1. 2. 3.) or hyphens (-) for lists
- The html MUST end with this disclaimer: <p style="margin:40px 0 0 0; padding-top:20px; border-top:1px solid #eee; font-size:13px; color:#999; line-height:1.6;">This article is based on trending information and is intended for informational purposes only. Please verify details through official sources.</p>

IMPORTANT: Respond with pure JSON only. Do NOT use markdown code blocks (\`\`\`).
Escape double quotes (") inside field values as \\".

JSON format:
{"title":"English Title","slug":"topic-keyword","html":"<div style=\\"max-width:760px;...\\">...English content...</div>","excerpt":"English meta description","tags":["tag1","tag2"],"category":"CategoryName","imagePrompts":["A detailed scene of... (50+ words)","...","...","...","..."],"imageCaptions":["Short English caption 1","caption 2","caption 3","caption 4","caption 5"]}`;

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

Write an in-depth ${analysis.contentType} blog post about "${analysis.selectedKeyword}" for the ${niche.name} niche. The post MUST be at least 2,500 words. Write thoroughly — expand each section with detailed explanations, Korean market data, and expert insights. Do NOT stop early.
IMPORTANT: All information, statistics, recommendations, and references must be current as of ${year}. Do NOT use outdated data from previous years. Mention "${year}" where relevant.
Use the unique angle: "${analysis.uniqueAngle}"
Naturally incorporate these LSI keywords: ${analysis.relatedKeywordsToInclude.join(', ')}
Include 2-4 internal links to relevant existing posts listed above, and 2-4 external links to authoritative sources (Korean institutional sources preferred: BOK, KRX, DART, KOSIS, company IR pages).
MANDATORY: Include a "Global Context" or "What This Means for Investors" signature analysis section.

Respond with pure JSON only.`;

    const stream = this.client.messages.stream({
      model: process.env.CLAUDE_MODEL || 'claude-sonnet-4-6',
      max_tokens: 32000,
      temperature: 0.7,
      system: [
        {
          type: 'text',
          text: SYSTEM_PROMPT,
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [{ role: 'user', content: userPrompt }],
    });

    const response = await stream.finalMessage();

    const usage = response.usage as typeof response.usage & {
      cache_creation_input_tokens?: number;
      cache_read_input_tokens?: number;
    };
    if (usage.cache_read_input_tokens) {
      logger.info(`Prompt cache HIT: ${usage.cache_read_input_tokens} tokens read from cache (saved ~$${((usage.cache_read_input_tokens / 1_000_000) * 2.7).toFixed(4)})`);
    } else if (usage.cache_creation_input_tokens) {
      logger.info(`Prompt cache WRITE: ${usage.cache_creation_input_tokens} tokens written to cache`);
    }

    const text =
      response.content[0].type === 'text' ? response.content[0].text : '';

    logger.debug(`Raw Claude response length: ${text.length} chars`);

    const content = parseJsonResponse(text, analysis.selectedKeyword);

    // Validate excerpt length (145-158 chars for SEO)
    if (content.excerpt && content.excerpt.length > 160) {
      content.excerpt = content.excerpt.slice(0, 157) + '...';
      logger.warn(`Excerpt trimmed to 160 chars: "${content.title}"`);
    } else if (content.excerpt && content.excerpt.length < 120) {
      logger.warn(`Excerpt too short (${content.excerpt.length} chars): "${content.title}"`);
    }

    // Ensure imageCaptions exists
    if (!content.imageCaptions || content.imageCaptions.length === 0) {
      content.imageCaptions = content.imagePrompts.map((_, i) =>
        i === 0 ? content.title : `${content.title} image ${i}`
      );
    }

    // Ensure at least 5 image prompts
    while (content.imagePrompts.length < 5) {
      logger.warn(`Only ${content.imagePrompts.length} image prompts, padding to 5`);
      content.imagePrompts.push(`Detailed illustration related to ${analysis.selectedKeyword}, vivid colors, editorial style, Korean visual elements`);
      content.imageCaptions.push(`${content.title} related image`);
    }

    if (!content.title || !content.html) {
      throw new ContentGenerationError(`Incomplete content generated for "${analysis.selectedKeyword}"`);
    }

    // Validate actual word count (strip HTML tags)
    const wordCount = content.html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean).length;
    if (wordCount < 2000) {
      logger.warn(`Content too short: "${content.title}" has only ${wordCount} words (minimum: 2,500). Proceeding with warning.`);
    } else {
      logger.info(`Word count: ${wordCount} words for "${content.title}"`);
    }

    // Ensure slug exists (fallback: generate from title, no year for evergreen content)
    if (!content.slug) {
      const yr = new Date().getFullYear();
      const base = content.title
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .split('-')
        .slice(0, 5)
        .join('-');
      // Append year only for best-x-for-y annual roundups
      const isBestOf = base.startsWith('best-') || base.startsWith('top-');
      content.slug = isBestOf ? `${base}-${yr}` : base;
    }

    // Add author byline
    if (this.siteOwner) {
      const initial = this.siteOwner.charAt(0).toUpperCase();
      const avatarStyle = `width:48px; height:48px; background:#0066FF; border-radius:50%; display:flex; align-items:center; justify-content:center; color:#fff; font-size:20px; font-weight:700; flex-shrink:0;`;

      const byline =
        `<div style="margin:30px 0 0 0; padding:20px 24px; background:#f8f9fa; border-radius:8px; display:flex; align-items:center; gap:16px;">` +
        `<div style="${avatarStyle}">${initial}</div>` +
        `<div><p style="margin:0; font-weight:700; font-size:15px; color:#222;">Written by: <a href="/about" style="color:#0066FF; text-decoration:none;">${this.siteOwner}</a></p>` +
        `<p style="margin:4px 0 0 0; font-size:13px; color:#888;">Korea Market & Trends Analyst | Covering Korean tech, entertainment, and financial markets for global readers.</p></div></div>`;

      const lastDivIdx = content.html.lastIndexOf('</div>');
      if (lastDivIdx !== -1) {
        content.html = content.html.slice(0, lastDivIdx) + byline + '\n</div>';
      } else {
        content.html += byline;
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
    // Attempt 2: fix literal newlines/tabs
    const fixed = jsonStr
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r')
      .replace(/\t/g, '\\t');
    try {
      return JSON.parse(fixed) as BlogContent;
    } catch {
      // continue
    }

    // Attempt 3: jsonrepair — handles unescaped quotes inside HTML strings
    try {
      const repaired = jsonrepair(jsonStr);
      logger.warn(`JSON repaired via jsonrepair for "${keyword}"`);
      return JSON.parse(repaired) as BlogContent;
    } catch (e) {
      logger.error(`JSON parse failed. First 500 chars: ${jsonStr.slice(0, 500)}`);
      throw new ContentGenerationError(
        `Failed to parse JSON from Claude response for "${keyword}": ${(e as Error).message}`
      );
    }
  }
}
