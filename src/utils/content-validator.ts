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
  severity: 'error' | 'warning';
  autoFixed?: boolean;
}

/**
 * Comprehensive content quality validator.
 * Runs post-generation checks and returns a score + issues list.
 */
/** Per-category Flesch-Kincaid readability targets (category → [min, max]) */
const CATEGORY_READABILITY_TARGETS: Record<string, [number, number]> = {
  'Korean Tech': [45, 60],       // Technical audience tolerates denser writing
  'Korean Finance': [45, 60],    // Financial analysis requires precision
  'K-Entertainment': [60, 75],   // Casual audience expects easy reading
  'Korea Travel': [60, 75],      // Travel guides should be easy to scan
  'K-Beauty': [55, 70],          // Consumer-friendly but some science
};

/** Per-category minimum quality scores — raised across the board for HCU compliance */
const CATEGORY_MIN_QUALITY: Record<string, number> = {
  'Korean Finance': 70,
  'Korean Tech': 65,
  'K-Entertainment': 60,
  'Korea Travel': 60,
  'K-Beauty': 60,
};

/** Content type-specific minimum word counts — lowered for information density over padding */
const CONTENT_TYPE_MIN_WORDS: Record<string, number> = {
  'deep-dive': 2200,
  'analysis': 1800,
  'case-study': 1800,
  'how-to': 1600,
  'product-review': 1600,
  'best-x-for-y': 1500,
  'x-vs-y': 1500,
  'news-explainer': 1500,
  'listicle': 1400,
};

/** Get minimum quality score for a category (defaults to 45) */
export function getMinQualityScore(category?: string): number {
  return (category ? CATEGORY_MIN_QUALITY[category] : undefined) ?? 45;
}

/**
 * Compute experience score (max 7 bonus points) for E-E-A-T Experience signal.
 * Rewards first-person analytical patterns, specific observational details,
 * and personal judgment markers that indicate real expertise.
 */
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

  // ── Structure validation (max 25 points) ──
  let structureScore = 25;
  if (wordCount < typeMinWords) structureScore -= 5;

  // 1. Signature section check (dynamic niche-specific names)
  const signaturePattern = new RegExp(ALL_SIGNATURE_SECTION_NAMES.map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'i');
  const hasSignatureSection = signaturePattern.test(html);
  if (!hasSignatureSection) {
    issues.push({ category: 'structure', message: 'Missing mandatory signature section', severity: 'error' });
    structureScore -= 8;
  }

  // 2. Internal links count
  const internalLinkRegex = new RegExp(`<a\\s+[^>]*href="${escapeRegex(siteUrl)}[^"]*"[^>]*>`, 'gi');
  const internalLinkCount = (html.match(internalLinkRegex) || []).length;
  if (internalLinkCount === 0) {
    issues.push({ category: 'structure', message: 'No internal links found (need 2-4)', severity: 'error' });
    structureScore -= 5;
  } else if (internalLinkCount < 2) {
    warnings.push({ category: 'structure', message: `Only ${internalLinkCount} internal link(s) (target 2-4)`, severity: 'warning' });
    structureScore -= 2;
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
  if (category && ['Korean Finance', 'Korean Tech'].includes(category)) {
    if (koreanCitationCount === 1) {
      warnings.push({
        category: 'eeat',
        message: `Only 1 Korean institutional source for ${category} content (need 2+ for credibility)`,
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

  // ── Experience signal validation (max 7 bonus points) ──
  const experienceScore = computeExperienceScore(plainText);

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
    'hybecorp.com', 'smentertainment.com', 'jype.com',
    'cosmeticsdesign-asia.com', 'lonelyplanet.com',
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
