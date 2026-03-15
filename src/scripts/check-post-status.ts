import 'dotenv/config';
import axios from 'axios';

async function main() {
  const api = axios.create({
    baseURL: `${process.env.WP_URL}/wp-json/wp/v2`,
    headers: { Authorization: `Basic ${Buffer.from(`${process.env.WP_USERNAME}:${process.env.WP_APP_PASSWORD}`).toString('base64')}` },
    timeout: 30000,
  });

  const ids = [22540, 23013, 25761, 26327, 29950, 30728, 33453];
  for (const id of ids) {
    try {
      const resp = await api.get(`/posts/${id}`, { params: { _fields: 'id,status,slug,link,date' } });
      const p = resp.data as any;
      console.log(`#${p.id} [${p.status}] ${p.date.substring(0,10)} → ${p.link}`);
    } catch (e: any) {
      console.log(`#${id} ERROR: ${e.response?.status || e.message}`);
    }
  }
}
main().catch(e => { console.error(e.message); process.exit(1); });
