/**
 * patch-existing-posts.ts
 * 기존 발행된 포스트에 누락된 요소를 일괄 패치합니다:
 * - AI Disclosure 라벨
 * - Last Updated 배너
 * - Niche-specific disclaimer (finance/beauty)
 * - AdSense ad placements
 * - Comment engagement prompt
 * - General disclaimer (없는 경우)
 *
 * Usage:
 *   npx tsx src/scripts/patch-existing-posts.ts --dry-run
 *   npx tsx src/scripts/patch-existing-posts.ts
 */
import 'dotenv/config';
import axios, { type AxiosInstance } from 'axios';

const WP_URL = process.env.WP_URL!;
const WP_USERNAME = process.env.WP_USERNAME!;
const WP_APP_PASSWORD = process.env.WP_APP_PASSWORD!;
const ADSENSE_PUB_ID = process.env.ADSENSE_PUB_ID || '';
const DRY_RUN = process.argv.includes('--dry-run');

if (!WP_URL || !WP_USERNAME || !WP_APP_PASSWORD) {
  console.error('Missing required env vars: WP_URL, WP_USERNAME, WP_APP_PASSWORD');
  process.exit(1);
}

const token = Buffer.from(`${WP_USERNAME}:${WP_APP_PASSWORD}`).toString('base64');
const api: AxiosInstance = axios.create({
  baseURL: `${WP_URL.replace(/\/+$/, '')}/wp-json/wp/v2`,
  headers: { Authorization: `Basic ${token}` },
  timeout: 30000,
});

// ── HTML snippets ──

const AI_DISCLOSURE = `<div class="ab-ai-disclosure" style="margin:0 0 16px 0; padding:10px 16px; background:#f8f9fa; border:1px solid #e5e7eb; border-radius:8px; font-size:11px; color:#888; line-height:1.5;"><strong>Transparency:</strong> This article was created with AI assistance and editorially reviewed. Sources include Korean-language primary data. <a href="/disclaimer/" style="color:#0066FF;">Learn more</a>.</div>`;

function makeLastUpdatedBanner(dateStr: string): string {
  const d = new Date(dateStr);
  const formatted = d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const year = d.getFullYear();
  return `<div style="background:#f0f8ff; border-left:4px solid #0066FF; padding:12px 20px; margin:0 0 24px 0; border-radius:0 8px 8px 0; font-size:14px; color:#555;"><strong>Last Updated:</strong> ${formatted} — Updated with the latest information for ${year}.</div>`;
}

const COMMENT_PROMPT = `<div class="ab-comment-prompt" style="margin:32px 0; padding:20px 24px; background:#f8f9fa; border-left:4px solid #0066FF; border-radius:0 8px 8px 0;">
<p style="margin:0 0 8px 0; font-size:17px; font-weight:700; color:#222;">💬 Your Turn</p>
<p style="margin:0; font-size:14px; color:#555; line-height:1.6;">What's your take on this? Share your experience or questions in the comments — we read and respond to every one.</p>
<p style="margin:8px 0 0 0;"><a href="#respond" style="color:#0066FF; font-weight:600; text-decoration:none; font-size:14px;">Jump to comments &darr;</a></p></div>`;

const GENERAL_DISCLAIMER = `<p class="ab-disclaimer" style="margin:40px 0 0 0; padding-top:20px; border-top:1px solid #eee; font-size:13px; color:#999; line-height:1.6;">This article is AI-assisted and editorially reviewed. Content is based on trending information, Korean-language primary sources, and publicly available data. It is intended for informational purposes only. Please verify details through official sources.</p>`;

const NICHE_DISCLAIMERS: Record<string, string> = {
  '시장분석': '<div class="ab-disclaimer-finance" style="margin:0 0 24px 0; padding:16px 20px; background:#f0f8ff; border:1px solid #bee3f8; border-radius:8px; font-size:13px; color:#666; line-height:1.6;"><strong>투자 유의사항:</strong> 본 콘텐츠는 정보 제공 목적으로 작성되었으며, 투자 권유나 매매 신호가 아닙니다. 투자 판단의 책임은 투자자 본인에게 있으며, 투자 전 전문가 상담을 권장합니다.</div>',
  '업종분석': '<div class="ab-disclaimer-finance" style="margin:0 0 24px 0; padding:16px 20px; background:#f0f8ff; border:1px solid #bee3f8; border-radius:8px; font-size:13px; color:#666; line-height:1.6;"><strong>투자 유의사항:</strong> 본 콘텐츠는 정보 제공 목적으로 작성되었으며, 투자 권유나 매매 신호가 아닙니다. 투자 판단의 책임은 투자자 본인에게 있으며, 투자 전 전문가 상담을 권장합니다.</div>',
  '테마분석': '<div class="ab-disclaimer-finance" style="margin:0 0 24px 0; padding:16px 20px; background:#f0f8ff; border:1px solid #bee3f8; border-radius:8px; font-size:13px; color:#666; line-height:1.6;"><strong>투자 유의사항:</strong> 본 콘텐츠는 정보 제공 목적으로 작성되었으며, 투자 권유나 매매 신호가 아닙니다. 투자 판단의 책임은 투자자 본인에게 있으며, 투자 전 전문가 상담을 권장합니다.</div>',
  '종목분석': '<div class="ab-disclaimer-finance" style="margin:0 0 24px 0; padding:16px 20px; background:#f0f8ff; border:1px solid #bee3f8; border-radius:8px; font-size:13px; color:#666; line-height:1.6;"><strong>투자 유의사항:</strong> 본 콘텐츠는 정보 제공 목적으로 작성되었으며, 투자 권유나 매매 신호가 아닙니다. 투자 판단의 책임은 투자자 본인에게 있으며, 투자 전 전문가 상담을 권장합니다.</div>',
};

// ── Ad placement logic (simplified from wordpress.service.ts) ──

function injectAdPlacements(html: string, category: string): string {
  const h2Regex = /<h2\s/gi;
  const h2Positions: number[] = [];
  let match;
  while ((match = h2Regex.exec(html)) !== null) {
    h2Positions.push(match.index);
  }
  if (h2Positions.length < 3) return html;

  const RPM_CONFIG: Record<string, { maxAds: number; minWordGap: number }> = {
    'high': { maxAds: 3, minWordGap: 250 },    // Conservative for new publisher
    'medium': { maxAds: 3, minWordGap: 300 },
    'low': { maxAds: 2, minWordGap: 350 },
  };
  const categoryToRpm: Record<string, string> = {
    '시장분석': 'medium', '업종분석': 'medium', '테마분석': 'medium', '종목분석': 'high',
  };
  const rpmTier = categoryToRpm[category] || 'medium';
  const { maxAds, minWordGap } = RPM_CONFIG[rpmTier];

  const pubAttr = ADSENSE_PUB_ID ? ` data-ad-client="${ADSENSE_PUB_ID}"` : '';
  const adUnit = (slot: string, format: string = 'auto') =>
    `<div class="ab-ad-slot" style="margin:32px 0; padding:16px 0; text-align:center; min-height:90px; clear:both;">` +
    `<ins class="adsbygoogle" style="display:block"${pubAttr} data-ad-slot="${slot}" data-ad-format="${format}" data-full-width-responsive="true"></ins>` +
    `<script>(adsbygoogle = window.adsbygoogle || []).push({});</script>` +
    `</div>`;

  // Insert after every 2nd H2, up to maxAds
  const insertPositions: number[] = [];
  for (let i = 2; i < h2Positions.length && insertPositions.length < maxAds; i += 2) {
    // Check word gap
    const sectionHtml = html.slice(h2Positions[i - 2] || 0, h2Positions[i]);
    const words = sectionHtml.replace(/<[^>]+>/g, '').split(/\s+/).length;
    if (words >= minWordGap) {
      insertPositions.push(h2Positions[i]);
    }
  }

  // Insert from end to start to preserve positions
  let result = html;
  const slots = ['mid-content-1', 'mid-content-2', 'mid-content-3'];
  for (let i = insertPositions.length - 1; i >= 0; i--) {
    const pos = insertPositions[i];
    result = result.slice(0, pos) + adUnit(slots[i] || 'mid-content', 'auto') + '\n' + result.slice(pos);
  }

  return result;
}

// ── Types ──

interface WPPost {
  id: number;
  title: { rendered: string };
  content: { rendered: string };
  categories: number[];
  date: string;
  modified: string;
}

interface WPCategory {
  id: number;
  name: string;
}

function decodeHtml(text: string): string {
  return text.replace(/&#8217;/g, "'").replace(/&#8216;/g, "'")
    .replace(/&#8211;/g, '-').replace(/&#8212;/g, '--')
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"')
    .replace(/<[^>]+>/g, '').trim();
}

// ══════════════════════════════════════════════════════════════
// MAIN
// ══════════════════════════════════════════════════════════════
async function main() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  Batch Patch: Inject Missing Elements into Existing Posts   ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log(`Site: ${WP_URL}`);
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : '🔴 LIVE'}\n`);

  // Fetch categories
  const catMap = new Map<number, string>();
  const { data: cats } = await api.get<WPCategory[]>('/categories', { params: { per_page: 100, _fields: 'id,name' } });
  for (const c of cats) catMap.set(c.id, decodeHtml(c.name));

  // Fetch all published posts
  const allPosts: WPPost[] = [];
  let page = 1;
  while (true) {
    const { data, headers } = await api.get<WPPost[]>('/posts', {
      params: { per_page: 100, page, status: 'publish', _fields: 'id,title,content,categories,date,modified' },
    });
    allPosts.push(...data);
    if (page >= parseInt(headers['x-wp-totalpages'] || '1', 10)) break;
    page++;
  }
  console.log(`Posts to patch: ${allPosts.length}\n`);

  let patched = 0;
  let skipped = 0;

  for (const post of allPosts) {
    const title = decodeHtml(post.title.rendered);
    let html = post.content.rendered;
    const changes: string[] = [];

    // Determine category name
    const catName = post.categories.map((c) => catMap.get(c) || '').find((n) =>
      ['시장분석', '업종분석', '테마분석', '종목분석'].includes(n)
    ) || '';

    // 1. Last Updated banner
    if (!html.includes('Last Updated:')) {
      const banner = makeLastUpdatedBanner(post.modified || post.date);
      html = banner + '\n' + html;
      changes.push('Last Updated');
    }

    // 2. AI Disclosure
    if (!html.includes('ab-ai-disclosure')) {
      const lastUpdatedIdx = html.indexOf('Last Updated:');
      if (lastUpdatedIdx !== -1) {
        const closeDivIdx = html.indexOf('</div>', lastUpdatedIdx);
        if (closeDivIdx !== -1) {
          const insertPos = closeDivIdx + '</div>'.length;
          html = html.slice(0, insertPos) + '\n' + AI_DISCLOSURE + '\n' + html.slice(insertPos);
        }
      } else {
        html = AI_DISCLOSURE + '\n' + html;
      }
      changes.push('AI Disclosure');
    }

    // 3. Niche disclaimer (finance/beauty)
    if (catName && NICHE_DISCLAIMERS[catName] && !html.includes('ab-disclaimer-finance') && !html.includes('ab-disclaimer-beauty')) {
      // Insert after AI disclosure or Last Updated
      const aiDiscIdx = html.indexOf('ab-ai-disclosure');
      if (aiDiscIdx !== -1) {
        const closeDivIdx = html.indexOf('</div>', aiDiscIdx);
        if (closeDivIdx !== -1) {
          const insertPos = closeDivIdx + '</div>'.length;
          html = html.slice(0, insertPos) + '\n' + NICHE_DISCLAIMERS[catName] + '\n' + html.slice(insertPos);
        }
      } else {
        html = NICHE_DISCLAIMERS[catName] + '\n' + html;
      }
      changes.push(`Niche Disclaimer (${catName})`);
    }

    // 4. General disclaimer (if missing)
    if (!html.includes('ab-disclaimer')) {
      html += '\n' + GENERAL_DISCLAIMER;
      changes.push('General Disclaimer');
    }

    // 5. Ad placements
    if (!html.includes('ab-ad-slot') && !html.includes('adsbygoogle')) {
      const before = html.length;
      html = injectAdPlacements(html, catName);
      if (html.length > before) {
        changes.push('Ad Slots');
      }
    }

    // 6. Comment prompt
    if (!html.includes('ab-comment-prompt')) {
      // Insert before general disclaimer
      const disclaimerIdx = html.indexOf('class="ab-disclaimer"');
      if (disclaimerIdx !== -1) {
        const pTagIdx = html.lastIndexOf('<p', disclaimerIdx);
        if (pTagIdx !== -1) {
          html = html.slice(0, pTagIdx) + COMMENT_PROMPT + '\n' + html.slice(pTagIdx);
        } else {
          html += '\n' + COMMENT_PROMPT;
        }
      } else {
        html += '\n' + COMMENT_PROMPT;
      }
      changes.push('Comment Prompt');
    }

    // 7. Back to top link
    if (!html.includes('ab-back-top') && !html.includes('Back to Top')) {
      html += '\n<p class="ab-back-top" style="text-align:center; margin:20px 0;"><a href="#" style="color:#0066FF; font-size:14px; text-decoration:none;">↑ Back to Top</a></p>';
      changes.push('Back to Top');
    }

    if (changes.length === 0) {
      skipped++;
      continue;
    }

    console.log(`── [${post.id}] ${title}`);
    console.log(`   Patches: ${changes.join(', ')}`);

    if (!DRY_RUN) {
      try {
        await api.post(`/posts/${post.id}`, { content: html });
        console.log(`   ✅ Updated`);
        patched++;
      } catch (err: any) {
        console.error(`   ❌ Failed: ${err.message}`);
      }
    } else {
      patched++;
    }
  }

  console.log(`\n═══ Summary ═══`);
  console.log(`Patched: ${patched} | Skipped: ${skipped}`);
  if (DRY_RUN) console.log('(Dry run — no changes made)');
  console.log('Done.\n');
}

main().catch((err) => {
  console.error('Fatal:', err instanceof Error ? err.message : err);
  process.exit(1);
});
