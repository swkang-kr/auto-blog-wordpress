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
    'Seollal': ['Korean Food', 'Korea Travel', 'Korean Language'],
    'Cherry Blossom': ['Korea Travel', 'Korean Food'],
    'Children': ['Korea Travel', 'K-Entertainment'],
    'BIFF': ['K-Entertainment', 'Korea Travel'],
    'Chuseok': ['Korean Food', 'Korea Travel', 'Korean Language', 'Korean Finance'],
    'MAMA': ['K-Entertainment'],
    'Christmas': ['Korea Travel', 'Korean Food'],
    'New Year': ['Korea Travel', 'Korean Finance', 'Korean Crypto'],
    'Summer': ['Korea Travel', 'Korean Food', 'K-Beauty'],
    'Suneung': ['Korean Language', 'K-Entertainment'],
    'Auto Show': ['Korean Automotive'],
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

export const NICHES: NicheConfig[] = [
  // ── Korean Tech (3 sub-niches) ──
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
    ],
    contentTypes: ['analysis', 'deep-dive', 'news-explainer', 'x-vs-y', 'how-to', 'case-study'],
  },
  {
    id: 'korean-tech-apps',
    name: 'Korean Apps & Digital Life',
    category: 'Korean Tech',
    broadTerm: 'Korean apps digital',
    seedKeywords: [
      'how to use Naver as a foreigner in Korea',
      'best Korean apps for foreigners living in Seoul',
      'Naver vs Google which is better in South Korea',
      'KakaoTalk features guide for international users',
      'Korean digital banking apps Toss vs KakaoBank comparison',
    ],
    contentTypes: ['how-to', 'best-x-for-y', 'x-vs-y', 'analysis', 'deep-dive', 'listicle', 'product-review'],
  },
  {
    id: 'korean-tech-startups',
    name: 'Korean Startups & VC',
    category: 'Korean Tech',
    broadTerm: 'Korea startup venture',
    seedKeywords: [
      'Pangyo Techno Valley startup ecosystem guide',
      'top Korean unicorn startups to watch 2026',
      'how to invest in Korean startups from abroad',
      'Coupang business model analysis for investors',
      'Korean government startup support programs TIPS explained',
    ],
    contentTypes: ['analysis', 'deep-dive', 'news-explainer', 'best-x-for-y', 'how-to', 'case-study'],
  },

  // ── K-Entertainment (2 sub-niches) ──
  {
    id: 'k-entertainment-music',
    name: 'K-Pop Business & Music Industry',
    category: 'K-Entertainment',
    broadTerm: 'K-pop business',
    seedKeywords: [
      'how does K-pop make money business model explained',
      'HYBE stock analysis buy or sell 2026',
      'K-pop idol agency contracts explained for fans',
      'K-pop global revenue breakdown by market',
      'how K-pop agencies train and debut new groups',
    ],
    contentTypes: ['analysis', 'deep-dive', 'news-explainer', 'how-to', 'x-vs-y', 'case-study'],
  },
  {
    id: 'k-entertainment-drama',
    name: 'K-Drama & Korean Content',
    category: 'K-Entertainment',
    broadTerm: 'K-drama Korean content',
    seedKeywords: [
      'best Korean dramas on Netflix 2026',
      'Korean webtoon apps for English readers',
      'how Korean dramas conquered global streaming platforms',
      'Korean film industry Cannes Oscar winning streak explained',
      'best Korean variety shows for international viewers',
    ],
    contentTypes: ['best-x-for-y', 'analysis', 'deep-dive', 'news-explainer', 'how-to', 'listicle'],
  },

  // ── Korean Finance (2 sub-niches) ──
  {
    id: 'korean-finance-stocks',
    name: 'Korean Stock Market & ETFs',
    category: 'Korean Finance',
    broadTerm: 'Korean stock market KOSPI',
    seedKeywords: [
      'how to invest in Korean stocks as a foreigner',
      'best Korean ETF for international investors 2026',
      'KOSPI index explained for beginners',
      'how to open Korean brokerage account from abroad',
      'top Korean blue chip stocks for long term investors',
    ],
    contentTypes: ['how-to', 'best-x-for-y', 'analysis', 'deep-dive', 'x-vs-y', 'case-study'],
  },
  {
    id: 'korean-finance-economy',
    name: 'Korean Economy & Won',
    category: 'Korean Finance',
    broadTerm: 'Korean economy won exchange',
    seedKeywords: [
      'Korean won exchange rate forecast analysis 2026',
      'Bank of Korea interest rate impact on investments',
      'Korea economic outlook GDP growth forecast 2026',
      'Korean real estate market trends for foreign investors',
      'South Korea national pension fund investment strategy',
    ],
    contentTypes: ['analysis', 'deep-dive', 'news-explainer', 'how-to', 'best-x-for-y', 'case-study'],
  },

  // ── Korean Food (2 sub-niches) ──
  {
    id: 'korean-food-cooking',
    name: 'Korean Cooking & Recipes',
    category: 'Korean Food',
    broadTerm: 'Korean cooking recipe',
    seedKeywords: [
      'how to make authentic Korean kimchi at home step by step',
      'Korean skincare routine for beginners explained',
      'easy Korean recipes for beginners at home',
      'Korean fermented foods guide health benefits explained',
      'Korean convenience store food must try items',
    ],
    contentTypes: ['how-to', 'best-x-for-y', 'deep-dive', 'analysis', 'news-explainer', 'listicle', 'product-review'],
  },
  {
    id: 'korean-food-dining',
    name: 'Korean Dining & Food Culture',
    category: 'Korean Food',
    broadTerm: 'Korean food restaurant culture',
    seedKeywords: [
      'best Korean street food guide for tourists in Seoul',
      'best Korean restaurants in Seoul for foreigners',
      'Korean BBQ etiquette guide for first timers',
      'Michelin star Korean restaurants worth visiting',
      'Korean food delivery apps guide for foreigners',
    ],
    contentTypes: ['best-x-for-y', 'how-to', 'deep-dive', 'analysis', 'news-explainer', 'listicle'],
  },

  // ── Korea Travel (2 sub-niches) ──
  {
    id: 'korea-travel-planning',
    name: 'Korea Travel Planning & Tips',
    category: 'Korea Travel',
    broadTerm: 'South Korea travel guide',
    seedKeywords: [
      'best time to visit South Korea complete travel guide',
      'how to get around Seoul public transportation guide',
      'best neighborhoods to stay in Seoul for tourists',
      'Korea travel tips first time visitors should know',
      'Korea visa requirements for tourists by country',
    ],
    contentTypes: ['how-to', 'best-x-for-y', 'deep-dive', 'analysis', 'news-explainer', 'listicle'],
  },
  {
    id: 'korea-travel-living',
    name: 'Living in Korea as a Foreigner',
    category: 'Korea Travel',
    broadTerm: 'living in Korea foreigner expat',
    seedKeywords: [
      'cost of living in Seoul for foreigners breakdown',
      'how to rent an apartment in Seoul as a foreigner',
      'working in Korea as a foreigner visa guide',
      'best cities to live in Korea besides Seoul',
      'Korean healthcare system guide for foreigners',
    ],
    contentTypes: ['how-to', 'deep-dive', 'best-x-for-y', 'analysis', 'x-vs-y', 'listicle', 'case-study'],
  },

  // ── Korean Language (2 sub-niches) ──
  {
    id: 'korean-language-learning',
    name: 'Learning Korean for Beginners',
    category: 'Korean Language',
    broadTerm: 'learn Korean language beginner',
    seedKeywords: [
      'best apps to learn Korean for beginners ranked',
      'how to learn Hangul Korean alphabet step by step',
      'Korean language study tips for self learners',
      'Korean grammar basics explained for English speakers',
      'best YouTube channels for learning Korean free',
    ],
    contentTypes: ['how-to', 'best-x-for-y', 'deep-dive', 'x-vs-y', 'analysis', 'listicle'],
  },
  {
    id: 'korean-language-advanced',
    name: 'Korean Proficiency & TOPIK',
    category: 'Korean Language',
    broadTerm: 'TOPIK Korean proficiency test',
    seedKeywords: [
      'TOPIK test preparation guide for foreigners',
      'best Korean language schools in Seoul for foreigners',
      'Korean honorifics system explained for advanced learners',
      'Korean business language etiquette guide',
      'TOPIK II writing section tips and strategies',
    ],
    contentTypes: ['how-to', 'best-x-for-y', 'deep-dive', 'analysis', 'x-vs-y', 'case-study'],
  },

  // ── K-Beauty (2 sub-niches) ──
  {
    id: 'k-beauty-skincare',
    name: 'Korean Skincare & Beauty',
    category: 'K-Beauty',
    broadTerm: 'Korean skincare K-beauty',
    seedKeywords: [
      'best Korean skincare routine for beginners step by step',
      'Korean sunscreen vs Western sunscreen comparison',
      'top Korean beauty brands at Olive Young for tourists',
      'how to build a Korean skincare routine on a budget',
      'best Korean sheet masks ranked by dermatologists',
    ],
    contentTypes: ['how-to', 'best-x-for-y', 'x-vs-y', 'analysis', 'deep-dive', 'listicle', 'product-review'],
  },
  {
    id: 'k-beauty-trends',
    name: 'K-Beauty Industry & Trends',
    category: 'K-Beauty',
    broadTerm: 'K-beauty industry trend',
    seedKeywords: [
      'how K-beauty conquered the global skincare market',
      'Korean beauty industry market size and growth analysis',
      'Amorepacific vs LG Household stock analysis for investors',
      'Korean beauty tech innovations glass skin trend explained',
      'best Korean beauty startups disrupting the industry',
    ],
    contentTypes: ['analysis', 'deep-dive', 'news-explainer', 'case-study', 'best-x-for-y', 'x-vs-y'],
  },

  // ── Korean Crypto & Web3 (1 sub-niche) ──
  {
    id: 'korean-crypto-web3',
    name: 'Korean Crypto & Web3',
    category: 'Korean Crypto',
    broadTerm: 'Korea crypto Upbit blockchain',
    seedKeywords: [
      'how to buy crypto in Korea Upbit vs Bithumb comparison',
      'Korean crypto regulations travel rule explained for foreigners',
      'why Korea is called the crypto capital of Asia',
      'Korean blockchain projects and Web3 startups to watch',
      'Kimchi premium explained Korean crypto price difference',
    ],
    contentTypes: ['how-to', 'analysis', 'deep-dive', 'news-explainer', 'x-vs-y', 'case-study'],
  },

  // ── Korean Automotive / EV (1 sub-niche) ──
  {
    id: 'korean-auto-ev',
    name: 'Korean EV & Automotive Industry',
    category: 'Korean Automotive',
    broadTerm: 'Hyundai Kia electric vehicle Korea',
    seedKeywords: [
      'Hyundai Ioniq 5 vs Kia EV6 which is better comparison',
      'how Korea became a global electric vehicle leader',
      'Korean EV battery makers LG Samsung SK comparison',
      'best Korean electric cars available outside Korea',
      'Hyundai stock analysis EV strategy for investors',
    ],
    contentTypes: ['analysis', 'deep-dive', 'x-vs-y', 'news-explainer', 'best-x-for-y', 'case-study', 'product-review'],
  },
];
