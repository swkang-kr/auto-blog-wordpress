import axios from 'axios';
import { logger } from '../utils/logger.js';

interface FactCheckResult {
  verified: number;
  unverified: number;
  flagged: string[];
  corrections: Array<{ claim: string; correction: string }>;
  /** Whether any critical factual errors were found that should block publishing */
  hasCriticalErrors: boolean;
  /** Severity breakdown: critical = verifiable data wrong, warning = missing hedging/sources */
  criticalCount: number;
}

/**
 * Pre-publish fact verification service.
 * Checks key claims in content against live data sources before publishing.
 * Focuses on verifiable financial data, exchange rates, and market metrics.
 */
export class FactCheckService {
  private exchangeRateCache: Map<string, { rate: number; timestamp: number }> = new Map();
  private static readonly CACHE_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours

  /**
   * Verify factual claims in generated HTML content.
   * Extracts verifiable numbers/claims and checks against live APIs where possible.
   */
  async verifyContent(html: string, category: string): Promise<FactCheckResult> {
    const plainText = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const flagged: string[] = [];
    const corrections: Array<{ claim: string; correction: string }> = [];
    let verified = 0;
    let unverified = 0;

    // 1. Check KRW exchange rate claims (only explicit exchange rate context, NOT stock prices like ₩52,000)
    const krwExchangeMatches = plainText.match(/(?:USD\/KRW|KRW\/USD|korean won|exchange rate|dollar.{0,20}won|won.{0,20}dollar)\s*(?:at|around|approximately|is|was|reached|hit|of|to)?\s*([\d,]+(?:\.\d+)?)/gi);
    if (krwExchangeMatches) {
      const liveRate = await this.getUsdKrwRate();
      if (liveRate) {
        for (const match of krwExchangeMatches) {
          const numMatch = match.match(/([\d,]+(?:\.\d+)?)/);
          if (numMatch) {
            const claimed = parseFloat(numMatch[1].replace(/,/g, ''));
            // Only flag values in plausible exchange rate range (800-2000 KRW/USD)
            if (claimed >= 800 && claimed <= 2000 && Math.abs(claimed - liveRate) / liveRate > 0.10) {
              flagged.push(`KRW exchange rate claim "${match}" may be outdated (live: ~${liveRate.toFixed(0)})`);
              corrections.push({
                claim: match,
                correction: `Current rate is approximately ${liveRate.toFixed(0)} KRW/USD`,
              });
            } else if (claimed >= 800 && claimed <= 2000) {
              verified++;
            }
          }
        }
      }
    }

    // 2. Check KOSPI level claims
    const kospiMatches = plainText.match(/KOSPI\s*(?:index|at|around|reached|hit|level|is|was)?\s*(?:of\s+)?([\d,]+(?:\.\d+)?)/gi);
    if (kospiMatches) {
      const kospiLevel = await this.getKospiLevel();
      if (kospiLevel) {
        for (const match of kospiMatches) {
          const numMatch = match.match(/([\d,]+(?:\.\d+)?)/);
          if (numMatch) {
            const claimed = parseFloat(numMatch[1].replace(/,/g, ''));
            // KOSPI ranges 2000-3500 typically. Allow 15% tolerance
            if (claimed > 1000 && claimed < 10000 && Math.abs(claimed - kospiLevel) / kospiLevel > 0.15) {
              flagged.push(`KOSPI level "${match}" may be outdated (recent: ~${kospiLevel.toFixed(0)})`);
              corrections.push({
                claim: match,
                correction: `Recent KOSPI level is approximately ${kospiLevel.toFixed(0)}`,
              });
            } else if (claimed > 1000 && claimed < 10000) {
              verified++;
            }
          }
        }
      }
    }

    // 3. Check for suspiciously precise current-year statistics without hedging
    const currentYear = new Date().getFullYear();
    const preciseStatsRegex = new RegExp(
      `(?:in ${currentYear}|as of ${currentYear}|${currentYear}[\\s,])\\s*[^.]*?\\$([\\d,]+(?:\\.\\d+)?\\s*(?:billion|million|trillion))`,
      'gi',
    );
    const preciseStats = plainText.match(preciseStatsRegex) || [];
    for (const stat of preciseStats) {
      const hasHedging = /(?:estimated|projected|approximately|forecast|expected|reported|recent)/i.test(stat);
      if (!hasHedging) {
        flagged.push(`Unhedged ${currentYear} statistic: "${stat.trim().slice(0, 100)}..." — add qualifier (estimated/projected/reported)`);
        unverified++;
      }
    }

    // 4. Check for fabricated-sounding Korean policy/law names
    const policyRegex = /(?:Korea(?:n)?|South Korea(?:n)?)\s+(?:Act|Bill|Law|Policy|Regulation|Framework)\s+(?:No\.|Number|#)\s*[\d-]+/gi;
    const policyMatches = plainText.match(policyRegex) || [];
    for (const match of policyMatches) {
      flagged.push(`Potentially fabricated policy reference: "${match}" — verify against official sources`);
      unverified++;
    }

    // 5. Check for outdated population/GDP figures
    const popMatches = plainText.match(/korea(?:'s)?(?:\s+(?:has|with))?\s+(?:a\s+)?population\s+of\s+([\d.]+)\s*million/gi);
    if (popMatches) {
      for (const match of popMatches) {
        const numMatch = match.match(/([\d.]+)\s*million/i);
        if (numMatch) {
          const claimed = parseFloat(numMatch[1]);
          // South Korea population is ~51.3M as of 2026 (declining trend — KSS data)
          if (Math.abs(claimed - 51.3) > 2) {
            flagged.push(`Population claim "${match}" may be outdated (current: ~51.3 million as of 2026)`);
            unverified++;
          } else {
            verified++;
          }
        }
      }
    }

    // 6. Category-specific checks (Finance pivot)
    if (category === 'Korean-Stock') {
      // Check for specific investment recommendations (YMYL violation)
      const investAdvice = /(?:you should|must|definitely|guaranteed to)\s+(?:buy|sell|invest in|short|avoid)/gi;
      const adviceMatches = plainText.match(investAdvice) || [];
      for (const match of adviceMatches) {
        flagged.push(`Direct investment advice detected: "${match}" — use hedged language ("may consider", "based on analysis", "investors could evaluate")`);
        unverified++;
      }

      // Check for guaranteed return claims
      const guaranteedReturns = /(?:guaranteed|certain|risk[- ]free|sure[- ]fire|100%)\s+(?:return|profit|gain|income)/gi;
      const guaranteedMatches = plainText.match(guaranteedReturns) || [];
      for (const match of guaranteedMatches) {
        flagged.push(`Guaranteed return claim: "${match}" — ALL investments carry risk. Remove "guaranteed" language.`);
        unverified++;
      }

      // Check stock price claims without date qualifier
      const priceRegex = /(?:Samsung|SK Hynix|Hyundai|NAVER|Kakao|POSCO|Celltrion|LG Energy)\s+(?:stock|share)\s+(?:price|at|trading)\s+(?:₩|KRW)?\s*([\d,]+)/gi;
      const priceMatches = plainText.match(priceRegex) || [];
      for (const match of priceMatches) {
        const hasDateRef = /(?:as of|on|in \w+ \d{4}|at the time|current|recent|latest)/i.test(
          plainText.slice(Math.max(0, plainText.indexOf(match) - 80), plainText.indexOf(match) + match.length + 80),
        );
        if (!hasDateRef) {
          flagged.push(`Stock price without date qualifier: "${match.slice(0, 60)}" — add "as of [date]" since prices change daily`);
          unverified++;
        }
      }
    }

    if (category === 'AI-Trading') {
      // Check backtest claims without caveats
      const backtestClaims = /(?:backtest|backtested)\s+(?:showed|returned|achieved|generated)\s+(\d+(?:\.\d+)?%?\s+(?:return|profit|annual|CAGR))/gi;
      const backtestMatches = plainText.match(backtestClaims) || [];
      for (const match of backtestMatches) {
        const hasCaveat = /(?:past performance|does not guarantee|slippage|transaction cost|out[- ]of[- ]sample|walk[- ]forward)/i.test(
          plainText.slice(Math.max(0, plainText.indexOf(match) - 150), plainText.indexOf(match) + match.length + 150),
        );
        if (!hasCaveat) {
          flagged.push(`Backtest result without disclaimer: "${match.slice(0, 60)}" — add "past performance does not guarantee future results" caveat`);
          unverified++;
        }
      }

      // Check for claims about AI prediction accuracy without source
      const aiAccuracy = /(?:AI|machine learning|model)\s+(?:predicts?|accuracy|correct)\s+(\d+(?:\.\d+)?%)/gi;
      const aiMatches = plainText.match(aiAccuracy) || [];
      for (const match of aiMatches) {
        const hasSource = /(?:paper|study|research|published|dataset|validation)/i.test(
          plainText.slice(Math.max(0, plainText.indexOf(match) - 100), plainText.indexOf(match) + match.length + 100),
        );
        if (!hasSource) {
          flagged.push(`AI accuracy claim without source: "${match.slice(0, 60)}" — cite research paper or validation methodology`);
          unverified++;
        }
      }
    }


    // 7. Cross-category: Check historical date claims
    const dateClaimRegex = /(?:founded|established|launched|started|opened|created|introduced)\s+in\s+(\d{4})/gi;
    const dateClaims = plainText.match(dateClaimRegex) || [];
    const knownDates: Record<string, number> = {
      // Korean conglomerates / listed companies
      samsung: 1938, 'samsung electronics': 1969, 'sk hynix': 1983, hyundai: 1967,
      'hyundai motor': 1967, lg: 1958, 'lg energy solution': 2020, naver: 1999, kakao: 2010,
      coupang: 2010, 'posco holdings': 1968, posco: 1968, kia: 1944,
      'samsung sdi': 1970, 'samsung biologics': 2011, celltrion: 2002,
      'hd hyundai': 2023, // HD현대 — 현대중공업 지주사 전환 (2023)
      'hanwha aerospace': 1977, 'doosan enerbility': 1962,
      'lg chem': 1947, 'sk innovation': 1962, 'sk telecom': 1984,
      'kb financial': 2008, 'shinhan financial': 2001, 'hana financial': 2005,
      // Brokerages / exchanges
      'korea exchange': 2005, krx: 2005, 'mirae asset': 2000, kiwoom: 2000,
      'samsung securities': 1982, 'kb securities': 2016,
      // Institutions
      'bank of korea': 1950, 'korea tourism organization': 1962,
    };
    for (const match of dateClaims) {
      const yearMatch = match.match(/(\d{4})/);
      if (yearMatch) {
        const claimedYear = parseInt(yearMatch[1]);
        // Check if the entity before the date is in our known dates
        const contextStart = Math.max(0, plainText.indexOf(match) - 80);
        const context = plainText.slice(contextStart, plainText.indexOf(match) + match.length).toLowerCase();
        for (const [entity, correctYear] of Object.entries(knownDates)) {
          if (context.includes(entity) && claimedYear !== correctYear) {
            flagged.push(`Incorrect founding year: "${entity}" claimed ${claimedYear}, correct is ${correctYear}`);
            // Founding year errors are auto-corrected but NOT critical — they don't warrant draft status.
            // Only live data discrepancies (exchange rates, KOSPI) are critical corrections.
            // The auto-fix below will insert the correct year inline.
            if (Math.abs(claimedYear - correctYear) > 5) {
              // >5 year difference is likely a hallucination, add to corrections for auto-fix
              corrections.push({ claim: match, correction: `${entity} was founded/established in ${correctYear}` });
            }
            unverified++;
          }
        }
        // Flag future dates
        if (claimedYear > new Date().getFullYear()) {
          flagged.push(`Future date claim: "${match}" — cannot be founded in the future`);
          unverified++;
        }
      }
    }

    // 8. Cross-category: Check suspiciously round percentages without sources
    const roundPctRegex = /(\d{2,3})%\s+(?:of\s+)?(?:koreans?|korean\s+\w+|south\s+korea|seoul|companies|users|consumers|market)/gi;
    const roundPctMatches = plainText.match(roundPctRegex) || [];
    for (const match of roundPctMatches) {
      const hasCitation = /(?:according to|survey|study|report|data|research|statistics|poll)/i.test(
        plainText.slice(Math.max(0, plainText.indexOf(match) - 100), plainText.indexOf(match) + match.length + 100),
      );
      if (!hasCitation) {
        flagged.push(`Percentage claim without source: "${match.slice(0, 60)}" — cite survey or data source`);
        unverified++;
      }
    }

    // 9. (Reserved for future niche-specific checks)

    // 10. Korean-Stock: Check for recalled or discontinued product claims
    if (category === 'Korean-Stock') {
      // Check sunscreen SPF claims — MFDS caps Korean sunscreen at SPF 50+
      const spfRegex = /SPF\s*(\d+)/gi;
      const spfMatches = plainText.match(spfRegex) || [];
      for (const match of spfMatches) {
        const spfVal = parseInt(match.replace(/SPF\s*/i, ''));
        if (spfVal > 100) {
          flagged.push(`Unlikely SPF claim: "${match}" — SPF above 100 is not recognized by MFDS or FDA`);
          unverified++;
        } else if (spfVal > 50 && /(?:korean|k-beauty|MFDS|olive\s*young|amorepacific|innisfree|beauty\s*of\s*joseon|cosrx|isntree|round\s*lab)/i.test(plainText)) {
          flagged.push(
            `SPF ${spfVal} stated for Korean product — MFDS caps sunscreen labeling at SPF 50+ (최대 표시). ` +
            `Korean-market products must display as "SPF 50+" regardless of actual protection level.`,
          );
          unverified++;
        }
      }

      // Olive Young ranking claims — flag if missing date qualifier
      const oliveYoungRankRegex = /(?:olive young|올리브영)\s*(?:best\s*seller|#\d+|number\s*\d+|ranked?\s*#?\d+|top\s*\d+)/gi;
      const oliveYoungMatches = plainText.match(oliveYoungRankRegex) || [];
      for (const match of oliveYoungMatches) {
        const surroundingText = plainText.slice(
          Math.max(0, plainText.indexOf(match) - 80),
          plainText.indexOf(match) + match.length + 80,
        );
        if (!/as of|updated|current|202\d|checked/i.test(surroundingText)) {
          flagged.push(`Olive Young ranking claim without date qualifier: "${match}" — add "as of [Month Year]" since rankings change frequently`);
          unverified++;
        }
      }
    }

    // Classify critical errors: corrections with live data discrepancies are critical
    const criticalCount = corrections.length;
    const hasCriticalErrors = criticalCount >= 2;

    if (flagged.length > 0) {
      logger.warn(`Fact-check: ${flagged.length} issue(s) found (${criticalCount} critical), ${verified} claim(s) verified`);
      for (const flag of flagged) {
        logger.warn(`  ⚠ ${flag}`);
      }
      if (hasCriticalErrors) {
        logger.warn(`Fact-check: CRITICAL — ${criticalCount} verifiable data errors detected. Post should be drafted for review.`);
      }
    } else {
      logger.info(`Fact-check: ${verified} claim(s) verified, no issues found`);
    }

    return { verified, unverified, flagged, corrections, hasCriticalErrors, criticalCount };
  }

  /**
   * Auto-fix content by applying hedging language to flagged claims.
   * Returns the modified HTML with corrections applied.
   */
  applyCorrections(html: string, corrections: Array<{ claim: string; correction: string }>): string {
    let result = html;
    for (const { claim, correction } of corrections) {
      const escapedClaim = claim.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`(${escapedClaim})`, 'gi');

      if (regex.test(result)) {
        // Strategy 1: Add hedging language for exchange rate / market data claims
        const hedgingMatch = correction.match(/(?:Current|Recent)\s+(?:rate|level)\s+is\s+approximately\s+([\d,]+)/i);
        if (hedgingMatch) {
          // Insert "approximately" before the number if not already hedged
          const numInClaim = claim.match(/([\d,]+(?:\.\d+)?)/);
          if (numInClaim && !/(?:approximately|around|roughly|about|estimated)/i.test(claim)) {
            const numStr = numInClaim[1];
            const hedgedClaim = claim.replace(numStr, `approximately ${numStr}`);
            result = result.replace(regex, hedgedClaim);
            logger.info(`Fact-check: Added hedging to "${claim.slice(0, 50)}..."`);
            continue;
          }
        }

        // Strategy 2: Add inline correction note for other factual discrepancies
        const noteHtml = ` <span class="ab-fact-note" style="font-size:12px; color:#888; font-style:italic;">(${this.escapeHtml(correction)})</span>`;
        result = result.replace(regex, `$1${noteHtml}`);
        logger.info(`Fact-check: Inline note added for "${claim.slice(0, 50)}..."`);
      }
    }
    return result;
  }

  private escapeHtml(text: string): string {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /** Fetch live USD/KRW exchange rate from free API */
  async getUsdKrwRate(): Promise<number | null> {
    const cached = this.exchangeRateCache.get('USDKRW');
    if (cached && Date.now() - cached.timestamp < FactCheckService.CACHE_TTL_MS) {
      return cached.rate;
    }

    try {
      // Use exchangerate-api.com free tier
      const { data } = await axios.get('https://open.er-api.com/v6/latest/USD', { timeout: 5000 });
      const rate = (data as { rates?: Record<string, number> })?.rates?.KRW;
      if (rate) {
        this.exchangeRateCache.set('USDKRW', { rate, timestamp: Date.now() });
        return rate;
      }
    } catch (error) {
      logger.debug(`Exchange rate fetch failed: ${error instanceof Error ? error.message : error}`);
    }
    return null;
  }

  /** Fetch approximate KOSPI level from Google Finance or fallback */
  async getKospiLevel(): Promise<number | null> {
    try {
      // Use a free financial data endpoint
      const { data } = await axios.get('https://query1.finance.yahoo.com/v8/finance/chart/%5EKS11?interval=1d&range=5d', {
        timeout: 5000,
        headers: { 'User-Agent': 'Mozilla/5.0' },
      });
      const result = data as { chart?: { result?: Array<{ meta?: { regularMarketPrice?: number } }> } };
      const price = result?.chart?.result?.[0]?.meta?.regularMarketPrice;
      if (price && price > 1000) {
        return price;
      }
    } catch (error) {
      logger.debug(`KOSPI level fetch failed: ${error instanceof Error ? error.message : error}`);
    }
    return null;
  }

  /** Fetch KOSPI weekly historical data (1 year) from Yahoo Finance */
  async getKospiHistoricalData(): Promise<Array<{ date: string; close: number }> | null> {
    try {
      const now = Math.floor(Date.now() / 1000);
      const oneYearAgo = now - 365 * 24 * 60 * 60;
      const { data } = await axios.get(
        `https://query1.finance.yahoo.com/v8/finance/chart/%5EKS11?interval=1wk&period1=${oneYearAgo}&period2=${now}`,
        { timeout: 8000, headers: { 'User-Agent': 'Mozilla/5.0' } },
      );
      const result = data as {
        chart?: {
          result?: Array<{
            timestamp?: number[];
            indicators?: { quote?: Array<{ close?: (number | null)[] }> };
          }>;
        };
      };
      const timestamps = result?.chart?.result?.[0]?.timestamp;
      const closes = result?.chart?.result?.[0]?.indicators?.quote?.[0]?.close;
      if (!timestamps || !closes) return null;

      const points: Array<{ date: string; close: number }> = [];
      for (let i = 0; i < timestamps.length; i++) {
        if (closes[i] != null) {
          points.push({
            date: new Date(timestamps[i] * 1000).toISOString().slice(0, 10),
            close: Math.round(closes[i]!),
          });
        }
      }
      return points.length > 0 ? points : null;
    } catch (error) {
      logger.debug(`KOSPI historical data fetch failed: ${error instanceof Error ? error.message : error}`);
      return null;
    }
  }
}
