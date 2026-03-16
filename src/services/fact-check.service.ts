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

    // 6. Category-specific checks
    if (category === 'K-Beauty') {
      // Check for health claims that need disclaimers
      const healthClaims = /(?:cures?|treats?|heals?|prevents?|eliminates?)\s+(?:acne|wrinkles|aging|dark spots|hyperpigmentation)/gi;
      const healthMatches = plainText.match(healthClaims) || [];
      for (const match of healthMatches) {
        flagged.push(`Medical claim detected: "${match}" — use softer language (helps reduce/may improve) per FTC guidelines`);
      }

      // Check for ingredient percentage claims without sources
      const ingredientPctRegex = /(\d+(?:\.\d+)?%)\s+(?:niacinamide|retinol|vitamin c|hyaluronic acid|salicylic acid|aha|bha|pha|centella|snail mucin)/gi;
      const ingredientMatches = plainText.match(ingredientPctRegex) || [];
      for (const match of ingredientMatches) {
        const hasCitation = /(?:according to|per the|per manufacturer|official|clinically|dermatologist)/i.test(
          plainText.slice(Math.max(0, plainText.indexOf(match) - 100), plainText.indexOf(match) + match.length + 100),
        );
        if (!hasCitation) {
          flagged.push(`Ingredient percentage without source: "${match}" — cite manufacturer data or clinical study`);
          unverified++;
        }
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

      // Check for specific interest rate claims
      const rateRegex = /(?:BOK|Bank of Korea|base rate|key rate)\s+(?:at|is|was|set|raised|cut)\s+(?:to\s+)?(\d+(?:\.\d+)?)\s*%/gi;
      const rateMatches = plainText.match(rateRegex) || [];
      for (const match of rateMatches) {
        const hasHedge = /(?:approximately|around|recently|as of|current)/i.test(match);
        if (!hasHedge) {
          flagged.push(`Interest rate claim without hedging: "${match.slice(0, 80)}" — add temporal qualifier`);
          unverified++;
        }
      }
    }

    if (category === 'Korean Tech') {
      // Check for market share/ranking claims without sources
      const marketShareRegex = /(?:market share|market leader|#\d|number one|world'?s? (?:largest|biggest|first))\s+[^.]{10,80}/gi;
      const msMatches = plainText.match(marketShareRegex) || [];
      for (const match of msMatches) {
        const hasCitation = /(?:according to|per|source|reported|IDC|Gartner|Counterpoint|TrendForce|Omdia|Statista)/i.test(
          plainText.slice(Math.max(0, plainText.indexOf(match) - 50), plainText.indexOf(match) + match.length + 100),
        );
        if (!hasCitation) {
          flagged.push(`Market claim without source: "${match.slice(0, 80)}" — cite research firm (IDC, Gartner, etc.)`);
          unverified++;
        }
      }

      // Check for chip process node claims
      const processNodeRegex = /(\d+)\s*(?:nm|nanometer)\s+(?:process|node|technology|chip)/gi;
      const nodeMatches = plainText.match(processNodeRegex) || [];
      for (const match of nodeMatches) {
        const numMatch = match.match(/(\d+)\s*(?:nm|nanometer)/i);
        if (numMatch) {
          const nm = parseInt(numMatch[1]);
          // Current leading-edge is 2-3nm, flag unlikely claims
          if (nm < 2) {
            flagged.push(`Unlikely process node: "${match}" — sub-2nm not yet in mass production`);
            unverified++;
          }
        }
      }
    }

    if (category === 'K-Entertainment') {
      // Check for specific revenue/earnings claims
      const revRegex = /(?:HYBE|SM|JYP|YG|CJ ENM|Kakao Entertainment|THEBLACKLABEL|BELIFT LAB|Starship Entertainment|FNC Entertainment|MODHAUS|SOURCE MUSIC)\s+(?:revenue|earnings|profit|sales|income)\s+(?:of|at|reached|hit|was)\s+(?:₩|KRW|USD|\$)?\s*([\d.,]+)\s*(?:billion|million|trillion)/gi;
      const revMatches = plainText.match(revRegex) || [];
      for (const match of revMatches) {
        const hasSource = /(?:annual report|quarterly|fiscal|reported|DART|filing|earnings call)/i.test(
          plainText.slice(Math.max(0, plainText.indexOf(match) - 100), plainText.indexOf(match) + match.length + 100),
        );
        if (!hasSource) {
          flagged.push(`Revenue claim without source: "${match.slice(0, 80)}" — cite DART filings or earnings reports`);
          unverified++;
        }
      }

      // Check for streaming/view count claims
      const viewRegex = /(\d[\d,.]*)\s*(?:billion|million)\s+(?:views|streams|downloads|subscribers|listeners)/gi;
      const viewMatches = plainText.match(viewRegex) || [];
      for (const match of viewMatches) {
        const hasTimeRef = /(?:as of|in \d{4}|to date|cumulative|total|current)/i.test(
          plainText.slice(Math.max(0, plainText.indexOf(match) - 60), plainText.indexOf(match) + match.length + 60),
        );
        if (!hasTimeRef) {
          flagged.push(`View/stream count without date context: "${match.slice(0, 60)}" — add "as of [date]" or "to date"`);
          unverified++;
        }
      }
    }

    // 7. Cross-category: Check historical date claims
    const dateClaimRegex = /(?:founded|established|launched|started|opened|created|introduced)\s+in\s+(\d{4})/gi;
    const dateClaims = plainText.match(dateClaimRegex) || [];
    const knownDates: Record<string, number> = {
      // Korean conglomerates
      samsung: 1938, 'sk hynix': 1983, hyundai: 1967, lg: 1958, naver: 1999, kakao: 2010,
      coupang: 2010,
      // K-Entertainment labels (multiple key forms for matching)
      hybe: 2005, 'big hit': 2005,
      'sm entertainment': 1995, sm: 1995,
      'jyp entertainment': 1997, jyp: 1997,
      'yg entertainment': 1996, yg: 1996,
      'belift lab': 2019, 'starship entertainment': 2008, 'fnc entertainment': 2006,
      'source music': 2009, 'pledis entertainment': 2010,
      // K-Entertainment groups
      bts: 2013, blackpink: 2016, aespa: 2020, twice: 2015, exo: 2012,
      seventeen: 2015, 'stray kids': 2018, ive: 2021, 'le sserafim': 2022,
      enhypen: 2020, txt: 2019, ateez: 2018,
      // K-Beauty brands (common AI dating errors)
      cosrx: 2013, 'beauty of joseon': 2019, tirtir: 2019, laneige: 1994,
      sulwhasoo: 1997, innisfree: 2000, missha: 2000, 'etude house': 1995,
      amorepacific: 1945,
      // Institutions
      'bank of korea': 1950, 'korea exchange': 2005, 'olive young': 1999,
      'korea tourism organization': 1962,
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
            corrections.push({ claim: match, correction: `${entity} was founded/established in ${correctYear}` });
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

    // 9. Korea Travel: Check visa/entry requirement claims
    if (category === 'Korea Travel') {
      const visaClaims = /(?:visa-free|visa free|no visa|visa waiver)\s+(?:for\s+)?(?:up to\s+)?(\d+)\s+(?:days|months)/gi;
      const visaMatches = plainText.match(visaClaims) || [];
      for (const match of visaMatches) {
        const dayMatch = match.match(/(\d+)\s+days/i);
        if (dayMatch) {
          const days = parseInt(dayMatch[1]);
          // Standard visa-free is 30, 60, or 90 days — flag unusual numbers
          if (![30, 60, 90, 180].includes(days)) {
            flagged.push(`Unusual visa-free period: "${match}" — verify against Korean Immigration Service`);
            unverified++;
          }
        }
      }

      // Check T-money/transit fare claims
      const fareRegex = /(?:t-money|subway|bus|ktx)\s+(?:fare|cost|ticket|price)\s+(?:is|costs?|around|approximately)?\s*(?:₩|KRW\s*)?([\d,]+)/gi;
      const fareMatches = plainText.match(fareRegex) || [];
      for (const match of fareMatches) {
        const hasTimeRef = /(?:as of|in \d{4}|current|latest|recently|updated)/i.test(
          plainText.slice(Math.max(0, plainText.indexOf(match) - 60), plainText.indexOf(match) + match.length + 60),
        );
        if (!hasTimeRef) {
          flagged.push(`Transit fare without date context: "${match.slice(0, 60)}" — add "as of [year]" since fares change`);
          unverified++;
        }
      }
    }

    // 10. K-Beauty: Check for recalled or discontinued product claims
    if (category === 'K-Beauty') {
      // Check sunscreen SPF claims
      const spfRegex = /SPF\s*(\d+)/gi;
      const spfMatches = plainText.match(spfRegex) || [];
      for (const match of spfMatches) {
        const spfVal = parseInt(match.replace(/SPF\s*/i, ''));
        if (spfVal > 100) {
          flagged.push(`Unlikely SPF claim: "${match}" — SPF above 100 is not recognized by most regulators`);
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
