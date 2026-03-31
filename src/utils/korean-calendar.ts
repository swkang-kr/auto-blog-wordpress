/**
 * Korean financial events calendar for keyword research.
 * Maps Korean market events to date ranges and relevant niches.
 */

interface SeasonalEvent {
  name: string;
  months: [number, number];
  days?: [number, number];
  niches: string[];
  suggestions: string[];
}

const KOREAN_EVENTS: SeasonalEvent[] = [
  // Earnings seasons
  { name: 'Q4 Earnings Season Korea', months: [1, 2], days: [15, 15], niches: ['시장분석', '종목분석'], suggestions: ['Korean stock Q4 earnings preview analysis', 'Samsung SK Hynix earnings investment impact', 'Korean corporate earnings strategy guide'] },
  { name: 'Q1 Earnings Season Korea', months: [4, 5], days: [15, 15], niches: ['시장분석', '종목분석'], suggestions: ['Korean stock Q1 earnings preview', 'semiconductor earnings outlook Samsung SK Hynix'] },
  { name: 'Q2 Earnings Season Korea', months: [7, 8], days: [15, 15], niches: ['시장분석', '종목분석'], suggestions: ['Korean stock Q2 earnings analysis', 'mid-year market review investment outlook'] },
  { name: 'Q3 Earnings Season Korea', months: [10, 11], days: [15, 15], niches: ['시장분석', '종목분석'], suggestions: ['Korean stock Q3 earnings preview semiconductor', 'Korean tech earnings AI chip outlook'] },

  // BOK rate decisions
  { name: 'BOK Rate Decision', months: [1, 1], days: [10, 20], niches: ['시장분석', '업종분석'], suggestions: ['Bank of Korea interest rate decision analysis', 'BOK rate impact stock market forecast'] },
  { name: 'BOK Rate Decision (Apr)', months: [4, 4], days: [1, 15], niches: ['시장분석', '업종분석'], suggestions: ['Bank of Korea April rate decision analysis'] },
  { name: 'BOK Rate Decision (Jul)', months: [7, 7], days: [1, 15], niches: ['시장분석', '업종분석'], suggestions: ['Bank of Korea July rate decision analysis'] },
  { name: 'BOK Rate Decision (Oct)', months: [10, 10], days: [1, 15], niches: ['시장분석', '업종분석'], suggestions: ['Bank of Korea October rate decision analysis'] },

  // FOMC (US Fed — impacts Korean market)
  { name: 'FOMC Meeting', months: [3, 3], days: [15, 25], niches: ['시장분석', '종목분석'], suggestions: ['FOMC March decision Korean stock market impact', 'US rate decision Korean won stock impact'] },
  { name: 'FOMC Meeting (Jun)', months: [6, 6], days: [10, 20], niches: ['시장분석', '종목분석'], suggestions: ['FOMC June meeting Korean market impact forecast'] },
  { name: 'FOMC Meeting (Sep)', months: [9, 9], days: [15, 25], niches: ['시장분석', '종목분석'], suggestions: ['FOMC September Korean stock market analysis'] },
  { name: 'FOMC Meeting (Dec)', months: [12, 12], days: [10, 20], niches: ['시장분석', '종목분석'], suggestions: ['FOMC December year-end Korean market impact'] },

  // Dividend season
  { name: 'Korean Dividend Season', months: [12, 12], days: [1, 31], niches: ['종목분석', '시장분석'], suggestions: ['Korean stock best dividend stocks year-end picks', 'ex-dividend date calendar Korean stocks', 'Korean high dividend yield stocks guide'] },

  // MSCI/FTSE rebalancing
  { name: 'MSCI Rebalancing', months: [5, 6], days: [20, 5], niches: ['시장분석'], suggestions: ['MSCI rebalancing Korean stock additions deletions impact', 'MSCI Korea index weight changes analysis'] },
  { name: 'MSCI Rebalancing (Nov)', months: [11, 11], days: [10, 30], niches: ['시장분석'], suggestions: ['MSCI November rebalancing Korean stock impact'] },

  // Tech events
  { name: 'CES', months: [1, 1], days: [5, 12], niches: ['테마분석', '업종분석'], suggestions: ['CES Korean tech companies Samsung LG stock impact', 'CES AI chip Korean semiconductor analysis'] },
  { name: 'MWC', months: [2, 2], days: [24, 28], niches: ['테마분석', '업종분석'], suggestions: ['MWC Korean tech stocks Samsung SK Telecom impact'] },
  { name: 'InterBattery Korea', months: [3, 3], days: [10, 12], niches: ['테마분석', '업종분석'], suggestions: ['InterBattery battery stocks LG Samsung SDI analysis'] },

  // Year-end tax selling
  { name: 'Year-End Tax Loss Selling', months: [11, 12], days: [15, 28], niches: ['시장분석', '종목분석'], suggestions: ['Korean stock tax loss selling strategy year-end', 'Korean stock capital gains tax guide', 'year-end portfolio rebalancing strategy'] },

  // IPO seasons
  { name: 'Korean IPO Season (Spring)', months: [3, 5], days: [1, 31], niches: ['종목분석', '시장분석'], suggestions: ['upcoming Korean IPO stocks what to watch', 'Korean IPO investing guide how to apply'] },
  { name: 'Korean IPO Season (Fall)', months: [9, 11], days: [1, 30], niches: ['종목분석', '시장분석'], suggestions: ['fall Korean IPO pipeline analysis', 'how to invest in Korean IPOs guide'] },

  // Options expiry (quarterly)
  { name: 'Options Expiry', months: [3, 3], days: [8, 15], niches: ['종목분석', '시장분석'], suggestions: ['Korean stock options expiry volatility impact', 'quad witching day Korean market strategy'] },
  { name: 'Options Expiry (Jun)', months: [6, 6], days: [8, 15], niches: ['종목분석', '시장분석'], suggestions: ['Korean stock options expiry June impact'] },
  { name: 'Options Expiry (Sep)', months: [9, 9], days: [8, 15], niches: ['종목분석', '시장분석'], suggestions: ['Korean stock options expiry September impact'] },
  { name: 'Options Expiry (Dec)', months: [12, 12], days: [8, 15], niches: ['종목분석', '시장분석'], suggestions: ['year-end options expiry Korean stock impact'] },
];

export interface SeasonalContext {
  events: string[];
  suggestions: string[];
  upcomingEvents: string[];
  upcomingSuggestions: string[];
}

export function getSeasonalContext(date: Date = new Date()): SeasonalContext {
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const activeEvents: string[] = [];
  const activeSuggestions: string[] = [];
  const upcomingEvents: string[] = [];
  const upcomingSuggestions: string[] = [];

  const futureDate2m = new Date(date);
  futureDate2m.setMonth(futureDate2m.getMonth() + 2);
  const futureMonth2 = futureDate2m.getMonth() + 1;
  const futureDate3m = new Date(date);
  futureDate3m.setMonth(futureDate3m.getMonth() + 3);
  const futureMonth3 = futureDate3m.getMonth() + 1;

  for (const event of KOREAN_EVENTS) {
    const [startMonth, endMonth] = event.months;
    let inRange = startMonth <= endMonth
      ? month >= startMonth && month <= endMonth
      : month >= startMonth || month <= endMonth;

    if (inRange) {
      if (event.days) {
        const [startDay, endDay] = event.days;
        if (month === event.months[0] && day < startDay - 14) continue;
        if (month === event.months[1] && day > endDay + 7) continue;
      }
      activeEvents.push(event.name);
      activeSuggestions.push(...event.suggestions);
      continue;
    }

    let isUpcoming = startMonth <= endMonth
      ? (futureMonth2 >= startMonth && futureMonth2 <= endMonth) || (futureMonth3 >= startMonth && futureMonth3 <= endMonth)
      : futureMonth2 >= startMonth || futureMonth2 <= endMonth || futureMonth3 >= startMonth || futureMonth3 <= endMonth;

    if (isUpcoming) {
      upcomingEvents.push(`[Upcoming] ${event.name}`);
      upcomingSuggestions.push(...event.suggestions.map(s => `[Pre-seasonal] ${s}`));
    }
  }

  return { events: activeEvents, suggestions: activeSuggestions, upcomingEvents, upcomingSuggestions };
}

export function getSeasonalSuggestionsForNiche(nicheCategory: string, date: Date = new Date()): string[] {
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const suggestions: string[] = [];

  const futureDate2m = new Date(date);
  futureDate2m.setMonth(futureDate2m.getMonth() + 2);
  const futureMonth2 = futureDate2m.getMonth() + 1;
  const futureDate3m = new Date(date);
  futureDate3m.setMonth(futureDate3m.getMonth() + 3);
  const futureMonth3 = futureDate3m.getMonth() + 1;

  for (const event of KOREAN_EVENTS) {
    if (!event.niches.includes(nicheCategory)) continue;
    const [startMonth, endMonth] = event.months;
    let inRange = startMonth <= endMonth
      ? month >= startMonth && month <= endMonth
      : month >= startMonth || month <= endMonth;

    if (inRange) {
      if (event.days) {
        const [startDay, endDay] = event.days;
        if (month === event.months[0] && day < startDay - 14) continue;
        if (month === event.months[1] && day > endDay + 7) continue;
      }
      suggestions.push(...event.suggestions);
      continue;
    }

    let isUpcoming = startMonth <= endMonth
      ? (futureMonth2 >= startMonth && futureMonth2 <= endMonth) || (futureMonth3 >= startMonth && futureMonth3 <= endMonth)
      : futureMonth2 >= startMonth || futureMonth2 <= endMonth || futureMonth3 >= startMonth || futureMonth3 <= endMonth;

    if (isUpcoming) {
      suggestions.push(...event.suggestions.map(s => `[Publish early for SEO] ${s}`));
    }
  }

  return suggestions;
}
