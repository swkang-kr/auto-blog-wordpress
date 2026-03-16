import { logger } from './logger.js';
import { ALL_SIGNATURE_SECTION_NAMES } from '../services/content-generator.service.js';

export interface ContentScore {
  total: number;
  breakdown: {
    titleScore: number;
    excerptScore: number;
    structureScore: number;
    seoScore: number;
    readabilityScore: number;
    eeatScore: number;
    experienceScore: number;
  };
  issues: ContentIssue[];
  warnings: ContentIssue[];
}

export interface ContentIssue {
  category: string;
  message: string;
  severity: 'error' | 'warning' | 'info';
  autoFixed?: boolean;
}

/**
 * Comprehensive content quality validator.
 * Runs post-generation checks and returns a score + issues list.
 */
/** Per-category Flesch-Kincaid readability targets (category → [min, max]) */
const CATEGORY_READABILITY_TARGETS: Record<string, [number, number]> = {
  'K-Entertainment': [60, 75],   // Casual audience expects easy reading
  'K-Beauty': [55, 70],          // Consumer-friendly but some science
};

/** Per-category minimum quality scores — raised across the board for HCU compliance */
const CATEGORY_MIN_QUALITY: Record<string, number> = {
  'K-Entertainment': 60,
  // K-Beauty product-review/best-x-for-y = purchase-intent (YMYL-adjacent) → stricter bar
  'K-Beauty': 65,
};

/** Content type-specific minimum word counts — lowered for information density over padding */
const CONTENT_TYPE_MIN_WORDS: Record<string, number> = {
  'deep-dive': 3000,
  'analysis': 1800,
  'case-study': 1800,
  'how-to': 1600,
  'product-review': 1600,
  'best-x-for-y': 1500,
  'x-vs-y': 1500,
  'news-explainer': 1500,
  'listicle': 1400,
};

/** Get minimum quality score for a category (defaults to global MIN_QUALITY_SCORE or 65) */
export function getMinQualityScore(category?: string, globalMinScore?: number): number {
  return (category ? CATEGORY_MIN_QUALITY[category] : undefined) ?? globalMinScore ?? 65;
}

/**
 * Compute experience score (max 7 bonus points) for E-E-A-T Experience signal.
 * Rewards first-person analytical patterns, specific observational details,
 * and personal judgment markers that indicate real expertise.
 */
/**
 * Compute original research bonus (max 5 points) for E-E-A-T scoring.
 * Rewards methodology sections, Korean data source citations, and analysis phrasing.
 */
function computeOriginalResearchBonus(plainText: string, html: string): number {
  let bonus = 0;
  const lower = plainText.toLowerCase();

  // +2: Methodology section present
  const methodologyPatterns = [
    'methodology', 'our analysis approach', 'how we analyzed',
    'research methodology', 'data collection', 'our research',
  ];
  const hasMethodology = methodologyPatterns.some(p => lower.includes(p));
  if (hasMethodology) bonus += 2;

  // +2: Korean data source citations
  // Finance/Tech: BOK, KOSIS, DART, KOTRA
  // K-Beauty: Allure Korea, Harpers Bazaar, Vogue Korea, INCI Decoder, Olive Young
  // K-Entertainment: KOCCA, Hanteo, Circle Chart, Billboard Korea, Weverse Magazine
  const koreanDataSources = [
    // Finance & institution
    'bok', 'kosis', 'dart', 'kotra', 'kisa', 'bank of korea', 'korean statistical',
    // K-Beauty editorial & ingredient sources
    // NOTE: 'allure korea' (not plain 'allure') to avoid false-positive matches with US Allure
    'allure korea', 'harpers bazaar korea', 'vogue korea', 'inci decoder', 'olive young', 'kocca',
    // Also accept abbreviated form that naturally occurs in K-Beauty writing
    'allure korea award', 'incidecoder', 'cosdna',
    'hwahae',       // 화해 — Korea's #1 beauty review app (Korea-exclusive E-E-A-T signal)
    'glowpick',     // 글로우픽 — Korea's #2 beauty review/ranking platform
    // K-Entertainment chart & industry sources
    'hanteo', 'circle chart', 'billboard korea', 'weverse magazine', 'melon chart',
    // system prompt에서 권장하나 validator에 미포함이었던 소스 (보너스 점수 일관성)
    'soompi',       // K-Entertainment 최대 영문 뉴스 아웃렛
    'dispatch',     // 디스패치 — K-Entertainment 주요 취재 매체
    'cosmorning',   // 코스모닝 — 한국 화장품 산업 전문 뉴스
    'skinsort',     // K-Beauty 성분 분석 사이트 (cite 소스로 등록)
  ];
  const citedSources = koreanDataSources.filter(s => lower.includes(s)).length;
  if (citedSources >= 2) bonus += 2;
  else if (citedSources >= 1) bonus += 1;

  // +1: Analysis phrasing patterns
  const analysisPhrasing = [
    'based on our analysis', 'according to industry data',
    'our research found', 'data points suggest', 'cross-referencing',
  ];
  const hasAnalysisPhrasing = analysisPhrasing.some(p => lower.includes(p));
  if (hasAnalysisPhrasing) bonus += 1;

  // Check HTML for methodology heading
  const hasMethodologyHeading = /<h[23][^>]*>[^<]*(?:methodology|our analysis|research approach)/i.test(html);
  if (hasMethodologyHeading && bonus < 3) bonus = Math.max(bonus, 3);

  return Math.min(5, bonus);
}

function computeExperienceScore(plainText: string): number {
  let score = 0;
  const lower = plainText.toLowerCase();

  // +3: First-person analytical patterns
  const analyticalPatterns = [
    'i tested', 'in my analysis', 'after reviewing', 'based on my research',
    'what i found', 'i observed', 'i noticed', 'in my experience',
    'i evaluated', 'i compared',
  ];
  const analyticalHits = analyticalPatterns.filter(p => lower.includes(p)).length;
  if (analyticalHits >= 2) score += 3;
  else if (analyticalHits >= 1) score += 2;

  // +2: Specific observational detail markers
  const hasSpecificNumbers = /\b\d{1,3}(?:,\d{3})+\b|\b\d+\.\d+%\b|\$\d+/.test(plainText);
  const koreanLocationPatterns = [
    'gangnam', 'pangyo', 'yeouido', 'mapo', 'itaewon', 'hongdae',
    'myeongdong', 'insadong', 'gwanghwamun', 'jamsil', 'songpa',
    // K-Beauty/K-Entertainment 핵심 지역 (E-E-A-T 현장 경험 신호)
    'cheongdam',   // 청담동 — 럭셔리 K-Beauty 플래그십 + K-Entertainment 사무소 밀집
    'apgujeong',   // 압구정 — 성형외과·피부과 밀집, K-Beauty 트렌드 발신지
    'seongsu',     // 성수동 — K-Beauty 팝업·K-Entertainment 팬미팅 핫스팟 (2024-2026)
    'coex',        // COEX — K-pop 콘서트·팬사인회 주요 행사장
    'sinchon',     // 신촌 — K-Beauty 쇼핑·팬 이벤트 밀집
  ];
  const hasKoreanLocation = koreanLocationPatterns.some(p => lower.includes(p));
  const hasDateRef = /\b(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{4}\b/i.test(plainText);
  const detailHits = [hasSpecificNumbers, hasKoreanLocation, hasDateRef].filter(Boolean).length;
  if (detailHits >= 2) score += 2;
  else if (detailHits >= 1) score += 1;

  // +2: Personal judgment markers
  const judgmentPatterns = [
    'frankly', 'the uncomfortable truth', 'what nobody discusses',
    'my take', 'what most coverage misses', 'the real question',
    'here\'s what matters', 'the data tells a different story',
  ];
  const judgmentHits = judgmentPatterns.filter(p => lower.includes(p)).length;
  if (judgmentHits >= 2) score += 2;
  else if (judgmentHits >= 1) score += 1;

  return Math.min(7, score);
}

export function validateContent(
  html: string,
  title: string,
  excerpt: string,
  keyword: string,
  contentType: string,
  siteUrl: string,
  category?: string,
): ContentScore {
  const issues: ContentIssue[] = [];
  const warnings: ContentIssue[] = [];

  // ── Title validation (max 15 points) ──
  let titleScore = 15;
  const titleLen = title.length;
  if (titleLen < 30) {
    issues.push({ category: 'title', message: `Title too short: ${titleLen} chars (min 30)`, severity: 'error' });
    titleScore -= 10;
  } else if (titleLen < 50) {
    warnings.push({ category: 'title', message: `Title under optimal: ${titleLen} chars (target 50-65)`, severity: 'warning' });
    titleScore -= 3;
  } else if (titleLen > 70) {
    warnings.push({ category: 'title', message: `Title may be truncated in SERP: ${titleLen} chars (target 50-65)`, severity: 'warning' });
    titleScore -= 3;
  } else if (titleLen > 65) {
    titleScore -= 1;
  }

  // Title must contain keyword or keyword fragment
  const keywordWords = keyword.toLowerCase().split(/\s+/);
  const titleLower = title.toLowerCase();
  const keywordHits = keywordWords.filter(w => w.length > 3 && titleLower.includes(w)).length;
  if (keywordHits < Math.min(2, keywordWords.length)) {
    warnings.push({ category: 'title', message: `Title missing primary keyword fragments`, severity: 'warning' });
    titleScore -= 3;
  }

  // ── Excerpt validation (max 10 points) ──
  let excerptScore = 10;
  if (excerpt.length < 120) {
    issues.push({ category: 'excerpt', message: `Excerpt too short: ${excerpt.length} chars (min 120)`, severity: 'error' });
    excerptScore -= 5;
  } else if (excerpt.length > 160) {
    warnings.push({ category: 'excerpt', message: `Excerpt too long: ${excerpt.length} chars (max 160)`, severity: 'warning' });
    excerptScore -= 2;
  }

  // ── Word count & AI detection validation (max 0 — penalty only) ──
  const plainText = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const wordCount = plainText.split(/\s+/).length;

  // Content type-aware minimum word count
  const typeMinWords = CONTENT_TYPE_MIN_WORDS[contentType] ?? 1800;
  if (wordCount < typeMinWords) {
    issues.push({ category: 'length', message: `Content too short: ${wordCount} words (minimum ${typeMinWords} for ${contentType})`, severity: 'error' });
  }
  if (wordCount < 1000) {
    issues.push({ category: 'length', message: `Content critically short: ${wordCount} words (thin content risk)`, severity: 'error' });
  }

  // AI detection heuristics: sentence length variance (burstiness proxy)
  const aiScore = computeAIDetectionScore(plainText);
  if (aiScore > 70) {
    warnings.push({ category: 'ai-detection', message: `High AI-detection risk: ${aiScore}/100 (low sentence variance, uniform structure)`, severity: 'warning' });
  } else if (aiScore > 50) {
    warnings.push({ category: 'ai-detection', message: `Moderate AI-detection risk: ${aiScore}/100`, severity: 'warning' });
  }

  // Information density check: unique data points per 500 words
  const dataPointCount = countDataPoints(plainText);
  const densityPer500 = wordCount > 0 ? (dataPointCount / wordCount) * 500 : 0;
  if (densityPer500 < 2 && wordCount > 1000) {
    warnings.push({ category: 'density', message: `Low information density: ${densityPer500.toFixed(1)} data points per 500 words (target 3+)`, severity: 'warning' });
  }

  // Enhanced information density ratio (used in structure scoring below)
  const densityRatio = densityPer500;

  // Google Discover: check for high-quality featured image signal
  const hasLargeImage = /<img[^>]+width=["']?\d{4,}|<img[^>]+sizes=/.test(html);
  if (!hasLargeImage) {
    warnings.push({ category: 'seo', message: 'No large (1200px+) image detected — reduces Google Discover eligibility', severity: 'warning' });
  }

  // ── Structure validation (max 25 points) ──
  let structureScore = 25;
  if (wordCount < typeMinWords) structureScore -= 5;

  // Enhanced information density scoring: unique data points per 500 words
  if (densityRatio < 1.5) {
    issues.push({ category: 'structure', message: `Very low information density: ${densityRatio.toFixed(1)} data points per 500 words (target: 3+)`, severity: 'warning' });
    structureScore -= 3;
  } else if (densityRatio < 3) {
    issues.push({ category: 'structure', message: `Below-target information density: ${densityRatio.toFixed(1)} data points per 500 words (target: 3+)`, severity: 'info' });
    structureScore -= 1;
  } else if (densityRatio >= 5) {
    // Bonus for high information density
    structureScore += 2;
  }

  // 1. Signature section check (dynamic niche-specific names)
  const signaturePattern = new RegExp(ALL_SIGNATURE_SECTION_NAMES.map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'i');
  const hasSignatureSection = signaturePattern.test(html);
  if (!hasSignatureSection) {
    issues.push({ category: 'structure', message: 'Missing mandatory signature section', severity: 'error' });
    structureScore -= 8;
  }

  // 2. Internal links count (scaled by word count: ~1 link per 500 words, minimum 3)
  const internalLinkRegex = new RegExp(`<a\\s+[^>]*href="${escapeRegex(siteUrl)}[^"]*"[^>]*>`, 'gi');
  const internalLinkCount = (html.match(internalLinkRegex) || []).length;
  const internalLinkTarget = Math.max(3, Math.floor(wordCount / 500));
  if (internalLinkCount === 0) {
    issues.push({ category: 'structure', message: `No internal links found (need ${internalLinkTarget})`, severity: 'error' });
    structureScore -= 5;
  } else if (internalLinkCount < Math.ceil(internalLinkTarget * 0.5)) {
    warnings.push({ category: 'structure', message: `Only ${internalLinkCount} internal link(s) (target ${internalLinkTarget}, <50%)`, severity: 'warning' });
    structureScore -= 3;
  } else if (internalLinkCount < internalLinkTarget) {
    warnings.push({ category: 'structure', message: `${internalLinkCount} internal link(s) below target ${internalLinkTarget}`, severity: 'info' });
    structureScore -= 1;
  }

  // 3. External links count (includes both <a target="_blank"> and <cite data-source> tags)
  const extLinkRegex = /<a\s+[^>]*target="_blank"[^>]*>/gi;
  const citeTagRegex = /<cite\s+data-source="[^"]+"/gi;
  const extLinkCount = (html.match(extLinkRegex) || []).length + (html.match(citeTagRegex) || []).length;
  if (extLinkCount === 0) {
    warnings.push({ category: 'structure', message: 'No external links found (need 2-4 for E-E-A-T)', severity: 'warning' });
    structureScore -= 3;
  }

  // 4. Anchor text diversity check
  const anchorTexts = extractInternalAnchorTexts(html, siteUrl);
  if (anchorTexts.length >= 2) {
    const uniqueAnchors = new Set(anchorTexts.map(a => a.toLowerCase()));
    if (uniqueAnchors.size < anchorTexts.length * 0.5) {
      warnings.push({ category: 'structure', message: `Low anchor text diversity: ${uniqueAnchors.size} unique out of ${anchorTexts.length} internal links`, severity: 'warning' });
      structureScore -= 2;
    }
  }

  // 4b. Affiliate link rel check: verify rel="noopener noreferrer sponsored" on affiliate links
  const affiliateLinkRegex = /<a\s+[^>]*rel="[^"]*sponsored[^"]*"[^>]*>/gi;
  const affiliateLinks = (html.match(affiliateLinkRegex) || []);
  if (affiliateLinks.length > 0) {
    const missingRel = affiliateLinks.filter(link => {
      return !/rel="[^"]*noopener[^"]*"/.test(link) || !/rel="[^"]*noreferrer[^"]*"/.test(link);
    });
    if (missingRel.length > 0) {
      warnings.push({ category: 'structure', message: `${missingRel.length} affiliate link(s) missing full rel="noopener noreferrer sponsored"`, severity: 'warning' });
      structureScore -= 1;
    }
  }

  // 4c. External link security: count target="_blank" links missing rel="noopener noreferrer"
  const blankLinks = html.match(/<a\s+[^>]*target="_blank"[^>]*>/gi) || [];
  let insecureBlankLinks = 0;
  for (const link of blankLinks) {
    if (!/rel="[^"]*noopener[^"]*"/.test(link)) {
      insecureBlankLinks++;
    }
  }
  if (insecureBlankLinks > 0) {
    warnings.push({ category: 'structure', message: `${insecureBlankLinks} external link(s) with target="_blank" missing rel="noopener noreferrer"`, severity: 'warning' });
  }

  // 5. FAQ section check (for applicable content types)
  const faqHeadingRegex = /<h[23][^>]*>[^<]*\bFAQ\b|Frequently Asked/i;
  const questionHeadingCount = (html.match(/<h[23][^>]*>[^<]*\?<\/h[23]>/gi) || []).length;
  if (!faqHeadingRegex.test(html) && questionHeadingCount < 2) {
    warnings.push({ category: 'structure', message: 'No FAQ section detected', severity: 'warning' });
    structureScore -= 3;
  }

  // 5. H2/H3 heading count
  const h2Count = (html.match(/<h2\b/gi) || []).length;
  const h3Count = (html.match(/<h3\b/gi) || []).length;
  if (h2Count < 3) {
    warnings.push({ category: 'structure', message: `Only ${h2Count} H2 headings (recommend 4+)`, severity: 'warning' });
    structureScore -= 2;
  }

  // Passage ranking: check that H2 sections start with substantive paragraphs
  const h2Sections = html.split(/<h2[^>]*>/i).slice(1); // Skip content before first H2
  let passageReadySections = 0;
  for (const section of h2Sections) {
    // Extract first paragraph after the H2
    const firstPMatch = section.match(/<\/h2>\s*<p[^>]*>([\s\S]*?)<\/p>/i);
    if (firstPMatch) {
      const firstParagraph = firstPMatch[1].replace(/<[^>]+>/g, '').trim();
      // A good passage-ranking paragraph has 40-200 words and contains substantive content
      const pWords = firstParagraph.split(/\s+/).length;
      if (pWords >= 30 && pWords <= 200) {
        passageReadySections++;
      }
    }
  }
  const totalH2s = (html.match(/<h2[^>]*>/gi) || []).length;
  if (totalH2s >= 3 && passageReadySections >= Math.floor(totalH2s * 0.6)) {
    // Bonus: 60%+ sections are passage-ranking ready
    structureScore = Math.min(20, structureScore + 2);
  } else if (totalH2s >= 3 && passageReadySections < Math.floor(totalH2s * 0.3)) {
    warnings.push({ category: 'structure', message: `Only ${passageReadySections}/${totalH2s} sections have strong opening paragraphs (passage ranking)`, severity: 'warning' });
  }

  // 5a. H2/H3 id attribute check (required for passage ranking + TOC anchors)
  const h2WithoutId = (html.match(/<h2(?!\s[^>]*\bid=)[^>]*>/gi) || []).length;
  const h3WithoutId = (html.match(/<h3(?!\s[^>]*\bid=)[^>]*>/gi) || []).length;
  const headingsWithoutId = h2WithoutId + h3WithoutId;
  if (headingsWithoutId > 0) {
    warnings.push({ category: 'structure', message: `${headingsWithoutId} heading(s) missing id attribute (needed for passage ranking + TOC)`, severity: 'warning' });
    structureScore -= Math.min(3, headingsWithoutId);
  }

  // 5b. Duplicate heading detection (common AI pattern)
  const allHeadings = (html.match(/<h[23][^>]*>(.*?)<\/h[23]>/gi) || [])
    .map(h => h.replace(/<[^>]+>/g, '').trim().toLowerCase());
  const headingCounts = new Map<string, number>();
  for (const h of allHeadings) {
    headingCounts.set(h, (headingCounts.get(h) || 0) + 1);
  }
  const duplicateHeadings = Array.from(headingCounts.entries()).filter(([, c]) => c > 1);
  if (duplicateHeadings.length > 0) {
    warnings.push({
      category: 'structure',
      message: `Duplicate headings detected: ${duplicateHeadings.map(([h, c]) => `"${h}" x${c}`).join(', ')}`,
      severity: 'warning',
    });
    structureScore -= Math.min(4, duplicateHeadings.length * 2);
  }

  // 6. Image placeholder count
  const imgPlaceholders = (html.match(/<!--IMAGE_PLACEHOLDER_\d+-->/g) || []).length;
  const actualImages = (html.match(/<img\s/gi) || []).length;
  const totalImages = imgPlaceholders + actualImages;
  if (totalImages < 3) {
    warnings.push({ category: 'structure', message: `Only ${totalImages} images (recommend 4+)`, severity: 'warning' });
    structureScore -= 2;
  }

  // 6b. Mobile rendering validation (tables and SVGs)
  const mobileIssues = validateMobileRendering(html);
  if (mobileIssues.length > 0) {
    for (const issue of mobileIssues) {
      warnings.push({ category: 'structure', message: issue, severity: 'warning' });
    }
    structureScore -= Math.min(4, mobileIssues.length * 2);
  }

  // 6c. Alt text quality validation
  const altTextIssues = validateAltTexts(html, keyword);
  if (altTextIssues.length > 0) {
    for (const issue of altTextIssues) {
      warnings.push({ category: 'structure', message: issue, severity: 'warning' });
    }
    structureScore -= Math.min(3, altTextIssues.length);
  }

  // 7. Outdated year references (stale content detection)
  const currentYear = new Date().getFullYear();
  const outdatedYearPenalty = detectOutdatedYearReferences(plainText, currentYear);
  if (outdatedYearPenalty > 0) {
    warnings.push({ category: 'structure', message: `Content references outdated years excessively (penalty: -${outdatedYearPenalty})`, severity: 'warning' });
    structureScore -= outdatedYearPenalty;
  }

  // ── SEO validation (max 20 points) ──
  let seoScore = 20;

  // 1. Keyword in first paragraph
  const firstParagraph = extractFirstParagraph(html);
  if (firstParagraph) {
    const firstParaLower = firstParagraph.toLowerCase();
    const kwInFirst = keywordWords.filter(w => w.length > 3 && firstParaLower.includes(w)).length;
    if (kwInFirst === 0) {
      issues.push({ category: 'seo', message: 'Primary keyword not found in first paragraph', severity: 'error' });
      seoScore -= 5;
    }
  }

  // 2. Keyword density (1-2% target)
  const keywordOccurrences = countKeywordOccurrences(plainText, keyword);
  // Count full-phrase occurrences: each match covers keywordWords.length words
  const density = (keywordOccurrences / (wordCount / keywordWords.length)) * 100;
  if (density < 0.3) {
    warnings.push({ category: 'seo', message: `Keyword density too low: ${density.toFixed(2)}% (target 0.5-2%)`, severity: 'warning' });
    seoScore -= 3;
  } else if (density > 3) {
    warnings.push({ category: 'seo', message: `Keyword density too high: ${density.toFixed(2)}% (target 0.5-2%) — keyword stuffing risk`, severity: 'warning' });
    seoScore -= 5;
  }

  // 2b. Featured Snippet optimization check
  const hasSnippetBox = /class="ab-snippet"/i.test(html);
  if (!hasSnippetBox) {
    warnings.push({ category: 'seo', message: 'No Featured Snippet box (ab-snippet) detected — add concise answer box for Position 0 targeting', severity: 'warning' });
    seoScore -= 2;
  } else {
    // Validate snippet length (should be 40-60 words for definition snippets)
    const snippetMatch = html.match(/<div class="ab-snippet">([\s\S]*?)<\/div>/i);
    if (snippetMatch) {
      const snippetText = snippetMatch[1].replace(/<[^>]+>/g, '').trim();
      const snippetWords = snippetText.split(/\s+/).length;
      if (snippetWords > 80) {
        warnings.push({ category: 'seo', message: `Featured Snippet too long: ${snippetWords} words (target 40-60 for definition snippets)`, severity: 'warning' });
        seoScore -= 1;
      }
    }
  }

  // 2b2. Snippet type vs content type validation
  if (hasSnippetBox) {
    const snippetTypeMatch = html.match(/data-snippet-type="([^"]+)"/i);
    const snippetType = snippetTypeMatch ? snippetTypeMatch[1] : 'definition';
    const expectedSnippetTypes: Record<string, string[]> = {
      'how-to': ['how-to', 'list'],
      'x-vs-y': ['table', 'definition'],
      'listicle': ['list', 'definition'],
      'best-x-for-y': ['list', 'definition'],
    };
    const expected = expectedSnippetTypes[contentType];
    if (expected && !expected.includes(snippetType)) {
      warnings.push({ category: 'seo', message: `Snippet type "${snippetType}" may not match content type "${contentType}" (expected: ${expected.join(' or ')})`, severity: 'warning' });
    }
  }

  // 2c. People Also Ask (PAA) optimization — question-format H3s in body
  const questionH3Count = (html.match(/<h3[^>]*>[^<]*\?<\/h3>/gi) || []).length;
  if (questionH3Count < 2) {
    warnings.push({ category: 'seo', message: `Only ${questionH3Count} question-format H3 heading(s) — add 2-3 for People Also Ask optimization`, severity: 'warning' });
    seoScore -= 1;
  }

  // 2d. CTA presence check
  const hasEngagementCta = /ab-cta-engagement/i.test(html);
  const hasNewsletterCta = /ab-cta-newsletter/i.test(html);
  if (!hasEngagementCta && !hasNewsletterCta) {
    warnings.push({ category: 'seo', message: 'No CTA section (ab-cta-engagement or ab-cta-newsletter) detected', severity: 'warning' });
    seoScore -= 1;
  }

  // 3. TOC presence
  const hasToc = /Table of Contents/i.test(html);
  if (!hasToc) {
    warnings.push({ category: 'seo', message: 'No Table of Contents detected', severity: 'warning' });
    seoScore -= 2;
  }

  // 3b. Image alt text validation (keyword context in alt text)
  const imgAltResult = validateImageAltTexts(html, keyword);
  if (imgAltResult.missingAlt > 0) {
    warnings.push({ category: 'seo', message: `${imgAltResult.missingAlt} image(s) missing alt text`, severity: 'warning' });
    seoScore -= Math.min(3, imgAltResult.missingAlt);
  } else if (imgAltResult.total > 0 && imgAltResult.missingKeyword > imgAltResult.total * 0.5) {
    warnings.push({ category: 'seo', message: `${imgAltResult.missingKeyword}/${imgAltResult.total} images lack keyword context in alt text`, severity: 'warning' });
    seoScore -= 1;
  }

  // 4. LSI keyword coverage in headings (check if related keywords appear in H2/H3)
  const headings = (html.match(/<h[23][^>]*>(.*?)<\/h[23]>/gi) || []).map(h => h.replace(/<[^>]+>/g, '').toLowerCase());
  const headingsText = headings.join(' ');
  const keywordMainWords = keyword.toLowerCase().split(/\s+/).filter(w => w.length > 4);
  const headingKeywordHits = keywordMainWords.filter(w => headingsText.includes(w)).length;
  if (headingKeywordHits === 0 && keywordMainWords.length > 0) {
    warnings.push({ category: 'seo', message: 'No keyword fragments found in H2/H3 headings (LSI keywords should appear in subheadings)', severity: 'warning' });
    seoScore -= 2;
  }

  // ── Readability validation (max 15 points) ──
  let readabilityScore = 15;

  // 1. Paragraph length check (3-4 sentences max)
  const paragraphs = extractParagraphs(html);
  let longParagraphCount = 0;
  for (const para of paragraphs) {
    const sentences = countSentences(para);
    if (sentences > 5) {
      longParagraphCount++;
    }
  }
  if (longParagraphCount > 3) {
    warnings.push({ category: 'readability', message: `${longParagraphCount} paragraphs exceed 5 sentences (target 3-4 max)`, severity: 'warning' });
    readabilityScore -= Math.min(5, longParagraphCount);
  }

  // 2. Hook quality (first paragraph should not be generic)
  if (firstParagraph) {
    const genericOpeners = [
      'in today', 'in this article', 'in this guide', 'in this post',
      'welcome to', 'this article will', 'this guide will', 'this post will',
      'in the ever', 'in a world where',
    ];
    const fpLower = firstParagraph.toLowerCase();
    const hasGenericOpener = genericOpeners.some(g => fpLower.startsWith(g));
    if (hasGenericOpener) {
      issues.push({ category: 'readability', message: 'First paragraph uses generic opener (needs compelling hook)', severity: 'error' });
      readabilityScore -= 5;
    }
  }

  // 3. Duplicate phrase detection (AI-typical repetition)
  const duplicatePhrasesFound = detectDuplicatePhrases(plainText);
  if (duplicatePhrasesFound.length > 0) {
    warnings.push({
      category: 'readability',
      message: `Repetitive phrases detected: ${duplicatePhrasesFound.slice(0, 3).map(p => `"${p.phrase}" x${p.count}`).join(', ')}`,
      severity: 'warning',
    });
    readabilityScore -= Math.min(5, duplicatePhrasesFound.length * 2);
  }

  // 4. Flesch-Kincaid readability check (per-niche targets)
  const fkScore = computeFleschKincaid(plainText);
  const [fkMin, fkMax] = category ? (CATEGORY_READABILITY_TARGETS[category] ?? [50, 70]) : [50, 70];
  if (fkScore < fkMin - 10) {
    warnings.push({ category: 'readability', message: `Flesch-Kincaid readability very low: ${fkScore.toFixed(1)} (target ${fkMin}-${fkMax})`, severity: 'warning' });
    readabilityScore -= 5;
  } else if (fkScore < fkMin) {
    warnings.push({ category: 'readability', message: `Flesch-Kincaid readability low: ${fkScore.toFixed(1)} (target ${fkMin}-${fkMax})`, severity: 'warning' });
    readabilityScore -= 3;
  } else if (fkScore > fkMax + 10) {
    warnings.push({ category: 'readability', message: `Flesch-Kincaid readability too high: ${fkScore.toFixed(1)} (target ${fkMin}-${fkMax}) — may be too simplistic`, severity: 'warning' });
    readabilityScore -= 2;
  }

  // 4a. Gunning Fog Index check (target 10-12 for college-educated general audience)
  const fogIndex = computeGunningFogIndex(plainText);
  if (fogIndex > 15) {
    warnings.push({ category: 'readability', message: `Gunning Fog Index too high: ${fogIndex.toFixed(1)} (target 10-12) — content may be too complex`, severity: 'warning' });
    readabilityScore -= 3;
  } else if (fogIndex > 13) {
    warnings.push({ category: 'readability', message: `Gunning Fog Index elevated: ${fogIndex.toFixed(1)} (target 10-12)`, severity: 'warning' });
    readabilityScore -= 1;
  }

  // 4b. Thin paragraph detection: 3+ consecutive <p> with <30 words each
  const thinParagraphs = extractParagraphs(html);
  let consecutiveThin = 0;
  let thinExcess = 0;
  for (const para of thinParagraphs) {
    const paraWords = para.split(/\s+/).length;
    if (paraWords < 30) {
      consecutiveThin++;
      if (consecutiveThin >= 3) thinExcess++;
    } else {
      consecutiveThin = 0;
    }
  }
  if (thinExcess > 0) {
    const thinPenalty = Math.min(4, thinExcess * 2);
    warnings.push({ category: 'readability', message: `${thinExcess} group(s) of 3+ consecutive thin paragraphs (<30 words each)`, severity: 'warning' });
    readabilityScore -= thinPenalty;
  }

  // 5. Transition diversity check
  if (wordCount > 2500) {
    const uniqueTransitions = countUniqueTransitions(plainText);
    if (uniqueTransitions < 5) {
      warnings.push({ category: 'readability', message: `Low transition word diversity: only ${uniqueTransitions} unique transitions (need 5+)`, severity: 'warning' });
      readabilityScore -= 2;
    }
  }

  // ── E-E-A-T validation (max 15 points) ──
  let eeatScore = 15;

  // 1. Korean source citations
  const koreanSourcePatterns = [
    // Finance & government
    /Bank of Korea|BOK|한국은행/i,
    /Korea Exchange|KRX|한국거래소/i,
    /DART|dart\.fss/i,
    /KOSIS|kosis\.kr/i,
    /FSC|금융위원회/i,
    /KFTC|공정거래위원회/i,
    /MSIT|과학기술정보통신부/i,
    /KOTRA/i,
    /KISA/i,
    /KOCCA/i,
    /Maeil Business|매일경제/i,
    // K-Entertainment sources (prevent unfair -5 penalty for entertainment content)
    /Hanteo/i,
    /Circle\s*Chart/i,
    /Melon\s*(?:Chart|streaming)?/i,
    /Soompi/i,
    /Dispatch|디스패치/i,
    /Weverse\s*Magazine/i,
    /Billboard\s*Korea/i,
    // K-Beauty editorial sources (prevent unfair -5 penalty for beauty content)
    /Allure\s*Korea/i,
    /Vogue\s*Korea/i,
    /Harper.?s?\s*Bazaar\s*Korea/i,
    /Olive\s*Young|올리브영/i,
    /Cosmorning|코스모닝/i,
    /MFDS|식품의약품안전처/i,
  ];
  const koreanCitationCount = koreanSourcePatterns.filter(p => p.test(html)).length;
  if (koreanCitationCount === 0) {
    warnings.push({ category: 'eeat', message: 'No Korean institutional source citations found', severity: 'warning' });
    eeatScore -= 5;
  }

  // 2. Korean terms with Hangul
  const hangulCount = (html.match(/[\uAC00-\uD7AF]/g) || []).length;
  if (hangulCount < 3) {
    warnings.push({ category: 'eeat', message: `Very few Hangul characters (${hangulCount}). Include Korean terms with Hangul for E-E-A-T`, severity: 'warning' });
    eeatScore -= 3;
  }

  // 3. Data/statistics presence
  const numberPatterns = (html.match(/\$[\d,.]+|\d+%|\d+\.\d+/g) || []).length;
  if (numberPatterns < 3) {
    warnings.push({ category: 'eeat', message: 'Very few data points/statistics in content', severity: 'warning' });
    eeatScore -= 3;
  }

  // 4. E-E-A-T penalty: if >50% external links go to non-trusted domains
  const extLinkUrls = (html.match(/href="(https?:\/\/[^"]+)"/gi) || [])
    .map(m => m.match(/href="(https?:\/\/[^"]+)"/i)?.[1])
    .filter(Boolean) as string[];
  if (extLinkUrls.length >= 2) {
    const trustedDomainsList = [
      'bok.or.kr', 'krx.co.kr', 'dart.fss.or.kr', 'kosis.kr',
      'bloomberg.com', 'reuters.com', 'nikkei.com', 'cnbc.com', 'ft.com', 'wsj.com',
      'statista.com', 'worldbank.org', 'imf.org', 'mckinsey.com', 'techcrunch.com',
      'samsung.com', 'hyundai.com', 'lgcorp.com', 'koreaherald.com', 'mk.co.kr',
      'wikipedia.org', 'google.com', 'youtube.com',
      // K-Entertainment trusted sources
      'weverse.io', 'melon.com', 'hanteonews.com', 'circlechart.kr',
      'soompi.com', 'billboard.com', 'sbs.co.kr', 'kbs.co.kr', 'mbc.co.kr',
      // K-Beauty trusted sources
      'oliveyoung.co.kr', 'oliveyoung.com', 'allure.co.kr',
      'incidecoder.com', 'cosdna.com', 'skinsort.com',
      'hwahae.co.kr', 'glowpick.com',
    ];
    let nonTrustedCount = 0;
    for (const url of extLinkUrls) {
      try {
        const domain = new URL(url).hostname.replace(/^www\./, '');
        if (!siteUrl.includes(domain) && !trustedDomainsList.some(d => domain.endsWith(d))) {
          nonTrustedCount++;
        }
      } catch { /* skip invalid */ }
    }
    const extOnlyUrls = extLinkUrls.filter(u => { try { return !siteUrl.includes(new URL(u).hostname); } catch { return true; } });
    if (extOnlyUrls.length > 0 && nonTrustedCount / extOnlyUrls.length > 0.5) {
      warnings.push({ category: 'eeat', message: `${nonTrustedCount}/${extOnlyUrls.length} external links to non-trusted domains`, severity: 'warning' });
      eeatScore -= 3;
    }
  }

  // 5. Suspicious URL pattern detection (likely fabricated deep paths)
  const suspiciousUrls = detectSuspiciousUrls(html);
  if (suspiciousUrls.length > 0) {
    warnings.push({
      category: 'eeat',
      message: `Potentially fabricated URLs detected: ${suspiciousUrls.slice(0, 3).join(', ')}`,
      severity: 'warning',
    });
    eeatScore -= 2;
  }

  // 6. Unhedged statistics detection (current-year stats without qualifying language)
  const unhedgedStats = detectUnhedgedStatistics(plainText, currentYear);
  if (unhedgedStats > 2) {
    warnings.push({
      category: 'eeat',
      message: `${unhedgedStats} potentially unverified ${currentYear} statistics without qualifying language (use "estimated", "projected", "according to")`,
      severity: 'warning',
    });
    eeatScore -= Math.min(3, unhedgedStats);
  }

  // 7. Unsourced large monetary claims (billion/million without attribution)
  const unsourcedClaims = detectUnsourcedLargeClaims(plainText);
  if (unsourcedClaims > 0) {
    warnings.push({
      category: 'eeat',
      message: `${unsourcedClaims} large monetary claim(s) without attribution (add "according to" or source reference)`,
      severity: 'warning',
    });
    eeatScore -= unsourcedClaims;
  }

  // 8. Stronger Korean source requirement for Finance/Tech niches (need 2+ citations)
  // K-Beauty YMYL-adjacent: stricter Korean source requirement (need 2+ citations)
  if (category === 'K-Beauty') {
    if (koreanCitationCount === 1) {
      warnings.push({
        category: 'eeat',
        message: `Only 1 Korean source for ${category} content (need 2+ for YMYL credibility)`,
        severity: 'warning',
      });
      eeatScore -= 2;
    }
  }

  // 9. Source credibility analysis (quality of cited sources)
  const credibility = computeSourceCredibility(html);
  if (credibility.sourceCount >= 2 && credibility.avgWeight < 0.5) {
    warnings.push({
      category: 'eeat',
      message: `Low average source credibility: ${credibility.avgWeight.toFixed(2)} (target 0.5+). Low-quality sources: ${credibility.lowQualitySources.slice(0, 3).join(', ')}`,
      severity: 'warning',
    });
    eeatScore -= 2;
  }

  // ── Original Research bonus (max 5 bonus points) ──
  const originalResearchBonus = computeOriginalResearchBonus(plainText, html);
  if (originalResearchBonus > 0) {
    eeatScore += originalResearchBonus;
  }

  // ── Experience signal validation (max 7 bonus points) ──
  const experienceScore = computeExperienceScore(plainText);

  // ── Niche-specific content accuracy checks ──
  if (category === 'K-Beauty') {
    // 1. Sunscreen content MUST explain PA rating system (presence + explanation)
    const isSunscreenContent = /sunscreen|spf|sun\s*protection|uv\s*(?:a|b)|sun\s*block/i.test(plainText);
    if (isSunscreenContent && !/PA\+/i.test(plainText)) {
      warnings.push({ category: 'niche-accuracy', message: 'K-Beauty sunscreen content missing PA rating explanation (PA+ to PA++++ — core K-Beauty differentiator)', severity: 'warning' });
      eeatScore -= 2;
    }
    // 1b. PA rating mentioned but not explained — must educate global readers
    if (isSunscreenContent && /PA\+/i.test(plainText) && ['product-review', 'best-x-for-y', 'how-to', 'deep-dive'].includes(contentType)) {
      const hasPaExplanation = /PA\s*rating\s*system|UVA\s*protection\s*(?:level|factor|rating)|PA\+\s*to\s*PA\+{4}|PA\+{4}\s*(?:means|highest|maximum)/i.test(plainText);
      if (!hasPaExplanation) {
        warnings.push({ category: 'niche-accuracy', message: 'PA rating mentioned but not explained — global readers need context: "PA++++ means highest UVA protection (16x+ protection factor), a rating system used in Korea/Japan." This is a core K-Beauty differentiator.', severity: 'warning' });
        eeatScore -= 1;
      }
    }

    // 2. Product review/best-x-for-y MUST include pricing or price comparison
    if (['product-review', 'best-x-for-y'].includes(contentType)) {
      const hasPricing = /\$\d+|\₩[\d,]+|price|pricing|cost|(?:olive young|amazon|yesstyle)\s*(?:price|cost|\$)/i.test(plainText);
      if (!hasPricing) {
        warnings.push({ category: 'niche-accuracy', message: 'K-Beauty product content missing pricing information (Olive Young KRW / Amazon USD comparison expected)', severity: 'warning' });
        structureScore -= 2;
      }
      // Price disclaimer check
      const hasPriceDisclaimer = /prices?\s*(?:verified|checked|as of)|prices?\s*vary\s*frequently/i.test(plainText);
      if (hasPricing && !hasPriceDisclaimer) {
        warnings.push({ category: 'niche-accuracy', message: 'K-Beauty pricing without date/platform disclaimer ("Prices verified as of...")', severity: 'warning' });
      }
    }

    // 3. Ingredient content should include concentration % where relevant
    const ingredientKeywords = /niacinamide|retinol|vitamin\s*c|hyaluronic|salicylic|glycolic|centella|tranexamic|peptide|adenosine|glutathione/i;
    if (ingredientKeywords.test(plainText) && ['product-review', 'best-x-for-y', 'x-vs-y', 'deep-dive'].includes(contentType)) {
      const hasConcentration = /\d+(?:\.\d+)?%\s*(?:niacinamide|retinol|vitamin|ascorbic|hyaluronic|salicylic|glycolic|centella|madecassoside|tranexamic|peptide|adenosine)/i.test(plainText);
      if (!hasConcentration) {
        warnings.push({ category: 'niche-accuracy', message: 'K-Beauty ingredient content missing concentration % (high-trust signal for ingredient-savvy readers)', severity: 'warning' });
        eeatScore -= 1;
      }
    }

    // 4. Supplement/ingestible content MUST have safety disclaimer
    const isSupplementContent = /supplement|collagen\s*drink|oral\s*(?:collagen|glutathione)|ingest|drink|capsule|tablet/i.test(plainText);
    if (isSupplementContent) {
      const hasSafetyDisclaimer = /not\s*a?\s*substitute|consult\s*(?:a|your)\s*(?:doctor|healthcare|physician|dermatologist)|medical\s*advice|healthcare\s*provider/i.test(plainText);
      if (!hasSafetyDisclaimer) {
        issues.push({ category: 'niche-accuracy', message: 'K-Beauty supplement content MISSING safety disclaimer ("not a substitute for medical advice" / "consult healthcare provider")', severity: 'error' });
        eeatScore -= 3;
      }
    }

    // 5. Snail mucin must NOT be described as fermented
    if (/snail\s*(?:mucin|secretion|filtrate)/i.test(plainText) && /ferment(?:ed|ation)\s*(?:snail|mucin)/i.test(plainText)) {
      issues.push({ category: 'niche-accuracy', message: 'Snail Secretion Filtrate incorrectly described as fermented — it is a natural secretion, NOT a fermented ingredient', severity: 'error' });
      eeatScore -= 2;
    }

    // 6. Skin type suitability matrix for product reviews (expanded beyond basic 5 types)
    if (contentType === 'product-review') {
      const hasSkinType = /(?:oily|dry|combination|sensitive|acne.prone)\s*skin/i.test(plainText);
      if (!hasSkinType) {
        warnings.push({ category: 'niche-accuracy', message: 'K-Beauty product review missing skin type suitability (oily/dry/combination/sensitive/acne-prone)', severity: 'warning' });
        structureScore -= 1;
      }
      // Extended skin condition check for product reviews — these are high-value segments
      const hasExtendedConditions = /(?:rosacea|eczema|atopic|mature|aging|dehydrat(?:ed|ion))\s*(?:skin|prone)/i.test(plainText);
      if (hasSkinType && !hasExtendedConditions && wordCount > 1800) {
        warnings.push({ category: 'niche-accuracy', message: 'K-Beauty product review could benefit from extended skin condition mentions (rosacea-prone, eczema/atopic, mature/aging, dehydrated) — these are high-conversion segments', severity: 'info' });
      }
      // Dehydrated vs dry distinction check — common conflation
      if (/dehydrat/i.test(plainText) && /dry/i.test(plainText)) {
        if (/dehydrat(?:ed|ion)\s*(?:=|is\s*(?:the\s*same|identical|just)\s*(?:as|to))\s*dry/i.test(plainText) ||
            /dry\s*(?:=|is\s*(?:the\s*same|identical|just)\s*(?:as|to))\s*dehydrat/i.test(plainText)) {
          warnings.push({ category: 'niche-accuracy', message: 'Dehydrated ≠ Dry skin — dehydrated skin lacks water (any skin type can be dehydrated), dry skin lacks oil (a skin type). This is a fundamental K-Beauty distinction.', severity: 'warning' });
          eeatScore -= 1;
        }
      }
    }

    // 7. Centella asiatica vs Madecassoside vs Asiaticoside conflation check
    const mentionsCentella = /centella\s*asiatica/i.test(plainText);
    const mentionsMadecassoside = /madecassoside/i.test(plainText);
    const mentionsAsiaticoside = /asiaticoside/i.test(plainText);
    if (mentionsCentella && (mentionsMadecassoside || mentionsAsiaticoside)) {
      // Check if AI treats them as synonyms (e.g., "centella asiatica (madecassoside)")
      if (/centella\s*asiatica\s*\(?(?:aka|also\s*known|=|is)\s*(?:madecassoside|asiaticoside)/i.test(plainText)) {
        issues.push({ category: 'niche-accuracy', message: 'Centella asiatica extract ≠ Madecassoside/Asiaticoside — Madecassoside is ONE isolated compound from centella. Do not treat them as synonyms.', severity: 'error' });
        eeatScore -= 2;
      }
    }

    // 8. Retinol vs Retinal vs Retinoic acid conflation check
    if (/retinol/i.test(plainText) && /retinoic\s*acid/i.test(plainText)) {
      if (/retinol\s*\(?(?:also|aka|=)\s*retinoic/i.test(plainText) || /retinoic\s*acid\s*\(?(?:also|aka|=)\s*retinol/i.test(plainText)) {
        issues.push({ category: 'niche-accuracy', message: 'Retinol ≠ Retinoic acid (tretinoin). Retinol must convert to retinoic acid in skin. Tretinoin is prescription-only. Do not conflate.', severity: 'error' });
        eeatScore -= 2;
      }
    }
    if (/retinal\b/i.test(plainText) && /\bretinol\b/i.test(plainText)) {
      if (/retinal\s*\(?(?:also|aka|=)\s*retinol/i.test(plainText) || /retinol\s*\(?(?:also|aka|=)\s*retinal/i.test(plainText)) {
        issues.push({ category: 'niche-accuracy', message: 'Retinal (retinaldehyde) ≠ Retinol — Retinal is one conversion step closer to retinoic acid, making it stronger. Do not conflate.', severity: 'error' });
        eeatScore -= 1;
      }
    }

    // 9. Hyaluronic acid molecular weight — flag if mentioned without specifying weight
    if (/hyaluronic\s*acid/i.test(plainText) && ['product-review', 'x-vs-y', 'deep-dive', 'best-x-for-y'].includes(contentType)) {
      const hasWeightContext = /(?:low|high|micro|multi|different)\s*(?:molecular)?\s*weight/i.test(plainText) ||
        /\b(?:LMW|HMW)\b/.test(plainText) || /\bDa\b|\bdalton/i.test(plainText) ||
        /(?:penetrat|absorb|surface|deep)\s*(?:layer|skin)/i.test(plainText);
      if (!hasWeightContext) {
        warnings.push({ category: 'niche-accuracy', message: 'K-Beauty HA content should mention molecular weight variants (high MW = surface hydration, low MW = deeper penetration) — a core K-Beauty formulation differentiator', severity: 'warning' });
        eeatScore -= 1;
      }
    }

    // 10. Cruelty-free / vegan claims — must note MFDS functional cosmetics exception
    if (/cruelty.free|not\s*tested\s*on\s*animals/i.test(plainText)) {
      const hasMfdsNote = /(?:MFDS|식품의약품안전처|functional\s*cosmetic|기능성\s*화장품)/i.test(plainText) ||
        /(?:Korea|Korean)\s*(?:ban|banned|prohibit|law|regulation).*animal\s*test/i.test(plainText);
      if (!hasMfdsNote) {
        warnings.push({ category: 'niche-accuracy', message: 'Cruelty-free claim without MFDS context — Korea banned animal testing for general cosmetics (2018), but MFDS functional cosmetics (기능성화장품: brightening, anti-wrinkle, sunscreen) may still require it. Add regulatory context.', severity: 'warning' });
        eeatScore -= 1;
      }
    }

    // 11. "Dermatologist recommended/tested/clinically proven" without source
    const dermatologistClaims = plainText.match(/dermatologist\s*(?:recommended|approved|endorsed)/gi) || [];
    if (dermatologistClaims.length > 0) {
      // Check for nearby source/citation
      for (const claim of dermatologistClaims) {
        const claimIdx = plainText.indexOf(claim);
        const surroundingText = plainText.slice(Math.max(0, claimIdx - 150), claimIdx + claim.length + 150);
        if (!/(?:according\s*to|source|study|published|journal|cited|reference|Dr\.|dermatologist\s+\w+\s+\w+\s+(?:says|recommends|notes))/i.test(surroundingText)) {
          warnings.push({ category: 'niche-accuracy', message: `"${claim}" used without naming the dermatologist or citing a source — risks FTC endorsement guideline violation. Use "dermatologist-tested" (verified claim) or cite the specific professional.`, severity: 'warning' });
          eeatScore -= 1;
          break; // One warning is enough
        }
      }
    }
    if (/clinically\s*proven/i.test(plainText)) {
      const hasStudyCite = /(?:study|trial|published|journal|participants|subjects|double.blind|placebo|p\s*[<>=]|statistically)/i.test(plainText);
      if (!hasStudyCite) {
        warnings.push({ category: 'niche-accuracy', message: '"Clinically proven" used without referencing a specific clinical study — per FTC guidelines, this phrase requires substantiation. Use "clinically tested" or cite the study.', severity: 'warning' });
        eeatScore -= 1;
      }
    }

    // 12a. BHA (Salicylic acid) concentration — Korea OTC limit is 0.5%, US allows 2%
    if (/(?:BHA|salicylic\s*acid)/i.test(plainText) && ['product-review', 'best-x-for-y', 'x-vs-y', 'deep-dive'].includes(contentType)) {
      // Check if 2% BHA is described as Korean OTC product (it's not — 2% is US OTC, Korea limits to 0.5%)
      if (/(?:korean|K-?beauty|olive\s*young|hwahae|MFDS).*2%\s*(?:BHA|salicylic)/i.test(plainText) || /2%\s*(?:BHA|salicylic).*(?:korean|K-?beauty|olive\s*young|hwahae|MFDS)/i.test(plainText)) {
        const hasRegulatoryNote = /(?:Korea|MFDS|한국).*0\.5%|0\.5%.*(?:Korea|MFDS|한국)|US\s*(?:allows|OTC|FDA).*2%/i.test(plainText);
        if (!hasRegulatoryNote) {
          warnings.push({ category: 'niche-accuracy', message: 'BHA 2% described as Korean OTC product — Korea MFDS limits salicylic acid to 0.5% in OTC cosmetics (2% requires quasi-drug classification). Add regulatory context.', severity: 'warning' });
          eeatScore -= 1;
        }
      }
    }

    // 12b. Retinol content MUST warn about pregnancy contraindication
    if (/\bretinol\b|\bretinal\b|\bretinoid/i.test(plainText) && ['product-review', 'best-x-for-y', 'how-to', 'deep-dive'].includes(contentType)) {
      const hasPregnancyWarning = /pregnan.*(?:avoid|contraindic|not\s*(?:safe|recommended)|consult)|(?:avoid|contraindic|not\s*(?:safe|recommended)).*pregnan/i.test(plainText);
      if (!hasPregnancyWarning) {
        warnings.push({ category: 'niche-accuracy', message: 'Retinol/retinoid content missing pregnancy contraindication warning — retinoids are Category X teratogens. Must note "Avoid during pregnancy — consult your healthcare provider."', severity: 'warning' });
        eeatScore -= 1;
      }
    }

    // 12c. AHA concentration warning — 10%+ is a weekly peel, not daily use
    if (/(?:AHA|glycolic|lactic|mandelic)\s*acid/i.test(plainText) && /(?:1[0-9]|[2-9][0-9])%\s*(?:AHA|glycolic|lactic|mandelic)/i.test(plainText)) {
      const hasDailyUseWarning = /(?:weekly|once\s*a\s*week|not\s*(?:for\s*)?daily|peel|exfoli.*frequency|patch\s*test)/i.test(plainText);
      if (!hasDailyUseWarning) {
        warnings.push({ category: 'niche-accuracy', message: 'AHA 10%+ concentration mentioned without frequency guidance — concentrations above 10% are weekly peels, NOT daily-use products. Add usage frequency warning.', severity: 'warning' });
        eeatScore -= 1;
      }
    }

    // 12d. EGF (Epidermal Growth Factor) — popular in Korea but FDA has NOT approved for cosmetic use
    if (/\bEGF\b|epidermal\s*growth\s*factor/i.test(plainText)) {
      const hasFdaDisclaimer = /(?:FDA|US)\s*(?:has\s*)?not\s*(?:approved|cleared)|not\s*FDA|regulatory\s*(?:status|approval)|cosmetic\s*(?:ingredient|use)/i.test(plainText);
      if (!hasFdaDisclaimer) {
        warnings.push({ category: 'niche-accuracy', message: 'EGF (Epidermal Growth Factor) mentioned without regulatory context — FDA has NOT approved EGF for cosmetic use in the US. Note regulatory status for international readers.', severity: 'warning' });
        eeatScore -= 1;
      }
    }

    // 12e. Propolis allergy cross-reaction warning (bee product allergy)
    if (/propolis/i.test(plainText) && ['product-review', 'best-x-for-y', 'how-to', 'deep-dive'].includes(contentType)) {
      const hasAllergyWarning = /(?:bee|honey|pollen)\s*allerg|allerg.*(?:bee|propolis)|patch\s*test.*propolis|propolis.*patch\s*test|cross.?react/i.test(plainText);
      if (!hasAllergyWarning) {
        warnings.push({ category: 'niche-accuracy', message: 'Propolis product content missing allergy warning — propolis can cause cross-reactions in people with bee/pollen allergies. Add "patch test recommended; avoid if allergic to bee products."', severity: 'warning' });
      }
    }

    // 12f. SPF 50+ is the maximum in Korea — SPF 100 is not available in Korean market
    if (/SPF\s*(?:1[0-9]{2}|[2-9][0-9]{2})/i.test(plainText) && /(?:Korean|K-Beauty|K-beauty|Olive\s*Young|MFDS)/i.test(plainText)) {
      warnings.push({ category: 'niche-accuracy', message: 'SPF 100+ referenced in K-Beauty context — Korea (MFDS) caps labeling at SPF 50+. SPF values above 50 are labeled "SPF 50+" in Korean products.', severity: 'warning' });
      eeatScore -= 1;
    }

    // 12g. PDRN/salmon DNA — should note it is a dermatology-origin ingredient, not a traditional cosmetic
    if (/PDRN|salmon\s*DNA/i.test(plainText) && ['product-review', 'best-x-for-y', 'deep-dive'].includes(contentType)) {
      const hasDermaContext = /(?:dermatolog|aesthetic\s*clinic|피부과|injection|meso(?:therapy)?|topical\s*(?:formulation|version|form))/i.test(plainText);
      if (!hasDermaContext) {
        warnings.push({ category: 'niche-accuracy', message: 'PDRN/salmon DNA mentioned without noting its dermatology origin — PDRN originated as an injectable skin regeneration treatment (피부과 시술). Topical K-Beauty PDRN products are a consumer adaptation of this clinical ingredient. Add context for credibility.', severity: 'warning' });
        eeatScore -= 1;
      }
    }

    // 12h. Barrier repair content should mention ceramide:cholesterol:fatty acid ratio
    if (/barrier\s*(?:repair|recovery|restore|damage)/i.test(plainText) && ['product-review', 'best-x-for-y', 'how-to', 'deep-dive'].includes(contentType)) {
      const hasCeramideRatio = /(?:ceramide|cholesterol|fatty\s*acid).*(?:ratio|1:1:1|3:1:1|proportion)/i.test(plainText) ||
        /(?:ratio|proportion).*(?:ceramide|cholesterol|fatty\s*acid)/i.test(plainText);
      if (!hasCeramideRatio && /ceramide/i.test(plainText)) {
        warnings.push({ category: 'niche-accuracy', message: 'Barrier repair content with ceramide mention but missing the optimal lipid ratio context — skin barrier consists of ceramides, cholesterol, and fatty acids in roughly equal proportions. This is a key K-Beauty expertise signal.', severity: 'info' });
      }
    }

    // 12i. "Clean beauty" — unregulated marketing term, no MFDS or FDA definition
    if (/clean\s*beauty/i.test(plainText)) {
      const hasDisclaimer = /no\s*(?:legal|regulatory|standard|universal)\s*definition|marketing\s*term|not\s*(?:regulated|standardized|defined)|varies\s*by\s*brand/i.test(plainText);
      if (!hasDisclaimer) {
        warnings.push({ category: 'niche-accuracy', message: '"Clean beauty" has no legal or regulatory definition in Korea (MFDS) or the US (FDA). Brands define it differently — some exclude parabens/sulfates, others focus on "natural" ingredients. Content should note this is a marketing category, not a safety standard.', severity: 'warning' });
        eeatScore -= 1;
      }
    }

    // 12j. Galactomyces percentage — "95% galactomyces" means 95% of the formula is galactomyces filtrate, NOT 95% purity
    if (/galactomyces\s*(?:ferment)?\s*(?:filtrate)?\s*\d+%/i.test(plainText) || /\d+%\s*galactomyces/i.test(plainText)) {
      if (/(?:purity|pure|concentration)\s*(?:of\s*)?\d+%\s*galactomyces|galactomyces.*\d+%\s*(?:purity|pure|concentration)/i.test(plainText)) {
        warnings.push({ category: 'niche-accuracy', message: 'Galactomyces percentage describes the proportion of galactomyces filtrate IN the formula (e.g., COSRX Galactomyces 95 = 95% of the formula is galactomyces filtrate), NOT the purity or concentration of the active. This is a common AI misinterpretation.', severity: 'warning' });
        eeatScore -= 1;
      }
    }

    // 12k. Sheet mask daily use — Korean dermatologists recommend 1-2x/week, not daily
    if (/sheet\s*mask/i.test(plainText) && ['how-to', 'product-review', 'best-x-for-y'].includes(contentType)) {
      if (/(?:daily|every\s*day|every\s*night|each\s*day)\s*(?:sheet\s*mask|masking)/i.test(plainText)) {
        const hasFrequencyNote = /(?:1.?2\s*times?\s*(?:a|per)\s*week|once\s*(?:a|per)\s*week|2.?3\s*times?\s*(?:a|per)\s*week|not\s*(?:for\s*)?daily|overuse|over.?mask)/i.test(plainText);
        if (!hasFrequencyNote) {
          warnings.push({ category: 'niche-accuracy', message: 'Sheet mask described as daily use without frequency guidance — Korean dermatologists recommend 1-2x/week maximum. Daily masking can over-hydrate and weaken the skin barrier (과수분). Note appropriate frequency.', severity: 'warning' });
          eeatScore -= 1;
        }
      }
    }

    // 12. "Hypoallergenic" as unregulated marketing term
    if (/hypoallergenic/i.test(plainText)) {
      const hasDisclaimer = /no\s*(?:legal|regulatory|standard)\s*definition|marketing\s*term|not\s*(?:regulated|standardized)|does\s*not\s*guarantee/i.test(plainText);
      if (!hasDisclaimer) {
        warnings.push({ category: 'niche-accuracy', message: '"Hypoallergenic" has no legal or regulatory definition in Korea (MFDS) or the US (FDA). Content should note this is a marketing term, not a safety guarantee.', severity: 'warning' });
      }
    }

    // 13. Glutathione oral supplement/drink must have medical disclaimer (distinct from topical serum)
    if (/glutathione\s*(?:drink|supplement|oral|capsule|tablet)|oral\s*glutathione/i.test(plainText)) {
      const hasMedicalDisclaimer = /not\s*a?\s*substitute|consult\s*(?:a|your)\s*(?:doctor|healthcare|physician|dermatologist)|medical\s*advice|healthcare\s*provider|건강기능식품/i.test(plainText);
      if (!hasMedicalDisclaimer) {
        issues.push({ category: 'niche-accuracy', message: 'Oral glutathione supplement/drink mentioned without medical disclaimer — MFDS classifies as "건강기능식품" (Health Functional Food), NOT cosmetic. Must include "not a substitute for medical advice" or "consult healthcare provider."', severity: 'error' });
        eeatScore -= 2;
      }
    }

    // 14. Snail mucin vs galactomyces/SK-II conflation (different categories entirely)
    if (/(SK-?II|Pitera|galactomyces)/i.test(plainText) && /snail\s*(?:mucin|secretion)/i.test(plainText)) {
      if (/(SK-?II|Pitera|galactomyces).*(?:like|similar\s*to|same\s*as).*snail|snail.*(?:like|similar\s*to|same\s*as).*(SK-?II|Pitera|galactomyces)/i.test(plainText)) {
        issues.push({ category: 'niche-accuracy', message: 'SK-II Pitera (galactomyces ferment filtrate) and snail mucin incorrectly compared as similar — Pitera is fermented yeast, snail mucin is natural secretion. These are fundamentally different ingredient categories.', severity: 'error' });
        eeatScore -= 2;
      }
    }

    // 15. Bakuchiol in pregnancy context must include consultation disclaimer
    if (/bakuchiol/i.test(plainText) && /pregnan/i.test(plainText)) {
      const hasConsultNote = /consult\s*(?:your\s*)?(?:healthcare\s*provider|dermatologist|doctor)|medical\s*(?:advice|professional)/i.test(plainText);
      if (!hasConsultNote) {
        warnings.push({ category: 'niche-accuracy', message: 'Bakuchiol mentioned in pregnancy context without medical consultation disclaimer — while bakuchiol is NOT a retinoid, always add "Consult your healthcare provider before starting any new skincare during pregnancy."', severity: 'warning' });
        eeatScore -= 1;
      }
    }

    // 16. SPF 60-99 on Amazon for Korean brands — needs market labeling clarification
    if (/(?:amazon|us\s*market).*SPF\s*(?:[6-9][0-9])/i.test(plainText) && /(?:Korean|K-?Beauty|MFDS)/i.test(plainText)) {
      const hasLabelingNote = /(?:US|Amazon)\s*(?:market|listing|label)|MFDS\s*(?:limits|caps|maximum)|SPF\s*50\+/i.test(plainText);
      if (!hasLabelingNote) {
        warnings.push({ category: 'niche-accuracy', message: 'SPF 60-99 on Amazon for Korean brand without labeling context — Korea MFDS caps at SPF 50+. Clarify: "While Amazon US shows SPF XX, Korea MFDS limits labeling to SPF 50+."', severity: 'warning' });
        eeatScore -= 1;
      }
    }

    // 17. MFDS functional cosmetic efficacy claims — non-functional products CANNOT make treatment claims
    if (['product-review', 'best-x-for-y', 'deep-dive'].includes(contentType)) {
      // Catch strong efficacy claims that require MFDS functional certification
      const strongClaims = /(?:removes?|treats?|eliminates?|cures?|heals?|erases?)\s*(?:acne|wrinkles?|dark\s*spots?|hyperpigmentation|scars?|melasma|rosacea)/i;
      if (strongClaims.test(plainText)) {
        const hasFunctionalContext = /기능성\s*화장품|functional\s*cosmetic|MFDS.{0,30}(?:certif|approv)|may\s*help|known\s*for|supports?|promotes?/i.test(plainText);
        if (!hasFunctionalContext) {
          warnings.push({ category: 'niche-accuracy', message: 'Strong efficacy claim ("removes/treats/eliminates") without MFDS functional cosmetic context — only MFDS-certified 기능성 화장품 can make treatment claims. Use hedged language ("may help," "known for," "supports") for non-functional products.', severity: 'warning' });
          eeatScore -= 2;
        }
      }
    }

    // 18. LED mask content — quasi-medical claims need disclaimer
    if (/LED\s*(?:mask|device|light\s*therapy)/i.test(plainText) && ['product-review', 'best-x-for-y', 'deep-dive'].includes(contentType)) {
      if (/(?:clinical|proven|guaranteed)\s*(?:results?|efficacy|improvement)/i.test(plainText)) {
        const hasDeviceDisclaimer = /results?\s*(?:vary|may\s*differ)|consult\s*(?:a\s*)?dermatologist|not\s*(?:a\s*)?(?:medical|substitute)|complement.*not\s*replace/i.test(plainText);
        if (!hasDeviceDisclaimer) {
          warnings.push({ category: 'niche-accuracy', message: 'LED mask/device with clinical results claim but no disclaimer — add "Results vary by individual" or "LED devices complement but do not replace professional treatments. Consult a dermatologist."', severity: 'warning' });
          eeatScore -= 1;
        }
      }
    }

    // 19. "Whitening" terminology in English-language K-Beauty content — prefer "brightening"
    if (/\bwhitening\b/i.test(plainText) && !/미백|MFDS.*whitening|whitening.*MFDS|product\s*name|official\s*name|despite\s*the\s*(?:product\s*)?name/i.test(plainText)) {
      const whitenCount = (plainText.match(/\bwhitening\b/gi) || []).length;
      if (whitenCount === 1) {
        warnings.push({ category: 'niche-accuracy', message: 'Use \'brightening\' instead of \'whitening\' for K-Beauty content — "whitening" is culturally insensitive in English. Only acceptable when explaining Korea\'s 미백 MFDS category or reproducing an official product name.', severity: 'warning' });
        eeatScore -= 1;
      } else if (whitenCount >= 2) {
        warnings.push({ category: 'niche-accuracy', message: '"Whitening" used multiple times without contextualizing as MFDS 미백 term — use "brightening" for English-language content (cultural sensitivity). Only use "whitening" when explaining the Korean regulatory term or reproducing an official product name.', severity: 'warning' });
        eeatScore -= 1;
      }
    }
  }

  if (category === 'K-Entertainment') {
    // 1. Group label accuracy checks (common AI errors)
    const labelErrors: Array<{ pattern: RegExp; correct: string }> = [
      { pattern: /IVE\b[^.]*\bHYBE\b/i, correct: 'IVE is under Starship Entertainment, NOT HYBE' },
      { pattern: /aespa\b[^.]*\bHYBE\b/i, correct: 'aespa is under SM Entertainment, NOT HYBE' },
      { pattern: /BABYMONSTER\b[^.]*\bHYBE\b/i, correct: 'BABYMONSTER is under YG Entertainment, NOT HYBE' },
      { pattern: /ILLIT\b[^.]*\bADOR\b/i, correct: 'ILLIT is under BELIFT LAB, NOT ADOR' },
      { pattern: /(?:SHINee|EXO|NCT|WHIPLASH|Red Velvet)\b[^.]*\bHYBE\b/i, correct: 'SM Entertainment groups incorrectly attributed to HYBE' },
      { pattern: /QWER\b[^.]*\b(?:JYP|SM|HYBE|YG)\b/i, correct: 'QWER is under Million Market (밀리언마켓), NOT a Big 4 label' },
      { pattern: /\(G\)\s*I-?DLE\b[^.]*\b(?:JYP|SM|HYBE|YG)\b/i, correct: '(G)I-DLE is under Cube Entertainment, NOT a Big 4 label' },
      { pattern: /8TURN\b[^.]*\bJYP\b/i, correct: '8TURN is under MNH Entertainment, NOT JYP' },
      { pattern: /AMPERS.?ONE\b[^.]*\b(?:SM|HYBE)\b/i, correct: 'AMPERS&ONE is under FNC Entertainment, NOT SM/HYBE' },
      { pattern: /MEOVV\b[^.]*\b(?:HYBE|SM|JYP|YG)\b/i, correct: 'MEOVV is under THEBLACKLABEL, NOT a Big 4 label' },
      { pattern: /tripleS\b[^.]*\b(?:SM|HYBE|JYP|YG)\b/i, correct: 'tripleS is under MODHAUS (모드하우스), NOT a Big 4 label' },
      { pattern: /NEXZ\b[^.]*\b(?:SM|HYBE|YG)\b/i, correct: 'NEXZ is under JYP Entertainment (Japan-based group), NOT SM/HYBE/YG' },
    ];
    for (const check of labelErrors) {
      if (check.pattern.test(plainText)) {
        issues.push({ category: 'niche-accuracy', message: `Label error: ${check.correct}`, severity: 'error' });
        eeatScore -= 3;
      }
    }

    // 2. Chart terminology: Gaon (deprecated) vs Circle Chart
    if (/\bGaon\s*[Cc]hart\b/.test(plainText) && !/formerly\s*Gaon|rebranded.*Circle/i.test(plainText)) {
      warnings.push({ category: 'niche-accuracy', message: 'Use \'Circle Chart\' instead of \'Gaon Chart\' (rebranded in 2023). Use "Circle Chart (formerly Gaon)" on first reference', severity: 'warning' });
      eeatScore -= 1;
    }

    // 3. Hanteo vs Circle Chart distinction
    const citesHanteo = /Hanteo/i.test(plainText);
    const citesCircle = /Circle\s*Chart/i.test(plainText);
    if (citesHanteo && citesCircle) {
      // Good — both cited. Check if they're conflated
      if (/Hanteo.*Circle.*(?:same|interchangeable|identical)|Circle.*Hanteo.*(?:same|interchangeable|identical)/i.test(plainText)) {
        warnings.push({ category: 'niche-accuracy', message: 'Hanteo and Circle Chart incorrectly described as same/interchangeable — Hanteo tracks physical album sales (real-time), Circle is the comprehensive official chart', severity: 'warning' });
        eeatScore -= 2;
      }
    }
    // Hanteo + digital streaming conflation: Hanteo is physical-only, not digital
    if (citesHanteo) {
      // Split into sentences and check each
      const sentences = plainText.split(/[.!?]/);
      for (const sentence of sentences) {
        if (/Hanteo/i.test(sentence) && /digital\s*streaming|streaming\s*chart|Melon|Genie|Bugs|Spotify|Apple\s*Music/i.test(sentence)) {
          warnings.push({ category: 'niche-accuracy', message: 'Hanteo Chart measures physical album sales (real-time), NOT digital streaming — do not associate Hanteo with streaming performance in the same sentence', severity: 'warning' });
          eeatScore -= 2;
          break;
        }
      }
    }

    // 4. BTS military status freshness (2026: all completed)
    if (/BTS/i.test(plainText)) {
      const btsMilitaryStale = /BTS\b[^.]*(?:currently\s*serving|still\s*in\s*military|military\s*service\s*(?:is|are)\s*ongoing|awaiting\s*(?:discharge|return))/i.test(plainText);
      if (btsMilitaryStale) {
        issues.push({ category: 'niche-accuracy', message: 'BTS military status outdated — all 7 members completed service by mid-2025. Frame as active comeback era in 2026', severity: 'error' });
        eeatScore -= 3;
      }
    }

    // 5. Award terminology: Daesang vs Bonsang
    if (/daesang|대상/i.test(plainText)) {
      // Check if Daesang is used too loosely (e.g., for every award)
      const daesangCount = (plainText.match(/daesang|대상/gi) || []).length;
      const bonsangCount = (plainText.match(/bonsang|본상/gi) || []).length;
      if (daesangCount > 3 && bonsangCount === 0) {
        warnings.push({ category: 'niche-accuracy', message: 'Multiple Daesang references without distinguishing Bonsang — verify award tier accuracy (Daesang = Grand Prize, only 3-5 per show)', severity: 'warning' });
      }
    }

    // 6. Album format terminology check
    if (/mini\s*album|full\s*album|single\s*album|repackage/i.test(plainText)) {
      // Check for common error: calling a mini album a "full album"
      if (/(?:EP|4|5|6|7)\s*(?:track|song)s?\s*(?:full|studio)\s*album/i.test(plainText)) {
        warnings.push({ category: 'niche-accuracy', message: 'Possible album format error — EP/4-7 tracks is typically a Mini Album (미니앨범), not a full/studio album', severity: 'warning' });
      }
    }

    // 7. Fandom name usage check — should use official fandom name at least once
    const fandomMap: Record<string, string> = {
      'BTS': 'ARMY', 'BLACKPINK': 'BLINK', 'TWICE': 'ONCE', 'SEVENTEEN': 'CARAT',
      'Stray Kids': 'STAY', 'ATEEZ': 'ATINY', 'ENHYPEN': 'ENGENE', 'TXT': 'MOA',
      'aespa': 'MY', 'IVE': 'DIVE', 'LE SSERAFIM': 'FEARNOT',
      'BABYMONSTER': 'MONSTER', 'PLAVE': 'ASTERDOM', 'QWER': 'AUBE',
      'RIIZE': 'BRIIZE', 'BOYNEXTDOOR': 'ONEDOOR',
      'ILLIT': 'LLIT', 'KISS OF LIFE': 'KISSY',
      'tripleS': 'LOVElution', 'WHIPLASH': 'WHIPPERS',
      'NCT WISH': 'WISHING', 'KATSEYE': 'EMBERS',
      'ITZY': 'MIDZY', 'NMIXX': 'NSWer',
    };
    for (const [group, fandom] of Object.entries(fandomMap)) {
      const groupRegex = new RegExp(`\\b${group.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      const groupMentions = (plainText.match(groupRegex) || []).length;
      if (groupMentions >= 5) {
        const fandomRegex = new RegExp(`\\b${fandom}\\b`, 'i');
        if (!fandomRegex.test(plainText)) {
          warnings.push({ category: 'niche-accuracy', message: `${group} mentioned ${groupMentions} times without using official fandom name "${fandom}" — signals unfamiliarity with fan culture`, severity: 'warning' });
          eeatScore -= 1;
          break; // Only warn about one group to avoid flooding
        }
      }
    }

    // 8. K-Entertainment E-E-A-T: should cite entertainment sources, NOT financial sources
    const financeSources = /\b(?:BOK|Bank of Korea|KRX|DART|KOSIS|FSC)\b/i;
    if (financeSources.test(plainText)) {
      warnings.push({ category: 'niche-accuracy', message: 'K-Entertainment content cites financial/economic sources (BOK/KRX/DART) — should use entertainment sources (Hanteo, Circle Chart, KOCCA, Melon)', severity: 'warning' });
      eeatScore -= 2;
    }

    // 9. NewJeans/NJZ post-2025 naming accuracy
    if (/NewJeans/i.test(plainText)) {
      // Check for definitively stating "NewJeans is now called NJZ" (legal situation still contested)
      if (/NewJeans\s*(?:is|are|has been|was)\s*(?:now|officially)\s*(?:called|renamed|rebranded)\s*(?:to\s*)?NJZ/i.test(plainText)) {
        warnings.push({ category: 'niche-accuracy', message: 'NewJeans/NJZ naming stated as settled fact — the group name trademark is still legally contested. Use hedged language.', severity: 'warning' });
        eeatScore -= 1;
      }
    }

    // 10. 초동 (first week sales) — important K-pop metric; must specify chart source when citing
    if (/초동|first.?week\s*(?:album\s*)?sales/i.test(plainText)) {
      const hasChartSource = /(?:Hanteo|Circle\s*Chart)/i.test(plainText);
      if (!hasChartSource) {
        warnings.push({ category: 'niche-accuracy', message: '초동 (first week sales) cited without specifying chart source — must note Hanteo (real-time physical) or Circle Chart (comprehensive). Hanteo is the standard 초동 benchmark.', severity: 'warning' });
        eeatScore -= 1;
      }
    }

    // 11. OTT viewership metric conflation — broadcast ratings vs OTT metrics are not comparable
    if (/(?:Netflix|TVING|Disney\+|Coupang\s*Play|Wavve)/i.test(plainText) && /(?:viewership\s*rat(?:e|ing)|시청률|%\s*(?:rating|viewership))/i.test(plainText)) {
      const hasMetricDisclaimer = /(?:not\s*(?:directly\s*)?comparable|different\s*(?:metric|measurement|audience)|view\s*hours|completion\s*rate|household\s*rating)/i.test(plainText);
      if (!hasMetricDisclaimer) {
        warnings.push({ category: 'niche-accuracy', message: 'OTT platform metrics mentioned alongside broadcast ratings without noting they are not comparable — broadcast uses AGB Nielsen household %, OTT uses view hours/completion rate.', severity: 'warning' });
        eeatScore -= 1;
      }
    }

    // 12. tripleS label accuracy — MODHAUS, not Big 4
    if (/tripleS\b/i.test(plainText) && /\b(?:SM|HYBE|JYP|YG)\b/.test(plainText)) {
      if (/tripleS\b[^.]*\b(?:SM|HYBE|JYP|YG)\s*(?:Entertainment|Records)?/i.test(plainText)) {
        issues.push({ category: 'niche-accuracy', message: 'Label error: tripleS is under MODHAUS (모드하우스), NOT a Big 4 label', severity: 'error' });
        eeatScore -= 3;
      }
    }

    // 13. Music show win specificity — "won a music show" without naming which show signals non-fan content
    if (/(?:won|winning)\s*(?:a|the)\s*music\s*show/i.test(plainText) && !/(?:Inkigayo|Music\s*Bank|M\s*Countdown|Show\s*Champion|Music\s*Core)/i.test(plainText)) {
      warnings.push({ category: 'niche-accuracy', message: '"Won a music show" without naming the specific show (Inkigayo, Music Bank, M Countdown, Show Champion, Music Core) — signals non-fan content. Always specify which show.', severity: 'warning' });
      eeatScore -= 1;
    }

    // 14. Spotify Korea context — growing but secondary to Melon for domestic streaming
    if (/Spotify\s*Korea/i.test(plainText) && /(?:#1|number\s*one|dominant|leading|most\s*popular)\s*(?:streaming|platform)/i.test(plainText)) {
      warnings.push({ category: 'niche-accuracy', message: 'Spotify Korea described as dominant/leading — Melon remains the #1 domestic streaming platform in Korea (~65% market share). Spotify Korea is growing but secondary for Korean-language music.', severity: 'warning' });
      eeatScore -= 1;
    }

    // 15. TVING-Wavve merger (2025) — should not describe as separate competing platforms
    if (/TVING/i.test(plainText) && /Wavve/i.test(plainText)) {
      if (/TVING\s*(?:vs|versus|or|compared\s*to|against)\s*Wavve|Wavve\s*(?:vs|versus|or|compared\s*to|against)\s*TVING/i.test(plainText)) {
        warnings.push({ category: 'niche-accuracy', message: 'TVING and Wavve described as separate competing platforms — they completed a merger in 2025 (TVING absorbed Wavve). Platform integration is still ongoing as of 2026 but they are the same entity. Use "TVING (which merged with Wavve in 2025)" on first reference.', severity: 'warning' });
        eeatScore -= 1;
      }
    }

    // 16. Sasaeng (사생) content — must not normalize or sensationalize stalking behavior
    if (/sasaeng|사생|stalking\s*(?:fan|idol)|(?:fan|idol)\s*stalking/i.test(plainText)) {
      const hasDisapprovalContext = /(?:illegal|harmful|invasion\s*of\s*privacy|violat|unacceptable|problem|danger|concern|condemn|wrong|serious\s*issue|criminal)/i.test(plainText);
      if (!hasDisapprovalContext) {
        issues.push({ category: 'niche-accuracy', message: 'Sasaeng (사생) content without clear condemnation — sasaeng behavior is illegal stalking/invasion of privacy. Content MUST explicitly frame it as harmful and unacceptable. Never normalize or sensationalize.', severity: 'error' });
        eeatScore -= 3;
      }
    }

    // 17. Chart all-kill (음원 올킬) vs music show all-kill (음방 올킬) conflation
    if (/all.?kill|올킬/i.test(plainText)) {
      // Check if "all-kill" is used without specifying chart or music show context
      const hasChartContext = /(?:chart|streaming|Melon|Genie|music\s*show|Inkigayo|Music\s*Bank|M\s*Countdown|음방|음원)/i.test(plainText);
      if (!hasChartContext) {
        warnings.push({ category: 'niche-accuracy', message: '"All-kill" used without context — distinguish between 음원 올킬 (chart all-kill: #1 on all major streaming platforms simultaneously) and 음방 올킬 (music show all-kill: winning all 5 weekly music shows). PAK (Perfect All-Kill) = #1 on all real-time AND daily charts simultaneously — the highest digital achievement.', severity: 'warning' });
        eeatScore -= 1;
      }
    }

    // 18. Coupang Play — growing K-drama OTT platform, should not be omitted in streaming comparisons
    if (/(?:streaming|OTT|platform)\s*(?:comparison|ranked|guide|which)/i.test(plainText) &&
        /Netflix|TVING|Disney\+/i.test(plainText) &&
        !/Coupang\s*Play/i.test(plainText)) {
      warnings.push({ category: 'niche-accuracy', message: 'K-drama streaming comparison missing Coupang Play (쿠팡플레이) — Korea\'s fastest-growing OTT platform (backed by Coupang, exclusive originals). Should be included in 2026 K-drama platform comparisons.', severity: 'info' });
    }
  }

  // ── Cross-niche K-Beauty accuracy checks ──
  if (category === 'K-Beauty') {
    // MFDS vs FDA conflation check — Korean sunscreens are MFDS-approved, NOT FDA-approved
    if (/FDA.{0,30}(?:approv|certif|register).{0,30}(?:Korean|K-Beauty|K-beauty)/i.test(plainText) ||
        /(?:Korean|K-Beauty|K-beauty).{0,30}FDA.{0,30}(?:approv|certif|register)/i.test(plainText)) {
      issues.push({ category: 'niche-accuracy', message: 'K-Beauty products are MFDS-approved (식품의약품안전처), NOT FDA-approved — these are separate regulatory bodies', severity: 'error' });
      eeatScore -= 2;
    }

    // 13. Brand parent company accuracy checks (common AI errors)
    const brandErrors: Array<{ pattern: RegExp; correct: string }> = [
      { pattern: /Goodal\b[^.]*\bglutathione/i, correct: 'Goodal is known for its Green Tangerine (vitamin C) line, NOT glutathione — do not conflate' },
      { pattern: /glutathione\b[^.]*\bGoodal\s*Green\s*Tangerine/i, correct: 'Goodal Green Tangerine is a vitamin C line, NOT glutathione — the Goodal glutathione product is "Youth Cream"' },
      { pattern: /COSRX\b[^.]*\b(?:Amore\s*Pacific|AmorePacific|LG\s*H&H)/i, correct: 'COSRX was acquired by L\'Oréal in 2024, NOT Amorepacific or LG H&H' },
      { pattern: /Dr\.?\s*Jart\+?\b[^.]*\b(?:Amore|LG\s*H&H|Korean\s*owned)/i, correct: 'Dr.Jart+ was acquired by Estée Lauder Companies in 2019 — it is now a global luxury portfolio brand' },
      { pattern: /(?:Innisfree|Laneige|Etude|Sulwhasoo|ILLIYOON|Mamonde|IOPE)\b[^.]*\bLG\s*H&H/i, correct: 'These are Amorepacific brands, NOT LG H&H — LG H&H owns The Face Shop, Sum37, O HUI, belif' },
      { pattern: /(?:The\s*Face\s*Shop|belif|Sum\s*37|O\s*HUI|CNP)\b[^.]*\bAmore\s*Pacific/i, correct: 'These are LG H&H (LG생활건강) brands, NOT Amorepacific' },
    ];
    for (const check of brandErrors) {
      if (check.pattern.test(plainText)) {
        warnings.push({ category: 'niche-accuracy', message: `Brand error: ${check.correct}`, severity: 'warning' });
        eeatScore -= 2;
      }
    }

    // 13b. Brand name spelling consistency (common AI errors — exact brand names matter for SEO + trust)
    const brandNameErrors: Array<{ pattern: RegExp; correct: string }> = [
      { pattern: /\bCosrx\b|\bcosrx\b/, correct: 'COSRX (all caps — official brand name)' },
      { pattern: /\bSkin ?1004\b(?!.*Madagascar)/i, correct: 'SKIN1004 (no space, all caps — brand name; full product line is "SKIN1004 Madagascar Centella")' },
      { pattern: /\bBeauty of joseon\b/, correct: 'Beauty of Joseon (capitalize "Joseon")' },
      { pattern: /\bDr\.?\s*jart\b/i, correct: 'Dr.Jart+ (include the +)' },
      { pattern: /\bIlliyoon\b/, correct: 'ILLIYOON (all caps — Amorepacific official)' },
      { pattern: /\bPurito\b/, correct: 'PURITO (all caps — official brand name)' },
      { pattern: /\bNacific\b/, correct: 'NACIFIC (all caps — official brand name)' },
      { pattern: /\bAmple ?n\b/i, correct: 'AMPLE:N (all caps with colon — official)' },
      { pattern: /\bIsn ?tree\b/, correct: 'Isntree (lowercase t — official)' },
      { pattern: /\bTirtir\b|\btirtir\b/, correct: 'TIRTIR (all caps — official; Korean: 티르티르)' },
      { pattern: /\bNumbuzin\b/, correct: 'Numbuzin (lowercase — official); check if intended No.5 serum' },
      { pattern: /\bTorriden\b/, correct: 'Torriden (capital T, lowercase rest — official; Korean: 토리든)' },
      { pattern: /\bBio ?dance\b/, correct: 'Biodance (one word, capital B — official)' },
      { pattern: /\bD'alba\b|\bd'Alba\b/, correct: "d'Alba (lowercase d, capital A — official; Korean: 달바)" },
      { pattern: /\bRound ?lab\b/, correct: 'Round Lab (two words, both capitalized — official; Korean: 라운드랩)' },
      { pattern: /\bMix ?soon\b/, correct: 'Mixsoon (one word, capital M — official; Korean: 믹순)' },
      { pattern: /\bharuharu\b/, correct: 'Haruharu Wonder (full brand name; Korean: 하루하루원더)' },
    ];
    for (const check of brandNameErrors) {
      if (check.pattern.test(plainText)) {
        warnings.push({ category: 'niche-accuracy', message: `Brand name error: ${check.correct}`, severity: 'warning' });
        // No score penalty — informational, but important for brand credibility
        break; // Only warn about first instance to avoid flooding
      }
    }

    // 13c. Olive Young link check for pricing content — if pricing mentioned, should link to OY
    if (['product-review', 'best-x-for-y'].includes(contentType)) {
      const mentionsOliveYoungPrice = /olive\s*young.*(?:₩|\$|price|won)/i.test(plainText) || /(?:₩|\$|price|won).*olive\s*young/i.test(plainText);
      if (mentionsOliveYoungPrice) {
        const hasOliveYoungLink = /oliveyoung\.co\.kr|oliveyoung\.com/i.test(html);
        if (!hasOliveYoungLink) {
          warnings.push({ category: 'niche-accuracy', message: 'Olive Young pricing mentioned without linking to oliveyoung.co.kr or oliveyoung.com — add source link for price verification', severity: 'warning' });
        }
      }
    }

    // 13d. Post-procedure skincare content MUST have dermatologist disclaimer
    if (/(?:laser|chemical\s*peel|botox|filler|microneedl|dermapen|IPL|RF\s*(?:lifting|treatment))\s*(?:after|post|recovery|homecare)/i.test(plainText) ||
        /(?:after|post)\s*(?:laser|chemical\s*peel|botox|filler|microneedl)/i.test(plainText)) {
      const hasDermDisclaimer = /consult\s*(?:a|your)\s*(?:dermatologist|doctor|physician|healthcare)|professional\s*(?:guidance|advice)|medical\s*advice/i.test(plainText);
      if (!hasDermDisclaimer) {
        issues.push({ category: 'niche-accuracy', message: 'Post-procedure skincare content MISSING dermatologist disclaimer — "Consult your dermatologist for personalized post-treatment care" is mandatory for procedure-related content', severity: 'error' });
        eeatScore -= 3;
      }
    }

    // 14. Korean toner described as "astringent" or "pH-balancing" (Western toner conflation)
    if (/korean\s*toner|K-?beauty\s*toner|토너/i.test(plainText)) {
      if (/toner\b[^.]{0,50}(?:astringent|strip|pH.?balanc|pore.?tighten)/i.test(plainText) &&
          !/(?:except|unless|unlike|not\s*an?\s*astringent|different\s*from\s*western)/i.test(plainText)) {
        warnings.push({ category: 'niche-accuracy', message: 'Korean toner (수분 토너) described as astringent/pH-balancing — Korean toners are hydrating, NOT astringent. This is the most common Western ↔ Korean toner conflation.', severity: 'warning' });
        eeatScore -= 2;
      }
    }

    // 15. Skincare step ordering errors (incorrect order signals AI content)
    const orderPatterns: Array<{ pattern: RegExp; correct: string }> = [
      { pattern: /(?:cream|moisturizer)\b[^.]{0,30}(?:before|then)\s*(?:toner|essence|serum)/i, correct: 'Cream/moisturizer placed before toner/essence/serum — correct order: Toner → Essence → Serum → Cream' },
      { pattern: /sunscreen\b[^.]{0,30}(?:before|then)\s*(?:moisturizer|cream|serum)/i, correct: 'Sunscreen placed before moisturizer/cream — sunscreen is the LAST step in AM routine' },
      { pattern: /serum\b[^.]{0,30}(?:before|then)\s*(?:toner|클렌저)/i, correct: 'Serum placed before toner — correct order: Cleanser → Toner → Essence → Serum' },
    ];
    // Only check in how-to and product-review that discuss routines
    if (/routine|step|order|layer/i.test(plainText) && ['how-to', 'product-review', 'best-x-for-y', 'listicle'].includes(contentType)) {
      for (const check of orderPatterns) {
        if (check.pattern.test(plainText)) {
          warnings.push({ category: 'niche-accuracy', message: `Skincare step order error: ${check.correct}`, severity: 'warning' });
          eeatScore -= 1;
          break;
        }
      }
    }

    // 16. Skin type suitability check extended to best-x-for-y (not just product-review)
    if (contentType === 'best-x-for-y') {
      const hasSkinType = /(?:oily|dry|combination|sensitive|acne.prone)\s*skin/i.test(plainText);
      if (!hasSkinType) {
        warnings.push({ category: 'niche-accuracy', message: 'K-Beauty best-x-for-y content missing skin type suitability mentions (oily/dry/combination/sensitive/acne-prone)', severity: 'warning' });
        structureScore -= 1;
      }
    }

    // 17. x-vs-y content MUST include comparison table
    if (contentType === 'x-vs-y') {
      const hasComparisonTable = /<table[\s>]/i.test(plainText) || /comparison\s*table|head.to.head|side.by.side/i.test(plainText);
      if (!hasComparisonTable) {
        warnings.push({ category: 'niche-accuracy', message: 'K-Beauty x-vs-y content missing comparison table — readers expect structured head-to-head comparison', severity: 'warning' });
        structureScore -= 2;
      }
    }

    // 18. Price disclaimer severity upgrade for product-review (was warning, now deducts score)
    if (contentType === 'product-review') {
      const hasPricing = /\$\d+|\₩[\d,]+|price|pricing|cost/i.test(plainText);
      const hasPriceDisclaimer = /prices?\s*(?:verified|checked|as of)|prices?\s*vary\s*frequently/i.test(plainText);
      if (hasPricing && !hasPriceDisclaimer) {
        structureScore -= 1; // Additional penalty beyond the warning already issued above
      }
    }

    // 19. Pregnancy skincare content MUST include healthcare provider disclaimer
    if (/pregnan/i.test(plainText)) {
      const hasHealthcareDisclaimer = /consult\s*(?:a|your)\s*(?:doctor|healthcare|physician|ob.?gyn|dermatologist|provider)|medical\s*(?:advice|professional)/i.test(plainText);
      if (!hasHealthcareDisclaimer) {
        issues.push({ category: 'niche-accuracy', message: 'Pregnancy skincare content MISSING healthcare provider disclaimer — "Consult your healthcare provider" is mandatory for pregnancy-related skincare recommendations', severity: 'error' });
        eeatScore -= 3;
      }
    }

    // 20. Pitera™ vs generic galactomyces — must distinguish when both mentioned
    if (/pitera/i.test(plainText) && /galactomyces/i.test(plainText)) {
      if (/pitera\s*(?:=|is\s*(?:just|basically)?\s*(?:the\s*same|identical|equivalent)\s*(?:as|to))\s*galactomyces/i.test(plainText) ||
          /galactomyces\s*(?:=|is\s*(?:just|basically)?\s*(?:the\s*same|identical|equivalent)\s*(?:as|to))\s*pitera/i.test(plainText)) {
        warnings.push({ category: 'niche-accuracy', message: 'Pitera™ is SK-II\'s proprietary galactomyces strain — it is NOT identical to generic Galactomyces Ferment Filtrate used by other brands. Always distinguish when comparing.', severity: 'warning' });
        eeatScore -= 1;
      }
    }

    // 21. "10-step routine" presented as current Korean norm
    if (/10.step\s*(?:korean|K-?beauty)/i.test(plainText) && !contentType.includes('deep-dive')) {
      const acknowledgesEvolution = /skip.care|간소화|minimalist|evolved|moved\s*(?:away|beyond|on)|contemporary|modern\s*Korean/i.test(plainText);
      if (!acknowledgesEvolution) {
        warnings.push({ category: 'niche-accuracy', message: '10-step K-Beauty routine presented without acknowledging skip-care evolution — modern Koreans use minimalist routines. Frame 10-step as historical foundation, not current norm.', severity: 'warning' });
        eeatScore -= 1;
      }
    }

    // 22. Essence vs serum vs ampoule conflation check
    if (/essence\s*(?:=|is\s*(?:the\s*same|identical|just)\s*(?:as|to))\s*serum/i.test(plainText) ||
        /serum\s*(?:=|is\s*(?:the\s*same|identical|just)\s*(?:as|to))\s*(?:essence|ampoule)/i.test(plainText) ||
        /ampoule\s*(?:=|is\s*(?:the\s*same|identical|just)\s*(?:as|to))\s*(?:serum|essence)/i.test(plainText)) {
      warnings.push({ category: 'niche-accuracy', message: 'Essence ≠ Serum ≠ Ampoule — these are distinct K-Beauty product formats with different concentrations and textures. Do not treat as interchangeable.', severity: 'warning' });
      eeatScore -= 1;
    }

    // 23. "Whitening" vs "Brightening" terminology — critical cultural/regulatory distinction
    // Korea's MFDS category is 미백 (literally "whitening") but English content must use "brightening"
    // Using "whitening" in English is culturally insensitive and signals lack of global market awareness
    const whiteningMentions = (plainText.match(/\bwhitening\b/gi) || []).length;
    const brighteningMentions = (plainText.match(/\bbrightening\b/gi) || []).length;
    if (whiteningMentions > 0) {
      // Allow "whitening" when explaining the Korean regulatory term 미백 OR in official product names
      const hasRegulatoryContext = /미백|MFDS\s*(?:category|classification|term)|(?:Korean|Korea)\s*(?:regulatory|regulation).*whitening|whitening\s*\(.*미백/i.test(plainText);
      // Exception: official product names that use "Whitening" (e.g., NACIFIC Phyto Niacin Whitening Essence)
      const hasOfficialProductName = /NACIFIC\s*Phyto\s*Niacin\s*Whitening|(?:despite|official)\s*(?:the\s*)?(?:product\s*)?name.*whitening|whitening.*(?:official|brand)\s*name/i.test(plainText);
      if (!hasRegulatoryContext && !hasOfficialProductName) {
        warnings.push({ category: 'niche-accuracy', message: `"Whitening" used ${whiteningMentions} time(s) without regulatory context — use "brightening" for English audiences. "Whitening" is culturally problematic and signals market unawareness. Only acceptable when explaining Korea's 미백 MFDS category.`, severity: 'warning' });
        eeatScore -= 2;
      }
    }

    // 24. pH range validation for acid products — pH is critical for efficacy
    // AHA/BHA work at pH 3-4; if pH mentioned, it should be within realistic ranges
    if (/(?:AHA|BHA|glycolic|salicylic|lactic|mandelic)\s*acid/i.test(plainText)) {
      const phMentions = plainText.match(/pH\s*(?:of\s*)?([\d.]+)/gi) || [];
      for (const phMatch of phMentions) {
        const phValue = parseFloat(phMatch.replace(/pH\s*(?:of\s*)?/i, ''));
        if (!isNaN(phValue) && (phValue < 1.0 || phValue > 7.0)) {
          warnings.push({ category: 'niche-accuracy', message: `Unrealistic pH value ${phValue} for acid skincare product — AHA/BHA products typically range pH 3.0-4.0, toners pH 5.0-6.5`, severity: 'warning' });
          eeatScore -= 1;
          break;
        }
      }
    }

    // 25. SPF reapplication guidance — sunscreen content should mention reapplication
    if (/sunscreen|spf|sun\s*protection/i.test(plainText) && ['product-review', 'best-x-for-y', 'how-to', 'deep-dive'].includes(contentType)) {
      const hasReapplicationGuidance = /reappl|every\s*(?:2|two)\s*hours|retouch|sun\s*stick.*reappl|재도포/i.test(plainText);
      if (!hasReapplicationGuidance) {
        warnings.push({ category: 'niche-accuracy', message: 'K-Beauty sunscreen content missing reapplication guidance — "reapply every 2 hours" is fundamental sunscreen science and a core expert signal', severity: 'warning' });
        eeatScore -= 1;
      }
    }

    // 26. EWG score misuse — EWG is not a regulatory body
    if (/EWG\s*(?:score|rating|grade|rank|certified|approved|safe)/i.test(plainText)) {
      const hasEwgDisclaimer = /EWG\s*(?:is\s*)?(?:not|isn.t)\s*(?:a\s*)?(?:regulatory|government|official)|advocacy\s*group|non.?profit|not\s*(?:a\s*)?(?:scientific|regulatory)\s*(?:body|authority|agency)/i.test(plainText);
      if (!hasEwgDisclaimer) {
        warnings.push({ category: 'niche-accuracy', message: 'EWG rating cited without noting EWG is an advocacy group, NOT a regulatory or scientific body — its methodology is debated by dermatologists and cosmetic chemists', severity: 'warning' });
        eeatScore -= 1;
      }
    }

    // 27. "Natural = Safe" fallacy check — natural ingredients are not inherently safer
    if (/(?:natural|plant.based|organic)\s*(?:so|therefore|means|thus|hence|making\s*it)\s*(?:safe|gentle|non.?toxic|harmless)/i.test(plainText) ||
        /(?:safe|gentle)\s*(?:because|since)\s*(?:it.?s|it\s*is|they\s*are)\s*(?:natural|plant.based|organic)/i.test(plainText) ||
        /(?:since|because)\s*(?:it.?s|it\s*is)\s*(?:natural|plant.based|organic).{0,20}(?:safe|gentle|harmless)/i.test(plainText)) {
      warnings.push({ category: 'niche-accuracy', message: '"Natural = safe" fallacy detected — natural ingredients can cause allergic reactions and irritation (e.g., essential oils, citrus extracts). Expert content should note that natural ≠ automatically gentle/safe.', severity: 'warning' });
      eeatScore -= 1;
    }

    // 27b. Before/after imagery — AI-generated before/after images are FTC violations
    if (/before\s*(?:and|&|\/)\s*after/i.test(plainText) && /\bAI\b|generated|illustration/i.test(html)) {
      const hasBeforeAfterImg = /<img[^>]*(?:before|after)[^>]*>/i.test(html);
      if (hasBeforeAfterImg) {
        warnings.push({ category: 'niche-accuracy', message: 'Possible AI-generated before/after image detected — AI-generated before/after images violate FTC guidelines on deceptive advertising. Only use real user photos with consent.', severity: 'warning' });
        eeatScore -= 2;
      }
    }

    // 28. PAO (Period After Opening) mention for product reviews
    if (contentType === 'product-review') {
      const hasPaoMention = /(?:PAO|period\s*after\s*opening|shelf\s*life|expir(?:y|ation)|개봉\s*후|사용\s*기한|유통\s*기한|\d+M\s*(?:symbol|icon|after\s*opening))/i.test(plainText);
      if (!hasPaoMention) {
        warnings.push({ category: 'niche-accuracy', message: 'K-Beauty product review missing PAO (Period After Opening) or shelf life info — essential for vitamin C, retinol, and preservative-free products', severity: 'warning' });
        // No score deduction — informational, not critical
      }
    }

    // 29. Olive Young Korea vs Olive Young Global price conflation
    if (['product-review', 'best-x-for-y'].includes(contentType)) {
      const citesKrwPrice = /₩[\d,]+|(?:\d{1,3},?\d{3})\s*(?:원|KRW|won)/i.test(plainText);
      const linksGlobalStore = /global(?:store)?\.oliveyoung\.com/i.test(html);
      if (citesKrwPrice && linksGlobalStore) {
        const hasPriceDiffNote = /(?:global|international)\s*(?:store|site).*(?:higher|more expensive|differ|markup)|(?:20|30|40|50)%\s*(?:higher|more|markup)/i.test(plainText);
        if (!hasPriceDiffNote) {
          warnings.push({ category: 'niche-accuracy', message: 'KRW pricing cited with Olive Young Global link — Olive Young Global prices are 20-40% higher than domestic Olive Young Korea. Note the price difference to avoid reader trust issues.', severity: 'warning' });
          eeatScore -= 1;
        }
      }
    }

    // 30. "Fragrance-free" vs "unscented" conflation — distinct terms in Korean cosmetics
    if (/fragrance.free/i.test(plainText) && /unscented/i.test(plainText)) {
      if (/fragrance.free\s*(?:=|is\s*(?:the\s*same|identical|equivalent)\s*(?:as|to))\s*unscented/i.test(plainText) ||
          /unscented\s*(?:=|is\s*(?:the\s*same|identical|equivalent)\s*(?:as|to))\s*fragrance.free/i.test(plainText)) {
        warnings.push({ category: 'niche-accuracy', message: '"Fragrance-free" (향료 무첨가) ≠ "Unscented" (무향) — unscented products can use masking fragrances, fragrance-free prohibits all fragrance ingredients. Critical distinction for sensitive skin recommendations.', severity: 'warning' });
        eeatScore -= 1;
      }
    }

    // 31. Price disclaimer asymmetry fix — best-x-for-y also deducts score (like product-review Rule 18)
    if (contentType === 'best-x-for-y') {
      const hasPricing = /\$\d+|\₩[\d,]+|price|pricing|cost/i.test(plainText);
      const hasPriceDisclaimer = /prices?\s*(?:verified|checked|as of)|prices?\s*vary\s*frequently/i.test(plainText);
      if (hasPricing && !hasPriceDisclaimer) {
        structureScore -= 1;
      }
    }
  }

  // Clamp scores to 0
  titleScore = Math.max(0, titleScore);
  excerptScore = Math.max(0, excerptScore);
  structureScore = Math.max(0, structureScore);
  seoScore = Math.max(0, seoScore);
  readabilityScore = Math.max(0, readabilityScore);
  eeatScore = Math.max(0, eeatScore);

  const total = titleScore + excerptScore + structureScore + seoScore + readabilityScore + eeatScore + experienceScore;

  return {
    total,
    breakdown: {
      titleScore,
      excerptScore,
      structureScore,
      seoScore,
      readabilityScore,
      eeatScore,
      experienceScore,
    },
    issues,
    warnings,
  };
}

/**
 * Auto-fix common content issues where possible.
 * Returns modified HTML and list of fixes applied.
 */
export function autoFixContent(
  html: string,
  title: string,
  keyword: string,
  excerpt?: string,
): { html: string; title: string; excerpt?: string; fixes: string[] } {
  const fixes: string[] = [];

  // 0. Excerpt: check if primary keyword appears anywhere in the excerpt (not just start)
  // Do NOT mechanically prepend keyword — it creates AI-detectable patterns
  if (excerpt) {
    const keywordWords = keyword.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    const excerptLower = excerpt.toLowerCase();
    const keywordPresent = keywordWords.some(w => excerptLower.includes(w));
    if (!keywordPresent && keywordWords.length > 0) {
      // Log a warning instead of forcing — let content generator handle it naturally
      fixes.push(`Warning: excerpt missing keyword fragments — consider regenerating`);
    }
  }

  // 1. Title length: trim if over 70 chars
  if (title.length > 70) {
    const trimmed = title.slice(0, 67) + '...';
    fixes.push(`Title trimmed from ${title.length} to 70 chars`);
    title = trimmed;
  }

  // 2. Wrap tables with overflow-x:auto for mobile (catch ALL <table> tags, not just styled ones)
  if (html.includes('<table') && !html.includes('ab-table-wrap')) {
    html = html.replace(
      /<table(\s[^>]*)?>/g,
      (_match, attrs) => {
        return `<div class="ab-table-wrap"><table${attrs || ''}>`;
      },
    );
    html = html.replace(/<\/table>/g, '</table></div>');
    fixes.push('Wrapped tables with ab-table-wrap for mobile scrolling');
  }

  // 3. Ensure all external links have rel="noopener noreferrer"
  html = html.replace(
    /<a\s+([^>]*target="_blank"[^>]*)>/gi,
    (match, attrs) => {
      if (!/rel=/.test(attrs)) {
        fixes.push('Added rel="noopener noreferrer" to external links');
        return `<a ${attrs} rel="noopener noreferrer">`;
      }
      return match;
    },
  );

  // 4. Add hedging to bare current-year statistics (e.g., "$5.2B in 2026" → "an estimated $5.2B in 2026")
  const currentYear = new Date().getFullYear();
  const hedgingPhrases = ['estimated', 'projected', 'forecast', 'approximately', 'according to', 'recent data', 'industry sources', 'as of'];
  // Match sentences with current-year monetary/percentage figures that lack hedging
  html = html.replace(
    new RegExp(`([^.!?]*\\b${currentYear}\\b[^.!?]*(?:\\$[\\d,.]+[BMK]?|\\d+(?:\\.\\d+)?%))[^.!?]*[.!?]`, 'g'),
    (sentence) => {
      const lower = sentence.toLowerCase();
      const hasHedging = hedgingPhrases.some(h => lower.includes(h));
      if (!hasHedging && /\$[\d,.]+[BMK]?|\d+(?:\.\d+)?%/.test(sentence)) {
        // Only fix if it's a declarative stat without attribution
        const hasAttribution = /according|report|data|source|study|survey|analyst/i.test(sentence);
        if (!hasAttribution) {
          fixes.push(`Added hedging to unverified ${currentYear} statistic`);
          return sentence.replace(/(\$[\d,.]+[BMK]?)/, 'an estimated $1');
        }
      }
      return sentence;
    },
  );

  // 4b. Hedge large monetary claims ($X billion/million) without any year context
  html = html.replace(
    /([^.!?]*\$[\d,.]+\s*(?:billion|million|trillion)\b[^.!?]*[.!?])/gi,
    (sentence) => {
      const lower = sentence.toLowerCase();
      const alreadyHedged = hedgingPhrases.some(h => lower.includes(h));
      const hasAttribution = /according|report|data|source|study|survey|analyst/i.test(sentence);
      if (!alreadyHedged && !hasAttribution) {
        fixes.push('Added hedging to large monetary claim');
        return sentence.replace(/(\$[\d,.]+\s*(?:billion|million|trillion))/i, 'an estimated $1');
      }
      return sentence;
    },
  );

  // 5. Ensure featured snippet box has proper schema markup for Google
  if (html.includes('class="ab-snippet"') && !html.includes('data-snippet-type')) {
    // Detect snippet type and add data attribute for potential schema.org enhancement
    const isHowToSnippet = /<div class="ab-snippet">[^]*?(?:<ol[^>]*>.*?<li.*?step|numbered\s+steps)/is.test(html);
    const isTableSnippet = /<div class="ab-snippet">[^]*?<table/i.test(html);
    const isListSnippet = /<div class="ab-snippet">[^]*?<ol/i.test(html);
    const snippetType = isHowToSnippet ? 'how-to' : isTableSnippet ? 'table' : isListSnippet ? 'list' : 'definition';
    html = html.replace(/class="ab-snippet"/g, `class="ab-snippet" data-snippet-type="${snippetType}"`);
    fixes.push(`Added snippet type "${snippetType}" to featured snippet box`);
  }

  // 6. Fix generic internal link anchor texts — replace with page title from URL slug
  const genericAnchors = ['click here', 'read more', 'here', 'this article', 'check this out', 'learn more'];
  html = html.replace(
    /<a\s+([^>]*href="([^"]*)"[^>]*)>(.*?)<\/a>/gi,
    (match, attrs, href, text) => {
      const plainText = text.replace(/<[^>]+>/g, '').trim().toLowerCase();
      if (genericAnchors.includes(plainText) && !/target="_blank"/.test(attrs)) {
        // Extract a meaningful anchor text from the URL slug
        try {
          const urlPath = new URL(href).pathname.replace(/^\/|\/$/g, '');
          if (urlPath) {
            const betterAnchor = urlPath
              .split('/').pop()!
              .replace(/-/g, ' ')
              .replace(/\b\w/g, c => c.toUpperCase())
              .replace(/\b(A|An|The|In|On|At|To|For|Of|And|Or|Is|Are)\b/g, w => w.toLowerCase());
            if (betterAnchor.length > 5) {
              fixes.push(`Replaced generic anchor "${plainText}" with "${betterAnchor}"`);
              return `<a ${attrs}>${betterAnchor}</a>`;
            }
          }
        } catch {
          // URL parse failed, keep original
        }
        fixes.push(`Found generic anchor text "${plainText}" in internal link (could not auto-fix)`);
      }
      return match;
    },
  );

  return { html, title, excerpt, fixes };
}

// ── Helper functions ──

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractFirstParagraph(html: string): string | null {
  // Skip the header/date div, find the first real content paragraph
  // Supports both inline-styled and class-based paragraphs
  const match = html.match(/<p(?:\s+[^>]*)?>(?!<time)([\s\S]*?)<\/p>/i);
  if (!match) return null;
  const text = match[1].replace(/<[^>]+>/g, '').trim();
  // Skip very short paragraphs (likely metadata)
  return text.length > 30 ? text : null;
}

function extractParagraphs(html: string): string[] {
  const matches = html.match(/<p[^>]*>([\s\S]*?)<\/p>/gi) || [];
  return matches
    .map(m => m.replace(/<[^>]+>/g, '').trim())
    .filter(p => p.length > 50); // Skip short/metadata paragraphs
}

function countSentences(text: string): number {
  // Split on sentence-ending punctuation followed by space or end
  const sentences = text.split(/[.!?]+(?:\s|$)/).filter(s => s.trim().length > 10);
  return sentences.length;
}

function countKeywordOccurrences(text: string, keyword: string): number {
  const pattern = new RegExp(escapeRegex(keyword), 'gi');
  return (text.match(pattern) || []).length;
}

interface DuplicatePhrase {
  phrase: string;
  count: number;
}

function detectDuplicatePhrases(text: string): DuplicatePhrase[] {
  // Check for repeated 4-10 word phrases (common AI pattern)
  const words = text.toLowerCase().split(/\s+/).filter(w => w.length > 2);
  const phraseMap = new Map<string, number>();

  for (let len = 4; len <= 10; len++) {
    for (let i = 0; i <= words.length - len; i++) {
      const phrase = words.slice(i, i + len).join(' ');
      // Skip very common phrases
      if (isCommonPhrase(phrase)) continue;
      phraseMap.set(phrase, (phraseMap.get(phrase) || 0) + 1);
    }
  }

  return Array.from(phraseMap.entries())
    .filter(([, count]) => count >= 3) // Repeated 3+ times
    .map(([phrase, count]) => ({ phrase, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
}

function extractInternalAnchorTexts(html: string, siteUrl: string): string[] {
  const regex = new RegExp(`<a\\s+[^>]*href="${escapeRegex(siteUrl)}[^"]*"[^>]*>(.*?)<\\/a>`, 'gi');
  const anchors: string[] = [];
  let match;
  while ((match = regex.exec(html)) !== null) {
    const text = match[1].replace(/<[^>]+>/g, '').trim();
    if (text.length > 0) anchors.push(text);
  }
  return anchors;
}

function detectSuspiciousUrls(html: string): string[] {
  const urlRegex = /href="(https?:\/\/[^"]+)"/gi;
  const suspicious: string[] = [];
  let match;

  // Known trustworthy domains (synced with wordpress.service.ts APPROVED_DOMAINS)
  const trustedDomains = [
    'bok.or.kr', 'krx.co.kr', 'dart.fss.or.kr', 'kosis.kr',
    'fsc.go.kr', 'ftc.go.kr', 'msit.go.kr', 'kotra.or.kr', 'kisa.or.kr', 'kocca.kr',
    'kdi.re.kr', 'kiep.go.kr', 'visitkorea.or.kr',
    'bloomberg.com', 'reuters.com', 'nikkei.com', 'cnbc.com', 'ft.com', 'wsj.com',
    'techcrunch.com', 'imf.org', 'mckinsey.com', 'statista.com', 'worldbank.org',
    'samsung.com', 'hyundai.com', 'lgcorp.com', 'skhynix.com',
    'navercorp.com', 'kakaocorp.com', 'coupang.com',
    'koreaherald.com', 'mk.co.kr', 'hankyung.com',
    'hybecorp.com', 'smentertainment.com', 'jype.com', 'ygfamily.com',
    'cosmeticsdesign-asia.com', 'lonelyplanet.com',
    // K-Entertainment trusted sources
    'weverse.io', 'melon.com', 'hanteonews.com', 'circlechart.kr',
    'soompi.com', 'billboard.com', 'sbs.co.kr', 'kbs.co.kr', 'mbc.co.kr', 'mnet.com',
    // K-Beauty trusted sources
    'oliveyoung.co.kr', 'oliveyoung.com', 'allure.co.kr',
    'incidecoder.com', 'cosdna.com', 'skinsort.com', 'yesstyle.com', 'stylevana.com',
    'twitter.com', 'x.com', 'linkedin.com', 'facebook.com',
    'google.com', 'youtube.com', 'wikipedia.org',
  ];

  while ((match = urlRegex.exec(html)) !== null) {
    const url = match[1];
    try {
      const parsed = new URL(url);
      const domain = parsed.hostname.replace('www.', '');

      // Skip trusted domains
      if (trustedDomains.some(d => domain.endsWith(d))) continue;

      // Flag very specific deep paths that look fabricated
      // AI tends to generate paths like /news/2026/03/specific-article-title-slug
      const pathSegments = parsed.pathname.split('/').filter(Boolean);
      if (pathSegments.length >= 4) {
        // Deep paths on non-major sites are suspicious
        suspicious.push(url);
      }
    } catch {
      // Invalid URL
      suspicious.push(url);
    }
  }

  return suspicious;
}

function estimateSyllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (w.length <= 3) return 1;
  let count = 0;
  const vowels = 'aeiouy';
  let prevVowel = false;
  for (const ch of w) {
    const isVowel = vowels.includes(ch);
    if (isVowel && !prevVowel) count++;
    prevVowel = isVowel;
  }
  // Silent 'e' at end
  if (w.endsWith('e') && count > 1) count--;
  // Words like "le" at end
  if (w.endsWith('le') && w.length > 2 && !vowels.includes(w[w.length - 3])) count++;
  return Math.max(1, count);
}

function computeFleschKincaid(text: string): number {
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 5);
  const words = text.split(/\s+/).filter(w => w.length > 0);
  if (sentences.length === 0 || words.length === 0) return 60; // default middle score
  const totalSyllables = words.reduce((sum, w) => sum + estimateSyllables(w), 0);
  return 206.835 - 1.015 * (words.length / sentences.length) - 84.6 * (totalSyllables / words.length);
}

/**
 * Compute Gunning Fog Index: 0.4 * (avgSentenceLength + percentComplexWords)
 * Complex words = 3+ syllables, excluding common suffixes (-es, -ed, -ing)
 * Target: 10-12 for college-educated general audience.
 */
function computeGunningFogIndex(text: string): number {
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 5);
  const words = text.split(/\s+/).filter(w => w.length > 0);
  if (sentences.length === 0 || words.length === 0) return 10;
  const avgSentenceLength = words.length / sentences.length;
  // Complex words: 3+ syllables, excluding proper nouns and common suffixes
  const complexWords = words.filter(w => {
    if (w.charAt(0) === w.charAt(0).toUpperCase() && w.length > 1) return false; // Skip proper nouns
    const syllables = estimateSyllables(w.replace(/(es|ed|ing)$/i, ''));
    return syllables >= 3;
  }).length;
  const percentComplex = (complexWords / words.length) * 100;
  return 0.4 * (avgSentenceLength + percentComplex);
}

function countUniqueTransitions(text: string): number {
  const transitions = [
    'however', 'therefore', 'meanwhile', 'consequently', 'nevertheless',
    'in contrast', 'on the other hand', 'as a result', 'for instance',
    'for example', 'in particular', 'specifically', 'notably', 'importantly',
    'similarly', 'likewise', 'conversely', 'instead', 'rather',
    'in addition', 'beyond that', 'that said', 'even so', 'still',
    'yet', 'although', 'despite', 'regardless', 'accordingly',
  ];
  const lower = text.toLowerCase();
  return transitions.filter(t => lower.includes(t)).length;
}

function detectUnhedgedStatistics(text: string, currentYear: number): number {
  // Find sentences mentioning current-year stats without qualifying language
  const hedgingPhrases = ['estimated', 'projected', 'forecast', 'approximately', 'according', 'report', 'data suggest', 'industry sources', 'as of', 'recent estimates', 'expected'];
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 20);
  let unhedgedCount = 0;

  for (const sentence of sentences) {
    const lower = sentence.toLowerCase();
    const hasCurrentYear = lower.includes(String(currentYear));
    const hasStat = /\$[\d,.]+[BMK]?|\d+(?:\.\d+)?%/.test(sentence);
    if (hasCurrentYear && hasStat) {
      const hasHedging = hedgingPhrases.some(h => lower.includes(h));
      if (!hasHedging) unhedgedCount++;
    }
  }

  return unhedgedCount;
}

/**
 * Approximate AI detection score (0-100) based on writing uniformity.
 * Human writing has high variance in sentence length (burstiness);
 * AI writing tends toward uniform sentence lengths and predictable patterns.
 */
function computeAIDetectionScore(text: string): number {
  const sentences = text.split(/[.!?]+/).map(s => s.trim()).filter(s => s.length > 10);
  if (sentences.length < 5) return 0;

  // 1. Sentence length variance (burstiness) — low variance = AI-like
  const lengths = sentences.map(s => s.split(/\s+/).length);
  const avgLen = lengths.reduce((a, b) => a + b, 0) / lengths.length;
  const variance = lengths.reduce((sum, l) => sum + Math.pow(l - avgLen, 2), 0) / lengths.length;
  const cv = Math.sqrt(variance) / avgLen; // coefficient of variation
  // Human text: CV ~0.5-0.8, AI text: CV ~0.2-0.4
  const burstyScore = cv < 0.25 ? 40 : cv < 0.35 ? 25 : cv < 0.45 ? 15 : 0;

  // 2. Paragraph opener diversity — AI tends to start paragraphs with similar patterns
  const openers = sentences.map(s => s.split(/\s+/).slice(0, 2).join(' ').toLowerCase());
  const openerSet = new Set(openers);
  const openerDiversity = openerSet.size / openers.length;
  const openerScore = openerDiversity < 0.4 ? 30 : openerDiversity < 0.6 ? 15 : 0;

  // 3. Filler phrase frequency — AI overuses certain transitions
  const fillerPhrases = [
    'it is worth noting', 'it is important to note', 'it should be noted',
    'in conclusion', 'to summarize', 'overall',
    'plays a crucial role', 'plays a significant role', 'plays an important role',
    'in the realm of', 'in the world of', 'when it comes to',
    'it is no secret', 'needless to say', 'at the end of the day',
    'a testament to', 'a game changer', 'a game-changer',
    'delve into', 'dive into', 'navigate the',
    'landscape', 'paradigm', 'ecosystem',
  ];
  const textLower = text.toLowerCase();
  const fillerCount = fillerPhrases.filter(f => textLower.includes(f)).length;
  const fillerScore = fillerCount >= 5 ? 30 : fillerCount >= 3 ? 20 : fillerCount >= 1 ? 10 : 0;

  return Math.min(100, burstyScore + openerScore + fillerScore);
}

/**
 * Count unique data points in text: statistics, monetary values, percentages, dates, named entities.
 * Higher density = more informative content, less AI-typical filler.
 */
function countDataPoints(text: string): number {
  const patterns = [
    /\$[\d,.]+[BMKTbmkt]?/g,           // monetary values
    /\d+(?:\.\d+)?%/g,                  // percentages
    /\d{4}/g,                            // years
    /\d+(?:,\d{3})+/g,                  // large numbers
    /\d+\.\d+/g,                         // decimal numbers
    /(?:billion|million|trillion|KRW|USD|won)/gi, // currency/magnitude
  ];
  const matches = new Set<string>();
  for (const pattern of patterns) {
    const found = text.match(pattern) || [];
    for (const m of found) matches.add(m);
  }
  return matches.size;
}

/**
 * Detect outdated year references that suggest stale content.
 * Flags years >1yr old if referenced >2 times (suggests content is based on old data).
 */
function detectOutdatedYearReferences(text: string, currentYear: number): number {
  let penalty = 0;
  // Check years from 2 to 5 years ago
  for (let offset = 2; offset <= 5; offset++) {
    const oldYear = currentYear - offset;
    const regex = new RegExp(`\\b${oldYear}\\b`, 'g');
    const count = (text.match(regex) || []).length;
    if (count > 2) {
      penalty += Math.min(1, count - 2); // +1 penalty per excess reference, capped
    }
  }
  return Math.min(3, penalty); // Max -3 structureScore
}

/**
 * Detect large monetary claims and market share percentages without attribution.
 * Flags "$X billion/million" and "X% market share" without nearby source references.
 */
function detectUnsourcedLargeClaims(text: string): number {
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 20);
  const attributionPatterns = ['according to', 'report', 'data', 'source', 'study', 'survey', 'analyst', 'research', 'estimated', 'projected'];
  let unsourcedCount = 0;

  for (const sentence of sentences) {
    const lower = sentence.toLowerCase();
    // Check for large monetary claims ($X billion/million)
    const hasLargeMoney = /\$[\d,.]+\s*(?:billion|million|trillion|B|M|T)\b/i.test(sentence);
    // Check for market share percentages
    const hasMarketShare = /\d+(?:\.\d+)?%\s*(?:market share|of the market|share)/i.test(sentence);

    if (hasLargeMoney || hasMarketShare) {
      const hasAttribution = attributionPatterns.some(p => lower.includes(p));
      if (!hasAttribution) unsourcedCount++;
    }
  }

  return Math.min(3, unsourcedCount); // Max -3 eeatScore
}

function isCommonPhrase(phrase: string): boolean {
  const common = [
    'at the same time', 'on the other hand', 'as a result of',
    'in the united states', 'in south korea', 'at the end of',
    'one of the most', 'as well as the', 'in terms of the',
  ];
  return common.some(c => phrase.includes(c));
}

/**
 * Log the content score with breakdown.
 */
export function logContentScore(score: ContentScore, title: string): void {
  const grade =
    score.total >= 85 ? 'A' :
    score.total >= 70 ? 'B' :
    score.total >= 55 ? 'C' :
    score.total >= 40 ? 'D' : 'F';

  logger.info(
    `Content Score: ${score.total}/107 (${grade}) for "${title}" — ` +
    `Title:${score.breakdown.titleScore}/15, Excerpt:${score.breakdown.excerptScore}/10, ` +
    `Structure:${score.breakdown.structureScore}/25, SEO:${score.breakdown.seoScore}/20, ` +
    `Readability:${score.breakdown.readabilityScore}/15, E-E-A-T:${score.breakdown.eeatScore}/15, ` +
    `Experience:${score.breakdown.experienceScore}/7`,
  );

  for (const issue of score.issues) {
    logger.warn(`  [${issue.category.toUpperCase()}] ${issue.message}`);
  }
  for (const warning of score.warnings) {
    logger.debug(`  [${warning.category.toUpperCase()}] ${warning.message}`);
  }
}

// ── Source Credibility Weights for E-E-A-T ──

/** Source credibility tiers for E-E-A-T scoring */
const SOURCE_CREDIBILITY: Record<string, number> = {
  // Tier 1: Academic/Government (weight 0.9)
  'bok.or.kr': 0.9, 'krx.co.kr': 0.9, 'dart.fss.or.kr': 0.9, 'kosis.kr': 0.9,
  'fsc.go.kr': 0.9, 'msit.go.kr': 0.9, 'kotra.or.kr': 0.9, 'worldbank.org': 0.9,
  'imf.org': 0.9, 'kdi.re.kr': 0.9,
  // Tier 2: Industry authority (weight 0.7)
  'bloomberg.com': 0.7, 'reuters.com': 0.7, 'nikkei.com': 0.7, 'ft.com': 0.7,
  'wsj.com': 0.7, 'mckinsey.com': 0.7, 'statista.com': 0.7,
  'samsung.com': 0.7, 'hyundai.com': 0.7, 'lgcorp.com': 0.7, 'skhynix.com': 0.7,
  'koreaherald.com': 0.7, 'mk.co.kr': 0.7,
  // Tier 3: General trusted (weight 0.5)
  'cnbc.com': 0.5, 'techcrunch.com': 0.5, 'wikipedia.org': 0.5,
  'navercorp.com': 0.5, 'kakaocorp.com': 0.5,
};

/**
 * Compute source credibility score for E-E-A-T.
 * Analyzes external link domains and returns average credibility weight.
 */
export function computeSourceCredibility(html: string): { avgWeight: number; sourceCount: number; lowQualitySources: string[] } {
  const urlRegex = /href="(https?:\/\/[^"]+)"/gi;
  let match;
  const weights: number[] = [];
  const lowQuality: string[] = [];

  while ((match = urlRegex.exec(html)) !== null) {
    try {
      const domain = new URL(match[1]).hostname.replace(/^www\./, '');
      const weight = SOURCE_CREDIBILITY[domain] ??
        Object.entries(SOURCE_CREDIBILITY).find(([d]) => domain.endsWith('.' + d))?.[1] ?? 0.3;
      weights.push(weight);
      if (weight <= 0.3) lowQuality.push(domain);
    } catch { /* skip invalid */ }
  }

  // Also count cite data-source tags (these resolve to verified URLs)
  const citeRegex = /data-source="([^"]+)"/gi;
  while ((match = citeRegex.exec(html)) !== null) {
    weights.push(0.8); // cite data-source tags are always from verified registry
  }

  return {
    avgWeight: weights.length > 0 ? weights.reduce((a, b) => a + b, 0) / weights.length : 0,
    sourceCount: weights.length,
    lowQualitySources: [...new Set(lowQuality)],
  };
}

// ── Pillar Page Validator ──

export interface PillarPageValidation {
  isValid: boolean;
  issues: string[];
  score: number;
}

/**
 * Validate pillar page structure for comprehensive coverage.
 * Ensures pillar pages meet SEO best practices for topical authority.
 */
export function validatePillarPage(
  html: string,
  title: string,
  clusterPostTitles: string[],
): PillarPageValidation {
  const issues: string[] = [];
  let score = 100;

  const plainText = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const wordCount = plainText.split(/\s+/).length;

  // 1. Word count check (pillar pages should be 3000+ words)
  if (wordCount < 3000) {
    issues.push(`Pillar page too short: ${wordCount} words (need 3000+)`);
    score -= 20;
  } else if (wordCount < 2500) {
    issues.push(`Pillar page critically short: ${wordCount} words`);
    score -= 30;
  }

  // 2. TOC presence
  if (!/Table of Contents/i.test(html)) {
    issues.push('Missing Table of Contents');
    score -= 10;
  }

  // 3. FAQ section
  const hasFaq = /<h[23][^>]*>[^<]*FAQ|Frequently Asked/i.test(html);
  if (!hasFaq) {
    issues.push('Missing FAQ section');
    score -= 10;
  }

  // 4. H2 heading count (pillar pages need 6+ sections)
  const h2Count = (html.match(/<h2\b/gi) || []).length;
  if (h2Count < 6) {
    issues.push(`Only ${h2Count} H2 headings (need 6+ for comprehensive coverage)`);
    score -= 15;
  }

  // 5. Links to cluster posts (should link to most subtopic posts)
  if (clusterPostTitles.length > 0) {
    const htmlLower = html.toLowerCase();
    const linkedCount = clusterPostTitles.filter(t =>
      htmlLower.includes(t.toLowerCase().slice(0, 30)),
    ).length;
    const linkRatio = linkedCount / clusterPostTitles.length;
    if (linkRatio < 0.5) {
      issues.push(`Only links to ${linkedCount}/${clusterPostTitles.length} cluster posts (need 50%+)`);
      score -= 15;
    }
  }

  // 6. Guide/comprehensive positioning
  const titleLower = title.toLowerCase();
  const hasGuideSignal = ['guide', 'complete', 'comprehensive', 'ultimate', 'everything'].some(
    w => titleLower.includes(w),
  );
  if (!hasGuideSignal) {
    issues.push('Title missing "guide/complete/comprehensive" positioning signal');
    score -= 5;
  }

  return {
    isValid: score >= 70,
    issues,
    score: Math.max(0, score),
  };
}

// ── Mobile Rendering Validator ──

/**
 * Validate HTML content for mobile rendering issues.
 * Checks tables, SVGs, and fixed-width elements that may break on small screens.
 */
function validateMobileRendering(html: string): string[] {
  const issues: string[] = [];

  // 1. Tables without responsive wrapper or overflow handling
  const tableMatches = html.match(/<table[\s>]/gi) || [];
  if (tableMatches.length > 0) {
    // Check if tables have responsive wrapping
    const hasResponsiveWrap = /ab-table-wrap|overflow-x|overflow:\s*auto/i.test(html);
    const hasFixedWidth = /<table[^>]*width="\d{4,}/i.test(html); // Tables with 1000+ px width
    if (!hasResponsiveWrap && tableMatches.length > 0) {
      issues.push(`${tableMatches.length} table(s) without responsive wrapper (add overflow-x:auto for mobile)`);
    }
    if (hasFixedWidth) {
      issues.push('Table with fixed pixel width >1000px detected (use width:100% for mobile)');
    }
  }

  // 2. SVGs without responsive sizing
  const svgMatches = html.match(/<svg[^>]*>/gi) || [];
  for (const svg of svgMatches) {
    const hasMaxWidth = /max-width/i.test(svg);
    const hasPercentWidth = /width:\s*100%/i.test(svg) || /width="100%"/i.test(svg);
    const hasFixedPxWidth = /width[=:]\s*"?\d{4,}(?:px)?/i.test(svg); // 1000+ px SVG
    if (hasFixedPxWidth && !hasMaxWidth && !hasPercentWidth) {
      issues.push('SVG with fixed pixel width detected (add max-width and width:100% for mobile)');
    }
  }

  // 3. Fixed-width inline styles that break mobile (> 600px)
  const fixedWidthDivs = html.match(/<div[^>]*style="[^"]*width:\s*\d{4,}px/gi) || [];
  if (fixedWidthDivs.length > 0) {
    issues.push(`${fixedWidthDivs.length} div(s) with fixed pixel width >1000px (use max-width for mobile)`);
  }

  // 4. Float layouts without mobile override
  const floatElements = html.match(/float:\s*(?:left|right)[^"]*width:\s*\d+%/gi) || [];
  if (floatElements.length > 0) {
    // Check if there are media queries or responsive fallbacks
    const hasMediaQuery = /@media/i.test(html);
    if (!hasMediaQuery) {
      issues.push(`${floatElements.length} float layout(s) without mobile media query fallback`);
    }
  }

  // 5. Horizontal scroll risk: elements with min-width > viewport
  const minWidthMatches = html.match(/min-width:\s*(\d+)px/gi) || [];
  for (const match of minWidthMatches) {
    const px = parseInt(match.match(/(\d+)/)?.[1] || '0');
    if (px > 768) {
      issues.push(`Element with min-width:${px}px will cause horizontal scroll on mobile`);
    }
  }

  // 6. Mobile paragraph length check (>150 words = wall of text on mobile)
  const paragraphs = html.match(/<p[^>]*>([\s\S]*?)<\/p>/gi) || [];
  let longMobileParagraphs = 0;
  for (const p of paragraphs) {
    const text = p.replace(/<[^>]+>/g, '').trim();
    const words = text.split(/\s+/).filter(Boolean).length;
    if (words > 150) longMobileParagraphs++;
  }
  if (longMobileParagraphs >= 3) {
    issues.push(`${longMobileParagraphs} paragraphs exceed 150 words — poor mobile readability`);
  }

  return issues;
}

// ── Batch Duplicate Checker ──

/**
 * Check for duplicate content within a batch of generated articles.
 * Uses bigram-weighted text similarity to detect near-duplicates.
 * Returns pairs of articles that are too similar.
 */
export function detectBatchDuplicates(
  articles: Array<{ title: string; keyword: string; html: string }>,
  threshold: number = 0.6,
): Array<{ indexA: number; indexB: number; similarity: number; titleA: string; titleB: string }> {
  const duplicates: Array<{ indexA: number; indexB: number; similarity: number; titleA: string; titleB: string }> = [];

  for (let i = 0; i < articles.length; i++) {
    for (let j = i + 1; j < articles.length; j++) {
      const sim = batchTextSimilarity(
        articles[i].title + ' ' + articles[i].keyword,
        articles[j].title + ' ' + articles[j].keyword,
      );
      if (sim > threshold) {
        duplicates.push({
          indexA: i,
          indexB: j,
          similarity: sim,
          titleA: articles[i].title,
          titleB: articles[j].title,
        });
      }
    }
  }

  if (duplicates.length > 0) {
    logger.warn(`Batch duplicate check: ${duplicates.length} similar pair(s) detected`);
    for (const dup of duplicates) {
      logger.warn(`  "${dup.titleA}" <-> "${dup.titleB}" (similarity: ${(dup.similarity * 100).toFixed(0)}%)`);
    }
  }

  return duplicates;
}

function batchTextSimilarity(a: string, b: string): number {
  const stopWords = new Set(['the', 'a', 'an', 'in', 'on', 'at', 'to', 'for', 'of', 'and', 'or', 'is', 'are', 'how', 'what', 'why', 'your', 'you', 'this', 'that', 'with']);
  const tokenize = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 2 && !stopWords.has(w));

  const wordsA = tokenize(a);
  const wordsB = tokenize(b);
  if (wordsA.length === 0 || wordsB.length === 0) return 0;

  const setA = new Set(wordsA);
  const setB = new Set(wordsB);
  let intersection = 0;
  for (const word of setA) if (setB.has(word)) intersection++;
  return intersection / Math.min(setA.size, setB.size);
}

/**
 * Validate image alt text contains keyword context.
 * Returns count of images missing keyword-enriched alt text.
 */
/**
 * Validate alt text quality for images: keyword presence (1x), descriptive text, no stuffing.
 * Returns issue strings for the content validator scoring.
 */
function validateAltTexts(html: string, keyword: string): string[] {
  const imgRegex = /<img\s+[^>]*>/gi;
  const images = html.match(imgRegex) || [];
  if (images.length === 0) return [];

  const issues: string[] = [];
  const kwWords = keyword.toLowerCase().split(/\s+/).filter(w => w.length > 3);
  let missingAlt = 0;
  let genericAlt = 0;
  let stuffedAlt = 0;
  let noKeywordAlt = 0;

  for (const img of images) {
    const altMatch = img.match(/alt="([^"]*)"/i);
    if (!altMatch || altMatch[1].trim() === '') {
      missingAlt++;
      continue;
    }
    const alt = altMatch[1].trim();
    const altLower = alt.toLowerCase();

    // Check for generic/useless alt text
    if (/^(image|photo|picture|img|article image|featured image)\s*\d*$/i.test(alt)) {
      genericAlt++;
      continue;
    }

    // Check for keyword stuffing (keyword appears 3+ times in alt)
    const kwOccurrences = kwWords.filter(w => altLower.includes(w)).length;
    const kwRepeats = kwWords.reduce((count, w) => {
      const regex = new RegExp(w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
      return count + (altLower.match(regex) || []).length;
    }, 0);
    if (kwRepeats >= 4) {
      stuffedAlt++;
    }

    // Check if at least one keyword fragment is present
    if (kwOccurrences === 0) {
      noKeywordAlt++;
    }
  }

  if (missingAlt > 0) {
    issues.push(`${missingAlt} image(s) missing alt text (accessibility + SEO issue)`);
  }
  if (genericAlt > 0) {
    issues.push(`${genericAlt} image(s) with generic alt text (e.g., "image 1") — use descriptive text`);
  }
  if (stuffedAlt > 0) {
    issues.push(`${stuffedAlt} image(s) with keyword-stuffed alt text — use keyword naturally (1x)`);
  }
  if (noKeywordAlt > Math.ceil(images.length * 0.7)) {
    issues.push(`Most images missing keyword context in alt text — include keyword naturally in at least 1-2 images`);
  }

  return issues;
}

export function validateImageAltTexts(html: string, keyword: string): { total: number; missingKeyword: number; missingAlt: number } {
  const imgRegex = /<img\s+[^>]*>/gi;
  const images = html.match(imgRegex) || [];
  let missingKeyword = 0;
  let missingAlt = 0;
  const kwWords = keyword.toLowerCase().split(/\s+/).filter(w => w.length > 3);

  for (const img of images) {
    const altMatch = img.match(/alt="([^"]*)"/i);
    if (!altMatch || altMatch[1].trim() === '') {
      missingAlt++;
      missingKeyword++;
      continue;
    }
    const altLower = altMatch[1].toLowerCase();
    const hasKeyword = kwWords.some(w => altLower.includes(w));
    if (!hasKeyword) missingKeyword++;
  }

  return { total: images.length, missingKeyword, missingAlt };
}

/**
 * Pre-publish plagiarism detection using n-gram fingerprinting.
 * Compares generated content against existing posts to detect accidental duplication.
 * Uses 5-gram shingle-based Jaccard similarity (efficient, no external API needed).
 */
export function detectPlagiarism(
  newHtml: string,
  existingPosts: Array<{ title: string; html?: string; url: string }>,
  threshold: number = 0.25,
): Array<{ url: string; title: string; similarity: number }> {
  const stripHtml = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
  const newText = stripHtml(newHtml);
  if (newText.length < 200) return [];

  // Generate 5-word shingles (n-grams)
  const shingle = (text: string, n: number = 5): Set<string> => {
    const words = text.split(/\s+/).filter(w => w.length > 2);
    const shingles = new Set<string>();
    for (let i = 0; i <= words.length - n; i++) {
      shingles.add(words.slice(i, i + n).join(' '));
    }
    return shingles;
  };

  const newShingles = shingle(newText);
  if (newShingles.size === 0) return [];

  const matches: Array<{ url: string; title: string; similarity: number }> = [];

  for (const post of existingPosts) {
    if (!post.html && !post.title) continue;
    const existingText = post.html ? stripHtml(post.html) : post.title.toLowerCase();
    if (existingText.length < 100) continue;

    const existingShingles = shingle(existingText);
    if (existingShingles.size === 0) continue;

    // Jaccard similarity
    let intersection = 0;
    for (const s of newShingles) {
      if (existingShingles.has(s)) intersection++;
    }
    const union = newShingles.size + existingShingles.size - intersection;
    const similarity = union > 0 ? intersection / union : 0;

    if (similarity > threshold) {
      matches.push({ url: post.url, title: post.title, similarity });
    }
  }

  matches.sort((a, b) => b.similarity - a.similarity);

  if (matches.length > 0) {
    logger.warn(`Plagiarism check: ${matches.length} similar existing post(s) detected`);
    for (const m of matches.slice(0, 3)) {
      logger.warn(`  "${m.title}" — ${(m.similarity * 100).toFixed(0)}% similar (${m.url})`);
    }
  }

  return matches;
}
