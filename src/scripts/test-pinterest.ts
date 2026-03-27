/**
 * test-pinterest.ts
 * Pinterest API 연결 테스트 스크립트
 *
 * 단계별 검증:
 *  1. Access Token 유효성 (GET /v5/user_account)
 *  2. Board 목록 조회 (GET /v5/boards)
 *  3. Board 생성/확인 (Korean-Stock & 주식분석)
 *  4. 실제 Pin 생성 테스트 (최근 WP 포스트 1개 사용)
 *
 * Usage: npx tsx src/scripts/test-pinterest.ts [--dry-run] [--pin]
 *   --dry-run : API 호출만 테스트, 실제 Pin 생성 안 함 (기본값)
 *   --pin     : 실제로 Pin 1개 생성
 */
import 'dotenv/config';
import axios from 'axios';

const TOKEN = process.env.PINTEREST_ACCESS_TOKEN || '';
const WP_URL = process.env.WP_URL || '';
const WP_AUTH = Buffer.from(`${process.env.WP_USERNAME}:${process.env.WP_APP_PASSWORD}`).toString('base64');

const args = process.argv.slice(2);
const ACTUALLY_PIN = args.includes('--pin');

const headers = {
  Authorization: `Bearer ${TOKEN}`,
  'Content-Type': 'application/json',
};

function ok(msg: string) { console.log(`  ✅ ${msg}`); }
function fail(msg: string) { console.log(`  ❌ ${msg}`); }
function info(msg: string) { console.log(`  ℹ️  ${msg}`); }

async function main() {
  console.log('═══════════════════════════════════════════════');
  console.log('  Pinterest API Integration Test');
  console.log(`  Mode: ${ACTUALLY_PIN ? '🚀 LIVE (will create a pin)' : '🔍 DRY RUN (read-only)'}`);
  console.log('═══════════════════════════════════════════════\n');

  // ── Step 0: Check env ──
  console.log('[Step 0] Environment check');
  if (!TOKEN) { fail('PINTEREST_ACCESS_TOKEN is empty'); process.exit(1); }
  ok(`Token present (${TOKEN.substring(0, 8)}...${TOKEN.substring(TOKEN.length - 4)})`);
  if (!WP_URL) { fail('WP_URL is empty'); process.exit(1); }
  ok(`WP_URL: ${WP_URL}`);

  // ── Step 1: Verify token — GET /v5/user_account ──
  console.log('\n[Step 1] Verify access token (GET /v5/user_account)');
  try {
    const { data, status } = await axios.get('https://api.pinterest.com/v5/user_account', {
      headers,
      timeout: 10000,
    });
    ok(`Status ${status} — username: "${data.username}", account_type: "${data.account_type}"`);
    if (data.website_url) info(`Website: ${data.website_url}`);
    info(`Profile: https://pinterest.com/${data.username}`);
  } catch (err) {
    if (axios.isAxiosError(err)) {
      const status = err.response?.status;
      const body = JSON.stringify(err.response?.data || {});
      fail(`Status ${status}: ${body}`);
      if (status === 401) {
        info('Token is expired or invalid. Pinterest tokens expire after 30 days.');
        info('Refresh: https://developers.pinterest.com/docs/getting-started/set-up-app/');
      }
      if (status === 403) {
        info('Token lacks required scopes. Need: boards:read, boards:write, pins:read, pins:write');
      }
    } else {
      fail(`${err instanceof Error ? err.message : err}`);
    }
    process.exit(1);
  }

  // ── Step 2: List boards — GET /v5/boards ──
  console.log('\n[Step 2] List existing boards (GET /v5/boards)');
  let boards: Array<{ id: string; name: string; pin_count: number; privacy: string }> = [];
  try {
    const { data, status } = await axios.get('https://api.pinterest.com/v5/boards', {
      headers,
      params: { page_size: 50 },
      timeout: 10000,
    });
    boards = data.items || [];
    ok(`Status ${status} — ${boards.length} board(s) found`);
    for (const b of boards) {
      info(`  [${b.id}] "${b.name}" (${b.pin_count} pins, ${b.privacy})`);
    }
    if (boards.length === 0) {
      info('No boards yet — Step 3 will create one');
    }
  } catch (err) {
    if (axios.isAxiosError(err)) {
      fail(`Status ${err.response?.status}: ${JSON.stringify(err.response?.data)}`);
    } else {
      fail(`${err instanceof Error ? err.message : err}`);
    }
    process.exit(1);
  }

  // ── Step 3: Ensure Korean-Stock board exists ──
  const targetBoard = 'Korean-Stock & 주식분석';
  console.log(`\n[Step 3] Ensure board "${targetBoard}" exists`);
  let boardId: string | null = null;
  const existing = boards.find(b => b.name.toLowerCase() === targetBoard.toLowerCase());
  if (existing) {
    boardId = existing.id;
    ok(`Board already exists: ID=${boardId}`);
  } else if (!ACTUALLY_PIN) {
    info(`Board not found — would create in LIVE mode`);
  } else {
    try {
      const { data: newBoard } = await axios.post(
        'https://api.pinterest.com/v5/boards',
        { name: targetBoard, description: `${targetBoard} - curated content from TrendHunt`, privacy: 'PUBLIC' },
        { headers, timeout: 10000 },
      );
      boardId = newBoard.id;
      ok(`Board created: ID=${boardId}`);
    } catch (err) {
      if (axios.isAxiosError(err)) {
        fail(`Board create failed: ${err.response?.status} ${JSON.stringify(err.response?.data)}`);
      } else {
        fail(`${err instanceof Error ? err.message : err}`);
      }
    }
  }

  // ── Step 4: Fetch a recent WP post for pin test ──
  console.log('\n[Step 4] Fetch recent WordPress post for pin test');
  let wpPost: { id: number; title: string; link: string; excerpt: string; imageUrl: string } | null = null;
  try {
    const { data: posts } = await axios.get(
      `${WP_URL}/wp-json/wp/v2/posts?status=publish&per_page=1&orderby=date&order=desc&_fields=id,title,link,excerpt,featured_media`,
      { headers: { Authorization: `Basic ${WP_AUTH}` }, timeout: 10000 },
    );
    if (posts.length === 0) {
      info('No published posts found');
    } else {
      const p = posts[0];
      const title = p.title.rendered.replace(/<[^>]+>/g, '').replace(/&#\d+;/g, '');
      const excerpt = p.excerpt.rendered.replace(/<[^>]+>/g, '').replace(/&#\d+;/g, '').trim().substring(0, 200);
      let imageUrl = '';
      if (p.featured_media) {
        try {
          const { data: media } = await axios.get(
            `${WP_URL}/wp-json/wp/v2/media/${p.featured_media}?_fields=source_url`,
            { headers: { Authorization: `Basic ${WP_AUTH}` }, timeout: 10000 },
          );
          imageUrl = media.source_url || '';
        } catch { /* no image */ }
      }
      wpPost = { id: p.id, title, link: p.link, excerpt, imageUrl };
      ok(`Post #${wpPost.id}: "${wpPost.title}"`);
      info(`URL: ${wpPost.link}`);
      info(`Image: ${wpPost.imageUrl || '(none)'}`);
      info(`Excerpt: ${wpPost.excerpt.substring(0, 80)}...`);
    }
  } catch (err) {
    fail(`WP API error: ${err instanceof Error ? err.message : err}`);
  }

  // ── Step 5: Create a pin (only with --pin flag) ──
  console.log(`\n[Step 5] Create pin ${ACTUALLY_PIN ? '(LIVE)' : '(DRY RUN — use --pin to actually create)'}`);
  if (!boardId) {
    info('Skipped: no board ID available');
  } else if (!wpPost) {
    info('Skipped: no WordPress post available');
  } else if (!wpPost.imageUrl) {
    info('Skipped: post has no featured image (required for Pinterest)');
  } else if (!ACTUALLY_PIN) {
    info('Would create pin with:');
    info(`  Board: ${boardId}`);
    info(`  Title: "${wpPost.title.substring(0, 100)}"`);
    info(`  Link: ${wpPost.link}?utm_source=pinterest&utm_medium=social`);
    info(`  Image: ${wpPost.imageUrl}`);
    info(`  Desc: "${wpPost.excerpt.substring(0, 100)}..."`);
    ok('Dry run complete — all API calls succeeded. Use --pin to create a real pin.');
  } else {
    try {
      const pinBody = {
        board_id: boardId,
        title: wpPost.title.substring(0, 100),
        description: `${wpPost.excerpt}\n\nSave this pin for later! Click through for the full guide.\n\n#Korea #SouthKorea #KBeauty #Korean주식분석 #GlassSkin`.substring(0, 500),
        link: `${wpPost.link}?utm_source=pinterest&utm_medium=social&utm_campaign=test`,
        media_source: {
          source_type: 'image_url',
          url: wpPost.imageUrl,
        },
        alt_text: `${wpPost.title} — Korean-Stock guide`.substring(0, 500),
      };
      info(`POST /v5/pins — board=${boardId}`);
      const { data: pin, status } = await axios.post(
        'https://api.pinterest.com/v5/pins',
        pinBody,
        { headers, timeout: 15000 },
      );
      ok(`Status ${status} — Pin created! ID: ${pin.id}`);
      info(`Pin URL: https://pinterest.com/pin/${pin.id}`);
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const status = err.response?.status;
        const body = JSON.stringify(err.response?.data, null, 2);
        fail(`Status ${status}:\n${body}`);
        if (status === 401) info('Token expired — need refresh');
        if (status === 403) info('Missing scope: pins:write');
        if (status === 429) info('Rate limited — wait and retry');
      } else {
        fail(`${err instanceof Error ? err.message : err}`);
      }
    }
  }

  console.log('\n═══════════════════════════════════════════════');
  console.log('  Test complete');
  console.log('═══════════════════════════════════════════════');
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
