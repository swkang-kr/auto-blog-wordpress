import { getSeasonalContext } from '../utils/korean-calendar.js';
import type { NicheConfig } from '../types/index.js';
import { KOREAN_SEASONAL_EVENTS } from '../types/index.js';

/**
 * Get niches sorted by seasonal relevance.
 * Niches matching current Korean seasonal events are boosted to the front.
 */
export function getSeasonallyOrderedNiches(): NicheConfig[] {
  const { events, upcomingEvents } = getSeasonalContext();
  const allEvents = [...events, ...upcomingEvents];
  if (allEvents.length === 0) return [...NICHES];

  // Map seasonal events back to niche categories that are relevant right now
  const KOREAN_EVENTS_NICHE_MAP: Record<string, string[]> = {
    'Seollal': ['K-Entertainment'],
    'Cherry Blossom': ['K-Beauty'],
    'Children': ['K-Entertainment'],
    'Summer': ['K-Beauty'],
    'Chuseok': ['K-Entertainment'],
    'BIFF': ['K-Entertainment'],
    'Suneung': ['K-Entertainment'],
    'MAMA': ['K-Entertainment'],
    'Memorial': ['K-Entertainment'],
    'Dano': ['K-Entertainment'],
    'Summer Sales': ['K-Beauty'],
    'Mid-Year': ['K-Beauty'],
    'Black Friday': ['K-Beauty'],
    'Singles Day': ['K-Beauty'],
    'Christmas': ['K-Beauty', 'K-Entertainment'],
    'New Year': ['K-Entertainment'],
    'CES': ['K-Entertainment'],
    'MWC': ['K-Entertainment'],
    'Auto Show': ['K-Entertainment'],
    'Mobility Show': ['K-Entertainment'],
    'Earnings Season': ['K-Entertainment'],
    'K-Beauty Awards': ['K-Beauty'],
  };

  const boostedCategories = new Set<string>();
  for (const event of allEvents) {
    for (const [key, categories] of Object.entries(KOREAN_EVENTS_NICHE_MAP)) {
      if (event.includes(key)) {
        categories.forEach(c => boostedCategories.add(c));
      }
    }
  }

  if (boostedCategories.size === 0) return [...NICHES];

  const boosted = NICHES.filter(n => boostedCategories.has(n.category));
  const rest = NICHES.filter(n => !boostedCategories.has(n.category));
  return [...boosted, ...rest];
}

/**
 * CORE NICHES (2 focused niches for rapid topical authority)
 * Strategy: 2 niches × 2-3 posts/day = 15-20 posts/niche/month
 * Goal: reach 15+ posts per niche ASAP for Google topical authority signals.
 *
 * Phase 1 (current): K-Beauty + K-Entertainment — medium competition, high engagement
 * Phase 2 (after 15+ posts each): re-add Korean Tech & Korean Finance (high RPM)
 *
 * Selected based on: competition level (lower wins for new sites),
 * audience overlap, viral potential, and monetization diversity.
 */
export const NICHES: NicheConfig[] = [
  // ── K-Beauty & Skincare (high commercial intent, strong product review potential) ──
  {
    id: 'k-beauty-skincare',
    name: 'Korean Skincare & Beauty',
    category: 'K-Beauty',
    broadTerm: 'Korean skincare K-beauty routine',
    seedKeywords: [
      // Beginner how-to (high search volume, evergreen)
      'best Korean skincare routine for beginners step by step',
      'Korean double cleansing method how to do it right',
      'Korean skincare routine for oily skin step by step',
      'how to build a Korean skincare routine on a budget',
      // Product comparisons (high commercial intent, affiliate potential)
      'Korean sunscreen vs Western sunscreen comparison',
      'COSRX snail mucin vs Beauty of Joseon dynasty cream review',
      'best Korean serums under 20 dollars ranked',
      'best Korean sunscreen for sensitive skin no white cast',
      // Shopping guides (tourist + online buyer intent)
      'top Korean beauty brands at Olive Young what locals actually buy',
      'best Korean sheet masks ranked by skin type',
      'best Korean moisturizers for dry skin winter 2026',
      // Trend explainers (shareable, social traffic)
      'Korean glass skin trend how to get it complete guide',
      'Korean skincare ingredients that actually work explained',
      'why Korean sunscreen is better than American sunscreen',
    ],
    contentTypes: ['how-to', 'best-x-for-y', 'x-vs-y', 'analysis', 'deep-dive', 'listicle', 'product-review', 'case-study'],
    adSenseRpm: 'medium',
  },

  // ── K-Entertainment Business (high engagement, viral potential) ──
  {
    id: 'k-entertainment-business',
    name: 'K-Pop & K-Drama Business',
    category: 'K-Entertainment',
    broadTerm: 'K-pop K-drama BTS BLACKPINK NewJeans',
    seedKeywords: [
      // BTS (global fanbase, high search volume)
      'BTS military service impact on K-pop industry revenue',
      'BTS solo albums ranking sales comparison 2026',
      'BTS reunion comeback what to expect timeline',
      'BTS members solo careers success comparison analysis',
      // Multi-group (diversified, avoids BTS-only dependency)
      'NewJeans vs BLACKPINK popularity comparison 2026',
      'HYBE vs JYP vs SM which K-pop agency is winning 2026',
      'Stray Kids world tour revenue and global fanbase growth',
      'best K-pop albums 2026 ranked by sales and streaming',
      // K-Drama (high search volume, Netflix audience)
      'best Korean dramas on Netflix 2026 must watch list',
      'how Korean dramas conquered global streaming platforms',
      'K-drama actors who became global stars overnight',
      // Industry explainers (evergreen, shareable)
      'how does K-pop make money business model explained',
      'K-pop idol agency contracts explained for fans',
      'Korean webtoon apps for English readers complete guide',
    ],
    contentTypes: ['analysis', 'deep-dive', 'news-explainer', 'best-x-for-y', 'how-to', 'case-study', 'listicle', 'x-vs-y'],
    adSenseRpm: 'medium',
  },
];

/**
 * Get seasonal content suggestions based on upcoming Korean events.
 * Returns content angles that should be produced 2 weeks ahead of each event.
 * Used in Phase A to inject seasonal hints into keyword research.
 */
export function getSeasonalContentSuggestions(): Array<{
  eventName: string;
  daysUntilEvent: number;
  relevantNiches: string[];
  contentAngles: string[];
}> {
  const now = new Date();
  const currentMonth = now.getMonth() + 1; // 1-based
  const currentDay = now.getDate();
  const suggestions: Array<{
    eventName: string;
    daysUntilEvent: number;
    relevantNiches: string[];
    contentAngles: string[];
  }> = [];

  for (const event of KOREAN_SEASONAL_EVENTS) {
    // Calculate days until event start
    let eventDate = new Date(now.getFullYear(), event.startMonth - 1, event.startDay);
    // If the event already passed this year, check next year
    if (eventDate < now) {
      eventDate = new Date(now.getFullYear() + 1, event.startMonth - 1, event.startDay);
    }
    const daysUntil = Math.floor((eventDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    // Only suggest if within lead time window (pre-production phase)
    if (daysUntil <= event.leadTimeDays && daysUntil >= 0) {
      suggestions.push({
        eventName: event.name,
        daysUntilEvent: daysUntil,
        relevantNiches: event.relevantNiches,
        contentAngles: event.contentAngles,
      });
    }
  }

  return suggestions.sort((a, b) => a.daysUntilEvent - b.daysUntilEvent);
}
