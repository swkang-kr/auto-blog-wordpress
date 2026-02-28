import type { NicheConfig } from '../types/index.js';

export const NICHES: NicheConfig[] = [
  {
    id: 'korean-food',
    name: 'Korean Food at Home',
    category: 'Food',
    seedKeywords: [
      'easy Korean street food recipes for beginners',
      'homemade Korean fried chicken recipe',
      'tteokbokki recipe easy at home',
      'Korean meal prep ideas for the week',
      'simple Korean side dishes for dinner',
    ],
    contentTypes: ['how-to', 'best-x-for-y'],
  },
  {
    id: 'personal-finance',
    name: 'Personal Finance for Beginners',
    category: 'Finance',
    seedKeywords: [
      'zero based budgeting for beginners step by step',
      'how to build emergency fund on low income',
      'best budgeting apps for couples comparison',
      'how to pay off debt fast on small salary',
      'side hustle ideas to make money online from home',
    ],
    contentTypes: ['how-to', 'best-x-for-y', 'x-vs-y'],
  },
  {
    id: 'ai-tools-review',
    name: 'AI Tools for Content Creators',
    category: 'Technology',
    seedKeywords: [
      'best free AI writing tools for bloggers',
      'how to use AI to write blog posts faster',
      'AI tools for small business owners comparison',
      'best AI image generators for content creators',
      'how to use ChatGPT for SEO content writing',
    ],
    contentTypes: ['best-x-for-y', 'x-vs-y', 'how-to'],
  },
  {
    id: 'home-productivity',
    name: 'Home Office & Productivity',
    category: 'Lifestyle',
    seedKeywords: [
      'best Notion templates for personal productivity',
      'how to work from home without getting distracted',
      'morning routine ideas for remote workers',
      'how to set up a home office on a budget',
      'time management tips for work from home parents',
    ],
    contentTypes: ['how-to', 'best-x-for-y'],
  },
  {
    id: 'health-wellness',
    name: 'Health & Wellness on a Budget',
    category: 'Health',
    seedKeywords: [
      'intermittent fasting for beginners over 30',
      'how to start working out at home without equipment',
      'healthy meal prep ideas for the week under 50 dollars',
      'how to improve sleep quality naturally at home',
      'easy stress relief techniques you can do at home',
    ],
    contentTypes: ['how-to', 'best-x-for-y'],
  },
];
