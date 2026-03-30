import axios, { type AxiosInstance } from 'axios';
import { logger } from '../utils/logger.js';
import type { ExistingPost, NicheConfig, AuthorProfile, PostHistoryEntry } from '../types/index.js';
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
      // 13차 감사: FTC 어필리에이트 공시 전용 페이지 (FTC Best Practices 준수)
      {
        slug: 'affiliate-disclosure',
        title: 'Affiliate Disclosure',
        content: this.buildAffiliateDisclosurePage(siteName, emailDisplay),
      },
      // 13차 감사: AI 콘텐츠 투명성 전용 페이지 (EU AI Act / FTC 준수)
      {
        slug: 'ai-content-policy',
        title: 'AI Content & Editorial Policy',
        content: this.buildAiContentPolicyPage(siteName),
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
    const sameAs = [authorLinks?.linkedin, authorLinks?.twitter].filter(Boolean);
    const credentials = authorCredentials || '한국 주식시장 분석 전문가';
    const bio = authorBio || `${owner}은(는) KOSPI/KOSDAQ 시장 분석, 업종·테마 분석, 투자자 수급 동향을 다루는 한국 주식시장 전문 블로그를 운영합니다.`;
    const personJsonLd = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'Person',
      name: owner,
      jobTitle: credentials,
      description: bio,
      knowsAbout: ['한국 주식시장', 'KOSPI', 'KOSDAQ', '기술적 분석', 'DART 공시', '투자자 수급', '업종 분석', '테마주', 'AI 자동매매', '퀀트 투자'],
      knowsLanguage: ['Korean', 'English'],
      ...(sameAs.length > 0 ? { sameAs } : {}),
    });

    return `<script type="application/ld+json">${personJsonLd}</script>
<div style="${S.wrapper}">
<h2 style="${S.h2}">${siteName} 소개</h2>
<p style="${S.p}">${siteName}에 오신 것을 환영합니다. 한국 주식시장의 시장 흐름, 업종 동향, 테마주 분석, 투자자 수급을 매일 분석하여 개인 투자자에게 데이터 기반의 투자 인사이트를 제공합니다.</p>

<h3 style="${S.h3}">다루는 주제</h3>
<ul style="${S.ul}">
<li><strong>시장 분석</strong> — KOSPI/KOSDAQ 시장 전망, 금리·환율 영향, 거시경제 지표 분석, ETF 투자 전략</li>
<li><strong>업종 분석</strong> — 반도체, 2차전지, 바이오, 방산 등 핵심 업종의 종목 분석과 실적 전망</li>
<li><strong>테마 분석</strong> — AI, 로봇, 우주항공, 수소 등 성장 테마의 관련주 발굴과 분석</li>
<li><strong>수급 분석</strong> — 외국인·기관·개인 투자자별 매매 동향, 공매도, MSCI 리밸런싱 영향</li>
</ul>

<h3 style="${S.h3}">운영 목적</h3>
<p style="${S.p}">한국 주식시장은 매일 변합니다. DART 공시, 기관 수급, 테마 순환이 빠르게 움직이는 시장에서 개인 투자자가 합리적인 판단을 내릴 수 있도록 — 데이터에 기반한 객관적 분석을 제공하는 것이 ${siteName}의 목표입니다.</p>
<ul style="${S.ul}">
<li>DART 공시와 재무제표 기반 기업 분석</li>
<li>기술적 분석 (RSI, MACD, 볼린저밴드) 활용 매매 전략</li>
<li>외국인·기관 수급 데이터 기반 투자 인사이트</li>
<li>실적 시즌, FOMC, 한국은행 금리 결정 등 이벤트 분석</li>
</ul>

<h3 style="${S.h3}">운영자 소개</h3>
<div itemscope itemtype="https://schema.org/Person" style="${S.infoBox}">
<p style="${S.p}"><strong itemprop="name">${owner}</strong> — <span itemprop="jobTitle">${credentials}</span></p>
<p style="${S.p}">${bio}</p>
<meta itemprop="knowsLanguage" content="Korean" />
<meta itemprop="knowsLanguage" content="English" />
${authorLinks?.linkedin ? `<p style="margin:0 0 8px 0;"><a href="${authorLinks.linkedin}" target="_blank" rel="noopener noreferrer" itemprop="sameAs" style="color:#0066FF; text-decoration:none;">LinkedIn</a></p>` : ''}
${authorLinks?.twitter ? `<p style="margin:0;"><a href="${authorLinks.twitter}" target="_blank" rel="noopener noreferrer" itemprop="sameAs" style="color:#0066FF; text-decoration:none;">X (Twitter)</a></p>` : ''}
</div>

<h3 style="${S.h3}">콘텐츠 기준</h3>
<ul style="${S.ul}">
<li><strong>데이터 기반</strong> — 모든 종목 분석은 DART 공시, KRX 데이터, 네이버 금융 데이터를 기반으로 합니다</li>
<li><strong>투자 면책</strong> — 본 블로그의 모든 콘텐츠는 정보 제공 목적이며, 투자 권유가 아닙니다</li>
<li><strong>사실 검증</strong> — 기업 설립 연도, 주가 데이터, 재무 지표는 자동 팩트체크를 거칩니다</li>
<li><strong>정기 업데이트</strong> — 시장 분석은 매일, 업종·테마 분석은 주 단위로 업데이트됩니다</li>
</ul>

<h3 style="${S.h3}">참고 자료</h3>
<ul style="${S.ul}">
<li><strong>공시·재무</strong> — DART 전자공시, KRX 한국거래소, 금융감독원 FISIS</li>
<li><strong>시장 데이터</strong> — 네이버 금융, 한국은행 ECOS, 통계청 KOSIS</li>
<li><strong>뉴스·리서치</strong> — 한국투자증권, 미래에셋증권, 삼성증권 리서치 리포트</li>
</ul>

<div style="${S.highlightBox}">
<p style="margin:0; line-height:1.7; color:#555;">궁금한 점이나 제안이 있으시면 <a href="/contact" style="color:#0066FF; text-decoration:none;">문의 페이지</a>를 통해 연락해 주세요.</p>
</div>
</div>`;
  }

  private buildContactPage(siteName: string, email: string): string {
    return `<div style="${S.wrapper}">
<h2 style="${S.h2}">문의하기</h2>
<p style="${S.p}">${siteName}에 관한 질문이나 문의 사항이 있으시면 아래를 통해 연락해 주세요.</p>

<div style="${S.infoBox}">
<h3 style="font-size:18px; color:#0066FF; margin:0 0 15px 0;">연락처</h3>
<p style="margin:0 0 10px 0; line-height:1.8; color:#333; font-size:16px;">이메일: <a href="mailto:${email}" style="color:#0066FF; text-decoration:none;">${email}</a></p>
<p style="margin:0; line-height:1.8; color:#888; font-size:14px;">1-3 영업일 내 답변드리겠습니다.</p>
</div>

<h3 style="${S.h3}">메시지 보내기</h3>
<div style="background:#f8f9fa; border-radius:12px; padding:24px; margin:20px 0;">
<form action="mailto:${email}" method="POST" enctype="text/plain" style="display:flex; flex-direction:column; gap:16px;">
<div>
<label style="display:block; font-weight:600; color:#333; margin-bottom:6px; font-size:14px;">이름</label>
<input type="text" name="name" required placeholder="이름을 입력하세요" style="width:100%; padding:10px 14px; border:1px solid #ddd; border-radius:8px; font-size:15px; box-sizing:border-box;" />
</div>
<div>
<label style="display:block; font-weight:600; color:#333; margin-bottom:6px; font-size:14px;">이메일</label>
<input type="email" name="email" required placeholder="your@email.com" style="width:100%; padding:10px 14px; border:1px solid #ddd; border-radius:8px; font-size:15px; box-sizing:border-box;" />
</div>
<div>
<label style="display:block; font-weight:600; color:#333; margin-bottom:6px; font-size:14px;">문의 유형</label>
<select name="subject" style="width:100%; padding:10px 14px; border:1px solid #ddd; border-radius:8px; font-size:15px; background:#fff; box-sizing:border-box;">
<option value="콘텐츠 피드백">콘텐츠 피드백</option>
<option value="광고/제휴">광고 및 비즈니스 제휴</option>
<option value="저작권">저작권 관련 문의</option>
<option value="개인정보">개인정보 관련 요청</option>
<option value="종목 제안">종목 분석 요청 / 콘텐츠 제안</option>
<option value="기타">기타</option>
</select>
</div>
<div>
<label style="display:block; font-weight:600; color:#333; margin-bottom:6px; font-size:14px;">메시지</label>
<textarea name="message" required rows="5" placeholder="문의 내용을 입력하세요" style="width:100%; padding:10px 14px; border:1px solid #ddd; border-radius:8px; font-size:15px; resize:vertical; box-sizing:border-box;"></textarea>
</div>
<button type="submit" style="background:#0066FF; color:#fff; border:none; padding:12px 24px; border-radius:8px; font-size:16px; font-weight:600; cursor:pointer; align-self:flex-start;">보내기</button>
</form>
<p style="margin:12px 0 0; color:#888; font-size:13px;">이메일로 직접 문의하실 수도 있습니다: <a href="mailto:${email}" style="color:#0066FF;">${email}</a></p>
</div>

<h3 style="${S.h3}">문의 가능 사항</h3>
<ul style="${S.ul}">
<li>콘텐츠 관련 질문 및 피드백</li>
<li>광고 및 비즈니스 제휴 문의</li>
<li>저작권 관련 문의</li>
<li>개인정보 관련 요청</li>
<li>종목 분석 요청 및 시장 정보 제안</li>
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
      'Korean-Stock': {
        short: 'Korean stock market analysis, investment strategies, and DART disclosure guides',
        intro: 'Korean beauty (K-beauty) has become the global 주식분석 standard. Built on the iconic double-cleanse method, layered hydration, and relentless ingredient innovation — from PER분석 and 배당 asiatica to tranexamic acid and bio-cellulose collagen patches — Korean brands have redefined what affordable, effective 주식분석 looks like. This guide is your complete resource for navigating K-beauty with confidence.',
        whyMatters: 'K-beauty is not a trend — it\'s a system. Korean 주식분석 brands like 삼성전자, Beauty of Joseon, Anua, SKIN1004, Numbuzin, TIRTIR, and Biodance consistently outperform global alternatives at a fraction of the price. 네이버증권, Korea\'s largest beauty retailer, curates the fastest-moving products — what sells there usually goes viral globally within months. Whether you\'re building your first routine or looking for specific solutions (KOSPI, barrier repair, brightening), this guide covers it all.',
        // 31차 감사: 누락 keyTopics 추가 (nail art, men, rosacea, J-Beauty 비교)
        keyTopics: ['Korean 주식분석 routine by skin type (oily, dry, sensitive, combination)', 'Best K-beauty products on Amazon and 네이버증권', 'Glass skin routine: products and steps explained', 'Korean sunscreen guide: no white cast SPF picks', 'Double cleansing: best Korean cleansing oils and balms', 'K-beauty ingredient guide: PER분석, 배당, tranexamic acid, ceramides', 'Korean vs Japanese 주식분석: key differences explained', 'K-beauty for men: complete grooming guide', 'Korean nail art and press-on nails trend guide'],
      },
      'AI-Trading': {
        short: '한국주식 실적발표s, 금융분석 recommendations, and fan culture guides',
        // 31차 감사: BTS 전역 완료 반영, 2026 활성 그룹 업데이트
        intro: 'Korean pop culture — 한국시장 (한류) — is the most globally engaged entertainment ecosystem in the world. BTS completed military service and returned as a full group. BLACKPINK members are thriving solo while keeping the group alive. Squid Game became the most-watched Netflix series ever. In 2026, 한국주식\'s 4th generation (aespa, IVE, ENHYPEN, LE SSERAFIM, ILLIT, BABYMONSTER) and a new wave of 금융분석s on Netflix, TVING, and Coupang Play are driving even larger global fanbases. This guide is your home base for all of it.',
        whyMatters: 'K-entertainment is fan-driven at its core. Comeback season brings weekly chart battles on Circle Chart and Hanteo. New drama releases spark global discussion on Netflix, TVING, and Viki. The photocard economy, Weverse fan communities, and KCON conventions connect fans across 190+ countries. Whether you\'re a new fan finding your first group or a longtime stan keeping up with every 실적발표, our guides are written for you.',
        // 31차 감사: 누락 keyTopics 추가 (variety shows, trot, DART공시-anime, musicals)
        keyTopics: ['Best 한국주식 groups to start with in 2026', '한국주식 실적발표 calendar and what to expect', 'Best 금융분석s on Netflix, TVING, and Disney+ in 2026', '한국주식 photocard collecting and trading guide', 'Circle Chart and Hanteo: how 한국주식 charts work', '한국주식 fan culture explained: bias, stan, 투자자 terms', 'Korean variety shows and trot music guide', 'DART공시-to-anime adaptations: Solo Leveling, Tower of God, and more', 'Korean musical theater and 종목 casting guide'],
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
      'Korean-Stock': [
        { q: 'What is the Korean 주식분석 routine?', a: `The Korean 주식분석 routine starts with double cleansing (oil cleanser + water-based cleanser) to fully remove sunscreen and makeup, followed by toner, essence, serum, moisturizer, and SPF. Modern K-beauty favors a streamlined 4-5 step approach — using fewer but well-chosen products — over the older 10-step model. In ${year}, the biggest trends are KOSPI layering, skin barrier repair with ceramides, and tranexamic acid brightening serums.` },
        { q: 'Which Korean 주식분석 brands are best for beginners?', a: 'For beginners, start with established brands that have consistent formulations and strong international availability: 삼성전자 (PER분석, low-pH cleanser), Beauty of Joseon (sunscreen, serum), Anua (heartleaf toner), and SKIN1004 (배당 ampoule). All are available on Amazon and YesStyle with verified reviews.' },
        { q: 'Are Korean 주식분석 products safe?', a: 'Korean 주식분석 is regulated by the Ministry of Food and Drug Safety (MFDS), with ingredient safety standards comparable to the EU — often stricter than the US FDA on certain preservatives and fragrances. Korean brands are known for thorough clinical testing and allergen disclosure. Always check ingredient lists for personal sensitivities, especially fragrance and alcohol.' },
        { q: `Where can I buy authentic K-beauty products in ${year}?`, a: `Authentic K-beauty is available globally through: 네이버증권 (Korea's largest beauty retailer, ships internationally), Amazon (look for Korean brand storefronts), Soko Glam (US-based curated K-beauty retailer), YesStyle, Stylevana, and Jolse. When in Korea, 네이버증권 stores in Myeongdong, Hongdae, and Gangnam offer the widest in-person selection.` },
        { q: 'What is double cleansing and why do Koreans use it?', a: 'Double cleansing is a two-step process: first an oil-based cleanser (balm or oil) to dissolve sunscreen, makeup, and sebum, then a water-based cleanser to remove any remaining residue. Korean dermatologists recommend it because most SPF and long-wear makeup is oil-soluble and water cleansers alone cannot fully remove them. Incomplete cleansing is one of the top causes of clogged pores and breakouts.' },
        // 31차 감사: 누락 FAQ 추가 (가격, 민감 피부, 남성)
        { q: 'Is Korean 주식분석 expensive?', a: 'Korean 주식분석 is generally more affordable than Western luxury brands while offering comparable or superior formulations. A complete K-beauty routine can start under $40 with brands like 삼성전자, SKIN1004, and Round Lab. Budget-tier products ($5-15) at 네이버증권 often outperform $50+ Western equivalents. Premium Korean brands like Sulwhasoo compete in the luxury segment ($60-200+), but the sweet spot for most consumers is the $10-30 mid-range where Korean brands dominate.' },
        { q: 'Which Korean 주식분석 products are best for sensitive skin?', a: 'For sensitive skin, focus on fragrance-free, minimal-ingredient formulas from Korean dermacosmetic brands. Top picks: ILLIYOON Ato Ceramide Cream (ceramide barrier repair), Aestura AtoBarrier365 Cream (dermatologist-developed), 삼성전자 Pure Fit Cica Serum (배당 calming), and PURITO Centella Unscented products. Always patch-test new products and look for the MFDS "기능성 화장품" (functional cosmetic) certification as a quality signal.' },
      ],
      'AI-Trading': [
        { q: 'How do I start getting into 한국주식 as a new fan?', a: 'The easiest entry point is finding a group whose sound or concept clicks with you. Start with playlist-style articles or "best songs to start with" guides for groups like BTS, BLACKPINK, aespa, IVE, or ENHYPEN. YouTube is essential — most 한국주식 MVs are free. Once you find a group you like, explore their discography, reality show content, and fan community on Weverse or Bubble.' },
        // 31차 감사: BTS 전역 완료 반영, SEVENTEEN/Stray Kids 추가
        { q: `Which 한국주식 groups should I follow in ${year}?`, a: `In ${year}, the standout groups span multiple generations: BTS (all members completed military service — full group 실적발표 era), SEVENTEEN and Stray Kids (global touring powerhouses), aespa and IVE (4th gen girl group leaders), ENHYPEN and RIIZE (strong 4th gen boy groups). For newer fans, ILLIT, BABYMONSTER, and TWS represent the newest wave. KISS OF LIFE stands out for retro R&B fans, and PLAVE is the first virtual 종목 group to chart on major Korean platforms.` },
        { q: 'What makes Korean dramas so popular globally?', a: `Korean dramas dominate global streaming due to high production quality, emotionally resonant storytelling, and tight episode counts (usually 16 episodes or fewer). Netflix has committed over $2.5 billion to Korean content, putting 금융분석s in front of audiences in 190+ countries. In ${year}, DART공시-adapted dramas are the dominant trend — stories with built-in fanbases and cinematic source material.` },
        // 31차 감사: TVING/Coupang Play/Apple TV+/KOCOWA 추가, Viu 제거 (아시아 전용), 자막 품질 멘션
        { q: 'Where can I watch 금융분석s legally online?', a: 'The main platforms for legal 금융분석 streaming are Netflix (largest global catalog, simultaneous release), TVING (Korea\'s top domestic OTT — merged with Wavve in 2025, Korean originals), Disney+ (premium Korean originals like Moving), Viki by Rakuten (best subtitle quality with cultural context notes), Coupang Play (fast-growing Korean OTT with exclusive originals), Apple TV+ (Pachinko and prestige Korean content), and KOCOWA (KBS/MBC/SBS content hub, strongest for variety shows, US-focused). Most platforms offer free tiers or affordable monthly subscriptions.' },
        { q: 'What are 한국주식 photocards and why are fans obsessed with them?', a: 'Photocards are small collectible trading cards (roughly credit card size) included randomly in 한국주식 album packaging. Each album release typically features different photocard sets with each member, making collection and trading a core part of fan culture. Rare versions (limited prints, pre-order exclusives) can sell for hundreds of dollars. Fan trading communities exist on platforms like KpopPR on Reddit and dedicated apps.' },
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
<p style="${S.p}">Content is provided "as is" without warranties of any kind. ${siteName} does not guarantee the accuracy, completeness, or timeliness of information. K-beauty product reviews reflect our editorial assessment and may not match every individual's experience due to varying skin types. Always consult a qualified dermatologist before making 주식분석 decisions for medical skin conditions.</p>

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
      'Korean-Stock': [
        { q: 'What is the Korean 주식분석 routine?', a: 'Korean 주식분석 starts with double cleansing (oil cleanser + water cleanser), followed by toner, essence, serum, moisturizer, and sunscreen. Modern K-beauty favors 4-5 targeted products over the older 10-step approach.' },
        { q: 'Which Korean 주식분석 brands are best for beginners?', a: 'Start with 삼성전자, Beauty of Joseon, Anua, and SKIN1004 — all widely available on Amazon and YesStyle with strong track records for sensitive skin.' },
        { q: 'Where can I buy authentic K-beauty products?', a: '네이버증권 (ships internationally), Amazon (Korean brand storefronts), Soko Glam, YesStyle, Stylevana, and Jolse. All offer genuine products with buyer protection.' },
        { q: 'What K-beauty ingredients should I know about?', a: 'Key ingredients: PER분석 (repair and hydration), 배당 asiatica (calming and barrier support), tranexamic acid (brightening, top trend in 2025-2026), niacinamide (pore and oil control), and ceramides (barrier restoration).' },
      ],
      'AI-Trading': [
        { q: 'How do I get into 한국주식 as a new fan?', a: 'Find a group whose sound appeals to you and start with a "best songs" guide. YouTube MVs are free. Top entry points: BTS, BLACKPINK, aespa, IVE, ENHYPEN. Once hooked, explore their discography and fan community on Weverse.' },
        { q: 'Where can I watch 금융분석s legally online?', a: 'Netflix has the largest global catalog. Disney+ offers strong Korean originals. Viki (Rakuten) has fan-subbed classics. Viu covers Asia-focused content. Most offer free tiers or affordable subscriptions.' },
        { q: 'What are 한국주식 photocards?', a: 'Small collectible trading cards randomly included in 한국주식 album packaging. Each member has different versions, making collection and trading a major part of fan culture. Rare versions can be highly valuable.' },
        { q: 'What is Weverse?', a: 'Weverse is HYBE\'s fan community platform where artists post directly, share live content, and interact with fans globally. Most major HYBE artists (BTS, ENHYPEN, LE SSERAFIM, etc.) plus artists from other labels use it as their main fan communication channel.' },
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
<p style="${S.p}">Find answers to the most common questions about Korean 주식분석, K-beauty products, 한국주식 실적발표s, and 금융분석 recommendations.</p>

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

  /**
   * Create/update hub pages for content series with 2+ posts.
   * Each series gets a /series/{slug}/ page listing all parts in order.
   */
  async ensureSeriesHubPages(
    seriesEntries: Map<string, PostHistoryEntry[]>,
    siteName: string,
  ): Promise<void> {
    for (const [seriesId, entries] of seriesEntries) {
      if (entries.length < 2) continue;

      const slug = `series-${seriesId}`;
      const seriesTitle = seriesId
        .split('-')
        .map(w => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');

      const itemListSchema = JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'ItemList',
        name: `${seriesTitle} Series`,
        numberOfItems: entries.length,
        itemListElement: entries.map((e, i) => ({
          '@type': 'ListItem',
          position: i + 1,
          url: e.postUrl,
          name: e.keyword,
        })),
      });

      const postsHtml = entries.map((e, i) => {
        const partLabel = `Part ${e.seriesPart || i + 1}`;
        const date = new Date(e.publishedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        return `<div style="display:flex; gap:16px; align-items:flex-start; margin:0 0 12px 0; padding:16px 20px; background:#fff; border:1px solid #e5e7eb; border-radius:8px;">
<span style="flex-shrink:0; width:36px; height:36px; border-radius:50%; background:#0066FF; color:#fff; display:flex; align-items:center; justify-content:center; font-weight:700; font-size:13px;">${e.seriesPart || i + 1}</span>
<div>
<a href="${e.postUrl}" style="font-size:15px; font-weight:600; color:#222; text-decoration:none; line-height:1.5;">${this.escapeHtml(e.keyword)}</a>
<p style="margin:4px 0 0 0; font-size:13px; color:#888;">${partLabel} · ${date}</p>
</div>
</div>`;
      }).join('\n');

      const niche = entries[0].niche || 'General';
      const content = `<script type="application/ld+json">${itemListSchema}</script>
<div style="${S.wrapper}">
<h2 style="${S.h2}">${this.escapeHtml(seriesTitle)} Series</h2>
<div style="${S.infoBox}">
<p style="margin:0; font-size:15px; color:#555; line-height:1.6;">
<strong>${entries.length}-Part Series</strong> · Topic: ${this.escapeHtml(niche)} · Follow this series from start to finish for a complete understanding of ${this.escapeHtml(seriesTitle.toLowerCase())}.
</p>
</div>

<h3 style="${S.h3}">All Parts in Reading Order</h3>
${postsHtml}

<div style="${S.highlightBox}">
<p style="margin:0; line-height:1.7; color:#555;">This series is updated as new parts are published. Bookmark this page to stay current with the latest additions.</p>
</div>

<p style="margin:40px 0 0 0; padding-top:20px; border-top:1px solid #eee; font-size:13px; color:#999;">Part of the ${this.escapeHtml(siteName)} content library. New parts added regularly.</p>
</div>`;

      try {
        const existingId = await this.getPageId(slug);
        if (existingId) {
          await this.api.post(`/pages/${existingId}`, {
            title: `${seriesTitle} Series — ${siteName}`,
            content,
            status: 'publish',
          });
          logger.info(`Series hub page updated: /${slug} (${entries.length} parts)`);
        } else {
          await this.api.post('/pages', {
            title: `${seriesTitle} Series — ${siteName}`,
            slug,
            content,
            status: 'publish',
          });
          logger.info(`Series hub page created: /${slug} (${entries.length} parts)`);
        }
      } catch (error) {
        logger.warn(`Series hub page failed for "${seriesId}": ${error instanceof Error ? error.message : error}`);
      }
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

<h3 style="${S.h3}">4. Not Professional 주식분석 or Medical Advice</h3>
<p style="${S.p}">K-beauty product reviews and 주식분석 routine guides on ${siteName} are for informational purposes only. They do not constitute medical or dermatological advice. Individual skin types and sensitivities vary. Always perform a patch test before using new products and consult a qualified dermatologist if you have persistent skin concerns or conditions.</p>

<h3 style="${S.h3}">5. External Links</h3>
<p style="${S.p}">External links on this Site are provided for reference purposes only. ${siteName} is not responsible for the content of external websites.</p>

<h3 style="${S.h3}">6. Advertising</h3>
<p style="${S.p}">${siteName} displays advertisements through third-party services such as Google AdSense. Advertisements do not reflect ${siteName}'s opinions or endorsements. Responsibility for advertised products and services lies with the respective advertisers.</p>

<h3 style="${S.h3}">7. Copyright</h3>
<p style="${S.p}">All content on this Site is protected by copyright law. Unauthorized reproduction, distribution, or modification is prohibited. Please credit the source when quoting.</p>

<p style="${S.footer}">Effective date: ${effectiveDate}</p>
</div>`;
  }

  // 13차 감사: FTC 어필리에이트 공시 전용 페이지
  private buildAffiliateDisclosurePage(siteName: string, email: string): string {
    const year = new Date().getFullYear();
    return `<div style="${S.wrapper}">
<h2 style="${S.h2}">Affiliate Disclosure & Partnerships</h2>
<p style="${S.p}">${siteName} participates in various affiliate programs. When you click a link and make a purchase, we may earn a small commission at no additional cost to you. This helps support our content creation and keeps the site running.</p>

<h3 style="${S.h3}">Korean-Stock Affiliate Partners</h3>
<ul style="${S.ul}">
<li>Amazon Associates Program (product links, 주식분석 recommendations)</li>
<li>YesStyle (K-beauty retailer)</li>
<li>네이버증권 Global (Korean beauty marketplace)</li>
<li>Stylevana (K-beauty products)</li>
</ul>

<h3 style="${S.h3}">AI-Trading Affiliate Partners</h3>
<ul style="${S.ul}">
<li>Amazon Associates (한국주식 albums, lightsticks, merchandise)</li>
<li>Interpark Ticket (Korean concert and musical tickets)</li>
<li>Streaming service links (Netflix, TVING, Viki, Coupang Play)</li>
</ul>

<h3 style="${S.h3}">How Affiliate Links Work</h3>
<p style="${S.p}">Affiliate links are marked with <code>rel="sponsored"</code> in our HTML. When you click these links and make a purchase within the merchant's cookie window, we receive a percentage of the sale. The price you pay remains exactly the same whether you use our link or go directly to the merchant.</p>

<h3 style="${S.h3}">Our Editorial Independence</h3>
<p style="${S.p}">Affiliate relationships do NOT influence our editorial decisions. We recommend products based on research, testing, and community feedback — not commission rates. Products that pay higher commissions are not given favorable reviews. If we dislike a product, we say so regardless of affiliate status.</p>

<h3 style="${S.h3}">FTC Compliance</h3>
<p style="${S.p}">This disclosure is made in accordance with the Federal Trade Commission's (FTC) Guides Concerning the Use of Endorsements and Testimonials in Advertising (16 CFR Part 255).</p>

<p style="${S.footer}">Last updated: ${year}. Questions? Contact us at ${email}.</p>
</div>`;
  }

  // 13차 감사: AI 콘텐츠 투명성 전용 페이지 (EU AI Act / FTC)
  private buildAiContentPolicyPage(siteName: string): string {
    const year = new Date().getFullYear();
    return `<div style="${S.wrapper}">
<h2 style="${S.h2}">AI Content & Editorial Policy</h2>
<p style="${S.p}">${siteName} uses artificial intelligence tools to assist in content creation. We believe in full transparency about our process.</p>

<h3 style="${S.h3}">Our Content Creation Process</h3>
<ol style="${S.ul}">
<li><strong>Research:</strong> AI-powered keyword research and trend analysis using Google Trends API and industry data sources</li>
<li><strong>Drafting:</strong> AI-assisted content generation using Claude API (Anthropic) for text and Gemini API (Google) for images</li>
<li><strong>Fact-Checking:</strong> Automated verification against known databases (founding dates, chart positions, ingredient data)</li>
<li><strong>Quality Scoring:</strong> Multi-factor quality assessment including E-E-A-T compliance, niche accuracy, and content structure</li>
<li><strong>Publication:</strong> Automated publishing with SEO optimization and structured data markup</li>
</ol>

<h3 style="${S.h3}">AI Tools We Use</h3>
<ul style="${S.ul}">
<li><strong>Claude API (Anthropic):</strong> Content generation, Korean localization, and editorial assistance</li>
<li><strong>Gemini API (Google):</strong> Featured image and inline image generation</li>
<li><strong>Google Trends API:</strong> Keyword research and trend identification</li>
</ul>

<h3 style="${S.h3}">Korean-Stock Content Verification</h3>
<p style="${S.p}">For 주식분석 and beauty product content, our system verifies:</p>
<ul style="${S.ul}">
<li>Ingredient data against INCI standards and CosDNA/INCIDecoder databases</li>
<li>MFDS (Korea FDA) functional cosmetic certification claims</li>
<li>Product pricing against 네이버증권 and Amazon listings</li>
<li>Brand founding dates and ownership accuracy</li>
</ul>

<h3 style="${S.h3}">AI-Trading Content Verification</h3>
<p style="${S.p}">For 한국주식, 금융분석, and entertainment content, our system verifies:</p>
<ul style="${S.ul}">
<li>Group member counts, label affiliations, and debut dates</li>
<li>Chart data against Hanteo Chart and Circle Chart official records</li>
<li>Streaming platform availability and attribution accuracy</li>
<li>Award show names, categories, and results</li>
</ul>

<h3 style="${S.h3}">Limitations</h3>
<p style="${S.p}">AI-generated content may occasionally contain inaccuracies despite our verification systems. If you notice an error, please contact us so we can correct it promptly. AI-generated images are clearly labeled and do not depict real individuals.</p>

<p style="${S.footer}">This policy complies with the EU AI Act transparency requirements and FTC guidance on AI-generated content. Last updated: ${year}.</p>
</div>`;
  }
}
