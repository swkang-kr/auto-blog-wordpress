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
        const exists = await this.pageExists(page.slug);
        if (exists) {
          logger.info(`Page already exists: "${page.title}" (/${page.slug})`);
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
        logger.error(`Failed to create page "${page.title}": ${msg}`);
      }
    }
  }

  private async pageExists(slug: string): Promise<boolean> {
    try {
      const response = await this.api.get('/pages', { params: { slug, status: 'publish,draft,private' } });
      return Array.isArray(response.data) && response.data.length > 0;
    } catch {
      return false;
    }
  }

  private buildPageConfigs(siteName: string, siteOwner: string, contactEmail: string): PageConfig[] {
    const ownerDisplay = siteOwner || siteName;
    const emailDisplay = contactEmail || `contact@${siteName.toLowerCase().replace(/\s+/g, '')}.net`;

    return [
      {
        slug: 'privacy-policy',
        title: '개인정보처리방침',
        content: this.buildPrivacyPolicy(siteName, emailDisplay),
      },
      {
        slug: 'about',
        title: '사이트 소개',
        content: this.buildAboutPage(siteName, ownerDisplay),
      },
      {
        slug: 'contact',
        title: '연락처',
        content: this.buildContactPage(siteName, emailDisplay),
      },
      {
        slug: 'disclaimer',
        title: '면책조항',
        content: this.buildDisclaimerPage(siteName),
      },
    ];
  }

  private buildPrivacyPolicy(siteName: string, email: string): string {
    return `<div style="max-width:760px; margin:0 auto; font-family:'Noto Sans KR',sans-serif; color:#333; line-height:1.8; font-size:16px;">

<h2 style="border-left:5px solid #0066FF; padding-left:15px; font-size:22px; color:#222; margin:40px 0 20px 0;">개인정보처리방침</h2>

<p style="margin:0 0 20px 0; line-height:1.8; color:#333; font-size:16px;">
${siteName}(이하 "사이트")은 이용자의 개인정보를 중요시하며, 개인정보보호법 등 관련 법령을 준수합니다.
본 개인정보처리방침은 사이트가 수집하는 정보의 종류, 이용 목적, 보호 조치에 대해 안내합니다.
</p>

<h3 style="font-size:18px; color:#444; margin:30px 0 15px 0; padding-bottom:8px; border-bottom:1px solid #eee;">1. 수집하는 개인정보 항목</h3>
<p style="margin:0 0 20px 0; line-height:1.8; color:#333; font-size:16px;">
사이트는 기본적으로 별도의 회원가입 절차 없이 이용 가능하며, 다음과 같은 정보가 자동으로 수집될 수 있습니다:
</p>
<ul style="margin:0 0 20px 0; padding-left:20px; line-height:2.0; color:#555;">
<li>방문 기록, IP 주소, 브라우저 종류, 접속 시간</li>
<li>쿠키(Cookie)를 통한 이용 패턴 정보</li>
</ul>

<h3 style="font-size:18px; color:#444; margin:30px 0 15px 0; padding-bottom:8px; border-bottom:1px solid #eee;">2. 개인정보 이용 목적</h3>
<p style="margin:0 0 20px 0; line-height:1.8; color:#333; font-size:16px;">
수집된 정보는 다음 목적으로 활용됩니다:
</p>
<ul style="margin:0 0 20px 0; padding-left:20px; line-height:2.0; color:#555;">
<li>사이트 이용 통계 분석 및 서비스 개선</li>
<li>맞춤형 광고 제공 (Google AdSense 등)</li>
<li>부정 이용 방지 및 보안 유지</li>
</ul>

<h3 style="font-size:18px; color:#444; margin:30px 0 15px 0; padding-bottom:8px; border-bottom:1px solid #eee;">3. 쿠키(Cookie) 사용</h3>
<p style="margin:0 0 20px 0; line-height:1.8; color:#333; font-size:16px;">
사이트는 Google AdSense 및 Google Analytics를 사용하며, 이 서비스들은 쿠키를 통해 방문자 정보를 수집합니다.
이용자는 브라우저 설정을 통해 쿠키 저장을 거부할 수 있으나, 일부 서비스 이용에 제한이 있을 수 있습니다.
</p>

<h3 style="font-size:18px; color:#444; margin:30px 0 15px 0; padding-bottom:8px; border-bottom:1px solid #eee;">4. 제3자 광고 서비스</h3>
<p style="margin:0 0 20px 0; line-height:1.8; color:#333; font-size:16px;">
사이트는 Google AdSense를 통해 광고를 게재합니다. Google은 사용자의 관심사에 기반한 광고를 제공하기 위해
쿠키를 사용할 수 있습니다. 자세한 내용은 <a href="https://policies.google.com/technologies/ads" target="_blank" rel="noopener">Google 광고 정책</a>을 참고하세요.
</p>

<h3 style="font-size:18px; color:#444; margin:30px 0 15px 0; padding-bottom:8px; border-bottom:1px solid #eee;">5. 개인정보의 보유 및 파기</h3>
<p style="margin:0 0 20px 0; line-height:1.8; color:#333; font-size:16px;">
자동 수집된 로그 정보는 통계 분석 후 일정 기간 보관 후 파기됩니다.
이용자가 개인정보의 삭제를 요청할 경우, 지체 없이 해당 정보를 파기합니다.
</p>

<h3 style="font-size:18px; color:#444; margin:30px 0 15px 0; padding-bottom:8px; border-bottom:1px solid #eee;">6. 문의</h3>
<p style="margin:0 0 20px 0; line-height:1.8; color:#333; font-size:16px;">
개인정보 관련 문의사항은 아래 이메일로 연락해 주시기 바랍니다.<br>
이메일: ${email}
</p>

<p style="margin:40px 0 0 0; line-height:1.8; color:#888; font-size:14px;">
본 방침은 ${new Date().getFullYear()}년 ${new Date().getMonth() + 1}월 ${new Date().getDate()}일부터 시행됩니다.
</p>

</div>`;
  }

  private buildAboutPage(siteName: string, owner: string): string {
    return `<div style="max-width:760px; margin:0 auto; font-family:'Noto Sans KR',sans-serif; color:#333; line-height:1.8; font-size:16px;">

<h2 style="border-left:5px solid #0066FF; padding-left:15px; font-size:22px; color:#222; margin:40px 0 20px 0;">${siteName} 소개</h2>

<p style="margin:0 0 20px 0; line-height:1.8; color:#333; font-size:16px;">
${siteName}에 방문해 주셔서 감사합니다.
</p>

<h3 style="font-size:18px; color:#444; margin:30px 0 15px 0; padding-bottom:8px; border-bottom:1px solid #eee;">블로그 소개</h3>
<p style="margin:0 0 20px 0; line-height:1.8; color:#333; font-size:16px;">
${siteName}은 최신 트렌드와 이슈를 빠르게 분석하여 유용한 정보를 제공하는 블로그입니다.
검색 트렌드를 기반으로 사람들이 관심 있어하는 주제를 심층적으로 다루며,
정확한 정보와 실용적인 인사이트를 전달하는 것을 목표로 합니다.
</p>

<h3 style="font-size:18px; color:#444; margin:30px 0 15px 0; padding-bottom:8px; border-bottom:1px solid #eee;">운영 목적</h3>
<ul style="margin:0 0 20px 0; padding-left:20px; line-height:2.0; color:#555;">
<li>실시간 트렌드를 반영한 시의성 있는 콘텐츠 제공</li>
<li>깊이 있는 분석과 다양한 관점 제시</li>
<li>독자에게 실질적으로 도움이 되는 정보 공유</li>
<li>신뢰할 수 있는 출처 기반의 팩트 중심 콘텐츠</li>
</ul>

<h3 style="font-size:18px; color:#444; margin:30px 0 15px 0; padding-bottom:8px; border-bottom:1px solid #eee;">운영자 소개</h3>
<p style="margin:0 0 20px 0; line-height:1.8; color:#333; font-size:16px;">
${siteName}은 ${owner}이(가) 운영하고 있습니다.
트렌드 분석과 콘텐츠 작성에 전문성을 갖추고 있으며,
독자 여러분에게 양질의 정보를 전달하기 위해 노력하고 있습니다.
</p>

<div style="background:#f8f9fa; border-left:4px solid #0066FF; padding:20px 24px; margin:24px 0; border-radius:0 8px 8px 0;">
<p style="margin:0; line-height:1.7; color:#555;">
${siteName}은 지속적으로 콘텐츠의 품질을 개선하고 있으며,
독자 여러분의 피드백을 항상 환영합니다. 문의사항이 있으시면 연락처 페이지를 통해 연락해 주세요.
</p>
</div>

</div>`;
  }

  private buildContactPage(siteName: string, email: string): string {
    return `<div style="max-width:760px; margin:0 auto; font-family:'Noto Sans KR',sans-serif; color:#333; line-height:1.8; font-size:16px;">

<h2 style="border-left:5px solid #0066FF; padding-left:15px; font-size:22px; color:#222; margin:40px 0 20px 0;">연락처</h2>

<p style="margin:0 0 20px 0; line-height:1.8; color:#333; font-size:16px;">
${siteName}에 문의사항이 있으시면 아래 연락처로 연락해 주세요.
</p>

<div style="background:#f0f4ff; padding:24px 30px; border-radius:12px; margin:24px 0 36px 0;">
<h3 style="font-size:18px; color:#0066FF; margin:0 0 15px 0;">문의 방법</h3>
<p style="margin:0 0 10px 0; line-height:1.8; color:#333; font-size:16px;">
이메일: <a href="mailto:${email}" style="color:#0066FF; text-decoration:none;">${email}</a>
</p>
<p style="margin:0; line-height:1.8; color:#888; font-size:14px;">
영업일 기준 1~3일 이내에 회신드리겠습니다.
</p>
</div>

<h3 style="font-size:18px; color:#444; margin:30px 0 15px 0; padding-bottom:8px; border-bottom:1px solid #eee;">문의 가능 사항</h3>
<ul style="margin:0 0 20px 0; padding-left:20px; line-height:2.0; color:#555;">
<li>콘텐츠 관련 문의 및 피드백</li>
<li>광고 및 비즈니스 제휴 문의</li>
<li>저작권 관련 문의</li>
<li>개인정보 관련 요청</li>
<li>기타 사이트 이용 관련 문의</li>
</ul>

</div>`;
  }

  private buildDisclaimerPage(siteName: string): string {
    return `<div style="max-width:760px; margin:0 auto; font-family:'Noto Sans KR',sans-serif; color:#333; line-height:1.8; font-size:16px;">

<h2 style="border-left:5px solid #0066FF; padding-left:15px; font-size:22px; color:#222; margin:40px 0 20px 0;">면책조항 (Disclaimer)</h2>

<h3 style="font-size:18px; color:#444; margin:30px 0 15px 0; padding-bottom:8px; border-bottom:1px solid #eee;">1. 콘텐츠 안내</h3>
<p style="margin:0 0 20px 0; line-height:1.8; color:#333; font-size:16px;">
${siteName}에 게시된 콘텐츠는 트렌드 정보를 기반으로 작성되었으며,
AI 기술을 활용하여 콘텐츠 제작을 보조하고 있습니다.
모든 콘텐츠는 정보 제공 목적으로 작성되었으며, 전문적인 조언을 대체하지 않습니다.
</p>

<h3 style="font-size:18px; color:#444; margin:30px 0 15px 0; padding-bottom:8px; border-bottom:1px solid #eee;">2. 정보의 정확성</h3>
<p style="margin:0 0 20px 0; line-height:1.8; color:#333; font-size:16px;">
본 사이트는 정확한 정보를 제공하기 위해 최선을 다하고 있으나,
콘텐츠의 완전성, 정확성, 신뢰성에 대해 보증하지 않습니다.
제공된 정보를 바탕으로 한 결정이나 행동에 대한 책임은 이용자 본인에게 있습니다.
</p>

<h3 style="font-size:18px; color:#444; margin:30px 0 15px 0; padding-bottom:8px; border-bottom:1px solid #eee;">3. 외부 링크</h3>
<p style="margin:0 0 20px 0; line-height:1.8; color:#333; font-size:16px;">
사이트에 포함된 외부 링크는 참고 목적으로 제공되며,
외부 사이트의 콘텐츠에 대해 ${siteName}은 책임을 지지 않습니다.
</p>

<h3 style="font-size:18px; color:#444; margin:30px 0 15px 0; padding-bottom:8px; border-bottom:1px solid #eee;">4. 광고</h3>
<p style="margin:0 0 20px 0; line-height:1.8; color:#333; font-size:16px;">
${siteName}은 Google AdSense 등 제3자 광고 서비스를 이용하여 광고를 게재합니다.
광고 내용은 ${siteName}의 의견이나 추천을 반영하지 않으며,
광고 제품 및 서비스에 대한 책임은 해당 광고주에게 있습니다.
</p>

<h3 style="font-size:18px; color:#444; margin:30px 0 15px 0; padding-bottom:8px; border-bottom:1px solid #eee;">5. 저작권</h3>
<p style="margin:0 0 20px 0; line-height:1.8; color:#333; font-size:16px;">
본 사이트의 모든 콘텐츠는 저작권법의 보호를 받습니다.
콘텐츠의 무단 복제, 배포, 수정은 금지되며, 인용 시 출처를 명시해야 합니다.
</p>

<p style="margin:40px 0 0 0; line-height:1.8; color:#888; font-size:14px;">
본 면책조항은 ${new Date().getFullYear()}년 ${new Date().getMonth() + 1}월 ${new Date().getDate()}일부터 시행됩니다.
</p>

</div>`;
  }
}
