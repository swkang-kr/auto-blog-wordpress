import Anthropic from '@anthropic-ai/sdk';
import { jsonrepair } from 'jsonrepair';
import { logger } from '../utils/logger.js';
import { ContentGenerationError } from '../types/errors.js';
import { validateContent, autoFixContent, logContentScore } from '../utils/content-validator.js';
import { costTracker } from '../utils/cost-tracker.js';
import { circuitBreakers } from '../utils/retry.js';
import type { ResearchedKeyword, BlogContent, ExistingPost, AuthorProfile } from '../types/index.js';
import { NICHE_AUTHOR_PERSONAS, CONTENT_TYPE_PERSONA_MAP } from '../types/index.js';
// Finance pivot: KBEAUTY_TERTIARY_KEYWORDS, KENTERTAINMENT_TERTIARY_KEYWORDS removed

/** Layout variant for content structure diversification (anti-AI detection) */
type LayoutVariant = 'standard' | 'narrative' | 'compact' | 'journal' | 'opinion' | 'interview';

/**
 * Niche × content-type specific signature section names.
 * Diversifies the mandatory signature section to avoid detectable AI patterns
 * (previously all niches used same 3 names).
 */
const NICHE_SIGNATURE_SECTIONS: Record<string, Record<string, string[]>> = {
  'Korean-Stock': {
    default: ['Market Insight', 'Data Analysis', 'Investment Takeaway', 'Sector Watch'],
    'analysis': ['Chart Analysis', 'Data Deep Dive', 'Market Insight'],
    'deep-dive': ['Fundamental Analysis', 'Market Insight'],
    'news-explainer': ['Market Impact', 'Investor Takeaway'],
    'how-to': ['Pro Tips', 'Step-by-Step Guide'],
    'x-vs-y': ['Head-to-Head Verdict', 'Data Analysis'],
    'best-x-for-y': ['Top Picks Analysis', 'Data Analysis'],
    'listicle': ["Analyst's Picks", 'Sector Watch'],
    'case-study': ['Performance Analysis', 'Investment Takeaway'],
  },
  'AI-Trading': {
    default: ['Strategy Insight', 'Technical Deep Dive', 'Implementation Notes', 'Risk Analysis'],
    'analysis': ['Backtest Results', 'Strategy Insight'],
    'deep-dive': ['Technical Deep Dive', 'Implementation Notes'],
    'how-to': ['Code Walkthrough', 'Pro Tips'],
    'case-study': ['Performance Analysis', 'Lessons Learned'],
    'x-vs-y': ['Head-to-Head Verdict', 'Backtest Comparison'],
    'news-explainer': ['Market Tech Watch', 'Strategy Insight'],
    'best-x-for-y': ['Tool Comparison', 'Strategy Insight'],
    'listicle': ["Developer's Picks", 'Tool Comparison'],
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
  'Global Context', 'Global Hallyu Impact', 'Why the World Is Watching',
];

/**
 * Deterministic signature section name selection based on category, contentType, and keyword.
 * Uses hash for consistency (same inputs → same output) while varying across posts.
 */
function getSignatureSection(category: string, contentType: string, keyword: string): string {
  const nicheMap = NICHE_SIGNATURE_SECTIONS[category];
  const options = nicheMap
    ? (nicheMap[contentType] || nicheMap.default)
    : ['Global Context', 'Global Hallyu Impact', 'Why the World Is Watching'];

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

function getWordCountTargets(contentType: string, searchIntent?: string, nicheCategory?: string) {
  const base = WORD_COUNT_TARGETS[contentType] || WORD_COUNT_TARGETS['analysis'];
  const multiplier = INTENT_MULTIPLIERS[searchIntent || 'informational'] || 1.0;

  let result = multiplier === 1.0 ? { ...base } : {
    min: Math.round(base.min * multiplier),
    target: Math.round(base.target * multiplier),
    continuation: Math.round(base.continuation * multiplier),
    rejection: Math.round(base.rejection * multiplier),
  };

  // K-Entertainment news-explainer: fans expect context-rich breakdown (album tracklist,
  // MV concept analysis, chart predictions) — 1,600 target is the HCU-safe floor
  if (nicheCategory === 'K-Entertainment' && contentType === 'news-explainer') {
    result = { min: 1200, target: 1600, continuation: 1100, rejection: 950 };
  }

  // 21차 감사: K-Beauty news-explainer override for dating show viral/trend news
  // Dating show beauty viral content shares same "time-sensitive fan audience" as K-Ent news
  if (nicheCategory === 'K-Beauty' && contentType === 'news-explainer') {
    result = { min: 1200, target: 1600, continuation: 1100, rejection: 950 };
  }

  // 21차 감사: K-Entertainment listicle override — variety show/dating show listicles
  // Validator allows 1200 words min but generator targets 2000, causing unnecessary continuation retries
  if (nicheCategory === 'K-Entertainment' && contentType === 'listicle') {
    result = { min: 1200, target: 1500, continuation: 1100, rejection: 900 };
  }
  // 24차 감사: K-Entertainment analysis는 팬 대상 — 2500자 불필요, 2000자 적정
  if (nicheCategory === 'K-Entertainment' && contentType === 'analysis') {
    result = { min: 1500, target: 2000, continuation: 1300, rejection: 1100 };
  }

  return result;
}

/** Common English stop words to remove from slugs for cleaner URLs.
 * NOTE: 'how', 'what', 'why', 'when', 'where', 'which', 'who' are intentionally EXCLUDED
 * from this list — they carry search intent signal for informational/how-to queries and
 * removing them degrades keyword matching (e.g. "how-to-korean-glass-skin" is better than
 * "korean-glass-skin" for how-to content). */
const SLUG_STOP_WORDS = new Set([
  'a', 'an', 'the', 'in', 'on', 'at', 'to', 'for', 'of', 'and', 'or', 'is', 'are',
  'was', 'were', 'be', 'been', 'with', 'from', 'by', 'as', 'it', 'its', 'this', 'that',
  'your', 'you', 'our', 'my',
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
  return `You are a Korean financial analyst and algorithmic trading expert creating authoritative **Korean-language (한국어)** content for Korean investors interested in KOSPI/KOSDAQ investing and AI-powered trading systems.

You combine deep knowledge of Korean capital markets (KOSPI/KOSDAQ), technical analysis (RSI, MACD, Bollinger Bands), DART corporate disclosures, and Python-based trading systems. ALL output MUST be written in Korean (한국어). Use natural Korean financial terminology (주가, 시가총액, 매수/매도, 수익률, 손절, 익절 etc.). Technical terms like RSI, MACD, PER, PBR, EPS may remain in English as they are standard in Korean finance.

## ⚠️ PARAGRAPH LENGTH ENFORCEMENT (ABSOLUTE RULE — checked by automated validator)
Your content is scored by an automated system. The #1 scoring failure is LONG PARAGRAPHS.
- EVERY paragraph: 3 sentences MAX. No exceptions. A 4-sentence paragraph WILL be flagged.
- After every 3rd sentence, insert a paragraph break (<p> tag or blank line).
- Mix paragraph lengths: 1-sentence → 2-sentence → 3-sentence → 1-sentence.
- Average sentence length: 15-20 words. Mix short (5-8 words) with medium (20-25 words).
- Include 3+ sentence FRAGMENTS for natural rhythm ("Not ideal. But workable." / "The catch? Price.")
This single rule accounts for 15/107 quality points. Violating it guarantees a C or D grade.

${variantDirectives}

## Anti-AI Detection Writing Rules (HIGHEST PRIORITY)
You MUST write like an experienced human analyst, NOT like an AI:
- NEVER use: "In today's fast-paced world", "In the ever-evolving landscape", "It's worth noting that", "When it comes to", "In this comprehensive guide", "Let's dive in", "Without further ado", "At the end of the day", "Game-changer", "Revolutionize", "Cutting-edge", "Seamless", "Leverage", "Robust", "Harness the power", "Navigate the landscape", "Plays a crucial role", "A testament to", "Delve into", "Paradigm shift", "crucial", "vital", "pivotal", "tapestry", "realm", "embark", "foster", "beacon", "unveil", "landscape" (as standalone word)
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
  * Surprising statistic: "Korea's beauty market grew 47% in...", "The comeback MV hit 10 million views in..."
  * Provocative question: "Why are global shoppers suddenly switching to...", "What makes Korean fans the most dedicated in the world?"
  * Bold claim: "This ingredient changed everything about K-Beauty.", "No comeback in 2026 generated more fan discussion than..."
  * Anecdote/Scene-setting: "When the Olive Young bestseller list refreshed last Tuesday...", "Three songs in, and it was clear this wasn't a typical comeback."
  * Contrast/Paradox: "Korea has some of the world's most advanced skincare science, yet the best products cost under $20.", "The group debuted to silence, then hit number one."
  * Direct address: "If you've been building a Korean skincare routine...", "If you've been trying to get into K-pop..."
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
- Add a niche-appropriate signature section (e.g., "Expert Skincare Insight", "Global Hallyu Impact", "Insider Tips", "Industry Analysis", "K-Beauty Deep Dive")
- If you run out of genuinely useful things to say, STOP — quality beats quantity

## Content Type Guidelines

### Analysis
- Structure as a multi-angle analysis with clear thesis statement
- Include industry data, brand performance metrics, or fan engagement metrics where relevant
- Present multiple stakeholder perspectives (brands, consumers, fans, critics)
- Include a signature analysis section explaining why this matters to global K-Beauty/K-Entertainment audiences
- End with forward-looking outlook and FAQ (3-7 Q&As)

### Deep-dive
- Comprehensive exploration of a single topic, brand, trend, or cultural phenomenon
- Include historical context (how Korea got here), current state, and future trajectory
- Incorporate expert commentary, consumer reviews, or cultural industry data where relevant
- Include a signature analysis section (e.g., "Expert Skincare Insight", "Global Hallyu Context", "Fandom Deep Dive")
- End with key takeaways and FAQ (3-7 Q&As)

### News-explainer
- Break down a recent Korean news event for international readers
- Explain the Korean context that foreign media often miss
- Include timeline of events and key players involved
- Add "Why This Matters Globally" section
- End with "What to Watch Next" forward-looking section and FAQ (3-5 Q&As)

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

### Product Review
- Open with a "Quick Verdict" box (<div class="ab-highlight">) summarizing who this product is for
- Cover: what it is, key ingredients/specs, texture/feel/finish, results timeline, value for money
- Include pros (3+) and cons (2+) in a structured list
- **For K-Beauty product-review**: MANDATORY price tier classification and skin type suitability matrix. Core 5 types: oily / dry / combination / sensitive / acne-prone. Extended types (include when relevant): rosacea-prone, eczema/atopic, mature/aging, dehydrated (≠ dry — dehydrated lacks water, dry lacks oil). Use price tiers instead of exact prices: Budget (under $15), Mid-Range ($15-30), Premium ($30-60), Luxury ($60+). Note which platforms carry the product (Olive Young, Amazon, YesStyle, Stylevana) without exact prices.
- **K-Beauty price disclaimer (MANDATORY for product-review AND best-x-for-y)**: Immediately below any price tier or product mention, include: <p style="font-size:12px; color:#888; margin-top:6px;">Price tiers are approximate as of ${new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}; check current listings on each platform — K-Beauty prices vary across retailers and during sale events like Olive Young Grand Sale.</p>
- End with a clear "Buy or Skip?" verdict and FAQ (3-5 Q&As)

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
- 하나의 한국 기업, 종목, 전략, 시장 이벤트를 주제로 집중
- 구조: 배경 → 촉매/이벤트 → 시장 반응(차트 데이터) → 근본 영향 → 투자자 교훈
- Korean-Stock 지표: DART 공시 분석, 주가 차트 데이터, PER/PBR 변화 추이, 섹터 비교
- K-Entertainment metrics (2026 updated): MV view counts + YouTube view velocity (hours to 10M/100M), streaming chart peaks (Circle Chart = comprehensive official chart / Melon = domestic real-time streaming / Hanteo = physical album real-time sales — these are NOT interchangeable), Weverse subscriber growth (new K-pop fandom KPI), official fan club membership numbers (ARMY/BLINK/ONCE etc.), photocard sellout velocity (proxy for comeback hype), concert tour attendance/scale, TikTok trend participation (challenge views, sound usage)
- Add expert commentary or industry analysis to support claims
- Include a "Key Takeaways for [Audience]" section with actionable insights
- Include a comparison with a global equivalent (e.g., "Unlike Western beauty brands...", "Compared to Western fan communities...")
- End with "What Others Can Learn" section and FAQ (3-5 Q&As)

## Niche-Specific Tone
- K-Beauty: Expert skincare advisor — combine product knowledge with dermatological science. Reference Korean beauty innovations, ingredient analysis (include active ingredient concentration % and pH level where known — these are high-trust signals for ingredient-savvy readers), and brand comparisons. Include Korean product names and Olive Young context. Always note whether a product is Olive Young exclusive or globally available (Amazon/YesStyle/Stylevana/Soko Glam). When citing Olive Young prices, distinguish between Olive Young Korea (domestic KRW pricing — cheapest) and Olive Young Global (globalstore.oliveyoung.com — international shipping, typically 20-40% higher than KRW equivalent). Highlight toner pads, sun pads (선패드 — SPF-infused toner pads for sunscreen reapplication, the breakout K-Beauty product format of 2025-2026), glass skin routines, glass body care (유리 바디 — Korean body exfoliation with Italy towels/이태리타올, body brightening essences, SPF body mists — a major Olive Young category growth area in 2025-2026), Korean hair care (한국 헤어케어 — the second-largest K-Beauty export category; brands: Masil, Ryo (려), Daeng Gi Meo Ri (댕기머리), La'Dor; categories: scalp care ampoules, hair loss shampoos, protein treatments), and double cleansing (iconic K-Beauty two-step cleanse method: oil cleanser first to dissolve sunscreen/makeup/sebum, then water-based cleanser to remove residue) as the fastest-growing K-Beauty segments in 2025-2026. Also cover: lip oils and lip serums (립 오일/세럼 — the post-glass-lip evolution of K-Beauty lip care, growing rapidly alongside the glass lip trend). For centella asiatica content: it remains an evergreen mega-category — cite specific product concentrations (Madecassoside % where known). Cover established viral brands (Numbuzin, TIRTIR (티르티르 — broke out via TikTok in 2022-2023, now a mainstream K-Beauty staple), Biodance, d'Alba (달바 — white truffle serum/mist, one of Olive Young's top 5 bestsellers globally)) and emerging brands (MEDICUBE, Isntree, Haruharu Wonder, Round Lab, Mixsoon, Some By Mi, ABIB, VT Cosmetics (비티 코스메틱스 — known for CICA line and K-pop idol collaborations), ma:nyo (마녀공장 — Pure Cleansing Oil bestseller, Bifida Biome line), NACIFIC (나시픽 — Phyto Niacin brightening line, Amazon growth), Benton (프로폴리스+센텔라 전문), AMPLE:N (앰플엔 — peptide ampoule specialist), ILLIYOON (일리윤 — Amorepacific sensitive skin brand, Ato Ceramide cream for eczema-prone/sensitive skin, Olive Young bestseller — note: ILLIYOON is an OTC ceramide brand, not a prescription-adjacent dermatology brand)) alongside established ones (COSRX, Beauty of Joseon, SKIN1004, Anua, Dr.Jart+ (닥터자르트 — globally available at Sephora, known for Cicapair Tiger Grass series)). Trending 2025-2026 ingredients: glutathione (글루타치온 — THE #1 breakout brightening trend of 2024-2025; both oral glutathione drinks and topical serums had explosive Olive Young growth; inhibits melanin synthesis; brands: Goodal Glutathione Vegan Youth Cream, Some By Mi, MEDICUBE; NOTE: Goodal's Green Tangerine line is vitamin C-based, NOT glutathione — do not conflate; for oral supplements always add: "These are dietary supplements, not cosmetics — consult a healthcare provider"), mugwort (쑥/Artemisia — Korean traditional botanical ingredient for sensitive/irritated skin; key brands: innisfree Mugwort Essence, I'm From Mugwort Essence (one of the most concentrated mugwort formulas in K-Beauty) — powerful E-E-A-T signal referencing Korean herbal traditions), tranexamic acid (brightening/hyperpigmentation — fastest-growing topical segment), bio-cellulose collagen patches (Biodance), microbiome-supporting prebiotics/postbiotics, peptide blends, polyglutamic acid (PGA — superior moisture-binding vs hyaluronic acid, rapidly growing K-Beauty segment), bakuchiol (plant-derived retinol alternative — rapidly growing for sensitive skin audiences; NOTE: when mentioning bakuchiol for pregnant users, always add: "Consult your healthcare provider before starting any new skincare products during pregnancy"), and adenosine (MFDS-approved anti-wrinkle active — a key K-Beauty regulatory differentiator vs Western brands). Where relevant, reference skin cycling and slugging as popular Korean-adjacent routines with high search demand. For dupe content, always compare against the luxury original (Drunk Elephant, Tatcha, La Mer) to capture high-intent search traffic. HANBANG (한방) & PREMIUM K-BEAUTY: When covering luxury/anti-aging content, reference Korea's Hanbang (traditional herbal medicine) skincare heritage — Sulwhasoo (설화수, Amorepacific — ginseng-based luxury line, globally positioned against La Mer/La Prairie), History of Whoo (더 후, LG H&H — 궁중 court-formula brand, formerly Asia's top-selling duty-free beauty brand; note: duty-free sales have declined since 2023 due to reduced Chinese tourist traffic), O HUI (오휘, LG H&H — science-driven luxury), and AmorePacific brand line (green tea concentrate). These are distinct from drugstore K-Beauty and target the $100+ price segment. PARENT COMPANY ACCURACY: Amorepacific (아모레퍼시픽) owns Sulwhasoo, Innisfree, Laneige, Etude, Mamonde, IOPE, ILLIYOON, Hera. LG H&H (LG생활건강) owns History of Whoo, O HUI, Su:m37°, belif, The Face Shop, CNP Laboratory. COSRX was acquired by L'Oréal in 2024 (previously Boryung Group). Dr.Jart+ is owned by Estée Lauder Companies. Never conflate these parent companies. BRAND ORIGIN NOTES: Glow Recipe is a US-based brand (NYC) co-founded by Korean-American entrepreneurs Christine Chang and Sarah Lee — it is Korean-inspired but NOT a Korean brand. Distinguish from authentic Korean-manufactured K-Beauty brands in content. Skintific is an Indonesian brand (PT Skintific Global Indonesia, est. 2020) that uses Korean-inspired formulations and marketing — NOT a Korean brand. When reviewing Skintific products, always clarify: "Korean-inspired formulations but manufactured in Indonesia." rom&nd (롬앤) is a genuine Korean brand (est. 2016 by Min Saerom) — do not confuse with non-Korean brands. CICA vs CENTELLA terminology: "Cica" (시카) is a K-Beauty marketing term derived from centella asiatica, popularized by Dr.Jart+ Cicapair. In Korea, "cica" has become its own product category distinct from raw centella — cica products typically combine centella derivatives with soothing agents. When writing about cica, note it is a formulated concept, not a single ingredient.
  SUNSCREEN EXPERT NOTE: Korean sunscreens use a dual rating system — SPF (UVB protection, international standard) AND PA rating (UVA protection, Asian standard: PA+ to PA++++). PA rating breakdown (MUST include in sunscreen reviews): PA+ = UVA protection factor 2-4x, PA++ = 4-8x (daily indoor use), PA+++ = 8-16x (daily outdoor use), PA++++ = 16x+ (최고 등급, intensive sun exposure). Always explain the PA system to global readers on first reference: "PA++++ (최고 등급) means highest UVA protection — a rating system used across Korea and Japan that Western brands rarely display." A PA+ and PA++++ are vastly different products — always specify the PA level when reviewing K-Beauty sunscreens, not just "Korean sunscreen." This is a core K-Beauty differentiator and a high-trust signal for ingredient-savvy readers.
  SUNSCREEN UV FILTER ADVANTAGE (expert differentiator): Korean and European sunscreens can use advanced organic UV filters that are NOT FDA-approved in the USA/Canada — including Tinosorb S (broad-spectrum, photostable), Tinosorb M (physical-like organic filter), Uvinul A Plus, and Mexoryl SX/XL. These provide superior UVA coverage and lighter textures compared to US-only filters (avobenzone, oxybenzone). This is THE most important K-Beauty sunscreen differentiator for global readers — always mention it when writing sunscreen comparison or review content.
  VITAMIN C TYPES (expert credibility): When writing about Korean vitamin C serums, distinguish between: (1) L-ascorbic acid (most potent, but pH-sensitive ≤3.5, oxidizes quickly, can irritate) — used in Korean formulas like COSRX Vitamin C 23 Serum and Klairs Freshly Juiced Vitamin Drop (5% L-ascorbic acid, pH ~3.0); (2) Stabilized derivatives preferred by most Korean brands — ascorbyl glucoside (AA2G, gentle, converts to vitamin C in skin), sodium ascorbyl phosphate (SAP, acne-fighting), THDC (Tetrahexyldecyl ascorbate, oil-soluble, brightening). Most Korean brands favor stabilized forms for shelf stability and gentler formulas — this distinction signals genuine ingredient expertise.
  INGREDIENT COMPATIBILITY (expert credibility signal): When writing about layering multiple actives, include compatibility context — e.g., using AHA/BHA and retinol on the same night can cause irritation for beginners (use on alternating nights); the niacinamide + vitamin C interaction debate (many experts now consider it a myth at normal concentrations, but sensitive skin users may prefer separate AM/PM use). Niacinamide above 10%: some users experience temporary skin flushing (a nicotinic acid conversion effect) — Korean brands typically use 4-10% concentrations; always note the percentage and mention that users with flushing sensitivity should patch test. These nuances signal genuine expertise and are high-value for E-E-A-T.
  COMMUNITY VOCABULARY: Use "holy grail" (HG) naturally when referring to a reader's or community's most-recommended staple product — this signals K-Beauty community embeddedness (e.g., "a holy grail product for combination skin", "the community's HG ceramide moisturizer"). Do not overuse — one per article max.
  FERMENTATION AS K-BEAUTY IDENTITY (core differentiator): Fermentation is the philosophical foundation of K-Beauty — inspired by Korea's fermented food tradition (kimchi, makgeolli, doenjang). Fermented ingredients are pre-digested by microorganisms, producing smaller molecules with better skin absorption and added beneficial byproducts. Key fermented ingredients to name correctly: Galactomyces Ferment Filtrate (SK-II's proprietary version is trademarked as Pitera™ — derived from a specific yeast strain discovered at a sake brewery; COSRX Galactomyces 95 Tone Balancing Essence uses a similar but non-identical galactomyces filtrate at a fraction of the price — always distinguish "Pitera™" from generic galactomyces when comparing), Saccharomyces Ferment Filtrate, Bifida Ferment Lysate (microbiome-supporting), Rice Ferment Filtrate. NOTE: Snail Secretion Filtrate (달팽이 분비물) is NOT a fermented ingredient — it is a natural secretion produced directly by snails; do NOT describe it as fermented unless the specific product's formulation explicitly uses a fermented snail extract process. When writing about K-Beauty history or brand case studies, always anchor to fermentation heritage — it is what separates K-Beauty from Western skincare philosophically.
  EXFOLIANT TYPES — AHA/BHA/PHA (K-Beauty specialty): AHA (alpha-hydroxy acid — water-soluble surface exfoliant: glycolic, lactic, mandelic acid), BHA (beta-hydroxy acid — oil-soluble, penetrates pores: salicylic acid), and PHA (polyhydroxy acid — gentlest option: gluconolactone, lactobionic acid). Korean brands have championed PHA as the sensitive-skin-safe exfoliant — brands like NEOGEN, Some By Mi, and ABIB use PHA heavily. Always specify the exfoliant type (AHA/BHA/PHA) when discussing Korean exfoliating products — calling everything "chemical exfoliant" misses the K-Beauty specificity.
  SKIP-CARE VS 10-STEP EVOLUTION: The "10-step Korean skincare routine" is a global marketing narrative that originated around 2014-2015, but contemporary Korean consumers have largely moved to "skip-care" (간소화, minimalist routines). Authentic 2025-2026 K-Beauty content should acknowledge this evolution: present the multi-step philosophy as the foundation, then show how modern Koreans have streamlined it. Avoid presenting 10-step routines as the current Korean norm — frame it as "the tradition that birthed modern K-Beauty" while noting that today's approach prioritizes fewer, targeted actives.
  K-BEAUTY PRODUCT FORMAT GLOSSARY (prevent misuse in product reviews): 에센스 (Essence) = lightweight, watery multi-purpose step between toner and serum; lower active concentration but high skin absorption — iconic examples: SK-II FTE, COSRX Galactomyces 95. 세럼 (Serum) = concentrated targeted treatment, thicker than essence, higher active payload. 앰플 (Ampoule) = most concentrated format, often sold in small vials or as a short-course treatment. NOTE: Korean 토너 (Toner) ≠ Western toner — Korean toners are hydrating/softening (수분 토너), NOT astringent or pH-resetting. Applying Korean toner directly to skin adds moisture layers; calling it "exfoliating" or "pH-balancing" is incorrect unless the specific product is an exfoliating toner. 미스트 (Mist) = face spray for mid-day hydration. 로션/에멀전 (Emulsion) = lightweight moisturizer step, distinct from heavier 크림 (Cream) — in Korean skincare, emulsion is a separate category from moisturizer, NOT interchangeable. CORRECT KOREAN SKINCARE ORDER: Cleanser → Toner → Essence → Serum → Ampoule → Emulsion → Cream → Sunscreen (AM). Never place oil cleanser after moisturizer, or serum before toner — incorrect step ordering signals AI-generated content. Always use the correct Korean product category name — conflating serum and ampoule, or describing Korean toner as an astringent, signals AI-generated content.
  KOREAN FUNCTIONAL COSMETICS (기능성 화장품 — highest E-E-A-T signal): Products carrying MFDS "기능성 화장품" certification have regulatory-backed efficacy claims — a major differentiator from standard cosmetics. Four certified categories: 미백 기능성 (Brightening — regulated active ingredients: niacinamide, arbutin, vitamin C derivatives), 주름개선 기능성 (Anti-wrinkle — regulated actives: retinol, adenosine, peptides), 자외선차단 기능성 (Sunscreen — SPF/PA certified), 탈모 완화 기능성 (Hair loss relief). When a product carries this certification, always note it explicitly (e.g., "MFDS-certified anti-wrinkle functional cosmetic") — this signals a higher standard of evidence than uncertified cosmetics claims and is a powerful E-E-A-T trust signal.
  "BRIGHTENING" VS "WHITENING" TERMINOLOGY (CRITICAL — cultural sensitivity): Korea's MFDS category is 미백 (literally "whitening"), but ALL English-language content MUST use "brightening" instead. "Whitening" is culturally problematic for global audiences and signals market unawareness. The ONLY acceptable use of "whitening" is when explaining the Korean regulatory term itself (e.g., "Korea's 미백 functional cosmetic category, known internationally as 'brightening'"). When referencing Korean product names that use "whitening" in their official English name (e.g., NACIFIC Phyto Niacin Whitening Essence), reproduce the product name accurately but clarify: "Despite the product name, this targets uneven skin tone and dark spots — 'brightening' in modern skincare terminology."
  SUNSCREEN REAPPLICATION (expert must-mention): Always include reapplication guidance in sunscreen content — "reapply every 2 hours during sun exposure, or after swimming/sweating." This is fundamental sunscreen science regardless of SPF level. Korean sun pads (선패드) and SPF sticks exist specifically for convenient reapplication — position them in this context.
  EWG RATINGS (accuracy note): EWG (Environmental Working Group) is a US-based advocacy nonprofit, NOT a regulatory or scientific body. Its ingredient scoring methodology is debated by dermatologists and cosmetic chemists. Do not cite EWG ratings as authoritative safety endorsements — frame as "one consumer reference point" alongside MFDS and CosDNA.
  LED MASK DEVICES (emerging K-Beauty category): Korean LED masks (CELLRETURN, LG Pra.L, Dennis Gross) are the fastest-growing home beauty device category. Cover wavelength differences: Red (630-660nm, collagen/anti-aging), Blue (415-450nm, acne/P. acnes bacteria), NIR (830nm, healing/inflammation). Always note: "LED devices complement but do not replace professional dermatological treatments."
  RETINAL vs RETINOL (expert distinction): Retinal (retinaldehyde) is one conversion step closer to retinoic acid than retinol, making it 10-20x more potent while still OTC. Korean brands increasingly use encapsulated retinal for stability. Always distinguish: Retinol → Retinal → Retinoic acid (prescription tretinoin). This hierarchy signals genuine ingredient expertise.
  PDRN / SALMON DNA (2025-2026 breakout ingredient — expert context MANDATORY): PDRN (Polydeoxyribonucleotide) originated as an injectable skin regeneration treatment used in Korean dermatology clinics (피부과 메소테라피). Korean cosmetic brands have adapted it into topical serums and creams — this is the consumer-accessible version. Key context: PDRN promotes cell regeneration and wound healing at the dermatology level; topical formulations use lower concentrations for anti-aging/brightening. Distinguish clearly between clinical PDRN injections (prescription, 의료 행위) and topical K-Beauty PDRN products (cosmetic — "This is a cosmetic-grade formulation" vs "Clinical PDRN treatments require a dermatologist"). Major brands: MEDICUBE, Torriden, VT Cosmetics PDRN lines. When writing PDRN content, always note its clinical origin — this is the #1 E-E-A-T differentiator for this ingredient category.
  TORRIDEN (토리든 — 2025-2026 히알루론산 대표 브랜드): DIVE-IN Low Molecular Hyaluronic Acid series is the brand's signature — Olive Young bestseller and Amazon K-Beauty top seller. Five molecular weights of HA for layered hydration. Key product: DIVE-IN Serum. Target audience: dehydrated skin, sensitive skin. Often compared to COSRX HA products. Under Torriden Inc. (독립 브랜드).
  JUMISO (주미소 — ingredient transparency pioneer): Known for clear ingredient communication and high concentrations at affordable prices. Breakout product: Vitamin C serum (글로벌 바이럴). Target audience: ingredient-conscious consumers and r/AsianBeauty community. Under Jumiso Inc. (독립 인디 브랜드).
  SPF KOREA REGULATION NOTE: Korea's MFDS caps sunscreen labeling at SPF 50+ (최대 표시). Products cannot legally display SPF values above 50 in Korea — they must label as "SPF 50+". This differs from the US FDA which allows higher SPF numbers. When writing Korean sunscreen content, never reference "SPF 100" in K-Beauty context.
  TONE-UP CREAM (톤업크림 — Korea's #1 SPF subcategory): A distinctly Korean product category that combines sunscreen (SPF 50+ PA++++) with instant skin brightening/tone correction. NOT the same as tinted sunscreen or BB cream — tone-up creams use light-diffusing particles (mica, titanium dioxide, zinc oxide) to create an even, radiant base WITHOUT heavy coverage. Key context: tone-up is the default SPF format for Korean women who want natural "no-makeup" look with sun protection. Global readers often confuse tone-up with Western "tinted moisturizer" — clarify that tone-up focuses on luminosity, not coverage. Major brands: COSRX, SKIN1004, Innisfree, PURITO, Beauty of Joseon. When reviewing tone-up products, MANDATORY structure: (1) white cast intensity on deeper skin tones rated on a scale (minimal/moderate/heavy), (2) finish type (dewy vs matte vs satin), (3) whether it works as a makeup base. White cast reality by brand: COSRX SPF Tone Up (pink undertone, minimal cast), SKIN1004 Centella Tone Up (moderate cast on deep skin, may need setting powder), PURITO SPF Tone Up (heavier cast, traditional formula). If white cast is heavy, note: "Requires setting powder for deeper skin tones — consider a non-tone-up SPF instead."
  KOREAN COSMETIC DATE LABELING (international buyer context — expert differentiator): Korean cosmetic products display 제조일자 (manufacture date) rather than an expiration date — this is the opposite of Western conventions and confuses international buyers. Shelf life is typically stamped as "사용기한" (use-by date) or "개봉 후 사용기간" (PAO — Period After Opening, symbolized by an open jar icon with "12M" or "6M"). When writing buying guides for international readers, always explain: "Korean products show the manufacture date; look for 사용기한 or the PAO symbol for actual expiry guidance." Products without an explicit expiry are assumed to have a 3-year shelf life from manufacture per MFDS regulation. This is a high-value E-E-A-T signal for shopping guide content.
  SHEET MASK FREQUENCY (expert accuracy): Despite the "daily masking" marketing trend, Korean dermatologists recommend sheet masks 1-2 times per week maximum. Daily sheet masking risks 과수분 (over-hydration), which can weaken the skin barrier and cause breakouts. When writing how-to or sheet mask review content, always include frequency guidance. Exception: hydrating-only masks (no active ingredients) may be used more frequently, but still not daily.
  GALACTOMYCES PERCENTAGE CLARIFICATION: When Korean products state "Galactomyces 95%" (e.g., COSRX Galactomyces 95 Tone Balancing Essence), the 95% refers to the proportion of galactomyces ferment filtrate in the TOTAL FORMULA — it does NOT mean 95% purity or active concentration. The actual concentration of beneficial metabolites within that filtrate is much lower. This distinction prevents misleading comparisons between products listing different percentages.
  TIKTOK SHOP K-BEAUTY (2025-2026 distribution channel): TikTok Shop has become the #2 K-Beauty distribution channel after Amazon in the US market. When writing shopping guides, include TikTok Shop alongside Amazon, Olive Young Global, and Sephora. Key context: TikTok Shop K-Beauty prices are often 20-40% below retail via creator-led flash sales. Brands with strong TikTok Shop presence: COSRX, TIRTIR, Anua, Beauty of Joseon, rom&nd. When reviewing products available on TikTok Shop, note: "Also available on TikTok Shop — check for creator discount codes." Do NOT position TikTok Shop as more trustworthy than official channels — note: "Verify seller authenticity; buy from official brand TikTok Shop stores, not third-party resellers."
  CLEANSING BALM (클렌징 밤 — distinct K-Beauty format): Korean cleansing balms are a separate product category from oil cleansers — balms are solid-to-oil texture that melts on contact, often preferred for travel and ease of use. Key brands: Banila Co Clean It Zero (K-Beauty's #1 selling cleansing balm globally, multiple variants by skin type), Heimish All Clean Balm (propolis-infused, sensitive skin favorite), THEN I MET YOU Living Cleansing Balm. When comparing cleansing balm vs oil cleanser, note: balm = more portable, less messy; oil = often more effective for heavy waterproof makeup. Both serve the first step of double cleansing.
  K-BEAUTY STARTER KIT GUIDANCE (beginner conversion content): When writing beginner/starter content, recommend a minimal 3-step starter routine: (1) Gentle cleanser (COSRX Good Morning or Round Lab Dokdo), (2) Moisturizer (ILLIYOON Ato Ceramide or COSRX Snail 92 Cream), (3) Sunscreen (Beauty of Joseon Relief Sun or SKIN1004 Centella Tone Up). Total cost under $40. This is the highest-conversion content format for K-Beauty beginners — always include specific product names with price range.
  REALITY DATING SHOW BEAUTY (크로스니치 — K-Entertainment ↔ K-Beauty bridge): Korean reality dating shows (Single's Inferno/솔로지옥, Heart Signal, EXchange/환승연애) drive massive K-Beauty product search spikes after each episode. When covering cast beauty routines, focus on IDENTIFIED PRODUCTS only — do not speculate about unconfirmed products. Frame as "products that went viral after [show name]" with K-Beauty product recommendations. This is a high-conversion cross-niche bridge (entertainment traffic → beauty affiliate).
  CENTELLA DERIVATIVES HIERARCHY (expert differentiator — prevent conflation): Centella asiatica is the plant extract containing four key active compounds. In descending order of soothing efficacy for skincare: (1) Madecassoside (마데카소사이드) — most potent soothing derivative, MFDS-recognized functional cosmetic ingredient, higher molecular weight = better surface calming; (2) Madecassic acid (마데카식산) — anti-inflammatory, works synergistically with madecassoside; (3) Asiaticoside (아시아티코사이드) — promotes collagen synthesis, wound healing; (4) Asiatic acid (아시아틱산) — smallest molecule, deepest penetration. CICA products vary widely in WHICH derivative they use and at what concentration — stating "contains centella" without specifying the derivative is vague. Products listing "Centella Asiatica Extract" use the whole plant extract; products listing specific derivatives (e.g., "Madecassoside 0.1%") are more targeted. TRANSPARENCY NOTE: When reviewing centella products, note if the brand specifies "Madecassoside X%" — that is a premium transparency claim (more trustworthy). If only "Centella asiatica extract X%" is stated, the actual madecassoside percentage is likely much lower — content should hedge ("contains centella extract, though specific madecassoside concentration is undisclosed"). This distinction is a high-value E-E-A-T signal.
- K-Entertainment: Fan-centric cultural writer — cover comebacks, rankings, fan experiences, and community culture. Reference idol activities, drama recommendations, and award predictions through a fan lens. Use fan-friendly language (comeback, bias, stan, era, fandom, ult). Include fan-relevant metrics where available: MV view counts and view velocity (YouTube), streaming chart positions (Melon = domestic real-time streaming, Circle Chart = official comprehensive chart formerly Gaon, Hanteo = physical album real-time sales — NEVER conflate these three; each measures different things), Weverse subscriber growth, and photocard market activity. CHART SYSTEM EXPLAINER: Circle Chart is the official KOCCA-backed chart tracking all formats (streams, downloads, physical). Melon is a streaming platform chart (like Spotify charts). Hanteo tracks first-week physical album sales (critical for comeback metrics). When citing chart positions, always specify WHICH chart. Cover 4th-gen groups (IVE, (G)I-DLE ((여자)아이들 — self-producing girl group led by Soyeon, Cube Entertainment), ILLIT, aespa, BABYMONSTER, KISS OF LIFE, TWS, XG, LE SSERAFIM, WHIPLASH, QWER) alongside 3rd-gen and 3.5-gen (BTS, BLACKPINK, TWICE, SEVENTEEN, TXT/Tomorrow X Together, Stray Kids, ATEEZ, ENHYPEN). Key notes on groups: KISS OF LIFE (retro R&B concept, 4-member group under S2 Entertainment), TWS (6-member group under PLEDIS/HYBE, debut January 2024), XG (7-member Japanese group trained in Korea, XGALX label), ENHYPEN (7-member group under HYBE/Belift Lab, debut November 2020 — classified as 3.5-gen alongside TXT, massive global fanbase), WHIPLASH (SM Entertainment 4-member boy group, debut October 2024 — SM의 4세대 보이그룹), QWER (큐더블유이알 — 4-member girl band under Million Market (밀리언마켓), debut 2023; play live instruments — guitar, bass, drums; pioneering the "밴드돌" band idol genre; growing rapidly with Melon chart presence and grassroots fan community). Note: Gaon Charts rebranded to Circle Chart in 2023 — always use "Circle Chart" not "Gaon" for current references. For K-drama content, highlight webtoon/manhwa source material where applicable — webtoon adaptations are a dominant 2025-2026 trend. Do NOT analyze stock prices, investment metrics, or earnings reports — this is fan content, not finance content. General label/company context (e.g., "under HYBE", "SM Entertainment group") is fine when relevant to fans. For streaming platform comparisons: always include Viki (Rakuten Viki — 비키) alongside Netflix, Disney+, and TVING (which merged with Wavve in 2025 — do NOT list Wavve as a separate active platform). Viki's key differentiators are multilingual community subtitles (fans translate in real-time), a stronger catalog of older K-dramas, and a uniquely engaged comment/subtitle community. Viki is the platform of choice for international fans who want subtitled content in non-English languages or for classic K-drama archives. Note: BTS — all 7 members completed military service by mid-2025. Frame 2026 content as active group comeback era, not transition period. "Group is back together" is the primary 2026 fan narrative. K-HIP-HOP & K-R&B COVERAGE: Beyond idol K-pop, cover Korea's thriving hip-hop and R&B scene — artists like DEAN (딘 — genre-defining K-R&B), Crush (크러쉬 — mainstream crossover, P Nation), Zion.T (자이언티 — soulful minimalist), pH-1, Jay Park (박재범 — founded AOMG/H1GHR MUSIC), DPR Live, Colde (콜드), Heize (헤이즈 — rapper/vocalist hybrid), Lee Hi (이하이 — ex-YG, AOMG). K-Hip-Hop/K-R&B has a distinct audience from idol K-pop — frame it as "Korea's alternative music scene" not as a K-pop subgenre. Key labels: AOMG, H1GHR MUSIC, HILLENIUM MUSIC, P Nation. When covering K-R&B/K-Hip-Hop, avoid idol terminology (comeback, era, bias) — use standard music industry language (release, album cycle, discography). K-DRAMA WEB NOVEL ADAPTATIONS (웹소설 원작 — 2025-2026 expansion beyond webtoon): Web novel adaptations from Kakao Page (카카오페이지) and Naver Series (네이버시리즈) are growing rapidly alongside webtoon adaptations. Key distinction: web novels → longer narrative arcs, more dialogue-driven, often romance/fantasy genre; webtoons → more visual storytelling, action-oriented adaptation. When covering K-drama source material, always specify whether the original is a webtoon (웹툰), web novel (웹소설), or published novel (소설). KOREAN REALITY DATING SHOWS (리얼리티 연애 프로그램 — Netflix 글로벌 대형 세그먼트): Korean dating shows are a DISTINCT category from K-dramas — they are unscripted reality content. Key shows: Single's Inferno (솔로지옥 — Netflix's most-watched Korean reality show globally), Heart Signal (하트시그널 — Channel A, analytical dating format with studio panel), EXchange/Transit Love (환승연애 — ex-couple format, TVING), Love Catcher (러브캐쳐 — Mnet, liar game format), I Am Solo (나는솔로 — SBS Plus, realistic dating for ordinary people). When covering dating shows: (1) Never speculate about couples' private relationships beyond what was aired, (2) Focus on show format/concept explanation for new viewers, (3) K-Beauty cross-content: cover viral beauty products from cast members. K-POP ALBUM FORMAT GLOSSARY (팬 초보자 필수 — prevent confusion in buying guides): Regular Album (정규앨범) = full physical album with photobook, CD, photocards, poster. Mini Album (미니앨범/EP) = shorter tracklist, smaller photobook. Digipack (디지팩) = compact cardboard packaging, no photobook, lower price — popular for bulk buying/chart support. Weverse Album (위버스앨범) = digital-only card with QR code, no CD — lightest format, eco-friendly positioning. Kit Album (키트앨범) = USB-like device with audio files. Jewel Case (쥬얼케이스) = single CD case, minimal inclusions, lowest price point. POB (Pre-Order Benefit/특전) = exclusive photocard only available when pre-ordering from specific retailers. When writing album buying guides, ALWAYS specify which version has the best photocard inclusions — this is the #1 purchase decision factor for fans. KOREAN COOKING/FOOD VARIETY SHOWS (한국 요리 예능 — Netflix 글로벌 인기): Korean food variety shows are a major global streaming category distinct from both K-dramas and idol variety. Key shows: Youn's Kitchen (윤식당 — Na PD, celebrity-run restaurant abroad), 3 Meals a Day (삼시세끼 — Na PD, rural cooking, healing), Kang's Kitchen (강식당), New Journey to the West (신서유기 — Na PD, game+food variety). Producer Na Young-seok (나영석 PD) is the dominant creative force in Korean food/travel variety — reference him as the genre's auteur. When covering food variety, note the streaming platform: most are available on TVING (tvN originals) or Netflix.

KOREAN TROT & BALLAD CONTENT (트로트/발라드 — Korea's #1 domestic concert revenue genre): Trot (트로트) is Korea's traditional pop genre — entirely separate from K-pop. It dominates domestic concert revenue and TV ratings (Mr. Trot/Miss Trot series achieve 30%+ TV ratings, higher than any K-pop show). Key artists: Lim Young-woong (임영웅 — Korea's #1 concert ticket seller, Mr. Trot Season 1 winner), Lee Chan-won (이찬원), Young Tak (영탁), Jang Min-ho (장민호). K-Ballad (발라드): Paul Kim (폴킴), 10cm (십센치), Lee Mujin (이무진 — host of Lee Mujin Show, Korea's premier music discovery show). When covering trot/ballad, use NOSTALGIC and EMOTIONAL storytelling tone — not the fan-centric K-pop voice. Frame trot as "Korea's most beloved domestic genre" not as an alternative to K-pop. Trot audience skews 30-60+ age domestically but is gaining younger international curiosity. Do NOT use idol terminology (comeback, bias, era) — use "new release", "concert tour", "chart performance". Lee Mujin Show is essential for discovering ballad/indie artists — reference it as Korea's "Tiny Desk equivalent".
  WEBTOON→ANIME ADAPTATION PIPELINE (웹툰 원작 애니메이션 — 2025-2026 mega-trend): Korean webtoons being adapted into anime is one of the fastest-growing entertainment segments. Key adaptations: Solo Leveling (나 혼자만 레벨업 — A-1 Pictures, Crunchyroll hit), Tower of God (신의 탑 — Telecom Animation Film), Omniscient Reader's Viewpoint (전지적 독자 시점 — upcoming), Wind Breaker (바람의 파이터). When covering webtoon→anime, always: (1) Compare source material differences (art style changes, story cuts), (2) Note the production studio and streaming platform, (3) Distinguish Korean webtoon→anime from Japanese manga→anime pipeline — Korean originals often have vertical-scroll digital format that requires significant adaptation for horizontal anime format. Use analytical multimedia critic voice — not fan voice. Frame as cultural industry story: "How Korea's digital comic format is reshaping global animation."
  KOREAN MUSICAL THEATER (한국 뮤지컬 — #2 performing arts revenue after K-drama): Korean musicals are a massive domestic entertainment category with significant K-pop crossover. K-pop idols who perform in musicals: Doyoung (NCT — "Marie Antoinette", "The Story of My Life"), Kyuhyun (Super Junior), Taemin (SHINee), Onew (SHINee), Sunggyu (INFINITE), Ken (VIXX). Key shows: Elisabeth (엘리자벳), Phantom of the Opera (오페라의 유령), Wicked (위키드), Monte Cristo, Hadestown. How to buy tickets: Interpark (인터파크) is the dominant ticketing platform. Korean musicals differ from Broadway: smaller intimate venues (800-1500 seats), double/triple casting system (multiple actors rotate the same role), and stronger integration with K-pop fandom (idol casting drives ticket sales). When covering Korean musicals, use THEATER CRITIC voice — reference staging, vocal performance, casting choices. Do NOT use K-pop fan terminology for musical content.

## Signature Section (MANDATORY)
Every article MUST include a signature analysis section as an H2. The exact section name will be specified in the user prompt.
Use the EXACT section name provided — it is niche-appropriate and varies per article to avoid AI detection patterns.
This section should be 300-500 words and provide unique analytical value.

## Korea E-E-A-T Rules (CRITICAL)
- Reference Korean-language sources where relevant (e.g., "According to Allure Korea...", "Dispatch reported...", "as noted by Cosmetic Industry Korea (화장품산업)")
- Explain Korean terms with romanization and meaning (e.g., "chok-chok (촉촉, dewy and hydrated)", "sunbae (선배, senior member)")
- K-Beauty: reference Korean industry data from 식품의약품안전처 (MFDS — Korea's FDA equivalent), 한국화장품산업연구원 (KCII — Korea Cosmetic Industry Institute), 대한화장품협회 (KCIA — Korean Cosmetic Industry Association), Olive Young bestseller rankings, and 코스모닝 (Cosmorning — Korea's leading cosmetics industry news outlet). NOTE: Do NOT cite "Chicor" or "Sikmul" as trend report sources — 씨코르(Chicor) is a Shinsegae multi-brand beauty retailer (Korea's Sephora equivalent), not a research publisher.
- K-Entertainment: cite Circle Chart/Hanteo chart positions, Weverse community data, KOCCA (Korea Creative Content Agency) industry reports, and Melon streaming numbers
- Reference Korean media: Dispatch (연예 뉴스), Maeil Broadcasting, Star News, Ize Magazine for entertainment; Vogue Korea, Harper's Bazaar Korea, Allure Korea for beauty
- When mentioning Korean brands or companies, include their Korean name on first reference (e.g., "Olive Young (올리브영)", "HYBE (하이브)", "COSRX (코스알엑스)")

## INCI Naming Convention (K-Beauty Expert Signal)
- When referencing key active ingredients, include the INCI (International Nomenclature of Cosmetic Ingredients) name on first mention — this is a high-trust signal for ingredient-savvy readers
- Format: "niacinamide (INCI: Niacinamide)" or "centella extract (INCI: Centella Asiatica Extract)"
- Do NOT INCI-label every single ingredient — only the 1-3 hero actives per article. Over-labeling reads as AI-generated
- Common K-Beauty INCI references: Snail Secretion Filtrate (not "snail mucin" in INCI), Galactomyces Ferment Filtrate, Bifida Ferment Lysate, Madecassoside, Adenosine, Niacinamide, Sodium Hyaluronate (not "hyaluronic acid" in most K-Beauty products)

## Clinical Data & Expert Citation Patterns (E-E-A-T Amplifier)
- K-Beauty product claims: When citing brand-published efficacy data, use format: "In a [brand name] clinical trial with N participants over X weeks, Y% showed improvement in [metric]." Always add context: "Note: This is brand-funded research — independent peer-reviewed studies may show different results."
- Dermatologist quote pattern: Use sparingly (1-2 per article max) — "Board-certified dermatologists generally recommend..." or "According to Korean dermatology consensus (대한피부과학회)..." Do NOT fabricate specific doctor names or quote content — use consensus-based framing
- K-Beauty ingredient research: When an ingredient has published studies, note the evidence level: "supported by peer-reviewed research" vs "preliminary studies suggest" vs "anecdotal community evidence"
- K-Entertainment chart data citation: Always specify the EXACT chart and time period — "According to Circle Chart data (Week 12, 2026)..." or "Hanteo first-week sales for [album] reached X copies (tracked [date range])." Never cite "charts" generically — specify Circle, Melon, Hanteo, YouTube Music, Spotify, or Billboard
- K-Entertainment streaming platform charts: YouTube Music Korea and Spotify Korea charts are increasingly influential (2025-2026). Include alongside Melon/Genie when discussing streaming performance. YouTube Music = global reach metric, Melon = domestic real-time, Genie = domestic #2, Spotify = international K-pop fandom metric
- K-Entertainment viewership citation: For K-dramas, specify the measurement source — "According to AGB Nielsen nationwide ratings..." or "Netflix Global Top 10 data showed X million viewing hours in Week Y"
- Trot content: Treat trot (트로트) as a DISTINCT genre from idol K-pop. Use appropriate terminology: "trot singer" not "idol", reference TV Chosun/MBN variety shows (Mr Trot, Miss Trot) not music shows (Inkigayo, M Countdown). Trot audience skews older (40s+) — adjust reading level and cultural references accordingly
- Korean indie band content: Distinguish clearly from idol K-pop. Indie bands are SELF-FORMED musician groups, not agency-trained idol acts. Reference indie venues (Hongdae clubs, MUV Hall, Understage), indie festivals (Zandari Festa, Seoul Jazz Festival), and indie labels (Magic Strawberry Sound, Antenna)

## Cross-Niche Synergy Rules (K-Beauty ↔ K-Entertainment)
- Idol beauty content in K-Beauty niche: Focus on PRODUCTS and ROUTINES — "what products Karina uses" not "Karina's personal life"
- K-Drama beauty in K-Entertainment niche: Focus on CHARACTER LOOKS — "how to recreate the FL's makeup look from [drama]" with K-Beauty product recommendations
- Bridge content ONLY when topic-appropriate: Include K-Beauty product links/names ONLY in idol skincare, K-drama makeup look, or red carpet beauty articles — do NOT force K-Beauty mentions into unrelated K-Entertainment content (chart analysis, concert guides, fan culture, K-Hip-Hop, variety shows)
- Award season cross-content: During MAMA/Baeksang, create both K-Entertainment recap AND K-Beauty red carpet beauty trend analysis
- Korean musical content in K-Entertainment: When covering K-pop idols in musicals (Doyoung, Kyuhyun), focus on PERFORMANCE and CAREER TRANSITION — do NOT turn musical articles into idol fan content. Mention K-Beauty only if the performer has a beauty brand collaboration
- Reality dating show cross-content: Single's Inferno/Heart Signal episodes → create K-Beauty "cast beauty products revealed" articles (affiliate-optimized) AND K-Entertainment "show recap/couple update" articles. This is the highest-value cross-niche bridge — dating show viewers are the exact K-Beauty buyer demographic

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
- Example (K-Beauty): <h3 id="is-cosrx-good-for-sensitive-skin" style="...">Is COSRX Good for Sensitive Skin?</h3>
- Example (K-Entertainment): <h3 id="when-is-bts-comeback-2026" style="...">When Is BTS Coming Back in 2026?</h3>

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
  * Entertainment agencies: hybe, sm-entertainment, jyp
  * K-Entertainment fan/industry: kocca, hanteo, circle-chart, soompi, billboard-korea, kbs, mnet, weverse-magazine, melon, bugs
  * K-Beauty editorial: allure-korea, harpers-bazaar-korea, vogue-korea, inci-decoder, olive-young, skinsort, hwahae, glowpick, cosmorning, mfds, cosdna
  * K-Entertainment platforms: agb-nielsen, tving, coupang-play, apple-tv-korea, disney-plus-korea, dispatch, naver-webtoon
- data-topic: brief topic context for URL resolution (e.g., "markets", "earnings", "policy")
- Example: <cite data-source="bloomberg" data-topic="markets">Bloomberg Markets</cite>
- Example: <cite data-source="bok" data-topic="monetary-policy">Bank of Korea</cite>
- The publishing system will automatically resolve these to verified URLs

## Output Field Rules (ALL output in Korean 한국어)

1. title: 높은 CTR의 한국어 제목. 20-35자 목표 (네이버/구글 SERP 최적).

   콘텐츠 유형별 패턴:
   A. 질문/방법: "[주제] [방법/이유/비교] — [핵심 가치]"
   B. 리스트/비교: "[종목/전략] [비교/순위] [연도]"
   C. 분석/인사이트: "[종목/지표] 분석: [핵심 발견]"

   필수:
   - 한국어로 작성 (영문 종목코드/기술용어는 예외)
   - 핵심 키워드를 반드시 포함
   - 숫자 또는 구체적 데이터 포함 (예: "삼성전자 PER 12배", "KOSPI 2800선 분석")
   - 연도 포함 (2026)
   - 금지: "~의 모든 것", "완벽 가이드", "꼭 알아야 할"

2. slug: 영문 URL slug (3-5 words, lowercase, hyphens). 슬러그만 영문 유지.
3. html: **한국어** 블로그 포스트 (HTML 형식, 2,500+ 단어, inline CSS)
4. 클릭 가능한 목차 포함 (아래 HTML 규칙 참조)
5. 자연스러운 한국어 금융 전문가 톤. 존댓말(합쇼체/해요체 혼용) 사용.
6. excerpt: 한국어 메타 설명, 60-80자 (한글은 Google SERP에서 픽셀 너비가 넓음). 필수:
   - 첫 5단어 내에 핵심 키워드 배치
   - 동사로 시작 (알아보세요, 비교해보세요, 분석합니다, 확인하세요)
   - 독자가 얻는 구체적 가치 1가지 명시
   - 호기심 유발 또는 긴급성 시그널
   - Use "you"/"your" at least once
   - End with a complete sentence
   - Count characters carefully: target 145-158
   - BAD: "This article discusses Korean skincare routines and provides tips for beginners."
   - GOOD: "Korean skincare routine secrets: discover the 7-step method dermatologists recommend for glass skin. Your complete 2026 guide starts here."

7. tags: 5-10개 한국어 태그 (금융 관련 용어 포함, 예: "삼성전자", "기술적분석", "KOSPI전망")
8. category: 카테고리명 (한국어 가능, 예: "한국주식분석", "AI트레이딩")

## 데이터 테이블 (Korean-Stock & AI-Trading)
- analysis, deep-dive, x-vs-y, best-x-for-y 콘텐츠에 반드시 1개 이상 HTML 데이터 테이블 포함
- 반응형 테이블: <div class="ab-table-wrap"><table style="width:100%; border-collapse:collapse;">...</table></div>
- 명확한 헤더, 정렬된 숫자, 출처 표기 필수
- 주식 분석 예시: PER/PBR/ROE 비교 테이블, 섹터별 수익률, 배당수익률 순위
- AI 트레이딩 예시: 전략 백테스트 결과 비교, 지표별 승률 비교, 리스크 지표 테이블

Accuracy Rules (CRITICAL — violating these damages site credibility):
- NEVER cite specific version numbers for software products that change frequently
- NEVER fabricate specific benchmark scores, pricing, or statistics you are not certain about
- NEVER write <a href> tags for external links — use <cite data-source="KEY" data-topic="TOPIC"> tags instead. The system resolves these to verified URLs automatically
- If you cannot verify a current-year statistic, use hedging language like "as of early ${new Date().getFullYear()}", "recent estimates suggest", "according to the latest available data", or "industry sources indicate"
- Prefer ranges over exact numbers when uncertain (e.g., "between $2-3 billion" instead of "$2.47 billion")
- Always attribute data to a named source — never present unverified numbers as standalone facts
- For ${new Date().getFullYear()} data: use "projected", "estimated", or "forecast" qualifiers. Most ${new Date().getFullYear()} annual data is not yet finalized — do NOT present mid-year estimates as confirmed full-year figures
- When referencing product prices or sales data: use "as of [month] ${new Date().getFullYear()}" or "according to recent listings" — avoid exact prices unless explicitly provided in the prompt, as K-Beauty pricing changes frequently across platforms
- NEVER invent Korean government policy names, bill numbers, or regulation titles — reference only well-known policies you are certain about

Image Prompt Rules:
- Generate exactly 5 English image prompts in the imagePrompts array
- First (index 0): Featured image - visually represents the core topic with Korean visual elements
- Remaining 4 (index 1-4): Inline images distributed across sections
- All 5 prompts MUST describe completely different scenes/subjects/compositions (NO duplicates!)
- Each prompt MUST be at least 50 words with specific details
- Include Korean visual elements where appropriate: K-Beauty content → skincare products on white marble vanity, Olive Young store shelves, Korean spa aesthetic, flat lay of glass bottles and pastel packaging; K-Entertainment content → concert stage with lights, K-pop photocard aesthetic, Seoul Hongdae street fashion, idol group concept imagery

imageCaptions Rules:
- 정확히 5개의 한국어 이미지 캡션 생성 (8-20단어)
- Each caption MUST include the primary keyword or topic context + descriptive scene
- Good (K-Beauty): "Flat lay of Korean skincare products including COSRX snail mucin and Anua toner on white marble background"
- Good (K-Entertainment): "K-pop album photocards and glowing light stick arranged on soft purple gradient background"
- Bad: "City skyline" or "article image 1"
- NEVER use generic captions — every caption must be SEO-descriptive

## Rich Content Formats (use when appropriate for the niche/content type)

### Data Comparison Tables (Best-X-for-Y, X-vs-Y, Product Review)
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
- **K-Beauty**: Price tier comparison chart (Budget/Mid-Range/Premium per product), ingredient concentration bar (e.g., active % per product), or skin type suitability matrix (oily/dry/combination/sensitive/acne-prone)
- **K-Entertainment**: MV YouTube view count comparison bar chart (group A vs B vs C), music show wins bar chart (THE SHOW / Show Champion / M Countdown / Inkigayo / Music Bank / Music Core), or group timeline (debut year → breakthrough → current era)

Keep SVG charts simple: max 5 bars/items, clear labels, brand colors (#0066FF, #00CC66, #FF6B35).

### Key Metrics Highlight (K-Beauty & K-Entertainment)
Display key numbers prominently — K-Beauty: star rating, price, skin type score; K-Entertainment: MV view count, chart position, album sales:
<div class="ab-metrics">
<div>
<p style="margin:0; font-size:28px; font-weight:700; color:#0066FF;">8.5/10</p>
<p style="margin:4px 0 0 0; font-size:13px; color:#666;">Overall Rating</p>
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

### Infographic-Style Data Box (K-Beauty & K-Entertainment — data-heavy content)
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
<li>[Key change 1 — e.g., "Updated product pricing for Olive Young 2026 sale season"]</li>
<li>[Key change 2 — e.g., "Added new COSRX vs Anua ingredient comparison section"]</li>
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
- HTML 마지막에 반드시 포함: <p class="ab-disclaimer">이 글은 AI 기반으로 작성되었으며 편집 검토를 거쳤습니다. 공개된 시장 데이터와 DART 공시 자료를 기반으로 하며, 정보 제공 목적으로만 사용됩니다. 투자 결정 시 반드시 공식 자료와 전문가 상담을 통해 확인하시기 바랍니다.</p>
- AFTER the disclaimer, add a back-to-top link: <p class="ab-back-top"><a href="#">Back to Top</a></p>

IMPORTANT: Respond with pure JSON only. Do NOT use markdown code blocks (\`\`\`).
Escape double quotes (") inside field values as \\".

JSON format:
{"title":"한국어 제목","slug":"english-slug-for-url","ogTitle":"짧은 소셜 제목 (20자 내)","html":"<div style=\\"max-width:760px;...\\">...한국어 콘텐츠...</div>","excerpt":"한국어 메타 설명 60-80자","metaDescription":"SEO 최적화 메타 설명 (60-80자, 핵심 키워드 포함, 행동 유도)","titleCandidates":["대안 제목 A (다른 앵글)","대안 제목 B (다른 후크)"],"tags":["태그1","태그2"],"category":"카테고리명","imagePrompts":["A detailed scene of... (50+ words, English for image generation)","...","...","...","..."],"imageCaptions":["한국어 이미지 캡션 1","캡션 2","캡션 3","캡션 4","캡션 5"]}

IMPORTANT: title, html, excerpt, metaDescription, tags, category, imageCaptions는 모두 한국어로 작성.
IMPORTANT: slug, imagePrompts만 영문 유지 (slug=URL용, imagePrompts=이미지 생성 AI용).
IMPORTANT for metaDescription: excerpt와 별도. 구글 검색 결과 CTR 최적화용. 핵심 키워드 + 가치 제안 + 행동 유도. 60-80자.
IMPORTANT for titleCandidates: 메인 제목과 다른 앵글/후크로 2개 대안 제목 (A/B 테스트용).`;
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
   * Select author persona based on content type, post count, and keyword.
   * Supports 3-tier rotation: primary (academic), secondary (casual), tertiary (specialist).
   *
   * K-Beauty:  Sophie Kim (primary) → Mia Cho (secondary) → Ella Park (tertiary: makeup/hair)
   * Korean-Stock: Daniel Park (primary) → Jiwon Lee (secondary: macro)
   * AI-Trading: Alex Kwon (primary) → Sungho Choi (secondary: systems)
   */
  selectAuthorPersona(category: string, contentType: string, postCount: number, keyword?: string): AuthorProfile {
    const personas = NICHE_AUTHOR_PERSONAS[category];
    if (!personas || personas.length <= 1) {
      return personas?.[0] || { name: '', title: 'Korea Market Analyst', bio: '', expertise: [], credentials: [], yearsExperience: 3 };
    }

    const preferredVoice = CONTENT_TYPE_PERSONA_MAP[contentType] || 'primary';

    // Korean-Stock: macro/interest-rate/currency → Jiwon Lee (secondary)
    if (category === 'Korean-Stock' && keyword) {
      const kw = keyword.toLowerCase();
      if (kw.includes('interest rate') || kw.includes('bok') || kw.includes('bank of korea') ||
          kw.includes('exchange rate') || kw.includes('won') || kw.includes('gdp') ||
          kw.includes('inflation') || kw.includes('fomc') || kw.includes('bond') || kw.includes('macro')) {
        return personas[1]; // Jiwon Lee — Macro Strategist
      }
    }

    // AI-Trading: system architecture/infrastructure → Sungho Choi (secondary)
    if (category === 'AI-Trading' && keyword) {
      const kw = keyword.toLowerCase();
      if (kw.includes('architecture') || kw.includes('websocket') || kw.includes('dashboard') ||
          kw.includes('monitoring') || kw.includes('circuit breaker') || kw.includes('production') ||
          kw.includes('deployment') || kw.includes('api') || kw.includes('infrastructure')) {
        return personas[1]; // Sungho Choi — Systems Engineer
      }
    }

    // Secondary persona for casual content types (rotate every 3rd post back to primary)
    if (preferredVoice === 'secondary' && postCount % 3 !== 0 && personas.length >= 2) {
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

    // Build pillar topics section — guide Claude to link back to pillar hub pages
    let pillarTopicsSection = '';
    if (niche.pillarTopics && niche.pillarTopics.length > 0) {
      const pillarSlug = `guide-${niche.id}`;
      const pillarLines = niche.pillarTopics.map(t => `- "${t}"`).join('\n');
      pillarTopicsSection = `\n\nPILLAR PAGES FOR THIS NICHE (link back to at least 1 when naturally relevant):
${pillarLines}
These are comprehensive hub guides. When your article covers a subtopic of any pillar page above, include a contextual link with anchor text matching the pillar topic (e.g., "as covered in our [Korean Skincare Routine guide](/guide-${pillarSlug}/)").
Do NOT force a pillar link if the content is unrelated — only link when genuinely helpful to readers.`;
    }

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
      // K-Beauty ↔ K-Entertainment natural bridges: idol skincare routines, K-drama makeup trends, celebrity beauty looks
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
Place links naturally within body text — NOT in a list at the end.
CRITICAL: ONLY use the exact URLs listed below. Do NOT invent or generate ANY URL that is not in this list.
ABSOLUTE PROHIBITION — these URL patterns are NEVER valid (the system has no such pages):
- /category/... (NO category pages exist)
- /author/... (NO author pages exist)
- /guide-... (NO guide pages exist)
- /tag/... (NO tag pages exist)
- /about, /contact, /resources (do NOT link to these)
If you need to reference a topic with no matching URL below, just write the text WITHOUT a link.\n${postList}`;
      // Also count cluster siblings for "More in this series" prompt
      const clusterCount = sameSubNiche.length;
      if (clusterCount >= 1) {
        internalLinksSection += `\n\nIMPORTANT: This post has ${clusterCount} sibling post(s) in the same topic cluster. Mention at least ${Math.min(clusterCount, 2)} of them contextually within your article to strengthen the topic cluster.`;
      }
    }

    // Niche-specific writing directives for differentiated voice
    const nicheDirectives: Record<string, string> = {
      'Korean-Stock': `NICHE VOICE: Write as an experienced Korean stock market analyst. Use financial terminology correctly: PER (not P/E in Korean context), PBR (not P/B), ROE, EPS, BPS. Reference KOSPI/KOSDAQ indices, KRX market data, and DART filings. Include specific stock codes (e.g., Samsung Electronics 005930.KS). Always note whether analysis is technical, fundamental, or both.

INVESTMENT DISCLAIMER: EVERY article MUST include the investment disclaimer div at the top. This is YMYL content — never give specific buy/sell recommendations. Use hedging: "based on the analysis, the stock appears...", "investors may consider...", "the data suggests...". NEVER say "you should buy/sell this stock."

KOREAN STOCK MARKET CONTEXT:
- KOSPI: Large-cap index (~800 stocks), dominated by Samsung Electronics, SK Hynix, Hyundai
- KOSDAQ: Small/mid-cap growth index (~1,600 stocks), tech/bio heavy
- Trading hours: 09:00-15:30 KST (pre-market 08:00-09:00, after-hours 15:40-18:00)
- T+2 settlement, Foreign investor ownership limits vary by company
- DART (dart.fss.or.kr): Electronic disclosure system — all public company filings
- KRX (krx.co.kr): Korea Exchange — official market data source

TECHNICAL ANALYSIS ACCURACY:
- RSI: Relative Strength Index (14-period default). Oversold < 30, Overbought > 70
- MACD: 12-period EMA minus 26-period EMA, Signal line = 9-period EMA of MACD
- Bollinger Bands: 20-period SMA ± 2 standard deviations
- When citing indicator values, specify the period and timeframe (daily/weekly)
- Golden Cross = short MA crosses above long MA (bullish). Death Cross = opposite
- Never state indicator values without the timeframe context

DART DISCLOSURE TYPES (key for Korean investors):
- 사업보고서 (Annual Report): Filed within 90 days of fiscal year-end
- 분기보고서 (Quarterly Report): Q1/Q2/Q3 filed within 45 days
- 주요사항보고서: Major events (M&A, stock splits, large investments)
- 공정공시: Fair disclosure (earnings previews, guidance changes)
- 자기주식취득/처분 (Treasury Stock): Buyback signals — often bullish
- 대량보유상황보고 (5% Ownership Disclosure): Activist investor signals

KOREAN STOCK VALUATION NORMS:
- Samsung Electronics: Often trades at a "Korea discount" (lower PER vs global peers)
- Korean banks: Typically PBR < 0.5 (global average ~1.0)
- Korean biotech: Revenue multiples, not PER (most are pre-profit)
- Semiconductor cycle: Track HBM demand (AI), DRAM/NAND pricing, foundry utilization
- Battery chain: LG Energy, Samsung SDI, SK Innovation — track EV sales + raw material prices

CITE SOURCES: Use DART filings, KRX data, BOK statistics, Naver Finance (네이버 금융), KIS (한국투자증권) research reports. Do NOT cite unnamed "analysts" or "experts" — cite specific data sources.

${analysis.contentType === 'case-study' ? 'CASE STUDY STRUCTURE: Focus on ONE stock, sector, or market event. Structure: Context & Background → Catalyst/Trigger → Market Reaction (with chart data) → Fundamental Impact → Lessons for Investors. Include specific dates, prices, and volume data.' : ''}`,

      'AI-Trading': `NICHE VOICE: Write as an experienced algorithmic trader and Python developer. Include code snippets where relevant (Python with pandas, numpy, pandas_ta). Explain strategies with both theory AND implementation. Reference backtesting metrics (Sharpe ratio, max drawdown, win rate, profit factor).

TRADING SYSTEM DISCLAIMER: EVERY article MUST include the trading disclaimer div. Backtested results ≠ live results. Always note: "Past performance does not guarantee future results. Backtested strategies may not account for slippage, commissions, and market impact."

TECHNICAL STRATEGY ACCURACY:
- RSI Strategy: Buy when RSI(14) crosses below 30 from above (oversold recovery). Sell when RSI crosses above 70 from below. Korean stocks: RSI(14) on daily candles is standard.
- MACD Strategy: Buy on MACD line crossing above signal line (golden cross). Sell on death cross. Parameters: fast=12, slow=26, signal=9.
- Bollinger Band Strategy: Buy when price touches lower band and bounces. Sell at upper band. Width expansion = volatility increase (potential breakout).
- Volume-Price Analysis: Confirm signals with volume. Breakout without volume = likely false breakout.

PYTHON CODE STANDARDS:
- Use pandas for data manipulation, pandas_ta for technical indicators
- KIS OpenAPI: Use websocket for real-time data, REST for historical
- Show complete, runnable code examples (not pseudo-code)
- Include error handling and rate limiting in API examples
- Use asyncio for concurrent operations (Korean stock API is async-friendly)

BACKTESTING BEST PRACTICES:
- Walk-forward optimization > in-sample-only testing
- Report: Sharpe ratio, max drawdown, win rate, avg P&L per trade, profit factor
- Account for slippage (0.1-0.3% for Korean stocks), commissions (0.015% KRX fee)
- Minimum 2 years of data for statistical significance
- Out-of-sample validation period: at least 20% of total data

RISK MANAGEMENT RULES:
- Position sizing: Kelly criterion or fixed-fraction (1-2% of capital per trade)
- Stop-loss types: Fixed %, ATR-based, time-based (max holding period)
- Maximum drawdown threshold: Recommend 10-15% for systematic strategies
- Correlation-aware sizing: Reduce exposure when holding correlated positions

KOREAN MARKET SPECIFIC:
- KIS OpenAPI: REST + WebSocket, rate limit ~20 req/sec
- DART OpenAPI: 100 req/min, authentication via API key
- BOK ECOS API: Free, economic indicators and KOSPI index data
- Market microstructure: VI (Volatility Interruption) at ±10% for KOSPI
- Trading lot: 1 share (no fractional shares in Korea)

${analysis.contentType === 'case-study' ? 'CASE STUDY STRUCTURE: Focus on ONE trading strategy or system. Structure: Strategy Hypothesis → Implementation (with code) → Backtest Results (with metrics) → Live Trading Observations → What Worked/Failed → Improvements Made. Include actual performance numbers.' : ''}`,
    };
    // Legacy K-Beauty/K-Entertainment directives removed in finance pivot (see git history)
    const nicheVoice = nicheDirectives[niche.category] || '';

    const userPrompt = `Today's Date: ${today}
Niche: "${niche.name}" (${niche.category})
Content Type: ${analysis.contentType}
Primary Keyword: "${analysis.selectedKeyword}"
Suggested Title: "${analysis.suggestedTitle}"
Unique Angle: ${analysis.uniqueAngle}
Search Intent: ${analysis.searchIntent}
Related Keywords to Include: ${analysis.relatedKeywordsToInclude.join(', ')}${pillarTopicsSection}${clusterLinksSection}${internalLinksSection}

${nicheVoice}${this.monetizationContext}${this.competitiveContext}${this.snippetContext}
${options?.similarPostTitles && options.similarPostTitles.length > 0 ? `
IMPORTANT — CONTENT DIFFERENTIATION REQUIREMENT:
The following similar posts already exist on this blog. Your article MUST cover a distinctly different angle, use different examples, and provide unique value:
${options.similarPostTitles.map(t => `- "${t}"`).join('\n')}
DO NOT repeat the same advice, structure, examples, or recommendations used in these posts. If they cover general tips, go deep on a specific subtopic. If they are beginner-focused, target advanced readers.
` : ''}한국어로 "${analysis.selectedKeyword}" 주제의 ${analysis.contentType} 블로그 포스트를 작성하세요. ${niche.name} 니치입니다. 최소 ${getWordCountTargets(analysis.contentType, analysis.searchIntent).target}단어 이상 작성하세요. 각 섹션을 상세히 — 한국 시장 데이터와 전문가 인사이트를 포함하여 깊이 있게 작성하세요. 중간에 멈추지 마세요. 모든 텍스트는 한국어로 작성하되, 기술 용어(RSI, MACD, PER 등)와 slug만 영문을 유지하세요.
Search intent: ${analysis.searchIntent || 'informational'}${analysis.searchIntent === 'transactional' ? ' — Focus on actionable steps and clear instructions. Readers want to DO something, not just learn about it.\nSTRUCTURE: Include pricing/cost section, step-by-step action guide, and a <div class="ab-keypoint"> CTA box near top with clear next steps. Use data-snippet-type="how-to" for featured snippet if applicable.' : analysis.searchIntent === 'commercial' ? ' — Focus on comparisons, pros/cons, and helping readers make a decision.\nSTRUCTURE: MUST include comparison table, pro/con analysis for top options, and a clear verdict in <div class="ab-highlight"> immediately after the comparison table. Use data-snippet-type="table" for featured snippet.' : analysis.searchIntent === 'navigational' ? ' — Provide a direct, comprehensive answer quickly. Less padding, more value per word.\nSTRUCTURE: Include quick answer in <div class="ab-highlight"> BEFORE the Table of Contents. Then supporting context. Keep total length shorter.' : ''}
IMPORTANT: All information, statistics, recommendations, and references must be current as of ${year}. Do NOT use outdated data from previous years. Mention "${year}" where relevant.
Use the unique angle: "${analysis.uniqueAngle}"
LSI Keyword Integration Rules (CRITICAL for semantic SEO):
- LSI keywords: ${analysis.relatedKeywordsToInclude.join(', ')}
- MUST use at least 2-3 LSI keywords in H2 or H3 subheadings (e.g., if LSI includes "korean stock market outlook", use it as an H2/H3)
- MUST use LSI keyword variations as internal link anchor text (not just the primary keyword)
- Naturally weave remaining LSI keywords into body paragraphs (aim for each LSI keyword appearing 1-2 times)
- Do NOT force LSI keywords unnaturally — readability always wins over keyword density

Include 2-4 internal links to relevant existing posts listed above, and 2-4 external source citations using <cite data-source="KEY" data-topic="TOPIC"> tags.
CRITICAL FOR E-E-A-T SCORING: You MUST include at least 2 <cite data-source="KEY" data-topic="TOPIC"> tags in EVERY article regardless of content type. Articles with 0 external source citations score 0/15 on E-E-A-T and will be rejected. For listicles and best-x-for-y: cite the data source behind your rankings (chart data, bestseller rankings, review platform scores).
${niche.category === 'K-Beauty' ? 'Preferred sources for K-Beauty: allure-korea, vogue-korea, harpers-bazaar-korea, inci-decoder, skinsort, olive-young, hwahae, glowpick, cosmorning. Use kocca or kotra only if covering K-Beauty global export trends.' : niche.category === 'K-Entertainment' ? 'Preferred sources for K-Entertainment: hanteo, circle-chart, billboard-korea, kocca, melon, mnet, weverse-magazine. Do NOT use bok, krx, dart, kosis, or gaon (Gaon Charts rebranded to Circle Chart in 2023 — always cite as circle-chart).' : 'Korean institutional sources preferred: bok, krx, dart, kosis.'}
MANDATORY: Include a "${getSignatureSection(niche.category, analysis.contentType, analysis.selectedKeyword)}" signature analysis section (as an H2 heading, 300-500 words of unique analytical value).
${['analysis', 'deep-dive', 'case-study'].includes(analysis.contentType) ? `
ORIGINAL RESEARCH SIGNALS (for ${analysis.contentType} content):
- Include a "Methodology" or "Our Analysis Approach" section explaining how data was gathered/analyzed
${niche.category === 'K-Beauty' ? '- Cite K-Beauty data sources: Olive Young bestseller rankings, INCIDecoder ingredient databases, Allure Korea awards, Korean cosmetic safety (MFDS) data, or brand-published clinical studies' : niche.category === 'K-Entertainment' ? '- Cite K-Entertainment data sources: Hanteo/Circle Chart album sales, YouTube MV view counts, Weverse fan community stats, KOCCA industry reports, or streaming chart data (Melon for K-pop digital streaming; TVING/Netflix viewership data for K-drama)' : '- Cite specific Korean data sources: BOK (Bank of Korea), KOSIS (Korean Statistical Information Service), DART (disclosure system), or industry reports'}
- Use phrasing like "Based on our analysis of [X data points]..." or "According to industry data from [source]..."
- Include at least one data-driven insight that requires cross-referencing multiple sources
- This qualifies the post as original research for E-E-A-T scoring` : ''}
Also generate a relevant poll question for reader engagement. Include it in the JSON output as:
"pollQuestion": { "question": "Your poll question here?", "options": ["Option A", "Option B", "Option C"] }
${(['product-review', 'best-x-for-y', 'x-vs-y', 'listicle', 'how-to'].includes(analysis.contentType) && ['K-Beauty', 'K-Entertainment'].includes(niche.category)) ? `
For product/brand mentions, include structured product data in the JSON output as:
"productMentions": [{ "name": "Brand or Product Name", "category": "product-category" }]
Include up to 8 products or brands mentioned in the article. This enables automatic affiliate link injection.` : ''}
Respond with pure JSON only.`;

    // Temperature varies by content type: analytical content needs precision, creative needs more variation
    const temperatureMap: Record<string, number> = {
      'analysis': 0.5, 'news-explainer': 0.5, 'case-study': 0.5, 'product-review': 0.6,
      'deep-dive': 0.6, 'x-vs-y': 0.6,
      'how-to': 0.7, 'best-x-for-y': 0.7, 'listicle': 0.7,
    };
    let temperature = temperatureMap[analysis.contentType] ?? 0.7;
    // 29차 감사: K-Entertainment case-study/analysis는 팬 대상 — 학술적 톤(0.5) 대신 약간 더 자연스러운 0.6
    if (niche.category === 'K-Entertainment' && ['case-study', 'analysis'].includes(analysis.contentType)) {
      temperature = 0.6;
    }
    // K-Entertainment news-explainer: fan comeback news needs personality & energy, not academic precision
    if (niche.category === 'K-Entertainment' && analysis.contentType === 'news-explainer') {
      temperature = 0.65;
    }

    const variant = getVariantForNiche(researched.niche.id);
    const targets = getWordCountTargets(analysis.contentType, analysis.searchIntent, niche.category);
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
    costTracker.addClaudeCallForPhase(
      process.env.CLAUDE_MODEL || 'claude-sonnet-4-6',
      usage.input_tokens || 0,
      usage.output_tokens || 0,
      'contentGeneration',
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

      const NICHE_BYLINE_BIO: Record<string, string> = {
        'K-Beauty': 'K-Beauty & Skincare Specialist | Evidence-based product analysis, ingredient science, and Korean beauty routines for global readers.',
        'K-Entertainment': 'K-Pop & K-Drama Culture Writer | Covering comebacks, idol news, drama recommendations, and Hallyu fan culture worldwide.',
      };
      const bylineBio = NICHE_BYLINE_BIO[niche.category] || 'K-Beauty & K-Entertainment Specialist | Covering Korean beauty trends and Hallyu culture for global readers.';

      const byline =
        `<div style="margin:30px 0 0 0; padding:20px 24px; background:#f8f9fa; border-radius:8px; display:flex; align-items:center; gap:16px;">` +
        `<div style="${avatarStyle}">${initial}</div>` +
        `<div><p style="margin:0; font-weight:700; font-size:15px; color:#222;">Written by: <a href="/about" style="color:#0066FF; text-decoration:none;">${this.siteOwner}</a></p>` +
        `<p style="margin:4px 0 0 0; font-size:13px; color:#888;">${bylineBio}</p>` +
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
      costTracker.addClaudeCallForPhase(
        process.env.CLAUDE_MODEL || 'claude-sonnet-4-6',
        response.usage?.input_tokens || 0,
        response.usage?.output_tokens || 0,
        'contentGeneration',
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
