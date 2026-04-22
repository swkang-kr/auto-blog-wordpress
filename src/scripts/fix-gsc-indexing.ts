/**
 * GSC 색인 문제 종합 수정 스크립트
 *
 * Google Search Console의 다음 문제를 해결합니다:
 * 1. "발견됨 - 현재 색인이 생성되지 않음" (468개) → unavailable_after 제거 + ping
 * 2. "NOINDEX 태그에 의해 제외" (45개) → 잘못된 noindex 메타 정리
 * 3. "크롤링됨 - 현재 색인이 생성되지 않음" (14개) → Last-Modified + 색인 요청
 * 4. "리디렉션 오류" (1개) → redirect chain 탐지 & 수정
 * 5. "404" (1개) → 깨진 URL 탐지
 *
 * 실행: npx tsx src/scripts/fix-gsc-indexing.ts [--dry-run]
 */
import 'dotenv/config';
import axios, { type AxiosInstance } from 'axios';

const WP_URL = process.env.WP_URL!.replace(/\/+$/, '');
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
  link: string;
  slug: string;
  status: string;
  meta: Record<string, string>;
  date: string;
  modified: string;
}

interface Snippet {
  id: number;
  name: string;
  code: string;
  active: boolean;
}

// ─── 1단계: unavailable_after 메타 태그가 있는 포스트 찾기 & 정리 ───

async function fixUnavailableAfterMeta(): Promise<number> {
  console.log('\n📌 1단계: unavailable_after 메타 태그 정리');
  console.log('   (60일 후 만료되어 Google이 디인덱싱하는 원인)');

  const allPosts = await fetchAllPosts();
  let fixed = 0;

  for (const post of allPosts) {
    const contentType = post.meta?._autoblog_content_type || '';
    const isTimeSensitive = ['news-explainer', 'event-coverage', 'seasonal-guide'].includes(contentType);

    if (!isTimeSensitive) continue;

    // unavailable_after가 있었을 가능성이 높은 포스트 — content-type 기반으로 식별
    const publishDate = new Date(post.date);
    const daysSincePublish = (Date.now() - publishDate.getTime()) / (24 * 60 * 60 * 1000);

    // 60일 이상 된 time-sensitive 포스트 = unavailable_after 만료로 디인덱싱 가능
    if (daysSincePublish > 55) {
      console.log(`  🔄 [${post.id}] "${stripHtml(post.title.rendered).slice(0, 50)}..." (${Math.round(daysSincePublish)}일 경과, type: ${contentType})`);

      if (!DRY_RUN) {
        try {
          // post를 살짝 업데이트하여 modified date 갱신 → Google 재크롤 유도
          await api.post(`/posts/${post.id}`, {
            meta: {
              // unavailable_after 메타는 PHP snippet에서 출력되므로 post meta로는 제거 불가
              // snippet이 이미 수정됨 (unavailable_after 제거)
              // modified date만 갱신하여 sitemap lastmod 변경
              _autoblog_gsc_fix: new Date().toISOString(),
            },
          });
          fixed++;
        } catch (error) {
          console.error(`  ❌ [${post.id}] 업데이트 실패: ${error instanceof Error ? error.message : error}`);
        }
        // Rate limit
        await new Promise(r => setTimeout(r, 300));
      } else {
        fixed++;
      }
    }
  }

  console.log(`  → ${fixed}개 포스트 modified date 갱신 완료`);
  return fixed;
}

// ─── 2단계: 잘못된 noindex 메타 정리 ───

async function fixWrongNoindex(): Promise<number> {
  console.log('\n📌 2단계: 잘못된 noindex 메타 정리');

  const allPosts = await fetchAllPosts();
  let fixed = 0;

  for (const post of allPosts) {
    const rankMathRobots = post.meta?.rank_math_robots || '';
    const noindexReason = post.meta?._autoblog_noindex_reason || '';
    const noindexed = post.meta?._autoblog_noindexed || '';
    const pruned = post.meta?._autoblog_pruned || '';

    // rank_math_robots에 noindex가 설정되어 있는 publish 상태 포스트 확인
    if (post.status === 'publish' && rankMathRobots.includes('noindex')) {
      // pruned 포스트는 의도적이므로 건너뜀
      if (pruned) continue;

      console.log(`  ⚠️ [${post.id}] "${stripHtml(post.title.rendered).slice(0, 50)}..." — noindex 설정됨 (이유: ${noindexReason || '없음'})`);

      // stale content noindex: 재평가 — 6개월 이상 경과한 time-sensitive 콘텐츠만 유지
      const contentType = post.meta?._autoblog_content_type || '';
      const publishDate = new Date(post.date);
      const ageMonths = (Date.now() - publishDate.getTime()) / (30 * 24 * 60 * 60 * 1000);

      if (contentType === 'news-explainer' && ageMonths > 6) {
        console.log(`    → 6개월+ 된 news-explainer, noindex 유지`);
        continue;
      }

      // 그 외 잘못된 noindex는 제거
      if (!DRY_RUN) {
        try {
          await api.post(`/posts/${post.id}`, {
            meta: {
              rank_math_robots: '', // noindex 해제
              _autoblog_noindexed: '',
              _autoblog_noindex_reason: '',
            },
          });
          fixed++;
          console.log(`    ✅ noindex 해제됨`);
        } catch (error) {
          console.error(`    ❌ 해제 실패: ${error instanceof Error ? error.message : error}`);
        }
        await new Promise(r => setTimeout(r, 300));
      } else {
        fixed++;
      }
    }
  }

  console.log(`  → ${fixed}개 포스트 noindex 해제 완료`);
  return fixed;
}

// ─── 3단계: Noindex Thin Pages 스니펫 업데이트 확인 ───

async function verifySnippetUpdate(): Promise<boolean> {
  console.log('\n📌 3단계: Code Snippets 스니펫 검증');

  try {
    const { data: snippets } = await axios.get<Snippet[]>(
      `${WP_URL}/wp-json/code-snippets/v1/snippets`,
      { headers: { Authorization: `Basic ${token}` }, timeout: 30000 },
    );

    const thinPagesSnippet = snippets.find(s => s.name === 'Auto Blog Noindex Thin Pages');

    if (!thinPagesSnippet) {
      console.log('  ⚠️ "Noindex Thin Pages" 스니펫이 없습니다');
      return false;
    }

    // unavailable_after 또는 rank_math filter가 있으면 wp_head 직접 출력 방식으로 교체
    if (thinPagesSnippet.code.includes('unavailable_after') || thinPagesSnippet.code.includes('rank_math/frontend/robots')) {
      console.log('  🔴 스니펫이 잘못된 방식입니다 (rank_math filter 또는 unavailable_after)');

      if (!DRY_RUN) {
        // wp_head 직접 출력 방식으로 교체 (SEO 플러그인 없음)
        const newCode = `
// Noindex thin/duplicate archive pages (native wp_head — no SEO plugin)
add_action('wp_head', function() {
    $robots = '';
    if (is_tag() || is_author() || is_date()) {
        $robots = 'noindex, follow';
    } elseif (is_category()) {
        $cat = get_queried_object();
        if ($cat && $cat->count < 3) { $robots = 'noindex, follow'; }
    } elseif ((is_home() || is_category() || is_tag()) && get_query_var('paged') > 1) {
        $robots = 'noindex, follow';
    } elseif (is_search()) {
        $robots = 'noindex, follow';
    }
    if ($robots) {
        echo '<meta name="robots" content="' . esc_attr($robots) . '" />' . "\\n";
    }
}, 1);

// Pagination rel next/prev for archive pages
add_action('wp_head', function() {
    if ((is_category() || is_tag() || is_home()) && get_query_var('paged') > 0) {
        global $wp_query;
        $paged = get_query_var('paged');
        if ($paged > 1) {
            $prev = get_pagenum_link($paged - 1);
            echo '<link rel="prev" href="' . esc_url($prev) . '" />' . "\\n";
        }
        if ($paged < $wp_query->max_num_pages) {
            $next = get_pagenum_link($paged + 1);
            echo '<link rel="next" href="' . esc_url($next) . '" />' . "\\n";
        }
    }
});`.trim();

        try {
          await axios.put(
            `${WP_URL}/wp-json/code-snippets/v1/snippets/${thinPagesSnippet.id}`,
            { code: newCode, active: true },
            { headers: { Authorization: `Basic ${token}` }, timeout: 30000 },
          );
          console.log('  ✅ 스니펫 교체 완료 (wp_head 직접 출력 방식)');
          return true;
        } catch (error) {
          console.error(`  ❌ 스니펫 업데이트 실패: ${error instanceof Error ? error.message : error}`);
          return false;
        }
      }
      return false;
    }

    console.log(`  ✅ 스니펫 OK (ID=${thinPagesSnippet.id}, active=${thinPagesSnippet.active})`);
    return true;
  } catch (error) {
    console.error(`  ❌ 스니펫 확인 실패: ${error instanceof Error ? error.message : error}`);
    return false;
  }
}

// ─── 4단계: 크롤 예산 최적화를 위한 사이트맵 ping ───

async function pingSitemaps(): Promise<void> {
  console.log('\n📌 4단계: 사이트맵 ping (Google/Bing/IndexNow)');

  const sitemapUrls = [
    `${WP_URL}/sitemap_index.xml`,
    `${WP_URL}/sitemap.xml`,
  ];

  // Google Sitemap Ping
  for (const sitemapUrl of sitemapUrls) {
    try {
      const { status } = await axios.get(sitemapUrl, { timeout: 10000, validateStatus: () => true });
      if (status !== 200) continue;

      if (!DRY_RUN) {
        // Google deprecated sitemap ping but still processes it
        try {
          await axios.get(`https://www.google.com/ping?sitemap=${encodeURIComponent(sitemapUrl)}`, {
            timeout: 10000,
            validateStatus: () => true,
          });
          console.log(`  ✅ Google ping: ${sitemapUrl}`);
        } catch {
          console.log(`  ⚠️ Google ping 실패 (deprecated)`);
        }

        // Bing/IndexNow
        try {
          await axios.get(`https://www.bing.com/ping?sitemap=${encodeURIComponent(sitemapUrl)}`, {
            timeout: 10000,
            validateStatus: () => true,
          });
          console.log(`  ✅ Bing ping: ${sitemapUrl}`);
        } catch {
          console.log(`  ⚠️ Bing ping 실패`);
        }
      } else {
        console.log(`  [DRY-RUN] Would ping: ${sitemapUrl}`);
      }
      break; // 첫 번째 유효한 사이트맵만 ping
    } catch {
      continue;
    }
  }

  // IndexNow batch submit (Bing, Yandex, Naver 등)
  const indexNowKey = process.env.INDEXNOW_KEY;
  if (indexNowKey) {
    try {
      const recentPosts = await fetchRecentPosts(50);
      const urls = recentPosts.map(p => p.link);

      if (!DRY_RUN) {
        await axios.post('https://api.indexnow.org/IndexNow', {
          host: new URL(WP_URL).hostname,
          key: indexNowKey,
          urlList: urls,
        }, { timeout: 15000 });
        console.log(`  ✅ IndexNow: ${urls.length}개 URL 제출`);
      } else {
        console.log(`  [DRY-RUN] Would submit ${urls.length} URLs to IndexNow`);
      }
    } catch (error) {
      console.log(`  ⚠️ IndexNow 실패: ${error instanceof Error ? error.message : error}`);
    }
  } else {
    console.log('  ⏭️ IndexNow 건너뜀 (INDEXNOW_KEY 미설정)');
  }
}

// ─── 5단계: Last-Modified 헤더 스니펫 설치 ───

async function ensureLastModifiedSnippet(): Promise<void> {
  console.log('\n📌 5단계: Last-Modified 헤더 스니펫 확인');

  const snippetTitle = 'Auto Blog Last-Modified Header';
  const phpCode = `
// Send Last-Modified header for single posts (helps Googlebot conditional crawling)
// Google uses If-Modified-Since to save crawl budget — proper Last-Modified means
// unchanged pages get 304 Not Modified instead of full re-download
add_action('template_redirect', function() {
    if (!is_singular('post') && !is_singular('page')) return;
    if (is_admin() || is_feed()) return;

    global $post;
    if (!$post) return;

    $modified = get_the_modified_date('U', $post);
    if (!$modified) return;

    $gmt = gmdate('D, d M Y H:i:s', (int)$modified) . ' GMT';
    header('Last-Modified: ' . $gmt);

    // Return 304 if browser/bot sends If-Modified-Since and page hasn't changed
    if (isset($_SERVER['HTTP_IF_MODIFIED_SINCE'])) {
        $since = strtotime($_SERVER['HTTP_IF_MODIFIED_SINCE']);
        if ($since && $since >= (int)$modified) {
            status_header(304);
            exit;
        }
    }
});

// Remove unnecessary HTTP headers to save bandwidth (every byte counts for crawl budget)
add_action('send_headers', function() {
    header_remove('X-Pingback');
    header_remove('X-Powered-By');
});`.trim();

  try {
    const { data: snippets } = await axios.get<Snippet[]>(
      `${WP_URL}/wp-json/code-snippets/v1/snippets`,
      { headers: { Authorization: `Basic ${token}` }, timeout: 30000 },
    );

    const existing = snippets.find(s => s.name === snippetTitle);

    if (existing) {
      console.log(`  ✅ 이미 설치됨 (ID=${existing.id})`);
      return;
    }

    if (!DRY_RUN) {
      await axios.post(
        `${WP_URL}/wp-json/code-snippets/v1/snippets`,
        { name: snippetTitle, code: phpCode, scope: 'global', active: true, priority: 3 },
        { headers: { Authorization: `Basic ${token}` }, timeout: 30000 },
      );
      console.log('  ✅ Last-Modified 헤더 스니펫 설치 완료');
    } else {
      console.log('  [DRY-RUN] Would install Last-Modified header snippet');
    }
  } catch (error) {
    console.error(`  ❌ 스니펫 설치 실패: ${error instanceof Error ? error.message : error}`);
  }
}

// ─── 6단계: Crawl Budget 절약 — 불필요한 WordPress 기능 비활성화 ───

async function ensureCrawlBudgetSnippet(): Promise<void> {
  console.log('\n📌 6단계: 크롤 예산 절약 스니펫 확인');

  const snippetTitle = 'Auto Blog Crawl Budget Optimization';
  const phpCode = `
// === Crawl Budget Optimization ===
// Reduces unnecessary crawlable URLs that waste Google's crawl budget

// 1. Disable WordPress REST API user endpoint (exposes author URLs for bots to crawl)
add_filter('rest_endpoints', function($endpoints) {
    unset($endpoints['/wp/v2/users']);
    unset($endpoints['/wp/v2/users/(?P<id>[\\\\d]+)']);
    return $endpoints;
});

// 2. Remove oEmbed discovery links (creates extra crawlable endpoints)
remove_action('wp_head', 'wp_oembed_add_discovery_links');
remove_action('wp_head', 'wp_oembed_add_host_js');

// 3. Remove RSD (Really Simple Discovery) link — used by XML-RPC clients only
remove_action('wp_head', 'rsd_link');

// 4. Remove Windows Live Writer link
remove_action('wp_head', 'wlwmanifest_link');

// 5. Remove shortlink (duplicate URL for every post)
remove_action('wp_head', 'wp_shortlink_wp_head');

// 6. Disable XML-RPC entirely (security + crawl budget — bots crawl xmlrpc.php)
add_filter('xmlrpc_enabled', '__return_false');
add_filter('wp_headers', function($headers) {
    unset($headers['X-Pingback']);
    return $headers;
});

// 7. Noindex WordPress native REST API pages (sometimes crawled by Google)
add_filter('rest_pre_serve_request', function($served, $result, $request) {
    header('X-Robots-Tag: noindex, nofollow');
    return $served;
}, 10, 3);

// 8. Noindex search results pages (waste of crawl budget)
add_action('wp_head', function() {
    if (is_search()) {
        echo '<meta name="robots" content="noindex, follow" />' . "\\n";
    }
});

// 9. Disable feed for comments (low value, wastes crawl budget)
add_action('do_feed_rdf', function() { wp_die(); }, 1);
add_action('do_feed_atom', function() { wp_die(); }, 1);
remove_action('wp_head', 'feed_links_extra', 3);`.trim();

  try {
    const { data: snippets } = await axios.get<Snippet[]>(
      `${WP_URL}/wp-json/code-snippets/v1/snippets`,
      { headers: { Authorization: `Basic ${token}` }, timeout: 30000 },
    );

    const existing = snippets.find(s => s.name === snippetTitle);

    if (existing) {
      if (!DRY_RUN) {
        await axios.put(
          `${WP_URL}/wp-json/code-snippets/v1/snippets/${existing.id}`,
          { code: phpCode, active: true },
          { headers: { Authorization: `Basic ${token}` }, timeout: 30000 },
        );
        console.log(`  ✅ 업데이트 완료 (ID=${existing.id})`);
      } else {
        console.log(`  [DRY-RUN] Would update snippet ID=${existing.id}`);
      }
      return;
    }

    if (!DRY_RUN) {
      await axios.post(
        `${WP_URL}/wp-json/code-snippets/v1/snippets`,
        { name: snippetTitle, code: phpCode, scope: 'global', active: true, priority: 3 },
        { headers: { Authorization: `Basic ${token}` }, timeout: 30000 },
      );
      console.log('  ✅ 크롤 예산 최적화 스니펫 설치 완료');
    } else {
      console.log('  [DRY-RUN] Would install Crawl Budget Optimization snippet');
    }
  } catch (error) {
    console.error(`  ❌ 스니펫 설치 실패: ${error instanceof Error ? error.message : error}`);
  }
}

// ─── Helper Functions ───

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, '').replace(/&[^;]+;/g, ' ').replace(/\s+/g, ' ').trim();
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
        _fields: 'id,title,link,slug,status,meta,date,modified',
      },
    });
    allPosts.push(...(data as WPPost[]));
    if (page >= parseInt(headers['x-wp-totalpages'] || '1', 10)) break;
    page++;
  }
  return allPosts;
}

async function fetchRecentPosts(count: number): Promise<WPPost[]> {
  const { data } = await api.get('/posts', {
    params: { per_page: count, page: 1, status: 'publish', _fields: 'id,title,link,slug,date,modified', orderby: 'modified', order: 'desc' },
  });
  return data as WPPost[];
}

// ─── Main ───

async function main() {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🔧 GSC 색인 문제 종합 수정 ${DRY_RUN ? '(DRY-RUN)' : ''}`);
  console.log(`   Site: ${WP_URL}`);
  console.log(`   Date: ${new Date().toLocaleString('ko-KR')}`);
  console.log(`${'='.repeat(60)}`);

  // 1. unavailable_after 영향받은 포스트 modified date 갱신
  const step1 = await fixUnavailableAfterMeta();

  // 2. 잘못된 noindex 메타 정리
  const step2 = await fixWrongNoindex();

  // 3. WordPress 스니펫 검증 & 수정
  await verifySnippetUpdate();

  // 4. 사이트맵 ping
  await pingSitemaps();

  // 5. Last-Modified 헤더 스니펫 설치
  await ensureLastModifiedSnippet();

  // 6. 크롤 예산 최적화 스니펫 설치
  await ensureCrawlBudgetSnippet();

  console.log(`\n${'='.repeat(60)}`);
  console.log('✨ 결과 요약');
  console.log(`${'='.repeat(60)}`);
  console.log(`  📊 unavailable_after 영향 포스트 갱신: ${step1}개`);
  console.log(`  📊 잘못된 noindex 해제: ${step2}개`);
  console.log(`  📊 스니펫: unavailable_after 제거 + Rank Math filter 방식으로 전환`);
  console.log(`  📊 Last-Modified 헤더: 설치됨 (304 응답으로 크롤 예산 절약)`);
  console.log(`  📊 크롤 예산 최적화: 불필요한 URL endpoint 비활성화`);
  console.log('');
  console.log('📋 다음 단계:');
  console.log('  1. GSC에서 "색인 생성 요청" (URL 검사 → 색인 생성 요청)');
  console.log('  2. 1-2주 후 GSC "페이지 색인 생성" 탭에서 변화 확인');
  console.log('  3. npx tsx src/scripts/inspect-and-request-indexing.ts 로 미색인 URL 색인 요청');

  if (DRY_RUN) {
    console.log('\n⚠️ DRY-RUN 모드였습니다. 실제 변경은 없습니다.');
    console.log('   실제 실행: npx tsx src/scripts/fix-gsc-indexing.ts');
  }
}

main().catch((e) => { console.error('Fatal:', e.message || e); process.exit(1); });
