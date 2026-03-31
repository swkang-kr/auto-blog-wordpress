import Anthropic from '@anthropic-ai/sdk';
import { jsonrepair } from 'jsonrepair';
import { logger } from '../utils/logger.js';
import { ContentGenerationError } from '../types/errors.js';
import { validateContent, autoFixContent, logContentScore } from '../utils/content-validator.js';
import { costTracker } from '../utils/cost-tracker.js';
import { circuitBreakers } from '../utils/retry.js';
import type { ResearchedKeyword, BlogContent, ExistingPost, AuthorProfile } from '../types/index.js';
import { NICHE_AUTHOR_PERSONAS, CONTENT_TYPE_PERSONA_MAP } from '../types/index.js';
// Finance pivot: KOREANSTOCK_TERTIARY_KEYWORDS, AITRADING_TERTIARY_KEYWORDS removed

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
  'Market Insight', 'Data Analysis', 'Investment Takeaway',
];

/**
 * Deterministic signature section name selection based on category, contentType, and keyword.
 * Uses hash for consistency (same inputs → same output) while varying across posts.
 */
function getSignatureSection(category: string, contentType: string, keyword: string): string {
  const nicheMap = NICHE_SIGNATURE_SECTIONS[category];
  const options = nicheMap
    ? (nicheMap[contentType] || nicheMap.default)
    : ['Market Insight', 'Data Analysis', 'Investment Takeaway'];

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

/** Word count targets per content type — Korean stock market YMYL requires depth (AdSense-compliant) */
const WORD_COUNT_TARGETS: Record<string, { min: number; target: number; continuation: number; rejection: number }> = {
  'how-to':          { min: 2000, target: 2800, continuation: 1800, rejection: 1500 },
  'best-x-for-y':   { min: 2000, target: 2800, continuation: 1800, rejection: 1500 },
  'x-vs-y':         { min: 2000, target: 2800, continuation: 1800, rejection: 1500 },
  'analysis':        { min: 2500, target: 3500, continuation: 2200, rejection: 1800 },
  'deep-dive':       { min: 3500, target: 4500, continuation: 3000, rejection: 2500 },
  'news-explainer':  { min: 1800, target: 2200, continuation: 1500, rejection: 1200 },
  'listicle':        { min: 1800, target: 2500, continuation: 1500, rejection: 1200 },
  'case-study':      { min: 2500, target: 3500, continuation: 2200, rejection: 1800 },
  'product-review':  { min: 2000, target: 2800, continuation: 1800, rejection: 1500 },
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

  // news-explainer: 시의성 높은 뉴스 콘텐츠 — 최소 깊이 유지
  if (contentType === 'news-explainer') {
    result = { min: 1800, target: 2200, continuation: 1500, rejection: 1200 };
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
    .replace(/[^a-z0-9가-힣\s-]/g, '') // 한글(가-힣) + 영문 + 숫자 허용
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .split('-')
    .filter(w => w.length > 0 && !SLUG_STOP_WORDS.has(w));

  return words.slice(0, 8).join('-'); // 한글은 단어가 짧으므로 8개까지 허용
}

function buildSystemPrompt(variant: LayoutVariant): string {
  const variantDirectives = getVariantDirectives(variant);
  return `You are a Korean financial analyst and algorithmic trading expert creating authoritative **Korean-language (한국어)** content for **한국인 개인 투자자**.

타겟 독자: 한국어를 사용하는 한국인 개인 투자자, 주식 초보~중급자, 퀀트/알고리즘 트레이딩에 관심 있는 개발자.
NOT 외국인 투자자. 한국 증권사(키움, 미래에셋, 삼성증권 등)를 사용하는 한국인 기준으로 작성.

ALL output MUST be in Korean (한국어). 자연스러운 한국어 금융 용어 사용: 주가, 시가총액, 매수/매도, 수익률, 손절, 익절, 물타기, 분할매수, 눌림목, 갭상승, 상한가, 하한가, 공매도, 신용거래, 미수거래.
기술 용어(RSI, MACD, PER, PBR, EPS)는 영문 유지 (한국 금융계 표준).
네이버 증권, 키움 HTS/MTS, KIS OpenAPI 등 한국 투자자가 실제 사용하는 플랫폼 기준으로 작성.

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
  * 놀라운 통계: "삼성전자 주가가 3개월 만에 25% 상승한 이유...", "SK하이닉스 HBM 매출 비중이 50%를 돌파했습니다..."
  * 도발적 질문: "KOSPI 2800선, 지금 매수해도 될까요?", "AI 자동매매가 개인 투자자를 대체할 수 있을까?"
  * 과감한 주장: "이 지표 하나가 한국 반도체주 투자의 판도를 바꿨습니다.", "2026년 가장 주목할 DART 공시는 바로 이것입니다."
  * 일화/현장감: "장 마감 10분 전, KOSPI가 갑자기 급등하기 시작했습니다...", "백테스트 결과를 보는 순간, 전략을 완전히 수정해야 한다는 걸 알았습니다."
  * 대조/역설: "한국 주식시장은 세계 12위 규모이지만, 외국인 투자자 접근성은 여전히 제한적입니다."
  * 직접 호칭: "KOSPI에 처음 투자하시는 분이라면...", "알고리즘 트레이딩을 시작하려는 개발자라면..."
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
- Add a niche-appropriate signature section (e.g., "시장 인사이트", "데이터 분석", "Insider Tips", "Industry Analysis", "종목 심층분석")
- If you run out of genuinely useful things to say, STOP — quality beats quantity

## Content Type Guidelines

### Analysis
- Structure as a multi-angle analysis with clear thesis statement
- Include industry data, 거래량/수급 데이터, 기관 및 외국인 매매 동향 등 relevant metrics
- Present multiple stakeholder perspectives (기업, 기관투자자, 개인투자자, 애널리스트)
- Include a signature analysis section explaining why this matters to 한국인 개인 투자자
- End with forward-looking outlook and FAQ (3-7 Q&As)

### Deep-dive
- Comprehensive exploration of a single topic, brand, trend, or cultural phenomenon
- Include historical context (how Korea got here), current state, and future trajectory
- Incorporate expert commentary, consumer reviews, or cultural industry data where relevant
- 시그니처 분석 섹션 포함 (예: "시장 인사이트", "차트 분석", "투자 포인트")
- End with key takeaways and FAQ (3-7 Q&As)

### News-explainer
- 최근 한국 주식/거시경제 이벤트를 한국인 투자자 시각으로 분석
- 이벤트 타임라인과 핵심 당사자(기업, 기관, 정책 주체) 설명
- 주가/지수에 미친 즉각적 영향과 중장기 전망 구분
- "투자자 관점에서 보는 핵심 포인트" 섹션 포함
- End with "앞으로 주목할 변수" forward-looking section and FAQ (3-5 Q&As)

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
- Cover: 종목/ETF/전략 개요, 핵심 투자 포인트, 최근 주가 흐름, 재무 지표(PER/PBR/ROE), 리스크 요인
- Include pros (3+) and cons (2+) in a structured list
- **For Korean-Stock product-review**: 투자 리스크 등급(저위험/중위험/고위험), 적합 투자자 유형(초보/중급/고급), 최소 투자금액 기준, 유동성(일평균 거래량), 매매 가능 플랫폼(키움, 미래에셋, 삼성증권 MTS 등) 포함.
- **투자 면책 고지 (MANDATORY for product-review AND best-x-for-y)**: 종목/전략 언급 하단에 반드시 포함: <p style="font-size:12px; color:#888; margin-top:6px;">이 글은 투자 정보 제공 목적이며 특정 종목 매수·매도를 권유하지 않습니다. 투자 결정은 본인 판단과 책임 하에 이루어져야 합니다.</p>
- End with a clear "투자 결론" verdict and FAQ (3-5 Q&As)

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
- 주요 지표: 주가 차트 데이터(일봉/주봉), 거래량 변화, 수급(외국인/기관/개인 순매수), 재무 지표(매출/영업이익 변화율), 섹터 대비 상대 강도
- Add expert commentary or industry analysis to support claims
- Include a "투자자 핵심 교훈" section with actionable insights
- Include a comparison with a sector equivalent (e.g., "동종 업종 대비...", "KOSPI 대비...")
- End with "이 사례에서 배울 점" section and FAQ (3-5 Q&As)

## 니치별 톤
- Korean-Stock: 전문 주식 분석가 — DART 공시, 기술적 분석, 기업 재무제표를 기반으로 데이터 중심 분석. 구체적 수치(PER, PBR, ROE, 시가총액)와 차트 데이터를 반드시 포함. 투자 추천이 아닌 분석 제공. "~할 수 있다", "~로 보인다" 등 헤지 언어 사용.
- AI-Trading: 퀀트/알고리즘 트레이딩 전문가 — 전략 이론 + Python 구현 코드를 함께 제공. 백테스트 결과(수익률, 승률, MDD, 샤프 비율)를 반드시 포함. 실전과 백테스트의 차이를 항상 명시.

## 시그니처 섹션 (필수)
모든 글에 시그니처 분석 섹션을 H2로 포함. 섹션명은 유저 프롬프트에서 지정됨.
300-500단어의 독창적 분석 가치를 제공하는 섹션이어야 함.

## 한국 금융 E-E-A-T 규칙 (중요)
- DART(dart.fss.or.kr) 공시 자료 인용: "DART 전자공시에 따르면...""
- KRX(krx.co.kr) 시장 데이터 인용: "한국거래소 데이터 기준..."
- 한국은행(bok.or.kr) 경제 지표: "한국은행 경제통계시스템(ECOS)에 따르면..."
- 네이버 금융 참조 가능 (시세 데이터)
- 기업명은 첫 언급 시 종목코드 포함: "삼성전자(005930)"

## 인용 패턴 (E-E-A-T 증폭)
- 재무 데이터: "DART 분기보고서(2026년 1분기)에 따르면 매출액은 X조원으로..." — 반드시 보고서 종류와 기간 명시
- 기술적 분석: "일봉 기준 RSI(14)가 28로 과매도 구간 진입..." — 반드시 기간과 시간프레임 명시
- 매크로: "한국은행이 기준금리를 X%로 동결한 배경은..." — 결정일과 맥락 포함

## SEO 요구사항
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
- Example (Korean-Stock): <h3 id="삼성전자-주가-전망-2026" style="...">삼성전자 주가 2026년 전망은?</h3>
- Example (AI-Trading): <h3 id="MACD-골든크로스-매수-타이밍" style="...">MACD 골든크로스 발생 시 매수 타이밍은?</h3>

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
  * Korean financial institutions: fss, kfia, ksd, nhis, kipo, kofia
  * Korean financial news: hankyung, mk-economy, yonhap-finance, edaily, inews24
  * AI-Trading platforms: quantinvest, backtrader, zipline, quant-kor, naver-finance-api
- data-topic: brief topic context for URL resolution (e.g., "markets", "earnings", "policy")
- Example: <cite data-source="bloomberg" data-topic="markets">Bloomberg Markets</cite>
- Example: <cite data-source="bok" data-topic="monetary-policy">Bank of Korea</cite>
- The publishing system will automatically resolve these to verified URLs

## Output Field Rules (ALL output in Korean 한국어)

1. title: 높은 CTR의 한국어 제목. 20-40자 목표 (네이버/구글 SERP 최적).

   콘텐츠 유형별 패턴:
   A. 질문/방법: "[날짜] [주제] [방법/이유/비교] — [핵심 가치]"
   B. 리스트/비교: "[날짜] [종목/전략] [비교/순위]"
   C. 분석/인사이트: "[날짜] [종목/지표] 분석: [핵심 발견]"

   필수:
   - 제목 앞에 발행 날짜 포함 (형식: "3월 30일" 또는 "3/30")
   - 한국어로 작성 (영문 종목코드/기술용어는 예외)
   - 핵심 키워드를 반드시 포함
   - 숫자 또는 구체적 데이터 포함 (예: "삼성전자 PER 12배", "KOSPI 2800선 분석")
   - 금지: "~의 모든 것", "완벽 가이드", "꼭 알아야 할"
   - 예시: "3월 30일 KOSPI -2.97% 급락 원인 분석과 대응 전략", "3/30 에너지장비 업종 강세 관련주 분석"

2. slug: 한국어 URL slug (3-5 단어, 하이픈 구분). 예: "삼성전자-주가-전망-분석", "RSI-MACD-매매-전략". 한글+영문 혼용 가능.
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
   - BAD: "이 글은 한국 주식시장 분석 방법에 대해 다룹니다."
   - GOOD: "KOSPI 2800선 지지 여부 분석: 외국인 순매수 전환 신호와 업종별 대응 전략을 확인하세요. 2026년 최신 데이터 기반."

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
- When referencing product prices or sales data: use "as of [month] ${new Date().getFullYear()}" or "according to recent listings" — avoid exact prices unless explicitly provided in the prompt, as Korean-Stock pricing changes frequently across platforms
- NEVER invent Korean government policy names, bill numbers, or regulation titles — reference only well-known policies you are certain about

Image Prompt Rules:
- Generate exactly 5 English image prompts in the imagePrompts array
- First (index 0): Featured image - visually represents the core topic with Korean visual elements
- Remaining 4 (index 1-4): Inline images distributed across sections
- All 5 prompts MUST describe completely different scenes/subjects/compositions (NO duplicates!)
- Each prompt MUST be at least 50 words with specific details
- Include Korean visual elements where appropriate: Korean-Stock content → 서울 여의도 증권가 빌딩, 주식 차트 모니터, 한국거래소(KRX) 전광판, 투자자 분석 화면, 캔들스틱 차트 클로즈업; AI-Trading content → Python 코드 화면, 백테스트 그래프, 알고리즘 트레이딩 대시보드, 서버 랙과 데이터 시각화

imageCaptions Rules:
- 정확히 5개의 한국어 이미지 캡션 생성 (8-20단어)
- Each caption MUST include the primary keyword or topic context + descriptive scene
- Good (Korean-Stock): "서울 여의도 증권가 전경과 KOSPI 전광판, 주식 투자자들이 차트를 분석하는 모습"
- Good (AI-Trading): "Python 알고리즘 트레이딩 백테스트 결과 차트가 표시된 듀얼 모니터 트레이딩 데스크"
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
- **Korean-Stock**: 섹터별 수익률 막대 차트, PER/PBR 밸류에이션 비교 차트, 외국인/기관 순매수 추이, 업종 강도 히트맵
- **AI-Trading**: 전략별 백테스트 수익률 비교 막대 차트, 월별 승률 차트, MDD(최대 낙폭) 비교 시각화

Keep SVG charts simple: max 5 bars/items, clear labels, brand colors (#0066FF, #00CC66, #FF6B35).

### Key Metrics Highlight (Korean-Stock & AI-Trading)
Display key numbers prominently — Korean-Stock: PER, 시가총액, 52주 고/저, 외국인 보유비율; AI-Trading: 백테스트 수익률, 승률, MDD, 샤프 비율:
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

### Infographic-Style Data Box (Korean-Stock & AI-Trading — data-heavy content)
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
<li>[Key change 1 — e.g., "2026년 1분기 실적 기준으로 재무 데이터 업데이트"]</li>
<li>[Key change 2 — e.g., "KOSPI 3월 급락 이후 시나리오 분석 섹션 추가"]</li>
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
{"title":"한국어 제목","slug":"삼성전자-주가-전망-분석","ogTitle":"짧은 소셜 제목 (20자 내)","html":"<div style=\\"max-width:760px;...\\">...한국어 콘텐츠...</div>","excerpt":"한국어 메타 설명 60-80자","metaDescription":"SEO 최적화 메타 설명 (60-80자, 핵심 키워드 포함, 행동 유도)","titleCandidates":["대안 제목 A (다른 앵글)","대안 제목 B (다른 후크)"],"tags":["태그1","태그2"],"category":"카테고리명","imagePrompts":["A detailed scene of... (50+ words, English for image generation)","...","...","...","..."],"imageCaptions":["한국어 이미지 캡션 1","캡션 2","캡션 3","캡션 4","캡션 5"]}

IMPORTANT: title, html, excerpt, metaDescription, tags, category, imageCaptions, slug 모두 한국어로 작성.
IMPORTANT: imagePrompts만 영문 유지 (이미지 생성 AI용).
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
   * Korean-Stock:  Daniel Park (primary) → Jiwon Lee (secondary) → Sungho Choi (tertiary: makeup/hair)
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
These are comprehensive hub guides. When your article covers a subtopic of any pillar page above, include a contextual link with anchor text matching the pillar topic (e.g., "as covered in our [Korean 주식분석 Routine guide](/guide-${pillarSlug}/)").
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
      // Korean-Stock ↔ AI-Trading natural bridges: 종목 주식분석, 퀀트 전략, 시장 분석 공통 주제
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
    // Legacy Korean-Stock/AI-Trading directives removed in finance pivot (see git history)
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
${niche.category === 'Korean-Stock' ? 'Preferred sources for Korean-Stock: allure-korea, vogue-korea, harpers-bazaar-korea, inci-decoder, skinsort, olive-young, hwahae, glowpick, cosmorning. Use kocca or kotra only if covering Korean-Stock global export trends.' : niche.category === 'AI-Trading' ? 'Preferred sources for AI-Trading: hanteo, circle-chart, billboard-korea, kocca, melon, mnet, weverse-magazine. Do NOT use bok, krx, dart, kosis, or gaon (Gaon Charts rebranded to Circle Chart in 2023 — always cite as circle-chart).' : 'Korean institutional sources preferred: bok, krx, dart, kosis.'}
MANDATORY: Include a "${getSignatureSection(niche.category, analysis.contentType, analysis.selectedKeyword)}" signature analysis section (as an H2 heading, 300-500 words of unique analytical value).
${['analysis', 'deep-dive', 'case-study'].includes(analysis.contentType) ? `
ORIGINAL RESEARCH SIGNALS (for ${analysis.contentType} content):
- Include a "Methodology" or "Our Analysis Approach" section explaining how data was gathered/analyzed
${niche.category === 'Korean-Stock' ? '- Cite Korean-Stock data sources: 네이버 금융 시세/재무, KRX 시장 데이터, DART 공시 시스템, 한국은행 경제통계(ECOS), 금융감독원(FSS) 보고서' : niche.category === 'AI-Trading' ? '- Cite AI-Trading data sources: Python 라이브러리(FinanceDataReader, pykrx, backtrader), 퀀트 연구 자료, 증권사 백테스트 보고서, KOSPI/KOSDAQ 히스토리 데이터' : '- Cite specific Korean data sources: BOK (Bank of Korea), KOSIS (Korean Statistical Information Service), DART (disclosure system), or industry reports'}
- Use phrasing like "Based on our analysis of [X data points]..." or "According to industry data from [source]..."
- Include at least one data-driven insight that requires cross-referencing multiple sources
- This qualifies the post as original research for E-E-A-T scoring` : ''}
Also generate a relevant poll question for reader engagement. Include it in the JSON output as:
"pollQuestion": { "question": "Your poll question here?", "options": ["Option A", "Option B", "Option C"] }
${(['product-review', 'best-x-for-y', 'x-vs-y', 'listicle', 'how-to'].includes(analysis.contentType) && ['Korean-Stock', 'AI-Trading'].includes(niche.category)) ? `
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
    // 29차 감사: AI-Trading case-study/analysis는 팬 대상 — 학술적 톤(0.5) 대신 약간 더 자연스러운 0.6
    if (niche.category === 'AI-Trading' && ['case-study', 'analysis'].includes(analysis.contentType)) {
      temperature = 0.6;
    }
    // AI-Trading news-explainer: fan 실적발표 news needs personality & energy, not academic precision
    if (niche.category === 'AI-Trading' && analysis.contentType === 'news-explainer') {
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
        'Korean-Stock': '한국 주식시장 분석 전문 | KOSPI·KOSDAQ 기술적 분석, 섹터 분석, 실적 데이터 기반 투자 인사이트 제공.',
        'AI-Trading': '알고리즘 트레이딩 전문 | 퀀트 전략 설계·백테스트·Python 구현 가이드. 한국 주식시장 자동매매 시스템 구축 노하우 공유.',
      };
      const bylineBio = NICHE_BYLINE_BIO[niche.category] || '한국 주식시장 분석 전문 | KOSPI·KOSDAQ 데이터 기반 투자 인사이트와 알고리즘 트레이딩 전략 제공.';

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
