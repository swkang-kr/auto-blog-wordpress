declare module 'google-trends-api' {
  interface TrendOptions {
    trendDate?: Date;
    geo?: string;
    hl?: string;
    category?: number;
    ns?: number;
  }

  const googleTrends: {
    dailyTrends(options: TrendOptions): Promise<string>;
    realTimeTrends(options: TrendOptions): Promise<string>;
    interestOverTime(options: TrendOptions & { keyword: string }): Promise<string>;
  };

  export default googleTrends;
}
