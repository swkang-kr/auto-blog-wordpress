import type { NicheConfig } from '../types/index.js';

export const NICHES: NicheConfig[] = [
  {
    id: 'korean-tech',
    name: 'Korean Tech & Startup',
    category: 'Korean Tech',
    broadTerm: 'Korean technology',
    seedKeywords: [
      'Korean startup ecosystem trends and investment opportunities',
      'Samsung Galaxy AI features compared to competitors',
      'South Korea semiconductor industry global impact analysis',
      'Korean fintech apps revolutionizing mobile payments',
      'Naver and Kakao AI strategy for global expansion',
    ],
    contentTypes: ['analysis', 'deep-dive', 'news-explainer', 'how-to', 'x-vs-y'],
  },
  {
    id: 'k-entertainment',
    name: 'K-Entertainment Analysis',
    category: 'K-Entertainment',
    broadTerm: 'K-pop K-drama',
    seedKeywords: [
      'K-pop industry business model and revenue streams explained',
      'Korean drama Netflix global streaming impact analysis',
      'K-pop agency stock performance and investment guide',
      'Hallyu wave economic impact on South Korea tourism',
      'Korean webtoon platform global expansion strategy',
    ],
    contentTypes: ['analysis', 'deep-dive', 'news-explainer', 'best-x-for-y', 'how-to'],
  },
  {
    id: 'korean-finance',
    name: 'Korean Investment & Finance',
    category: 'Korean Finance',
    broadTerm: 'Korean stock market',
    seedKeywords: [
      'KOSPI index analysis and Korean stock market outlook',
      'how to invest in Korean stocks as a foreigner guide',
      'Korean won exchange rate impact on global trade',
      'South Korea economic policy and market implications',
      'Korean ETF options for international investors',
    ],
    contentTypes: ['analysis', 'deep-dive', 'news-explainer', 'how-to', 'best-x-for-y'],
  },
];
