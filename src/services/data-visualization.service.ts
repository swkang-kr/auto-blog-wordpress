import { logger } from '../utils/logger.js';
import type { FactCheckService } from './fact-check.service.js';

interface ChartPoint {
  label: string;
  value: number;
}

/**
 * Data Visualization Service — generates pure SVG charts for embedding in blog posts.
 * No external dependencies; all charts are server-rendered SVG strings.
 */
export class DataVisualizationService {
  private factCheckService: FactCheckService;

  constructor(factCheckService: FactCheckService) {
    this.factCheckService = factCheckService;
  }

  /**
   * Generate an SVG line chart from time-series data points.
   */
  generateLineChart(
    points: ChartPoint[],
    title: string,
    color: string = '#0066FF',
  ): string {
    if (points.length < 2) return '';

    const width = 700;
    const height = 350;
    const padding = { top: 50, right: 30, bottom: 60, left: 70 };
    const chartW = width - padding.left - padding.right;
    const chartH = height - padding.top - padding.bottom;

    const values = points.map(p => p.value);
    const minVal = Math.min(...values) * 0.95;
    const maxVal = Math.max(...values) * 1.05;
    const range = maxVal - minVal || 1;

    // Build path
    const pathPoints = points.map((p, i) => {
      const x = padding.left + (i / (points.length - 1)) * chartW;
      const y = padding.top + chartH - ((p.value - minVal) / range) * chartH;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    const linePath = `M${pathPoints.join('L')}`;

    // Area fill path (line + bottom closure)
    const firstX = padding.left;
    const lastX = padding.left + chartW;
    const bottomY = padding.top + chartH;
    const areaPath = `${linePath}L${lastX.toFixed(1)},${bottomY}L${firstX.toFixed(1)},${bottomY}Z`;

    // Y-axis labels (5 ticks)
    const yTicks: string[] = [];
    for (let i = 0; i <= 4; i++) {
      const val = minVal + (range * i) / 4;
      const y = padding.top + chartH - (i / 4) * chartH;
      yTicks.push(
        `<text x="${padding.left - 10}" y="${y.toFixed(1)}" text-anchor="end" fill="#888" font-size="11" font-family="system-ui,sans-serif">${this.formatNumber(val)}</text>` +
        `<line x1="${padding.left}" y1="${y.toFixed(1)}" x2="${padding.left + chartW}" y2="${y.toFixed(1)}" stroke="#eee" stroke-width="1"/>`,
      );
    }

    // X-axis labels (show ~6 evenly spaced labels)
    const xLabelStep = Math.max(1, Math.floor(points.length / 6));
    const xTicks: string[] = [];
    for (let i = 0; i < points.length; i += xLabelStep) {
      const x = padding.left + (i / (points.length - 1)) * chartW;
      xTicks.push(
        `<text x="${x.toFixed(1)}" y="${height - 15}" text-anchor="middle" fill="#888" font-size="10" font-family="system-ui,sans-serif">${this.escapeXml(points[i].label)}</text>`,
      );
    }

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-labelledby="chart-title chart-desc" style="max-width:100%;height:auto;">
<title id="chart-title">${this.escapeXml(title)}</title>
<desc id="chart-desc">Line chart showing ${this.escapeXml(title)} with ${points.length} data points from ${this.escapeXml(points[0].label)} to ${this.escapeXml(points[points.length - 1].label)}</desc>
<rect width="${width}" height="${height}" fill="#fff" rx="8"/>
<text x="${width / 2}" y="30" text-anchor="middle" fill="#333" font-size="16" font-weight="bold" font-family="system-ui,sans-serif">${this.escapeXml(title)}</text>
${yTicks.join('\n')}
${xTicks.join('\n')}
<path d="${areaPath}" fill="${color}" fill-opacity="0.08"/>
<path d="${linePath}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linejoin="round"/>
</svg>`;
  }

  /**
   * Generate an SVG bar chart.
   */
  generateBarChart(
    data: ChartPoint[],
    title: string,
  ): string {
    if (data.length === 0) return '';

    const width = 700;
    const height = 350;
    const padding = { top: 50, right: 30, bottom: 70, left: 70 };
    const chartW = width - padding.left - padding.right;
    const chartH = height - padding.top - padding.bottom;

    const maxVal = Math.max(...data.map(d => d.value)) * 1.1 || 1;
    const barWidth = Math.min(50, (chartW / data.length) * 0.7);
    const barGap = (chartW - barWidth * data.length) / (data.length + 1);

    const colors = ['#0066FF', '#00AA55', '#FF6B35', '#8B5CF6', '#EC4899', '#F59E0B'];

    const bars: string[] = [];
    const labels: string[] = [];
    for (let i = 0; i < data.length; i++) {
      const barH = (data[i].value / maxVal) * chartH;
      const x = padding.left + barGap + i * (barWidth + barGap);
      const y = padding.top + chartH - barH;
      const color = colors[i % colors.length];
      bars.push(
        `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barWidth.toFixed(1)}" height="${barH.toFixed(1)}" fill="${color}" rx="3"/>` +
        `<text x="${(x + barWidth / 2).toFixed(1)}" y="${(y - 6).toFixed(1)}" text-anchor="middle" fill="#555" font-size="11" font-family="system-ui,sans-serif">${this.formatNumber(data[i].value)}</text>`,
      );
      labels.push(
        `<text x="${(x + barWidth / 2).toFixed(1)}" y="${height - 20}" text-anchor="middle" fill="#888" font-size="10" font-family="system-ui,sans-serif" transform="rotate(-30,${(x + barWidth / 2).toFixed(1)},${height - 20})">${this.escapeXml(data[i].label)}</text>`,
      );
    }

    // Y-axis ticks
    const yTicks: string[] = [];
    for (let i = 0; i <= 4; i++) {
      const val = (maxVal * i) / 4;
      const y = padding.top + chartH - (i / 4) * chartH;
      yTicks.push(
        `<text x="${padding.left - 10}" y="${y.toFixed(1)}" text-anchor="end" fill="#888" font-size="11" font-family="system-ui,sans-serif">${this.formatNumber(val)}</text>` +
        `<line x1="${padding.left}" y1="${y.toFixed(1)}" x2="${padding.left + chartW}" y2="${y.toFixed(1)}" stroke="#eee" stroke-width="1"/>`,
      );
    }

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-labelledby="bar-title bar-desc" style="max-width:100%;height:auto;">
<title id="bar-title">${this.escapeXml(title)}</title>
<desc id="bar-desc">Bar chart showing ${this.escapeXml(title)} with ${data.length} categories</desc>
<rect width="${width}" height="${height}" fill="#fff" rx="8"/>
<text x="${width / 2}" y="30" text-anchor="middle" fill="#333" font-size="16" font-weight="bold" font-family="system-ui,sans-serif">${this.escapeXml(title)}</text>
${yTicks.join('\n')}
${bars.join('\n')}
${labels.join('\n')}
</svg>`;
  }

  /**
   * Generate KOSPI 1-year trend chart using fact-check service data.
   */
  async generateKospiChart(): Promise<string> {
    try {
      const data = await this.factCheckService.getKospiHistoricalData();
      if (!data || data.length < 4) {
        logger.debug('KOSPI historical data insufficient for chart');
        return '';
      }
      const points: ChartPoint[] = data.map(d => ({
        label: d.date.slice(5), // MM-DD
        value: d.close,
      }));
      return this.generateLineChart(points, 'KOSPI Index — 1 Year Trend', '#0052CC');
    } catch (error) {
      logger.debug(`KOSPI chart generation failed: ${error instanceof Error ? error.message : error}`);
      return '';
    }
  }

  /**
   * Generate USD/KRW exchange rate line chart.
   * Uses current rate as single point with a label (for embedding context).
   */
  async generateExchangeRateChart(): Promise<string> {
    try {
      const rate = await this.factCheckService.getUsdKrwRate();
      if (!rate) return '';

      // Single-point chart with context (show as a metric card instead)
      const today = new Date().toISOString().slice(0, 10);
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 120" width="400" height="120" role="img" aria-labelledby="fx-title fx-desc" style="max-width:100%;height:auto;">
<title id="fx-title">USD/KRW Exchange Rate</title>
<desc id="fx-desc">Current USD/KRW exchange rate as of ${today}</desc>
<rect width="400" height="120" fill="#f0f4ff" rx="12"/>
<text x="200" y="35" text-anchor="middle" fill="#666" font-size="13" font-family="system-ui,sans-serif">USD/KRW Exchange Rate</text>
<text x="200" y="75" text-anchor="middle" fill="#0052CC" font-size="36" font-weight="bold" font-family="system-ui,sans-serif">${this.formatNumber(rate)}</text>
<text x="200" y="105" text-anchor="middle" fill="#999" font-size="11" font-family="system-ui,sans-serif">As of ${today} — Source: Open Exchange Rates</text>
</svg>`;
    } catch (error) {
      logger.debug(`Exchange rate chart failed: ${error instanceof Error ? error.message : error}`);
      return '';
    }
  }

  /**
   * Generate an infographic SVG summarizing key data points from content.
   * Creates a visual summary suitable for Pinterest and in-article use.
   */
  generateInfoGraphic(
    title: string,
    dataPoints: Array<{ label: string; value: string; icon?: string }>,
    category: string,
  ): string {
    const gradients: Record<string, [string, string]> = {
      'Korean Tech': ['#1a1a2e', '#16213e'],
      'Korean Finance': ['#0c4a6e', '#0369a1'],
      'K-Beauty': ['#831843', '#be185d'],
      'Korea Travel': ['#14532d', '#15803d'],
      'K-Entertainment': ['#2d1b69', '#6b21a8'],
    };
    const [c1, c2] = gradients[category] || ['#0052CC', '#0066FF'];

    const itemHeight = 60;
    const headerHeight = 80;
    const footerHeight = 40;
    const totalHeight = headerHeight + dataPoints.length * itemHeight + footerHeight;

    const items = dataPoints.map((dp, i) => {
      const y = headerHeight + i * itemHeight;
      return `<rect x="20" y="${y}" width="360" height="${itemHeight - 8}" rx="8" fill="rgba(255,255,255,0.1)"/>
<text x="40" y="${y + 22}" fill="rgba(255,255,255,0.7)" font-family="system-ui,sans-serif" font-size="13">${this.escapeXml(dp.label)}</text>
<text x="40" y="${y + 44}" fill="#fff" font-family="system-ui,sans-serif" font-size="18" font-weight="bold">${this.escapeXml(dp.value)}</text>`;
    }).join('\n');

    return `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="${totalHeight}" viewBox="0 0 400 ${totalHeight}">
<defs><linearGradient id="infobg" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" style="stop-color:${c1}"/><stop offset="100%" style="stop-color:${c2}"/></linearGradient></defs>
<rect width="400" height="${totalHeight}" rx="12" fill="url(#infobg)"/>
<text x="200" y="35" text-anchor="middle" fill="#fff" font-family="system-ui,sans-serif" font-size="16" font-weight="bold">${this.escapeXml(title.slice(0, 40))}</text>
<line x1="80" y1="50" x2="320" y2="50" stroke="rgba(255,255,255,0.2)" stroke-width="1"/>
${items}
<text x="200" y="${totalHeight - 12}" text-anchor="middle" fill="rgba(255,255,255,0.4)" font-family="system-ui,sans-serif" font-size="10">TrendHunt ${new Date().getFullYear()}</text>
</svg>`;
  }

  private formatNumber(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 10_000) return `${(n / 1_000).toFixed(0)}K`;
    if (n >= 1_000) return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
    return n.toFixed(n % 1 === 0 ? 0 : 1);
  }

  private escapeXml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }
}
