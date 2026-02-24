import axios, { type AxiosInstance } from 'axios';
import { logger } from '../utils/logger.js';

interface PageConfig {
  slug: string;
  title: string;
  content: string;
}

const TOGGLE_BUTTON =
  `<div style="text-align:right; margin:0 0 20px 0;">` +
  `<button onclick="(function(b){var p=b.closest('.bilingual-post');var en=p.querySelector('.content-en');var kr=p.querySelector('.content-kr');if(en.style.display!=='none'){en.style.display='none';kr.style.display='block';b.textContent='Read in English';}else{en.style.display='block';kr.style.display='none';b.textContent='\\ud55c\\uad6d\\uc5b4\\ub85c \\ubcf4\\uae30';}})(this)" ` +
  `style="padding:8px 20px; background:#0066FF; color:#fff; border:none; border-radius:20px; cursor:pointer; font-size:14px;">` +
  `한국어로 보기</button></div>`;

function wrapBilingual(en: string, kr: string): string {
  return `<div class="bilingual-post">${TOGGLE_BUTTON}<div class="content-en" lang="en" style="display:block">${en}</div><div class="content-kr" lang="ko" style="display:none">${kr}</div><noscript><div lang="ko">${kr}</div></noscript></div>`;
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
    const effectiveDateEn = `${new Date().toLocaleString('en-US', { month: 'long' })} ${new Date().getDate()}, ${new Date().getFullYear()}`;
    const effectiveDateKr = `${new Date().getFullYear()}년 ${new Date().getMonth() + 1}월 ${new Date().getDate()}일`;

    const en = `<div style="${S.wrapper}">
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

<p style="${S.footer}">Effective date: ${effectiveDateEn}</p>
</div>`;

    const kr = `<div style="${S.wrapper}">
<h2 style="${S.h2}">개인정보처리방침</h2>
<p style="${S.p}">${siteName}(이하 "사이트")은 이용자의 개인정보를 중요시하며, 개인정보보호법 등 관련 법령을 준수합니다. 본 개인정보처리방침은 사이트가 수집하는 정보의 종류, 이용 목적, 보호 조치에 대해 안내합니다.</p>

<h3 style="${S.h3}">1. 수집하는 개인정보 항목</h3>
<p style="${S.p}">사이트는 기본적으로 별도의 회원가입 절차 없이 이용 가능하며, 다음과 같은 정보가 자동으로 수집될 수 있습니다:</p>
<ul style="${S.ul}">
<li>방문 기록, IP 주소, 브라우저 종류, 접속 시간</li>
<li>쿠키(Cookie)를 통한 이용 패턴 정보</li>
</ul>

<h3 style="${S.h3}">2. 개인정보 이용 목적</h3>
<p style="${S.p}">수집된 정보는 다음 목적으로 활용됩니다:</p>
<ul style="${S.ul}">
<li>사이트 이용 통계 분석 및 서비스 개선</li>
<li>맞춤형 광고 제공 (Google AdSense 등)</li>
<li>부정 이용 방지 및 보안 유지</li>
</ul>

<h3 style="${S.h3}">3. 쿠키(Cookie) 사용</h3>
<p style="${S.p}">사이트는 Google AdSense 및 Google Analytics를 사용하며, 이 서비스들은 쿠키를 통해 방문자 정보를 수집합니다. 이용자는 브라우저 설정을 통해 쿠키 저장을 거부할 수 있으나, 일부 서비스 이용에 제한이 있을 수 있습니다.</p>

<h3 style="${S.h3}">4. 제3자 광고 서비스</h3>
<p style="${S.p}">사이트는 Google AdSense를 통해 광고를 게재합니다. Google은 사용자의 관심사에 기반한 광고를 제공하기 위해 쿠키를 사용할 수 있습니다. 자세한 내용은 <a href="https://policies.google.com/technologies/ads" target="_blank" rel="noopener">Google 광고 정책</a>을 참고하세요.</p>

<h3 style="${S.h3}">5. 개인정보의 보유 및 파기</h3>
<p style="${S.p}">자동 수집된 로그 정보는 통계 분석 후 일정 기간 보관 후 파기됩니다. 이용자가 개인정보의 삭제를 요청할 경우, 지체 없이 해당 정보를 파기합니다.</p>

<h3 style="${S.h3}">6. 문의</h3>
<p style="${S.p}">개인정보 관련 문의사항은 아래 이메일로 연락해 주시기 바랍니다.<br>이메일: ${email}</p>

<p style="${S.footer}">시행일: ${effectiveDateKr}</p>
</div>`;

    return wrapBilingual(en, kr);
  }

  private buildAboutPage(siteName: string, owner: string): string {
    const en = `<div style="${S.wrapper}">
<h2 style="${S.h2}">About ${siteName}</h2>
<p style="${S.p}">Thank you for visiting ${siteName}.</p>

<h3 style="${S.h3}">About This Blog</h3>
<p style="${S.p}">${siteName} is a blog that provides in-depth analysis of the latest trends and issues. We cover topics people are most interested in based on real-time search trends, delivering accurate information and actionable insights.</p>

<h3 style="${S.h3}">Our Mission</h3>
<ul style="${S.ul}">
<li>Timely content reflecting real-time trends</li>
<li>Deep analysis with diverse perspectives</li>
<li>Practical and actionable information for readers</li>
<li>Fact-based content grounded in reliable sources</li>
</ul>

<h3 style="${S.h3}">About the Author</h3>
<p style="${S.p}">${siteName} is managed by ${owner}, a specialist in trend analysis and content creation, committed to delivering high-quality information to our readers.</p>

<div style="${S.highlightBox}">
<p style="margin:0; line-height:1.7; color:#555;">We are constantly improving the quality of our content and always welcome feedback from our readers. If you have any questions, please reach out through our Contact page.</p>
</div>
</div>`;

    const kr = `<div style="${S.wrapper}">
<h2 style="${S.h2}">${siteName} 소개</h2>
<p style="${S.p}">${siteName}에 방문해 주셔서 감사합니다.</p>

<h3 style="${S.h3}">블로그 소개</h3>
<p style="${S.p}">${siteName}은 최신 트렌드와 이슈를 빠르게 분석하여 유용한 정보를 제공하는 블로그입니다. 검색 트렌드를 기반으로 사람들이 관심 있어하는 주제를 심층적으로 다루며, 정확한 정보와 실용적인 인사이트를 전달하는 것을 목표로 합니다.</p>

<h3 style="${S.h3}">운영 목적</h3>
<ul style="${S.ul}">
<li>실시간 트렌드를 반영한 시의성 있는 콘텐츠 제공</li>
<li>깊이 있는 분석과 다양한 관점 제시</li>
<li>독자에게 실질적으로 도움이 되는 정보 공유</li>
<li>신뢰할 수 있는 출처 기반의 팩트 중심 콘텐츠</li>
</ul>

<h3 style="${S.h3}">운영자 소개</h3>
<p style="${S.p}">${siteName}은 ${owner}이(가) 운영하고 있습니다. 트렌드 분석과 콘텐츠 작성에 전문성을 갖추고 있으며, 독자 여러분에게 양질의 정보를 전달하기 위해 노력하고 있습니다.</p>

<div style="${S.highlightBox}">
<p style="margin:0; line-height:1.7; color:#555;">${siteName}은 지속적으로 콘텐츠의 품질을 개선하고 있으며, 독자 여러분의 피드백을 항상 환영합니다. 문의사항이 있으시면 연락처 페이지를 통해 연락해 주세요.</p>
</div>
</div>`;

    return wrapBilingual(en, kr);
  }

  private buildContactPage(siteName: string, email: string): string {
    const en = `<div style="${S.wrapper}">
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
<li>General site usage questions</li>
</ul>
</div>`;

    const kr = `<div style="${S.wrapper}">
<h2 style="${S.h2}">연락처</h2>
<p style="${S.p}">${siteName}에 문의사항이 있으시면 아래 연락처로 연락해 주세요.</p>

<div style="${S.infoBox}">
<h3 style="font-size:18px; color:#0066FF; margin:0 0 15px 0;">문의 방법</h3>
<p style="margin:0 0 10px 0; line-height:1.8; color:#333; font-size:16px;">이메일: <a href="mailto:${email}" style="color:#0066FF; text-decoration:none;">${email}</a></p>
<p style="margin:0; line-height:1.8; color:#888; font-size:14px;">영업일 기준 1~3일 이내에 회신드리겠습니다.</p>
</div>

<h3 style="${S.h3}">문의 가능 사항</h3>
<ul style="${S.ul}">
<li>콘텐츠 관련 문의 및 피드백</li>
<li>광고 및 비즈니스 제휴 문의</li>
<li>저작권 관련 문의</li>
<li>개인정보 관련 요청</li>
<li>기타 사이트 이용 관련 문의</li>
</ul>
</div>`;

    return wrapBilingual(en, kr);
  }

  private buildDisclaimerPage(siteName: string): string {
    const effectiveDateEn = `${new Date().toLocaleString('en-US', { month: 'long' })} ${new Date().getDate()}, ${new Date().getFullYear()}`;
    const effectiveDateKr = `${new Date().getFullYear()}년 ${new Date().getMonth() + 1}월 ${new Date().getDate()}일`;

    const en = `<div style="${S.wrapper}">
<h2 style="${S.h2}">Disclaimer</h2>

<h3 style="${S.h3}">1. Content Notice</h3>
<p style="${S.p}">The content published on ${siteName} is based on trending information and is produced with the assistance of AI technology. All content is created for informational purposes only and does not constitute professional advice.</p>

<h3 style="${S.h3}">2. Accuracy of Information</h3>
<p style="${S.p}">While we strive to provide accurate information, we do not guarantee the completeness, accuracy, or reliability of our content. Any decisions or actions taken based on the information provided are at your own risk.</p>

<h3 style="${S.h3}">3. External Links</h3>
<p style="${S.p}">External links on this Site are provided for reference purposes only. ${siteName} is not responsible for the content of external websites.</p>

<h3 style="${S.h3}">4. Advertising</h3>
<p style="${S.p}">${siteName} displays advertisements through third-party services such as Google AdSense. Advertisements do not reflect ${siteName}'s opinions or endorsements. Responsibility for advertised products and services lies with the respective advertisers.</p>

<h3 style="${S.h3}">5. Copyright</h3>
<p style="${S.p}">All content on this Site is protected by copyright law. Unauthorized reproduction, distribution, or modification is prohibited. Please credit the source when quoting.</p>

<p style="${S.footer}">Effective date: ${effectiveDateEn}</p>
</div>`;

    const kr = `<div style="${S.wrapper}">
<h2 style="${S.h2}">면책조항</h2>

<h3 style="${S.h3}">1. 콘텐츠 안내</h3>
<p style="${S.p}">${siteName}에 게시된 콘텐츠는 트렌드 정보를 기반으로 작성되었으며, AI 기술을 활용하여 콘텐츠 제작을 보조하고 있습니다. 모든 콘텐츠는 정보 제공 목적으로 작성되었으며, 전문적인 조언을 대체하지 않습니다.</p>

<h3 style="${S.h3}">2. 정보의 정확성</h3>
<p style="${S.p}">본 사이트는 정확한 정보를 제공하기 위해 최선을 다하고 있으나, 콘텐츠의 완전성, 정확성, 신뢰성에 대해 보증하지 않습니다. 제공된 정보를 바탕으로 한 결정이나 행동에 대한 책임은 이용자 본인에게 있습니다.</p>

<h3 style="${S.h3}">3. 외부 링크</h3>
<p style="${S.p}">사이트에 포함된 외부 링크는 참고 목적으로 제공되며, 외부 사이트의 콘텐츠에 대해 ${siteName}은 책임을 지지 않습니다.</p>

<h3 style="${S.h3}">4. 광고</h3>
<p style="${S.p}">${siteName}은 Google AdSense 등 제3자 광고 서비스를 이용하여 광고를 게재합니다. 광고 내용은 ${siteName}의 의견이나 추천을 반영하지 않으며, 광고 제품 및 서비스에 대한 책임은 해당 광고주에게 있습니다.</p>

<h3 style="${S.h3}">5. 저작권</h3>
<p style="${S.p}">본 사이트의 모든 콘텐츠는 저작권법의 보호를 받습니다. 콘텐츠의 무단 복제, 배포, 수정은 금지되며, 인용 시 출처를 명시해야 합니다.</p>

<p style="${S.footer}">시행일: ${effectiveDateKr}</p>
</div>`;

    return wrapBilingual(en, kr);
  }
}
