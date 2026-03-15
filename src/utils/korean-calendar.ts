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
    niches: ['K-Entertainment', 'K-Beauty'],
    suggestions: [
      'K-drama and K-pop Seollal special content guide 2026',
      'best Korean New Year gift sets K-beauty picks for fans',
      'K-pop idol Seollal messages fan community highlights',
      'best Korean skincare gift sets for Lunar New Year 2026',
    ],
  },
  {
    name: 'K-Beauty Awards Season',
    months: [1, 2],
    days: [1, 28],
    niches: ['K-Beauty'],
    suggestions: [
      'best Korean skincare products of the year awards winners',
      'Olive Young beauty awards top picks for foreigners 2026',
      'Korean beauty trends forecast new ingredients to watch 2026',
      'best new K-beauty brands to watch this year ranked',
    ],
  },
  {
    name: 'Valentine & White Day K-Beauty Season',
    months: [2, 3],
    days: [1, 20],
    niches: ['K-Beauty', 'K-Entertainment'],
    suggestions: [
      'best Korean lip tints for Valentine Day rom&nd peripera ranked',
      'K-pop idol couple moments fans love Valentine Day compilation',
      'best Korean skincare gift sets for Valentine Day under 30 dollars',
      'Korean White Day gift guide K-beauty products to buy',
    ],
  },
  {
    name: 'Cherry Blossom Season',
    months: [3, 4],
    days: [20, 15],
    niches: ['K-Beauty', 'K-Entertainment'],
    suggestions: [
      'Korean spring skincare routine transition guide 2026',
      'best Korean sunscreen for outdoor spring activities 2026',
      'K-pop spring comeback season what to expect guide 2026',
      'best Korean brightening products for spring glow 2026',
    ],
  },
  {
    name: 'K-pop Spring Comeback Season',
    months: [4, 5],
    days: [1, 31],
    niches: ['K-Entertainment', 'K-Beauty'],
    suggestions: [
      'K-pop spring comebacks 2026 ranked by fan anticipation',
      'best K-pop albums releasing this spring complete guide',
      'K-pop idol beauty looks from spring comeback MVs recreate',
      'spring K-pop concert schedule USA Europe 2026 guide',
    ],
  },
  {
    name: "Children's Day & Spring K-pop Festival",
    months: [5, 5],
    days: [1, 15],
    niches: ['K-Entertainment'],
    suggestions: [
      'spring K-pop festivals and outdoor concert events Korea 2026',
      'K-pop idol fan meet events May 2026 schedule guide',
      'best K-drama to watch during Korean spring holiday season',
    ],
  },
  {
    name: 'Seoul Fashion Week & K-Beauty Crossover',
    months: [3, 4],
    days: [15, 30],
    niches: ['K-Beauty', 'K-Entertainment'],
    suggestions: [
      'Seoul Fashion Week K-pop idol front row looks beauty breakdown',
      'Korean fashion week makeup trends to recreate 2026 guide',
      'K-pop idol fashion week outfits ranked best dressed 2026',
    ],
  },
  {
    name: 'Korean Summer Sales & Mid-Year K-Beauty Shopping',
    months: [6, 7],
    days: [15, 10],
    niches: ['K-Beauty', 'K-Entertainment'],
    suggestions: [
      'Korean mid-year sale best K-beauty deals Olive Young June July',
      'best Korean skincare sets to buy on sale summer 2026',
      'K-pop summer comeback season albums releases to watch 2026',
      'best Korean sunscreen deals to stock up on summer sale',
    ],
  },
  {
    name: 'K-pop Summer Comeback Season',
    months: [7, 8],
    days: [1, 31],
    niches: ['K-Entertainment', 'K-Beauty'],
    suggestions: [
      'K-pop summer comebacks 2026 ranked most anticipated',
      'best K-pop music videos of summer 2026 ranked YouTube views',
      'K-pop idol summer beauty looks skincare routine guide',
      'summer K-pop concert tour dates USA Europe 2026 complete list',
    ],
  },
  {
    name: 'Korean Summer Skincare Season',
    months: [7, 8],
    days: [1, 31],
    niches: ['K-Beauty'],
    suggestions: [
      'Korean summer skincare routine waterproof sunscreen essentials 2026',
      'best Korean cooling beauty products for hot humid weather',
      'best Korean lightweight moisturizer for summer oily skin 2026',
      'Korean sunscreen reapplication guide summer outdoor tips',
    ],
  },
  {
    name: 'Chuseok (Korean Thanksgiving)',
    months: [9, 10],
    days: [1, 10],
    niches: ['K-Entertainment', 'K-Beauty'],
    suggestions: [
      'Chuseok K-drama specials and entertainment lineup 2026',
      'best K-pop idol Chuseok greetings fan community highlights',
      'best Korean beauty gift sets for Chuseok holiday season',
      'Korean skincare routine for fall season transition guide',
    ],
  },
  {
    name: 'BIFF (Busan International Film Festival)',
    months: [10, 10],
    days: [1, 15],
    niches: ['K-Entertainment'],
    suggestions: [
      'BIFF Busan Film Festival 2026 Korean films to watch guide',
      'Korean cinema must-watch films BIFF 2026 complete lineup',
      'K-drama actors at BIFF 2026 best performances to look for',
    ],
  },
  {
    name: 'K-pop Awards Pre-Campaign Season',
    months: [10, 11],
    days: [1, 15],
    niches: ['K-Entertainment'],
    suggestions: [
      'K-pop year-end awards 2026 predictions who will win daesang',
      'MAMA MMA GDA nominations 2026 complete list analysis',
      'how to vote for K-pop year-end awards guide for fans 2026',
      'K-pop circle chart year rankings 2026 top artists so far',
    ],
  },
  {
    name: 'Korean University Entrance (Suneung)',
    months: [11, 11],
    days: [10, 20],
    niches: ['K-Entertainment'],
    suggestions: [
      'K-pop idol Suneung messages fan community support tradition',
      'best K-drama to watch after Korean college entrance exams',
      'K-pop study playlist for exam season concentration guide',
    ],
  },
  {
    name: 'MAMA Awards Season',
    months: [11, 12],
    days: [15, 10],
    niches: ['K-Entertainment'],
    suggestions: [
      'MAMA Awards 2026 predictions who will win daesang complete guide',
      'K-pop year-end awards complete guide MAMA MMA GDA 2026',
      'best MAMA Awards performances of all time ranked fan guide',
      'how to watch MAMA Awards 2026 livestream guide international fans',
    ],
  },
  {
    name: 'Black Friday & Singles Day K-Beauty Sale',
    months: [11, 11],
    days: [1, 30],
    niches: ['K-Beauty', 'K-Entertainment'],
    suggestions: [
      'best Korean skincare deals Black Friday Olive Young sales 2026',
      'Black Friday K-beauty shopping guide best products to buy',
      'Korean skincare sets worth buying on sale Black Friday ranked',
      'K-pop merchandise Black Friday deals albums lightsticks guide',
    ],
  },
  {
    name: 'Korean Winter Skincare & Holiday K-Beauty',
    months: [12, 12],
    days: [1, 31],
    niches: ['K-Beauty'],
    suggestions: [
      'Korean winter skincare routine dry cold weather ceramide guide',
      'best Korean gift sets and holiday beauty collections 2026',
      'Korean skincare for cold weather skin barrier repair guide',
      'best Korean hydrating toners for winter dry skin ranked 2026',
    ],
  },
  {
    name: 'K-pop Year-End & New Year Fan Content',
    months: [12, 1],
    days: [20, 10],
    niches: ['K-Entertainment', 'K-Beauty'],
    suggestions: [
      'K-pop year in review 2026 biggest comebacks moments ranked',
      'best K-pop songs of 2026 year-end ranked fan favorites',
      'K-pop idol New Year messages fan community highlights 2026',
      'best Korean beauty products of 2026 year-end rankings',
    ],
  },
];

export interface SeasonalContext {
  events: string[];
  suggestions: string[];
  /** Upcoming events 2-3 months ahead — publish content early for SEO ranking */
  upcomingEvents: string[];
  upcomingSuggestions: string[];
}

/**
 * Get seasonal context for the current date.
 * Returns relevant Korean events and content suggestions.
 * Also detects upcoming events 2-3 months ahead for pre-seasonal SEO content.
 */
export function getSeasonalContext(date: Date = new Date()): SeasonalContext {
  const month = date.getMonth() + 1; // 1-indexed
  const day = date.getDate();

  const activeEvents: string[] = [];
  const activeSuggestions: string[] = [];
  const upcomingEvents: string[] = [];
  const upcomingSuggestions: string[] = [];

  // Future date 2-3 months ahead for pre-seasonal detection
  const futureDate2m = new Date(date);
  futureDate2m.setMonth(futureDate2m.getMonth() + 2);
  const futureMonth2 = futureDate2m.getMonth() + 1;

  const futureDate3m = new Date(date);
  futureDate3m.setMonth(futureDate3m.getMonth() + 3);
  const futureMonth3 = futureDate3m.getMonth() + 1;

  for (const event of KOREAN_EVENTS) {
    const [startMonth, endMonth] = event.months;

    // Check current active events
    let inRange = false;
    if (startMonth <= endMonth) {
      inRange = month >= startMonth && month <= endMonth;
    } else {
      inRange = month >= startMonth || month <= endMonth;
    }

    if (inRange) {
      if (event.days) {
        const [startDay, endDay] = event.days;
        if (month === event.months[0] && day < startDay - 14) { /* skip */ }
        else if (month === event.months[1] && day > endDay + 7) { /* skip */ }
        else {
          activeEvents.push(event.name);
          activeSuggestions.push(...event.suggestions);
        }
      } else {
        activeEvents.push(event.name);
        activeSuggestions.push(...event.suggestions);
      }
      continue; // Already active, no need to check upcoming
    }

    // Check if event is 2-3 months ahead (pre-seasonal SEO window)
    let isUpcoming = false;
    if (startMonth <= endMonth) {
      isUpcoming = futureMonth2 >= startMonth && futureMonth2 <= endMonth ||
                   futureMonth3 >= startMonth && futureMonth3 <= endMonth;
    } else {
      isUpcoming = futureMonth2 >= startMonth || futureMonth2 <= endMonth ||
                   futureMonth3 >= startMonth || futureMonth3 <= endMonth;
    }

    if (isUpcoming && !activeEvents.includes(event.name)) {
      upcomingEvents.push(`[Upcoming] ${event.name}`);
      upcomingSuggestions.push(...event.suggestions.map(s => `[Pre-seasonal] ${s}`));
    }
  }

  return { events: activeEvents, suggestions: activeSuggestions, upcomingEvents, upcomingSuggestions };
}

/**
 * Get seasonal suggestions filtered by niche.
 * Includes both active and upcoming (2-3 months ahead) suggestions.
 */
export function getSeasonalSuggestionsForNiche(nicheCategory: string, date: Date = new Date()): string[] {
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const suggestions: string[] = [];

  // Future months for pre-seasonal detection
  const futureDate2m = new Date(date);
  futureDate2m.setMonth(futureDate2m.getMonth() + 2);
  const futureMonth2 = futureDate2m.getMonth() + 1;
  const futureDate3m = new Date(date);
  futureDate3m.setMonth(futureDate3m.getMonth() + 3);
  const futureMonth3 = futureDate3m.getMonth() + 1;

  for (const event of KOREAN_EVENTS) {
    if (!event.niches.includes(nicheCategory)) continue;

    const [startMonth, endMonth] = event.months;

    // Check active range
    let inRange = false;
    if (startMonth <= endMonth) {
      inRange = month >= startMonth && month <= endMonth;
    } else {
      inRange = month >= startMonth || month <= endMonth;
    }

    if (inRange) {
      if (event.days) {
        const [startDay, endDay] = event.days;
        if (month === event.months[0] && day < startDay - 14) continue;
        if (month === event.months[1] && day > endDay + 7) continue;
      }
      suggestions.push(...event.suggestions);
      continue;
    }

    // Check upcoming (2-3 months ahead) for pre-seasonal SEO
    let isUpcoming = false;
    if (startMonth <= endMonth) {
      isUpcoming = (futureMonth2 >= startMonth && futureMonth2 <= endMonth) ||
                   (futureMonth3 >= startMonth && futureMonth3 <= endMonth);
    } else {
      isUpcoming = futureMonth2 >= startMonth || futureMonth2 <= endMonth ||
                   futureMonth3 >= startMonth || futureMonth3 <= endMonth;
    }

    if (isUpcoming) {
      suggestions.push(...event.suggestions.map(s => `[Publish early for SEO] ${s}`));
    }
  }

  return suggestions;
}
