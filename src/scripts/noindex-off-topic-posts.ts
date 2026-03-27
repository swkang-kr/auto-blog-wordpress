/**
 * noindex-off-topic-posts.ts
 * 니치에 맞지 않는 포스트(Save Money 등)에 noindex 설정하여
 * 토피컬 오소리티 분산을 방지합니다.
 */
import dotenv from 'dotenv';
import { resolve } from 'path';
dotenv.config({ path: resolve(import.meta.dirname, '../../.env') });
import axios from 'axios';

const WP_URL = process.env.WP_URL!;
const WP_USERNAME = process.env.WP_USERNAME!;
const WP_APP_PASSWORD = process.env.WP_APP_PASSWORD!;

const OFF_TOPIC_SLUGS = [
  // Save Money (off-topic, no Korea relevance)
  'best-ways-save-money-2026',
  'save-money-college-2026',
  'save-money-low-income-2026',
  'budget-save-money-2026',
  'budgeting-tips-2026',
  'passive-income-ideas-2026',
  'how-to-save-money-fast-17-proven-strategies-that-work-in-2024',
  // Korean Tech & Finance (Phase 2 보류 - 현재 2니치 집중 전략)
  'ai-tools-content-creation-2026-kr',
  'ai-tools-seo-guide-2026',
  'best-ai-writing-tools-2026',
  'sk-hynix-hbm-memory-market-share',
  'kospi-q1-earnings-korean-stock-picks',
  'how-to-invest-korean-stocks-foreigner',
  // AI-Trading romanized slugs (영어권 검색 불가)
  'cha-ji-yeons-bold-challenge-on-hyeon-yeok-gawang-3-no-regrets',
  'yoon-yu-seons-whirlwind-marriage-shocks-best-friend-yoo-ho-jung',
  'hong-jas-실적발표-can-she-overturn-last-place-in-semifinals',
  // Misc off-niche
  'budgeting-tips-families-2026-kr',
  'korean-startup-ecosystem-trends-investment',
  'korean-DART공시-platform-global-expansion-strategy',
];

const api = axios.create({
  baseURL: `${WP_URL}/wp-json/wp/v2`,
  auth: { username: WP_USERNAME, password: WP_APP_PASSWORD },
  headers: { 'Content-Type': 'application/json' },
});

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  console.log(`=== Off-topic 포스트 noindex 처리 ===${dryRun ? ' (DRY RUN)' : ''}\n`);

  let processed = 0;
  let skipped = 0;

  for (const slug of OFF_TOPIC_SLUGS) {
    try {
      const { data: posts } = await api.get('/posts', {
        params: { slug, _fields: 'id,title,slug,meta', status: 'publish' },
      });

      if (posts.length === 0) {
        console.log(`  ⚠️ ${slug} → 포스트 없음 (draft or deleted)`);
        skipped++;
        continue;
      }

      const post = posts[0];
      const currentRobots = post.meta?.rank_math_robots || '';

      if (currentRobots.includes('noindex')) {
        console.log(`  ✅ ${slug} (ID=${post.id}) → 이미 noindex`);
        skipped++;
        continue;
      }

      if (dryRun) {
        console.log(`  🔍 ${slug} (ID=${post.id}) → noindex 예정 (dry run)`);
        processed++;
        continue;
      }

      await api.post(`/posts/${post.id}`, {
        meta: {
          rank_math_robots: 'noindex,nofollow',
          _autoblog_archived: new Date().toISOString(),
          _autoblog_archive_reason: 'Off-topic or deferred: 2-niche focus strategy (Korean-Stock + AI-Trading)',
        },
      });

      console.log(`  ✅ ${slug} (ID=${post.id}) → noindex,nofollow 설정 완료`);
      processed++;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.log(`  ❌ ${slug} → 오류: ${msg}`);
    }
  }

  console.log(`\n=== 결과 ===`);
  console.log(`  처리: ${processed}개`);
  console.log(`  스킵: ${skipped}개`);
}

main().catch(console.error);
