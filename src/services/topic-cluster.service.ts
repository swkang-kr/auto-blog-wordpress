import { logger } from '../utils/logger.js';
import type { ExistingPost, PostHistoryEntry } from '../types/index.js';

/** A topic cluster groups related posts under a pillar page */
export interface TopicCluster {
  nicheId: string;
  pillarUrl: string;
  posts: ClusterPost[];
  /** Keywords not yet covered by any post in this cluster */
  gaps: string[];
}

interface ClusterPost {
  postId?: number;
  url: string;
  title: string;
  keyword?: string;
  /** Relevance score to the cluster (0-1) */
  relevance: number;
}

/**
 * Topic Cluster Service — groups posts by semantic similarity within niches,
 * detects content gaps, and provides cluster-aware internal linking recommendations.
 */
export class TopicClusterService {
  private clusters: Map<string, TopicCluster> = new Map();

  /**
   * Build topic clusters from existing posts and history entries.
   * Groups posts by niche/subNiche and identifies content gaps.
   */
  buildClusters(
    existingPosts: ExistingPost[],
    historyEntries: PostHistoryEntry[],
    pillarUrlMap: Record<string, string>,
  ): Map<string, TopicCluster> {
    this.clusters.clear();

    // Group posts by subNiche
    const nicheGroups = new Map<string, ExistingPost[]>();
    for (const post of existingPosts) {
      const nicheId = post.subNiche;
      if (!nicheId) continue;
      if (!nicheGroups.has(nicheId)) nicheGroups.set(nicheId, []);
      nicheGroups.get(nicheId)!.push(post);
    }

    // Build clusters
    for (const [nicheId, posts] of nicheGroups) {
      const pillarUrl = pillarUrlMap[nicheId] || '';
      const clusterPosts: ClusterPost[] = posts.map(p => ({
        postId: p.postId,
        url: p.url,
        title: p.title,
        keyword: p.keyword,
        relevance: 1.0,
      }));

      // Cross-reference with history for keyword data
      for (const cp of clusterPosts) {
        if (!cp.keyword && cp.postId) {
          const entry = historyEntries.find(e => e.postId === cp.postId);
          if (entry) cp.keyword = entry.keyword;
        }
      }

      // Detect semantic sub-groups within the cluster
      const subGroups = this.detectSubGroups(clusterPosts);

      // Identify content gaps from common keyword patterns
      const coveredKeywords = clusterPosts
        .filter(p => p.keyword)
        .map(p => p.keyword!.toLowerCase());
      const gaps = this.identifyContentGaps(nicheId, coveredKeywords);

      this.clusters.set(nicheId, { nicheId, pillarUrl, posts: clusterPosts, gaps });
    }

    const totalGaps = Array.from(this.clusters.values()).reduce((sum, c) => sum + c.gaps.length, 0);
    if (this.clusters.size > 0) {
      const completionStats = Array.from(this.clusters.values()).map(c => {
        const templates = this.getTemplateCount(c.nicheId);
        const covered = templates - c.gaps.length;
        return `${c.nicheId}: ${covered}/${templates}`;
      }).join(', ');
      logger.info(`Topic clusters: ${this.clusters.size} clusters, ${totalGaps} gap(s) | Completion: ${completionStats}`);
    }

    return this.clusters;
  }

  /**
   * Get internal linking recommendations for a new post.
   * Returns posts from the same cluster that should be linked to/from.
   */
  getClusterLinks(nicheId: string, keyword: string, maxLinks: number = 4): ClusterPost[] {
    const cluster = this.clusters.get(nicheId);
    if (!cluster || cluster.posts.length === 0) return [];

    // Score posts using bigram-weighted similarity (same approach as KeywordResearchService)
    const scored = cluster.posts.map(post => {
      const postText = `${post.title} ${post.keyword || ''}`;
      const relevance = this.textSimilarity(keyword, postText);
      return { ...post, relevance };
    });

    return scored
      .filter(p => p.relevance > 0.1)
      .sort((a, b) => b.relevance - a.relevance)
      .slice(0, maxLinks);
  }

  /**
   * Bigram-weighted text similarity (0-1).
   * Matches KeywordResearchService approach for consistency.
   */
  private textSimilarity(a: string, b: string): number {
    const stopWords = new Set(['the', 'a', 'an', 'in', 'on', 'at', 'to', 'for', 'of', 'and', 'or', 'is', 'are', 'how', 'what', 'why', 'your', 'you', 'this', 'that', 'with']);
    const tokenize = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 2 && !stopWords.has(w));

    const wordsA = tokenize(a);
    const wordsB = tokenize(b);
    if (wordsA.length === 0 || wordsB.length === 0) return 0;

    // Unigram overlap (weight: 0.4)
    const setA = new Set(wordsA);
    const setB = new Set(wordsB);
    let unigramIntersection = 0;
    for (const word of setA) if (setB.has(word)) unigramIntersection++;
    const unigramScore = unigramIntersection / Math.max(setA.size, setB.size);

    // Bigram overlap (weight: 0.6)
    const bigramsA = new Set<string>();
    const bigramsB = new Set<string>();
    for (let i = 0; i < wordsA.length - 1; i++) bigramsA.add(`${wordsA[i]} ${wordsA[i + 1]}`);
    for (let i = 0; i < wordsB.length - 1; i++) bigramsB.add(`${wordsB[i]} ${wordsB[i + 1]}`);

    if (bigramsA.size === 0 || bigramsB.size === 0) return unigramScore;

    let bigramIntersection = 0;
    for (const bg of bigramsA) if (bigramsB.has(bg)) bigramIntersection++;
    const bigramScore = bigramIntersection / Math.max(bigramsA.size, bigramsB.size);

    return 0.4 * unigramScore + 0.6 * bigramScore;
  }

  /**
   * Get content gap suggestions for a niche (topics not yet covered).
   */
  getContentGaps(nicheId: string): string[] {
    return this.clusters.get(nicheId)?.gaps || [];
  }

  /**
   * Generate cluster navigation HTML for pillar page linking.
   * Returns a "Related in this series" section.
   */
  generateClusterNavHtml(nicheId: string, currentPostUrl: string): string {
    const cluster = this.clusters.get(nicheId);
    if (!cluster || cluster.posts.length < 2) return '';

    const relatedPosts = cluster.posts
      .filter(p => p.url !== currentPostUrl)
      .slice(0, 5);

    if (relatedPosts.length === 0) return '';

    const links = relatedPosts
      .map(p => `<li><a href="${p.url}" style="color:#0066CC;text-decoration:none;">${p.title}</a></li>`)
      .join('\n');

    return `
<div style="background:#f8f9fa;border-left:4px solid #0066CC;padding:20px;margin:32px 0;border-radius:0 8px 8px 0;">
<h3 style="margin:0 0 12px 0;font-size:18px;color:#333;">Related Articles in This Series</h3>
<ul style="margin:0;padding-left:20px;line-height:1.8;">
${links}
</ul>
${cluster.pillarUrl ? `<p style="margin:12px 0 0 0;"><a href="${cluster.pillarUrl}" style="color:#0066CC;font-weight:600;">View Complete Guide &rarr;</a></p>` : ''}
</div>`;
  }

  /** Detect semantic sub-groups within cluster posts by keyword overlap */
  private detectSubGroups(posts: ClusterPost[]): Map<string, ClusterPost[]> {
    const groups = new Map<string, ClusterPost[]>();
    for (const post of posts) {
      const kw = (post.keyword || post.title).toLowerCase();
      // Extract primary topic (first 2-3 significant words)
      const words = kw.split(/\s+/).filter(w => w.length > 3);
      const topicKey = words.slice(0, 2).join(' ');
      if (topicKey) {
        if (!groups.has(topicKey)) groups.set(topicKey, []);
        groups.get(topicKey)!.push(post);
      }
    }
    return groups;
  }

  /** Get the number of topic templates for a niche (for completion tracking) */
  private getTemplateCount(nicheId: string): number {
    const nicheCategory = nicheId.split('-').slice(0, 2).join('-');
    const topicTemplates: Record<string, number> = {
      'korean-tech': 5, 'k-entertainment': 5, 'korean-finance': 5,
      'korean-food': 5, 'korea-travel': 5, 'korean-language': 5,
      'k-beauty': 5, 'korean-crypto': 5, 'korean-auto': 5,
    };
    return topicTemplates[nicheCategory] || 5;
  }

  /** Identify content gaps based on common topic patterns per niche */
  private identifyContentGaps(nicheId: string, coveredKeywords: string[]): string[] {
    // Common topic patterns that should exist per niche category
    const topicTemplates: Record<string, string[]> = {
      'korean-tech': ['beginner guide', 'comparison', 'future trends', 'investment analysis', 'industry overview'],
      'k-entertainment': ['beginner guide', 'history', 'industry economics', 'global impact', 'fan culture'],
      'korean-finance': ['beginner guide', 'market analysis', 'investment strategy', 'risk management', 'regulatory overview'],
      'korean-food': ['beginner guide', 'regional specialties', 'health benefits', 'cooking techniques', 'restaurant guide'],
      'korea-travel': ['beginner guide', 'budget tips', 'seasonal guide', 'hidden gems', 'transportation guide'],
      'korean-language': ['beginner guide', 'grammar essentials', 'vocabulary building', 'pronunciation', 'cultural context'],
      'k-beauty': ['beginner guide', 'product comparison', 'ingredient analysis', 'skincare routine', 'market overview'],
      'korean-crypto': ['beginner guide', 'exchange comparison', 'regulation overview', 'market analysis', 'investment strategy'],
      'korean-auto': ['beginner guide', 'model comparison', 'EV technology', 'market analysis', 'investment overview'],
    };

    const nicheCategory = nicheId.split('-').slice(0, 2).join('-');
    const templates = topicTemplates[nicheCategory] || [];
    const gaps: string[] = [];

    for (const template of templates) {
      const templateWords = template.toLowerCase().split(/\s+/);
      const isCovered = coveredKeywords.some(kw => {
        const kwWords = kw.split(/\s+/);
        return templateWords.every(tw => kwWords.some(kw2 => kw2.includes(tw)));
      });
      if (!isCovered) {
        gaps.push(`${template} (${nicheId})`);
      }
    }

    return gaps;
  }
}
