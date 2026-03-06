import type { NicheConfig } from '../types/index.js';

export const NICHES: NicheConfig[] = [
  {
    id: 'korean-tech',
    name: 'Korean Tech & Startup',
    category: 'Korean Tech',
    broadTerm: 'Korean technology',
    seedKeywords: [
      'Samsung Galaxy AI vs iPhone comparison 2026',        // ← 높은 검색량
      'best Korean apps for foreigners living in Korea',    // ← 실용적 의도
      'Naver vs Google in South Korea explained',           // ← 비교 의도
      'Korean startup ecosystem how to invest 2026',        // ← 상업적 의도  
      'South Korea semiconductor stocks to watch',          // ← 투자 의도
    ],
    contentTypes: ['analysis', 'deep-dive', 'news-explainer', 'how-to', 'x-vs-y'],
  },
  {
    id: 'k-entertainment',
    name: 'K-Entertainment Analysis',
    category: 'K-Entertainment',
    broadTerm: 'K-pop K-drama',
    seedKeywords: [
      'how does K-pop make money business model explained', // ← 분석 의도
      'best Korean dramas to watch on Netflix 2026',        // ← 높은 검색량
      'HYBE stock analysis SM Entertainment investment',    // ← 투자 의도
      'Korean webtoon apps for English readers 2026',       // ← 실용적 의도
      'why K-pop is popular worldwide explained',           // ← 정보 탐색 의도
    ],
    contentTypes: ['analysis', 'deep-dive', 'news-explainer', 'best-x-for-y', 'how-to'],
  },
  {
    id: 'korean-finance',
    name: 'Korean Investment & Finance',
    category: 'Korean Finance',
    broadTerm: 'Korean stock market',
    seedKeywords: [
      'how to invest in Korean stocks as a foreigner',      // ← 실제 검색어
      'KOSPI index explained for beginners',                 // ← 검색 의도 명확
      'best Korean ETF for international investors 2026',   // ← 상업적 의도
      'Korean won exchange rate forecast 2026',             // ← 시의성
      'South Korea stock market outlook 2026',              // ← 분석 의도
    ],
    contentTypes: ['analysis', 'deep-dive', 'news-explainer', 'how-to', 'best-x-for-y'],
  },
];
