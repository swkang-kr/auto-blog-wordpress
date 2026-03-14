/**
 * patch-kbeauty-affiliate.ts
 * K-Beauty 포스트에 Amazon 어필리에이트 링크 및 공시문 삽입
 */
import axios from 'axios';

const WP_URL = process.env.WP_URL!;
const auth = Buffer.from(`${process.env.WP_USERNAME}:${process.env.WP_APP_PASSWORD}`).toString('base64');
const headers: Record<string, string> = { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' };

const AFFILIATE_TAG = 'trendhunt2007-20';

const KBEAUTY_BRANDS: Record<string, string> = {
  'COSRX':            `https://www.amazon.com/s?k=COSRX&tag=${AFFILIATE_TAG}`,
  'Beauty of Joseon': `https://www.amazon.com/s?k=Beauty+of+Joseon&tag=${AFFILIATE_TAG}`,
  'Anua':             `https://www.amazon.com/s?k=Anua+skincare&tag=${AFFILIATE_TAG}`,
  'Torriden':         `https://www.amazon.com/s?k=Torriden&tag=${AFFILIATE_TAG}`,
  'Laneige':          `https://www.amazon.com/s?k=Laneige&tag=${AFFILIATE_TAG}`,
  'Innisfree':        `https://www.amazon.com/s?k=Innisfree&tag=${AFFILIATE_TAG}`,
  'Sulwhasoo':        `https://www.amazon.com/s?k=Sulwhasoo&tag=${AFFILIATE_TAG}`,
  'Missha':           `https://www.amazon.com/s?k=Missha&tag=${AFFILIATE_TAG}`,
  'SKIN1004':         `https://www.amazon.com/s?k=SKIN1004&tag=${AFFILIATE_TAG}`,
  'Etude House':      `https://www.amazon.com/s?k=Etude+House&tag=${AFFILIATE_TAG}`,
  'Olive Young':      `https://www.amazon.com/s?k=korean+skincare+best+seller&tag=${AFFILIATE_TAG}`,
  'sunscreen':        `https://www.amazon.com/s?k=korean+sunscreen&tag=${AFFILIATE_TAG}`,
};

const DISCLOSURE = `<p class="ab-affiliate-disclosure" style="margin:0 0 20px 0; padding:12px 16px; background:#fff8e1; border:1px solid #ffe082; border-radius:8px; font-size:12px; color:#666; line-height:1.5;"><strong>Disclosure:</strong> This article contains affiliate links. If you make a purchase through these links, we may earn a small commission at no extra cost to you. <a href="/privacy-policy/" style="color:#0066FF;">Learn more</a>.</p>`;

function injectAffiliateLinks(html: string): { html: string; count: number } {
  let result = html;
  let count = 0;
  const MAX = 4;

  for (const [brand, url] of Object.entries(KBEAUTY_BRANDS)) {
    if (count >= MAX) break;
    const escaped = brand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp('(?<![">])\\b(' + escaped + ')\\b(?![^<]*<\\/a>)', 'i');
    const match = pattern.exec(result);
    if (match) {
      const link = `<a href="${url}" target="_blank" rel="noopener noreferrer sponsored" data-affiliate="true" style="color:#0066FF; text-decoration:underline;">${match[1]}</a>`;
      result = result.slice(0, match.index) + link + result.slice(match.index + match[0].length);
      count++;
      console.log(`    → "${brand}" 링크 삽입`);
    }
  }
  return { html: result, count };
}

const postIds = [16337, 15041, 15006];

for (const id of postIds) {
  const res = await axios.get(`${WP_URL}/wp-json/wp/v2/posts/${id}`, { headers });
  const title = res.data.title.rendered.replace(/&#[^;]+;/g, '').substring(0, 50);
  console.log(`\nPost ${id}: ${title}`);

  // Already has affiliate links?
  if (res.data.content.rendered.includes('amazon.com')) {
    console.log('  이미 어필리에이트 링크 있음, 스킵');
    continue;
  }

  const rawHtml: string = res.data.content.raw || res.data.content.rendered;
  const { html: patched, count } = injectAffiliateLinks(rawHtml);

  if (count === 0) { console.log('  브랜드명 미발견, 스킵'); continue; }

  // Add disclosure after opening div tag
  const firstDivClose = patched.indexOf('>');
  const withDisclosure = firstDivClose > 0
    ? patched.slice(0, firstDivClose + 1) + '\n' + DISCLOSURE + '\n' + patched.slice(firstDivClose + 1)
    : DISCLOSURE + '\n' + patched;

  await axios.post(`${WP_URL}/wp-json/wp/v2/posts/${id}`, { content: withDisclosure }, { headers });
  console.log(`  ✅ ${count}개 어필리에이트 링크 + 공시문 삽입 완료`);
}

console.log('\n✅ 전체 완료');
