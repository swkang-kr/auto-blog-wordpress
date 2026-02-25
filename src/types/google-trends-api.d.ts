declare module 'google-trends-api' {
  interface TrendOptions {
    keyword?: string | string[];
    startTime?: Date;
    endTime?: Date;
    geo?: string;
    hl?: string;
    category?: number;
    property?: string;
    resolution?: string;
  }

  const googleTrends: {
    interestOverTime(options: TrendOptions): Promise<string>;
    relatedTopics(options: TrendOptions): Promise<string>;
    relatedQueries(options: TrendOptions): Promise<string>;
    dailyTrends(options: { trendDate?: Date; geo?: string }): Promise<string>;
    realTimeTrends(options: { geo?: string; category?: string }): Promise<string>;
  };

  export default googleTrends;
}
