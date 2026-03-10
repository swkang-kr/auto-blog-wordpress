import { logger } from './logger.js';

export interface ContentScore {
  total: number;
  breakdown: {
    titleScore: number;
    excerptScore: number;
    structureScore: number;
    seoScore: number;
    readabilityScore: number;
    eeatScore: number;
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
  'Korean Food': [60, 75],       // Lifestyle content should be accessible
  'Korea Travel': [60, 75],      // Travel guides should be easy to scan
  'Korean Language': [50, 65],   // Educational but not overly academic
  'K-Beauty': [55, 70],          // Consumer-friendly but some science
  'Korean Crypto': [45, 60],     // Financial/technical audience
  'Korean Automotive': [55, 70], // General audience with some tech detail
};

/** Per-category minimum quality scores — raised across the board for HCU compliance */
const CATEGORY_MIN_QUALITY: Record<string, number> = {
  'Korean Finance': 70,
  'Korean Tech': 65,
  'Korean Crypto': 70,
  'K-Entertainment': 60,
  'Korean Food': 60,
  'Korea Travel': 60,
  'Korean Language': 65,
  'K-Beauty': 60,
  'Korean Automotive': 65,
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
  'news-explainer': 1400,
  'listicle': 1400,
};

/** Get minimum quality score for a category (defaults to 45) */
export function getMinQualityScore(category?: string): number {
  return (category ? CATEGORY_MIN_QUALITY[category] : undefined) ?? 45;
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

  // 1. Signature section check
  const hasSignatureSection = /Global Context|What This Means for Investors|Why the World Is Watching/i.test(html);
  if (!hasSignatureSection) {
    issues.push({ category: 'structure', message: 'Missing mandatory signature section (Global Context / What This Means for Investors)', severity: 'error' });
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

  // 2c. People Also Ask (PAA) optimization — question-format H3s in body
  const questionH3Count = (html.match(/<h3[^>]*>[^<]*\?<\/h3>/gi) || []).length;
  if (questionH3Count < 2) {
    warnings.push({ category: 'seo', message: `Only ${questionH3Count} question-format H3 heading(s) — add 2-3 for People Also Ask optimization`, severity: 'warning' });
    seoScore -= 1;
  }

  // 3. TOC presence
  const hasToc = /Table of Contents/i.test(html);
  if (!hasToc) {
    warnings.push({ category: 'seo', message: 'No Table of Contents detected', severity: 'warning' });
    seoScore -= 2;
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

  // 4. Suspicious URL pattern detection (likely fabricated deep paths)
  const suspiciousUrls = detectSuspiciousUrls(html);
  if (suspiciousUrls.length > 0) {
    warnings.push({
      category: 'eeat',
      message: `Potentially fabricated URLs detected: ${suspiciousUrls.slice(0, 3).join(', ')}`,
      severity: 'warning',
    });
    eeatScore -= 2;
  }

  // 5. Unhedged statistics detection (current-year stats without qualifying language)
  const currentYear = new Date().getFullYear();
  const unhedgedStats = detectUnhedgedStatistics(plainText, currentYear);
  if (unhedgedStats > 2) {
    warnings.push({
      category: 'eeat',
      message: `${unhedgedStats} potentially unverified ${currentYear} statistics without qualifying language (use "estimated", "projected", "according to")`,
      severity: 'warning',
    });
    eeatScore -= Math.min(3, unhedgedStats);
  }

  // Clamp scores to 0
  titleScore = Math.max(0, titleScore);
  excerptScore = Math.max(0, excerptScore);
  structureScore = Math.max(0, structureScore);
  seoScore = Math.max(0, seoScore);
  readabilityScore = Math.max(0, readabilityScore);
  eeatScore = Math.max(0, eeatScore);

  const total = titleScore + excerptScore + structureScore + seoScore + readabilityScore + eeatScore;

  return {
    total,
    breakdown: {
      titleScore,
      excerptScore,
      structureScore,
      seoScore,
      readabilityScore,
      eeatScore,
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

  // 2. Wrap tables with overflow-x:auto for mobile
  if (html.includes('<table') && !html.includes('overflow-x:auto')) {
    html = html.replace(
      /<table\s+style="([^"]*)"/g,
      '<div style="overflow-x:auto; -webkit-overflow-scrolling:touch; margin:24px 0;"><table style="$1"',
    );
    html = html.replace(/<\/table>/g, '</table></div>');
    fixes.push('Wrapped tables with overflow-x:auto for mobile');
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

  // 5. Ensure featured snippet box has proper schema markup for Google
  if (html.includes('class="ab-snippet"') && !html.includes('data-snippet-type')) {
    // Detect snippet type and add data attribute for potential schema.org enhancement
    const isListSnippet = /<div class="ab-snippet">[^]*?<ol/i.test(html);
    const snippetType = isListSnippet ? 'list' : 'definition';
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

  // Known trustworthy domains (root-level linking is always safe)
  const trustedDomains = [
    'bok.or.kr', 'krx.co.kr', 'dart.fss.or.kr', 'kosis.kr',
    'bloomberg.com', 'reuters.com', 'nikkei.com',
    'samsung.com', 'hyundai.com', 'lgcorp.com',
    'twitter.com', 'x.com', 'linkedin.com', 'facebook.com',
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
    `Content Score: ${score.total}/100 (${grade}) for "${title}" — ` +
    `Title:${score.breakdown.titleScore}/15, Excerpt:${score.breakdown.excerptScore}/10, ` +
    `Structure:${score.breakdown.structureScore}/25, SEO:${score.breakdown.seoScore}/20, ` +
    `Readability:${score.breakdown.readabilityScore}/15, E-E-A-T:${score.breakdown.eeatScore}/15`,
  );

  for (const issue of score.issues) {
    logger.warn(`  [${issue.category.toUpperCase()}] ${issue.message}`);
  }
  for (const warning of score.warnings) {
    logger.debug(`  [${warning.category.toUpperCase()}] ${warning.message}`);
  }
}
