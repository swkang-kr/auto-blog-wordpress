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
    niches: ['Korean Food', 'Korea Travel', 'Korean Language'],
    suggestions: [
      'traditional Seollal foods and recipes',
      'Korean New Year customs for foreigners',
      'best places to visit during Seollal',
      'Korean New Year greetings and phrases',
    ],
  },
  {
    name: 'Cherry Blossom Season',
    months: [3, 4],
    days: [20, 15],
    niches: ['Korea Travel', 'Korean Food'],
    suggestions: [
      'best cherry blossom viewing spots in Korea',
      'spring travel tips for Korea',
      'Korean spring foods and street food festivals',
    ],
  },
  {
    name: "Children's Day & Spring Festival Season",
    months: [5, 5],
    days: [1, 10],
    niches: ['Korea Travel', 'K-Entertainment'],
    suggestions: [
      "Children's Day activities and family travel in Korea",
      'spring K-pop festivals and events',
    ],
  },
  {
    name: 'BIFF (Busan International Film Festival)',
    months: [10, 10],
    days: [1, 15],
    niches: ['K-Entertainment', 'Korea Travel'],
    suggestions: [
      'BIFF guide for international visitors',
      'Korean cinema industry trends',
      'Busan travel guide during film festival season',
    ],
  },
  {
    name: 'Chuseok (Korean Thanksgiving)',
    months: [9, 10],
    days: [1, 10],
    niches: ['Korean Food', 'Korea Travel', 'Korean Language', 'Korean Finance'],
    suggestions: [
      'traditional Chuseok foods and songpyeon recipe',
      'Korean stock market around Chuseok holidays',
      'Chuseok travel tips and things to do',
      'Korean Chuseok greetings and customs',
    ],
  },
  {
    name: 'MAMA Awards Season',
    months: [11, 12],
    days: [15, 10],
    niches: ['K-Entertainment'],
    suggestions: [
      'MAMA Awards predictions and analysis',
      'K-pop year-end awards guide',
      'K-pop industry revenue and performance review',
    ],
  },
  {
    name: 'Christmas Markets & Winter Tourism',
    months: [12, 12],
    days: [1, 31],
    niches: ['Korea Travel', 'Korean Food'],
    suggestions: [
      'best Christmas markets in Seoul',
      'winter travel destinations in Korea',
      'Korean winter street food guide',
    ],
  },
  {
    name: 'Korean New Year Countdown',
    months: [12, 1],
    days: [25, 5],
    niches: ['Korea Travel', 'Korean Finance'],
    suggestions: [
      'best New Year celebrations in Seoul',
      'Korean stock market year-end outlook',
      'Korean economy year in review',
    ],
  },
  {
    name: 'Korean Summer (Monsoon & Beach Season)',
    months: [7, 8],
    days: [1, 31],
    niches: ['Korea Travel', 'Korean Food'],
    suggestions: [
      'best Korean beaches and summer destinations',
      'Korean summer foods and cold noodle guide',
      'monsoon travel tips for Korea',
    ],
  },
  {
    name: 'Korean University Entrance (Suneung)',
    months: [11, 11],
    days: [10, 20],
    niches: ['Korean Language', 'K-Entertainment'],
    suggestions: [
      'Korean education system and Suneung explained',
      'how Korean pop culture depicts exam pressure',
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
