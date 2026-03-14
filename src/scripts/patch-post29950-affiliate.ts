import axios from 'axios';

const WP_URL = process.env.WP_URL!;
const WP_USERNAME = process.env.WP_USERNAME!;
const WP_APP_PASSWORD = process.env.WP_APP_PASSWORD!;
const AFFILIATE_TAG = 'trendhunt2007-20';

const auth = Buffer.from(`${WP_USERNAME}:${WP_APP_PASSWORD}`).toString('base64');
const api = axios.create({
  baseURL: `${WP_URL}/wp-json/wp/v2`,
  headers: { Authorization: `Basic ${auth}` },
});

const AFFILIATE_MAP: Record<string, string> = {
  'COSRX': `https://www.amazon.com/s?k=COSRX&tag=${AFFILIATE_TAG}`,
  'Laneige': `https://www.amazon.com/s?k=Laneige&tag=${AFFILIATE_TAG}`,
  'Innisfree': `https://www.amazon.com/s?k=Innisfree&tag=${AFFILIATE_TAG}`,
  'Beauty of Joseon': `https://www.amazon.com/s?k=Beauty+of+Joseon&tag=${AFFILIATE_TAG}`,
  'Missha': `https://www.amazon.com/s?k=Missha&tag=${AFFILIATE_TAG}`,
  'SKIN1004': `https://www.amazon.com/s?k=SKIN1004&tag=${AFFILIATE_TAG}`,
  'Anua': `https://www.amazon.com/s?k=Anua+skincare&tag=${AFFILIATE_TAG}`,
  'Torriden': `https://www.amazon.com/s?k=Torriden&tag=${AFFILIATE_TAG}`,
  'moisturizer': `https://www.amazon.com/s?k=korean+moisturizer&tag=${AFFILIATE_TAG}`,
};

function injectLinks(html: string): { html: string; count: number } {
  let result = html;
  let count = 0;
  for (const [kw, url] of Object.entries(AFFILIATE_MAP)) {
    if (count >= 3) break;
    const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`(?<![">])\\b(${escaped})\\b(?![^<]*<\\/a>)`, 'i');
    const match = pattern.exec(result);
    if (match) {
      const link = `<a href="${url}" target="_blank" rel="noopener noreferrer sponsored" data-affiliate="true" style="color:#0066FF;text-decoration:underline;">${match[1]}</a>`;
      result = result.slice(0, match.index) + link + result.slice(match.index + match[0].length);
      count++;
      console.log(`Injected: "${kw}" → ${url}`);
    }
  }
  return { html: result, count };
}

async function main() {
  const POST_IDS = [29950];
  for (const id of POST_IDS) {
    const r = await api.get(`/posts/${id}?context=edit`);
    const content: string = r.data.content.raw || '';
    const { html: patched, count } = injectLinks(content);
    if (count > 0) {
      await api.post(`/posts/${id}`, { content: patched, status: 'publish' });
      console.log(`✅ Post ${id}: ${count} affiliate link(s) added, published`);
    } else {
      console.log(`⚠️ Post ${id}: no matching brands found`);
    }
  }
}

main().catch(e => console.error(e.message));
