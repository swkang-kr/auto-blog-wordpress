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
      'best Korean skincare routine for beginners step by step',
      'Korean sunscreen vs Western sunscreen comparison',
      'top Korean beauty brands at Olive Young for tourists',
      'how to build a Korean skincare routine on a budget',
      'best Korean sheet masks ranked by dermatologists',
      'Korean beauty industry market size and growth analysis',
      'Korean beauty tech innovations glass skin trend explained',
      'best Korean moisturizers for dry skin winter 2026',
    ],
    contentTypes: ['how-to', 'best-x-for-y', 'x-vs-y', 'analysis', 'deep-dive', 'listicle', 'product-review', 'case-study'],
    adSenseRpm: 'medium',
  },

  // ── K-Entertainment Business (high engagement, viral potential) ──
  {
    id: 'k-entertainment-business',
    name: 'K-Pop & K-Drama Business',
    category: 'K-Entertainment',
    broadTerm: 'K-pop K-drama BTS business industry',
    seedKeywords: [
      'how does K-pop make money business model explained',
      'HYBE stock analysis buy or sell 2026',
      'K-pop global revenue breakdown by market',
      'best Korean dramas on Netflix 2026',
      'how Korean dramas conquered global streaming platforms',
      'Korean webtoon apps for English readers',
      'K-pop idol agency contracts explained for fans',
      'Korean content industry export growth analysis',
      'BTS military service impact on K-pop industry revenue',
      'BTS solo albums ranking sales comparison 2026',
      'BTS reunion comeback what to expect timeline',
      'BTS members solo careers success comparison analysis',
      'BTS economic impact on South Korea tourism GDP',
      'BTS vs other K-pop groups global streaming numbers',
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
