import axios, { type AxiosInstance } from 'axios';
import Anthropic from '@anthropic-ai/sdk';
import { logger } from '../utils/logger.js';
import { costTracker } from '../utils/cost-tracker.js';
import { validateContent, logContentScore } from '../utils/content-validator.js';
import type { PostHistoryEntry } from '../types/index.js';
import type { GA4AnalyticsService } from './ga4-analytics.service.js';
import type { GSCAnalyticsService } from './gsc-analytics.service.js';
import type { SeoService } from './seo.service.js';

interface WPPost {
  id: number;
  title: { rendered: string };
  slug: string;
  content: { rendered: string };
  link: string;
  date: string;
}

export class ContentRefreshService {
  private api: AxiosInstance;
  private claude: Anthropic;
  private model: string;
  private wpUrl: string;

  constructor(
    wpUrl: string,
    username: string,
    appPassword: string,
    anthropicApiKey: string,
    claudeModel: string = 'claude-sonnet-4-6',
  ) {
    this.wpUrl = wpUrl.replace(/\/+$/, '');
    this.model = claudeModel;
    const token = Buffer.from(`${username}:${appPassword}`).toString('base64');
    this.api = axios.create({
      baseURL: `${this.wpUrl}/wp-json/wp/v2`,
      headers: { Authorization: `Basic ${token}` },
      timeout: 30000,
    });
    this.claude = new Anthropic({ apiKey: anthropicApiKey });
  }

  /**
   * Find and rewrite declining posts using GA4 data + freshness scores.
   * Combines performance metrics with content decay for smarter refresh prioritization.
   * Returns the number of posts successfully rewritten.
   */
  async refreshDecliningPosts(
    ga4Service: GA4AnalyticsService,
    seoService?: SeoService,
    limit: number = 3,
    minAgeDays: number = 30,
    freshnessData?: Array<PostHistoryEntry & { freshnessScore: number }>,
    gscService?: GSCAnalyticsService,
  ): Promise<number> {
    const allPosts = await ga4Service.getTopPerformingPosts(100);
    if (allPosts.length === 0) {
      logger.info('Auto-rewrite: No GA4 data available, skipping');
      return 0;
    }

    // Identify underperformers: bottom 20% by pageviews OR bounce rate > 70%
    const threshold = Math.max(1, Math.floor(allPosts.length * 0.2));
    let underperformers = allPosts
      .filter(p => p.pageviews > 0)
      .sort((a, b) => a.pageviews - b.pageviews)
      .slice(0, threshold)
      .concat(
        allPosts.filter(p => p.bounceRate > 0.7 && p.pageviews >= 5),
      )
      .filter((p, i, arr) => arr.findIndex(x => x.url === p.url) === i);

    // Boost priority for posts with low freshness scores (content decay)
    if (freshnessData && freshnessData.length > 0) {
      const freshnessMap = new Map(freshnessData.map(f => [f.postUrl, f.freshnessScore]));
      underperformers = underperformers
        .map(p => {
          const slug = '/' + p.url.replace(/^\/|\/$/g, '') + '/';
          const freshness = freshnessMap.get(slug) ?? freshnessMap.get(p.url) ?? 50;
          // Combined score: lower = higher priority for refresh
          const refreshPriority = (freshness * 0.4) + ((1 - p.bounceRate) * 100 * 0.3) + (Math.min(p.pageviews, 100) * 0.3);
          return { ...p, refreshPriority };
        })
        .sort((a, b) => a.refreshPriority - b.refreshPriority);

      // Also add stale posts (freshness < 30) even if GA4 data looks OK
      const stalePosts = freshnessData
        .filter(f => f.freshnessScore < 30 && f.postUrl)
        .filter(f => !underperformers.some(u => f.postUrl.includes(u.url.replace(/^\//, ''))))
        .slice(0, 2);

      for (const stale of stalePosts) {
        const slug = new URL(stale.postUrl).pathname.replace(/^\/|\/$/g, '');
        underperformers.push({
          url: slug,
          pageviews: 0,
          bounceRate: 0,
          avgEngagementTime: 0,
          refreshPriority: stale.freshnessScore,
        } as typeof underperformers[0]);
      }

      logger.info(`Auto-rewrite: Freshness-enhanced prioritization active (${freshnessData.length} entries scored)`);
    }

    // Boost with GSC declining pages (position dropping while impressions stable)
    if (gscService) {
      try {
        const declining = await gscService.getDecliningPages();
        for (const page of declining.slice(0, 3)) {
          const slug = new URL(page.page).pathname.replace(/^\/|\/$/g, '');
          const alreadyIncluded = underperformers.some(u => u.url.replace(/^\/|\/$/g, '') === slug);
          if (!alreadyIncluded && slug) {
            underperformers.push({
              url: slug,
              pageviews: page.clicks,
              bounceRate: 0,
              avgEngagementTime: 0,
              refreshPriority: 10, // High priority for GSC-declining
            } as typeof underperformers[0]);
            logger.info(`Auto-rewrite: GSC declining page added: ${slug} (pos ${page.position.toFixed(1)})`);
          }
        }
      } catch (error) {
        logger.debug(`GSC declining pages for refresh failed: ${error instanceof Error ? error.message : error}`);
      }
    }

    underperformers = underperformers.slice(0, limit);

    if (underperformers.length === 0) {
      logger.info('Auto-rewrite: No underperforming posts found');
      return 0;
    }

    logger.info(`Auto-rewrite: Found ${underperformers.length} underperforming post(s)`);

    let rewrittenCount = 0;
    const rewrittenUrls: string[] = [];

    for (const perf of underperformers) {
      const slug = perf.url.replace(/^\/|\/$/g, '');
      if (!slug) continue;

      try {
        const { data: posts } = await this.api.get('/posts', {
          params: { slug, status: 'publish', _fields: 'id,title,slug,content,link,date' },
        });
        const post = (posts as WPPost[])[0];
        if (!post) {
          logger.debug(`Auto-rewrite: Post not found for "${slug}"`);
          continue;
        }

        // Check age using the post's published date (not link URL)
        const postDate = new Date(post.date);
        const postAge = isNaN(postDate.getTime()) ? Infinity : (Date.now() - postDate.getTime()) / (1000 * 60 * 60 * 24);
        if (postAge < minAgeDays && minAgeDays > 0) {
          logger.debug(`Auto-rewrite: "${post.title.rendered}" too young (${postAge.toFixed(0)} days)`);
          continue;
        }

        logger.info(`Auto-rewrite: Rewriting "${post.title.rendered}" (${perf.pageviews} views, ${(perf.bounceRate * 100).toFixed(0)}% bounce)`);

        const rewritten = await this.rewriteContent(post, perf);
        if (!rewritten) continue;

        const nowIso = new Date().toISOString();
        await this.api.post(`/posts/${post.id}`, {
          title: rewritten.title,
          content: rewritten.html,
          excerpt: rewritten.excerpt,
          meta: {
            _last_updated: nowIso,
            _autoblog_modified_time: nowIso,
            _rewrite_reason: `Auto-rewrite: ${perf.pageviews} views, ${(perf.bounceRate * 100).toFixed(0)}% bounce`,
            rank_math_description: rewritten.excerpt,
          },
        });

        rewrittenCount++;
        rewrittenUrls.push(post.link);
        logger.info(`Auto-rewrite: Successfully rewrote "${rewritten.title}"`);

        // Rate limit
        await new Promise(r => setTimeout(r, 2000));
      } catch (error) {
        logger.warn(`Auto-rewrite failed for "${slug}": ${error instanceof Error ? error.message : error}`);
      }
    }

    // Re-index rewritten posts
    if (seoService && rewrittenUrls.length > 0) {
      try {
        await seoService.notifyIndexNow(rewrittenUrls);
        for (const url of rewrittenUrls) {
          await seoService.requestIndexing(url);
        }
        logger.info(`Auto-rewrite: Submitted ${rewrittenUrls.length} URL(s) for re-indexing`);
      } catch (error) {
        logger.warn(`Auto-rewrite: Re-indexing failed: ${error instanceof Error ? error.message : error}`);
      }
    }

    return rewrittenCount;
  }

  private async rewriteContent(
    post: WPPost,
    perf: { pageviews: number; bounceRate: number; avgEngagementTime: number },
  ): Promise<{ title: string; html: string; excerpt: string } | null> {
    const existingContent = post.content.rendered.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const wordCount = existingContent.split(/\s+/).length;

    // Send up to 8000 chars (~1200 words) for better context awareness
    const contentPreview = existingContent.slice(0, 8000);
    const isTruncated = existingContent.length > 8000;

    const prompt = `You are rewriting an underperforming blog post to improve reader engagement and reduce bounce rate. The post exists at ${post.link} and must keep its URL/slug unchanged.

CURRENT TITLE: ${post.title.rendered}
CURRENT WORD COUNT: ${wordCount}
CURRENT CONTENT (plain text): ${contentPreview}${isTruncated ? '...' : ''}

PERFORMANCE DATA: ${perf.pageviews} views, ${(perf.bounceRate * 100).toFixed(0)}% bounce rate, ${perf.avgEngagementTime.toFixed(0)}s avg engagement

REWRITE RULES:
1. Keep the same topic and primary keyword
2. Add a much stronger opening hook (first paragraph must grab attention)
3. Break up long paragraphs (max 3-4 sentences each)
4. Add more subheadings (H2/H3) every 200-300 words
5. Include more specific data points and Korean market context
6. Add a compelling FAQ section (3-5 questions) if missing
7. Target 2,500+ words
8. Use the same inline CSS styling as the original
9. Include "Last Updated: ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}" banner at top

Return JSON: {"title":"improved title","html":"full HTML content","excerpt":"compelling 145-158 char meta description"}
Return pure JSON only. No markdown.`;

    try {
      const response = await this.claude.messages.create({
        model: this.model,
        max_tokens: 32000,
        temperature: 0.7,
        messages: [{ role: 'user', content: prompt }],
      });

      costTracker.addClaudeCall(this.model, response.usage?.input_tokens || 0, response.usage?.output_tokens || 0);

      const text = response.content[0].type === 'text' ? response.content[0].text : '';
      const cleaned = text.replace(/```(?:json)?\s*/g, '').replace(/```\s*$/g, '').trim();

      const startIdx = cleaned.indexOf('{');
      if (startIdx === -1) return null;

      let depth = 0;
      let endIdx = -1;
      for (let i = startIdx; i < cleaned.length; i++) {
        const ch = cleaned[i];
        if (ch === '\\') { i++; continue; }
        if (ch === '"') { i++; while (i < cleaned.length && cleaned[i] !== '"') { if (cleaned[i] === '\\') i++; i++; } continue; }
        if (ch === '{') depth++;
        if (ch === '}') { depth--; if (depth === 0) { endIdx = i; break; } }
      }

      if (endIdx === -1) return null;
      const result = JSON.parse(cleaned.slice(startIdx, endIdx + 1)) as { title: string; html: string; excerpt: string };

      const newWordCount = result.html.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;
      if (newWordCount < 2000) {
        logger.warn(`Auto-rewrite too short (${newWordCount} words, min 2000), skipping`);
        return null;
      }

      // Quality gate: validate rewritten content before accepting
      const score = validateContent(
        result.html, result.title, result.excerpt,
        post.title.rendered, 'analysis', this.wpUrl,
      );
      logContentScore(score, result.title);
      if (score.total < 40) {
        logger.warn(`Auto-rewrite quality too low (${score.total}/100), skipping`);
        return null;
      }

      return result;
    } catch (error) {
      logger.warn(`Claude rewrite failed: ${error instanceof Error ? error.message : error}`);
      return null;
    }
  }
}
