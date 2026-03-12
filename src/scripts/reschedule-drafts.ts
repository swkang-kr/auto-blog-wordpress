import { WordPressService } from '../services/wordpress.service.js';
import { loadConfig } from '../config/env.js';

async function main() {
  const config = loadConfig();
  const wp = new WordPressService(config.WP_URL, config.WP_USERNAME, config.WP_APP_PASSWORD);
  const ids = [14999, 15006, 257, 236, 192, 168];
  const INTERVAL_MS = 4 * 60 * 60 * 1000; // 4 hours

  console.log(`Rescheduling ${ids.length} posts with 4-hour intervals...\n`);

  for (let i = 0; i < ids.length; i++) {
    const publishAt = new Date(Date.now() + INTERVAL_MS * (i + 1));
    const { data } = await (wp as any).api.get(`/posts/${ids[i]}`, {
      params: { _fields: 'id,title,status' },
    });
    const p = data as { id: number; title: { rendered: string }; status: string };

    const ok = await wp.schedulePost(ids[i], publishAt);
    const kst = publishAt.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
    if (ok) {
      console.log(`✅ ID=${ids[i]} | ${kst} | ${p.title.rendered.slice(0, 55)}`);
    } else {
      console.log(`❌ ID=${ids[i]} | Failed | ${p.title.rendered.slice(0, 55)}`);
    }
  }
}

main().catch(console.error);
