import { getSeasonalContext } from '../utils/korean-calendar.js';
import type { NicheConfig } from '../types/index.js';

/**
 * Get niches sorted by seasonal relevance.
 * Niches matching current Korean seasonal events are boosted to the front.
 */
export function getSeasonallyOrderedNiches(): NicheConfig[] {
  const { events } = getSeasonalContext();
  if (events.length === 0) return [...NICHES];

  // Map seasonal events back to niche categories that are relevant right now
  const KOREAN_EVENTS_NICHE_MAP: Record<string, string[]> = {
    'Seollal': ['Korea Travel', 'K-Entertainment', 'Korean Finance'],
    'Cherry Blossom': ['Korea Travel', 'K-Beauty'],
    'Children': ['Korea Travel', 'K-Entertainment'],
    'Summer': ['Korea Travel', 'K-Beauty'],
    'Chuseok': ['Korea Travel', 'Korean Finance', 'K-Entertainment'],
    'BIFF': ['K-Entertainment', 'Korea Travel'],
    'Suneung': ['K-Entertainment', 'Korean Tech'],
    'MAMA': ['K-Entertainment'],
    'Memorial': ['Korea Travel', 'K-Entertainment'],
    'Dano': ['Korea Travel', 'K-Entertainment'],
    'Summer Sales': ['K-Beauty', 'Korean Tech', 'Korean Finance'],
    'Mid-Year': ['K-Beauty', 'Korean Tech', 'Korean Finance'],
    'Black Friday': ['K-Beauty', 'Korean Tech', 'Korean Finance'],
    'Singles Day': ['K-Beauty', 'Korean Tech', 'Korean Finance'],
    'Christmas': ['Korea Travel', 'K-Beauty'],
    'New Year': ['Korea Travel', 'Korean Finance', 'Korean Tech'],
    'CES': ['Korean Tech'],
    'MWC': ['Korean Tech'],
    'Auto Show': ['Korean Tech'],
    'Mobility Show': ['Korean Tech'],
    'Earnings Season': ['Korean Finance', 'Korean Tech'],
    'K-Beauty Awards': ['K-Beauty'],
  };

  const boostedCategories = new Set<string>();
  for (const event of events) {
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
 * CORE NICHES (5 focused niches for topical authority)
 * Strategy: 3-5 niches × 1-2 posts/day = 10-15 posts/niche/month
 * This builds Google's topical authority signals vs spreading thin across 15 niches.
 *
 * Selected based on: search volume, monetization potential (AdSense RPM),
 * competition level, and content sustainability.
 */
export const NICHES: NicheConfig[] = [
  // ── Korean Tech & AI (highest AdSense RPM, strong search volume) ──
  {
    id: 'korean-tech-ai',
    name: 'Korean AI & Semiconductors',
    category: 'Korean Tech',
    broadTerm: 'Korea AI semiconductor',
    seedKeywords: [
      'Samsung AI chip vs NVIDIA comparison 2026',
      'SK Hynix HBM memory market share analysis',
      'South Korea AI startup investment opportunities 2026',
      'Korean government AI investment policy explained',
      'how Korea became a global semiconductor powerhouse',
      'best Korean tech stocks for AI investors',
      'Korean AI companies to watch for global expansion',
      'Samsung Galaxy AI features vs Apple Intelligence comparison',
    ],
    contentTypes: ['analysis', 'deep-dive', 'news-explainer', 'x-vs-y', 'how-to', 'case-study', 'best-x-for-y', 'listicle'],
    adSenseRpm: 'high',
  },

  // ── Korean Finance & Investment (high RPM, evergreen content) ──
  {
    id: 'korean-finance-stocks',
    name: 'Korean Stock Market & Investment',
    category: 'Korean Finance',
    broadTerm: 'Korean stock market KOSPI investment',
    seedKeywords: [
      'how to invest in Korean stocks as a foreigner',
      'best Korean ETF for international investors 2026',
      'KOSPI index explained for beginners',
      'how to open Korean brokerage account from abroad',
      'top Korean blue chip stocks for long term investors',
      'Korean won exchange rate forecast analysis 2026',
      'Bank of Korea interest rate impact on investments',
      'Korea economic outlook GDP growth forecast 2026',
    ],
    contentTypes: ['how-to', 'best-x-for-y', 'analysis', 'deep-dive', 'x-vs-y', 'case-study', 'news-explainer', 'listicle'],
    adSenseRpm: 'high',
  },

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

  // ── Korea Travel & Living (high search volume, diverse content types) ──
  {
    id: 'korea-travel-guide',
    name: 'Korea Travel & Expat Life',
    category: 'Korea Travel',
    broadTerm: 'South Korea travel guide living',
    seedKeywords: [
      'best time to visit South Korea complete travel guide',
      'how to get around Seoul public transportation guide',
      'best neighborhoods to stay in Seoul for tourists',
      'Korea travel tips first time visitors should know',
      'cost of living in Seoul for foreigners breakdown',
      'how to rent an apartment in Seoul as a foreigner',
      'best Korean food to try for first time visitors',
      'Korea visa requirements for tourists by country',
    ],
    contentTypes: ['how-to', 'best-x-for-y', 'deep-dive', 'analysis', 'listicle', 'news-explainer', 'x-vs-y', 'case-study'],
    adSenseRpm: 'low',
  },

  // ── K-Entertainment Business (high engagement, viral potential) ──
  {
    id: 'k-entertainment-business',
    name: 'K-Pop & K-Drama Business',
    category: 'K-Entertainment',
    broadTerm: 'K-pop K-drama business industry',
    seedKeywords: [
      'how does K-pop make money business model explained',
      'HYBE stock analysis buy or sell 2026',
      'K-pop global revenue breakdown by market',
      'best Korean dramas on Netflix 2026',
      'how Korean dramas conquered global streaming platforms',
      'Korean webtoon apps for English readers',
      'K-pop idol agency contracts explained for fans',
      'Korean content industry export growth analysis',
    ],
    contentTypes: ['analysis', 'deep-dive', 'news-explainer', 'best-x-for-y', 'how-to', 'case-study', 'listicle', 'x-vs-y'],
    adSenseRpm: 'medium',
  },
];
