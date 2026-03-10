import { logger } from '../utils/logger.js';
import type { ExistingPost, PostHistoryEntry } from '../types/index.js';

/** Scored content gap with priority and reason */
export interface ContentGap {
  topic: string;
  priority: 'high' | 'medium' | 'low';
  reason: string;
}

/** A topic cluster groups related posts under a pillar page */
export interface TopicCluster {
  nicheId: string;
  pillarUrl: string;
  posts: ClusterPost[];
  /** Keywords not yet covered by any post in this cluster */
  gaps: string[];
  /** Scored content gaps with priority */
  scoredGaps: ContentGap[];
  /** Posts grouped by semantic sub-topic */
  subTopics: Map<string, ClusterPost[]>;
}

interface ClusterPost {
  postId?: number;
  url: string;
  title: string;
  keyword?: string;
  /** Relevance score to the cluster (0-1) */
  relevance: number;
  /** Assigned sub-topic label */
  subTopic?: string;
}

/**
 * Niche-specific sub-topic definitions for semantic classification.
 * Each sub-topic has keyword patterns that posts are matched against.
 */
const NICHE_SUBTOPICS: Record<string, Record<string, string[]>> = {
  'korean-tech': {
    'AI & Machine Learning': ['ai', 'artificial intelligence', 'machine learning', 'deep learning', 'llm', 'chatbot', 'gpt', 'neural'],
    'Semiconductors': ['semiconductor', 'chip', 'hbm', 'memory', 'nand', 'dram', 'foundry', 'fab', 'hynix', 'samsung semiconductor'],
    'Startups & Venture': ['startup', 'venture', 'unicorn', 'funding', 'vc', 'accelerator', 'pangyo'],
    'Smartphones & Consumer': ['smartphone', 'galaxy', 'phone', 'mobile', 'app', 'wearable', 'tablet'],
    'EVs & Mobility': ['ev', 'electric vehicle', 'autonomous', 'battery', 'hyundai motor', 'kia', 'charging'],
  },
  'korean-finance': {
    'Stocks & ETFs': ['stock', 'etf', 'kospi', 'kosdaq', 'equity', 'share', 'dividend', 'ipo'],
    'Forex & Currency': ['forex', 'won', 'krw', 'usd', 'exchange rate', 'currency', 'fx'],
    'Monetary Policy': ['interest rate', 'bok', 'bank of korea', 'monetary', 'inflation', 'cpi'],
    'Real Estate': ['real estate', 'property', 'housing', 'apartment', 'jeonse', 'rent', 'mortgage'],
    'Crypto & Digital Assets': ['crypto', 'bitcoin', 'digital asset', 'blockchain', 'defi', 'exchange'],
  },
  'k-beauty': {
    'Skincare Routines': ['routine', 'step', 'regimen', 'morning', 'night', 'double cleanse', 'layering'],
    'Ingredients & Science': ['ingredient', 'niacinamide', 'retinol', 'hyaluronic', 'centella', 'snail', 'ferment', 'peptide'],
    'Brands & Products': ['brand', 'cosrx', 'innisfree', 'sulwhasoo', 'laneige', 'product', 'olive young'],
    'Industry & Market': ['market', 'industry', 'export', 'revenue', 'growth', 'trend', 'k-beauty market'],
    'Trends & Innovations': ['trend', 'innovation', 'glass skin', 'clean beauty', 'sustainable', 'minimalist'],
  },
  'korea-travel': {
    'Cities & Destinations': ['seoul', 'busan', 'jeju', 'gyeongju', 'incheon', 'daegu', 'city', 'destination'],
    'Transportation': ['ktx', 'subway', 'bus', 'train', 'airport', 'transport', 't-money', 'taxi'],
    'Food & Dining': ['food', 'restaurant', 'street food', 'cafe', 'bbq', 'kimchi', 'soju', 'dining'],
    'Accommodation': ['hotel', 'hostel', 'airbnb', 'hanok', 'stay', 'accommodation', 'guesthouse'],
    'Culture & Experiences': ['temple', 'palace', 'festival', 'tradition', 'hanbok', 'culture', 'museum'],
  },
  'k-entertainment': {
    'K-Pop': ['kpop', 'k-pop', 'idol', 'comeback', 'album', 'concert', 'bts', 'blackpink', 'aespa', 'music'],
    'K-Drama': ['kdrama', 'k-drama', 'drama', 'netflix', 'series', 'actor', 'actress', 'ratings'],
    'Webtoons & Content': ['webtoon', 'manhwa', 'animation', 'naver webtoon', 'kakao', 'content'],
    'Business & Industry': ['hybe', 'sm', 'jyp', 'yg', 'agency', 'revenue', 'ipo', 'stock', 'business model'],
    'Awards & Global Impact': ['award', 'grammy', 'billboard', 'global', 'hallyu', 'soft power', 'export'],
  },
};

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

      // Classify posts into semantic sub-topics
      const subTopics = this.classifySubTopics(nicheId, clusterPosts);

      // Identify scored content gaps from sub-topic coverage
      const coveredKeywords = clusterPosts
        .filter(p => p.keyword)
        .map(p => p.keyword!.toLowerCase());
      const gaps = this.identifyContentGaps(nicheId, coveredKeywords);
      const scoredGaps = this.identifyScoredGaps(nicheId, subTopics);

      this.clusters.set(nicheId, { nicheId, pillarUrl, posts: clusterPosts, gaps, scoredGaps, subTopics });
    }

    const totalGaps = Array.from(this.clusters.values()).reduce((sum, c) => sum + c.scoredGaps.length, 0);
    if (this.clusters.size > 0) {
      const completionStats = Array.from(this.clusters.values()).map(c => {
        const nicheCategory = c.nicheId.split('-').slice(0, 2).join('-');
        const totalSubTopics = Object.keys(NICHE_SUBTOPICS[nicheCategory] || {}).length || 5;
        const covered = c.subTopics.size;
        return `${c.nicheId}: ${covered}/${totalSubTopics}`;
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
   * Get scored content gaps with priority for a niche.
   */
  getScoredGaps(nicheId: string): ContentGap[] {
    return this.clusters.get(nicheId)?.scoredGaps || [];
  }

  /**
   * Generate cluster navigation HTML for pillar page linking.
   * Groups related posts by sub-topic with sub-headers.
   */
  generateClusterNavHtml(nicheId: string, currentPostUrl: string): string {
    const cluster = this.clusters.get(nicheId);
    if (!cluster || cluster.posts.length < 2) return '';

    // Group posts by sub-topic for structured navigation
    const sections: string[] = [];
    for (const [subTopic, posts] of cluster.subTopics) {
      const filteredPosts = posts.filter(p => p.url !== currentPostUrl);
      if (filteredPosts.length === 0) continue;

      const links = filteredPosts
        .slice(0, 3) // Max 3 per sub-topic
        .map(p => `<li><a href="${p.url}" style="color:#0066CC;text-decoration:none;">${p.title}</a></li>`)
        .join('\n');

      sections.push(`<p style="margin:12px 0 4px 0;font-size:13px;font-weight:700;color:#666;text-transform:uppercase;letter-spacing:0.5px;">${subTopic}</p>\n<ul style="margin:0 0 8px 0;padding-left:20px;line-height:1.8;">\n${links}\n</ul>`);
    }

    // Fall back to flat list if no sub-topics
    if (sections.length === 0) {
      const relatedPosts = cluster.posts
        .filter(p => p.url !== currentPostUrl)
        .slice(0, 5);
      if (relatedPosts.length === 0) return '';

      const links = relatedPosts
        .map(p => `<li><a href="${p.url}" style="color:#0066CC;text-decoration:none;">${p.title}</a></li>`)
        .join('\n');

      sections.push(`<ul style="margin:0;padding-left:20px;line-height:1.8;">\n${links}\n</ul>`);
    }

    return `
<div style="background:#f8f9fa;border-left:4px solid #0066CC;padding:20px;margin:32px 0;border-radius:0 8px 8px 0;">
<h3 style="margin:0 0 12px 0;font-size:18px;color:#333;">Related Articles in This Series</h3>
${sections.join('\n')}
${cluster.pillarUrl ? `<p style="margin:12px 0 0 0;"><a href="${cluster.pillarUrl}" style="color:#0066CC;font-weight:600;">View Complete Guide &rarr;</a></p>` : ''}
</div>`;
  }

  /**
   * Classify posts into semantic sub-topics using keyword matching.
   * Replaces simplistic 2-word grouping with explicit niche-specific classification.
   */
  private classifySubTopics(nicheId: string, posts: ClusterPost[]): Map<string, ClusterPost[]> {
    const nicheCategory = nicheId.split('-').slice(0, 2).join('-');
    const subTopicDefs = NICHE_SUBTOPICS[nicheCategory];

    // Fall back to simple keyword grouping if no sub-topic definitions
    if (!subTopicDefs) {
      return this.detectSubGroupsFallback(posts);
    }

    const groups = new Map<string, ClusterPost[]>();

    for (const post of posts) {
      const text = `${post.keyword || ''} ${post.title}`.toLowerCase();
      let bestMatch: string | null = null;
      let bestScore = 0;

      for (const [subTopic, keywords] of Object.entries(subTopicDefs)) {
        const matchCount = keywords.filter(kw => text.includes(kw)).length;
        if (matchCount > bestScore) {
          bestScore = matchCount;
          bestMatch = subTopic;
        }
      }

      const label = bestMatch || 'General';
      post.subTopic = label;
      if (!groups.has(label)) groups.set(label, []);
      groups.get(label)!.push(post);
    }

    return groups;
  }

  /** Fallback: detect sub-groups by keyword overlap (legacy approach) */
  private detectSubGroupsFallback(posts: ClusterPost[]): Map<string, ClusterPost[]> {
    const groups = new Map<string, ClusterPost[]>();
    for (const post of posts) {
      const kw = (post.keyword || post.title).toLowerCase();
      const words = kw.split(/\s+/).filter(w => w.length > 3);
      const topicKey = words.slice(0, 2).join(' ');
      if (topicKey) {
        if (!groups.has(topicKey)) groups.set(topicKey, []);
        groups.get(topicKey)!.push(post);
      }
    }
    return groups;
  }

  /**
   * Identify scored content gaps based on sub-topic coverage.
   * Sub-topics with 0 posts = high priority, 1 post = medium.
   */
  private identifyScoredGaps(nicheId: string, subTopics: Map<string, ClusterPost[]>): ContentGap[] {
    const nicheCategory = nicheId.split('-').slice(0, 2).join('-');
    const subTopicDefs = NICHE_SUBTOPICS[nicheCategory];
    if (!subTopicDefs) return [];

    const gaps: ContentGap[] = [];
    for (const subTopic of Object.keys(subTopicDefs)) {
      const posts = subTopics.get(subTopic);
      const count = posts?.length || 0;
      if (count === 0) {
        gaps.push({ topic: subTopic, priority: 'high', reason: `No posts covering ${subTopic} in ${nicheId}` });
      } else if (count === 1) {
        gaps.push({ topic: subTopic, priority: 'medium', reason: `Only 1 post for ${subTopic} — add depth` });
      }
    }

    // Sort by priority (high first)
    return gaps.sort((a, b) => (a.priority === 'high' ? -1 : 1) - (b.priority === 'high' ? -1 : 1));
  }

  /** Get the number of topic templates for a niche (for completion tracking) */
  private getTemplateCount(nicheId: string): number {
    const nicheCategory = nicheId.split('-').slice(0, 2).join('-');
    return Object.keys(NICHE_SUBTOPICS[nicheCategory] || {}).length || 5;
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
