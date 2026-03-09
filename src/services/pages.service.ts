import axios, { type AxiosInstance } from 'axios';
import { logger } from '../utils/logger.js';
import type { ExistingPost, NicheConfig } from '../types/index.js';

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

  async ensureRequiredPages(siteName: string, siteOwner: string, contactEmail: string, authorLinks?: { linkedin?: string; twitter?: string }): Promise<void> {
    const pages = this.buildPageConfigs(siteName, siteOwner, contactEmail, authorLinks);

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

  private buildPageConfigs(siteName: string, siteOwner: string, contactEmail: string, authorLinks?: { linkedin?: string; twitter?: string }): PageConfig[] {
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
        content: this.buildAboutPage(siteName, ownerDisplay, authorLinks),
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

  private buildAboutPage(siteName: string, owner: string, authorLinks?: { linkedin?: string; twitter?: string }): string {
    // Build Person schema.org JSON-LD for author E-E-A-T
    const sameAs = [authorLinks?.linkedin, authorLinks?.twitter].filter(Boolean);
    const personJsonLd = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'Person',
      name: owner,
      jobTitle: 'Korea Market & Trends Analyst',
      description: `${owner} is a Korea-focused analyst covering Korean technology, entertainment, and financial markets for an international audience.`,
      knowsAbout: ['Korean technology', 'K-pop industry', 'Korean stock market', 'KOSPI', 'South Korean economy', 'Korean startups', 'K-drama', 'Korean food culture'],
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
<p style="${S.p}"><strong itemprop="name">${owner}</strong> is a <span itemprop="jobTitle">Korea Market & Trends Analyst</span> specializing in Korean technology, K-entertainment business models, and KOSPI/KOSDAQ investment analysis. With deep knowledge of Korean-language sources and institutional data (BOK, DART, KRX), ${owner} bridges the gap between Korean media and global readers seeking actionable insights.</p>
<meta itemprop="knowsLanguage" content="English" />
<meta itemprop="knowsLanguage" content="Korean" />
${authorLinks?.linkedin ? `<p style="margin:0 0 8px 0;"><a href="${authorLinks.linkedin}" target="_blank" rel="noopener noreferrer" itemprop="sameAs" style="color:#0066FF; text-decoration:none;">LinkedIn Profile</a></p>` : ''}
${authorLinks?.twitter ? `<p style="margin:0;"><a href="${authorLinks.twitter}" target="_blank" rel="noopener noreferrer" itemprop="sameAs" style="color:#0066FF; text-decoration:none;">X (Twitter) Profile</a></p>` : ''}
</div>

<h3 style="${S.h3}">Editorial Standards</h3>
<ul style="${S.ul}">
<li>All analysis is grounded in Korean-language primary sources and official institutional data</li>
<li>Market data is verified against KRX, DART filings, and BOK publications</li>
<li>Content is reviewed for accuracy before publication</li>
<li>We clearly distinguish between factual reporting and analytical commentary</li>
</ul>

<div style="${S.highlightBox}">
<p style="margin:0; line-height:1.7; color:#555;">We welcome feedback, tips, and collaboration inquiries from readers, journalists, and industry professionals. Reach us through our <a href="/contact" style="color:#0066FF; text-decoration:none;">Contact page</a>.</p>
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
   */
  async ensurePillarPages(
    niches: NicheConfig[],
    existingPosts: ExistingPost[],
    siteName: string,
  ): Promise<void> {
    for (const niche of niches) {
      const slug = `guide-${niche.id}`;
      const nichePosts = existingPosts.filter(
        p => p.category.toLowerCase() === niche.category.toLowerCase(),
      );

      if (nichePosts.length < 3) {
        logger.debug(`Skipping pillar page for "${niche.name}" — only ${nichePosts.length} posts (need 3+)`);
        continue;
      }

      const title = `Complete Guide to ${niche.category}: Everything You Need to Know`;
      const content = this.buildPillarPageContent(niche, nichePosts, siteName);

      try {
        const existingId = await this.getPageId(slug);
        if (existingId) {
          await this.api.post(`/pages/${existingId}`, {
            title,
            content,
            status: 'publish',
          });
          logger.info(`Pillar page updated: "${title}" (/${slug}) — ${nichePosts.length} linked posts`);
        } else {
          await this.api.post('/pages', {
            title,
            slug,
            content,
            status: 'publish',
          });
          logger.info(`Pillar page created: "${title}" (/${slug}) — ${nichePosts.length} linked posts`);
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
    const nicheDescriptions: Record<string, string> = {
      'Korean Tech': 'the latest developments in Korean technology, from Samsung and Naver to Pangyo startups and AI innovation',
      'K-Entertainment': 'the business side of K-pop, K-drama, and the global Hallyu wave — including agency strategies, revenue models, and market analysis',
      'Korean Finance': 'Korean stock markets (KOSPI/KOSDAQ), investment strategies, BOK monetary policy, and financial opportunities for international investors',
      'Korean Food': 'authentic Korean cuisine, from street food guides to home cooking recipes, with neighborhood recommendations and cultural context',
      'Korea Travel': 'practical travel and living guides for South Korea, including transportation, costs, apps, and insider tips',
      'Korean Language': 'learning Korean effectively — from Hangul basics to TOPIK preparation, with recommended apps, schools, and study strategies',
    };

    const description = nicheDescriptions[niche.category] || `everything about ${niche.category}`;

    const postCards = posts
      .slice(0, 20)
      .map(p => {
        const shortTitle = p.title.length > 70 ? p.title.slice(0, 67) + '...' : p.title;
        return `<a href="${p.url}" style="display:block; padding:16px 20px; margin:0 0 10px 0; background:#fff; border:1px solid #e5e7eb; border-radius:8px; text-decoration:none; transition:box-shadow 0.2s;">
<p style="margin:0; font-size:15px; font-weight:600; color:#222; line-height:1.4;">${this.escapeHtml(shortTitle)}</p></a>`;
      })
      .join('\n');

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

    return `${jsonLdScript}<div style="${S.wrapper}">
<p style="${S.p}">Welcome to ${siteName}'s comprehensive guide to ${description}. This page serves as your central hub — bookmark it and explore the topics that interest you most.</p>

<div style="${S.infoBox}">
<p style="margin:0; font-size:15px; color:#555; line-height:1.6;">This guide is continuously updated as we publish new content. Currently featuring <strong>${posts.length} articles</strong> covering ${niche.category}. Last updated: ${new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}.</p>
</div>

<h2 style="${S.h2}">All ${niche.category} Articles</h2>
${postCards}

<h2 style="${S.h2}">About This Guide</h2>
<p style="${S.p}">Each article in this collection is researched using Korean-language primary sources and institutional data. We cover ${niche.category} from a global perspective, making Korean expertise accessible to English-speaking readers worldwide.</p>

<div style="${S.highlightBox}">
<p style="margin:0; line-height:1.7; color:#555;">Looking for something specific? Use the search bar above or <a href="/contact" style="color:#0066FF; text-decoration:none;">contact us</a> to suggest a topic.</p>
</div>

<p style="margin:40px 0 0 0; padding-top:20px; border-top:1px solid #eee; font-size:13px; color:#999; line-height:1.6;">This guide is updated regularly with the latest ${niche.category} content for ${year}.</p>
</div>`;
  }

  private escapeHtml(text: string): string {
    return text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  private buildDisclaimerPage(siteName: string): string {
    const effectiveDate = `${new Date().toLocaleString('en-US', { month: 'long' })} ${new Date().getDate()}, ${new Date().getFullYear()}`;

    return `<div style="${S.wrapper}">
<h2 style="${S.h2}">Disclaimer</h2>

<h3 style="${S.h3}">1. Content Notice</h3>
<p style="${S.p}">The content published on ${siteName} is based on trending information and publicly available Korean-language sources, produced with the assistance of AI technology. All content is created for informational purposes only and does not constitute professional financial, investment, or legal advice.</p>

<h3 style="${S.h3}">2. Accuracy of Information</h3>
<p style="${S.p}">While we strive to provide accurate information sourced from reputable Korean institutions and media, we do not guarantee the completeness, accuracy, or reliability of our content. Any decisions or actions taken based on the information provided are at your own risk.</p>

<h3 style="${S.h3}">3. Not Investment Advice</h3>
<p style="${S.p}">Content discussing Korean stocks, markets, or financial instruments is for informational and educational purposes only. It does not constitute investment advice, and readers should consult a qualified financial advisor before making investment decisions.</p>

<h3 style="${S.h3}">4. External Links</h3>
<p style="${S.p}">External links on this Site are provided for reference purposes only. ${siteName} is not responsible for the content of external websites.</p>

<h3 style="${S.h3}">5. Advertising</h3>
<p style="${S.p}">${siteName} displays advertisements through third-party services such as Google AdSense. Advertisements do not reflect ${siteName}'s opinions or endorsements. Responsibility for advertised products and services lies with the respective advertisers.</p>

<h3 style="${S.h3}">6. Copyright</h3>
<p style="${S.p}">All content on this Site is protected by copyright law. Unauthorized reproduction, distribution, or modification is prohibited. Please credit the source when quoting.</p>

<p style="${S.footer}">Effective date: ${effectiveDate}</p>
</div>`;
  }
}
