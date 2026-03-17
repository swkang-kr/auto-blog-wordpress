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
  'k-beauty': {
    'Skincare Routines': ['routine', 'step', 'regimen', 'morning', 'night', 'double cleanse', 'layering', 'skip-care', 'glass skin routine', 'skin barrier'],
    'Ingredients & Science': [
      'ingredient', 'niacinamide', 'retinol', 'hyaluronic', 'centella', 'snail', 'ferment', 'peptide', 'aha', 'bha', 'pha', 'vitamin c', 'collagen', 'ceramide', 'ph', 'concentration',
      // 2025-2026 breakout ingredients (high search volume — must classify correctly)
      'glutathione', 'tranexamic acid', 'bakuchiol', 'polyglutamic acid', 'pga', 'adenosine',
      'mugwort', 'artemisia', 'mushroom', 'tremella', 'bio-cellulose', 'microbiome', 'probiotic',
      'postbiotic', 'galactomyces', 'bifida', 'saccharomyces',
    ],
    'Brands & Products': [
      // Established brands
      'cosrx', 'innisfree', 'sulwhasoo', 'laneige', 'missha', 'etude', 'skin1004', 'anua', 'torriden', 'beauty of joseon',
      // Emerging 2025-2026 brands
      'medicube', 'isntree', 'haruharu wonder', 'round lab', 'mixsoon', 'some by mi', 'klairs', 'purito', 'abib', 'numbuzin', 'axis-y',
      // Viral/breakout 2024-2026 brands
      'tirtir', 'biodance', 'd\'alba', 'dalba', 'white truffle', 'vt cosmetics', 'vt cica', 'fwee',
      'aestura', 'dr.g', 'dr.jart', 'drjart', 'cicapair', 'jumiso',
      // General
      'brand', 'product', 'olive young', 'review',
    ],
    'Toner Pads & Exfoliation': ['toner pad', 'exfoliating pad', 'cotton pad', 'gauze pad', 'exfoliation', 'aha pad', 'bha pad', 'pore', 'texture'],
    'K-Beauty Makeup': ['makeup', 'foundation', 'cushion', 'tint', 'lip', 'blush', 'contour', 'eyeshadow', 'mascara', 'rom&nd', 'clio', 'peripera', 'wakemake', 'eyeliner', 'bb cream', 'cc cream'],
    'Hair & Scalp Care': ['shampoo', 'hair loss', 'scalp', 'hair care', 'conditioner', 'hair mask', 'thinning', 'daeng gi meo ri', 'ryo', 'hair serum'],
    'Men\'s K-Beauty': ['men', 'male', 'men\'s skincare', 'men\'s grooming', 'men\'s moisturizer', 'men\'s sunscreen', 'gender neutral'],
    'Inclusive Beauty': ['dark skin', 'deeper skin', 'melanin', 'dark tones', 'hyperpigmentation skin tone', 'no white cast dark', 'dark complexion'],
    'Pregnancy & Safe Skin': ['pregnancy', 'pregnant', 'prenatal', 'pregnancy safe', 'pregnancy-safe', 'safe for pregnancy', 'safe during pregnancy'],
    'Nail Art & K-Nails': ['nail', 'nail art', 'gel nail', 'press-on', 'manicure', 'nail sticker', 'ohora', 'dashing diva', 'cat eye nail', 'magnet nail', 'aurora nail', 'jelly nail', 'chrome nail'],
    'Industry & Market': ['market', 'industry', 'export', 'revenue', 'growth', 'trend', 'k-beauty market', 'olive young sales', 'amazon k-beauty'],
    'Trends & Innovations': ['trend', 'innovation', 'glass skin', 'clean beauty', 'sustainable', 'minimalist', 'skip care', 'cloud skin', 'pore care', 'babyface', 'dupe', 'budget'],
  },
  'k-entertainment': {
    'K-Pop': [
      // 3rd gen
      'bts', 'blackpink', 'twice', 'exo', 'shinee', 'got7', 'nct', 'red velvet', 'mamamoo', 'monsta x', 'seventeen', 'stray kids',
      // 4th gen
      'aespa', 'ive', 'le sserafim', 'newjeans', 'njz', 'babymonster', 'illit', 'kiss of life', 'tws', 'ateez', 'txt', 'enhypen', 'xg', 'kep1er',
      // 4th gen newer debuts (2023-2025)
      'riize', 'boynextdoor', 'zerobaseone', 'zb1', '8turn', 'unis', 'izna', 'nct wish', 'katseye', 'whiplash', 'qwer',
      'plave', 'g-dragon', 'gdragon',
      // General
      'kpop', 'k-pop', 'idol', 'comeback', 'album', 'concert', 'music', 'mv', 'music video',
    ],
    'K-Drama': ['kdrama', 'k-drama', 'drama', 'netflix', 'disney plus', 'series', 'actor', 'actress', 'ratings', 'ost', 'ending explained', 'where to watch', 'streaming'],
    'Fan Culture & Community': [
      'fan', 'fandom', 'stan', 'bias', 'ult', 'fansite', 'merch', 'fan meet', 'sasaeng', 'fan war',
      // Fan platforms (2025-2026 핵심) — NOTE: V Live(VLIVE) 2023년 12월 서비스 종료 → Weverse 통합. 역사적 참조용으로만 유지.
      'weverse', 'bubble', 'universe',
      // vlive retained as historical keyword only (service ended Dec 2023, merged into Weverse)
      'vlive',
      // Collectibles
      'photocard', 'lightstick', 'pob', 'pre-order benefit', 'limited edition', 'photobook',
    ],
    'Idol News & Updates': ['comeback', 'debut', 'disbandment', 'hiatus', 'solo', 'collab', 'scandal', 'news', 'update', 'military', 'enlistment', 'world tour', 'concert tickets'],
    'Streaming & Charts': ['chart', 'melon', 'circle chart', 'hanteo', 'billboard', 'spotify', 'youtube views', 'streaming', 'ranking', 'number one'],
    'Awards & Global Impact': ['award', 'grammy', 'mama', 'mma', 'gda', 'golden disc', 'global', 'hallyu', 'worldwide', 'daesang'],
    'Idol Beauty & Style': ['skincare', 'makeup look', 'beauty routine', 'fashion', 'outfit', 'idol style', 'no-makeup', 'beauty secret', 'iu', 'brand ambassador', 'ambassador', 'laneige ambassador', 'karina skincare', 'wonyoung beauty', 'idol product'],
    'Korean Musical & Theater': ['musical', 'theater', 'theatre', 'broadway', 'interpark ticket', 'musical actor', 'doyoung musical', 'kyuhyun musical', 'k-musical'],
    'K-Hip-Hop & K-R&B': ['hip-hop', 'hip hop', 'k-hip-hop', 'k-r&b', 'r&b', 'rnb', 'dean', 'crush', 'zion.t', 'jay park', 'ph-1', 'dpr live', 'heize', 'colde', 'lee hi', 'aomg', 'h1ghr', 'show me the money', 'indie music', 'indie artist'],
    'Korean Movies & Film': ['movie', 'film', 'cinema', 'cannes', 'biff', 'busan film', 'thriller movie', 'horror movie', 'director', 'park chan-wook', 'bong joon-ho'],
    'Web Variety & YouTube': ['web variety', 'youtube variety', 'workman', 'psick', 'short box', '워크맨', '피식', '숏박스', 'variety show', 'running man', 'knowing bros', 'i live alone'],
  },
};

/**
 * Topic Cluster Service — groups posts by semantic similarity within niches,
 * detects content gaps, and provides cluster-aware internal linking recommendations.
 */
/**
 * Niche-specific topical map: 50-80 target topics per niche for comprehensive coverage tracking.
 * These represent the ideal topic universe that the blog should cover for topical authority.
 */
const NICHE_TOPICAL_MAP: Record<string, string[]> = {
  'k-beauty': [
    'Korean skincare routine beginner', 'Korean sunscreen comparison', 'Korean moisturizer guide',
    'Korean serum guide', 'Korean cleansing oil', 'Korean sheet mask ranking', 'Korean toner guide',
    'Korean eye cream', 'Korean lip care', 'Korean body care', 'Korean mens skincare',
    'Olive Young best sellers', 'Korean skincare ingredients niacinamide', 'Korean retinol products',
    'Korean centella products', 'Korean snail mucin', 'Korean fermented skincare', 'Korean peptide serum',
    'Korean glass skin routine', 'Korean anti-aging skincare', 'Korean acne treatment',
    'Korean sensitive skin products', 'Korean skincare for dry skin', 'Korean oily skin routine',
    'K-beauty industry market analysis', 'K-beauty global expansion', 'K-beauty vs J-beauty',
    'Korean beauty tech innovation', 'Korean clean beauty brands', 'Korean vegan skincare',
    'Korean skincare dupes', 'Korean drugstore skincare', 'Korean luxury skincare brands',
    'Korean beauty subscription boxes', 'Korean hair care products', 'Korean makeup trends',
    // 2025-2026 high-priority gaps (breakout segments)
    'Korean toner pads guide ranked', 'Korean glutathione brightening serum', 'Korean tranexamic acid hyperpigmentation',
    'Korean bakuchiol retinol alternative', 'Korean polyglutamic acid hydration', 'Korean mugwort skincare sensitive',
    'Korean mushroom tremella skincare', 'Korean bio-cellulose mask Biodance', 'Korean microbiome probiotic skincare',
    'Olive Young Global shipping international guide', 'Korean glass body skincare routine',
    'Korean skin flooding layering method', 'd\'Alba white truffle serum Olive Young',
    // 16차 추가: 신규 seed keyword 군 갭 탐지용
    'Korean skincare for dark skin tones melanin guide',
    'Korean pregnancy-safe skincare routine bakuchiol guide',
    'Olive Young app international shopping guide foreigners',
    'PURITO sunscreen centella review guide',
    'Jumiso vitamin C serum brightening review',
    // 3차 감사 추가: 신규 세그먼트 갭 탐지
    'Korean postbiotic skincare serum barrier 2026',
    'Korean galactomyces essence review ranked',
    'Korean nail art gel sticker manicure guide',
    'Korean nail art ohora Dashing Diva ranked',
  ],
  'k-entertainment': [
    // K-Pop fan content
    'BTS comeback 2026 what to expect', 'BLACKPINK members solo careers', 'aespa Supernova era explained',
    'NewJeans comeback songs ranked', 'BABYMONSTER debut ranking', 'SEVENTEEN world tour 2026',
    'Stray Kids best songs ranked', 'IVE songs ranked by fans', 'LE SSERAFIM comeback update',
    'K-pop best songs of 2026', 'K-pop music videos ranked by views', 'K-pop idol fun facts fans',
    'K-pop reality shows to watch', 'K-pop concert experience guide', 'K-pop lightstick collection guide',
    'MAMA Awards 2026 winners', 'Melon Music Awards 2026 predictions', 'K-pop fandom culture explained',
    // K-Drama fan content
    'best K-dramas on Netflix 2026', 'most watched K-dramas 2026 ranked', 'K-drama ending explained 2026',
    'K-drama recommendations by genre', 'best K-drama actors 2026', 'K-drama OST songs ranked',
    'underrated K-dramas to watch', 'K-drama vs C-drama comparison', 'K-drama rewatch rankings',
    // Fan community & culture
    'K-pop fan meetup guide USA', 'K-pop concerts in USA 2026', 'how to become a K-pop fan',
    'K-pop merchandise buying guide', 'K-pop album unboxing guide', 'K-pop photocard collecting tips',
    'K-pop fan art community', 'K-pop stan Twitter explained', 'K-pop fandom wars history',
    // 2025-2026 high-priority gaps
    'NewJeans NJZ status update 2026', 'RIIZE comeback 2026 guide', 'BOYNEXTDOOR songs ranked',
    'ZeroBaseOne ZB1 fandom guide', 'Weverse vs Bubble comparison', 'KCON USA 2026 guide',
    'K-pop photocard trading guide safe', 'how to stream K-pop music chart',
    'IU skincare Laneige ambassador routine', 'K-pop idol no-makeup beauty secrets',
    'Baeksang Arts Awards 2026 predictions', 'TVING vs Netflix K-drama guide',
    // 16차 추가: 신규 seed keyword 군 갭 탐지용
    'PLAVE virtual idol group guide fans ASTERDOM',
    'G-Dragon solo comeback 2025 2026 guide',
    'K-pop idols turned actors drama roles guide',
    'KBS SBS MBC year-end drama awards guide',
    // 3차 감사 추가: 신규 세그먼트 갭 탐지
    'Korean musical theater guide ranked 2026',
    'K-pop idols in musicals best performances',
    'K-hip-hop K-R&B artists guide DEAN Crush ranked',
    'Korean web variety YouTube shows guide 2026',
    'K-pop photocard trading apps platforms compared',
    'best Korean sci-fi fantasy dramas ranked',
    'best Korean zombie dramas Kingdom ranked',
    'best Korean legal courtroom dramas ranked',
    'K-pop group lore universe explained comparison',
    'K-drama OST playlist Spotify Apple Music',
  ],
};

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
   * Get related posts prioritized by cluster proximity:
   * same sub-topic → same cluster → same niche (fallback).
   * Used by buildRelatedPostsHtml for cluster-aware related posts.
   */
  getRelatedPostsByCluster(
    nicheId: string,
    keyword: string,
    existingPosts: ExistingPost[],
    maxPosts: number = 4,
  ): ExistingPost[] {
    const cluster = this.clusters.get(nicheId);
    if (!cluster || cluster.posts.length === 0) return [];

    // Determine sub-topic of current keyword
    const nicheKey = nicheId.replace(/-[^-]+$/, ''); // e.g., "korean-tech-ai" → "korean-tech"
    const subTopics = NICHE_SUBTOPICS[nicheKey] || {};
    let currentSubTopic = '';
    const kwLower = keyword.toLowerCase();
    for (const [topic, patterns] of Object.entries(subTopics)) {
      if (patterns.some(p => kwLower.includes(p))) {
        currentSubTopic = topic;
        break;
      }
    }

    // Score each cluster post by proximity
    const scored: Array<{ post: ClusterPost; score: number }> = [];
    for (const post of cluster.posts) {
      // Skip self
      if (post.keyword && post.keyword.toLowerCase() === kwLower) continue;
      let score = 0;
      // Same sub-topic = highest priority
      if (currentSubTopic && post.subTopic === currentSubTopic) score = 3;
      // Same cluster but different sub-topic
      else if (post.relevance > 0.15) score = 2;
      // General cluster member
      else score = 1;
      // Boost by relevance
      score += post.relevance * 0.5;
      scored.push({ post, score });
    }

    scored.sort((a, b) => b.score - a.score);
    const topUrls = scored.slice(0, maxPosts).map(s => s.post.url);

    // Map back to ExistingPost objects
    return topUrls
      .map(url => existingPosts.find(p => p.url === url))
      .filter((p): p is ExistingPost => !!p);
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

  /**
   * Generate a topical map coverage report showing covered vs uncovered sub-topics per niche.
   * Returns a structured report for logging and strategic content planning.
   */
  generateTopicalMapReport(): {
    niches: Array<{
      nicheId: string;
      totalSubTopics: number;
      coveredSubTopics: number;
      coveragePct: number;
      postCount: number;
      covered: Array<{ subTopic: string; postCount: number }>;
      uncovered: string[];
      underserved: Array<{ subTopic: string; postCount: number }>;
    }>;
    overallCoverage: number;
    totalPosts: number;
    recommendations: string[];
  } {
    const nicheReports: Array<{
      nicheId: string;
      totalSubTopics: number;
      coveredSubTopics: number;
      coveragePct: number;
      postCount: number;
      covered: Array<{ subTopic: string; postCount: number }>;
      uncovered: string[];
      underserved: Array<{ subTopic: string; postCount: number }>;
    }> = [];

    let totalPosts = 0;
    let totalSubTopics = 0;
    let totalCovered = 0;

    for (const [nicheId, cluster] of this.clusters) {
      const nicheCategory = nicheId.split('-').slice(0, 2).join('-');
      const subTopicDefs = NICHE_SUBTOPICS[nicheCategory];
      if (!subTopicDefs) continue;

      const allSubTopics = Object.keys(subTopicDefs);
      const covered: Array<{ subTopic: string; postCount: number }> = [];
      const uncovered: string[] = [];
      const underserved: Array<{ subTopic: string; postCount: number }> = [];

      for (const subTopic of allSubTopics) {
        const posts = cluster.subTopics.get(subTopic);
        const count = posts?.length || 0;
        if (count === 0) {
          uncovered.push(subTopic);
        } else if (count <= 2) {
          underserved.push({ subTopic, postCount: count });
          covered.push({ subTopic, postCount: count });
        } else {
          covered.push({ subTopic, postCount: count });
        }
      }

      const coveragePct = allSubTopics.length > 0
        ? Math.round((covered.length / allSubTopics.length) * 100)
        : 100;

      nicheReports.push({
        nicheId,
        totalSubTopics: allSubTopics.length,
        coveredSubTopics: covered.length,
        coveragePct,
        postCount: cluster.posts.length,
        covered: covered.sort((a, b) => b.postCount - a.postCount),
        uncovered,
        underserved,
      });

      totalPosts += cluster.posts.length;
      totalSubTopics += allSubTopics.length;
      totalCovered += covered.length;
    }

    const overallCoverage = totalSubTopics > 0
      ? Math.round((totalCovered / totalSubTopics) * 100)
      : 0;

    // Generate strategic recommendations
    const recommendations: string[] = [];
    for (const niche of nicheReports) {
      if (niche.uncovered.length > 0) {
        recommendations.push(
          `${niche.nicheId}: Create content for uncovered topics: ${niche.uncovered.join(', ')}`,
        );
      }
      if (niche.underserved.length > 0) {
        const underservedList = niche.underserved
          .map(u => `${u.subTopic} (${u.postCount} post${u.postCount > 1 ? 's' : ''})`)
          .join(', ');
        recommendations.push(
          `${niche.nicheId}: Deepen coverage on: ${underservedList}`,
        );
      }
      if (niche.coveragePct < 60) {
        recommendations.push(
          `${niche.nicheId}: Low coverage (${niche.coveragePct}%) — prioritize this niche for topical authority`,
        );
      }
    }

    // Log the report
    logger.info('=== Topical Map Coverage Report ===');
    logger.info(`Overall: ${overallCoverage}% coverage (${totalCovered}/${totalSubTopics} sub-topics across ${totalPosts} posts)`);
    for (const niche of nicheReports) {
      const status = niche.coveragePct >= 80 ? 'STRONG' : niche.coveragePct >= 60 ? 'MODERATE' : 'WEAK';
      logger.info(
        `  ${niche.nicheId}: ${niche.coveragePct}% [${status}] — ` +
        `${niche.coveredSubTopics}/${niche.totalSubTopics} sub-topics, ${niche.postCount} posts` +
        (niche.uncovered.length > 0 ? ` | Gaps: ${niche.uncovered.join(', ')}` : ''),
      );
    }
    if (recommendations.length > 0) {
      logger.info('Recommendations:');
      for (const rec of recommendations.slice(0, 10)) {
        logger.info(`  → ${rec}`);
      }
    }

    return { niches: nicheReports, overallCoverage, totalPosts, recommendations };
  }

  /**
   * Get series opportunities for a niche: clusters of 3+ related keywords
   * that could form a multi-part content series.
   */
  /**
   * Get a cluster by niche ID.
   */
  getCluster(nicheId: string): TopicCluster | undefined {
    return this.clusters.get(nicheId);
  }

  /**
   * Analyze cluster coverage — which sub-topics are covered and which have gaps.
   */
  getClusterCoverage(nicheId: string): { covered: number; total: number; gaps: string[] } | null {
    const cluster = this.clusters.get(nicheId);
    if (!cluster) return null;

    const nicheCategory = nicheId.split('-').slice(0, 2).join('-');
    const subTopicDefs = NICHE_SUBTOPICS[nicheCategory];
    if (!subTopicDefs) return null;

    const totalSubTopics = Object.keys(subTopicDefs).length;
    const coveredSubTopics = cluster.subTopics.size;
    const allSubTopicNames = Object.keys(subTopicDefs);
    const coveredNames = new Set(cluster.subTopics.keys());
    const gaps = allSubTopicNames.filter(name => !coveredNames.has(name));

    return { covered: coveredSubTopics, total: totalSubTopics, gaps };
  }

  /**
   * Get cluster completeness metrics per niche with gap prioritization.
   * Returns per-subtopic post count, % coverage, and high-priority gaps
   * (subtopics with <3 satellite posts).
   */
  getClusterCompleteness(nicheId: string): {
    nicheId: string;
    totalSubTopics: number;
    coveredCount: number;
    coveragePct: number;
    subTopicDetails: Array<{ subTopic: string; postCount: number; priority: 'high' | 'medium' | 'covered' }>;
    highPriorityGaps: string[];
    insightString: string;
  } | null {
    const cluster = this.clusters.get(nicheId);
    if (!cluster) return null;

    const nicheCategory = nicheId.split('-').slice(0, 2).join('-');
    const subTopicDefs = NICHE_SUBTOPICS[nicheCategory];
    if (!subTopicDefs) return null;

    const allSubTopics = Object.keys(subTopicDefs);
    const details: Array<{ subTopic: string; postCount: number; priority: 'high' | 'medium' | 'covered' }> = [];
    const highPriorityGaps: string[] = [];

    for (const subTopic of allSubTopics) {
      const posts = cluster.subTopics.get(subTopic);
      const count = posts?.length || 0;

      let priority: 'high' | 'medium' | 'covered';
      if (count === 0) {
        priority = 'high';
        highPriorityGaps.push(subTopic);
      } else if (count < 3) {
        priority = 'medium';
        highPriorityGaps.push(subTopic);
      } else {
        priority = 'covered';
      }

      details.push({ subTopic, postCount: count, priority });
    }

    const coveredCount = details.filter(d => d.priority === 'covered').length;
    const coveragePct = allSubTopics.length > 0 ? Math.round((coveredCount / allSubTopics.length) * 100) : 100;

    // Build insight string for keyword research
    const gapParts: string[] = [];
    if (highPriorityGaps.length > 0) {
      gapParts.push(`Topic cluster gaps for ${nicheId}: ${highPriorityGaps.join(', ')} need more content (<3 posts each).`);
      gapParts.push(`Prioritize creating content for: ${highPriorityGaps.slice(0, 3).join(', ')}.`);
    }
    const insightString = gapParts.join(' ');

    return {
      nicheId,
      totalSubTopics: allSubTopics.length,
      coveredCount,
      coveragePct,
      subTopicDetails: details,
      highPriorityGaps,
      insightString,
    };
  }

  /**
   * Get prioritized content recommendations based on topical map coverage.
   * Returns topics sorted by strategic value (gap severity x potential traffic).
   */
  getContentPriority(nicheId: string, existingPosts: ExistingPost[]): Array<{
    topic: string;
    priority: 'critical' | 'high' | 'medium' | 'low';
    reason: string;
    suggestedContentType: string;
  }> {
    const nicheKey = nicheId.replace(/-[^-]+$/, '');
    const topicalMap = NICHE_TOPICAL_MAP[nicheKey];
    if (!topicalMap) return [];

    const coveredTopics = new Set<string>();
    for (const post of existingPosts) {
      const titleLower = post.title.toLowerCase();
      for (const topic of topicalMap) {
        const topicWords = topic.toLowerCase().split(/\s+/).filter(w => w.length > 3);
        if (topicWords.filter(w => titleLower.includes(w)).length >= 2) {
          coveredTopics.add(topic);
        }
      }
    }

    const recommendations: Array<{
      topic: string;
      priority: 'critical' | 'high' | 'medium' | 'low';
      reason: string;
      suggestedContentType: string;
    }> = [];

    for (const topic of topicalMap) {
      if (coveredTopics.has(topic)) continue;

      // Determine priority based on topic characteristics
      const isFoundational = /guide|basics|introduction|explained|overview/.test(topic.toLowerCase());
      const isHighValue = /analysis|strategy|comparison|investment|market/.test(topic.toLowerCase());
      const isTimely = /2026|outlook|forecast|trend/.test(topic.toLowerCase());

      let priority: 'critical' | 'high' | 'medium' | 'low';
      let reason: string;
      let suggestedContentType: string;

      if (isFoundational) {
        priority = 'critical';
        reason = 'Foundational topic missing — blocks topical authority';
        suggestedContentType = 'deep-dive';
      } else if (isHighValue) {
        priority = 'high';
        reason = 'High-value commercial topic not covered';
        suggestedContentType = 'analysis';
      } else if (isTimely) {
        priority = 'high';
        reason = 'Time-sensitive topic — publish before relevance window closes';
        suggestedContentType = 'news-explainer';
      } else {
        priority = 'medium';
        reason = 'Gap in topical coverage';
        suggestedContentType = 'how-to';
      }

      recommendations.push({ topic, priority, reason, suggestedContentType });
    }

    // Sort: critical > high > medium > low
    const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    return recommendations.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
  }

  getSeriesOpportunities(nicheId: string): Array<{ seriesName: string; keywords: string[]; priority: 'high' | 'medium' }> {
    const cluster = this.clusters.get(nicheId);
    if (!cluster) return [];

    const opportunities: Array<{ seriesName: string; keywords: string[]; priority: 'high' | 'medium' }> = [];

    for (const [subTopic, posts] of cluster.subTopics) {
      const keywords = posts
        .filter(p => p.keyword)
        .map(p => p.keyword!);

      if (keywords.length >= 3) {
        opportunities.push({
          seriesName: `${subTopic} Series`,
          keywords,
          priority: keywords.length >= 5 ? 'high' : 'medium',
        });
      }
    }

    // Also check scored gaps for uncovered sub-topics that could seed a new series
    const nicheCategory = nicheId.split('-').slice(0, 2).join('-');
    const subTopicDefs = NICHE_SUBTOPICS[nicheCategory];
    if (subTopicDefs) {
      for (const [subTopic, seedKeywords] of Object.entries(subTopicDefs)) {
        const existing = cluster.subTopics.get(subTopic);
        if (!existing || existing.length < 2) {
          // Suggest a new series from seed keywords
          opportunities.push({
            seriesName: `${subTopic} Starter Series`,
            keywords: seedKeywords.slice(0, 5),
            priority: 'medium',
          });
        }
      }
    }

    if (opportunities.length > 0) {
      logger.info(`Series opportunities for ${nicheId}: ${opportunities.length} potential series`);
    }

    return opportunities.sort((a, b) => (a.priority === 'high' ? -1 : 1) - (b.priority === 'high' ? -1 : 1));
  }

  /**
   * Get topical map coverage: how many topics from the ideal topic universe are covered.
   * Returns covered/uncovered topics from NICHE_TOPICAL_MAP for strategic planning.
   */
  getTopicalMapCoverage(nicheId: string): {
    nicheId: string;
    totalTopics: number;
    coveredTopics: string[];
    uncoveredTopics: string[];
    coveragePct: number;
  } | null {
    const nicheCategory = nicheId.split('-').slice(0, 2).join('-');
    const topicalMap = NICHE_TOPICAL_MAP[nicheCategory];
    if (!topicalMap) return null;

    const cluster = this.clusters.get(nicheId);
    const coveredKeywords = cluster?.posts
      .filter(p => p.keyword)
      .map(p => p.keyword!.toLowerCase()) || [];
    const coveredTitles = cluster?.posts.map(p => p.title.toLowerCase()) || [];

    const covered: string[] = [];
    const uncovered: string[] = [];

    for (const topic of topicalMap) {
      const topicLower = topic.toLowerCase();
      const topicWords = topicLower.split(/\s+/).filter(w => w.length > 3);
      const isCovered = coveredKeywords.some(kw => {
        const matchedWords = topicWords.filter(tw => kw.includes(tw));
        return matchedWords.length >= Math.min(2, topicWords.length);
      }) || coveredTitles.some(t => {
        const matchedWords = topicWords.filter(tw => t.includes(tw));
        return matchedWords.length >= Math.min(2, topicWords.length);
      });

      if (isCovered) {
        covered.push(topic);
      } else {
        uncovered.push(topic);
      }
    }

    return {
      nicheId,
      totalTopics: topicalMap.length,
      coveredTopics: covered,
      uncoveredTopics: uncovered,
      coveragePct: topicalMap.length > 0 ? Math.round((covered.length / topicalMap.length) * 100) : 0,
    };
  }

  /** Identify content gaps based on common topic patterns per niche */
  private identifyContentGaps(nicheId: string, coveredKeywords: string[]): string[] {
    // Common topic patterns that should exist per niche category
    const topicTemplates: Record<string, string[]> = {
      'k-entertainment': ['beginner guide', 'history', 'industry economics', 'global impact', 'fan culture'],
      'k-beauty': ['beginner guide', 'product comparison', 'ingredient analysis', 'skincare routine', 'market overview'],
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

  /**
   * Competitor gap analysis: identify high-impression queries where we rank poorly.
   * Uses GSC striking distance + top queries to find content opportunities.
   * Returns prioritized list of topics to create or strengthen.
   */
  analyzeCompetitorGaps(
    strikingDistance: Array<{ query: string; position: number; impressions: number; clicks: number; ctr: number }>,
    topQueries: Array<{ query: string; impressions: number; clicks: number; position: number; ctr: number }>,
    existingPosts: ExistingPost[],
  ): Array<{ query: string; opportunity: 'create' | 'strengthen'; priority: 'high' | 'medium' | 'low'; reason: string; estimatedTraffic: number }> {
    const gaps: Array<{ query: string; opportunity: 'create' | 'strengthen'; priority: 'high' | 'medium' | 'low'; reason: string; estimatedTraffic: number }> = [];
    const existingKeywords = new Set(existingPosts.map(p => p.keyword?.toLowerCase()).filter(Boolean));
    const existingTitles = existingPosts.map(p => p.title.toLowerCase());

    // 1. High-impression queries where we rank 8-20 (page 1-2 border) — strengthen existing
    for (const sd of strikingDistance) {
      if (sd.impressions < 50) continue;
      const queryLower = sd.query.toLowerCase();

      // Check if we have a dedicated post for this query
      const hasPost = existingKeywords.has(queryLower) ||
        existingTitles.some(t => queryLower.split(' ').filter(w => w.length > 3).every(w => t.includes(w)));

      const estimatedTraffic = Math.round(sd.impressions * 0.08); // ~8% CTR if we reach top 3

      if (hasPost) {
        gaps.push({
          query: sd.query,
          opportunity: 'strengthen',
          priority: sd.position <= 10 ? 'high' : 'medium',
          reason: `Ranking pos ${sd.position.toFixed(1)} with ${sd.impressions} imp — update content to push to top 3`,
          estimatedTraffic,
        });
      } else {
        gaps.push({
          query: sd.query,
          opportunity: 'create',
          priority: sd.impressions > 200 ? 'high' : 'medium',
          reason: `${sd.impressions} impressions but no dedicated post — create targeted content`,
          estimatedTraffic,
        });
      }
    }

    // 2. Top queries with high impressions but very low CTR — title/content mismatch
    for (const tq of topQueries) {
      if (tq.impressions < 100 || tq.ctr > 0.03) continue;
      const alreadyListed = gaps.some(g => g.query.toLowerCase() === tq.query.toLowerCase());
      if (alreadyListed) continue;

      gaps.push({
        query: tq.query,
        opportunity: 'strengthen',
        priority: tq.impressions > 500 ? 'high' : 'medium',
        reason: `${tq.impressions} impressions, ${(tq.ctr * 100).toFixed(1)}% CTR — likely title/meta mismatch with search intent`,
        estimatedTraffic: Math.round(tq.impressions * 0.05),
      });
    }

    // Sort by estimated traffic (highest first)
    gaps.sort((a, b) => b.estimatedTraffic - a.estimatedTraffic);

    // Log summary
    if (gaps.length > 0) {
      const createCount = gaps.filter(g => g.opportunity === 'create').length;
      const strengthenCount = gaps.filter(g => g.opportunity === 'strengthen').length;
      const highCount = gaps.filter(g => g.priority === 'high').length;
      logger.info(`=== Competitor Gap Analysis ===`);
      logger.info(`Found ${gaps.length} opportunities: ${createCount} create, ${strengthenCount} strengthen (${highCount} high priority)`);
      for (const gap of gaps.slice(0, 8)) {
        logger.info(`  [${gap.priority.toUpperCase()}] ${gap.opportunity}: "${gap.query}" — ${gap.reason} (~${gap.estimatedTraffic} monthly clicks)`);
      }
    }

    return gaps.slice(0, 20);
  }

  /**
   * Pillar→satellite content sequencing strategy.
   * Determines whether a niche should create a pillar page first (if none exists),
   * or continue with satellite content linking back to the pillar.
   * Returns publishing priority guidance for each niche.
   */
  getPillarSequencingAdvice(
    nicheId: string,
    existingPosts: ExistingPost[],
    pillarUrlMap: Record<string, string>,
    pillarTopics?: string[],
  ): { shouldCreatePillar: boolean; pillarExists: boolean; satelliteCount: number; advice: string } {
    const cluster = this.clusters.get(nicheId);
    const nichePosts = cluster?.posts || [];
    const pillarUrl = pillarUrlMap[nicheId];

    // Check if pillar page exists
    const pillarExists = existingPosts.some(p =>
      p.url === pillarUrl || p.slug?.startsWith(`guide-${nicheId}`),
    );

    const satelliteCount = nichePosts.length;

    // Strategy: Pillar first, then satellites
    if (!pillarExists && satelliteCount >= 3) {
      const topicHint = pillarTopics?.length ? ` — suggested pillar topics: ${pillarTopics.slice(0, 2).join(', ')}` : '';
      return {
        shouldCreatePillar: true,
        pillarExists: false,
        satelliteCount,
        advice: `Create pillar page for ${nicheId} — ${satelliteCount} satellite posts exist without a hub page${topicHint}`,
      };
    }

    if (pillarExists && satelliteCount < 5) {
      return {
        shouldCreatePillar: false,
        pillarExists: true,
        satelliteCount,
        advice: `Prioritize satellite content for ${nicheId} — pillar exists but only ${satelliteCount} supporting posts`,
      };
    }

    // Check sub-topic coverage for gap-aware sequencing
    if (cluster) {
      const highPriorityGaps = cluster.scoredGaps.filter(g => g.priority === 'high');
      if (highPriorityGaps.length > 0) {
        return {
          shouldCreatePillar: false,
          pillarExists,
          satelliteCount,
          advice: `Fill content gaps for ${nicheId}: ${highPriorityGaps.map(g => g.topic).join(', ')}`,
        };
      }
    }

    return {
      shouldCreatePillar: false,
      pillarExists,
      satelliteCount,
      advice: `${nicheId} cluster is healthy (${satelliteCount} posts, pillar ${pillarExists ? 'exists' : 'missing'})`,
    };
  }
}
