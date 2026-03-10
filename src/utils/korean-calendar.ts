/**
 * Korean seasonal content calendar for keyword research.
 * Maps Korean holidays/events to date ranges and relevant niches.
 */

interface SeasonalEvent {
  name: string;
  /** Month range [startMonth, endMonth] (1-indexed, inclusive) */
  months: [number, number];
  /** Day range within months [startDay, endDay] (approximate) */
  days?: [number, number];
  niches: string[];
  suggestions: string[];
}

const KOREAN_EVENTS: SeasonalEvent[] = [
  {
    name: 'Seollal (Korean Lunar New Year)',
    months: [1, 2],
    days: [15, 15],
    niches: ['Korea Travel', 'K-Entertainment', 'Korean Finance'],
    suggestions: [
      'best places to visit during Seollal holiday in Korea',
      'Korean New Year customs every foreigner should know',
      'KOSPI stock market performance around Seollal holidays',
      'Korean New Year gift set market trends analysis',
      'K-drama and K-pop Seollal special content guide',
    ],
  },
  {
    name: 'Cherry Blossom Season',
    months: [3, 4],
    days: [20, 15],
    niches: ['Korea Travel', 'K-Beauty'],
    suggestions: [
      'best cherry blossom viewing spots in Korea ranked',
      'spring travel tips for first time Korea visitors',
      'Korean spring skincare routine transition guide',
      'best Korean sunscreen for cherry blossom season outdoor',
    ],
  },
  {
    name: "Children's Day & Spring Festival Season",
    months: [5, 5],
    days: [1, 10],
    niches: ['Korea Travel', 'K-Entertainment'],
    suggestions: [
      "Children's Day family travel activities in Korea guide",
      'spring K-pop festivals and outdoor concert events Korea',
    ],
  },
  {
    name: 'Korean Memorial Day & Dano Festival',
    months: [6, 6],
    days: [1, 15],
    niches: ['Korea Travel', 'K-Entertainment'],
    suggestions: [
      'Korean Memorial Day significance and ceremonies guide',
      'Gangneung Dano Festival UNESCO heritage event guide',
      'June travel destinations in Korea before monsoon season',
      'Korean summer festival calendar June events for tourists',
    ],
  },
  {
    name: 'Korean Summer Sales & Mid-Year Shopping',
    months: [6, 7],
    days: [15, 10],
    niches: ['K-Beauty', 'Korean Tech', 'Korean Finance'],
    suggestions: [
      'Korean mid-year sale best K-beauty deals June July',
      'Samsung Galaxy summer promotion deals and discounts',
      'Korean retail sector mid-year performance analysis',
      'Coupang summer sale best deals for international shoppers',
    ],
  },
  {
    name: 'Korean Earnings Season Q2',
    months: [7, 8],
    days: [15, 15],
    niches: ['Korean Finance', 'Korean Tech'],
    suggestions: [
      'Samsung Electronics Q2 earnings semiconductor market analysis',
      'Korean stock market Q2 earnings season best performers',
      'HYBE JYP SM Q2 revenue K-pop industry growth analysis',
    ],
  },
  {
    name: 'Korean Summer (Monsoon & Beach Season)',
    months: [7, 8],
    days: [1, 31],
    niches: ['Korea Travel', 'K-Beauty'],
    suggestions: [
      'best Korean beaches and summer travel destinations ranked',
      'monsoon season travel tips for Korea visitors',
      'Korean summer skincare waterproof sunscreen essentials',
      'best Korean cooling beauty products for hot weather',
    ],
  },
  {
    name: 'Chuseok (Korean Thanksgiving)',
    months: [9, 10],
    days: [1, 10],
    niches: ['Korea Travel', 'Korean Finance', 'K-Entertainment'],
    suggestions: [
      'Korean stock market trading around Chuseok holidays analysis',
      'Chuseok travel tips what to do in Korea during holidays',
      'Chuseok K-drama specials and entertainment lineup',
      'Korean retail and consumer spending trends during Chuseok',
    ],
  },
  {
    name: 'BIFF (Busan International Film Festival)',
    months: [10, 10],
    days: [1, 15],
    niches: ['K-Entertainment', 'Korea Travel'],
    suggestions: [
      'BIFF Busan Film Festival guide for international visitors',
      'Korean cinema industry trends and box office analysis',
      'Busan travel guide during film festival season',
    ],
  },
  {
    name: 'Korean University Entrance (Suneung)',
    months: [11, 11],
    days: [10, 20],
    niches: ['K-Entertainment', 'Korean Tech'],
    suggestions: [
      'Korean education system and Suneung exam explained',
      'Korean EdTech startups disrupting test preparation market',
    ],
  },
  {
    name: 'MAMA Awards Season',
    months: [11, 12],
    days: [15, 10],
    niches: ['K-Entertainment'],
    suggestions: [
      'MAMA Awards predictions and industry analysis',
      'K-pop year-end awards complete guide',
      'K-pop industry annual revenue and performance review',
    ],
  },
  {
    name: 'Black Friday & Singles Day Korea',
    months: [11, 11],
    days: [1, 30],
    niches: ['K-Beauty', 'Korean Tech', 'Korean Finance'],
    suggestions: [
      'best Korean skincare deals Black Friday Olive Young sales',
      'Korean tech gadget deals Samsung Galaxy discounts guide',
      'Korean e-commerce platforms Coupang sales event analysis',
      'Korean retail sector stock performance during sales season',
    ],
  },
  {
    name: 'Christmas Markets & Winter Tourism',
    months: [12, 12],
    days: [1, 31],
    niches: ['Korea Travel', 'K-Beauty'],
    suggestions: [
      'best Christmas markets in Seoul complete guide',
      'winter travel destinations in Korea ski resorts ranked',
      'Korean winter skincare routine dry cold weather tips',
      'best Korean gift sets and holiday beauty collections',
    ],
  },
  {
    name: 'Korean New Year Countdown',
    months: [12, 1],
    days: [25, 5],
    niches: ['Korea Travel', 'Korean Finance', 'Korean Tech'],
    suggestions: [
      'best New Year celebrations in Seoul countdown spots',
      'Korean stock market year-end outlook KOSPI forecast',
      'Korean economy year in review GDP growth analysis',
      'Korean tech industry predictions and trends next year',
    ],
  },
  {
    name: 'CES & Korean Tech Showcase',
    months: [1, 1],
    days: [5, 15],
    niches: ['Korean Tech'],
    suggestions: [
      'Samsung and LG CES announcements analysis',
      'Korean tech companies CES innovations roundup',
      'Korean AI and semiconductor showcase at CES highlights',
    ],
  },
  {
    name: 'MWC & Korean Mobile Innovation',
    months: [2, 3],
    days: [20, 5],
    niches: ['Korean Tech'],
    suggestions: [
      'Samsung Galaxy new phone launch MWC analysis',
      'Korean 6G and telecom innovation at MWC highlights',
    ],
  },
  {
    name: 'Korean Auto Show Season',
    months: [3, 4],
    days: [15, 10],
    niches: ['Korean Tech'],
    suggestions: [
      'Seoul Mobility Show Korean EV innovations analysis',
      'Hyundai Kia electric vehicle strategy comparison',
      'Korean autonomous driving technology progress report',
    ],
  },
  {
    name: 'Korean Earnings Season Q1',
    months: [4, 5],
    days: [15, 15],
    niches: ['Korean Finance', 'Korean Tech'],
    suggestions: [
      'Samsung Electronics Q1 earnings analysis investment outlook',
      'SK Hynix quarterly results HBM revenue breakdown',
      'KOSPI Q1 earnings season Korean stock picks analysis',
    ],
  },
  {
    name: 'Korean Earnings Season Q3',
    months: [10, 11],
    days: [15, 15],
    niches: ['Korean Finance', 'Korean Tech'],
    suggestions: [
      'Samsung SK Hynix Q3 earnings semiconductor outlook',
      'Korean stock market Q3 earnings analysis best performers',
      'HYBE JYP SM Entertainment Q3 revenue comparison',
    ],
  },
  {
    name: 'K-Beauty Awards Season',
    months: [1, 2],
    days: [1, 28],
    niches: ['K-Beauty'],
    suggestions: [
      'best Korean skincare products of the year awards winners',
      'Olive Young beauty awards top picks for foreigners',
      'Korean beauty trends forecast new ingredients to watch',
    ],
  },
];

export interface SeasonalContext {
  events: string[];
  suggestions: string[];
}

/**
 * Get seasonal context for the current date.
 * Returns relevant Korean events and content suggestions.
 */
export function getSeasonalContext(date: Date = new Date()): SeasonalContext {
  const month = date.getMonth() + 1; // 1-indexed
  const day = date.getDate();

  const activeEvents: string[] = [];
  const activeSuggestions: string[] = [];

  for (const event of KOREAN_EVENTS) {
    const [startMonth, endMonth] = event.months;
    let inRange = false;

    if (startMonth <= endMonth) {
      inRange = month >= startMonth && month <= endMonth;
    } else {
      // Wraps around year end (e.g., Dec-Jan)
      inRange = month >= startMonth || month <= endMonth;
    }

    if (!inRange) continue;

    // Check day range if specified (approximate — include 2 weeks before for planning)
    if (event.days) {
      const [startDay, endDay] = event.days;
      if (month === event.months[0] && day < startDay - 14) continue;
      if (month === event.months[1] && day > endDay + 7) continue;
    }

    activeEvents.push(event.name);
    activeSuggestions.push(...event.suggestions);
  }

  return { events: activeEvents, suggestions: activeSuggestions };
}

/**
 * Get seasonal suggestions filtered by niche.
 */
export function getSeasonalSuggestionsForNiche(nicheCategory: string, date: Date = new Date()): string[] {
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const suggestions: string[] = [];

  for (const event of KOREAN_EVENTS) {
    if (!event.niches.includes(nicheCategory)) continue;

    const [startMonth, endMonth] = event.months;
    let inRange = false;
    if (startMonth <= endMonth) {
      inRange = month >= startMonth && month <= endMonth;
    } else {
      inRange = month >= startMonth || month <= endMonth;
    }
    if (!inRange) continue;

    if (event.days) {
      const [startDay, endDay] = event.days;
      if (month === event.months[0] && day < startDay - 14) continue;
      if (month === event.months[1] && day > endDay + 7) continue;
    }

    suggestions.push(...event.suggestions);
  }

  return suggestions;
}
