import type { NicheConfig } from '../types/index.js';

export const NICHES: NicheConfig[] = [
  {
    id: 'korean-tech',
    name: 'Korean Tech & Startup',
    category: 'Korean Tech',
    broadTerm: 'Korean technology',
    seedKeywords: [
      'how to use Naver as a foreigner in Korea',
      'Samsung Galaxy AI features explained 2026',
      'best Korean apps for foreigners living in Seoul',
      'Naver vs Google which is better in South Korea',
      'South Korea AI startup investment opportunities 2026',
    ],
    contentTypes: ['analysis', 'deep-dive', 'news-explainer', 'how-to', 'x-vs-y'],
  },
  {
    id: 'k-entertainment',
    name: 'K-Entertainment Analysis',
    category: 'K-Entertainment',
    broadTerm: 'K-pop K-drama',
    seedKeywords: [
      'how does K-pop make money business model explained',
      'best Korean dramas on Netflix 2026',
      'HYBE stock analysis buy or sell 2026',
      'Korean webtoon apps for English readers',
      'K-pop idol agency contracts explained for fans',
    ],
    contentTypes: ['analysis', 'deep-dive', 'news-explainer', 'best-x-for-y', 'how-to'],
  },
  {
    id: 'korean-finance',
    name: 'Korean Investment & Finance',
    category: 'Korean Finance',
    broadTerm: 'Korean stock market',
    seedKeywords: [
      'how to invest in Korean stocks as a foreigner',
      'best Korean ETF for international investors 2026',
      'KOSPI index explained for beginners',
      'how to open Korean brokerage account from abroad',
      'Korean won exchange rate forecast analysis 2026',
    ],
    contentTypes: ['analysis', 'deep-dive', 'news-explainer', 'how-to', 'best-x-for-y'],
  },
];
