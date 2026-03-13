import Anthropic from '@anthropic-ai/sdk';
import { jsonrepair } from 'jsonrepair';
import { logger } from '../utils/logger.js';
import { ContentGenerationError } from '../types/errors.js';
import { validateContent, autoFixContent, logContentScore } from '../utils/content-validator.js';
import { costTracker } from '../utils/cost-tracker.js';
import { circuitBreakers } from '../utils/retry.js';
import type { ResearchedKeyword, BlogContent, ExistingPost, AuthorProfile } from '../types/index.js';
import { NICHE_AUTHOR_PERSONAS, CONTENT_TYPE_PERSONA_MAP } from '../types/index.js';

/** Layout variant for content structure diversification (anti-AI detection) */
type LayoutVariant = 'standard' | 'narrative' | 'compact' | 'journal' | 'opinion' | 'interview';

/**
 * Niche × content-type specific signature section names.
 * Diversifies the mandatory signature section to avoid detectable AI patterns
 * (previously all niches used same 3 names).
 */
const NICHE_SIGNATURE_SECTIONS: Record<string, Record<string, string[]>> = {
  'Korean Tech': {
    default: ['Technical Deep Dive', 'Innovation Spotlight', 'Global Tech Context', 'Seoul to Silicon Valley'],
    'how-to': ['Pro Tips', 'Technical Deep Dive'],
    'listicle': ["Editor's Picks", 'Innovation Spotlight'],
    'x-vs-y': ['Head-to-Head Verdict', 'Technical Deep Dive'],
  },
  'K-Beauty': {
    default: ['Expert Skincare Insight', 'Product Science', 'Global Beauty Context', 'Behind the Formula'],
    'how-to': ['Pro Tips', 'Expert Skincare Insight'],
    'listicle': ["Editor's Picks", 'Product Science'],
    'x-vs-y': ['Head-to-Head Verdict', 'Product Science'],
  },
  'Korea Travel': {
    default: ['Insider Tips', "Local's Perspective", 'Global Travel Context', 'Off the Beaten Path'],
    'how-to': ['Pro Tips', 'Insider Tips'],
    'listicle': ["Editor's Picks", "Local's Perspective"],
    'x-vs-y': ['Head-to-Head Verdict', 'Insider Tips'],
  },
  'K-Entertainment': {
    default: ['Industry Analysis', "Fan's Take", 'Global Entertainment Context', 'Behind the Scenes'],
    'how-to': ['Pro Tips', 'Industry Analysis'],
    'listicle': ["Editor's Picks", "Fan's Take"],
    'x-vs-y': ['Head-to-Head Verdict', 'Industry Analysis'],
  },
  'Korean Finance': {
    default: ['Investment Outlook', 'Market Context', 'What This Means for Investors', 'Global Market Perspective'],
    'how-to': ['Pro Tips', 'Investment Outlook'],
    'listicle': ["Editor's Picks", 'Market Context'],
    'x-vs-y': ['Head-to-Head Verdict', 'Investment Outlook'],
  },
};

/** All possible signature section names (exported for validator sync) */
export const ALL_SIGNATURE_SECTION_NAMES = [
  ...new Set(
    Object.values(NICHE_SIGNATURE_SECTIONS).flatMap(contentTypes =>
      Object.values(contentTypes).flat(),
    ),
  ),
  // Legacy names for backward compatibility
  'Global Context', 'What This Means for Investors', 'Why the World Is Watching',
];

/**
 * Deterministic signature section name selection based on category, contentType, and keyword.
 * Uses hash for consistency (same inputs → same output) while varying across posts.
 */
function getSignatureSection(category: string, contentType: string, keyword: string): string {
  const nicheMap = NICHE_SIGNATURE_SECTIONS[category];
  const options = nicheMap
    ? (nicheMap[contentType] || nicheMap.default)
    : ['Global Context', 'What This Means for Investors', 'Why the World Is Watching'];

  let hash = 0;
  const key = `${category}:${contentType}:${keyword}`;
  for (let i = 0; i < key.length; i++) {
    hash = ((hash << 5) - hash + key.charCodeAt(i)) | 0;
  }
  return options[Math.abs(hash) % options.length];
}

const LAYOUT_VARIANTS: LayoutVariant[] = ['standard', 'narrative', 'compact', 'journal', 'opinion', 'interview'];

/**
 * Rotating variant assignment based on niche ID + date.
 * Changes variant weekly per niche to avoid structural monotony (AI detection signal).
 * Still deterministic within the same week for prompt cache HITs.
 */
function getVariantForNiche(nicheId: string): LayoutVariant {
  let hash = 0;
  for (let i = 0; i < nicheId.length; i++) {
    hash = ((hash << 5) - hash + nicheId.charCodeAt(i)) | 0;
  }
  // Add week-of-year rotation so same niche gets different layouts each week
  const weekOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 1).getTime()) / (7 * 24 * 60 * 60 * 1000));
  return LAYOUT_VARIANTS[Math.abs(hash + weekOfYear) % LAYOUT_VARIANTS.length];
}

/** Variant-specific structural directives */
function getVariantDirectives(variant: LayoutVariant): string {
  switch (variant) {
    case 'narrative':
      return `
## Layout: Narrative Flow
- Place Key Takeaways box AFTER the first H2 section (not before it)
- Table of Contents: place at the END of the article, before the author bio
- Open with an extended narrative hook (3-4 paragraphs before the first H2)
- FAQ: integrate questions as H3 subheadings throughout the article body (no separate FAQ section)
- Author bio: place immediately after the Key Takeaways box`;
    case 'compact':
      return `
## Layout: Compact Briefing
- Place Key Takeaways box at the very TOP, before the Table of Contents
- Table of Contents: standard position (after article header)
- Keep paragraphs to 2-3 sentences max (tighter than default)
- FAQ: use a collapsible <details> element at the end with all Q&As
- Author bio: place at the very end, after the disclaimer`;
    case 'journal':
      return `
## Layout: Journal Analysis
- Place Key Takeaways as a sidebar-style box (use float:right; width:40%; on desktop)
- Table of Contents: place after the first H2 section
- Open with an "Executive Summary" H2 section (150-200 words) before the main analysis
- FAQ: present as a numbered "Reader Questions" section with editorial-style answers
- Author bio: place right after the executive summary`;
    case 'opinion':
      return `
## Layout: Opinion Editorial
- Open with a bold thesis statement (1 sentence, controversial or thought-provoking)
- NO Table of Contents (opinion pieces flow naturally without navigation)
- Key Takeaways: convert to "My Bottom Line" box with 3 strong analytical positions
- Use first-person perspective throughout ("I believe", "In my analysis", "What I've observed")
- Include a "Devil's Advocate" H2 section that honestly addresses the strongest counterargument
- FAQ: replace with "Questions I Get About This" section with conversational answers
- Author bio: place right after the thesis statement (establishes credibility early)
- Tone: assertive, data-backed opinions — NOT wishy-washy "on the other hand" hedging`;
    case 'interview':
      return `
## Layout: Expert Q&A Style
- Structure the entire article as a curated Q&A format with an unnamed expert voice
- Open with a brief context paragraph (who is this expert, why does their perspective matter)
- Each H2 is a bold question; the content under it is the "expert" answer
- Key Takeaways: present as "Quick Summary" right after the opening context
- Table of Contents: list the questions as clickable links
- Use blockquotes for particularly insightful "quotes" within answers
- FAQ: naturally integrated as additional Q&A at the end
- Author bio: place at the end with a note about editorial methodology`;
    default: // 'standard'
      return `
## Layout: Standard
- Table of Contents: after article header (default position)
- Key Takeaways: after TOC, before first H2 (default position)
- FAQ: standard section at the end with H3 question headings
- Author bio: before the disclaimer (default position)`;
  }
}

/** Word count targets per content type — optimised for information density over padding (HCU-compliant) */
const WORD_COUNT_TARGETS: Record<string, { min: number; target: number; continuation: number; rejection: number }> = {
  'how-to':          { min: 1600, target: 2200, continuation: 1400, rejection: 1200 },
  'best-x-for-y':   { min: 1500, target: 2200, continuation: 1300, rejection: 1100 },
  'x-vs-y':         { min: 1500, target: 2200, continuation: 1300, rejection: 1100 },
  'analysis':        { min: 1800, target: 2500, continuation: 1600, rejection: 1400 },
  'deep-dive':       { min: 3000, target: 3500, continuation: 2500, rejection: 2200 },
  'news-explainer':  { min: 1500, target: 1800, continuation: 1200, rejection: 1000 },
  'listicle':        { min: 1400, target: 2000, continuation: 1200, rejection: 1000 },
  'case-study':      { min: 1800, target: 2500, continuation: 1600, rejection: 1400 },
  'product-review':  { min: 1600, target: 2200, continuation: 1400, rejection: 1200 },
};

/**
 * Search intent-based word count adjustments.
 * Different search intents warrant different content depths:
 * - Informational: readers want comprehensive answers → full length
 * - Commercial: readers are comparing/evaluating → moderate detail
 * - Transactional: readers want to act → concise, action-focused
 * - Navigational: readers want a specific page → shortest
 */
const INTENT_MULTIPLIERS: Record<string, number> = {
  'informational': 1.0,   // Full length (default)
  'commercial': 0.9,      // Slightly shorter, more comparison-focused
  'commercial-investigation': 0.95, // Near-full length, detailed comparison/evaluation
  'transactional': 0.75,  // Shorter, action-focused (how-to-buy, sign-up guides)
  'navigational': 0.6,    // Shortest (direct answer + context)
};

function getWordCountTargets(contentType: string, searchIntent?: string) {
  const base = WORD_COUNT_TARGETS[contentType] || WORD_COUNT_TARGETS['analysis'];
  const multiplier = INTENT_MULTIPLIERS[searchIntent || 'informational'] || 1.0;

  if (multiplier === 1.0) return base;

  return {
    min: Math.round(base.min * multiplier),
    target: Math.round(base.target * multiplier),
    continuation: Math.round(base.continuation * multiplier),
    rejection: Math.round(base.rejection * multiplier),
  };
}

/** Common English stop words to remove from slugs for cleaner URLs */
const SLUG_STOP_WORDS = new Set([
  'a', 'an', 'the', 'in', 'on', 'at', 'to', 'for', 'of', 'and', 'or', 'is', 'are',
  'was', 'were', 'be', 'been', 'with', 'from', 'by', 'as', 'it', 'its', 'this', 'that',
  'how', 'what', 'why', 'when', 'where', 'which', 'who', 'your', 'you', 'our', 'my',
  'can', 'do', 'does', 'will', 'should', 'could', 'would', 'has', 'have', 'had',
  'not', 'but', 'if', 'about', 'into', 'through', 'just', 'also', 'than', 'very',
]);

/** Optimize slug: remove stop words, limit to 6 meaningful words */
function optimizeSlug(slug: string): string {
  const words = slug
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .split('-')
    .filter(w => w.length > 0 && !SLUG_STOP_WORDS.has(w));

  return words.slice(0, 6).join('-');
}

function buildSystemPrompt(variant: LayoutVariant): string {
  const variantDirectives = getVariantDirectives(variant);
  return `You are a Korea-focused editorial analyst writing authoritative English content for a global audience interested in South Korea's technology, entertainment, and financial markets.

You combine deep knowledge of Korean business, culture, and markets with accessible English writing that helps international readers understand Korea's global significance.
${variantDirectives}

## Anti-AI Detection Writing Rules (HIGHEST PRIORITY)
You MUST write like an experienced human analyst, NOT like an AI:
- NEVER use: "In today's fast-paced world", "In the ever-evolving landscape", "It's worth noting that", "When it comes to", "In this comprehensive guide", "Let's dive in", "Without further ado", "At the end of the day", "Game-changer", "Revolutionize", "Cutting-edge", "Seamless", "Leverage", "Robust", "Harness the power", "Navigate the landscape", "Plays a crucial role", "A testament to", "Delve into", "Paradigm shift"
- NEVER start sentences with "Whether you're a... or a..."
- NEVER use filler transitions like "Moreover", "Furthermore", "Additionally", "It is important to note", "Needless to say", "It is no secret"
- NEVER use the same sentence-opening pattern more than twice in the entire article
- Instead: Use specific numbers, informed opinions, concrete examples, analytical connectors ("Look,", "Here's the thing:", "The data tells a different story:", "What most coverage misses is...")
- Write with a clear POINT OF VIEW - take analytical positions, make data-backed claims
- Use varied sentence lengths: mix short punchy sentences (5-8 words) with longer explanatory ones (20-30 words)
- VARY paragraph structure: alternate between 1-sentence impact paragraphs, 2-sentence context paragraphs, and 3-4 sentence analytical paragraphs
- Include at least 2 incomplete sentences or fragments for natural rhythm ("Not great. Not terrible either." / "The result? A 40% revenue jump.")
- Use parenthetical asides sparingly but naturally (these signal human writing patterns)
- Include at least one personal analytical judgment that starts with "Frankly," or "The uncomfortable truth is" or "What nobody is talking about:"

## Readability Rules (CRITICAL)
- Aim for a Gunning Fog Index of 10-12: prefer short sentences (15-20 words avg), limit complex words (3+ syllables) to technical terms only. This targets a college-educated general audience without oversimplifying.
- EVERY paragraph must be 3-4 sentences MAX. Break long paragraphs ruthlessly.
- First paragraph MUST open with a compelling hook. Choose from these patterns:
  * Surprising statistic: "Korea's AI market grew 47% in..."
  * Provocative question: "Why are global investors suddenly..."
  * Bold claim: "Samsung just redefined what..."
  * Anecdote/Scene-setting: "When Samsung's CEO walked into..."
  * Contrast/Paradox: "Korea has the world's fastest internet, yet..."
  * Direct address: "If you've been watching KOSPI this quarter..."
  NEVER open with a generic topic introduction.
- Use subheadings (H3) every 200-300 words to break up content
- Mix paragraph lengths: alternate between 2-sentence punchy paragraphs and 3-4 sentence detailed ones
- Use blockquotes for expert quotes or key data citations: <blockquote>quote text</blockquote>

## Content Length Requirement (CRITICAL)
You MUST write AT LEAST WORD_COUNT_TARGET words of body content. This is non-negotiable.
PRIORITIZE information density over word count — every sentence must add unique value.
To reach WORD_COUNT_TARGET+ words WITHOUT padding:
- Each major section (H2) must have 2-4 focused paragraphs with concrete data or insights
- NEVER pad content with generic statements, repetitive explanations, or filler transitions
- Include real data points, Korean-language source references, and expert perspectives
- Add a FAQ section (3-5 questions, ONLY questions readers would actually ask — NO filler Q&As)
- Add a niche-appropriate signature section (e.g., "Technical Deep Dive", "Investment Outlook", "Insider Tips", "Industry Analysis", "Expert Skincare Insight")
- If you run out of genuinely useful things to say, STOP — quality beats quantity

## Content Type Guidelines

### Analysis
- Structure as a multi-angle analysis with clear thesis statement
- Include market data, company financials, or industry metrics where relevant
- Present bull and bear cases or multiple stakeholder perspectives
- Include a signature analysis section explaining why this matters beyond Korea
- End with forward-looking outlook and FAQ (3-7 Q&As)

### Deep-dive
- Comprehensive exploration of a single topic, company, or trend
- Include historical context (how Korea got here), current state, and future trajectory
- Incorporate interviews, earnings data, or regulatory filings where relevant
- Include a signature analysis section (e.g., "Investment Outlook", "Strategic Implications")
- End with key takeaways and FAQ (3-7 Q&As)

### News-explainer
- Break down a recent Korean news event for international readers
- Explain the Korean context that foreign media often miss
- Include timeline of events and key players involved
- Add "Why This Matters Globally" section
- End with "What to Watch Next" forward-looking section and FAQ (3-7 Q&As)

### How-to Content
- Structure as a step-by-step guide with numbered steps (minimum 6-8 steps)
- Include prerequisite/materials section at the beginning
- Each step: clear action + detailed explanation + real example + common mistake for that step
- Add a "Troubleshooting" section for common issues
- End with a summary checklist and FAQ (3-5 Q&As)
- Do NOT include a "Common Misconceptions" section (not natural for how-to guides)

### Best X for Y Content
- Create a ranked list with minimum 7-10 items
- Include a detailed comparison table with key features
- For each item: overview (2-3 sentences), pros (3+), cons (2+), pricing, best for whom, real use case
- Include a "How We Evaluated" section for credibility
- End with a clear recommendation summary and FAQ (3-5 Q&As)
- Do NOT include a "Common Misconceptions" section (not natural for lists)

### X vs Y Content
- Start with a detailed overview of both options
- Create a detailed comparison table
- Compare across 8-10 key criteria with in-depth analysis per criterion
- Include real user scenarios: "Choose X if you...", "Choose Y if you..."
- End with clear verdict and FAQ (3-5 Q&As)

### Listicle
- Quick-read format: 10-20 items with 2-3 sentences per item
- Opening paragraph states the list criteria and why it matters
- Each item: bold name, 2-3 sentence description, one key takeaway
- Include a summary table at top (featured snippet target)
- Lighter tone than analysis — focus on discoverability and shareability
- End with "Honorable Mentions" section and FAQ (3-5 Q&As)

### Case Study
- Focus on ONE Korean company, product, or event as the subject
- Structure: Background → Challenge → Strategy → Results → Lessons
- Include specific data: revenue figures, growth percentages, timelines
- Add expert quotes or industry analysis to support claims
- Include a "Key Takeaways for [Audience]" section with actionable insights
- Include a comparison with global equivalent (e.g., "Unlike Uber's approach...")
- End with "What Others Can Learn" section and FAQ (3-5 Q&As)

## Niche-Specific Tone
- Korean Tech: Insider tone — write like a Seoul-based tech journalist with Silicon Valley fluency. Reference Korean tech ecosystem specifics (Pangyo Techno Valley, government R&D programs, chaebol dynamics, Samsung/SK Hynix strategy).
- Korean Finance: Authoritative market analyst — cite KOSPI/KOSDAQ data, BOK policy, Korean regulatory environment. Write for investors and analysts, not casual readers. Include Korean won context and institutional data.
- K-Beauty: Expert skincare advisor — combine product knowledge with dermatological science. Reference Korean beauty innovations, ingredient analysis, and brand comparisons. Include Korean product names and Olive Young context.
- Korea Travel: Practical insider guide tone — write like an expat who has navigated the system. Include specific costs in KRW/USD, real transit routes, neighborhood-level recommendations. Reference T-money, KTX, Korean apps foreigners need.
- K-Entertainment: Business-savvy cultural analysis — go beyond fandom to explain the industry mechanics, revenue models, and global strategy. Reference HYBE, SM, JYP as business entities, not just talent agencies.

## Signature Section (MANDATORY)
Every article MUST include a signature analysis section as an H2. The exact section name will be specified in the user prompt.
Use the EXACT section name provided — it is niche-appropriate and varies per article to avoid AI detection patterns.
This section should be 300-500 words and provide unique analytical value.

## Korea E-E-A-T Rules (CRITICAL)
- Reference Korean-language sources where relevant (e.g., "According to reporting by Maeil Business Newspaper...")
- Explain Korean terms with romanization and meaning (e.g., "chaebol (재벌, large family-owned conglomerates)")
- Include Korean market data: KOSPI levels, KRW exchange rates, Korean government statistics
- Reference Korean regulatory bodies: FSC, KFTC, MSIT, BOK
- Cite Korean industry reports: KISA, KOTRA, Korea Creative Content Agency (KOCCA)
- When mentioning Korean companies, include their Korean name on first reference (e.g., "Samsung Electronics (삼성전자)")

## SEO Requirements
- Naturally incorporate all provided LSI/related keywords
- Use the primary keyword in the first paragraph (within the hook)
- Include keyword variations throughout
- Write compelling meta description with primary keyword

### Featured Snippet Optimization
For informational intent keywords (starting with "what is", "how does", "why", "what are"):
- Include a concise 40-60 word definition/answer box right after the opening paragraph
- HTML template: <div class="ab-snippet"><p>Concise answer here.</p></div>
- This targets Google's Featured Snippet position zero

### Search Intent Structural Templates (MANDATORY — match structure to user intent)

For **informational** intent:
- Full-length content with comprehensive coverage
- Include definition/answer snippet box after opening paragraph
- Use detailed step-by-step explanations, diagrams (SVG), and data tables
- FAQ section with 5-7 questions targeting "People Also Ask"
- Key Takeaways box prominently placed after TOC

For **transactional** intent:
- Include a product/action CTA box using <div class="ab-keypoint"> near the top with clear next steps
- MANDATORY: Include pricing/cost information in a comparison table
- MANDATORY: Include a "How to Get Started" or "How to Buy" section with numbered steps
- Keep content concise and action-focused — readers want to ACT, not read essays
- Include a "Quick Verdict" <div class="ab-highlight"> box within the first 300 words
- End with clear CTA: "Next Steps" section with specific actions

For **commercial** intent:
- MANDATORY: Include a comparison table with at least 5 criteria (price, features, pros, cons, verdict)
- MANDATORY: Include Pro/Con boxes using <div class="ab-proscons"> for each compared option
- Include a verdict/recommendation in a <div class="ab-highlight"> box immediately after any comparison table

For **commercial-investigation** intent:
- MANDATORY: Include a detailed comparison matrix table (6+ criteria, side-by-side columns per option)
- MANDATORY: Include a "Decision Framework" section with criteria weighting guide (who should choose what)
- MANDATORY: Include Pro/Con boxes using <div class="ab-proscons"> for each option compared
- Include a "Bottom Line" verdict per audience type (beginner vs experienced, budget vs premium)
- Include real price/cost data where available with Korean market context (₩ and $ equivalents)
- End with "What to Consider Before Choosing" checklist-style summary
- Include a "Who Should Choose What" section with persona-based recommendations
- Include a scoring/rating system (e.g., "Overall: 8.5/10") for each option

For **navigational** intent:
- Include a quick direct answer in a <div class="ab-highlight"> box BEFORE the Table of Contents. Get to the point immediately
- Keep total content shorter (use the navigational intent word count multiplier)
- Focus on guiding the reader to the right resource/page/action
- Include a "Quick Links" section at the top with direct resource links

### HowTo Featured Snippet (how-to content)
For how-to content, include numbered steps inside a snippet box:
<div class="ab-snippet" data-snippet-type="how-to">
<p style="margin:0 0 12px 0; font-weight:700; font-size:16px;">Quick Steps</p>
<ol style="margin:0; padding-left:20px; line-height:2.0; font-size:15px;">
<li><strong>Step Name</strong> — Brief description</li>
</ol></div>

### Table Featured Snippet (x-vs-y comparison content)
For comparison content, include a comparison table inside a snippet box:
<div class="ab-snippet" data-snippet-type="table">
<table style="width:100%; border-collapse:collapse; font-size:14px;">
<thead><tr><th style="padding:10px; border:1px solid #e2e8f0; background:#f0f4ff;">Feature</th><th style="padding:10px; border:1px solid #e2e8f0; background:#f0f4ff;">Option A</th><th style="padding:10px; border:1px solid #e2e8f0; background:#f0f4ff;">Option B</th></tr></thead>
<tbody><tr><td style="padding:10px; border:1px solid #e2e8f0;">Key Feature</td><td style="padding:10px; border:1px solid #e2e8f0;">Value</td><td style="padding:10px; border:1px solid #e2e8f0;">Value</td></tr></tbody>
</table></div>

### List Featured Snippet (best-x-for-y and comparison content)
For "best", "top", or ranked list content, include an ordered summary list right after the opening paragraph:
<div class="ab-snippet">
<p style="margin:0 0 12px 0; font-weight:700; font-size:16px;">Quick Summary: Top Picks</p>
<ol style="margin:0; padding-left:20px; line-height:2.0; font-size:15px;">
<li><strong>Item Name</strong> — Best for [use case]</li>
</ol></div>
This targets Google's List Featured Snippet for ranking queries.

### People Also Ask (PAA) Optimization
- Distribute 2-3 question-format H3 headings throughout the body content (NOT just in the FAQ section)
- These should match "People Also Ask" style queries related to the topic
- Place them where they naturally fit within the content flow
- Example: <h3 id="is-kospi-good-investment" style="...">Is KOSPI a Good Investment in 2026?</h3>

## Internal Links (IMPORTANT for SEO)
- You will be given a list of existing blog posts on this site
- Include 5-8 internal links to relevant existing posts within the article body
- Use descriptive anchor text containing the target page's primary keyword, NOT generic phrases like "click here", "read more", "this article", "check this out"
- ANCHOR TEXT FROM GSC: When a post has a "rankingKeyword" provided, use that EXACT keyword as anchor text — this is the keyword Google already associates with that page, reinforcing its ranking signal
- Good: "our analysis of <a ...>HYBE's revenue model</a>"
- Bad: "you can <a ...>read more here</a>"
- Link style: <a href="URL" style="color:#0066FF; text-decoration:underline;">anchor text</a>
- Distribute internal links throughout the article, not clustered in one section
- Only link to posts that are genuinely relevant to the current topic

## Inline Related Reading (User Engagement)
- At approximately the 50% point of the article, insert an inline related reading box:
  <div class="ab-related-inline" style="margin:20px 0; padding:14px 18px; background:linear-gradient(135deg,#f0f4ff,#f8f9fa); border-left:3px solid #0066FF; border-radius:0 8px 8px 0; font-size:14px;">
  <strong>Related:</strong> <a href="URL" style="color:#0066FF; text-decoration:underline;">Related Post Title</a></div>
- At approximately the 75% point, insert a SECOND related reading box with different styling:
  <div class="ab-related-inline" style="margin:20px 0; padding:14px 18px; background:linear-gradient(135deg,#f8f9fa,#f0f4ff); border-left:3px solid #00AA55; border-radius:0 8px 8px 0; font-size:14px;">
  <strong>Continue Reading:</strong> <a href="URL" style="color:#00AA55; text-decoration:underline;">Related Post Title</a></div>
- Choose the most topically relevant posts from the provided list (different post for each box)
- This increases page depth and reduces bounce rate

## External Source Attribution (IMPORTANT for E-E-A-T)
- Include 2-4 source attributions to authoritative sources using <cite> tags
- Do NOT write <a href> links for external sources. Instead, use this format:
  <cite data-source="SOURCE_KEY" data-topic="TOPIC_CONTEXT">Display Text</cite>
- SOURCE_KEY values (use exactly these keys):
  * Korean institutions: bok, krx, dart, kosis, fsc, ftc, msit, kotra, kisa, kocca
  * Korean companies: samsung, hyundai, lg, skhynix, naver, kakao, coupang
  * News/Data: bloomberg, reuters, nikkei, statista, worldbank
  * Entertainment: hybe, sm-entertainment, jyp
- data-topic: brief topic context for URL resolution (e.g., "markets", "earnings", "policy")
- Example: <cite data-source="bloomberg" data-topic="markets">Bloomberg Markets</cite>
- Example: <cite data-source="bok" data-topic="monetary-policy">Bank of Korea</cite>
- The publishing system will automatically resolve these to verified URLs

## Output Field Rules

1. title: High-CTR English title. Target 50-65 characters (Google SERP sweet spot).

   Choose the pattern that fits the content type:
   A. QUESTION/HOW-TO: "[How/What/Why] [specific Korea topic] [qualifier]?" or "[Primary Keyword] ([Year] Guide)"
   B. COMPARISON/LIST: "[Primary Keyword]: [specific value promise]" or "[Number] Best [thing] for [audience] (YYYY)"
   C. ANALYSIS/INSIGHT: "[Korea topic]: [what the data/analysis reveals]" or "[Primary Keyword] -- [insight]"

   MANDATORY:
   - MUST contain the PRIMARY KEYWORD or its direct variant
   - MUST include "Korea", "Korean", or a specific Korean brand/entity
   - Target exactly 50-65 characters
   - For guides/lists: always append (YYYY) for freshness signal
   - Include at least one POWER WORD or number. Power words include:
     * Numbers/data: specific figures, percentages, years
     * Brackets/parentheses: [2026], (Updated), [Free Guide]
     * Action triggers: "How to", "Why", "Best", "Top", "Ultimate"
     * Emotional triggers: "Surprising", "Essential", "Proven", "Secret"
   - FORBIDDEN: "changing everything", "game-changer", "things you need to know", "comprehensive guide to"

2. slug: Short, clean evergreen URL slug (3-5 words max, lowercase, hyphens, NO year for evergreen content).
3. html: English blog post in HTML format (2,500+ words, inline CSS styled)
4. Include a CLICKABLE table of contents with anchor links (see HTML rules below)
5. Use a natural, authoritative English tone with Korea expertise
6. excerpt: Compelling English meta description, 145-158 characters. MUST:
   - Front-load the PRIMARY KEYWORD in the first 5 words
   - Open with an action verb (Discover, Learn, Compare, Explore, Find, Get, See, Master)
   - State ONE concrete outcome the reader gets
   - Include a curiosity gap OR urgency signal
   - Use "you"/"your" at least once
   - End with a complete sentence
   - Count characters carefully: target 145-158
   - BAD: "This article discusses Korean skincare routines and provides tips for beginners."
   - GOOD: "Korean skincare routine secrets: discover the 7-step method dermatologists recommend for glass skin. Your complete 2026 guide starts here."

7. tags: 5-10 related English keywords (include Korea-specific terms)
8. category: One best-fit English category name

## Data Tables (Finance & Tech Categories)
- For Korean Finance and Korean Tech content types (especially deep-dive and analysis):
  MUST include at least ONE HTML data table with real or representative data
- Use responsive table markup: <div class="ab-table-wrap"><table style="width:100%; border-collapse:collapse;">...</table></div>
- Tables should have clear headers, aligned numbers, and source attribution in a caption
- Examples: KOSPI sector breakdown, Samsung vs SK Hynix comparison, ETF fee comparison, chip process node timeline

Accuracy Rules (CRITICAL — violating these damages site credibility):
- NEVER cite specific version numbers for software products that change frequently
- NEVER fabricate specific benchmark scores, pricing, or statistics you are not certain about
- NEVER write <a href> tags for external links — use <cite data-source="KEY" data-topic="TOPIC"> tags instead. The system resolves these to verified URLs automatically
- If you cannot verify a current-year statistic, use hedging language like "as of early ${new Date().getFullYear()}", "recent estimates suggest", "according to the latest available data", or "industry sources indicate"
- Prefer ranges over exact numbers when uncertain (e.g., "between $2-3 billion" instead of "$2.47 billion")
- Always attribute data to a named source — never present unverified numbers as standalone facts
- For ${new Date().getFullYear()} data: use "projected", "estimated", or "forecast" qualifiers. Most ${new Date().getFullYear()} annual data is not yet finalized — do NOT present mid-year estimates as confirmed full-year figures
- When referencing market data (KOSPI, KRW): use "as of [month] ${new Date().getFullYear()}" or "recent trading sessions" — avoid exact closing prices unless explicitly provided in the prompt
- NEVER invent Korean government policy names, bill numbers, or regulation titles — reference only well-known policies you are certain about

Image Prompt Rules:
- Generate exactly 5 English image prompts in the imagePrompts array
- First (index 0): Featured image - visually represents the core topic with Korean visual elements
- Remaining 4 (index 1-4): Inline images distributed across sections
- All 5 prompts MUST describe completely different scenes/subjects/compositions (NO duplicates!)
- Each prompt MUST be at least 50 words with specific details
- Include Korean visual elements where appropriate (Seoul skyline, Korean signage, Korean business settings)

imageCaptions Rules:
- Generate exactly 5 descriptive English image captions (8-20 words each)
- Each caption MUST include the primary keyword or topic context + descriptive scene
- Good: "Seoul's Gangnam financial district skyline showcasing Korean tech company headquarters"
- Bad: "City skyline" or "article image 1"
- NEVER use generic captions — every caption must be SEO-descriptive

## Rich Content Formats (use when appropriate for the niche/content type)

### Data Comparison Tables (Finance, Tech, Best-X-for-Y, X-vs-Y)
When comparing items, pricing, or features, ALWAYS include a styled comparison table:
<table style="width:100%; border-collapse:collapse; margin:24px 0; font-size:14px;">
<tr style="background:#0066FF; color:#fff;"><th style="padding:12px 16px; text-align:left;">...</th></tr>
<tr style="background:#fff;"><td style="padding:12px 16px; border-bottom:1px solid #eee;">...</td></tr>
<tr style="background:#f8f9fa;"><td style="padding:12px 16px; border-bottom:1px solid #eee;">...</td></tr>
</table>

### Inline SVG Data Visualizations (ALL niches — pick the format that fits)
Include ONE simple inline SVG infographic per article:
<div style="margin:24px 0; padding:20px; background:#f8f9fa; border-radius:12px; text-align:center;">
<svg viewBox="0 0 400 200" style="max-width:400px; width:100%;">
  <!-- Use rect for bars, circle for dots, text for labels -->
</svg>
<p style="margin:8px 0 0 0; font-size:13px; color:#888;">Source: [data source]</p>
</div>

Niche-specific SVG formats:
- **Finance**: Bar chart comparing key metrics (KOSPI sectors, P/E ratios, revenue)
- **Tech**: Comparison chart showing feature/spec differences between products
- **K-Entertainment**: Timeline showing key events or revenue milestones
- **Korean Food**: Ingredient proportion chart or nutrition comparison
- **Korea Travel**: Cost breakdown bars (accommodation, transport, food, activities)
- **Korean Language**: Grammar structure chart or TOPIK level comparison

Keep SVG charts simple: max 5 bars/items, clear labels, brand colors (#0066FF, #00CC66, #FF6B35).

### Key Metrics Highlight (Finance, Tech analysis)
Display key numbers prominently:
<div class="ab-metrics">
<div>
<p style="margin:0; font-size:28px; font-weight:700; color:#0066FF;">$XX.XB</p>
<p style="margin:4px 0 0 0; font-size:13px; color:#666;">Market Cap</p>
</div></div>

### Pro/Con Boxes (Best-X-for-Y, X-vs-Y)
<div class="ab-proscons">
<div class="ab-pros">
<p class="ab-pros-label">Pros</p>
<ul style="margin:0; padding-left:16px; font-size:14px; line-height:1.8;"><li>...</li></ul></div>
<div class="ab-cons">
<p class="ab-cons-label">Cons</p>
<ul style="margin:0; padding-left:16px; font-size:14px; line-height:1.8;"><li>...</li></ul></div></div>

### Step Progress Indicator (How-to content ONLY)
For each major step in how-to guides, use a numbered progress indicator:
<div class="ab-step">
<div class="ab-step-num">1</div>
<h3>Step Title</h3></div>

### Quick Poll / Reader Choice (engagement booster — use 1x per post max)
For comparison/review content, add a lightweight poll-style question to boost engagement:
<div style="margin:24px 0; padding:20px 24px; background:linear-gradient(135deg,#f0f4ff,#f8f9fa); border:1px solid #e2e8f0; border-radius:12px; text-align:center;">
<p style="margin:0 0 12px 0; font-size:17px; font-weight:700; color:#222;">Quick Poll: Which do you prefer?</p>
<p style="margin:0; font-size:15px; color:#555; line-height:1.7;">Drop your answer in the comments — Option A or Option B? We'll share the community consensus in our next update.</p></div>

## Contextual Content Upgrade
If the content type is how-to, deep-dive, or analysis, include ONE contextual content upgrade box using this format:
<div class="ab-content-upgrade" style="background:linear-gradient(135deg,#f0f7ff 0%,#e8f4f8 100%);border:2px solid #3498db;border-radius:12px;padding:24px;margin:30px 0;text-align:center;">
<p style="font-size:18px;font-weight:700;margin:0 0 8px;">📥 Free Download: [Relevant Resource Title]</p>
<p style="font-size:14px;color:#555;margin:0 0 16px;">[1-sentence description of what they'll get — checklist, template, cheatsheet, etc.]</p>
<a href="LEAD_MAGNET_URL" class="ab-cta-btn" style="display:inline-block;background:#3498db;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;">Download Free [Resource Type]</a>
</div>
The content upgrade MUST be contextually relevant to the article topic (not generic). Place it at approximately 60-70% through the article.

### Infographic-Style Data Box (Finance, Tech — data-heavy content)
For presenting key statistics in a visually scannable format:
<div style="margin:24px 0; padding:20px; background:#f8f9fa; border-radius:12px; border:1px solid #e5e7eb;">
<p style="margin:0 0 16px 0; font-size:16px; font-weight:700; color:#222;">Key Data Points</p>
<div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); gap:12px;">
<div style="padding:16px; background:#fff; border-radius:8px; text-align:center;">
<p style="margin:0; font-size:24px; font-weight:700; color:#0066FF;">Value</p>
<p style="margin:4px 0 0 0; font-size:12px; color:#888;">Label</p></div></div></div>

## HTML Structure Rules (USE CSS CLASSES — minimal inline styles)
All styling is handled by a consolidated <style> block injected at publish time. Use CSS classes instead of inline styles wherever possible. This reduces HTML size by ~40% and improves page speed.

### Article Header (MANDATORY — start your output with this)
<div class="ab-header">
<p><time datetime="YYYY-MM-DD">Published: Month DD, YYYY</time> · <span class="ab-updated">Updated: Month DD, YYYY</span> · READING_TIME_PLACEHOLDER min read</p>
</div>
Note: For new articles, set Published and Updated to the same date. The system updates the "Updated" date automatically when content is refreshed.

## Content Freshness Signal
When updating existing content, include a "What's New" changelog section before the first H2:
<div class="ab-changelog" style="background:#f8f9fa;border-left:4px solid #4CAF50;padding:16px 20px;margin:20px 0;border-radius:0 8px 8px 0;">
<p style="font-weight:700;margin:0 0 8px;">📝 Last Updated: [CURRENT_DATE]</p>
<ul style="margin:0;padding-left:20px;font-size:14px;">
<li>[Key change 1 — e.g., "Updated KOSPI data for Q1 2026"]</li>
<li>[Key change 2 — e.g., "Added new Samsung Galaxy S26 comparison"]</li>
</ul>
</div>

### Clickable Table of Contents (MANDATORY — collapsed by default on mobile)
<details class="ab-toc">
<summary>Table of Contents</summary>
<ol>
<li><a href="#section-slug">Section Title</a></li>
</ol></details>

### Key Takeaways Box (MANDATORY — insert right after TOC, before first H2)
<div class="ab-takeaways">
<p style="margin:0 0 12px 0; font-weight:700; font-size:17px; color:#0066FF;">Key Takeaways</p>
<ul>
<li>3-5 bullet points summarizing the most important insights from the article</li>
<li>Each bullet should be a concrete, actionable takeaway (not generic filler)</li>
<li>Include at least one data point or specific Korean market reference</li>
</ul>
</div>

### Heading IDs for TOC anchors (Passage Ranking Optimization)
- Every H2 MUST have an id attribute: <h2 id="section-slug">
- Every H3: <h3 id="subsection-slug">
- IDs: lowercase, hyphens, derived from heading text (e.g., "Global Context" → id="global-context")
- Do NOT add inline style attributes to H2/H3 — styles are handled by CSS classes
- PASSAGE RANKING: The FIRST sentence after each H2/H3 MUST directly answer or define the section topic in a self-contained way. Google extracts individual passages for ranking — each section should be independently useful as a search result.

## Passage Ranking Optimization
Each H2 section MUST begin with a 2-3 sentence self-contained answer paragraph that directly answers the section's implied question. This paragraph should:
- Be understandable without reading the rest of the section
- Contain the section's key insight or answer upfront
- Use the section heading's keywords naturally
This enables Google's Passage Ranking to surface individual sections as search results.

### Other Elements (use CSS classes)
- Paragraphs: <p> (no inline style needed — .entry-content p handles it)
- Highlight box: <div class="ab-highlight"><p>content</p></div>
- Blockquote: <blockquote>quote</blockquote>
- Divider: <hr>
- Key point box: <div class="ab-keypoint"><p style="margin:0; font-weight:600; color:#f57f17; margin-bottom:8px;">Key Point</p><p>content</p></div>
- Comparison table: <div class="ab-table-wrap"><table style="width:100%; border-collapse:collapse;"><tr style="background:#f0f4ff;"><th style="padding:12px 16px; border:1px solid #ddd; text-align:left;">...</th></tr><tr><td style="padding:12px 16px; border:1px solid #ddd;">...</td></tr></table></div>
- Image placeholders: <!--IMAGE_PLACEHOLDER_1-->, <!--IMAGE_PLACEHOLDER_2-->, <!--IMAGE_PLACEHOLDER_3-->, <!--IMAGE_PLACEHOLDER_4-->
- Distribute image placeholders evenly (one after each major section)
- NEVER use emoji or unicode special symbols in HTML
- Use numbers (1. 2. 3.) or hyphens (-) for lists
- The html MUST end with: <p class="ab-disclaimer">This article is AI-assisted and editorially reviewed. Content is based on trending information, Korean-language primary sources, and publicly available data. It is intended for informational purposes only. Please verify details through official sources.</p>
- AFTER the disclaimer, add a back-to-top link: <p class="ab-back-top"><a href="#">Back to Top</a></p>

IMPORTANT: Respond with pure JSON only. Do NOT use markdown code blocks (\`\`\`).
Escape double quotes (") inside field values as \\".

JSON format:
{"title":"English Title","slug":"topic-keyword","ogTitle":"Short Social Title (max 50 chars)","html":"<div style=\\"max-width:760px;...\\">...English content...</div>","excerpt":"English meta description","metaDescription":"SEO-optimized meta description for search results (145-158 chars, include primary keyword, action-oriented)","titleCandidates":["Alternative Title A (different angle)","Alternative Title B (different hook)"],"tags":["tag1","tag2"],"category":"CategoryName","imagePrompts":["A detailed scene of... (50+ words)","...","...","...","..."],"imageCaptions":["Short English caption 1","caption 2","caption 3","caption 4","caption 5"]}

IMPORTANT for metaDescription: This is separate from excerpt. Write it specifically for Google search results CTR optimization. Include the primary keyword, a benefit/value proposition, and end with a subtle call to action. Target 145-158 characters.
IMPORTANT for titleCandidates: Provide 2 alternative titles with different angles/hooks than the main title. These will be used for A/B testing.`;
}

export class ContentGeneratorService {
  private client: Anthropic;
  private siteOwner: string;
  private siteUrl: string;
  private minQualityScore: number;
  private authorLinkedin: string;
  private authorTwitter: string;
  private monetizationContext: string;
  private competitiveContext: string;
  private snippetContext: string;
  constructor(apiKey: string, siteOwner?: string, siteUrl?: string, minQualityScore?: number, authorLinks?: { linkedin?: string; twitter?: string }) {
    this.client = new Anthropic({ apiKey });
    this.siteOwner = siteOwner || '';
    this.siteUrl = siteUrl || '';
    this.minQualityScore = minQualityScore ?? 55;
    this.authorLinkedin = authorLinks?.linkedin || '';
    this.authorTwitter = authorLinks?.twitter || '';
    this.monetizationContext = '';
    this.competitiveContext = '';
    this.snippetContext = '';
  }

  /** Set monetization awareness for content generation (affiliate/newsletter CTA hints) */
  setMonetizationContext(category: string, hasAffiliate: boolean, hasNewsletter: boolean): void {
    const parts: string[] = [];
    if (hasAffiliate) {
      parts.push('This article may feature product affiliate links. Write natural product mentions and include a recommendation section where appropriate.');
    }
    if (hasNewsletter) {
      parts.push('A newsletter signup CTA will be inserted mid-article. Write a natural transition point around the 40% mark of the content.');
    }
    this.monetizationContext = parts.length > 0
      ? `\n## Monetization Context\n${parts.join('\n')}\n`
      : '';
  }

  /**
   * Select author persona based on content type and post count modulo.
   * Academic voice for deep-dive/analysis, casual for listicle/how-to.
   */
  selectAuthorPersona(category: string, contentType: string, postCount: number): AuthorProfile {
    const personas = NICHE_AUTHOR_PERSONAS[category];
    if (!personas || personas.length <= 1) {
      return personas?.[0] || { name: '', title: 'Korea Analyst', bio: '', expertise: [], credentials: [], yearsExperience: 3 };
    }

    const preferredVoice = CONTENT_TYPE_PERSONA_MAP[contentType] || 'primary';
    if (preferredVoice === 'secondary' && postCount % 3 !== 0) {
      // Use secondary persona for casual content types, but rotate every 3rd post back to primary
      return personas[1];
    }
    return personas[0];
  }

  /** Set competitive context for content generation */
  setCompetitiveContext(context: string): void {
    this.competitiveContext = context ? `\n## Competitive Context\n${context}\n` : '';
  }

  /** Set featured snippet opportunities for content optimization */
  setSnippetOpportunities(opportunities: Array<{ query: string; snippetType: 'paragraph' | 'list' | 'table' }>): void {
    if (opportunities.length === 0) {
      this.snippetContext = '';
      return;
    }
    const hints = opportunities.map(o => {
      const formatHint =
        o.snippetType === 'paragraph' ? 'Start with a concise 40-60 word definition paragraph answering the query directly'
        : o.snippetType === 'list' ? 'Include a numbered step-by-step list or bullet list near the top of the relevant section'
        : 'Include a comparison table with clear headers for this topic';
      return `- "${o.query}" (target: ${o.snippetType}): ${formatHint}`;
    }).join('\n');
    this.snippetContext = `\n## Featured Snippet Optimization\nFormat content to win these featured snippets:\n${hints}\n`;
  }

  async generateContent(
    researched: ResearchedKeyword,
    existingPosts?: ExistingPost[],
    clusterLinks?: Array<{ url: string; title: string; keyword?: string }>,
    options?: { postCount?: number; rankingKeywords?: Map<string, { keyword: string; position: number; impressions: number }>; similarPostTitles?: string[] },
  ): Promise<BlogContent> {
    const { niche, analysis } = researched;
    logger.info(`Generating content for: "${analysis.selectedKeyword}" [${niche.name} / ${analysis.contentType}]`);

    const today = new Date().toISOString().split('T')[0];
    const year = new Date().getFullYear();

    // Build cluster links section (mandatory links from topic cluster service)
    let clusterLinksSection = '';
    if (clusterLinks && clusterLinks.length > 0) {
      const clusterLines = clusterLinks.map(cl => {
        const kwInfo = cl.keyword ? ` (keyword: "${cl.keyword}")` : '';
        return `- "${cl.title}"${kwInfo}: ${cl.url}`;
      }).join('\n');
      clusterLinksSection = `\n\n## Required Cluster Links (MANDATORY — link to ALL of these within the article body)
${clusterLines}
These are sibling posts in your topic cluster. You MUST include a natural contextual link to each one.`;
    }

    // Build internal links section — 3-tier priority for topic cluster strengthening
    let internalLinksSection = '';
    if (existingPosts && existingPosts.length > 0) {
      // Tier 1: Same sub-niche (strongest cluster link)
      const sameSubNiche = existingPosts
        .filter(p => p.subNiche && p.subNiche === niche.id)
        .slice(0, 8);
      // Tier 2: Same category but different sub-niche
      const sameCategory = existingPosts
        .filter(p =>
          p.category.toLowerCase() === niche.category.toLowerCase() &&
          !(p.subNiche && p.subNiche === niche.id),
        )
        .slice(0, 6);
      // Tier 3: Cross-category (for broad topical authority)
      const crossCategory = existingPosts
        .filter(p => p.category.toLowerCase() !== niche.category.toLowerCase())
        .slice(0, 4);
      const filteredPosts = [...sameSubNiche, ...sameCategory, ...crossCategory];

      const rankingKeywords = options?.rankingKeywords;
      const postList = filteredPosts
        .map((p) => {
          // Prefer GSC ranking keyword over stored keyword for anchor text
          const gscData = rankingKeywords?.get(p.url);
          const kwInfo = gscData
            ? ` (rankingKeyword: "${gscData.keyword}")`
            : p.keyword ? ` (keyword: "${p.keyword}")` : '';
          const clusterTag = p.subNiche === niche.id ? ' [TOPIC CLUSTER]' : '';
          return `- "${p.title}" [${p.category}]${kwInfo}${clusterTag}: ${p.url}`;
        })
        .join('\n');
      internalLinksSection = `\n\nExisting Blog Posts (pick 5-8 relevant ones, each URL used ONLY ONCE, use their keyword or title for descriptive anchor text — NEVER use "click here" or "read more"). LINKING PRIORITY:
1. [TOPIC CLUSTER] posts FIRST — these are sibling posts in the same topic cluster. Link to at least 2 of these if available.
2. Same-category posts for broader topical authority.
3. Cross-category posts for site-wide link equity.
Place links naturally within body text — NOT in a list at the end.\n${postList}`;
      // Also count cluster siblings for "More in this series" prompt
      const clusterCount = sameSubNiche.length;
      if (clusterCount >= 1) {
        internalLinksSection += `\n\nIMPORTANT: This post has ${clusterCount} sibling post(s) in the same topic cluster. Mention at least ${Math.min(clusterCount, 2)} of them contextually within your article to strengthen the topic cluster.`;
      }
    }

    // Niche-specific writing directives for differentiated voice
    const nicheDirectives: Record<string, string> = {
      'Korean Tech': `NICHE VOICE: Write as a Seoul-based tech journalist fluent in both Korean startup culture and Silicon Valley trends. Include specific Korean tech ecosystem references (Pangyo Techno Valley, TIPS program, K-Startup Grand Challenge). Use insider terminology. Include at least one comparison with a global equivalent. When mentioning apps/services, note if they have English support.`,
      'K-Entertainment': `NICHE VOICE: Write as a business-savvy entertainment industry analyst. Go beyond fandom — explain revenue models, contract structures, and global expansion strategies. Reference specific HYBE/SM/JYP quarterly earnings when relevant. Include at least one industry-insider perspective. Frame K-entertainment as a business story, not just culture.`,
      'Korean Finance': `NICHE VOICE: Write as an authoritative market analyst for international investors. MUST include at least one data table (KOSPI levels, P/E ratios, or sector comparisons). Include a risk disclaimer paragraph. Reference BOK monetary policy and FSC regulations. Use precise financial terminology. Include KRW/USD context for all monetary figures.`,
      'Korean Food': `NICHE VOICE: Write in a warm, first-person experiential tone — as if you live in Seoul and frequent local markets. Include specific Seoul neighborhood recommendations (Gwangjang Market, Mapo-gu, Itaewon). Provide Korean ingredient names with Hangul (e.g., gochugaru 고춧가루). Include at least one practical tip from Korean home cooking culture. Mention specific price ranges in KRW.`,
      'Korea Travel': `NICHE VOICE: Write as a practical expat guide. Include specific costs in both KRW and USD. Mention exact transit routes (subway line numbers, KTX schedules). Reference essential Korean apps (Naver Map, KakaoTalk, T-money). Include neighborhood-level specificity, not just city names. Add at least one "insider tip" that typical tourist guides miss.`,
      'Korean Language': `NICHE VOICE: Write as an encouraging Korean language teacher. Include Hangul examples with romanization for every Korean term introduced. Mention TOPIK level relevance where applicable. Include common mistakes foreigners make and how to avoid them. Reference specific textbooks or apps with pros/cons. Add cultural context behind language patterns (honorifics, age-based speech).`,
    };
    const nicheVoice = nicheDirectives[niche.category] || '';

    const userPrompt = `Today's Date: ${today}
Niche: "${niche.name}" (${niche.category})
Content Type: ${analysis.contentType}
Primary Keyword: "${analysis.selectedKeyword}"
Suggested Title: "${analysis.suggestedTitle}"
Unique Angle: ${analysis.uniqueAngle}
Search Intent: ${analysis.searchIntent}
Related Keywords to Include: ${analysis.relatedKeywordsToInclude.join(', ')}${clusterLinksSection}${internalLinksSection}

${nicheVoice}${this.monetizationContext}${this.competitiveContext}${this.snippetContext}
${options?.similarPostTitles && options.similarPostTitles.length > 0 ? `
IMPORTANT — CONTENT DIFFERENTIATION REQUIREMENT:
The following similar posts already exist on this blog. Your article MUST cover a distinctly different angle, use different examples, and provide unique value:
${options.similarPostTitles.map(t => `- "${t}"`).join('\n')}
DO NOT repeat the same advice, structure, examples, or recommendations used in these posts. If they cover general tips, go deep on a specific subtopic. If they are beginner-focused, target advanced readers.
` : ''}Write an in-depth ${analysis.contentType} blog post about "${analysis.selectedKeyword}" for the ${niche.name} niche. The post MUST be at least ${getWordCountTargets(analysis.contentType, analysis.searchIntent).target} words. Write thoroughly — expand each section with detailed explanations, Korean market data, and expert insights. Do NOT stop early.
Search intent: ${analysis.searchIntent || 'informational'}${analysis.searchIntent === 'transactional' ? ' — Focus on actionable steps and clear instructions. Readers want to DO something, not just learn about it.\nSTRUCTURE: Include pricing/cost section, step-by-step action guide, and a <div class="ab-keypoint"> CTA box near top with clear next steps. Use data-snippet-type="how-to" for featured snippet if applicable.' : analysis.searchIntent === 'commercial' ? ' — Focus on comparisons, pros/cons, and helping readers make a decision.\nSTRUCTURE: MUST include comparison table, pro/con analysis for top options, and a clear verdict in <div class="ab-highlight"> immediately after the comparison table. Use data-snippet-type="table" for featured snippet.' : analysis.searchIntent === 'navigational' ? ' — Provide a direct, comprehensive answer quickly. Less padding, more value per word.\nSTRUCTURE: Include quick answer in <div class="ab-highlight"> BEFORE the Table of Contents. Then supporting context. Keep total length shorter.' : ''}
IMPORTANT: All information, statistics, recommendations, and references must be current as of ${year}. Do NOT use outdated data from previous years. Mention "${year}" where relevant.
Use the unique angle: "${analysis.uniqueAngle}"
LSI Keyword Integration Rules (CRITICAL for semantic SEO):
- LSI keywords: ${analysis.relatedKeywordsToInclude.join(', ')}
- MUST use at least 2-3 LSI keywords in H2 or H3 subheadings (e.g., if LSI includes "korean stock market outlook", use it as an H2/H3)
- MUST use LSI keyword variations as internal link anchor text (not just the primary keyword)
- Naturally weave remaining LSI keywords into body paragraphs (aim for each LSI keyword appearing 1-2 times)
- Do NOT force LSI keywords unnaturally — readability always wins over keyword density

Include 2-4 internal links to relevant existing posts listed above, and 2-4 external source citations using <cite data-source="KEY" data-topic="TOPIC"> tags (Korean institutional sources preferred: bok, krx, dart, kosis).
MANDATORY: Include a "${getSignatureSection(niche.category, analysis.contentType, analysis.selectedKeyword)}" signature analysis section (as an H2 heading, 300-500 words of unique analytical value).
${['analysis', 'deep-dive', 'case-study'].includes(analysis.contentType) ? `
ORIGINAL RESEARCH SIGNALS (for ${analysis.contentType} content):
- Include a "Methodology" or "Our Analysis Approach" section explaining how data was gathered/analyzed
- Cite specific Korean data sources: BOK (Bank of Korea), KOSIS (Korean Statistical Information Service), DART (disclosure system), or industry reports
- Use phrasing like "Based on our analysis of [X data points]..." or "According to industry data from [source]..."
- Include at least one data-driven insight that requires cross-referencing multiple sources
- This qualifies the post as original research for E-E-A-T scoring` : ''}
Also generate a relevant poll question for reader engagement. Include it in the JSON output as:
"pollQuestion": { "question": "Your poll question here?", "options": ["Option A", "Option B", "Option C"] }
${['product-review', 'best-x-for-y'].includes(analysis.contentType) ? `
For product mentions, include structured product data in the JSON output as:
"productMentions": [{ "name": "Product Name", "category": "product-category" }]
Include up to 5 products mentioned in the article.` : ''}
Respond with pure JSON only.`;

    // Temperature varies by content type: analytical content needs precision, creative needs more variation
    const temperatureMap: Record<string, number> = {
      'analysis': 0.5, 'news-explainer': 0.5, 'case-study': 0.5, 'product-review': 0.6,
      'deep-dive': 0.6, 'x-vs-y': 0.6,
      'how-to': 0.7, 'best-x-for-y': 0.7, 'listicle': 0.7,
    };
    const temperature = temperatureMap[analysis.contentType] ?? 0.7;

    const variant = getVariantForNiche(researched.niche.id);
    const targets = getWordCountTargets(analysis.contentType, analysis.searchIntent);
    const systemPrompt = buildSystemPrompt(variant).replace(/WORD_COUNT_TARGET/g, String(targets.target));
    logger.debug(`Using layout variant: ${variant} (niche: ${researched.niche.id}), word target: ${targets.target}`);

    // Circuit breaker check — skip Claude API if consecutive failures detected
    if (circuitBreakers.claude.isOpen()) {
      throw new ContentGenerationError('Claude API circuit breaker OPEN — skipping to prevent cascade failure');
    }

    const stream = this.client.messages.stream({
      model: process.env.CLAUDE_MODEL || 'claude-sonnet-4-6',
      max_tokens: 64000,
      temperature,
      system: [
        {
          type: 'text',
          text: systemPrompt,
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [{ role: 'user', content: userPrompt }],
    });

    let response;
    try {
      response = await stream.finalMessage();
      circuitBreakers.claude.recordSuccess();
    } catch (claudeError) {
      circuitBreakers.claude.recordFailure();
      throw claudeError;
    }

    const usage = response.usage as typeof response.usage & {
      cache_creation_input_tokens?: number;
      cache_read_input_tokens?: number;
    };
    costTracker.addClaudeCall(
      process.env.CLAUDE_MODEL || 'claude-sonnet-4-6',
      usage.input_tokens || 0,
      usage.output_tokens || 0,
    );
    if (usage.cache_read_input_tokens) {
      logger.info(`Prompt cache HIT: ${usage.cache_read_input_tokens} tokens read from cache (saved ~$${((usage.cache_read_input_tokens / 1_000_000) * 2.7).toFixed(4)})`);
    } else if (usage.cache_creation_input_tokens) {
      logger.info(`Prompt cache WRITE: ${usage.cache_creation_input_tokens} tokens written to cache`);
    }

    const text =
      response.content[0].type === 'text' ? response.content[0].text : '';

    logger.debug(`Raw Claude response length: ${text.length} chars`);

    const content = parseJsonResponse(text, analysis.selectedKeyword);

    // Validate and fix excerpt (145-158 chars, keyword-first, sentence-boundary trim)
    if (content.excerpt) {
      const keywordWords = analysis.selectedKeyword.toLowerCase().split(/\s+/).filter(w => w.length > 3);

      // 1. Trim to sentence boundary if over 160 chars (avoid mid-sentence cut)
      if (content.excerpt.length > 160) {
        const sentences = content.excerpt.match(/[^.!?]+[.!?]+/g) || [content.excerpt];
        let trimmed = '';
        for (const s of sentences) {
          if ((trimmed + s).length <= 158) {
            trimmed += s;
          } else {
            break;
          }
        }
        content.excerpt = trimmed.trim() || content.excerpt.slice(0, 155) + '...';
        logger.warn(`Excerpt trimmed to sentence boundary (${content.excerpt.length} chars): "${content.title}"`);
      }

      // 2. Extend if too short
      if (content.excerpt.length < 120) {
        logger.warn(`Excerpt too short (${content.excerpt.length} chars), extracting from body: "${content.title}"`);
        const bodyText = content.html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        const sentences = bodyText.match(/[^.!?]+[.!?]+/g) || [];
        const meaningfulSentence = sentences.find(s => s.trim().length > 30 && s.trim().length < 120);
        if (meaningfulSentence) {
          content.excerpt = (content.excerpt.replace(/\.?\s*$/, '. ') + meaningfulSentence.trim()).slice(0, 158);
        } else {
          content.excerpt = (content.excerpt.replace(/\.?\s*$/, '') + ' — your essential guide for ' + new Date().getFullYear() + '.').slice(0, 158);
        }
      }

      // 3. Verify keyword presence — regenerate excerpt from body if missing
      const excerptLower = content.excerpt.toLowerCase();
      const hasKeyword = keywordWords.some(w => excerptLower.includes(w));
      if (!hasKeyword && keywordWords.length > 0) {
        logger.warn(`Excerpt missing keyword fragments, regenerating from body: "${content.title}"`);
        const bodyText = content.html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        const sentences = bodyText.match(/[^.!?]+[.!?]+/g) || [];
        // Find first sentence containing keyword
        const kwSentence = sentences.find(s => {
          const sl = s.toLowerCase();
          return keywordWords.some(w => sl.includes(w)) && s.trim().length > 60 && s.trim().length < 160;
        });
        if (kwSentence) {
          content.excerpt = kwSentence.trim().slice(0, 158);
          logger.info(`Excerpt regenerated with keyword: "${content.excerpt.slice(0, 50)}..."`);
        }
      }
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

    // Validate actual word count (strip HTML tags) — try continuation before rejecting
    let wordCount = content.html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean).length;
    if (wordCount < targets.continuation) {
      logger.warn(`Content short: ${wordCount}/${targets.target} words for "${content.title}" [${analysis.contentType}], requesting continuation...`);
      try {
        const continuationHtml = await this.requestContinuation(content, analysis.selectedKeyword, wordCount, temperature, researched.niche.id);
        if (continuationHtml) {
          // Insert continuation before the disclaimer
          const disclaimerIdx = findDisclaimerIndex(content.html);
          if (disclaimerIdx !== -1) {
            content.html = content.html.slice(0, disclaimerIdx) + continuationHtml + '\n' + content.html.slice(disclaimerIdx);
          } else {
            const lastDiv = content.html.lastIndexOf('</div>');
            if (lastDiv !== -1) {
              content.html = content.html.slice(0, lastDiv) + continuationHtml + '\n' + content.html.slice(lastDiv);
            }
          }
          wordCount = content.html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean).length;
          logger.info(`After continuation: ${wordCount} words for "${content.title}"`);
        }
      } catch (contErr) {
        logger.warn(`Continuation failed: ${contErr instanceof Error ? contErr.message : contErr}`);
      }

      if (wordCount < targets.rejection) {
        throw new ContentGenerationError(`Content too short: "${content.title}" has only ${wordCount} words (minimum: ${targets.rejection} for ${analysis.contentType}). Regeneration required.`);
      }
    }
    logger.info(`Word count: ${wordCount}/${targets.target} words for "${content.title}" [${analysis.contentType}]`);

    // Calculate and inject reading time (average 238 WPM for non-fiction + 12s per image)
    const imageCount = (content.html.match(/<!--IMAGE_PLACEHOLDER_\d+-->/g) || []).length + 1; // +1 for featured
    const readingTime = Math.max(1, Math.ceil(wordCount / 238 + imageCount * 0.2));
    content.html = content.html.replace('READING_TIME_PLACEHOLDER', String(readingTime));
    logger.info(`Reading time: ${readingTime} min for "${content.title}"`);

    // Replace date placeholder with actual date
    const pubDate = new Date();
    const dateFormatted = pubDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    const dateIso = pubDate.toISOString().split('T')[0];
    content.html = content.html.replace(/datetime="YYYY-MM-DD"/, `datetime="${dateIso}"`);
    content.html = content.html.replace(/Published: Month DD, YYYY/, `Published: ${dateFormatted}`);

    // Validate heading hierarchy (H2 before H3, no skipping levels)
    validateHeadingHierarchy(content.html, content.title);

    // Ensure TOC links have matching heading IDs (add IDs if missing)
    content.html = ensureHeadingIds(content.html);

    // Ensure slug exists (fallback: generate from title, no year for evergreen content)
    if (!content.slug) {
      const yr = new Date().getFullYear();
      const base = optimizeSlug(content.title);
      // Append year for time-sensitive content types
      const isBestOf = base.startsWith('best-') || base.startsWith('top-');
      const isTimeSensitive = isBestOf || analysis.contentType === 'news-explainer';
      content.slug = isTimeSensitive ? `${base}-${yr}` : base;
    } else {
      // Optimize Claude-returned slug too
      content.slug = optimizeSlug(content.slug);
    }

    // Auto-fix common issues (mobile tables, title length, excerpt keyword, etc.)
    const autoFixed = autoFixContent(content.html, content.title, analysis.selectedKeyword, content.excerpt);
    content.html = autoFixed.html;
    content.title = autoFixed.title;
    if (autoFixed.excerpt) content.excerpt = autoFixed.excerpt;
    if (autoFixed.fixes.length > 0) {
      logger.info(`Auto-fixes applied: ${autoFixed.fixes.join('; ')}`);
    }

    // Content quality scoring
    let score = validateContent(
      content.html,
      content.title,
      content.excerpt,
      analysis.selectedKeyword,
      analysis.contentType,
      this.siteUrl,
      researched.niche.category,
    );
    logContentScore(score, content.title);

    // Regenerate excerpt if score is weak
    if (score.breakdown.excerptScore < 7) {
      const newExcerpt = await this.regenerateExcerpt(content.title, content.excerpt, analysis.selectedKeyword);
      if (newExcerpt) {
        content.excerpt = newExcerpt;
        score = validateContent(
          content.html,
          content.title,
          content.excerpt,
          analysis.selectedKeyword,
          analysis.contentType,
          this.siteUrl,
          researched.niche.category,
        );
        logger.info(`Excerpt regenerated, new score: ${score.total}/100 (excerpt: ${score.breakdown.excerptScore})`);
      }
    }

    if (score.total < this.minQualityScore) {
      throw new ContentGenerationError(
        `Content quality too low: ${score.total}/100 for "${content.title}" (minimum: ${this.minQualityScore}). ` +
        `Issues: ${score.issues.map(i => i.message).join('; ')}. Regeneration required.`,
      );
    }

    // Store score for downstream use
    (content as BlogContent & { qualityScore?: number }).qualityScore = score.total;

    // Add author byline with enhanced E-E-A-T identity
    if (this.siteOwner) {
      const initial = this.siteOwner.charAt(0).toUpperCase();
      const avatarStyle = `width:48px; height:48px; background:#0066FF; border-radius:50%; display:flex; align-items:center; justify-content:center; color:#fff; font-size:20px; font-weight:700; flex-shrink:0;`;

      const socialLinks: string[] = [];
      if (this.authorLinkedin) {
        socialLinks.push(`<a href="${this.authorLinkedin}" target="_blank" rel="noopener noreferrer" style="color:#0077B5; text-decoration:none; font-size:13px;">LinkedIn</a>`);
      }
      if (this.authorTwitter) {
        socialLinks.push(`<a href="${this.authorTwitter}" target="_blank" rel="noopener noreferrer" style="color:#1DA1F2; text-decoration:none; font-size:13px;">X/Twitter</a>`);
      }
      const socialHtml = socialLinks.length > 0
        ? `<p style="margin:6px 0 0 0; font-size:13px;">${socialLinks.join(' · ')}</p>`
        : '';

      const byline =
        `<div style="margin:30px 0 0 0; padding:20px 24px; background:#f8f9fa; border-radius:8px; display:flex; align-items:center; gap:16px;">` +
        `<div style="${avatarStyle}">${initial}</div>` +
        `<div><p style="margin:0; font-weight:700; font-size:15px; color:#222;">Written by: <a href="/about" style="color:#0066FF; text-decoration:none;">${this.siteOwner}</a></p>` +
        `<p style="margin:4px 0 0 0; font-size:13px; color:#888;">Korea Market & Trends Analyst | Covering Korean tech, entertainment, and financial markets for global readers.</p>` +
        `${socialHtml}</div></div>`;

      // Insert byline before the disclaimer paragraph (not at random last </div>)
      const disclaimerIdx = findDisclaimerIndex(content.html);
      if (disclaimerIdx !== -1) {
        content.html = content.html.slice(0, disclaimerIdx) + byline + '\n' + content.html.slice(disclaimerIdx);
      } else {
        const lastDivIdx = content.html.lastIndexOf('</div>');
        if (lastDivIdx !== -1) {
          content.html = content.html.slice(0, lastDivIdx) + byline + '\n</div>';
        } else {
          content.html += byline;
        }
      }
    }

    logger.info(`Content generated: "${content.title}" (${content.html.length} chars)`);
    return content;
  }

  /**
   * Request Claude to continue/expand content that is too short.
   * Returns additional HTML to append, or null if continuation fails.
   */
  private async requestContinuation(content: BlogContent, keyword: string, currentWordCount: number, temperature: number = 0.6, nicheId?: string): Promise<string | null> {
    const neededWords = Math.max(500, 2800 - currentWordCount);

    // Extract existing H2 headings for context so continuation doesn't repeat them
    const existingHeadings = (content.html.match(/<h2[^>]*>(.*?)<\/h2>/gi) || [])
      .map(h => h.replace(/<[^>]+>/g, '').trim());
    const headingsList = existingHeadings.length > 0
      ? `\nExisting sections (do NOT repeat these topics):\n${existingHeadings.map(h => `- ${h}`).join('\n')}`
      : '';

    // Extract the last 500 chars of content for tone/style continuity
    const plainTail = content.html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(-500);

    // Use the niche's actual variant for consistent tone (not hardcoded 'standard')
    const variant = nicheId ? getVariantForNiche(nicheId) : 'standard';
    const continuationSystemPrompt = buildSystemPrompt(variant);

    const prompt = `You are continuing a blog post about "${keyword}" titled "${content.title}".
Current word count: ${currentWordCount}. Need at least ${neededWords} more words.
${headingsList}

Last 500 characters of existing content for tone matching:
"${plainTail}"

Write additional content that seamlessly continues this article. Requirements:
1. Match the existing tone, style, and analytical depth exactly
2. FIRST: Deepen existing sections with additional data, Korean-specific examples, expert quotes, and concrete statistics
3. Only if existing sections are already comprehensive, add 1-2 NEW supporting H2 sections with id attributes (different from existing ones listed above)
4. Include Korean market data points, statistics, and source citations
5. Use the same inline CSS: H2 with border-left:5px solid #0066FF; padding-left:15px; font-size:22px, paragraphs with margin:0 0 20px 0; line-height:1.8; font-size:16px
6. Start with a natural transition from the previous content, not a new introduction

Return raw HTML only, no markdown code blocks or JSON wrapper.`;

    try {
      const response = await this.client.messages.create({
        model: process.env.CLAUDE_MODEL || 'claude-sonnet-4-6',
        max_tokens: 8000,
        temperature,
        system: continuationSystemPrompt,
        messages: [{ role: 'user', content: prompt }],
      });

      const text = response.content[0].type === 'text' ? response.content[0].text : '';
      const cleaned = text.replace(/```(?:html)?\s*/g, '').replace(/```\s*$/g, '').trim();
      if (cleaned.length > 200) {
        return cleaned;
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Regenerate a weak excerpt using a focused Claude call.
   * Returns improved excerpt or null on failure.
   */
  private async regenerateExcerpt(title: string, currentExcerpt: string, keyword: string): Promise<string | null> {
    try {
      const response = await this.client.messages.create({
        model: process.env.CLAUDE_MODEL || 'claude-sonnet-4-6',
        max_tokens: 200,
        temperature: 0.3,
        messages: [{
          role: 'user',
          content: `Write a compelling meta description (150-160 chars) for this blog post. It MUST contain the keyword "${keyword}" naturally. Include a clear benefit or hook for the reader.\n\nTitle: ${title}\nCurrent excerpt: ${currentExcerpt}\n\nRespond with ONLY the meta description text, no quotes or explanation.`,
        }],
      });

      const text = response.content[0].type === 'text' ? response.content[0].text.trim() : '';
      costTracker.addClaudeCall(
        process.env.CLAUDE_MODEL || 'claude-sonnet-4-6',
        response.usage?.input_tokens || 0,
        response.usage?.output_tokens || 0,
      );

      if (text.length >= 80 && text.length <= 200) {
        logger.info(`Excerpt regenerated: "${text.slice(0, 60)}..."`);
        return text;
      }
      return null;
    } catch (error) {
      logger.warn(`Excerpt regeneration failed: ${error instanceof Error ? error.message : error}`);
      return null;
    }
  }
}

function validateHeadingHierarchy(html: string, title: string): void {
  const headingRegex = /<h([2-6])\b[^>]*>/gi;
  let match;
  let lastLevel = 1; // Start after H1 (title)
  const issues: string[] = [];

  while ((match = headingRegex.exec(html)) !== null) {
    const level = parseInt(match[1]);
    if (level > lastLevel + 1) {
      issues.push(`H${level} appears after H${lastLevel} (skipped H${lastLevel + 1})`);
    }
    lastLevel = level;
  }

  if (issues.length > 0) {
    logger.warn(`Heading hierarchy issues in "${title}": ${issues.join('; ')}`);
  }
}

function ensureHeadingIds(html: string): string {
  // Add id attributes to H2/H3 headings that don't have them
  return html.replace(/<h([23])(\s[^>]*)?>(.*?)<\/h[23]>/gi, (match, level, attrs, text) => {
    if (attrs && /\bid=/.test(attrs)) return match; // Already has id
    const plainText = text.replace(/<[^>]+>/g, '').trim();
    const id = plainText
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .substring(0, 60);
    const existingAttrs = attrs || '';
    return `<h${level} id="${id}"${existingAttrs}>${text}</h${level}>`;
  });
}

/** Find disclaimer paragraph index, supporting both CSS class and inline style formats */
function findDisclaimerIndex(html: string): number {
  // New class-based format
  const classIdx = html.indexOf('<p class="ab-disclaimer"');
  if (classIdx !== -1) return classIdx;
  // Legacy inline style format
  const inlineIdx = html.indexOf('<p style="margin:40px 0 0 0; padding-top:20px; border-top:1px solid #eee; font-size:13px; color:#999;');
  return inlineIdx;
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
