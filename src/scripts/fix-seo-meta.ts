/**
 * fix-seo-meta.ts
 * 기존 포스트에 누락된 Rank Math SEO 메타(description, title, OG image)를 일괄 설정합니다.
 * 또한 Rank Math REST API 등록 + OG/canonical 폴백 PHP 스니펫을 설치합니다.
 *
 * Usage: npx tsx src/scripts/fix-seo-meta.ts [--dry-run]
 */
import 'dotenv/config';
import axios, { type AxiosInstance } from 'axios';

const WP_URL = process.env.WP_URL!;
const WP_USERNAME = process.env.WP_USERNAME!;
const WP_APP_PASSWORD = process.env.WP_APP_PASSWORD!;
const DRY_RUN = process.argv.includes('--dry-run');

const token = Buffer.from(`${WP_USERNAME}:${WP_APP_PASSWORD}`).toString('base64');
const api: AxiosInstance = axios.create({
  baseURL: `${WP_URL}/wp-json/wp/v2`,
  headers: { Authorization: `Basic ${token}` },
  timeout: 30000,
});

interface WPPost {
  id: number;
  title: { rendered: string };
  excerpt: { rendered: string };
  link: string;
  featured_media: number;
  meta: Record<string, string>;
}

async function getFeaturedImageUrl(mediaId: number): Promise<string> {
  if (!mediaId) return '';
  try {
    const { data } = await api.get(`/media/${mediaId}`, { params: { _fields: 'source_url' } });
    return (data as { source_url: string }).source_url || '';
  } catch {
    return '';
  }
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#8217;/g, "'")
    .replace(/&#8211;/g, '-')
    .replace(/&amp;/g, '&')
    .replace(/&hellip;/g, '...')
    .replace(/\s+/g, ' ')
    .trim();
}

async function installRankMathSnippet(): Promise<void> {
  const SNIPPET_TITLE = 'Auto Blog Rank Math REST API Meta';
  const phpCode = `
// Register Rank Math meta fields for REST API write access
// (Rank Math handles OG/canonical/twitter output — this only enables REST API writes)
add_action('init', function() {
    $meta_fields = [
        'rank_math_description',
        'rank_math_title',
        'rank_math_focus_keyword',
        'rank_math_facebook_image',
        'rank_math_twitter_image',
        'rank_math_twitter_use_facebook_data',
    ];
    foreach ($meta_fields as $field) {
        register_post_meta('post', $field, [
            'show_in_rest' => true,
            'single' => true,
            'type' => 'string',
            'auth_callback' => function() { return current_user_can('edit_posts'); },
        ]);
    }
});`.trim();

  try {
    const { data: snippets } = await axios.get(
      `${WP_URL}/wp-json/code-snippets/v1/snippets`,
      { headers: { Authorization: `Basic ${token}` }, timeout: 30000 },
    );
    const existing = (snippets as Array<{ id: number; name: string }>)
      .find((s) => s.name === SNIPPET_TITLE);

    if (existing) {
      if (DRY_RUN) {
        console.log(`[DRY-RUN] Would update snippet ID=${existing.id}`);
        return;
      }
      await axios.put(
        `${WP_URL}/wp-json/code-snippets/v1/snippets/${existing.id}`,
        { code: phpCode, active: true },
        { headers: { Authorization: `Basic ${token}` }, timeout: 30000 },
      );
      console.log(`✅ Snippet updated (ID=${existing.id})`);
      return;
    }

    if (DRY_RUN) {
      console.log('[DRY-RUN] Would install Rank Math REST snippet');
      return;
    }

    await axios.post(
      `${WP_URL}/wp-json/code-snippets/v1/snippets`,
      { name: SNIPPET_TITLE, code: phpCode, scope: 'global', active: true, priority: 5 },
      { headers: { Authorization: `Basic ${token}` }, timeout: 30000 },
    );
    console.log('✅ Rank Math REST snippet installed');
  } catch (error) {
    console.error('❌ Failed to install snippet:', error instanceof Error ? error.message : error);
  }
}

async function fetchAllPosts(): Promise<WPPost[]> {
  const allPosts: WPPost[] = [];
  let page = 1;
  while (true) {
    const { data, headers } = await api.get('/posts', {
      params: {
        per_page: 100,
        page,
        status: 'publish',
        _fields: 'id,title,excerpt,link,featured_media,meta',
      },
    });
    const posts = data as WPPost[];
    allPosts.push(...posts);
    const total = parseInt(headers['x-wp-totalpages'] || '1', 10);
    if (page >= total) break;
    page++;
  }
  return allPosts;
}

async function fixPostMeta(post: WPPost): Promise<boolean> {
  const title = stripHtml(post.title.rendered);
  const excerpt = stripHtml(post.excerpt.rendered);

  if (!excerpt) {
    console.log(`  ⏭️ [${post.id}] "${title}" — no excerpt, skipping`);
    return false;
  }

  const description = excerpt.length > 160 ? excerpt.slice(0, 157) + '...' : excerpt;
  const existingDesc = post.meta?.rank_math_description || '';
  const existingTitle = post.meta?.rank_math_title || '';

  // Skip if already has meta description
  if (existingDesc && existingTitle) {
    console.log(`  ✔️ [${post.id}] "${title}" — already has SEO meta`);
    return false;
  }

  // Get featured image URL for OG
  const imageUrl = await getFeaturedImageUrl(post.featured_media);

  const meta: Record<string, string> = {
    rank_math_description: existingDesc || description,
    rank_math_title: existingTitle || title,
    rank_math_facebook_image: imageUrl,
    rank_math_twitter_image: imageUrl,
    rank_math_twitter_use_facebook_data: '1',
  };

  if (DRY_RUN) {
    console.log(`  📝 [DRY-RUN] [${post.id}] "${title}" — would set meta:`, {
      desc: meta.rank_math_description.slice(0, 60) + '...',
      img: imageUrl ? '✓' : '✗',
    });
    return true;
  }

  try {
    await api.post(`/posts/${post.id}`, { meta });
    console.log(`  ✅ [${post.id}] "${title}" — SEO meta updated`);
    return true;
  } catch (error) {
    console.error(`  ❌ [${post.id}] "${title}" — failed:`, error instanceof Error ? error.message : error);
    return false;
  }
}

async function main() {
  console.log(`\n🔧 SEO Meta Fix Script ${DRY_RUN ? '(DRY-RUN)' : ''}`);
  console.log(`   Site: ${WP_URL}\n`);

  // Step 1: Install PHP snippet for REST API meta registration + OG fallback
  console.log('📌 Step 1: Installing Rank Math REST API snippet...');
  await installRankMathSnippet();

  // Step 2: Wait a moment for snippet to activate
  if (!DRY_RUN) {
    console.log('   Waiting 3s for snippet activation...');
    await new Promise((r) => setTimeout(r, 3000));
  }

  // Step 3: Fetch all posts
  console.log('\n📌 Step 2: Fetching all published posts...');
  const posts = await fetchAllPosts();
  console.log(`   Found ${posts.length} posts\n`);

  // Step 4: Fix meta for each post
  console.log('📌 Step 3: Updating SEO meta for posts...');
  let updated = 0;
  let skipped = 0;
  for (const post of posts) {
    const wasUpdated = await fixPostMeta(post);
    if (wasUpdated) updated++;
    else skipped++;
    // Rate limit: 2 requests per second
    if (!DRY_RUN) await new Promise((r) => setTimeout(r, 500));
  }

  console.log(`\n✨ Done! Updated: ${updated}, Skipped: ${skipped}, Total: ${posts.length}`);
  if (DRY_RUN) console.log('   (This was a dry run — no changes were made)');
}

main().catch(console.error);
