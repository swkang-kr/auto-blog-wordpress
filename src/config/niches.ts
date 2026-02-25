import type { NicheConfig } from '../types/index.js';

export const NICHES: NicheConfig[] = [
  {
    id: 'food-recipe',
    name: 'Food & Recipes',
    category: 'Food',
    seedKeywords: [
      'easy chicken recipes',
      'Korean recipes',
      'Korean street food at home',
    ],
    contentTypes: ['how-to', 'best-x-for-y'],
  },
  {
    id: 'personal-finance',
    name: 'Personal Finance',
    category: 'Finance',
    seedKeywords: [
      'How to save money',
      'passive income ideas',
      'budgeting tips',
    ],
    contentTypes: ['how-to', 'best-x-for-y', 'x-vs-y'],
  },
  {
    id: 'ai-tools-review',
    name: 'AI Tools & Reviews',
    category: 'Technology',
    seedKeywords: [
      'Best AI tools for writing',
      'ChatGPT vs Gemini',
    ],
    contentTypes: ['best-x-for-y', 'x-vs-y', 'how-to'],
  },
];
