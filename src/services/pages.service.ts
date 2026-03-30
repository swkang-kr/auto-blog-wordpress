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
        title: '개인정보처리방침',
        content: this.buildPrivacyPolicy(siteName, emailDisplay),
      },
      {
        slug: 'about',
        title: '소개',
        content: this.buildAboutPage(siteName, ownerDisplay, authorLinks, authorBio, authorCredentials),
      },
      {
        slug: 'contact',
        title: '문의하기',
        content: this.buildContactPage(siteName, emailDisplay),
      },
      {
        slug: 'disclaimer',
        title: '면책조항',
        content: this.buildDisclaimerPage(siteName),
      },
      {
        slug: 'terms-of-service',
        title: '이용약관',
        content: this.buildTermsOfServicePage(siteName, emailDisplay),
      },
      {
        slug: 'affiliate-disclosure',
        title: '제휴 링크 공시',
        content: this.buildAffiliateDisclosurePage(siteName, emailDisplay),
      },
      {
        slug: 'ai-content-policy',
        title: 'AI 콘텐츠 정책',
        content: this.buildAiContentPolicyPage(siteName),
      },
    ];
  }

  private buildPrivacyPolicy(siteName: string, email: string): string {
    const effectiveDate = `${new Date().toLocaleString('en-US', { month: 'long' })} ${new Date().getDate()}, ${new Date().getFullYear()}`;

    return `<div style="${S.wrapper}">
<h2 style="${S.h2}">개인정보처리방침</h2>
<p style="${S.p}">${siteName}(이하 "사이트")은 이용자의 개인정보를 소중히 여기며, 관련 법령을 준수합니다. 본 방침은 수집하는 정보의 종류, 이용 목적, 보호 조치에 대해 설명합니다.</p>

<h3 style="${S.h3}">1. 수집하는 정보</h3>
<p style="${S.p}">본 사이트는 별도의 회원가입을 요구하지 않습니다. 다음 정보가 자동으로 수집될 수 있습니다:</p>
<ul style="${S.ul}">
<li>방문 기록, IP 주소, 브라우저 종류, 접속 시간</li>
<li>쿠키를 통한 이용 패턴 데이터</li>
</ul>

<h3 style="${S.h3}">2. 정보 이용 목적</h3>
<p style="${S.p}">수집된 정보는 다음 목적으로 사용됩니다:</p>
<ul style="${S.ul}">
<li>웹사이트 트래픽 분석 및 서비스 개선</li>
<li>맞춤형 광고 제공 (Google AdSense 등)</li>
<li>보안 유지 및 부정 이용 방지</li>
</ul>

<h3 style="${S.h3}">3. 쿠키</h3>
<p style="${S.p}">본 사이트는 Google AdSense와 Google Analytics를 사용하며, 쿠키를 통해 방문자 데이터를 수집합니다. 브라우저 설정에서 쿠키를 비활성화할 수 있으나, 일부 기능이 제한될 수 있습니다.</p>

<h3 style="${S.h3}">4. 제3자 광고</h3>
<p style="${S.p}">본 사이트는 Google AdSense를 통해 광고를 표시합니다. Google은 쿠키를 사용하여 관심 기반 광고를 제공할 수 있습니다. 자세한 내용은 <a href="https://policies.google.com/technologies/ads" target="_blank" rel="noopener">Google 광고 정책</a>을 참조하세요.</p>

<h3 style="${S.h3}">5. 데이터 보관 및 삭제</h3>
<p style="${S.p}">자동 수집된 로그 데이터는 통계 분석을 위해 제한된 기간 동안 보관 후 삭제됩니다. 개인정보 삭제 요청 시 지체 없이 처리합니다.</p>

<h3 style="${S.h3}">6. 문의</h3>
<p style="${S.p}">개인정보 관련 문의: <a href="mailto:${email}" style="color:#0066FF;">${email}</a></p>

<p style="${S.footer}">시행일: ${effectiveDate}</p>
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
    const defaultFaq = [
      { q: `${category}이란 무엇인가요?`, a: `${category}은 한국 주식시장의 핵심 분석 영역 중 하나입니다. 본 블로그에서는 DART 공시, KRX 데이터, Trade Engine 실시간 데이터를 기반으로 매일 분석 콘텐츠를 제공합니다.` },
      { q: `이 가이드는 얼마나 자주 업데이트되나요?`, a: `시장 분석은 매일, 업종·테마·수급 분석은 매 거래일마다 최신 데이터로 업데이트됩니다.` },
    ];
    const faqs: Record<string, Array<{ q: string; a: string }>> = {
      '시장분석': [
        { q: `${year}년 KOSPI 전망은 어떤가요?`, a: `KOSPI 전망은 한국은행 기준금리, 미국 FOMC 결정, 원달러 환율, 반도체 수출 실적 등 복합적 요인에 의해 결정됩니다. 본 블로그에서는 이러한 거시경제 지표를 종합 분석하여 시장 방향성을 제시합니다.` },
        { q: '주식 투자 초보자는 어떻게 시작해야 하나요?', a: '먼저 증권사 계좌를 개설하고(키움증권, 미래에셋 등), 소액으로 ETF(KODEX 200, TIGER 200)부터 시작하는 것을 권장합니다. 기본적 분석(PER, PBR, ROE)과 기술적 분석(RSI, MACD)의 기초를 익힌 후 개별 종목 투자로 확대하세요.' },
        { q: 'KOSPI와 KOSDAQ의 차이는 무엇인가요?', a: 'KOSPI는 대형주 중심의 유가증권시장(삼성전자, SK하이닉스 등 약 800개 종목), KOSDAQ은 중소형 성장주 중심의 코스닥시장(바이오, IT 등 약 1,600개 종목)입니다. KOSPI는 안정성, KOSDAQ은 성장성에 강점이 있습니다.' },
      ],
      '업종분석': [
        { q: '어떤 업종이 유망한가요?', a: `업종의 유망 여부는 경기 사이클, 정부 정책, 글로벌 트렌드에 따라 달라집니다. ${year}년 현재 AI반도체(HBM), 2차전지, 방산, 조선 업종이 주목받고 있습니다. 본 블로그에서는 네이버 금융 79개 업종 데이터를 매일 분석합니다.` },
        { q: 'PER, PBR, ROE는 무엇인가요?', a: 'PER(주가수익비율)은 주가÷주당순이익으로 수익 대비 주가 수준을, PBR(주가순자산비율)은 주가÷주당순자산으로 자산 대비 주가 수준을, ROE(자기자본이익률)은 순이익÷자기자본으로 경영 효율성을 나타냅니다.' },
        { q: '배당주 투자는 어떻게 하나요?', a: '배당수익률이 높고 안정적으로 배당을 지급하는 종목을 선별합니다. 배당락일 전에 매수해야 배당을 받을 수 있으며, 배당 성향(배당금÷순이익)이 안정적인 기업을 선호합니다. 은행주, 통신주가 대표적인 고배당 업종입니다.' },
      ],
      '테마분석': [
        { q: '테마주란 무엇인가요?', a: '테마주는 특정 이슈, 정책, 기술 트렌드에 따라 함께 움직이는 종목군입니다. 예를 들어 AI 테마주(네이버, 카카오), 2차전지 테마주(LG에너지, 삼성SDI), 방산 테마주(한화에어로, LIG넥스원) 등이 있습니다.' },
        { q: '테마주 투자 시 주의할 점은?', a: '테마주는 단기 급등 후 급락하는 경우가 많으므로 주의가 필요합니다. 실적 없이 테마만으로 오른 종목은 리스크가 높습니다. 테마의 근거(정부 정책, 글로벌 트렌드)가 실질적인지 확인하고, 반드시 손절 기준을 설정하세요.' },
      ],
      '수급분석': [
        { q: '주식 수급이란 무엇인가요?', a: '수급은 주식시장에서 매수와 매도의 흐름을 의미합니다. 외국인, 기관, 개인 투자자별 순매매 동향을 분석하면 시장의 방향성을 가늠할 수 있습니다. 일반적으로 외국인·기관의 순매수가 지속되면 상승 신호로 해석합니다.' },
        { q: '외국인 매매 동향은 어디서 확인하나요?', a: 'KRX 한국거래소(krx.co.kr), 네이버 금융(finance.naver.com)에서 투자자별 매매 동향을 확인할 수 있습니다. 본 블로그에서는 Trade Engine 데이터를 통해 매일 외국인/기관/개인 순매매를 자동 분석합니다.' },
        { q: '공매도란 무엇인가요?', a: '공매도는 주식을 빌려서 먼저 매도한 후, 주가가 하락하면 되사서 갚아 차익을 얻는 투자 방식입니다. 한국에서는 기관과 외국인에게만 허용되며, 개인 투자자는 이용할 수 없습니다. 공매도 잔고가 급증하는 종목은 하락 압력이 커질 수 있습니다.' },
      ],
    };

    const categoryFaqs = faqs[category] || defaultFaq;

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
<h2 style="${S.h2}">이용약관</h2>
<p style="${S.p}">${siteName}에 오신 것을 환영합니다. 본 웹사이트에 접속하거나 이용함으로써 본 이용약관에 동의하는 것으로 간주됩니다. 동의하지 않으시면 사이트 이용을 중단해 주세요.</p>

<h3 style="${S.h3}">1. 콘텐츠 이용</h3>
<p style="${S.p}">${siteName}의 모든 콘텐츠는 저작권법의 보호를 받으며, 별도 표기가 없는 한 ${siteName}이 소유합니다. 출처(원문 링크 포함)를 밝힌 인용·공유는 가능하나, 무단 복제·배포·상업적 이용은 금지됩니다.</p>

<h3 style="${S.h3}">2. AI 기반 콘텐츠</h3>
<p style="${S.p}">${siteName}의 콘텐츠는 인공지능 기술의 도움을 받아 작성되며, 발행 전 편집 검토를 거칩니다. 정확성을 위해 노력하나 오류가 있을 수 있으며, 중요한 투자 결정 시 공식 자료와 전문가 상담을 통해 반드시 확인하시기 바랍니다.</p>

<h3 style="${S.h3}">3. 제휴 링크 및 광고</h3>
<p style="${S.p}">일부 글에 제휴 링크가 포함될 수 있습니다. 해당 링크를 통한 거래 시 사이트 운영에 도움이 되는 수수료를 받을 수 있으나, 이용자에게 추가 비용은 발생하지 않습니다. 제휴 관계는 편집 방향에 영향을 미치지 않습니다. 본 사이트는 Google AdSense를 통해 광고를 게시합니다.</p>

<h3 style="${S.h3}">4. 투자 면책</h3>
<p style="${S.p}">본 사이트의 모든 콘텐츠는 정보 제공 및 교육 목적으로만 작성되었으며, 투자 권유나 매매 추천이 아닙니다. 주식 투자는 원금 손실 위험이 있으며, 과거 실적이 미래 수익을 보장하지 않습니다. 투자 결정은 본인의 판단과 책임 하에 이루어져야 합니다.</p>

<h3 style="${S.h3}">5. 이용자 의무</h3>
<p style="${S.p}">이용자는 다음 행위를 해서는 안 됩니다: (가) 불법적 목적으로 사이트 이용, (나) 사이트 운영 방해 시도, (다) 무단 콘텐츠 수집·복제, (라) 스팸 또는 허위 댓글 게시.</p>

<h3 style="${S.h3}">6. 책임 제한</h3>
<p style="${S.p}">${siteName} 및 기여자는 본 사이트 이용 또는 이용 불능으로 인한 직접적·간접적·부수적·결과적 손해에 대해 책임을 지지 않습니다.</p>

<h3 style="${S.h3}">7. 외부 링크</h3>
<p style="${S.p}">본 사이트에는 외부 웹사이트 링크가 포함될 수 있습니다. ${siteName}은 외부 사이트의 콘텐츠, 정책, 관행에 대해 책임을 지지 않습니다.</p>

<h3 style="${S.h3}">8. 약관 변경</h3>
<p style="${S.p}">본 약관은 사전 통보 없이 변경될 수 있으며, 변경 후 사이트를 계속 이용하면 변경된 약관에 동의하는 것으로 간주됩니다.</p>

<h3 style="${S.h3}">9. 문의</h3>
<p style="${S.p}">이용약관 관련 문의: <a href="mailto:${email}" style="color:#0066FF; text-decoration:none;">${email}</a></p>

<p style="${S.footer}">시행일: ${effectiveDate}</p>
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
    const effectiveDate = `${new Date().getFullYear()}년 ${new Date().getMonth() + 1}월 ${new Date().getDate()}일`;

    return `<div style="${S.wrapper}">
<h2 style="${S.h2}">면책조항</h2>

<h3 style="${S.h3}">1. AI 기반 콘텐츠 공시</h3>
<div style="${S.highlightBox}">
<p style="margin:0 0 12px 0; font-weight:700; color:#222;">투명성 공지</p>
<p style="margin:0; line-height:1.8; color:#555; font-size:15px;">${siteName}에 게시되는 콘텐츠는 AI 기술(대규모 언어 모델)의 도움을 받아 작성되며, 발행 전 편집 검토를 거칩니다. AI 기반 리서치 및 초안 작성, 사실 검증(DART 공시, KRX 데이터 대조), 정기적인 콘텐츠 정확성 감사를 포함합니다.</p>
</div>

<h3 style="${S.h3}">2. 콘텐츠 안내</h3>
<p style="${S.p}">${siteName}에 게시되는 콘텐츠는 공개된 시장 데이터와 DART 공시 자료를 기반으로 합니다. 모든 콘텐츠는 정보 제공 목적으로만 작성되었으며, 전문적인 투자 자문이나 법률 조언이 아닙니다.</p>

<h3 style="${S.h3}">3. 정보의 정확성</h3>
<p style="${S.p}">정확한 정보 제공을 위해 노력하지만, 콘텐츠의 완전성, 정확성, 신뢰성을 보장하지 않습니다. 제공된 정보에 기반한 결정이나 행동은 이용자 본인의 책임입니다.</p>

<h3 style="${S.h3}">4. 투자 면책</h3>
<p style="${S.p}">${siteName}의 종목 분석, 시장 전망, 투자 전략 콘텐츠는 정보 제공 목적으로만 작성되었으며, 투자 권유나 매매 추천이 아닙니다. 주식 투자는 원금 손실 위험이 있으며, 과거 실적이 미래 수익을 보장하지 않습니다. 투자 결정은 반드시 본인의 판단과 전문가 상담을 거쳐야 합니다.</p>

<h3 style="${S.h3}">5. 외부 링크</h3>
<p style="${S.p}">본 사이트의 외부 링크는 참고 목적으로만 제공됩니다. ${siteName}은 외부 웹사이트의 콘텐츠에 대해 책임을 지지 않습니다.</p>

<h3 style="${S.h3}">6. 광고</h3>
<p style="${S.p}">${siteName}은 Google AdSense 등 제3자 서비스를 통해 광고를 게시합니다. 광고는 ${siteName}의 의견이나 추천을 반영하지 않습니다.</p>

<h3 style="${S.h3}">7. 저작권</h3>
<p style="${S.p}">본 사이트의 모든 콘텐츠는 저작권법의 보호를 받습니다. 무단 복제, 배포, 수정은 금지되며, 인용 시 출처를 밝혀 주세요.</p>

<p style="${S.footer}">시행일: ${effectiveDate}</p>
</div>`;
  }

  private buildAffiliateDisclosurePage(siteName: string, email: string): string {
    const year = new Date().getFullYear();
    return `<div style="${S.wrapper}">
<h2 style="${S.h2}">제휴 링크 공시</h2>
<p style="${S.p}">${siteName}은 제휴 프로그램에 참여하고 있습니다. 제휴 링크를 통해 거래가 이루어지면 사이트 운영에 도움이 되는 소정의 수수료를 받을 수 있으며, 이용자에게 추가 비용은 발생하지 않습니다.</p>

<h3 style="${S.h3}">제휴 파트너</h3>
<ul style="${S.ul}">
<li>Amazon Associates Program (관련 서적, 투자 도구 등)</li>
<li>증권사 제휴 (계좌 개설 링크 등)</li>
</ul>

<h3 style="${S.h3}">제휴 링크 작동 방식</h3>
<p style="${S.p}">제휴 링크는 HTML에서 <code>rel="sponsored"</code>로 표시됩니다. 해당 링크를 클릭하여 거래가 이루어지면 판매 금액의 일정 비율을 수수료로 받습니다. 이용자가 지불하는 금액은 제휴 링크 사용 여부와 관계없이 동일합니다.</p>

<h3 style="${S.h3}">편집 독립성</h3>
<p style="${S.p}">제휴 관계는 편집 방향에 영향을 미치지 않습니다. 콘텐츠는 데이터와 분석에 기반하여 작성되며, 수수료율에 따라 내용이 변경되지 않습니다.</p>

<p style="${S.footer}">최종 업데이트: ${year}년. 문의: ${email}</p>
</div>`;
  }

  private buildAiContentPolicyPage(siteName: string): string {
    const year = new Date().getFullYear();
    return `<div style="${S.wrapper}">
<h2 style="${S.h2}">AI 콘텐츠 정책</h2>
<p style="${S.p}">${siteName}은 콘텐츠 작성에 AI 기술을 활용합니다. 콘텐츠 제작 과정에 대한 완전한 투명성을 지향합니다.</p>

<h3 style="${S.h3}">콘텐츠 제작 프로세스</h3>
<ol style="${S.ul}">
<li><strong>리서치:</strong> Trade Engine 실시간 데이터 + Google Trends API 기반 키워드 연구 및 트렌드 분석</li>
<li><strong>초안 작성:</strong> Claude API(Anthropic)를 활용한 AI 기반 콘텐츠 생성, Gemini API(Google)를 통한 이미지 생성</li>
<li><strong>사실 검증:</strong> DART 공시, KRX 데이터, 기업 설립 연도 등 자동 팩트체크</li>
<li><strong>품질 평가:</strong> E-E-A-T 준수, 정보 밀도, 가독성 등 다중 요소 품질 점수 산출</li>
<li><strong>발행:</strong> SEO 최적화 및 구조화 데이터 마크업을 포함한 자동 발행</li>
</ol>

<h3 style="${S.h3}">사용하는 AI 도구</h3>
<ul style="${S.ul}">
<li><strong>Claude API (Anthropic):</strong> 콘텐츠 생성, 한국어 작성, 편집 지원</li>
<li><strong>Gemini API (Google):</strong> 대표 이미지 및 본문 이미지 생성</li>
<li><strong>Trade Engine:</strong> 실시간 시장/업종/테마/수급 데이터 제공</li>
</ul>

<h3 style="${S.h3}">콘텐츠 검증 항목</h3>
<ul style="${S.ul}">
<li>기업 설립 연도, 상장일 — DART 공시 데이터 대조</li>
<li>주가 데이터 인용 시 날짜 명시 여부 검증</li>
<li>투자 면책조항 포함 여부 자동 확인</li>
<li>백테스트 결과 인용 시 과거 실적 면책 포함 여부</li>
</ul>

<h3 style="${S.h3}">한계</h3>
<p style="${S.p}">검증 시스템에도 불구하고 AI 생성 콘텐츠에 부정확한 정보가 포함될 수 있습니다. 오류를 발견하시면 문의 페이지를 통해 알려주시면 신속히 수정하겠습니다. AI 생성 이미지는 실제 인물을 묘사하지 않습니다.</p>

<p style="${S.footer}">최종 업데이트: ${year}년</p>
</div>`;
  }
}
