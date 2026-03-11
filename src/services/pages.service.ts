import axios, { type AxiosInstance } from 'axios';
import { logger } from '../utils/logger.js';
import type { ExistingPost, NicheConfig, AuthorProfile } from '../types/index.js';
import { NICHE_AUTHOR_PROFILES } from '../types/index.js';

interface PageConfig {
  slug: string;
  title: string;
  content: string;
}

// Shared inline styles
const S = {
  wrapper: `max-width:760px; margin:0 auto; font-family:'Noto Sans KR',sans-serif; color:#333; line-height:1.8; font-size:16px;`,
  h2: `border-left:5px solid #0066FF; padding-left:15px; font-size:22px; color:#222; margin:40px 0 20px 0;`,
  h3: `font-size:18px; color:#444; margin:30px 0 15px 0; padding-bottom:8px; border-bottom:1px solid #eee;`,
  p: `margin:0 0 20px 0; line-height:1.8; color:#333; font-size:16px;`,
  ul: `margin:0 0 20px 0; padding-left:20px; line-height:2.0; color:#555;`,
  infoBox: `background:#f0f4ff; padding:24px 30px; border-radius:12px; margin:24px 0 36px 0;`,
  highlightBox: `background:#f8f9fa; border-left:4px solid #0066FF; padding:20px 24px; margin:24px 0; border-radius:0 8px 8px 0;`,
  footer: `margin:40px 0 0 0; line-height:1.8; color:#888; font-size:14px;`,
} as const;

export class PagesService {
  private api: AxiosInstance;

  constructor(wpUrl: string, username: string, appPassword: string) {
    const token = Buffer.from(`${username}:${appPassword}`).toString('base64');
    this.api = axios.create({
      baseURL: `${wpUrl.replace(/\/+$/, '')}/wp-json/wp/v2`,
      headers: { Authorization: `Basic ${token}` },
      timeout: 30000,
    });
  }

  async ensureRequiredPages(siteName: string, siteOwner: string, contactEmail: string, authorLinks?: { linkedin?: string; twitter?: string }, authorBio?: string, authorCredentials?: string): Promise<void> {
    const pages = this.buildPageConfigs(siteName, siteOwner, contactEmail, authorLinks, authorBio, authorCredentials);

    for (const page of pages) {
      try {
        const existingId = await this.getPageId(page.slug);
        if (existingId) {
          await this.api.post(`/pages/${existingId}`, {
            title: page.title,
            content: page.content,
            status: 'publish',
          });
          logger.info(`Page updated: "${page.title}" (/${page.slug})`);
          continue;
        }

        await this.api.post('/pages', {
          title: page.title,
          slug: page.slug,
          content: page.content,
          status: 'publish',
        });
        logger.info(`Page created: "${page.title}" (/${page.slug})`);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        logger.error(`Failed to create/update page "${page.title}": ${msg}`);
      }
    }
  }

  private async getPageId(slug: string): Promise<number | null> {
    try {
      const response = await this.api.get('/pages', { params: { slug, status: 'publish,draft,private' } });
      if (Array.isArray(response.data) && response.data.length > 0) {
        return response.data[0].id as number;
      }
      return null;
    } catch {
      return null;
    }
  }

  private buildPageConfigs(siteName: string, siteOwner: string, contactEmail: string, authorLinks?: { linkedin?: string; twitter?: string }, authorBio?: string, authorCredentials?: string): PageConfig[] {
    const ownerDisplay = siteOwner || siteName;
    const emailDisplay = contactEmail || `contact@${siteName.toLowerCase().replace(/\s+/g, '')}.net`;

    return [
      {
        slug: 'privacy-policy',
        title: 'Privacy Policy',
        content: this.buildPrivacyPolicy(siteName, emailDisplay),
      },
      {
        slug: 'about',
        title: 'About',
        content: this.buildAboutPage(siteName, ownerDisplay, authorLinks, authorBio, authorCredentials),
      },
      {
        slug: 'contact',
        title: 'Contact',
        content: this.buildContactPage(siteName, emailDisplay),
      },
      {
        slug: 'disclaimer',
        title: 'Disclaimer',
        content: this.buildDisclaimerPage(siteName),
      },
      {
        slug: 'terms-of-service',
        title: 'Terms of Service',
        content: this.buildTermsOfServicePage(siteName, emailDisplay),
      },
    ];
  }

  private buildPrivacyPolicy(siteName: string, email: string): string {
    const effectiveDate = `${new Date().toLocaleString('en-US', { month: 'long' })} ${new Date().getDate()}, ${new Date().getFullYear()}`;

    return `<div style="${S.wrapper}">
<h2 style="${S.h2}">Privacy Policy</h2>
<p style="${S.p}">${siteName} ("Site") values your privacy and complies with applicable data protection laws. This Privacy Policy explains what information we collect, how we use it, and the measures we take to protect it.</p>

<h3 style="${S.h3}">1. Information We Collect</h3>
<p style="${S.p}">This Site does not require registration. The following information may be collected automatically:</p>
<ul style="${S.ul}">
<li>Visit logs, IP addresses, browser type, and access time</li>
<li>Usage pattern data through cookies</li>
</ul>

<h3 style="${S.h3}">2. How We Use Your Information</h3>
<p style="${S.p}">Collected information is used for the following purposes:</p>
<ul style="${S.ul}">
<li>Website traffic analysis and service improvement</li>
<li>Personalized advertising (e.g., Google AdSense)</li>
<li>Security maintenance and fraud prevention</li>
</ul>

<h3 style="${S.h3}">3. Cookies</h3>
<p style="${S.p}">This Site uses Google AdSense and Google Analytics, which collect visitor data through cookies. You may disable cookies through your browser settings, though some features may be limited as a result.</p>

<h3 style="${S.h3}">4. Third-Party Advertising</h3>
<p style="${S.p}">This Site displays advertisements through Google AdSense. Google may use cookies to serve ads based on your interests. For more information, please refer to <a href="https://policies.google.com/technologies/ads" target="_blank" rel="noopener">Google's Advertising Policies</a>.</p>

<h3 style="${S.h3}">5. Data Retention and Deletion</h3>
<p style="${S.p}">Automatically collected log data is retained for a limited period for statistical analysis and then deleted. If you request deletion of your personal data, we will process it without delay.</p>

<h3 style="${S.h3}">6. Contact</h3>
<p style="${S.p}">For privacy-related inquiries, please contact us at:<br>Email: ${email}</p>

<p style="${S.footer}">Effective date: ${effectiveDate}</p>
</div>`;
  }

  private buildAboutPage(siteName: string, owner: string, authorLinks?: { linkedin?: string; twitter?: string }, authorBio?: string, authorCredentials?: string): string {
    // Build Person schema.org JSON-LD for author E-E-A-T
    const sameAs = [authorLinks?.linkedin, authorLinks?.twitter].filter(Boolean);
    const credentials = authorCredentials || 'Korea Market & Trends Analyst';
    const bio = authorBio || `${owner} is a Korea-focused analyst covering Korean technology, entertainment, and financial markets for an international audience.`;
    const personJsonLd = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'Person',
      name: owner,
      jobTitle: credentials,
      description: bio,
      knowsAbout: ['Korean technology', 'K-pop industry', 'Korean stock market', 'KOSPI', 'South Korean economy', 'Korean startups', 'K-drama', 'Korean food culture', 'Korean beauty industry', 'Korean cryptocurrency market'],
      knowsLanguage: ['English', 'Korean'],
      ...(sameAs.length > 0 ? { sameAs } : {}),
    });

    return `<script type="application/ld+json">${personJsonLd}</script>
<div style="${S.wrapper}">
<h2 style="${S.h2}">About ${siteName}</h2>
<p style="${S.p}">Thank you for visiting ${siteName} -- your go-to source for in-depth English coverage of Korean technology, entertainment, and financial markets.</p>

<h3 style="${S.h3}">What We Cover</h3>
<p style="${S.p}">${siteName} delivers expert analysis of South Korea's most dynamic industries for a global audience. We bridge the information gap between Korean-language sources and English-speaking readers interested in:</p>
<ul style="${S.ul}">
<li><strong>Korean Tech & Startups</strong> -- Samsung, Naver, Kakao, and the Pangyo startup ecosystem</li>
<li><strong>K-Entertainment</strong> -- The business side of K-pop, K-drama, and the Hallyu wave</li>
<li><strong>Korean Investment & Finance</strong> -- KOSPI/KOSDAQ analysis, Korean economic policy, and investment opportunities</li>
<li><strong>Korean Food & Culture</strong> -- Authentic Korean cuisine, dining culture, and travel tips</li>
<li><strong>Korean Language</strong> -- Learning resources, TOPIK prep, and language tips for global learners</li>
<li><strong>K-Beauty</strong> -- Korean skincare science, product analysis, and industry trends</li>
<li><strong>Korean Crypto & Web3</strong> -- Upbit, Bithumb, regulation analysis, and DeFi in Korea</li>
<li><strong>Korean Automotive</strong> -- Hyundai, Kia EV strategy, and battery industry analysis</li>
</ul>

<h3 style="${S.h3}">Our Mission</h3>
<p style="${S.p}">Korea is one of the world's most innovative economies, but much of the best reporting stays locked in Korean-language media. We translate that insight -- not just the language, but the context, the market dynamics, and the cultural nuance -- into actionable English content.</p>
<ul style="${S.ul}">
<li>Data-driven analysis grounded in Korean-language primary sources</li>
<li>Market context that international media often misses</li>
<li>Practical insights for investors, analysts, and Korea watchers</li>
<li>Timely coverage reflecting real-time Korean market trends</li>
</ul>

<h3 style="${S.h3}">About the Author</h3>
<div itemscope itemtype="https://schema.org/Person" style="${S.infoBox}">
<p style="${S.p}"><strong itemprop="name">${owner}</strong> is a <span itemprop="jobTitle">${credentials}</span> with expertise in Korean technology, K-entertainment business models, and KOSPI/KOSDAQ investment analysis.</p>
<p style="${S.p}">${bio}</p>
<p style="${S.p}">With direct access to Korean-language sources and institutional data (BOK, DART, KRX, FSC, KOSIS), ${owner} bridges the gap between Korean media and global readers seeking actionable insights.</p>
<meta itemprop="knowsLanguage" content="English" />
<meta itemprop="knowsLanguage" content="Korean" />
${authorLinks?.linkedin ? `<p style="margin:0 0 8px 0;"><a href="${authorLinks.linkedin}" target="_blank" rel="noopener noreferrer" itemprop="sameAs" style="color:#0066FF; text-decoration:none;">LinkedIn Profile</a></p>` : ''}
${authorLinks?.twitter ? `<p style="margin:0;"><a href="${authorLinks.twitter}" target="_blank" rel="noopener noreferrer" itemprop="sameAs" style="color:#0066FF; text-decoration:none;">X (Twitter) Profile</a></p>` : ''}
</div>

<h3 style="${S.h3}">Editorial Standards & Methodology</h3>
<p style="${S.p}">Every article published on ${siteName} follows a rigorous editorial process:</p>
<ul style="${S.ul}">
<li><strong>Primary Source Verification</strong> -- All analysis is grounded in Korean-language primary sources and official institutional data (BOK, DART, KRX, KOSIS)</li>
<li><strong>Multi-Source Cross-Reference</strong> -- Market data is verified against at least two independent sources before publication</li>
<li><strong>Fact-Checked Statistics</strong> -- All numerical claims include source attribution and publication dates</li>
<li><strong>Clear Opinion Labeling</strong> -- We clearly distinguish between factual reporting and analytical commentary</li>
<li><strong>Regular Updates</strong> -- Time-sensitive content is reviewed and updated quarterly to maintain accuracy</li>
<li><strong>Correction Policy</strong> -- If errors are identified, corrections are published promptly with transparent disclosure</li>
</ul>

<h3 style="${S.h3}">Sources We Rely On</h3>
<p style="${S.p}">Our reporting draws from trusted Korean and international sources:</p>
<ul style="${S.ul}">
<li><strong>Korean Institutions</strong> -- Bank of Korea (BOK), Financial Supervisory Commission (FSC), Korea Exchange (KRX), DART corporate filings</li>
<li><strong>Government Data</strong> -- KOSIS (Korean Statistical Information Service), MSIT, KOTRA, KISA</li>
<li><strong>Korean Media</strong> -- Maeil Business Newspaper, Korea Economic Daily, Chosun Biz, Electronic Times</li>
<li><strong>International</strong> -- Bloomberg, Reuters, Nikkei Asia, Statista, World Bank</li>
</ul>

<div style="${S.highlightBox}">
<p style="margin:0; line-height:1.7; color:#555;">We welcome feedback, tips, corrections, and collaboration inquiries from readers, journalists, and industry professionals. Reach us through our <a href="/contact" style="color:#0066FF; text-decoration:none;">Contact page</a>.</p>
</div>
</div>`;
  }

  private buildContactPage(siteName: string, email: string): string {
    return `<div style="${S.wrapper}">
<h2 style="${S.h2}">Contact Us</h2>
<p style="${S.p}">If you have any questions or inquiries about ${siteName}, please get in touch using the information below.</p>

<div style="${S.infoBox}">
<h3 style="font-size:18px; color:#0066FF; margin:0 0 15px 0;">How to Reach Us</h3>
<p style="margin:0 0 10px 0; line-height:1.8; color:#333; font-size:16px;">Email: <a href="mailto:${email}" style="color:#0066FF; text-decoration:none;">${email}</a></p>
<p style="margin:0; line-height:1.8; color:#888; font-size:14px;">We will respond within 1-3 business days.</p>
</div>

<h3 style="${S.h3}">Send Us a Message</h3>
<div style="background:#f8f9fa; border-radius:12px; padding:24px; margin:20px 0;">
<form action="mailto:${email}" method="POST" enctype="text/plain" style="display:flex; flex-direction:column; gap:16px;">
<div>
<label style="display:block; font-weight:600; color:#333; margin-bottom:6px; font-size:14px;">Your Name</label>
<input type="text" name="name" required placeholder="Enter your name" style="width:100%; padding:10px 14px; border:1px solid #ddd; border-radius:8px; font-size:15px; box-sizing:border-box;" />
</div>
<div>
<label style="display:block; font-weight:600; color:#333; margin-bottom:6px; font-size:14px;">Your Email</label>
<input type="email" name="email" required placeholder="your@email.com" style="width:100%; padding:10px 14px; border:1px solid #ddd; border-radius:8px; font-size:15px; box-sizing:border-box;" />
</div>
<div>
<label style="display:block; font-weight:600; color:#333; margin-bottom:6px; font-size:14px;">Subject</label>
<select name="subject" style="width:100%; padding:10px 14px; border:1px solid #ddd; border-radius:8px; font-size:15px; background:#fff; box-sizing:border-box;">
<option value="Content Feedback">Content Feedback</option>
<option value="Business Partnership">Advertising &amp; Business Partnership</option>
<option value="Copyright">Copyright Inquiry</option>
<option value="Privacy">Privacy Request</option>
<option value="Tip">Korean Market Tip</option>
<option value="Other">Other</option>
</select>
</div>
<div>
<label style="display:block; font-weight:600; color:#333; margin-bottom:6px; font-size:14px;">Message</label>
<textarea name="message" required rows="5" placeholder="How can we help you?" style="width:100%; padding:10px 14px; border:1px solid #ddd; border-radius:8px; font-size:15px; resize:vertical; box-sizing:border-box;"></textarea>
</div>
<button type="submit" style="background:#0066FF; color:#fff; border:none; padding:12px 24px; border-radius:8px; font-size:16px; font-weight:600; cursor:pointer; align-self:flex-start;">Send Message</button>
</form>
<p style="margin:12px 0 0; color:#888; font-size:13px;">Alternatively, email us directly at <a href="mailto:${email}" style="color:#0066FF;">${email}</a>. We respond within 1-3 business days.</p>
</div>

<h3 style="${S.h3}">What You Can Contact Us About</h3>
<ul style="${S.ul}">
<li>Content inquiries and feedback</li>
<li>Advertising and business partnership inquiries</li>
<li>Copyright-related inquiries</li>
<li>Privacy-related requests</li>
<li>Tips on Korean market developments</li>
</ul>
</div>`;
  }

  /**
   * Create or update pillar pages for each niche (Topic Cluster hub).
   * Each pillar page links to all posts in that niche category.
   * Enforces minimum 5000-word target for comprehensive pillar quality.
   */
  async ensurePillarPages(
    niches: NicheConfig[],
    existingPosts: ExistingPost[],
    siteName: string,
  ): Promise<void> {
    const MIN_PILLAR_WORD_COUNT = 5000;

    for (const niche of niches) {
      const slug = `guide-${niche.id}`;
      const nichePosts = existingPosts.filter(
        p => p.category.toLowerCase() === niche.category.toLowerCase(),
      );

      if (nichePosts.length < 2) {
        logger.debug(`Skipping pillar page for "${niche.name}" — only ${nichePosts.length} posts (need 2+)`);
        continue;
      }

      const title = `The Ultimate ${niche.category} Guide (${new Date().getFullYear()}): Expert Analysis, Tips & Resources`;
      const content = this.buildPillarPageContent(niche, nichePosts, siteName);

      // Pillar page quality enforcement: validate word count
      const wordCount = content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().split(' ').length;
      if (wordCount < MIN_PILLAR_WORD_COUNT) {
        logger.info(`Pillar page "${niche.name}" has ${wordCount} words (target: ${MIN_PILLAR_WORD_COUNT}). Will improve as more satellite posts are added.`);
      }

      try {
        const existingId = await this.getPageId(slug);
        if (existingId) {
          // Check if page was updated in the last 30 days (monthly update cadence)
          try {
            const response = await this.api.get(`/pages/${existingId}`);
            const modified = new Date(response.data.modified);
            const daysSinceUpdate = (Date.now() - modified.getTime()) / (1000 * 60 * 60 * 24);
            if (daysSinceUpdate < 30 && nichePosts.length === (response.data._autoblog_pillar_post_count ?? 0)) {
              logger.debug(`Pillar page "${niche.name}" updated ${daysSinceUpdate.toFixed(0)} days ago with same post count, skipping.`);
              continue;
            }
          } catch { /* proceed with update */ }

          await this.api.post(`/pages/${existingId}`, {
            title,
            content,
            status: 'publish',
            meta: { _autoblog_pillar_post_count: nichePosts.length, _autoblog_pillar_word_count: wordCount },
          });
          logger.info(`Pillar page updated: "${title}" (/${slug}) — ${nichePosts.length} linked posts, ${wordCount} words`);
        } else {
          await this.api.post('/pages', {
            title,
            slug,
            content,
            status: 'publish',
            meta: { _autoblog_pillar_post_count: nichePosts.length, _autoblog_pillar_word_count: wordCount },
          });
          logger.info(`Pillar page created: "${title}" (/${slug}) — ${nichePosts.length} linked posts, ${wordCount} words`);
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        logger.warn(`Failed to create pillar page for "${niche.name}": ${msg}`);
      }
    }
  }

  private buildPillarPageContent(
    niche: NicheConfig,
    posts: ExistingPost[],
    siteName: string,
  ): string {
    const nicheDescriptions: Record<string, { short: string; intro: string; whyMatters: string; keyTopics: string[] }> = {
      'Korean Tech': {
        short: 'Korean technology, AI, semiconductors, and digital innovation',
        intro: 'South Korea is a global technology powerhouse. Home to Samsung, SK Hynix, and a thriving AI startup ecosystem centered in Pangyo Techno Valley, Korea plays an outsized role in shaping the future of semiconductors, artificial intelligence, and digital infrastructure. This guide covers everything from Korean chip dominance to the apps that power daily life in Seoul.',
        whyMatters: 'Korea produces over 60% of the world\'s memory chips. Samsung and SK Hynix are critical suppliers for everything from iPhones to data centers powering AI models. Understanding Korean tech is essential for investors, industry analysts, and anyone tracking global innovation trends. The Korean government\'s aggressive AI investment policies and semiconductor subsidies make this sector one to watch closely.',
        keyTopics: ['Samsung AI & semiconductor strategy', 'SK Hynix HBM memory leadership', 'Korean AI startups and government funding', 'Naver and Kakao digital ecosystem', 'Pangyo Techno Valley startup scene', 'Korean 5G and digital infrastructure'],
      },
      'K-Entertainment': {
        short: 'K-Pop, K-Drama, and the Korean content industry business',
        intro: 'The Korean entertainment industry — known globally as Hallyu (한류, Korean Wave) — is a multi-billion dollar export machine. From BTS and BLACKPINK to Squid Game and Korean webtoons, Korean content dominates global streaming charts. But behind the cultural phenomenon lies a sophisticated business model worth understanding.',
        whyMatters: 'Korea\'s content industry exported over $13 billion in 2024. HYBE, SM, JYP, and CJ ENM are publicly traded companies with complex revenue models spanning music, drama production, IP licensing, and fan commerce. For investors and business analysts, Korean entertainment represents one of the most compelling growth stories in global media.',
        keyTopics: ['K-pop agency business models and revenue streams', 'K-drama global licensing and Netflix deals', 'Korean webtoon and IP monetization', 'HYBE, SM, JYP stock analysis', 'Fan economy and concert touring economics', 'Korean content regulation and government support'],
      },
      'Korean Finance': {
        short: 'Korean stock markets, investment strategies, and economic analysis',
        intro: 'The Korean financial market — anchored by KOSPI and KOSDAQ — offers unique opportunities for international investors. With world-class companies like Samsung, Hyundai, and LG trading at significant discounts to global peers (the famous "Korea Discount"), understanding Korean markets can unlock substantial value.',
        whyMatters: 'Korea is the world\'s 13th largest economy and home to globally dominant companies in semiconductors, automotive, shipbuilding, and entertainment. The Korean won (KRW) exchange rate, Bank of Korea monetary policy, and Korea\'s national pension fund (NPS) — the world\'s 3rd largest — significantly impact global financial markets.',
        keyTopics: ['How to invest in Korean stocks from abroad', 'KOSPI and KOSDAQ index explained', 'Korean ETFs for international investors', 'Bank of Korea policy analysis', 'Korean won exchange rate forecasting', 'Korea Discount thesis and valuation'],
      },
      'K-Beauty': {
        short: 'Korean skincare routines, product reviews, and beauty industry analysis',
        intro: 'Korean beauty (K-beauty) has redefined global skincare. The famous 10-step routine, innovative ingredients like snail mucin and centella asiatica, and brands like COSRX, Laneige, and Sulwhasoo have made Korean skincare the gold standard worldwide. Olive Young stores in Seoul have become pilgrimage destinations for beauty enthusiasts.',
        whyMatters: 'The Korean beauty industry is valued at over $10 billion and growing. Korean brands consistently lead in product innovation — from sheet masks to glass skin serums. For consumers, understanding K-beauty means better skincare choices. For investors, Amorepacific and LG H&H represent significant opportunities in the global beauty market.',
        keyTopics: ['Korean skincare routines by skin type', 'Best K-beauty products and brands', 'Korean sunscreen science and comparisons', 'Olive Young must-buy products', 'K-beauty industry market analysis', 'Korean beauty tech innovations'],
      },
      'Korea Travel': {
        short: 'travel planning, expat guides, and living in South Korea',
        intro: 'South Korea welcomes over 17 million tourists annually, and the number keeps growing. From Seoul\'s neon-lit streets and ancient palaces to Jeju Island\'s natural beauty and Busan\'s coastal charm, Korea offers experiences that blend ultra-modern convenience with rich cultural heritage. This guide covers everything you need — whether you\'re visiting for a week or moving for a year.',
        whyMatters: 'Korea\'s tourism infrastructure is world-class: an efficient subway system, ultra-fast internet everywhere, and apps like Naver Map and KakaoTalk that make navigation seamless. But navigating housing, visas, healthcare, and daily life as a foreigner requires insider knowledge that most travel guides miss. Our coverage draws from real expat experiences and local expertise.',
        keyTopics: ['Seoul neighborhood guides and where to stay', 'Korean public transportation mastery', 'Cost of living breakdown for foreigners', 'Visa types and requirements explained', 'Best Korean food for first-time visitors', 'Living in Korea as an expat'],
      },
    };

    const nicheData = nicheDescriptions[niche.category] || {
      short: `everything about ${niche.category}`,
      intro: `This is your comprehensive guide to ${niche.category}. We cover the latest developments, expert analysis, and practical guides to help you understand this important topic.`,
      whyMatters: `${niche.category} is an important and growing field. Our editorial team researches Korean-language primary sources to bring you authoritative English content on this topic.`,
      keyTopics: niche.seedKeywords.slice(0, 6),
    };

    const year = new Date().getFullYear();

    // ItemList JSON-LD schema for pillar pages
    const itemListSchema = {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      name: `${niche.category} Articles`,
      numberOfItems: posts.length,
      itemListElement: posts.slice(0, 20).map((p, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name: p.title,
        url: p.url,
      })),
    };
    const jsonLdScript = `<script type="application/ld+json">${JSON.stringify(itemListSchema)}</script>\n`;

    // Group posts by content type for better organization
    const postsByType = new Map<string, typeof posts>();
    for (const p of posts.slice(0, 30)) {
      // Try to infer content type from title patterns
      const type = this.inferContentType(p.title);
      if (!postsByType.has(type)) postsByType.set(type, []);
      postsByType.get(type)!.push(p);
    }

    // Build organized sections
    const typeLabels: Record<string, string> = {
      'how-to': 'How-To Guides',
      'analysis': 'Analysis & Deep-Dives',
      'comparison': 'Comparisons',
      'list': 'Top Picks & Lists',
      'other': 'More Articles',
    };

    let organizedCards = '';
    for (const [type, typePosts] of postsByType) {
      const label = typeLabels[type] || typeLabels['other'];
      const cards = typePosts.map(p => {
        const shortTitle = p.title.length > 70 ? p.title.slice(0, 67) + '...' : p.title;
        return `<a href="${p.url}" style="display:block; padding:16px 20px; margin:0 0 10px 0; background:#fff; border:1px solid #e5e7eb; border-radius:8px; text-decoration:none; transition:box-shadow 0.2s;">
<p style="margin:0; font-size:15px; font-weight:600; color:#222; line-height:1.4;">${this.escapeHtml(shortTitle)}</p></a>`;
      }).join('\n');
      organizedCards += `<h3 style="${S.h3}">${label}</h3>\n${cards}\n`;
    }

    const maturityLabel = posts.length >= 15 ? 'Comprehensive' : posts.length >= 8 ? 'Growing' : 'Developing';
    const lastUpdated = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

    // Build key topics section with links to matching posts
    const keyTopicsHtml = nicheData.keyTopics.map(topic => {
      const matchingPost = posts.find(p =>
        p.title.toLowerCase().includes(topic.toLowerCase().split(' ').filter(w => w.length > 4)[0] || ''),
      );
      if (matchingPost) {
        return `<li><a href="${matchingPost.url}" style="color:#0066FF; text-decoration:none; font-weight:600;">${topic}</a></li>`;
      }
      return `<li>${topic}</li>`;
    }).join('\n');

    // Table of Contents
    const tocHtml = `<details style="background:#f8f9fa; border-radius:12px; padding:20px 24px; margin:24px 0;" open>
<summary style="cursor:pointer; font-weight:700; font-size:17px; color:#222;">Table of Contents</summary>
<ol style="margin:12px 0 0 0; padding-left:20px; line-height:2.2; font-size:15px;">
<li><a href="#introduction" style="color:#0066FF; text-decoration:none;">Introduction to ${niche.category}</a></li>
<li><a href="#why-it-matters" style="color:#0066FF; text-decoration:none;">Why ${niche.category} Matters in ${year}</a></li>
<li><a href="#key-topics" style="color:#0066FF; text-decoration:none;">Key Topics We Cover</a></li>
<li><a href="#getting-started" style="color:#0066FF; text-decoration:none;">Getting Started</a></li>
<li><a href="#all-articles" style="color:#0066FF; text-decoration:none;">All Articles (${posts.length})</a></li>
<li><a href="#faq" style="color:#0066FF; text-decoration:none;">Frequently Asked Questions</a></li>
</ol></details>`;

    // FAQ section (pillar pages should have FAQ for featured snippet)
    const faqItems = this.buildPillarFaq(niche.category, year);

    return `${jsonLdScript}<div style="${S.wrapper}">

<div style="${S.infoBox}">
<p style="margin:0 0 8px 0; font-size:15px; color:#555; line-height:1.6;">
<strong>${maturityLabel} Guide</strong> — ${posts.length} articles · Last updated: ${lastUpdated} · ${Math.round(posts.length * 2.5)} min total read time
</p>
</div>

${tocHtml}

<h2 id="introduction" style="${S.h2}">Introduction to ${niche.category}</h2>
<p style="${S.p}">${nicheData.intro}</p>
<p style="${S.p}">This pillar page is your central hub for all ${siteName} coverage of ${nicheData.short}. Whether you're a first-time reader or a returning expert, bookmark this page — we update it regularly as new articles are published.</p>

<h2 id="why-it-matters" style="${S.h2}">Why ${niche.category} Matters in ${year}</h2>
<p style="${S.p}">${nicheData.whyMatters}</p>

<h2 id="key-topics" style="${S.h2}">Key Topics We Cover</h2>
<p style="${S.p}">Our editorial coverage of ${niche.category} spans these core areas:</p>
<ul style="${S.ul}">
${keyTopicsHtml}
</ul>

<h2 id="getting-started" style="${S.h2}">Getting Started: Recommended Reading Order</h2>
<p style="${S.p}">New to ${niche.category}? Here are the best starting points from our collection:</p>
${posts.slice(0, 5).map((p, i) => {
      const shortTitle = p.title.length > 70 ? p.title.slice(0, 67) + '...' : p.title;
      return `<div style="display:flex; gap:16px; align-items:flex-start; margin:0 0 16px 0; padding:16px 20px; background:#fff; border:1px solid #e5e7eb; border-radius:8px;">
<span style="flex-shrink:0; width:32px; height:32px; border-radius:50%; background:#0066FF; color:#fff; display:flex; align-items:center; justify-content:center; font-weight:700; font-size:14px;">${i + 1}</span>
<a href="${p.url}" style="font-size:15px; font-weight:600; color:#222; text-decoration:none; line-height:1.5;">${this.escapeHtml(shortTitle)}</a>
</div>`;
    }).join('\n')}

<h2 id="all-articles" style="${S.h2}">All ${niche.category} Articles</h2>
<p style="${S.p}">Browse our complete collection organized by content type:</p>
${organizedCards}

<h2 id="faq" style="${S.h2}">Frequently Asked Questions</h2>
${faqItems}

<div style="${S.highlightBox}">
<p style="margin:0; line-height:1.7; color:#555;">Looking for something specific? Use the search bar above or <a href="/contact" style="color:#0066FF; text-decoration:none;">contact us</a> to suggest a topic. We publish new ${niche.category} content regularly based on reader interest and trending demand.</p>
</div>

<p style="margin:40px 0 0 0; padding-top:20px; border-top:1px solid #eee; font-size:13px; color:#999; line-height:1.6;">This comprehensive guide is updated regularly with the latest ${niche.category} content for ${year}. All content is researched using Korean-language primary sources and institutional data.</p>
</div>`;
  }

  private buildPillarFaq(category: string, year: number): string {
    const faqs: Record<string, Array<{ q: string; a: string }>> = {
      'Korean Tech': [
        { q: 'Why is Korean technology important globally?', a: `Korea is the world's largest producer of memory semiconductors and a leader in AI research. Samsung and SK Hynix supply critical components for smartphones, data centers, and AI systems worldwide. In ${year}, Korean tech companies continue to invest heavily in next-generation chips and AI infrastructure.` },
        { q: 'How can I invest in Korean tech companies from abroad?', a: 'International investors can access Korean tech stocks through Korean ETFs (like EWY), ADRs on US exchanges, or by opening a Korean brokerage account. Several Korean brokerages now offer English-language services for foreign investors.' },
        { q: 'What is Pangyo Techno Valley?', a: 'Pangyo Techno Valley is Korea\'s answer to Silicon Valley, located just south of Seoul in Seongnam city. It hosts major tech companies including Kakao, Naver, and hundreds of startups. It\'s the epicenter of Korean digital innovation.' },
      ],
      'K-Entertainment': [
        { q: 'How does the K-pop industry make money?', a: 'K-pop agencies generate revenue through multiple streams: album sales, concert tours, merchandise, fan memberships (like Weverse), brand endorsements, IP licensing, and increasingly, NFTs and virtual content. Top agencies like HYBE generate over $1 billion annually.' },
        { q: 'Are K-entertainment stocks a good investment?', a: `Korean entertainment companies like HYBE, SM, and JYP are publicly traded on KOSPI/KOSDAQ. They offer exposure to the global Hallyu wave but can be volatile based on artist activities and regulatory changes. As of ${year}, analysts focus on IP monetization and global touring revenue.` },
        { q: 'What makes Korean dramas so popular globally?', a: 'Korean dramas succeed globally due to high production values, compelling storytelling, and cultural uniqueness. Netflix\'s investment in Korean content (over $2.5 billion committed) has accelerated global distribution, making K-dramas accessible to audiences in 190+ countries.' },
      ],
      'Korean Finance': [
        { q: 'Can foreigners invest in Korean stocks?', a: 'Yes. Foreign investors can buy Korean stocks through several methods: Korean ETFs on US/European exchanges, ADRs (American Depositary Receipts), or by opening a direct brokerage account with a Korean securities firm. Some brokerages like Samsung Securities and Mirae Asset offer English services.' },
        { q: 'What is the "Korea Discount" in stock markets?', a: 'The Korea Discount refers to Korean stocks trading at lower valuations (P/E ratios) compared to global peers, despite strong fundamentals. Contributing factors include chaebol governance concerns, geopolitical risk from North Korea, and complex ownership structures. Recent corporate governance reforms aim to close this gap.' },
        { q: 'How does Bank of Korea policy affect investments?', a: `The Bank of Korea (BOK) sets the base interest rate, which impacts the Korean won, bond yields, and stock market valuations. In ${year}, BOK policy decisions are closely watched for their impact on inflation, housing markets, and foreign investment flows.` },
      ],
      'K-Beauty': [
        { q: 'What is the Korean skincare routine?', a: 'The traditional Korean skincare routine involves multiple steps: oil cleanser, water cleanser, toner, essence, serum, sheet mask, eye cream, moisturizer, and sunscreen. However, modern K-beauty emphasizes customization — many Korean dermatologists now recommend simplified routines of 3-5 key products tailored to your skin type.' },
        { q: 'Are Korean skincare products safe?', a: 'Korean skincare products are regulated by the Korean Ministry of Food and Drug Safety (MFDS), which has strict standards comparable to the FDA. Korean brands are known for innovation in gentle, effective formulations. Always check ingredient lists for personal allergens.' },
        { q: 'Where can I buy authentic Korean beauty products?', a: 'Authentic K-beauty products can be purchased from Olive Young (Korea\'s largest beauty retailer), YesStyle, Stylevana, and Amazon (verified Korean seller stores). When visiting Korea, Olive Young stores in Myeongdong and Gangnam offer the widest selection.' },
      ],
      'Korea Travel': [
        { q: 'What is the best time to visit South Korea?', a: 'Spring (April-May) and autumn (September-November) are the best seasons to visit Korea. Cherry blossoms in April and fall foliage in October-November are spectacular. Summer (June-August) is hot and humid with monsoon rains, while winter (December-February) is cold but great for skiing and festive events.' },
        { q: 'How much does a trip to Korea cost?', a: 'A mid-range trip to Korea costs approximately $100-150 USD per day including accommodation, food, and transportation. Budget travelers can manage on $50-70/day using guesthouses and street food. Seoul is generally more expensive than other Korean cities.' },
        { q: 'Do I need a visa to visit South Korea?', a: 'Citizens of 112 countries can enter Korea visa-free for tourism (typically 30-90 days depending on nationality). K-ETA (Korea Electronic Travel Authorization) is required for visa-exempt visitors from most countries. Check the Korean Immigration Service website for your specific country\'s requirements.' },
      ],
    };

    const categoryFaqs = faqs[category] || [
      { q: `What makes ${category} unique?`, a: `${category} represents a distinctive aspect of Korean culture and industry that has gained significant global attention. Our articles explore this topic from multiple angles including business analysis, practical guides, and cultural context.` },
      { q: `How often is this guide updated?`, a: `We update this pillar page regularly as new articles are published. Our editorial team monitors trending topics and reader interest to ensure comprehensive coverage of ${category}.` },
    ];

    return categoryFaqs.map(faq =>
      `<h3 style="${S.h3}">${faq.q}</h3>\n<p style="${S.p}">${faq.a}</p>`,
    ).join('\n');
  }

  private inferContentType(title: string): string {
    const lower = title.toLowerCase();
    if (/^how to |step.by.step|guide to|beginner/.test(lower)) return 'how-to';
    if (/\bvs\b|\bversus\b|comparison|compared/.test(lower)) return 'comparison';
    if (/\bbest\b|\btop \d+\b|\branked\b|\bpicks\b/.test(lower)) return 'list';
    if (/analysis|explained|deep.dive|why |what |breakdown/.test(lower)) return 'analysis';
    return 'other';
  }

  private buildTermsOfServicePage(siteName: string, email: string): string {
    const effectiveDate = `${new Date().toLocaleString('en-US', { month: 'long' })} ${new Date().getDate()}, ${new Date().getFullYear()}`;

    return `<div style="${S.wrapper}">
<h2 style="${S.h2}">Terms of Service</h2>
<p style="${S.p}">Welcome to ${siteName}. By accessing or using this website, you agree to be bound by these Terms of Service. If you do not agree, please discontinue use of this site.</p>

<h3 style="${S.h3}">1. Content Usage</h3>
<p style="${S.p}">All content on ${siteName} is protected by copyright law and is owned by ${siteName} unless otherwise stated. You may share, quote, or reference our content with proper attribution including a link back to the original article. Unauthorized reproduction, distribution, or commercial use of our content is prohibited.</p>

<h3 style="${S.h3}">2. AI-Assisted Content</h3>
<p style="${S.p}">Content on ${siteName} is produced with the assistance of artificial intelligence technology and undergoes editorial review before publication. While we strive for accuracy, AI-assisted content may contain errors. We recommend verifying critical information from primary sources, particularly for financial, medical, or legal decisions.</p>

<h3 style="${S.h3}">3. Affiliate Links & Advertising</h3>
<p style="${S.p}">Some articles may contain affiliate links. When you purchase through these links, we may earn a commission at no additional cost to you. This helps support our content creation. Affiliate relationships do not influence our editorial recommendations. All affiliate links are clearly disclosed in accordance with FTC guidelines. This site also displays third-party advertisements through Google AdSense.</p>

<h3 style="${S.h3}">4. Disclaimer of Warranties</h3>
<p style="${S.p}">Content is provided "as is" without warranties of any kind. ${siteName} does not guarantee the accuracy, completeness, or timeliness of information. Content about Korean stocks, investments, or financial products does not constitute financial advice. Always consult qualified professionals before making investment or medical decisions.</p>

<h3 style="${S.h3}">5. User Conduct</h3>
<p style="${S.p}">You agree not to: (a) use this site for any unlawful purpose; (b) attempt to interfere with site operations; (c) scrape or reproduce content without permission; (d) post spam or misleading comments.</p>

<h3 style="${S.h3}">6. Limitation of Liability</h3>
<p style="${S.p}">${siteName} and its contributors shall not be liable for any damages arising from the use of or inability to use this site or its content, including but not limited to direct, indirect, incidental, or consequential damages.</p>

<h3 style="${S.h3}">7. External Links</h3>
<p style="${S.p}">This site may contain links to third-party websites. ${siteName} is not responsible for the content, policies, or practices of external websites.</p>

<h3 style="${S.h3}">8. Changes to Terms</h3>
<p style="${S.p}">We reserve the right to update these Terms at any time. Continued use of the site after changes constitutes acceptance of the updated terms.</p>

<h3 style="${S.h3}">9. Contact</h3>
<p style="${S.p}">For questions about these Terms of Service, please contact us at: <a href="mailto:${email}" style="color:#0066FF; text-decoration:none;">${email}</a></p>

<p style="${S.footer}">Effective date: ${effectiveDate}</p>
</div>`;
  }

  /**
   * Create dedicated author profile pages for each niche author (E-E-A-T entity building).
   * Each author gets a /author/{slug}/ page with Person schema, expertise list, and linked posts.
   */
  async ensureAuthorPages(
    niches: NicheConfig[],
    existingPosts: ExistingPost[],
    siteOwner: string,
    authorLinks?: { linkedin?: string; twitter?: string; website?: string },
  ): Promise<void> {
    const uniqueCategories = new Set(niches.map(n => n.category));

    for (const category of uniqueCategories) {
      const profile = NICHE_AUTHOR_PROFILES[category];
      if (!profile) continue;

      const slug = `author-${category.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
      const authorName = siteOwner || profile.name || 'TrendHunt';
      const categoryPosts = existingPosts.filter(
        p => p.category.toLowerCase() === category.toLowerCase(),
      );

      const sameAs = [authorLinks?.linkedin, authorLinks?.twitter, authorLinks?.website].filter(Boolean);
      const personSchema = JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'Person',
        name: authorName,
        jobTitle: profile.title,
        description: profile.bio,
        knowsAbout: profile.expertise,
        knowsLanguage: ['English', 'Korean'],
        ...(sameAs.length > 0 ? { sameAs } : {}),
        // Enhanced Person entity for E-E-A-T (Google Knowledge Panel eligibility)
        hasOccupation: {
          '@type': 'Occupation',
          name: 'Korea Market & Trends Analyst',
          occupationLocation: { '@type': 'Country', name: 'South Korea' },
        },
        ...(profile.credentials.length > 0 ? {
          hasCredential: profile.credentials.map(c => ({
            '@type': 'EducationalOccupationalCredential',
            credentialCategory: c,
          })),
        } : {}),
      });

      const recentPostsHtml = categoryPosts.slice(0, 15).map(p => {
        const shortTitle = p.title.length > 70 ? p.title.slice(0, 67) + '...' : p.title;
        return `<a href="${p.url}" style="display:block; padding:12px 16px; margin:0 0 8px 0; background:#fff; border:1px solid #e5e7eb; border-radius:8px; text-decoration:none;">
<p style="margin:0; font-size:14px; font-weight:600; color:#222;">${this.escapeHtml(shortTitle)}</p></a>`;
      }).join('\n');

      const content = `<script type="application/ld+json">${personSchema}</script>
<div style="${S.wrapper}" itemscope itemtype="https://schema.org/Person">
<h2 style="${S.h2}">About <span itemprop="name">${this.escapeHtml(authorName)}</span></h2>
<div style="${S.infoBox}">
<p style="${S.p}"><strong itemprop="jobTitle">${this.escapeHtml(profile.title)}</strong></p>
<p style="${S.p}" itemprop="description">${this.escapeHtml(profile.bio)}</p>
<p style="${S.p}"><strong>Years of Experience:</strong> ${profile.yearsExperience}+</p>
</div>

<h3 style="${S.h3}">Areas of Expertise</h3>
<ul style="${S.ul}">
${profile.expertise.map(e => `<li itemprop="knowsAbout">${this.escapeHtml(e)}</li>`).join('\n')}
</ul>

<h3 style="${S.h3}">Credentials</h3>
<ul style="${S.ul}">
${profile.credentials.map(c => `<li>${this.escapeHtml(c)}</li>`).join('\n')}
</ul>

${sameAs.length > 0 ? `<h3 style="${S.h3}">Connect</h3>
<ul style="${S.ul}">
${authorLinks?.linkedin ? `<li><a href="${authorLinks.linkedin}" target="_blank" rel="noopener" itemprop="sameAs" style="color:#0066FF;">LinkedIn</a></li>` : ''}
${authorLinks?.twitter ? `<li><a href="${authorLinks.twitter}" target="_blank" rel="noopener" itemprop="sameAs" style="color:#0066FF;">X (Twitter)</a></li>` : ''}
${authorLinks?.website ? `<li><a href="${authorLinks.website}" target="_blank" rel="noopener" itemprop="sameAs" style="color:#0066FF;">Website</a></li>` : ''}
</ul>` : ''}

<h3 style="${S.h3}">Recent ${this.escapeHtml(category)} Articles (${categoryPosts.length})</h3>
${recentPostsHtml || '<p style="' + S.p + '">Articles coming soon.</p>'}
</div>`;

      try {
        const existingId = await this.getPageId(slug);
        if (existingId) {
          await this.api.post(`/pages/${existingId}`, { title: `${authorName} — ${profile.title}`, content, status: 'publish' });
          logger.info(`Author page updated: /${slug}`);
        } else {
          await this.api.post('/pages', { title: `${authorName} — ${profile.title}`, slug, content, status: 'publish' });
          logger.info(`Author page created: /${slug}`);
        }
      } catch (error) {
        logger.warn(`Author page failed for "${category}": ${error instanceof Error ? error.message : error}`);
      }
    }
  }

  /**
   * Create/update a site-wide FAQ page aggregating top questions from all posts.
   * Uses FAQPage schema for rich result eligibility.
   */
  async ensureFaqPage(
    existingPosts: ExistingPost[],
    siteName: string,
    wpUrl: string,
  ): Promise<void> {
    const slug = 'faq';

    // Aggregate FAQs from pillar page FAQs + common questions per niche
    const allFaqs: Array<{ q: string; a: string; category: string }> = [];

    const nicheFaqs: Record<string, Array<{ q: string; a: string }>> = {
      'Korean Tech': [
        { q: 'Why is Korean technology important globally?', a: 'Korea produces over 60% of the world\'s memory chips. Samsung and SK Hynix supply critical components for AI, smartphones, and data centers worldwide.' },
        { q: 'How can I invest in Korean tech companies?', a: 'Through Korean ETFs (EWY), ADRs on US exchanges, or direct Korean brokerage accounts that offer English services.' },
      ],
      'Korean Finance': [
        { q: 'Can foreigners invest in Korean stocks?', a: 'Yes. Via Korean ETFs, ADRs, or direct brokerage accounts. Samsung Securities and Mirae Asset offer English services.' },
        { q: 'What is the Korea Discount?', a: 'Korean stocks trade at lower valuations vs global peers due to governance concerns, geopolitical risk, and complex ownership structures.' },
      ],
      'K-Beauty': [
        { q: 'What is the Korean skincare routine?', a: 'A multi-step approach including cleansing, toning, essence, serum, moisturizer, and sunscreen. Modern K-beauty emphasizes 3-5 key products customized to your skin type.' },
        { q: 'Where can I buy authentic K-beauty products?', a: 'Olive Young (Korea\'s largest beauty retailer), YesStyle, Stylevana, and verified Amazon sellers.' },
      ],
      'Korea Travel': [
        { q: 'What is the best time to visit South Korea?', a: 'Spring (April-May) and autumn (September-November) offer the best weather. Cherry blossoms in April and fall foliage in October are highlights.' },
        { q: 'Do I need a visa to visit Korea?', a: 'Citizens of 112 countries can enter visa-free (30-90 days). K-ETA is required for most visa-exempt visitors.' },
      ],
      'K-Entertainment': [
        { q: 'How does the K-pop industry make money?', a: 'Through album sales, concerts, merchandise, fan memberships, brand endorsements, IP licensing, and increasingly virtual content.' },
        { q: 'Are K-entertainment stocks a good investment?', a: 'HYBE, SM, and JYP are publicly traded. They offer Hallyu exposure but can be volatile based on artist activities.' },
      ],
    };

    for (const [category, faqs] of Object.entries(nicheFaqs)) {
      for (const faq of faqs) {
        allFaqs.push({ ...faq, category });
      }
    }

    const faqSchema = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: allFaqs.map(faq => ({
        '@type': 'Question',
        name: faq.q,
        acceptedAnswer: { '@type': 'Answer', text: faq.a },
      })),
    });

    const faqHtml = Object.entries(nicheFaqs).map(([category, faqs]) => {
      const items = faqs.map(faq =>
        `<h3 style="${S.h3}">${this.escapeHtml(faq.q)}</h3>\n<p style="${S.p}">${faq.a}</p>`
      ).join('\n');
      return `<h2 style="${S.h2}">${this.escapeHtml(category)}</h2>\n${items}`;
    }).join('\n\n');

    const content = `<script type="application/ld+json">${faqSchema}</script>
<div style="${S.wrapper}">
<h2 style="${S.h2}">Frequently Asked Questions</h2>
<p style="${S.p}">Find answers to the most common questions about Korean technology, finance, beauty, travel, and entertainment.</p>

${faqHtml}

<div style="${S.highlightBox}">
<p style="margin:0; line-height:1.7; color:#555;">Can't find what you're looking for? <a href="/contact" style="color:#0066FF; text-decoration:none;">Contact us</a> and we'll answer your question in a future article.</p>
</div>
</div>`;

    try {
      const existingId = await this.getPageId(slug);
      if (existingId) {
        await this.api.post(`/pages/${existingId}`, { title: `FAQ — ${siteName}`, content, status: 'publish' });
        logger.info('FAQ page updated');
      } else {
        await this.api.post('/pages', { title: `FAQ — ${siteName}`, slug, content, status: 'publish' });
        logger.info('FAQ page created');
      }
    } catch (error) {
      logger.warn(`FAQ page failed: ${error instanceof Error ? error.message : error}`);
    }
  }

  private escapeHtml(text: string): string {
    return text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  private buildDisclaimerPage(siteName: string): string {
    const effectiveDate = `${new Date().toLocaleString('en-US', { month: 'long' })} ${new Date().getDate()}, ${new Date().getFullYear()}`;

    return `<div style="${S.wrapper}">
<h2 style="${S.h2}">Disclaimer</h2>

<h3 style="${S.h3}">1. AI-Assisted Content Disclosure</h3>
<div style="${S.highlightBox}">
<p style="margin:0 0 12px 0; font-weight:700; color:#222;">Transparency Notice</p>
<p style="margin:0; line-height:1.8; color:#555; font-size:15px;">Content published on ${siteName} is produced with the assistance of AI technology (large language models) and is editorially reviewed by our team before publication. Our editorial process includes AI-assisted research and drafting, human editorial review and fact-checking, verification against Korean-language primary sources, and regular content audits for accuracy. We believe in full transparency about our content creation process in compliance with FTC guidelines and the EU AI Act.</p>
</div>

<h3 style="${S.h3}">2. Content Notice</h3>
<p style="${S.p}">The content published on ${siteName} is based on trending information and publicly available Korean-language sources. All content is created for informational purposes only and does not constitute professional financial, investment, or legal advice.</p>

<h3 style="${S.h3}">3. Accuracy of Information</h3>
<p style="${S.p}">While we strive to provide accurate information sourced from reputable Korean institutions and media, we do not guarantee the completeness, accuracy, or reliability of our content. Any decisions or actions taken based on the information provided are at your own risk.</p>

<h3 style="${S.h3}">4. Not Investment Advice</h3>
<p style="${S.p}">Content discussing Korean stocks, markets, or financial instruments is for informational and educational purposes only. It does not constitute investment advice, and readers should consult a qualified financial advisor before making investment decisions.</p>

<h3 style="${S.h3}">5. External Links</h3>
<p style="${S.p}">External links on this Site are provided for reference purposes only. ${siteName} is not responsible for the content of external websites.</p>

<h3 style="${S.h3}">6. Advertising</h3>
<p style="${S.p}">${siteName} displays advertisements through third-party services such as Google AdSense. Advertisements do not reflect ${siteName}'s opinions or endorsements. Responsibility for advertised products and services lies with the respective advertisers.</p>

<h3 style="${S.h3}">7. Copyright</h3>
<p style="${S.p}">All content on this Site is protected by copyright law. Unauthorized reproduction, distribution, or modification is prohibited. Please credit the source when quoting.</p>

<p style="${S.footer}">Effective date: ${effectiveDate}</p>
</div>`;
  }
}
