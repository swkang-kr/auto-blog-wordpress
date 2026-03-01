import type { NicheConfig } from '../types/index.js';

export const NICHES: NicheConfig[] = [
  {
    id: 'personal-finance',
    name: 'Personal Finance & Investing for Beginners',
    category: 'Finance',
    broadTerm: 'personal finance',
    seedKeywords: [
      'how to start investing with 100 dollars for beginners',
      'best budgeting apps for beginners to save money',
      'how to pay off debt fast on a low income',
      'how to build an emergency fund from scratch step by step',
      'passive income ideas for beginners with little money',
    ],
    contentTypes: ['how-to', 'best-x-for-y', 'x-vs-y'],
  },
  {
    id: 'ai-tools',
    name: 'AI Tools & Automation for Everyday Use',
    category: 'Technology',
    broadTerm: 'AI tools',
    seedKeywords: [
      'how to use ChatGPT to write better emails at work',
      'best free AI tools for small business owners 2025',
      'how to automate repetitive tasks with AI step by step',
      'ChatGPT vs Gemini which is better for beginners',
      'best AI tools for content creation beginners guide',
    ],
    contentTypes: ['how-to', 'best-x-for-y', 'x-vs-y'],
  },
  {
    id: 'side-hustles',
    name: 'Side Hustles & Passive Income for Beginners',
    category: 'Income',
    broadTerm: 'side hustle',
    seedKeywords: [
      'best side hustles for beginners to make extra money',
      'how to make passive income online with no money to start',
      'best online side hustles you can do from home in 2025',
      'how to start freelancing with no experience and get clients',
      'how to make money on Etsy as a complete beginner',
    ],
    contentTypes: ['how-to', 'best-x-for-y', 'x-vs-y'],
  },
];
