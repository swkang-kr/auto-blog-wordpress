import { WordPressService } from '../services/wordpress.service.js';
import { loadConfig } from '../config/env.js';

async function main() {
  const config = loadConfig();
  const wp = new WordPressService(config.WP_URL, config.WP_USERNAME, config.WP_APP_PASSWORD);
  const ids = [14999, 15006, 257, 236, 192, 168];

  console.log(`Server time: ${new Date().toISOString()} (${new Date().toString()})\n`);

  for (const id of ids) {
    const { data } = await (wp as any).api.get(`/posts/${id}`, {
      params: { _fields: 'id,title,status,date,date_gmt' },
    });
    const p = data as { id: number; title: { rendered: string }; status: string; date: string; date_gmt: string };
    const schedGmt = new Date(p.date_gmt + 'Z');
    const now = new Date();
    const diffMin = Math.round((schedGmt.getTime() - now.getTime()) / 60000);
    const timeInfo = diffMin > 0 ? `${diffMin}min from now` : `${Math.abs(diffMin)}min AGO ⚠️`;
    console.log(`ID=${p.id} | status=${p.status} | date_gmt=${p.date_gmt}Z (${timeInfo}) | ${p.title.rendered.slice(0, 50)}`);
  }
}

main().catch(console.error);
