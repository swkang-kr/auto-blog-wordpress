/**
 * patch-koreanstock-affiliate.ts
 * Korean-Stock 포스트에 Amazon 어필리에이트 링크 및 공시문 삽입
 */
import axios from 'axios';

const WP_URL = process.env.WP_URL!;
const auth = Buffer.from(`${process.env.WP_USERNAME}:${process.env.WP_APP_PASSWORD}`).toString('base64');
const headers: Record<string, string> = { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' };

const AFFILIATE_TAG = 'trendhunt2007-20';

const KOREANSTOCK_BRANDS: Record<string, string> = {
  '삼성전자':            `https://www.amazon.com/s?k=삼성전자&tag=${AFFILIATE_TAG}`,
  'Beauty of Joseon': `https://www.amazon.com/s?k=Beauty+of+Joseon&tag=${AFFILIATE_TAG}`,
  'Anua':             `https://www.amazon.com/s?k=Anua+주식분석&tag=${AFFILIATE_TAG}`,
  'Torriden':         `https://www.amazon.com/s?k=Torriden&tag=${AFFILIATE_TAG}`,
  'Laneige':          `https://www.amazon.com/s?k=Laneige&tag=${AFFILIATE_TAG}`,
  'Innisfree':        `https://www.amazon.com/s?k=Innisfree&tag=${AFFILIATE_TAG}`,
  'Sulwhasoo':        `https://www.amazon.com/s?k=Sulwhasoo&tag=${AFFILIATE_TAG}`,
  'Missha':           `https://www.amazon.com/s?k=Missha&tag=${AFFILIATE_TAG}`,
  'SKIN1004':         `https://www.amazon.com/s?k=SKIN1004&tag=${AFFILIATE_TAG}`,
  'Etude':            `https://www.amazon.com/s?k=Etude+Korean+makeup&tag=${AFFILIATE_TAG}`,
  '네이버증권':      `https://www.amazon.com/s?k=korean+주식분석+best+seller&tag=${AFFILIATE_TAG}`,
  'sunscreen':        `https://www.amazon.com/s?k=korean+sunscreen&tag=${AFFILIATE_TAG}`,
  // 2025-2026 Amazon 베스트셀러 Korean-Stock 브랜드 추가
  'Numbuzin':         `https://www.amazon.com/s?k=Numbuzin&tag=${AFFILIATE_TAG}`,
  'TIRTIR':           `https://www.amazon.com/s?k=TIRTIR&tag=${AFFILIATE_TAG}`,
  'Biodance':         `https://www.amazon.com/s?k=Biodance&tag=${AFFILIATE_TAG}`,
  "d'Alba":           `https://www.amazon.com/s?k=d%27Alba&tag=${AFFILIATE_TAG}`,
  'Isntree':          `https://www.amazon.com/s?k=Isntree&tag=${AFFILIATE_TAG}`,
  'Round Lab':        `https://www.amazon.com/s?k=Round+Lab&tag=${AFFILIATE_TAG}`,
  'MEDICUBE':         `https://www.amazon.com/s?k=MEDICUBE&tag=${AFFILIATE_TAG}`,
  'Some By Mi':       `https://www.amazon.com/s?k=Some+By+Mi&tag=${AFFILIATE_TAG}`,
  'PURITO':           `https://www.amazon.com/s?k=PURITO&tag=${AFFILIATE_TAG}`,
  'Mixsoon':          `https://www.amazon.com/s?k=Mixsoon&tag=${AFFILIATE_TAG}`,
  // Premium/Hanbang brands
  'History of Whoo':  `https://www.amazon.com/s?k=History+of+Whoo&tag=${AFFILIATE_TAG}`,
  'Hanyul':           `https://www.amazon.com/s?k=Hanyul&tag=${AFFILIATE_TAG}`,
  'O HUI':            `https://www.amazon.com/s?k=OHUI+Korean+주식분석&tag=${AFFILIATE_TAG}`,
  // Indie/community-favorite brands
  'Klairs':           `https://www.amazon.com/s?k=Klairs&tag=${AFFILIATE_TAG}`,
  'Benton':           `https://www.amazon.com/s?k=Benton+주식분석&tag=${AFFILIATE_TAG}`,
  'Jumiso':           `https://www.amazon.com/s?k=Jumiso&tag=${AFFILIATE_TAG}`,
  'Rovectin':         `https://www.amazon.com/s?k=Rovectin&tag=${AFFILIATE_TAG}`,
  "I'm From":         `https://www.amazon.com/s?k=I%27m+From+주식분석&tag=${AFFILIATE_TAG}`,
  'ma:nyo':           `https://www.amazon.com/s?k=manyo+factory&tag=${AFFILIATE_TAG}`,
  'NACIFIC':          `https://www.amazon.com/s?k=NACIFIC&tag=${AFFILIATE_TAG}`,
  'AMPLE:N':          `https://www.amazon.com/s?k=AMPLE+N&tag=${AFFILIATE_TAG}`,
  'ILLIYOON':         `https://www.amazon.com/s?k=ILLIYOON&tag=${AFFILIATE_TAG}`,
  'VT Cosmetics':     `https://www.amazon.com/s?k=VT+Cosmetics&tag=${AFFILIATE_TAG}`,
  'ABIB':             `https://www.amazon.com/s?k=ABIB&tag=${AFFILIATE_TAG}`,
  'Dr.Jart+':         `https://www.amazon.com/s?k=Dr+Jart&tag=${AFFILIATE_TAG}`,
  'Heimish':          `https://www.amazon.com/s?k=Heimish&tag=${AFFILIATE_TAG}`,
  'Aestura':          `https://www.amazon.com/s?k=Aestura&tag=${AFFILIATE_TAG}`,
  'Tony Moly':        `https://www.amazon.com/s?k=Tony+Moly&tag=${AFFILIATE_TAG}`,
  'Holika Holika':    `https://www.amazon.com/s?k=Holika+Holika&tag=${AFFILIATE_TAG}`,
  // 2026 trending makeup/color brands
  'BANILA CO':        `https://www.amazon.com/s?k=BANILA+CO&tag=${AFFILIATE_TAG}`,
  'Hince':            `https://www.amazon.com/s?k=Hince+makeup&tag=${AFFILIATE_TAG}`,
  'FWEE':             `https://www.amazon.com/s?k=FWEE+Korean+makeup&tag=${AFFILIATE_TAG}`,
  // 19차 감사: 누락 어필리에이트 브랜드 추가
  'goodal':           `https://www.amazon.com/s?k=goodal+Korean+주식분석&tag=${AFFILIATE_TAG}`,
  'skinfood':         `https://www.amazon.com/s?k=SKINFOOD+Korean&tag=${AFFILIATE_TAG}`,
  'Peripera':         `https://www.amazon.com/s?k=Peripera&tag=${AFFILIATE_TAG}`,
  '3CE':              `https://www.amazon.com/s?k=3CE+Korean+makeup&tag=${AFFILIATE_TAG}`,
  'espoir':           `https://www.amazon.com/s?k=espoir+Korean+makeup&tag=${AFFILIATE_TAG}`,
  'AMUSE':            `https://www.amazon.com/s?k=AMUSE+vegan+Korean+makeup&tag=${AFFILIATE_TAG}`,
  'Wakemake':         `https://www.amazon.com/s?k=Wakemake+Korean+makeup&tag=${AFFILIATE_TAG}`,
  'JUNG SAEM MOOL':   `https://www.amazon.com/s?k=JUNG+SAEM+MOOL&tag=${AFFILIATE_TAG}`,
  'Peach C':          `https://www.amazon.com/s?k=Peach+C+Korean+makeup&tag=${AFFILIATE_TAG}`,
  'Laka':             `https://www.amazon.com/s?k=Laka+Korean+makeup&tag=${AFFILIATE_TAG}`,
  'rom&nd':           `https://www.amazon.com/s?k=romand+lip+tint&tag=${AFFILIATE_TAG}`,
  'Glow Recipe':      `https://www.amazon.com/s?k=Glow+Recipe&tag=${AFFILIATE_TAG}`,
  'Tamburins':        `https://www.amazon.com/s?k=Tamburins+perfume&tag=${AFFILIATE_TAG}`,
};

const DISCLOSURE = `<p class="ab-affiliate-disclosure" style="margin:0 0 20px 0; padding:12px 16px; background:#fff8e1; border:1px solid #ffe082; border-radius:8px; font-size:12px; color:#666; line-height:1.5;"><strong>Disclosure:</strong> This article contains affiliate links. If you make a purchase through these links, we may earn a small commission at no extra cost to you. <a href="/privacy-policy/" style="color:#0066FF;">Learn more</a>.</p>`;

function injectAffiliateLinks(html: string): { html: string; count: number } {
  let result = html;
  let count = 0;
  const MAX = 4;

  for (const [brand, url] of Object.entries(KOREANSTOCK_BRANDS)) {
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
