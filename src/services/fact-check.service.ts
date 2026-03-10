import axios from 'axios';
import { logger } from '../utils/logger.js';

interface FactCheckResult {
  verified: number;
  unverified: number;
  flagged: string[];
  corrections: Array<{ claim: string; correction: string }>;
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

    // 1. Check KRW exchange rate claims
    const krwMatches = plainText.match(/(?:USD\/KRW|KRW\/USD|korean won|₩)\s*(?:at|around|approximately|is|was|reached|hit)?\s*([\d,]+(?:\.\d+)?)/gi);
    if (krwMatches) {
      const liveRate = await this.getUsdKrwRate();
      if (liveRate) {
        for (const match of krwMatches) {
          const numMatch = match.match(/([\d,]+(?:\.\d+)?)/);
          if (numMatch) {
            const claimed = parseFloat(numMatch[1].replace(/,/g, ''));
            // Allow 10% tolerance for exchange rates (they fluctuate)
            if (claimed > 100 && Math.abs(claimed - liveRate) / liveRate > 0.10) {
              flagged.push(`KRW exchange rate claim "${match}" may be outdated (live: ~${liveRate.toFixed(0)})`);
              corrections.push({
                claim: match,
                correction: `Current rate is approximately ${liveRate.toFixed(0)} KRW/USD`,
              });
            } else if (claimed > 100) {
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
          // South Korea population is ~51.7M as of 2025
          if (Math.abs(claimed - 51.7) > 2) {
            flagged.push(`Population claim "${match}" may be outdated (current: ~51.7 million)`);
            unverified++;
          } else {
            verified++;
          }
        }
      }
    }

    // 6. Category-specific checks
    if (category === 'K-Beauty') {
      // Check for health claims that need disclaimers
      const healthClaims = /(?:cures?|treats?|heals?|prevents?|eliminates?)\s+(?:acne|wrinkles|aging|dark spots|hyperpigmentation)/gi;
      const healthMatches = plainText.match(healthClaims) || [];
      for (const match of healthMatches) {
        flagged.push(`Medical claim detected: "${match}" — use softer language (helps reduce/may improve) per FTC guidelines`);
      }
    }

    if (category === 'Korean Finance') {
      // Check for specific stock price claims
      const stockPriceRegex = /(?:Samsung|SK Hynix|HYBE|Hyundai|LG|Naver|Kakao)\s+(?:stock|share|shares)\s+(?:at|is|was|trading|traded|priced)\s+(?:at\s+)?(?:₩|KRW\s*)?([\d,]+)/gi;
      const stockMatches = plainText.match(stockPriceRegex) || [];
      for (const match of stockMatches) {
        const hasTimeRef = /(?:as of|in (?:january|february|march|april|may|june|july|august|september|october|november|december)|recent|latest)/i.test(match);
        if (!hasTimeRef) {
          flagged.push(`Stock price without date reference: "${match.slice(0, 80)}" — add "as of [month/year]"`);
          unverified++;
        }
      }
    }

    if (flagged.length > 0) {
      logger.warn(`Fact-check: ${flagged.length} issue(s) found, ${verified} claim(s) verified`);
      for (const flag of flagged) {
        logger.warn(`  ⚠ ${flag}`);
      }
    } else {
      logger.info(`Fact-check: ${verified} claim(s) verified, no issues found`);
    }

    return { verified, unverified, flagged, corrections };
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
  private async getUsdKrwRate(): Promise<number | null> {
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
  private async getKospiLevel(): Promise<number | null> {
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
}
