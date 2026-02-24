import axios, { type AxiosInstance } from 'axios';
import { logger } from '../utils/logger.js';

interface PageConfig {
  slug: string;
  title: string;
  content: string;
}

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

  async ensureRequiredPages(siteName: string, siteOwner: string, contactEmail: string): Promise<void> {
    const pages = this.buildPageConfigs(siteName, siteOwner, contactEmail);

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

  private buildPageConfigs(siteName: string, siteOwner: string, contactEmail: string): PageConfig[] {
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
        content: this.buildAboutPage(siteName, ownerDisplay),
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
    return `<div style="max-width:760px; margin:0 auto; font-family:'Noto Sans KR',sans-serif; color:#333; line-height:1.8; font-size:16px;">

<h2 style="border-left:5px solid #0066FF; padding-left:15px; font-size:22px; color:#222; margin:40px 0 20px 0;">Privacy Policy</h2>

<p style="margin:0 0 20px 0; line-height:1.8; color:#333; font-size:16px;">
${siteName} ("Site") values your privacy and complies with applicable data protection laws.
This Privacy Policy explains what information we collect, how we use it, and the measures we take to protect it.
</p>

<h3 style="font-size:18px; color:#444; margin:30px 0 15px 0; padding-bottom:8px; border-bottom:1px solid #eee;">1. Information We Collect</h3>
<p style="margin:0 0 20px 0; line-height:1.8; color:#333; font-size:16px;">
This Site does not require registration. The following information may be collected automatically:
</p>
<ul style="margin:0 0 20px 0; padding-left:20px; line-height:2.0; color:#555;">
<li>Visit logs, IP addresses, browser type, and access time</li>
<li>Usage pattern data through cookies</li>
</ul>

<h3 style="font-size:18px; color:#444; margin:30px 0 15px 0; padding-bottom:8px; border-bottom:1px solid #eee;">2. How We Use Your Information</h3>
<p style="margin:0 0 20px 0; line-height:1.8; color:#333; font-size:16px;">
Collected information is used for the following purposes:
</p>
<ul style="margin:0 0 20px 0; padding-left:20px; line-height:2.0; color:#555;">
<li>Website traffic analysis and service improvement</li>
<li>Personalized advertising (e.g., Google AdSense)</li>
<li>Security maintenance and fraud prevention</li>
</ul>

<h3 style="font-size:18px; color:#444; margin:30px 0 15px 0; padding-bottom:8px; border-bottom:1px solid #eee;">3. Cookies</h3>
<p style="margin:0 0 20px 0; line-height:1.8; color:#333; font-size:16px;">
This Site uses Google AdSense and Google Analytics, which collect visitor data through cookies.
You may disable cookies through your browser settings, though some features may be limited as a result.
</p>

<h3 style="font-size:18px; color:#444; margin:30px 0 15px 0; padding-bottom:8px; border-bottom:1px solid #eee;">4. Third-Party Advertising</h3>
<p style="margin:0 0 20px 0; line-height:1.8; color:#333; font-size:16px;">
This Site displays advertisements through Google AdSense. Google may use cookies to serve ads based on your interests.
For more information, please refer to <a href="https://policies.google.com/technologies/ads" target="_blank" rel="noopener">Google's Advertising Policies</a>.
</p>

<h3 style="font-size:18px; color:#444; margin:30px 0 15px 0; padding-bottom:8px; border-bottom:1px solid #eee;">5. Data Retention and Deletion</h3>
<p style="margin:0 0 20px 0; line-height:1.8; color:#333; font-size:16px;">
Automatically collected log data is retained for a limited period for statistical analysis and then deleted.
If you request deletion of your personal data, we will process it without delay.
</p>

<h3 style="font-size:18px; color:#444; margin:30px 0 15px 0; padding-bottom:8px; border-bottom:1px solid #eee;">6. Contact</h3>
<p style="margin:0 0 20px 0; line-height:1.8; color:#333; font-size:16px;">
For privacy-related inquiries, please contact us at:<br>
Email: ${email}
</p>

<p style="margin:40px 0 0 0; line-height:1.8; color:#888; font-size:14px;">
Effective date: ${effectiveDate}
</p>

</div>`;
  }

  private buildAboutPage(siteName: string, owner: string): string {
    return `<div style="max-width:760px; margin:0 auto; font-family:'Noto Sans KR',sans-serif; color:#333; line-height:1.8; font-size:16px;">

<h2 style="border-left:5px solid #0066FF; padding-left:15px; font-size:22px; color:#222; margin:40px 0 20px 0;">About ${siteName}</h2>

<p style="margin:0 0 20px 0; line-height:1.8; color:#333; font-size:16px;">
Thank you for visiting ${siteName}.
</p>

<h3 style="font-size:18px; color:#444; margin:30px 0 15px 0; padding-bottom:8px; border-bottom:1px solid #eee;">About This Blog</h3>
<p style="margin:0 0 20px 0; line-height:1.8; color:#333; font-size:16px;">
${siteName} is a blog that provides in-depth analysis of the latest trends and issues.
We cover topics people are most interested in based on real-time search trends,
delivering accurate information and actionable insights.
</p>

<h3 style="font-size:18px; color:#444; margin:30px 0 15px 0; padding-bottom:8px; border-bottom:1px solid #eee;">Our Mission</h3>
<ul style="margin:0 0 20px 0; padding-left:20px; line-height:2.0; color:#555;">
<li>Timely content reflecting real-time trends</li>
<li>Deep analysis with diverse perspectives</li>
<li>Practical and actionable information for readers</li>
<li>Fact-based content grounded in reliable sources</li>
</ul>

<h3 style="font-size:18px; color:#444; margin:30px 0 15px 0; padding-bottom:8px; border-bottom:1px solid #eee;">About the Author</h3>
<p style="margin:0 0 20px 0; line-height:1.8; color:#333; font-size:16px;">
${siteName} is managed by ${owner}, a specialist in trend analysis and content creation,
committed to delivering high-quality information to our readers.
</p>

<div style="background:#f8f9fa; border-left:4px solid #0066FF; padding:20px 24px; margin:24px 0; border-radius:0 8px 8px 0;">
<p style="margin:0; line-height:1.7; color:#555;">
We are constantly improving the quality of our content and always welcome feedback from our readers.
If you have any questions, please reach out through our Contact page.
</p>
</div>

</div>`;
  }

  private buildContactPage(siteName: string, email: string): string {
    return `<div style="max-width:760px; margin:0 auto; font-family:'Noto Sans KR',sans-serif; color:#333; line-height:1.8; font-size:16px;">

<h2 style="border-left:5px solid #0066FF; padding-left:15px; font-size:22px; color:#222; margin:40px 0 20px 0;">Contact Us</h2>

<p style="margin:0 0 20px 0; line-height:1.8; color:#333; font-size:16px;">
If you have any questions or inquiries about ${siteName}, please get in touch using the information below.
</p>

<div style="background:#f0f4ff; padding:24px 30px; border-radius:12px; margin:24px 0 36px 0;">
<h3 style="font-size:18px; color:#0066FF; margin:0 0 15px 0;">How to Reach Us</h3>
<p style="margin:0 0 10px 0; line-height:1.8; color:#333; font-size:16px;">
Email: <a href="mailto:${email}" style="color:#0066FF; text-decoration:none;">${email}</a>
</p>
<p style="margin:0; line-height:1.8; color:#888; font-size:14px;">
We will respond within 1-3 business days.
</p>
</div>

<h3 style="font-size:18px; color:#444; margin:30px 0 15px 0; padding-bottom:8px; border-bottom:1px solid #eee;">What You Can Contact Us About</h3>
<ul style="margin:0 0 20px 0; padding-left:20px; line-height:2.0; color:#555;">
<li>Content inquiries and feedback</li>
<li>Advertising and business partnership inquiries</li>
<li>Copyright-related inquiries</li>
<li>Privacy-related requests</li>
<li>General site usage questions</li>
</ul>

</div>`;
  }

  private buildDisclaimerPage(siteName: string): string {
    const effectiveDate = `${new Date().toLocaleString('en-US', { month: 'long' })} ${new Date().getDate()}, ${new Date().getFullYear()}`;
    return `<div style="max-width:760px; margin:0 auto; font-family:'Noto Sans KR',sans-serif; color:#333; line-height:1.8; font-size:16px;">

<h2 style="border-left:5px solid #0066FF; padding-left:15px; font-size:22px; color:#222; margin:40px 0 20px 0;">Disclaimer</h2>

<h3 style="font-size:18px; color:#444; margin:30px 0 15px 0; padding-bottom:8px; border-bottom:1px solid #eee;">1. Content Notice</h3>
<p style="margin:0 0 20px 0; line-height:1.8; color:#333; font-size:16px;">
The content published on ${siteName} is based on trending information
and is produced with the assistance of AI technology.
All content is created for informational purposes only and does not constitute professional advice.
</p>

<h3 style="font-size:18px; color:#444; margin:30px 0 15px 0; padding-bottom:8px; border-bottom:1px solid #eee;">2. Accuracy of Information</h3>
<p style="margin:0 0 20px 0; line-height:1.8; color:#333; font-size:16px;">
While we strive to provide accurate information,
we do not guarantee the completeness, accuracy, or reliability of our content.
Any decisions or actions taken based on the information provided are at your own risk.
</p>

<h3 style="font-size:18px; color:#444; margin:30px 0 15px 0; padding-bottom:8px; border-bottom:1px solid #eee;">3. External Links</h3>
<p style="margin:0 0 20px 0; line-height:1.8; color:#333; font-size:16px;">
External links on this Site are provided for reference purposes only.
${siteName} is not responsible for the content of external websites.
</p>

<h3 style="font-size:18px; color:#444; margin:30px 0 15px 0; padding-bottom:8px; border-bottom:1px solid #eee;">4. Advertising</h3>
<p style="margin:0 0 20px 0; line-height:1.8; color:#333; font-size:16px;">
${siteName} displays advertisements through third-party services such as Google AdSense.
Advertisements do not reflect ${siteName}'s opinions or endorsements.
Responsibility for advertised products and services lies with the respective advertisers.
</p>

<h3 style="font-size:18px; color:#444; margin:30px 0 15px 0; padding-bottom:8px; border-bottom:1px solid #eee;">5. Copyright</h3>
<p style="margin:0 0 20px 0; line-height:1.8; color:#333; font-size:16px;">
All content on this Site is protected by copyright law.
Unauthorized reproduction, distribution, or modification is prohibited. Please credit the source when quoting.
</p>

<p style="margin:40px 0 0 0; line-height:1.8; color:#888; font-size:14px;">
Effective date: ${effectiveDate}
</p>

</div>`;
  }
}
