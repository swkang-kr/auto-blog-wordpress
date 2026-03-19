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
      const ingredientPctRegex = /(\d+(?:\.\d+)?%)\s+(?:niacinamide|retinol|retinal|vitamin c|ascorbic acid|hyaluronic acid|salicylic acid|aha|bha|pha|centella|snail mucin|tranexamic acid|glutathione|bakuchiol|polyglutamic acid|pga|madecassoside|asiaticoside|adenosine)/gi;
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

      // 11차 감사: MFDS 기능성 화장품 인증 없이 치료 주장 감지
      const treatmentClaims = /(?:removes?|eliminates?|erases?|treats?|corrects?)\s+(?:wrinkles?|aging|fine\s*lines|dark\s*spots|hyperpigmentation|acne|breakouts?|melasma|blemish)/gi;
      const treatmentMatches = plainText.match(treatmentClaims) || [];
      for (const tm of treatmentMatches) {
        const tmIdx = plainText.indexOf(tm);
        const tmContext = plainText.slice(Math.max(0, tmIdx - 150), tmIdx + tm.length + 150);
        const isFunctionalMarked = /(?:MFDS|기능성\s*화장품|functional\s*cosmetic).{0,50}(?:certif|approv|register)/i.test(tmContext);
        if (!isFunctionalMarked) {
          flagged.push(
            `Treatment claim without MFDS functional cosmetic certification: "${tm}" — ` +
            `only MFDS-certified 기능성 화장품 (brightening/anti-wrinkle/sunscreen) can make treatment claims. ` +
            `Use hedged language ("helps reduce", "may improve").`,
          );
          unverified++;
        }
      }

      // 11차 감사: 성분 농도 범위 이상치 감지 (niacinamide 2-10%, retinol 0.025-1.0%, vitamin C 5-20%)
      const concentrationRanges: Record<string, { min: number; max: number; label: string }> = {
        niacinamide: { min: 2, max: 10, label: 'niacinamide (typical 2-10%)' },
        retinol: { min: 0.01, max: 1.0, label: 'retinol (typical 0.01-1.0%)' },
        'vitamin c': { min: 5, max: 20, label: 'vitamin C / ascorbic acid (typical 5-20%)' },
        'ascorbic acid': { min: 5, max: 20, label: 'ascorbic acid (typical 5-20%)' },
        'salicylic acid': { min: 0.5, max: 2, label: 'salicylic acid (typical 0.5-2%)' },
        // 15차 감사: 누락 성분 농도 범위
        retinal: { min: 0.005, max: 0.1, label: 'retinal/retinaldehyde (cosmetic 0.005-0.1% — ~11x more potent than retinol)' },
        retinaldehyde: { min: 0.005, max: 0.1, label: 'retinaldehyde (cosmetic 0.005-0.1%)' },
        'glycolic acid': { min: 3, max: 10, label: 'glycolic acid (cosmetic leave-on 3-10%; 10%+ = peel, not daily use)' },
        'lactic acid': { min: 5, max: 12, label: 'lactic acid (cosmetic 5-12%)' },
        'mandelic acid': { min: 2, max: 10, label: 'mandelic acid (cosmetic 2-10%)' },
        madecassoside: { min: 0.1, max: 5, label: 'madecassoside (cosmetic 0.1-5%)' },
        adenosine: { min: 0.04, max: 0.2, label: 'adenosine (MFDS functional cosmetic min 0.04%, typical 0.04-0.1%)' },
        // 28차 감사: 누락 성분 농도 범위
        'azelaic acid': { min: 5, max: 20, label: 'azelaic acid (cosmetic 5-10%, prescription 15-20%)' },
        'tranexamic acid': { min: 2, max: 5, label: 'tranexamic acid (cosmetic topical 2-5%)' },
        'copper peptide': { min: 0.001, max: 1, label: 'copper peptide / GHK-Cu (cosmetic 0.001-1%)' },
      };
      for (const [ingredient, range] of Object.entries(concentrationRanges)) {
        const concRegex = new RegExp(`(\\d+(?:\\.\\d+)?)%\\s*${ingredient.replace(/\s+/g, '\\s*')}`, 'gi');
        const concMatches = plainText.match(concRegex) || [];
        for (const cm of concMatches) {
          const pctMatch = cm.match(/(\d+(?:\.\d+)?)%/);
          if (pctMatch) {
            const pctVal = parseFloat(pctMatch[1]);
            if (pctVal < range.min || pctVal > range.max) {
              flagged.push(
                `Unusual ${range.label} concentration: ${pctVal}% — ` +
                `typical cosmetic range is ${range.min}-${range.max}%. Verify with manufacturer data.`,
              );
              unverified++;
            }
          }
        }
      }

      // 11차 감사: 의약품/의약외품 경계 — 피부과 질환 치료 주장 감지
      const medicalClaimsRegex = /(?:heals?|cures?|treats?|relieves?|alleviates?|eliminates?)\s+(?:eczema|dermatitis|acne\s*vulgaris|rosacea|psoriasis|fungal|infection|inflammation|wound)/gi;
      const medicalMatches = plainText.match(medicalClaimsRegex) || [];
      for (const mm of medicalMatches) {
        flagged.push(
          `Medical claim detected: "${mm}" — MFDS classifies this as a medicine/quasi-drug (의약품/의약외품), ` +
          `not a cosmetic. Revise to "supports skin health" or "may help calm" instead.`,
        );
        unverified++;
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

      // 15차 감사: OTT vs broadcast rating format validation
      const ratingPctRegex = /(\d{1,2}(?:\.\d+)?)\s*%\s*(?:rating|viewership|시청률)/gi;
      const ratingMatches = plainText.match(ratingPctRegex) || [];
      for (const match of ratingMatches) {
        const nearbyText = plainText.slice(
          Math.max(0, plainText.indexOf(match) - 80),
          plainText.indexOf(match) + match.length + 80,
        );
        const isOttContext = /Netflix|TVING|Disney\+|Coupang\s*Play|Wavve|Viki|Apple\s*TV/i.test(nearbyText);
        if (isOttContext) {
          flagged.push(
            `OTT platform paired with percentage rating: "${match.slice(0, 40)}" — OTT platforms use view hours/completion rate, NOT household %. ` +
            `Percentage ratings apply only to broadcast networks (AGB Nielsen). Revise metric or note it is a broadcast-only measurement.`,
          );
          unverified++;
        }
      }

      // 15차 감사: Wavve-as-standalone-platform flag (merged with TVING in 2025)
      if (/\bWavve\b/.test(plainText)) {
        const wavveContext = plainText.slice(
          Math.max(0, plainText.indexOf('Wavve') - 100),
          plainText.indexOf('Wavve') + 200,
        );
        const treatsAsActive = /Wavve\s+(?:offers|has|features|provides|original|exclusive|new|subscribers|users)/i.test(wavveContext);
        const hasMergerNote = /merge|absorbed|TVING.*Wavve|Wavve.*TVING.*(?:merge|combined|integrated)/i.test(wavveContext);
        if (treatsAsActive && !hasMergerNote) {
          flagged.push(
            `Wavve referenced as active standalone platform — Wavve merged with TVING in 2025. Use "TVING (which absorbed Wavve in 2025)" on first reference.`,
          );
          unverified++;
        }
      }

      // 15차 감사: K-drama episode count validation for Netflix Originals
      const netflixEpRegex = /Netflix\s*Original[^.]{0,60}(\d{2,3})\s*episode/i;
      const netflixEpMatch = netflixEpRegex.exec(plainText);
      if (netflixEpMatch) {
        const epCount = parseInt(netflixEpMatch[1]);
        if (epCount > 16) {
          flagged.push(
            `Netflix Korea Original claimed as ${epCount} episodes — Netflix Korea originals are nearly exclusively 8-12 episodes (max 16). ` +
            `Verify: a ${epCount}-episode drama is likely a Korean network drama with Netflix distribution rights, NOT a Netflix Original.`,
          );
          unverified++;
        }
      }

      // 27차 감사: Apple TV+ / Disney+ Korea Original 에피소드 카운트 검증
      const ottEpRegex = /(?:Apple\s*TV\+?|Disney\+?)\s*(?:Korea\s*)?Original[^.]{0,60}(\d{2,3})\s*episode/i;
      const ottEpMatch = ottEpRegex.exec(plainText);
      if (ottEpMatch) {
        const epCount = parseInt(ottEpMatch[1]);
        if (epCount > 16) {
          flagged.push(
            `OTT Korea Original claimed as ${epCount} episodes — Apple TV+/Disney+ Korea originals are typically 6-12 episodes (max 16). ` +
            `Verify: a ${epCount}-episode drama may be a network drama with OTT distribution rights, NOT an OTT Original.`,
          );
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
      // 11차 감사: 레거시/3세대/3.5세대 그룹 데뷔 연도 추가
      shinee: 2008, 'red velvet': 2014, got7: 2014, mamamoo: 2014,
      day6: 2015, btob: 2012, 'the boyz': 2017, treasure: 2020,
      itzy: 2019, '(g)i-dle': 2018, nmixx: 2022, 'kiss of life': 2023,
      'newjeans': 2022, 'babymonster': 2023, riize: 2023, illit: 2024,
      qwer: 2023, plave: 2023,
      // 15차 감사: 2023-2025 데뷔 그룹 추가
      zerobaseone: 2023, zb1: 2023, boynextdoor: 2023, xikers: 2023,
      'n.ssign': 2023, 'young posse': 2023, '8turn': 2023, 'ampers&one': 2023,
      tws: 2024, 'nct wish': 2024, meovv: 2024, whiplash: 2024,
      katseye: 2024, unis: 2024, izna: 2024,
      // 27차 감사: 누락 그룹/아티스트 데뷔 연도
      'fifty fifty': 2022, 'h1-key': 2022, 'purple kiss': 2020,
      'xdinary heroes': 2021, 'vcha': 2023, nexz: 2024,
      'dreamcatcher': 2017, 'fromis_9': 2018,
      '2ne1': 2009, bigbang: 2006,
      'g-dragon': 2006, // BIGBANG 멤버로 데뷔 (솔로 데뷔 2009)
      badvillain: 2024, evnne: 2023,
      // 19차 감사: 인디밴드 데뷔 연도 + 플랫폼 설립 연도
      'wave to earth': 2019, hyukoh: 2014, 'the rose': 2017, lucy: 2020,
      'silica gel': 2012, 'lim young-woong': 2020, // 미스터트롯 우승 데뷔 기준
      // K-Beauty brands (common AI dating errors)
      cosrx: 2013, 'beauty of joseon': 2010, tirtir: 2019, laneige: 1994,
      sulwhasoo: 1997, innisfree: 2000, missha: 2000, 'etude house': 1995,
      etude: 1995, // 리브랜딩: Etude House → Etude (2024)
      amorepacific: 1945, numbuzin: 2020, biodance: 2018, "d'alba": 2015,
      'round lab': 2018, isntree: 2009, 'haruharu wonder': 2018, mixsoon: 2019,
      'some by mi': 2016, abib: 2014, 'ma:nyo': 2012, nacific: 2015,
      illiyoon: 2006, aestura: 2003, purito: 2015, jumiso: 2018,
      benton: 2011, 'vt cosmetics': 2018, fwee: 2020, rovectin: 2013,
      "ample:n": 2016, 'dr.g': 2003, klavuu: 2015,
      // 11차 감사: 누락 K-Beauty 브랜드 창립 연도 추가 (rovectin/benton/jumiso는 위에 이미 있음)
      'pyunkang yul': 2010, acwell: 2005, apieu: 2014,
      'dashing diva': 2001, ohora: 2018, 'gelato factory': 2019,
      tamburins: 2017, nonfiction: 2019, granhand: 2015,
      'daeng gi meo ri': 1970, ryo: 2008, masil: 2019,
      // 15차 감사: 누락 K-Beauty 브랜드 추가
      anua: 2019, torriden: 2021, skin1004: 2013, klairs: 2010,
      medicube: 2014, 'axis-y': 2019, 'by wishtrend': 2014,
      "i'm from": 2012, hince: 2019, 'skin&lab': 2016, cnp: 2000,
      heimish: 2015, 'cos de baha': 2017, goodal: 2012, skinfood: 2004,
      'peach c': 2019, wakemake: 2019, 'jung saem mool': 2015,
      // 27차 감사: 누락 K-Beauty 브랜드 창립 연도
      peripera: 2014, 'holika holika': 2010, 'tony moly': 2006, 'banila co': 2006,
      'glow recipe': 2014, // NOTE: Glow Recipe는 한국계 미국 브랜드 (Christine Chang + Sarah Lee)
      'laka': 2018,
      // 28차 감사: 누락 K-Beauty 브랜드
      'rom&nd': 2016, romand: 2016, // 롬앤 — Min Saerom 설립, 립틴트·블러셔 글로벌 베스트셀러
      'clio': 2012, // 클리오 — Kill Cover 쿠션, BLACKPINK Jisoo 앰배서더 (2020~)
      skintific: 2020, // NOTE: 인도네시아 브랜드, NOT Korean — Korean-inspired formulations
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

    // 9. (Reserved for future niche-specific checks)

    // 10. K-Beauty: Check for recalled or discontinued product claims
    if (category === 'K-Beauty') {
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
