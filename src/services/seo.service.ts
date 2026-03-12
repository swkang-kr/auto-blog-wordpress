import axios, { type AxiosInstance } from 'axios';
import { logger } from '../utils/logger.js';
import { getGoogleAccessToken } from '../utils/google-auth.js';

const WPCODE_SLUG = 'insert-headers-and-footers';
const HREFLANG_SNIPPET_TITLE = 'Auto Blog hreflang SEO';
const ADSENSE_PADDING_SNIPPET_TITLE = 'Auto Blog AdSense Mobile Padding';
const INDEXNOW_SNIPPET_TITLE = 'Auto Blog IndexNow Key';
const RANKMATH_REST_SNIPPET_TITLE = 'Auto Blog Rank Math REST API Meta';
const NAV_MENU_SNIPPET_TITLE = 'Auto Blog Navigation Menu';
const JSONLD_SNIPPET_TITLE = 'Auto Blog JSON-LD Schema';
const DARKMODE_SNIPPET_TITLE = 'Auto Blog Dark Mode CSS';
const NOINDEX_THIN_SNIPPET_TITLE = 'Auto Blog Noindex Thin Pages';
const RSS_OPTIMIZATION_SNIPPET_TITLE = 'Auto Blog RSS Feed Optimization';
const IMAGE_SITEMAP_SNIPPET_TITLE = 'Auto Blog Image Sitemap Enhancement';
const POST_CSS_SNIPPET_TITLE = 'Auto Blog Post Styles';
const SITEMAP_PRIORITY_SNIPPET_TITLE = 'Auto Blog Sitemap Priority';
const NEWS_SITEMAP_SNIPPET_TITLE = 'Auto Blog News Sitemap';
const VIDEO_SITEMAP_SNIPPET_TITLE = 'Auto Blog Video Sitemap';
const SITE_SCHEMA_SNIPPET_TITLE = 'Auto Blog Site Schema';
const COMMENT_ENGAGEMENT_SNIPPET_TITLE = 'Auto Blog Comment Engagement';
const CWV_AUTOFIX_SNIPPET_TITLE = 'Auto Blog CWV Auto-Fix';
const CRITICAL_CSS_SNIPPET_TITLE = 'Auto Blog Critical CSS';

export class SeoService {
  private api: AxiosInstance;
  private wpUrl: string;
  private indexNowKey: string;
  private indexingSaKey: string;
  private indexingBlocked = false;

  constructor(
    wpUrl: string,
    username: string,
    appPassword: string,
    options?: { indexNowKey?: string; indexingSaKey?: string },
  ) {
    this.wpUrl = wpUrl.replace(/\/+$/, '');
    this.indexNowKey = options?.indexNowKey || '';
    this.indexingSaKey = options?.indexingSaKey || '';
    const token = Buffer.from(`${username}:${appPassword}`).toString('base64');
    this.api = axios.create({
      baseURL: `${this.wpUrl}/wp-json/wp/v2`,
      headers: { Authorization: `Basic ${token}` },
      timeout: 30000,
    });
  }

  /**
   * Set WordPress site title and tagline to reflect niche focus.
   */
  async ensureSiteTitle(siteName: string, categories: string[]): Promise<void> {
    const tagline = `Your Source for ${categories.join(', ')} Insights`;
    try {
      const { data: settings } = await this.api.get('/settings');
      const current = settings as Record<string, unknown>;
      const titleChanged = current.title !== siteName;
      const taglineChanged = current.description !== tagline;
      if (!titleChanged && !taglineChanged) {
        logger.debug('Site title and tagline already up to date');
        return;
      }
      const update: Record<string, string> = {};
      if (titleChanged) update.title = siteName;
      if (taglineChanged) update.description = tagline;
      await this.api.post('/settings', update);
      logger.info(`Site title/tagline updated: "${siteName}" — "${tagline}"`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.warn(`Failed to update site title/tagline: ${msg}`);
    }
  }

  /**
   * Set permalink structure to /%category%/%postname%/ for topical authority.
   * Category-based URLs help Google understand site topic structure.
   */
  async ensureCategoryPermalinks(): Promise<void> {
    try {
      const { data: settings } = await this.api.get('/settings');
      const current = settings as Record<string, unknown>;
      const desiredStructure = '/%category%/%postname%/';
      if (current.permalink_structure === desiredStructure) {
        logger.debug('Permalink structure already set to category-based');
        return;
      }
      await this.api.post('/settings', { permalink_structure: desiredStructure });
      logger.info(`Permalink structure updated to "${desiredStructure}" for topical authority`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      // WordPress REST API may not expose permalink_structure via /settings
      // In that case, log a manual instruction
      if (msg.includes('rest_invalid_param') || msg.includes('403') || msg.includes('permalink')) {
        logger.info('Permalink structure: Set manually in WordPress Admin → Settings → Permalinks → Custom: /%category%/%postname%/');
      } else {
        logger.warn(`Failed to update permalink structure: ${msg}`);
      }
    }
  }

  async ensureHeaderScripts(options: {
    googleCode?: string;
    naverCode?: string;
    gaMeasurementId?: string;
    adsensePubId?: string;
  }): Promise<void> {
    const { googleCode, naverCode, gaMeasurementId, adsensePubId } = options;

    const parts: string[] = [];

    // Google Discover eligibility + image preview optimization
    parts.push(`<meta name="robots" content="max-image-preview:large, max-snippet:-1, max-video-preview:-1" />`);

    // Preconnect hints for Google Fonts + WordPress uploads (LCP optimization)
    parts.push(`<link rel="preconnect" href="https://fonts.googleapis.com" />`);
    parts.push(`<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />`);
    // Google Fonts with font-display:swap for CWV (prevents invisible text during font load)
    parts.push(`<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;600;700&display=swap" />`);
    // Preconnect to WordPress uploads domain for faster image loading (#5)
    try {
      const uploadsHost = new URL(this.wpUrl).host;
      parts.push(`<link rel="preconnect" href="https://${uploadsHost}" />`);
    } catch { /* skip if URL parse fails */ }
    // DNS prefetch for common external resources
    parts.push(`<link rel="dns-prefetch" href="https://www.googletagmanager.com" />`);
    parts.push(`<link rel="dns-prefetch" href="https://pagead2.googlesyndication.com" />`);

    // AdSense Auto Ads script (requires publisher ID)
    if (adsensePubId) {
      parts.push(`<!-- Google AdSense -->`);
      parts.push(`<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${adsensePubId}" crossorigin="anonymous"></script>`);
    }

    // Verification meta tags
    if (googleCode) parts.push(`<meta name="google-site-verification" content="${googleCode}" />`);
    if (naverCode) parts.push(`<meta name="naver-site-verification" content="${naverCode}" />`);

    // Google Analytics 4
    if (gaMeasurementId) {
      parts.push(`<!-- Google Analytics 4 -->`);
      parts.push(`<script async src="https://www.googletagmanager.com/gtag/js?id=${gaMeasurementId}"></script>`);
      parts.push(`<script>\nwindow.dataLayer = window.dataLayer || [];\nfunction gtag(){dataLayer.push(arguments);}\ngtag('js', new Date());\ngtag('config', '${gaMeasurementId}');\n` +
        `/* Micro-conversion tracking: scroll depth, share clicks, engaged reader */\n` +
        `document.addEventListener('DOMContentLoaded',function(){` +
        `var st=0;window.addEventListener('scroll',function(){var h=document.documentElement.scrollHeight-window.innerHeight;if(h>0){var p=Math.round(window.scrollY/h*100);if(p>=25&&st<25){st=25;gtag('event','scroll_depth',{percent:25})}if(p>=50&&st<50){st=50;gtag('event','scroll_depth',{percent:50})}if(p>=75&&st<75){st=75;gtag('event','scroll_depth',{percent:75})}if(p>=90&&st<90){st=90;gtag('event','scroll_depth',{percent:90})}}});` +
        `document.querySelectorAll('.ab-share-btn').forEach(function(b){b.addEventListener('click',function(){gtag('event','share',{method:b.textContent.trim()})})});` +
        `document.querySelectorAll('a[rel*="sponsored"],a[data-affiliate="true"]').forEach(function(a){a.addEventListener('click',function(){gtag('event','affiliate_click',{link_url:a.href,link_text:a.textContent.trim().slice(0,50)})})});` +
        `var t=setTimeout(function(){gtag('event','engaged_reader',{engagement_time:30})},30000);` +
        `document.addEventListener('visibilitychange',function(){if(document.hidden)clearTimeout(t)});` +
        `});\n</script>`);
    }

    const headerHtml = parts.join('\n');

    // Step 1: Install and activate WPCode plugin
    const pluginReady = await this.ensurePlugin();
    if (!pluginReady) {
      this.logManualInstructions(headerHtml);
      return;
    }

    // Step 2: Try to set header meta tags via plugin option
    const configured = await this.trySetHeader(headerHtml);
    if (configured) {
      logger.info('Header scripts (verification + GA4 + Discover meta) configured successfully');
    } else {
      this.logManualInstructions(headerHtml);
    }
  }

  /**
   * Ensure hreflang PHP snippet is installed via Code Snippets plugin.
   * Outputs <link rel="alternate" hreflang="en"> and x-default for all posts.
   * When hreflang_ko meta is set, also outputs Korean alternate link.
   */
  async ensureHreflangSnippet(): Promise<void> {
    const snippetsApi = axios.create({
      baseURL: `${this.wpUrl}/wp-json/wp/v2`,
      headers: this.api.defaults.headers as Record<string, string>,
      timeout: 30000,
    });

    // The PHP code that will run on the WordPress site
    const phpCode = `
// Register hreflang post meta for REST API
add_action('init', function() {
    register_post_meta('post', 'hreflang_ko', [
        'show_in_rest' => true,
        'single' => true,
        'type' => 'string',
        'sanitize_callback' => 'esc_url_raw',
    ]);
});

// Output hreflang link tags in <head> for ALL posts (self-referencing for English)
add_action('wp_head', function() {
    if (!is_singular('post')) return;
    $post_id = get_the_ID();
    $current_url = get_permalink($post_id);
    $ko_url = get_post_meta($post_id, 'hreflang_ko', true);

    // Always output English self-reference + x-default
    echo '<link rel="alternate" hreflang="en" href="' . esc_url($current_url) . '" />' . "\\n";
    echo '<link rel="alternate" hreflang="x-default" href="' . esc_url($current_url) . '" />' . "\\n";

    // Output Korean alternate only when Korean URL exists
    if ($ko_url) {
        echo '<link rel="alternate" hreflang="ko" href="' . esc_url($ko_url) . '" />' . "\\n";
    }
});`.trim();

    // Try Code Snippets plugin REST API first
    try {
      const { data: snippets } = await snippetsApi.get(
        `${this.wpUrl}/wp-json/code-snippets/v1/snippets`.replace(snippetsApi.defaults.baseURL || '', ''),
        { baseURL: this.wpUrl },
      );
      const existing = (snippets as Array<{ id: number; name: string }>)
        .find((s) => s.name === HREFLANG_SNIPPET_TITLE);
      if (existing) {
        logger.info(`hreflang snippet already exists (ID=${existing.id}), skipping`);
        return;
      }

      await axios.post(
        `${this.wpUrl}/wp-json/code-snippets/v1/snippets`,
        {
          name: HREFLANG_SNIPPET_TITLE,
          code: phpCode,
          scope: 'global',
          active: true,
          priority: 10,
        },
        {
          headers: this.api.defaults.headers as Record<string, string>,
          timeout: 30000,
        },
      );
      logger.info('hreflang PHP snippet installed via Code Snippets plugin');
      return;
    } catch {
      logger.debug('Code Snippets plugin API not available, trying mu-plugins fallback');
    }

    // Fallback: create as mu-plugin via WordPress filesystem (manual instruction)
    logger.warn('=== hreflang Snippet Manual Setup Required ===');
    logger.warn('Install the "Code Snippets" plugin, then add the following PHP snippet:');
    logger.warn(`Title: ${HREFLANG_SNIPPET_TITLE}`);
    logger.warn(phpCode);
    logger.warn('Or add it to your theme functions.php');
    logger.warn('============================================');
  }

  /**
   * Ensure mobile bottom padding snippet is installed via Code Snippets plugin.
   * Prevents AdSense Auto Ads sticky bottom banner from covering site navigation.
   */
  async ensureAdSensePaddingSnippet(): Promise<void> {
    const phpCode = `
// Add bottom padding on mobile to prevent AdSense sticky banner from covering navigation
add_action('wp_head', function() {
    echo '<style>
@media (max-width: 768px) {
    body { padding-bottom: 70px !important; }
    .site-footer { padding-bottom: 70px !important; }
}
</style>';
});`.trim();

    try {
      const { data: snippets } = await axios.get(
        `${this.wpUrl}/wp-json/code-snippets/v1/snippets`,
        {
          headers: this.api.defaults.headers as Record<string, string>,
          timeout: 30000,
        },
      );
      const existing = (snippets as Array<{ id: number; name: string }>)
        .find((s) => s.name === ADSENSE_PADDING_SNIPPET_TITLE);
      if (existing) {
        logger.info(`AdSense padding snippet already exists (ID=${existing.id}), skipping`);
        return;
      }

      await axios.post(
        `${this.wpUrl}/wp-json/code-snippets/v1/snippets`,
        {
          name: ADSENSE_PADDING_SNIPPET_TITLE,
          code: phpCode,
          scope: 'global',
          active: true,
          priority: 10,
        },
        {
          headers: this.api.defaults.headers as Record<string, string>,
          timeout: 30000,
        },
      );
      logger.info('AdSense mobile padding snippet installed via Code Snippets plugin');
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.warn(`Failed to install AdSense padding snippet: ${msg}`);
      logger.warn('Manually add CSS: @media (max-width:768px) { body { padding-bottom:70px !important; } }');
    }
  }

  /**
   * Install a PHP snippet that outputs JSON-LD from post meta into wp_head.
   * Posts store JSON-LD in _autoblog_jsonld meta field instead of post content body.
   */
  async ensureJsonLdSnippet(): Promise<void> {
    const phpCode = `
// Output JSON-LD structured data from post meta into <head>
add_action('wp_head', function() {
    if (!is_singular('post')) return;
    $post_id = get_the_ID();

    // JSON-LD schemas
    $jsonld_raw = get_post_meta($post_id, '_autoblog_jsonld', true);
    if (!empty($jsonld_raw)) {
        $schemas = json_decode($jsonld_raw, true);
        if (is_array($schemas)) {
            foreach ($schemas as $schema) {
                echo '<script type="application/ld+json">' . wp_json_encode($schema, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) . '</script>' . "\\n";
            }
        }
    }

    // OG article time meta tags (supplement Rank Math output)
    $pub_time = get_post_meta($post_id, '_autoblog_published_time', true);
    $mod_time = get_post_meta($post_id, '_autoblog_modified_time', true);
    if ($pub_time) echo '<meta property="article:published_time" content="' . esc_attr($pub_time) . '" />' . "\\n";
    if ($mod_time) echo '<meta property="article:modified_time" content="' . esc_attr($mod_time) . '" />' . "\\n";
});

// Register autoblog meta fields for REST API write access
add_action('init', function() {
    $fields = ['_autoblog_jsonld', '_autoblog_published_time', '_autoblog_modified_time'];
    foreach ($fields as $field) {
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
        `${this.wpUrl}/wp-json/code-snippets/v1/snippets`,
        { headers: this.api.defaults.headers as Record<string, string>, timeout: 30000 },
      );
      const existing = (snippets as Array<{ id: number; name: string }>)
        .find((s) => s.name === JSONLD_SNIPPET_TITLE);

      if (existing) {
        await axios.put(
          `${this.wpUrl}/wp-json/code-snippets/v1/snippets/${existing.id}`,
          { code: phpCode, active: true },
          { headers: this.api.defaults.headers as Record<string, string>, timeout: 30000 },
        );
        logger.info(`JSON-LD snippet updated (ID=${existing.id})`);
        return;
      }

      await axios.post(
        `${this.wpUrl}/wp-json/code-snippets/v1/snippets`,
        { name: JSONLD_SNIPPET_TITLE, code: phpCode, scope: 'global', active: true, priority: 5 },
        { headers: this.api.defaults.headers as Record<string, string>, timeout: 30000 },
      );
      logger.info('JSON-LD wp_head snippet installed via Code Snippets plugin');
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.warn(`Failed to install JSON-LD snippet: ${msg}`);
    }
  }

  /**
   * Install a WordPress Code Snippet that serves the IndexNow key file.
   * Search engines verify ownership by fetching /{key}.txt from the site.
   */
  async ensureIndexNowKeySnippet(): Promise<void> {
    if (!this.indexNowKey) return;

    const key = this.indexNowKey;
    const phpCode = `
// Serve IndexNow key file for Naver Search Advisor
add_action('init', function() {
    $request_uri = trim(parse_url($_SERVER['REQUEST_URI'] ?? '', PHP_URL_PATH), '/');
    if ($request_uri === '${key}.txt') {
        header('Content-Type: text/plain; charset=UTF-8');
        echo '${key}';
        exit;
    }
});`.trim();

    try {
      const { data: snippets } = await axios.get(
        `${this.wpUrl}/wp-json/code-snippets/v1/snippets`,
        { headers: this.api.defaults.headers as Record<string, string>, timeout: 30000 },
      );
      const existing = (snippets as Array<{ id: number; name: string }>)
        .find((s) => s.name === INDEXNOW_SNIPPET_TITLE);

      if (existing) {
        logger.debug(`IndexNow key snippet already exists (ID=${existing.id}), skipping`);
        return;
      }

      await axios.post(
        `${this.wpUrl}/wp-json/code-snippets/v1/snippets`,
        { name: INDEXNOW_SNIPPET_TITLE, code: phpCode, scope: 'global', active: true, priority: 1 },
        { headers: this.api.defaults.headers as Record<string, string>, timeout: 30000 },
      );
      logger.info(`IndexNow key snippet installed (key=${key})`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.warn(`Failed to install IndexNow key snippet: ${msg}`);
    }
  }

  /**
   * Notify search engines of new post URLs via IndexNow protocol.
   * Submits to Naver directly and to api.indexnow.org (distributes to Google, Bing, Yandex, etc.).
   */
  async notifyIndexNow(urls: string[]): Promise<void> {
    if (!this.indexNowKey || urls.length === 0) return;

    const host = new URL(this.wpUrl).hostname;
    const keyLocation = `${this.wpUrl}/${this.indexNowKey}.txt`;
    const body = { host, key: this.indexNowKey, keyLocation, urlList: urls };
    const headers = { 'Content-Type': 'application/json' };

    const endpoints: Array<{ name: string; url: string }> = [
      { name: 'Naver', url: 'https://searchadvisor.naver.com/indexnow' },
      { name: 'IndexNow', url: 'https://api.indexnow.org/indexnow' },
    ];

    await Promise.allSettled(
      endpoints.map(async ({ name, url }) => {
        try {
          const response = await axios.post(url, body, { headers, timeout: 15000 });
          logger.info(`IndexNow: ${name} notified of ${urls.length} URL(s) → status=${response.status}`);
        } catch (error) {
          const msg = axios.isAxiosError(error)
            ? `${error.response?.status} ${JSON.stringify(error.response?.data ?? error.message)}`
            : (error instanceof Error ? error.message : String(error));
          logger.warn(`IndexNow ${name} notification failed: ${msg}`);
        }
      }),
    );
  }

  /**
   * Ping Bing with the sitemap URL to trigger re-crawl.
   * Google deprecated sitemap ping in 2023, but Bing still supports it.
   */
  async pingSitemap(): Promise<void> {
    const sitemapUrl = `${this.wpUrl}/sitemap_index.xml`;
    const pingUrl = `https://www.bing.com/ping?sitemap=${encodeURIComponent(sitemapUrl)}`;

    try {
      const { status } = await axios.get(pingUrl, { timeout: 10000, validateStatus: () => true });
      if (status === 200) {
        logger.info(`Bing sitemap ping OK: ${sitemapUrl}`);
      } else {
        logger.warn(`Bing sitemap ping returned status ${status}`);
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.warn(`Bing sitemap ping failed: ${msg}`);
    }
  }

  /**
   * Verify sitemap.xml exists and is accessible.
   * Rank Math generates sitemap automatically; this checks it's working.
   */
  async verifySitemap(): Promise<void> {
    const sitemapUrls = [
      `${this.wpUrl}/sitemap_index.xml`,
      `${this.wpUrl}/sitemap.xml`,
      `${this.wpUrl}/wp-sitemap.xml`,
    ];

    for (const url of sitemapUrls) {
      try {
        const { status } = await axios.get(url, { timeout: 10000, validateStatus: () => true });
        if (status === 200) {
          logger.info(`Sitemap OK: ${url}`);
          return;
        }
      } catch {
        // try next
      }
    }

    logger.warn('=== SITEMAP WARNING ===');
    logger.warn('No sitemap found. Ensure Rank Math or another SEO plugin generates sitemap_index.xml');
    logger.warn('Submit sitemap to Google Search Console: https://search.google.com/search-console');
    logger.warn('======================');
  }

  /**
   * Fetch robots.txt and warn if User-agent: * has Disallow: / (blocks all crawlers).
   * Sets indexingBlocked=true if crawlers are blocked — requestIndexing() will be skipped.
   */
  async checkRobotsTxt(): Promise<void> {
    try {
      const { data: raw } = await axios.get<string>(`${this.wpUrl}/robots.txt`, { timeout: 10000 });
      const lines = raw.split('\n').map((l) => l.trim());

      let inStarBlock = false;
      let blocked = false;

      for (const line of lines) {
        if (/^user-agent:\s*\*$/i.test(line)) {
          inStarBlock = true;
          continue;
        }
        if (inStarBlock && /^user-agent:/i.test(line)) {
          inStarBlock = false;
        }
        if (inStarBlock && /^disallow:\s*\/\s*$/i.test(line)) {
          blocked = true;
          break;
        }
      }

      if (blocked) {
        this.indexingBlocked = true;
        logger.warn('=== robots.txt WARNING ===');
        logger.warn('robots.txt contains "Disallow: /" for User-agent: * — all search engines are BLOCKED.');
        logger.warn('Google Indexing API requests will be skipped until this is resolved.');
        logger.warn('Fix: WordPress Admin > Settings > Reading > uncheck "Discourage search engines"');
        logger.warn('=========================');
      } else {
        logger.info('robots.txt: OK (no blanket Disallow: / found)');
      }
    } catch (error) {
      logger.warn(`robots.txt check failed: ${error instanceof Error ? error.message : error}`);
    }
  }

  /**
   * Check WordPress blog_public setting (0 = noindex). Fix it to 1 if needed.
   * Sets indexingBlocked=true if the fix was just applied — Google needs time to re-crawl.
   */
  async checkAndFixIndexingSettings(): Promise<void> {
    try {
      const { data: settings } = await this.api.get('/settings');
      const blogPublic = (settings as Record<string, unknown>).blog_public;

      if (blogPublic === 0 || blogPublic === '0' || blogPublic === false) {
        logger.warn('WordPress "Discourage search engines" is ON (blog_public=0). Fixing...');
        await this.api.post('/settings', { blog_public: 1 });
        logger.warn('blog_public set to 1 — but Google Indexing API skipped this run (robots.txt needs time to propagate).');
        this.indexingBlocked = true;
      } else {
        logger.info('WordPress indexing settings: OK (blog_public=1)');
      }
    } catch (error) {
      const msg = axios.isAxiosError(error)
        ? `${error.response?.status} ${JSON.stringify(error.response?.data ?? error.message)}`
        : (error instanceof Error ? error.message : String(error));
      logger.warn(`Could not check/fix indexing settings: ${msg}`);
    }
  }

  /**
   * Request Google to index the given URL via the Google Indexing API.
   * Skipped if GOOGLE_INDEXING_SA_KEY is not set or indexing is currently blocked.
   */
  async requestIndexing(url: string): Promise<void> {
    if (!this.indexingSaKey) return;
    if (this.indexingBlocked) {
      logger.warn(`Indexing skipped (site is blocked for crawlers): ${url}`);
      return;
    }

    try {
      const accessToken = await this.getGoogleAccessTokenCached();
      await axios.post(
        'https://indexing.googleapis.com/v3/urlNotifications:publish',
        { url, type: 'URL_UPDATED' },
        { headers: { Authorization: `Bearer ${accessToken}` }, timeout: 15000 },
      );
      logger.info(`Google Indexing API: requested indexing for ${url}`);
    } catch (error) {
      const msg = axios.isAxiosError(error)
        ? `${error.response?.status} ${JSON.stringify(error.response?.data ?? error.message)}`
        : (error instanceof Error ? error.message : String(error));
      logger.warn(`Google Indexing API request failed for ${url}: ${msg}`);
    }
  }

  /**
   * Register Rank Math meta fields with REST API so they can be written via WP REST.
   * Also adds OG/canonical fallback output for posts missing Rank Math's own output.
   */
  async ensureRankMathRestSnippet(): Promise<void> {
    const phpCode = `
// Register Rank Math meta fields for REST API write access
// (Rank Math handles OG/canonical/twitter output — this only enables REST API writes)
add_action('init', function() {
    \$meta_fields = [
        'rank_math_description',
        'rank_math_title',
        'rank_math_focus_keyword',
        'rank_math_facebook_image',
        'rank_math_twitter_image',
        'rank_math_twitter_use_facebook_data',
    ];
    foreach (\$meta_fields as \$field) {
        register_post_meta('post', \$field, [
            'show_in_rest' => true,
            'single' => true,
            'type' => 'string',
            'auth_callback' => function() { return current_user_can('edit_posts'); },
        ]);
    }
});`.trim();

    try {
      const { data: snippets } = await axios.get(
        `${this.wpUrl}/wp-json/code-snippets/v1/snippets`,
        { headers: this.api.defaults.headers as Record<string, string>, timeout: 30000 },
      );
      const existing = (snippets as Array<{ id: number; name: string }>)
        .find((s) => s.name === RANKMATH_REST_SNIPPET_TITLE);

      if (existing) {
        // Update existing snippet with latest code
        await axios.put(
          `${this.wpUrl}/wp-json/code-snippets/v1/snippets/${existing.id}`,
          { code: phpCode, active: true },
          { headers: this.api.defaults.headers as Record<string, string>, timeout: 30000 },
        );
        logger.info(`Rank Math REST snippet updated (ID=${existing.id})`);
        return;
      }

      await axios.post(
        `${this.wpUrl}/wp-json/code-snippets/v1/snippets`,
        { name: RANKMATH_REST_SNIPPET_TITLE, code: phpCode, scope: 'global', active: true, priority: 5 },
        { headers: this.api.defaults.headers as Record<string, string>, timeout: 30000 },
      );
      logger.info('Rank Math REST meta snippet installed via Code Snippets plugin');
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.warn(`Failed to install Rank Math REST snippet: ${msg}`);
      logger.warn('Manually add via Code Snippets plugin with title: ' + RANKMATH_REST_SNIPPET_TITLE);
    }
  }

  /**
   * Ensure a navigation menu is registered with niche categories + static pages.
   * Uses Code Snippets to register menu and assign items programmatically.
   */
  async ensureNavigationMenu(categories: string[]): Promise<void> {
    // Build PHP menu items from niche categories
    const categoryItems = categories
      .map((cat) => {
        const slug = cat.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
        return `    ['label' => '${cat}', 'url' => home_url('/category/${slug}/')],`;
      })
      .join('\n');

    const phpCode = `
// Register and populate primary navigation menu with niche categories
add_action('after_setup_theme', function() {
    register_nav_menus(['primary' => 'Primary Menu']);
});

add_action('init', function() {
    $menu_name = 'TrendHunt Main';
    $menu_exists = wp_get_nav_menu_object($menu_name);

    // If menu already exists with items, skip recreation to preserve custom edits
    if ($menu_exists) {
        $existing_items = wp_get_nav_menu_items($menu_exists->term_id);
        if (!empty($existing_items)) {
            // Assign to primary location if not already assigned
            $locations = get_theme_mod('nav_menu_locations', []);
            if (empty($locations['primary']) || $locations['primary'] !== $menu_exists->term_id) {
                $locations['primary'] = $menu_exists->term_id;
                set_theme_mod('nav_menu_locations', $locations);
            }
            return;
        }
        // Menu exists but empty — rebuild it
        $menu_id = $menu_exists->term_id;
    } else {
        $menu_id = wp_create_nav_menu($menu_name);
        if (is_wp_error($menu_id)) return;
    }

    // Home
    wp_update_nav_menu_item($menu_id, 0, [
        'menu-item-title' => 'Home',
        'menu-item-url' => home_url('/'),
        'menu-item-status' => 'publish',
        'menu-item-type' => 'custom',
        'menu-item-position' => 1,
    ]);

    // Niche categories
    $categories = [
${categoryItems}
    ];
    $pos = 2;
    foreach ($categories as $cat) {
        wp_update_nav_menu_item($menu_id, 0, [
            'menu-item-title' => $cat['label'],
            'menu-item-url' => $cat['url'],
            'menu-item-status' => 'publish',
            'menu-item-type' => 'custom',
            'menu-item-position' => $pos++,
        ]);
    }

    // About page
    $about = get_page_by_path('about');
    if ($about) {
        wp_update_nav_menu_item($menu_id, 0, [
            'menu-item-title' => 'About',
            'menu-item-object-id' => $about->ID,
            'menu-item-object' => 'page',
            'menu-item-status' => 'publish',
            'menu-item-type' => 'post_type',
            'menu-item-position' => $pos++,
        ]);
    }

    // Assign to primary location
    $locations = get_theme_mod('nav_menu_locations', []);
    $locations['primary'] = $menu_id;
    set_theme_mod('nav_menu_locations', $locations);
});`.trim();

    try {
      const { data: snippets } = await axios.get(
        `${this.wpUrl}/wp-json/code-snippets/v1/snippets`,
        { headers: this.api.defaults.headers as Record<string, string>, timeout: 30000 },
      );
      const existing = (snippets as Array<{ id: number; name: string }>)
        .find((s) => s.name === NAV_MENU_SNIPPET_TITLE);

      if (existing) {
        await axios.put(
          `${this.wpUrl}/wp-json/code-snippets/v1/snippets/${existing.id}`,
          { code: phpCode, active: true },
          { headers: this.api.defaults.headers as Record<string, string>, timeout: 30000 },
        );
        logger.info(`Navigation menu snippet updated (ID=${existing.id})`);
        return;
      }

      await axios.post(
        `${this.wpUrl}/wp-json/code-snippets/v1/snippets`,
        { name: NAV_MENU_SNIPPET_TITLE, code: phpCode, scope: 'global', active: true, priority: 10 },
        { headers: this.api.defaults.headers as Record<string, string>, timeout: 30000 },
      );
      logger.info('Navigation menu snippet installed via Code Snippets plugin');
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.warn(`Failed to install navigation menu snippet: ${msg}`);
    }
  }

  /**
   * Install dark mode CSS as a Code Snippets plugin snippet (more reliable than inline <style>).
   * Outputs dark mode overrides for .post-content via wp_head.
   */
  async ensureDarkModeSnippet(): Promise<void> {
    const phpCode = `
// Dark mode support for Auto Blog post content
add_action('wp_head', function() {
    if (!is_singular('post')) return;
    echo '<style>
@media (prefers-color-scheme:dark){
.post-content{background:#1a1a2e!important;color:#e0e0e0!important}
.post-content p,.post-content li,.post-content td{color:#e0e0e0!important}
.post-content a{color:#4da6ff!important}
.post-content h2,.post-content h3{color:#f0f0f0!important}
.post-content div[style*="background:#f0f4ff"],.post-content div[style*="background:#f8f9fa"],.post-content details[style*="background:#f0f4ff"]{background:#2a2a3e!important;border-color:#3a3a5e!important}
.post-content blockquote{background:#2a2a3e!important;color:#c0c0c0!important}
.post-content table tr[style*="background:#fff"]{background:#2a2a3e!important}
.post-content table tr[style*="background:#f8f9fa"]{background:#222238!important}
.post-content div[style*="background:#f0f8ff"]{background:#1a2a3e!important;border-color:#3a4a6e!important;color:#e0e0e0!important}
.post-content div[style*="background:#fffbeb"]{background:#2a2a1e!important;border-color:#665500!important;color:#d4d4d4!important}
.post-content div[style*="background:#f0fff4"]{background:#1a2e1a!important;border-color:#2e5e2e!important;color:#d4d4d4!important}
.post-content div[style*="background:#fff5f5"]{background:#2e1a1a!important;border-color:#5e2e2e!important;color:#d4d4d4!important}
.post-content table{border-color:#3a3a5e!important}
.post-content th{background:#2a2a3e!important;color:#e0e0e0!important}
.post-content td{border-color:#3a3a5e!important}
.post-content tr:nth-child(even){background:#222238!important}
.post-content strong{color:#f0f0f0!important}
.ab-ai-disclosure{background:#2a2a3e!important;border-color:#3a3a5e!important;color:#b0b0b0!important}
.ab-comment-prompt{background:#2a2a3e!important;border-color:#4a4aff!important}
.ab-comment-prompt p{color:#e0e0e0!important}
.ab-series-nav{background:#2a2a3e!important;border-color:#3a3a5e!important;color:#e0e0e0!important}
.ab-affiliate-disclosure{background:#2a2a1e!important;border-color:#665500!important;color:#d4d4d4!important}
}
</style>';
});`.trim();

    try {
      const { data: snippets } = await axios.get(
        `${this.wpUrl}/wp-json/code-snippets/v1/snippets`,
        { headers: this.api.defaults.headers as Record<string, string>, timeout: 30000 },
      );
      const existing = (snippets as Array<{ id: number; name: string }>)
        .find((s) => s.name === DARKMODE_SNIPPET_TITLE);

      if (existing) {
        await axios.put(
          `${this.wpUrl}/wp-json/code-snippets/v1/snippets/${existing.id}`,
          { code: phpCode, active: true },
          { headers: this.api.defaults.headers as Record<string, string>, timeout: 30000 },
        );
        logger.info(`Dark mode snippet updated (ID=${existing.id})`);
        return;
      }

      await axios.post(
        `${this.wpUrl}/wp-json/code-snippets/v1/snippets`,
        { name: DARKMODE_SNIPPET_TITLE, code: phpCode, scope: 'global', active: true, priority: 10 },
        { headers: this.api.defaults.headers as Record<string, string>, timeout: 30000 },
      );
      logger.info('Dark mode CSS snippet installed via Code Snippets plugin');
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.warn(`Failed to install dark mode snippet: ${msg}`);
    }
  }

  /**
   * Ensure thin archive pages (tag, author, date) have noindex meta tag.
   * Prevents crawl budget waste on low-value pages while preserving link equity (follow).
   */
  async ensureNoindexThinPagesSnippet(): Promise<void> {
    const phpCode = `
// Add noindex to thin archive pages (tag, author, date) and categories with <3 posts
add_action('wp_head', function() {
    if (is_tag() || is_author() || is_date()) {
        echo '<meta name="robots" content="noindex, follow" />' . "\\n";
        return;
    }
    // Noindex category pages with fewer than 3 posts (thin content)
    if (is_category()) {
        \$cat = get_queried_object();
        if (\$cat && \$cat->count < 3) {
            echo '<meta name="robots" content="noindex, follow" />' . "\\n";
        }
    }
});`.trim();

    try {
      const { data: snippets } = await axios.get(
        `${this.wpUrl}/wp-json/code-snippets/v1/snippets`,
        { headers: this.api.defaults.headers as Record<string, string>, timeout: 30000 },
      );
      const existing = (snippets as Array<{ id: number; name: string }>)
        .find((s) => s.name === NOINDEX_THIN_SNIPPET_TITLE);

      if (existing) {
        // Update existing snippet with latest code (includes category noindex)
        await axios.put(
          `${this.wpUrl}/wp-json/code-snippets/v1/snippets/${existing.id}`,
          { code: phpCode, active: true },
          { headers: this.api.defaults.headers as Record<string, string>, timeout: 30000 },
        );
        logger.info(`Noindex thin pages snippet updated (ID=${existing.id})`);
        return;
      }

      await axios.post(
        `${this.wpUrl}/wp-json/code-snippets/v1/snippets`,
        { name: NOINDEX_THIN_SNIPPET_TITLE, code: phpCode, scope: 'global', active: true, priority: 5 },
        { headers: this.api.defaults.headers as Record<string, string>, timeout: 30000 },
      );
      logger.info('Noindex thin pages snippet installed via Code Snippets plugin');
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.warn(`Failed to install noindex thin pages snippet: ${msg}`);
    }
  }

  /**
   * Optimize WordPress RSS feed: full content mode, 20 items, prepend featured images.
   */
  async ensureRssFeedOptimization(): Promise<void> {
    // Set RSS to full content with 20 items via WordPress settings API
    try {
      await this.api.post('/settings', {
        posts_per_rss: 20,
        rss_use_excerpt: 0, // 0 = full content
      });
      logger.info('RSS feed settings: 20 items, full content mode');
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.debug(`RSS settings update failed (may require options API): ${msg}`);
    }

    // Install snippet to prepend featured image to RSS entries
    const phpCode = `
// Prepend featured image to RSS feed entries for better feed reader display
add_filter('the_content_feed', function(\$content) {
    global \$post;
    if (has_post_thumbnail(\$post->ID)) {
        \$img = get_the_post_thumbnail(\$post->ID, 'large', ['style' => 'max-width:100%;height:auto;margin-bottom:16px;']);
        \$content = \$img . \$content;
    }
    return \$content;
});

// Add featured image as media:content to RSS (for feed readers that support it)
add_action('rss2_item', function() {
    global \$post;
    if (has_post_thumbnail(\$post->ID)) {
        \$thumb_id = get_post_thumbnail_id(\$post->ID);
        \$thumb_url = wp_get_attachment_image_url(\$thumb_id, 'large');
        \$thumb_meta = wp_get_attachment_metadata(\$thumb_id);
        if (\$thumb_url && \$thumb_meta) {
            \$width = \$thumb_meta['width'] ?? 1200;
            \$height = \$thumb_meta['height'] ?? 675;
            echo '<media:content url="' . esc_url(\$thumb_url) . '" medium="image" width="' . intval(\$width) . '" height="' . intval(\$height) . '" />' . "\\n";
        }
    }
});

// Add media namespace to RSS
add_filter('rss2_ns', function() {
    echo 'xmlns:media="http://search.yahoo.com/mrss/" ';
});`.trim();

    try {
      const { data: snippets } = await axios.get(
        `${this.wpUrl}/wp-json/code-snippets/v1/snippets`,
        { headers: this.api.defaults.headers as Record<string, string>, timeout: 30000 },
      );
      const existing = (snippets as Array<{ id: number; name: string }>)
        .find((s) => s.name === RSS_OPTIMIZATION_SNIPPET_TITLE);

      if (existing) {
        await axios.put(
          `${this.wpUrl}/wp-json/code-snippets/v1/snippets/${existing.id}`,
          { code: phpCode, active: true },
          { headers: this.api.defaults.headers as Record<string, string>, timeout: 30000 },
        );
        logger.info(`RSS optimization snippet updated (ID=${existing.id})`);
        return;
      }

      await axios.post(
        `${this.wpUrl}/wp-json/code-snippets/v1/snippets`,
        { name: RSS_OPTIMIZATION_SNIPPET_TITLE, code: phpCode, scope: 'global', active: true, priority: 10 },
        { headers: this.api.defaults.headers as Record<string, string>, timeout: 30000 },
      );
      logger.info('RSS feed optimization snippet installed via Code Snippets plugin');
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.warn(`Failed to install RSS optimization snippet: ${msg}`);
    }
  }

  /**
   * Enhance wp-sitemap.xml with image entries (featured + inline images per post).
   * Skips if Rank Math is active (it handles image sitemaps already).
   */
  async ensureImageSitemapSnippet(): Promise<void> {
    // Check if Rank Math is active — it already handles image sitemaps
    try {
      const { data: plugins } = await this.api.get('/plugins');
      const rankMath = (plugins as Array<{ plugin: string; status: string }>)
        .find((p) => p.plugin.startsWith('seo-by-rank-math/'));
      if (rankMath?.status === 'active') {
        logger.debug('Rank Math active — skipping image sitemap snippet (Rank Math handles it)');
        return;
      }
    } catch {
      // Plugin check failed, proceed with snippet installation
    }

    const phpCode = `
// Add images to WordPress native wp-sitemap.xml entries
add_filter('wp_sitemaps_posts_entry', function(\$entry, \$post) {
    \$images = [];

    // Featured image
    if (has_post_thumbnail(\$post->ID)) {
        \$thumb_url = get_the_post_thumbnail_url(\$post->ID, 'full');
        if (\$thumb_url) {
            \$images[] = ['loc' => \$thumb_url];
        }
    }

    // Inline images from post content
    \$content = \$post->post_content;
    if (preg_match_all('/<img[^>]+src=["\\'](https?:\\/\\/[^"\\'>]+)["\\'][^>]*>/i', \$content, \$matches)) {
        foreach (array_unique(\$matches[1]) as \$img_url) {
            // Only include images from our own domain
            if (strpos(\$img_url, parse_url(home_url(), PHP_URL_HOST)) !== false) {
                \$images[] = ['loc' => \$img_url];
            }
        }
    }

    if (!empty(\$images)) {
        \$entry['image:image'] = \$images;
    }

    return \$entry;
}, 10, 2);`.trim();

    try {
      const { data: snippets } = await axios.get(
        `${this.wpUrl}/wp-json/code-snippets/v1/snippets`,
        { headers: this.api.defaults.headers as Record<string, string>, timeout: 30000 },
      );
      const existing = (snippets as Array<{ id: number; name: string }>)
        .find((s) => s.name === IMAGE_SITEMAP_SNIPPET_TITLE);

      if (existing) {
        await axios.put(
          `${this.wpUrl}/wp-json/code-snippets/v1/snippets/${existing.id}`,
          { code: phpCode, active: true },
          { headers: this.api.defaults.headers as Record<string, string>, timeout: 30000 },
        );
        logger.info(`Image sitemap snippet updated (ID=${existing.id})`);
        return;
      }

      await axios.post(
        `${this.wpUrl}/wp-json/code-snippets/v1/snippets`,
        { name: IMAGE_SITEMAP_SNIPPET_TITLE, code: phpCode, scope: 'global', active: true, priority: 10 },
        { headers: this.api.defaults.headers as Record<string, string>, timeout: 30000 },
      );
      logger.info('Image sitemap enhancement snippet installed via Code Snippets plugin');
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.warn(`Failed to install image sitemap snippet: ${msg}`);
    }
  }

  /**
   * Set XML sitemap priority and changefreq based on content freshness class.
   * Evergreen content gets higher priority (0.8) with monthly changefreq,
   * seasonal gets medium (0.6) with weekly, time-sensitive gets lower (0.4) with daily.
   * Uses _autoblog_freshness_class post meta set during publishing.
   */
  async ensureSitemapPrioritySnippet(): Promise<void> {
    const phpCode = `
// Register freshness class meta for REST API
add_action('init', function() {
    register_post_meta('post', '_autoblog_freshness_class', [
        'show_in_rest' => true,
        'single' => true,
        'type' => 'string',
        'sanitize_callback' => 'sanitize_text_field',
        'auth_callback' => function() { return current_user_can('edit_posts'); },
    ]);
    // Pillar page meta (for pages post type)
    foreach (['_autoblog_pillar_post_count', '_autoblog_pillar_word_count'] as $pmeta) {
        register_post_meta('page', $pmeta, [
            'show_in_rest' => true,
            'single' => true,
            'type' => 'integer',
            'auth_callback' => function() { return current_user_can('edit_pages'); },
        ]);
    }
});

// Adjust Rank Math sitemap priority based on content freshness class
add_filter('rank_math/sitemap/entry', function(\$entry, \$type, \$post) {
    if (\$type !== 'post' || !isset(\$post->ID)) return \$entry;

    \$freshness = get_post_meta(\$post->ID, '_autoblog_freshness_class', true);
    if (!\$freshness) \$freshness = 'seasonal'; // default

    switch (\$freshness) {
        case 'evergreen':
            \$entry['priority'] = 0.8;
            \$entry['changefreq'] = 'monthly';
            break;
        case 'seasonal':
            \$entry['priority'] = 0.6;
            \$entry['changefreq'] = 'weekly';
            break;
        case 'time-sensitive':
            \$entry['priority'] = 0.4;
            \$entry['changefreq'] = 'daily';
            break;
    }

    // Boost recently updated posts
    \$modified = strtotime(\$post->post_modified);
    if (\$modified && (time() - \$modified) < 7 * DAY_IN_SECONDS) {
        \$entry['priority'] = min(1.0, \$entry['priority'] + 0.1);
    }

    return \$entry;
}, 10, 3);

// Also hook into WordPress native sitemap for non-Rank Math setups
add_filter('wp_sitemaps_posts_entry', function(\$entry, \$post) {
    \$freshness = get_post_meta(\$post->ID, '_autoblog_freshness_class', true);
    if (!\$freshness) return \$entry;

    \$priority_map = ['evergreen' => 0.8, 'seasonal' => 0.6, 'time-sensitive' => 0.4];
    if (isset(\$priority_map[\$freshness])) {
        \$entry['priority'] = \$priority_map[\$freshness];
    }
    return \$entry;
}, 10, 2);`.trim();

    try {
      const { data: snippets } = await axios.get(
        `${this.wpUrl}/wp-json/code-snippets/v1/snippets`,
        { headers: this.api.defaults.headers as Record<string, string>, timeout: 30000 },
      );
      const existing = (snippets as Array<{ id: number; name: string }>)
        .find((s) => s.name === SITEMAP_PRIORITY_SNIPPET_TITLE);

      if (existing) {
        await axios.put(
          `${this.wpUrl}/wp-json/code-snippets/v1/snippets/${existing.id}`,
          { code: phpCode, active: true },
          { headers: this.api.defaults.headers as Record<string, string>, timeout: 30000 },
        );
        logger.info(`Sitemap priority snippet updated (ID=${existing.id})`);
        return;
      }

      await axios.post(
        `${this.wpUrl}/wp-json/code-snippets/v1/snippets`,
        { name: SITEMAP_PRIORITY_SNIPPET_TITLE, code: phpCode, scope: 'global', active: true, priority: 5 },
        { headers: this.api.defaults.headers as Record<string, string>, timeout: 30000 },
      );
      logger.info('Sitemap priority snippet installed via Code Snippets plugin');
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.warn(`Failed to install sitemap priority snippet: ${msg}`);
    }
  }

  /**
   * Ensure post content CSS is loaded site-wide via Code Snippets plugin.
   * Eliminates per-post inline <style> duplication (~3KB savings per post).
   */
  async ensurePostCssSnippet(): Promise<void> {
    const phpCode = `
// Enqueue Auto Blog post content styles site-wide (removes per-post inline CSS)
add_action('wp_head', function() {
    if (!is_singular('post')) return;
    echo '<style>
.post-content{max-width:760px;margin:0 auto;padding:0 20px;font-family:"Noto Sans KR",sans-serif;color:#333;line-height:1.7;font-size:16px}
.post-content p{margin:0 0 20px 0;line-height:1.8;color:#333;font-size:16px}
.post-content h2{border-left:5px solid #0066FF;padding-left:15px;font-size:22px;color:#222;margin:40px 0 20px 0}
.post-content h3{font-size:18px;color:#444;margin:30px 0 15px 0;padding-bottom:8px;border-bottom:1px solid #eee}
.post-content a{color:#0066FF;text-decoration:underline}
.post-content a[target="_blank"]{color:#0066FF;text-decoration:underline}
.post-content blockquote{border-left:4px solid #0066FF;margin:24px 0;padding:16px 24px;background:#f8f9fa;font-style:italic;color:#555;line-height:1.7}
.post-content hr{border:none;height:1px;background:linear-gradient(to right,#ddd,#eee,#ddd);margin:36px 0}
.post-content figure{margin:30px 0;text-align:center}
.post-content figure img{max-width:100%;width:100%;height:auto;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,0.1);aspect-ratio:16/9;object-fit:cover}
.post-content figcaption{margin-top:10px;font-size:13px;color:#888;line-height:1.5}
.ab-toc{background:#f0f4ff;padding:16px 20px;border-radius:12px;margin:24px 0 36px 0}
.ab-toc summary{font-weight:700;font-size:17px;margin:0 0 12px 0;color:#0066FF;cursor:pointer;list-style:none}
.ab-toc ol{margin:0;padding-left:20px;line-height:2.0;color:#555}
.ab-toc a{color:#0066FF;text-decoration:none}
.ab-takeaways{background:#f0f4ff;border:2px solid #0066FF;padding:20px 24px;border-radius:12px;margin:0 0 36px 0}
.ab-snippet{background:#f8f9fa;border:1px solid #e2e8f0;padding:20px;border-radius:8px;margin:0 0 24px 0}
.ab-snippet p{margin:0;font-size:16px;line-height:1.7;color:#333}
.ab-highlight{background:#f8f9fa;border-left:4px solid #0066FF;padding:20px 24px;margin:24px 0;border-radius:0 8px 8px 0}
.ab-highlight p{margin:0;line-height:1.7;color:#555}
.ab-keypoint{background:#fff8e1;border:1px solid #ffe082;padding:20px 24px;border-radius:8px;margin:24px 0}
.ab-metrics{display:flex;flex-wrap:wrap;gap:12px;margin:24px 0}
.ab-metrics>div{flex:1;min-width:140px;padding:16px;background:#f0f4ff;border-radius:10px;text-align:center}
.ab-step{display:flex;align-items:center;gap:12px;margin:30px 0 15px 0}
.ab-step-num{width:36px;height:36px;background:#0066FF;border-radius:50%;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:16px;flex-shrink:0}
.ab-proscons{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:24px 0}
.ab-pros{padding:16px;background:#f0fff4;border-radius:10px;border:1px solid #c6f6d5}
.ab-cons{padding:16px;background:#fff5f5;border-radius:10px;border:1px solid #fed7d7}
.ab-pros-label{margin:0 0 8px 0;font-weight:700;color:#22543d}
.ab-cons-label{margin:0 0 8px 0;font-weight:700;color:#742a2a}
.ab-step h3{margin:0;font-size:18px;color:#222}
.ab-back-top{text-align:center;margin:20px 0 0 0}
.ab-back-top a{font-size:14px;color:#0066FF}
.ab-table-wrap{overflow-x:auto;-webkit-overflow-scrolling:touch;margin:24px 0}
.ab-cta{margin:30px 0;border-radius:12px;text-align:center}
.ab-cta-newsletter{padding:28px 24px;background:linear-gradient(135deg,#0052CC 0%,#0066FF 100%);color:#fff}
.ab-cta-newsletter p{color:#fff}
.ab-cta-engagement{padding:24px;background:linear-gradient(135deg,#f0f4ff 0%,#e8f0fe 100%)}
.ab-cta-share{margin:24px 0;padding:20px 24px;background:#f0f4ff;border-radius:12px;text-align:center}
.ab-related{margin:30px 0;padding:24px;background:#f8f9fa;border-radius:12px}
.ab-related-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:12px}
.ab-related-card{text-decoration:none;display:block;background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:16px;transition:box-shadow 0.2s}
.ab-related-card:hover{box-shadow:0 4px 12px rgba(0,0,0,0.1)}
.ab-tag{display:inline-block;padding:4px 12px;margin:0 6px 6px 0;background:#f0f4ff;color:#0066FF;border-radius:14px;font-size:13px;text-decoration:none}
.ab-byline{margin:30px 0 0 0;padding:20px 24px;background:#f8f9fa;border-radius:8px;display:flex;align-items:center;gap:16px}
.ab-share-btn{display:inline-block;padding:8px 16px;margin:0 8px 8px 0;border-radius:6px;text-decoration:none;font-size:14px;font-weight:600;color:#fff}
.ab-disclaimer{margin:40px 0 0 0;padding-top:20px;border-top:1px solid #eee;font-size:13px;color:#999;line-height:1.6}
.ab-header{margin:0 0 30px 0;padding-bottom:20px;border-bottom:1px solid #eee}
.ab-header time{font-size:13px;color:#888}
.ab-faq details{margin:0 0 12px 0;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden}
.ab-faq summary{padding:14px 20px;font-weight:600;font-size:16px;color:#222;cursor:pointer;background:#f8f9fa;list-style:none}
.ab-faq .faq-answer{padding:14px 20px}
.ab-newsletter-cta{margin:30px 0;padding:28px 24px;background:linear-gradient(135deg,#0052CC 0%,#0066FF 100%);border-radius:12px;text-align:center;color:#fff}
.ab-newsletter-cta input[type=email]{padding:10px 16px;border:none;border-radius:6px;font-size:15px;width:60%;max-width:300px}
.ab-newsletter-cta button{padding:10px 24px;background:#fff;color:#0066FF;border:none;border-radius:6px;font-weight:700;font-size:15px;cursor:pointer;margin-left:8px}
.ab-series-nav{margin:24px 0;padding:16px 20px;background:#f0f4ff;border:1px solid #d0d8ff;border-radius:10px}
.ab-series-nav a{color:#0066FF;text-decoration:none;font-weight:500}
@media(max-width:768px){.ab-proscons{grid-template-columns:1fr}.ab-newsletter-cta input[type=email]{width:100%;margin-bottom:8px}.ab-newsletter-cta button{margin-left:0;width:100%}}
@media(prefers-color-scheme:dark){
.post-content{background:#1a1a2e!important;color:#e0e0e0!important}
.post-content p,.post-content li,.post-content td{color:#e0e0e0!important}
.post-content a{color:#4da6ff!important}
.post-content h2,.post-content h3{color:#f0f0f0!important}
.post-content blockquote{background:#2a2a3e!important;color:#c0c0c0!important}
.ab-toc{background:#2a2a3e!important}
.ab-toc summary{color:#4da6ff!important}
.ab-cta-engagement{background:linear-gradient(135deg,#1a1a3e 0%,#2a2a4e 100%)}
.ab-cta-engagement p{color:#e0e0e0!important}
.ab-cta-share{background:#2a2a3e!important}
.ab-cta-share p{color:#e0e0e0!important}
.ab-related{background:#2a2a3e!important}
.ab-related-card{background:#1a1a2e!important;border-color:#3a3a5e!important}
.ab-related-card p{color:#e0e0e0!important}
.ab-tag{background:#2a2a4e!important;color:#4da6ff!important}
.ab-byline{background:#2a2a3e!important}
.ab-byline p{color:#e0e0e0!important}
.ab-takeaways{background:#1a1a3e!important;border-color:#4a4aff!important}
.ab-takeaways p,.ab-takeaways li{color:#e0e0e0!important}
.ab-snippet{background:#2a2a3e!important;border-color:#3a3a5e!important}
.ab-snippet p,.ab-snippet li{color:#e0e0e0!important}
.ab-highlight{background:#2a2a3e!important;border-color:#4a4aff!important}
.ab-highlight p{color:#e0e0e0!important}
.ab-keypoint{background:#2a2a1e!important;border-color:#665500!important}
.ab-keypoint p{color:#e0e0e0!important}
.ab-metrics>div{background:#1a1a3e!important}
.ab-metrics p{color:#e0e0e0!important}
.ab-pros{background:#1a2e1a!important;border-color:#2e5e2e!important}
.ab-cons{background:#2e1a1a!important;border-color:#5e2e2e!important}
.ab-pros-label{color:#68d391!important}
.ab-cons-label{color:#fc8181!important}
.ab-step h3{color:#f0f0f0!important}
.ab-back-top a{color:#4da6ff!important}
.ab-faq details{border-color:#3a3a5e!important}
.ab-faq summary{background:#2a2a3e!important;color:#e0e0e0!important}
.ab-header{border-color:#3a3a5e!important}
.ab-disclaimer{border-color:#3a3a5e!important;color:#888!important}
.ab-newsletter-cta{background:linear-gradient(135deg,#1a1a3e 0%,#2a2a4e 100%)!important}
.ab-series-nav{background:#2a2a3e!important;border-color:#3a3a5e!important}
.ab-progress{background:transparent!important}
.ab-comment-prompt{background:#2a2a3e!important;border-color:#4a4aff!important}
.ab-comment-prompt p{color:#e0e0e0!important}
.ab-comment-prompt a{color:#4da6ff!important}
.ab-ai-disclosure{background:#2a2a3e!important;border-color:#3a3a5e!important;color:#b0b0b0!important}
.ab-ai-disclosure a{color:#4da6ff!important}
.ab-affiliate-disclosure{background:#2a2a1e!important;border-color:#665500!important;color:#d4d4d4!important}
.ab-ad-slot{background:transparent!important}
.ab-author-bio{background:#2a2a3e!important;border-color:#3a3a5e!important}
.ab-author-bio p{color:#e0e0e0!important}
.ab-disclaimer-finance,.ab-disclaimer-beauty{background:#2a2a1e!important;border-color:#665500!important;color:#d4d4d4!important}
.ab-what-changed{background:#1a2e1a!important;border-color:#2e5e2e!important;color:#d4d4d4!important}
div[style*="background:#f0f8ff"]{background:#1a2a3e!important;border-color:#3a4a6e!important;color:#e0e0e0!important}
div[style*="background:#fffbeb"]{background:#2a2a1e!important;border-color:#665500!important;color:#d4d4d4!important}
div[style*="background:#f0fff4"]{background:#1a2e1a!important;border-color:#2e5e2e!important;color:#d4d4d4!important}
div[style*="background:#fff5f5"]{background:#2e1a1a!important;border-color:#5e2e2e!important;color:#d4d4d4!important}
.post-content table{border-color:#3a3a5e!important}
.post-content th{background:#2a2a3e!important;color:#e0e0e0!important}
.post-content td{border-color:#3a3a5e!important}
.post-content tr:nth-child(even){background:#222238!important}
.post-content strong{color:#f0f0f0!important}
}
.ab-progress{position:fixed;top:0;left:0;width:0;height:3px;background:linear-gradient(90deg,#0052CC,#0066FF);z-index:99999;transition:width 0.1s linear}
</style>';
echo '<script>
(function(){if(!document.querySelector(".post-content"))return;var b=document.createElement("div");b.className="ab-progress";document.body.appendChild(b);window.addEventListener("scroll",function(){var h=document.documentElement.scrollHeight-window.innerHeight;b.style.width=h>0?Math.min(100,(window.scrollY/h)*100)+"%":"0%"})})();
// GA4 conversion tracking for CTAs, share buttons, and affiliate links
(function(){if(typeof gtag!=="function")return;
document.addEventListener("click",function(e){var t=e.target.closest("a");if(!t)return;var h=t.getAttribute("href")||"";
if(t.closest(".ab-cta-share")){gtag("event","social_share",{event_category:"engagement",event_label:h.includes("twitter")?"twitter":h.includes("linkedin")?"linkedin":"facebook",content_type:"blog_post"})}
else if(t.closest(".ab-cta-newsletter,.ab-cta")){gtag("event","cta_click",{event_category:"engagement",event_label:t.textContent.trim().substring(0,50)})}
else if(t.getAttribute("rel")&&t.getAttribute("rel").includes("sponsored")){gtag("event","affiliate_click",{event_category:"monetization",event_label:t.textContent.trim().substring(0,50),link_url:h})}
else if(t.closest(".ab-related-card")){gtag("event","related_post_click",{event_category:"engagement",event_label:t.textContent.trim().substring(0,80)})}
})})();
</script>';
});`.trim();

    try {
      const { data: snippets } = await axios.get(
        `${this.wpUrl}/wp-json/code-snippets/v1/snippets`,
        { headers: this.api.defaults.headers as Record<string, string>, timeout: 30000 },
      );
      const existing = (snippets as Array<{ id: number; name: string }>)
        .find((s) => s.name === POST_CSS_SNIPPET_TITLE);

      if (existing) {
        await axios.put(
          `${this.wpUrl}/wp-json/code-snippets/v1/snippets/${existing.id}`,
          { code: phpCode, active: true },
          { headers: this.api.defaults.headers as Record<string, string>, timeout: 30000 },
        );
        logger.info(`Post CSS snippet updated (ID=${existing.id})`);
        return;
      }

      await axios.post(
        `${this.wpUrl}/wp-json/code-snippets/v1/snippets`,
        { name: POST_CSS_SNIPPET_TITLE, code: phpCode, scope: 'global', active: true, priority: 10 },
        { headers: this.api.defaults.headers as Record<string, string>, timeout: 30000 },
      );
      logger.info('Post CSS snippet installed via Code Snippets plugin');
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.warn(`Failed to install post CSS snippet (will use inline fallback): ${msg}`);
    }
  }

  /**
   * Check if the post CSS snippet is active (used by WordPressService to skip inline CSS).
   */
  async isPostCssSnippetActive(): Promise<boolean> {
    try {
      const { data: snippets } = await axios.get(
        `${this.wpUrl}/wp-json/code-snippets/v1/snippets`,
        { headers: this.api.defaults.headers as Record<string, string>, timeout: 30000 },
      );
      const existing = (snippets as Array<{ id: number; name: string; active: boolean }>)
        .find((s) => s.name === POST_CSS_SNIPPET_TITLE);
      return existing?.active === true;
    } catch {
      return false;
    }
  }

  /**
   * Verify indexing status of recently published posts via GSC URL Inspection API.
   * Re-requests indexing for posts not yet indexed within 7 days.
   */
  async verifyRecentIndexing(recentUrls: string[]): Promise<void> {
    if (!this.indexingSaKey || recentUrls.length === 0) return;
    if (this.indexingBlocked) {
      logger.debug('Indexing verification skipped (site blocked for crawlers)');
      return;
    }

    let accessToken: string;
    try {
      accessToken = await this.getGoogleAccessTokenCached();
    } catch {
      logger.debug('Could not get Google access token for URL inspection');
      return;
    }

    // GSC URL Inspection API requires searchconsole scope
    let inspectionToken: string;
    try {
      inspectionToken = await getGoogleAccessToken(this.indexingSaKey, 'https://www.googleapis.com/auth/webmasters.readonly');
    } catch {
      logger.debug('Could not get GSC inspection token');
      return;
    }

    const siteUrl = this.wpUrl;
    let notIndexed = 0;
    let reIndexed = 0;

    for (const url of recentUrls.slice(0, 10)) {
      try {
        const { data } = await axios.post(
          'https://searchconsole.googleapis.com/v1/urlInspection/index:inspect',
          { inspectionUrl: url, siteUrl },
          { headers: { Authorization: `Bearer ${inspectionToken}` }, timeout: 15000 },
        );

        const verdict = (data as { inspectionResult?: { indexStatusResult?: { verdict?: string } } })
          ?.inspectionResult?.indexStatusResult?.verdict;

        if (verdict && verdict !== 'PASS') {
          notIndexed++;
          logger.warn(`Not indexed: ${url} (verdict: ${verdict})`);
          // Re-request indexing
          await this.requestIndexing(url);
          reIndexed++;
        } else {
          logger.debug(`Indexed OK: ${url}`);
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        logger.debug(`URL inspection failed for ${url}: ${msg}`);
      }
    }

    if (notIndexed > 0) {
      logger.info(`Indexing verification: ${notIndexed} not indexed, ${reIndexed} re-submitted`);
    } else {
      logger.info(`Indexing verification: all ${Math.min(recentUrls.length, 10)} recent URLs indexed`);
    }
  }

  /** @deprecated Use ensureHeaderScripts instead */
  async ensureVerificationMetaTags(googleCode?: string, naverCode?: string): Promise<void> {
    return this.ensureHeaderScripts({ googleCode, naverCode });
  }

  private async getGoogleAccessTokenCached(): Promise<string> {
    return getGoogleAccessToken(this.indexingSaKey, 'https://www.googleapis.com/auth/indexing');
  }

  private async ensurePlugin(): Promise<boolean> {
    try {
      // Check if plugin is already installed
      const { data: plugins } = await this.api.get('/plugins');
      const existing = (plugins as Array<{ plugin: string; status: string }>)
        .find((p) => p.plugin.startsWith(WPCODE_SLUG + '/'));

      if (existing) {
        if (existing.status !== 'active') {
          await this.api.post(`/plugins/${encodeURIComponent(existing.plugin)}`, { status: 'active' });
          logger.info(`Plugin activated: ${WPCODE_SLUG}`);
        } else {
          logger.debug(`Plugin already active: ${WPCODE_SLUG}`);
        }
        return true;
      }

      // Install and activate
      await this.api.post('/plugins', { slug: WPCODE_SLUG, status: 'active' });
      logger.info(`Plugin installed and activated: ${WPCODE_SLUG}`);
      return true;
    } catch (error) {
      const msg = axios.isAxiosError(error)
        ? `${error.response?.status} ${JSON.stringify(error.response?.data ?? error.message)}`
        : (error instanceof Error ? error.message : String(error));
      logger.warn(`Could not install/activate WPCode plugin: ${msg}`);
      return false;
    }
  }

  private async trySetHeader(headerHtml: string): Promise<boolean> {
    // WPCode (Insert Headers and Footers) stores header content in option 'ihaf_insert_header'.
    // Try setting it via the WordPress settings REST API.
    try {
      await this.api.post('/settings', { ihaf_insert_header: headerHtml });
      return true;
    } catch {
      // Setting not registered with REST API — expected for most WPCode versions
    }

    // Try WPCode's own REST endpoint (v2+ may expose this)
    try {
      const wpCodeApi = axios.create({
        baseURL: this.api.defaults.baseURL?.replace('/wp/v2', '/wpcode/v1'),
        headers: this.api.defaults.headers as Record<string, string>,
        timeout: 30000,
      });
      await wpCodeApi.post('/headers-footers', { header: headerHtml });
      return true;
    } catch {
      // Endpoint not available
    }

    return false;
  }

  private logManualInstructions(headerHtml: string): void {
    logger.warn('=== Manual Setup Required ===');
    logger.warn('Go to WordPress Admin > Code Snippets > Header & Footer');
    logger.warn('Paste the following into the "Header" section:');
    logger.warn(headerHtml);
    logger.warn('============================');
  }

  /**
   * Add Google News Sitemap for news-explainer content type.
   * Generates a separate /news-sitemap.xml with posts published in the last 48 hours
   * that have _autoblog_content_type = 'news-explainer'.
   * Required for Google News inclusion and Discover news carousel.
   */
  async ensureNewsSitemapSnippet(): Promise<void> {
    const phpCode = `
// Google News Sitemap for news-explainer content
add_action('init', function() {
    add_rewrite_rule('^news-sitemap\\.xml$', 'index.php?autoblog_news_sitemap=1', 'top');
});

add_filter('query_vars', function(\$vars) {
    \$vars[] = 'autoblog_news_sitemap';
    return \$vars;
});

add_action('template_redirect', function() {
    if (!get_query_var('autoblog_news_sitemap')) return;

    header('Content-Type: application/xml; charset=UTF-8');
    header('X-Robots-Tag: noindex');

    echo '<?xml version="1.0" encoding="UTF-8"?>';
    echo '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">';

    // Fetch posts from last 48 hours (Google News requirement)
    \$args = [
        'post_type' => 'post',
        'post_status' => 'publish',
        'posts_per_page' => 50,
        'date_query' => [['after' => '48 hours ago']],
        'meta_query' => [
            'relation' => 'OR',
            ['key' => '_autoblog_content_type', 'value' => 'news-explainer', 'compare' => '='],
            ['key' => '_autoblog_content_type', 'value' => 'analysis', 'compare' => '='],
        ],
    ];

    \$query = new WP_Query(\$args);
    \$site_name = get_bloginfo('name');

    while (\$query->have_posts()) {
        \$query->the_post();
        \$post_date = get_the_date('Y-m-d\\TH:i:sP');
        \$title = htmlspecialchars(get_the_title(), ENT_XML1, 'UTF-8');
        \$lang = get_post_meta(get_the_ID(), '_autoblog_language', true) ?: 'en';
        \$keywords = get_post_meta(get_the_ID(), 'rank_math_focus_keyword', true);
        \$kw_tag = \$keywords ? '<news:keywords>' . htmlspecialchars(\$keywords, ENT_XML1, 'UTF-8') . '</news:keywords>' : '';

        echo '<url>';
        echo '<loc>' . get_permalink() . '</loc>';
        echo '<news:news>';
        echo '<news:publication>';
        echo '<news:name>' . htmlspecialchars(\$site_name, ENT_XML1, 'UTF-8') . '</news:name>';
        echo '<news:language>' . \$lang . '</news:language>';
        echo '</news:publication>';
        echo '<news:publication_date>' . \$post_date . '</news:publication_date>';
        echo '<news:title>' . \$title . '</news:title>';
        echo \$kw_tag;
        echo '</news:news>';
        echo '</url>';
    }
    wp_reset_postdata();

    echo '</urlset>';
    exit;
});

// Flush rewrite rules on activation
if (get_option('autoblog_news_sitemap_flush') !== '1') {
    flush_rewrite_rules();
    update_option('autoblog_news_sitemap_flush', '1');
}`.trim();

    try {
      const { data: snippets } = await axios.get(
        `${this.wpUrl}/wp-json/code-snippets/v1/snippets`,
        { headers: this.api.defaults.headers as Record<string, string>, timeout: 30000 },
      );
      const existing = (snippets as Array<{ id: number; name: string }>)
        .find((s) => s.name === NEWS_SITEMAP_SNIPPET_TITLE);

      if (existing) {
        await axios.put(
          `${this.wpUrl}/wp-json/code-snippets/v1/snippets/${existing.id}`,
          { code: phpCode, active: true },
          { headers: this.api.defaults.headers as Record<string, string>, timeout: 30000 },
        );
        logger.info(`News sitemap snippet updated (ID=${existing.id})`);
        return;
      }

      await axios.post(
        `${this.wpUrl}/wp-json/code-snippets/v1/snippets`,
        { name: NEWS_SITEMAP_SNIPPET_TITLE, code: phpCode, scope: 'global', active: true, priority: 10 },
        { headers: this.api.defaults.headers as Record<string, string>, timeout: 30000 },
      );
      logger.info('News sitemap snippet installed via Code Snippets plugin');
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.warn(`Failed to install news sitemap snippet: ${msg}`);
    }
  }

  /**
   * Add Video Sitemap enhancement for posts with YouTube embeds.
   * Extends wp-sitemap.xml with video:video entries for embedded YouTube content.
   * Improves video search visibility and Google Video carousel eligibility.
   */
  async ensureVideoSitemapSnippet(): Promise<void> {
    const phpCode = `
// Add video entries to WordPress native wp-sitemap.xml for posts with YouTube embeds
add_filter('wp_sitemaps_posts_entry', function(\$entry, \$post) {
    \$content = \$post->post_content;

    // Detect YouTube embeds (iframe and oembed formats)
    \$youtube_pattern = '/(?:<iframe[^>]*src=["\\']*https?:\\/\\/(?:www\\.)?youtube\\.com\\/embed\\/([a-zA-Z0-9_-]+)|https?:\\/\\/(?:www\\.)?youtube\\.com\\/watch\\?v=([a-zA-Z0-9_-]+))/i';
    if (!preg_match_all(\$youtube_pattern, \$content, \$matches)) return \$entry;

    \$video_ids = array_filter(array_merge(\$matches[1] ?? [], \$matches[2] ?? []));
    if (empty(\$video_ids)) return \$entry;

    \$videos = [];
    \$title = get_the_title(\$post->ID);
    \$excerpt = get_the_excerpt(\$post->ID) ?: wp_trim_words(wp_strip_all_tags(\$content), 30);

    foreach (array_unique(array_slice(\$video_ids, 0, 3)) as \$vid) {
        \$videos[] = [
            'video:thumbnail_loc' => 'https://img.youtube.com/vi/' . \$vid . '/maxresdefault.jpg',
            'video:title' => htmlspecialchars(\$title, ENT_XML1, 'UTF-8'),
            'video:description' => htmlspecialchars(\$excerpt, ENT_XML1, 'UTF-8'),
            'video:content_loc' => 'https://www.youtube.com/watch?v=' . \$vid,
            'video:player_loc' => 'https://www.youtube.com/embed/' . \$vid,
        ];
    }

    if (!empty(\$videos)) {
        \$entry['video:video'] = \$videos;
    }

    return \$entry;
}, 10, 2);`.trim();

    try {
      const { data: snippets } = await axios.get(
        `${this.wpUrl}/wp-json/code-snippets/v1/snippets`,
        { headers: this.api.defaults.headers as Record<string, string>, timeout: 30000 },
      );
      const existing = (snippets as Array<{ id: number; name: string }>)
        .find((s) => s.name === VIDEO_SITEMAP_SNIPPET_TITLE);

      if (existing) {
        await axios.put(
          `${this.wpUrl}/wp-json/code-snippets/v1/snippets/${existing.id}`,
          { code: phpCode, active: true },
          { headers: this.api.defaults.headers as Record<string, string>, timeout: 30000 },
        );
        logger.info(`Video sitemap snippet updated (ID=${existing.id})`);
        return;
      }

      await axios.post(
        `${this.wpUrl}/wp-json/code-snippets/v1/snippets`,
        { name: VIDEO_SITEMAP_SNIPPET_TITLE, code: phpCode, scope: 'global', active: true, priority: 10 },
        { headers: this.api.defaults.headers as Record<string, string>, timeout: 30000 },
      );
      logger.info('Video sitemap enhancement snippet installed via Code Snippets plugin');
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.warn(`Failed to install video sitemap snippet: ${msg}`);
    }
  }

  /**
   * Ensure WebSite + Organization JSON-LD schemas are output on all pages.
   * WebSite schema enables Sitelinks Searchbox in Google.
   * Organization schema enables Knowledge Panel eligibility.
   */
  async ensureSiteSchemaSnippet(siteName: string, siteOwner: string, socialLinks?: { linkedin?: string; twitter?: string; website?: string }): Promise<void> {
    const sameAsLinks = [socialLinks?.linkedin, socialLinks?.twitter, socialLinks?.website].filter(Boolean);
    const sameAsPhp = sameAsLinks.length > 0
      ? `'sameAs' => [${sameAsLinks.map(l => `'${l}'`).join(', ')}],`
      : '';

    const phpCode = `
// Output WebSite + Organization JSON-LD on all pages (site-level schemas)
add_action('wp_head', function() {
    // Only output once on the front page or singular pages
    $site_url = home_url('/');
    $site_name = '${siteName.replace(/'/g, "\\'")}';
    $site_owner = '${siteOwner.replace(/'/g, "\\'")}';

    // WebSite schema — enables Sitelinks Searchbox in Google
    $website_schema = [
        '@context' => 'https://schema.org',
        '@type' => 'WebSite',
        'name' => $site_name,
        'url' => $site_url,
        'inLanguage' => 'en',
        'potentialAction' => [
            '@type' => 'SearchAction',
            'target' => [
                '@type' => 'EntryPoint',
                'urlTemplate' => $site_url . '?s={search_term_string}',
            ],
            'query-input' => 'required name=search_term_string',
        ],
    ];

    // Organization schema — enables Knowledge Panel
    $org_schema = [
        '@context' => 'https://schema.org',
        '@type' => 'Organization',
        'name' => $site_name,
        'url' => $site_url,
        'founder' => [
            '@type' => 'Person',
            'name' => $site_owner,
        ],
        ${sameAsPhp}
    ];

    echo '<script type="application/ld+json">' . wp_json_encode($website_schema, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) . '</script>' . "\\n";
    echo '<script type="application/ld+json">' . wp_json_encode($org_schema, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) . '</script>' . "\\n";
}, 5);`.trim();

    try {
      // Check if snippet already exists
      const { data: snippets } = await axios.get(
        `${this.wpUrl}/wp-json/code-snippets/v1/snippets`,
        { headers: this.api.defaults.headers as Record<string, string>, timeout: 15000 },
      );
      const existing = (snippets as Array<{ id: number; name: string }>).find(s => s.name === SITE_SCHEMA_SNIPPET_TITLE);
      if (existing) {
        await axios.put(
          `${this.wpUrl}/wp-json/code-snippets/v1/snippets/${existing.id}`,
          { code: phpCode, active: true },
          { headers: this.api.defaults.headers as Record<string, string>, timeout: 15000 },
        );
        logger.info('Site schema snippet (WebSite + Organization) updated');
        return;
      }
      await axios.post(
        `${this.wpUrl}/wp-json/code-snippets/v1/snippets`,
        { name: SITE_SCHEMA_SNIPPET_TITLE, code: phpCode, scope: 'global', active: true, priority: 10 },
        { headers: this.api.defaults.headers as Record<string, string>, timeout: 30000 },
      );
      logger.info('Site schema snippet (WebSite + Organization) installed via Code Snippets plugin');
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.warn(`Failed to install site schema snippet: ${msg}`);
    }
  }

  /**
   * Ensure comment settings are optimized: Akismet active, moderation rules set.
   * Checks WP discussion settings and enforces anti-spam configuration.
   */
  async ensureCommentSettings(): Promise<void> {
    try {
      // Check if Akismet plugin is active
      const { data: plugins } = await this.api.get('/plugins', {
        params: { search: 'akismet', _fields: 'plugin,status' },
      }).catch(() => ({ data: [] }));

      const akismet = (plugins as Array<{ plugin: string; status: string }>)
        .find(p => p.plugin.includes('akismet'));

      if (akismet && akismet.status !== 'active') {
        try {
          await this.api.post(`/plugins`, { plugin: akismet.plugin, status: 'active' });
          logger.info('Akismet plugin activated for spam protection');
        } catch {
          logger.info('Akismet: activate manually in WordPress Admin → Plugins');
        }
      } else if (!akismet) {
        logger.info('Akismet: not installed. Install via WordPress Admin → Plugins → Add New → "Akismet"');
      } else {
        logger.debug('Akismet is active');
      }

      // Optimize discussion settings
      try {
        await this.api.post('/settings', {
          default_comment_status: 'open',
          comment_moderation: true,
          comment_previously_approved: true,
          moderation_keys: 'casino\npoker\nloan\nmortgage\ncrypto wallet\nfree money\nbuy followers\nSEO service',
        });
        logger.debug('Comment settings optimized: moderation enabled, spam keywords set');
      } catch {
        logger.debug('Could not update discussion settings via REST API');
      }
    } catch (error) {
      logger.debug(`Comment settings check failed: ${error instanceof Error ? error.message : error}`);
    }
  }

  /**
   * Batch delete spam comments (older than 7 days).
   */
  async cleanupSpamComments(): Promise<number> {
    try {
      const { data: spamComments } = await this.api.get('/comments', {
        params: { status: 'spam', per_page: 100, _fields: 'id,date' },
      });

      const comments = spamComments as Array<{ id: number; date: string }>;
      if (comments.length === 0) return 0;

      // Only delete spam older than 7 days
      const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
      const toDelete = comments.filter(c => new Date(c.date).getTime() < cutoff);

      let deleted = 0;
      for (const comment of toDelete.slice(0, 50)) {
        try {
          await this.api.delete(`/comments/${comment.id}`, { params: { force: true } });
          deleted++;
        } catch { /* skip individual failures */ }
      }

      if (deleted > 0) {
        logger.info(`Spam cleanup: deleted ${deleted} spam comment(s)`);
      }
      return deleted;
    } catch (error) {
      logger.debug(`Spam cleanup failed: ${error instanceof Error ? error.message : error}`);
      return 0;
    }
  }

  /**
   * [#19] Ensure CDN/Edge caching headers via Cloudflare APO or cache rules.
   * Sets optimal cache-control headers for static assets and HTML pages.
   */
  async ensureCacheHeaders(cloudflareToken: string, zoneId: string): Promise<void> {
    if (!cloudflareToken || !zoneId) {
      logger.debug('Cloudflare credentials not set, skipping cache header setup');
      return;
    }
    try {
      // Check if a page rule or cache rule for the zone already exists
      const { data: existingRules } = await axios.get(
        `https://api.cloudflare.com/client/v4/zones/${zoneId}/rulesets/phases/http_request_cache_settings/entrypoint`,
        { headers: { Authorization: `Bearer ${cloudflareToken}` }, timeout: 10000 },
      );
      const rules = (existingRules as { result?: { rules?: unknown[] } }).result?.rules || [];
      if (rules.length > 0) {
        logger.debug(`Cloudflare cache rules already configured (${rules.length} rules)`);
        return;
      }
      // Set browser TTL for the zone to 4 hours for HTML, 30 days for assets
      await axios.patch(
        `https://api.cloudflare.com/client/v4/zones/${zoneId}/settings/browser_cache_ttl`,
        { value: 14400 }, // 4 hours
        { headers: { Authorization: `Bearer ${cloudflareToken}` }, timeout: 10000 },
      );
      logger.info('Cloudflare: Set browser cache TTL to 4 hours');
    } catch (error) {
      logger.warn(`Cloudflare cache setup failed: ${error instanceof Error ? error.message : error}`);
    }
  }

  /**
   * [#20] Validate structured data using Google Rich Results Test API.
   * Returns validation errors/warnings for a given URL.
   */
  async validateStructuredData(url: string, googleApiKey: string): Promise<{ valid: boolean; errors: string[]; warnings: string[] }> {
    if (!googleApiKey) {
      return { valid: true, errors: [], warnings: ['No GOOGLE_API_KEY set, skipping Rich Results Test'] };
    }
    try {
      const { data } = await axios.post(
        `https://searchconsole.googleapis.com/v1/urlInspection/index:inspect`,
        { inspectionUrl: url, siteUrl: this.wpUrl },
        {
          headers: { Authorization: `Bearer ${await getGoogleAccessToken(this.indexingSaKey, 'https://www.googleapis.com/auth/webmasters.readonly')}` },
          timeout: 15000,
        },
      );
      const result = data as { inspectionResult?: { richResultsResult?: { detectedItems?: Array<{ items?: Array<{ issues?: Array<{ issueMessage: string; severity: string }> }> }> } } };
      const items = result.inspectionResult?.richResultsResult?.detectedItems || [];
      const errors: string[] = [];
      const warnings: string[] = [];
      for (const detected of items) {
        for (const item of detected.items || []) {
          for (const issue of item.issues || []) {
            if (issue.severity === 'ERROR') errors.push(issue.issueMessage);
            else warnings.push(issue.issueMessage);
          }
        }
      }
      const valid = errors.length === 0;
      if (!valid) logger.warn(`Rich Results Test: ${errors.length} error(s) for ${url}`);
      else logger.debug(`Rich Results Test: valid for ${url} (${warnings.length} warning(s))`);
      return { valid, errors, warnings };
    } catch (error) {
      logger.debug(`Rich Results Test failed for ${url}: ${error instanceof Error ? error.message : error}`);
      return { valid: true, errors: [], warnings: ['Rich Results Test API call failed'] };
    }
  }

  /**
   * [#22] Check Core Web Vitals via CrUX API.
   * Returns LCP, FID (INP), CLS scores for the origin.
   */
  async checkCoreWebVitals(googleApiKey: string): Promise<{
    lcp?: { p75: number; rating: string };
    inp?: { p75: number; rating: string };
    cls?: { p75: number; rating: string };
    overall: string;
  }> {
    if (!googleApiKey) {
      return { overall: 'unknown' };
    }
    try {
      const { data } = await axios.post(
        `https://chromeuxreport.googleapis.com/v1/records:queryRecord?key=${googleApiKey}`,
        { origin: this.wpUrl },
        { timeout: 10000 },
      );
      const metrics = (data as { record?: { metrics?: Record<string, { percentiles?: { p75: number }; histogram?: Array<{ density: number }> }> } }).record?.metrics || {};
      const getMetric = (key: string): { p75: number; rating: string } | undefined => {
        const m = metrics[key];
        if (!m?.percentiles?.p75) return undefined;
        const p75 = m.percentiles.p75;
        // Rating thresholds per Google CWV guidelines
        const thresholds: Record<string, [number, number]> = {
          largest_contentful_paint: [2500, 4000],
          interaction_to_next_paint: [200, 500],
          cumulative_layout_shift: [0.1, 0.25],
        };
        const [good, poor] = thresholds[key] || [Infinity, Infinity];
        const rating = p75 <= good ? 'good' : p75 <= poor ? 'needs-improvement' : 'poor';
        return { p75, rating };
      };

      const lcp = getMetric('largest_contentful_paint');
      const inp = getMetric('interaction_to_next_paint');
      const cls = getMetric('cumulative_layout_shift');

      const ratings = [lcp?.rating, inp?.rating, cls?.rating].filter(Boolean);
      const overall = ratings.every(r => r === 'good') ? 'good'
        : ratings.some(r => r === 'poor') ? 'poor' : 'needs-improvement';

      if (overall === 'poor') {
        logger.warn(`CWV: POOR scores detected — LCP: ${lcp?.p75}ms, INP: ${inp?.p75}ms, CLS: ${cls?.p75}`);
      } else {
        logger.info(`CWV: ${overall} — LCP: ${lcp?.p75 || 'N/A'}ms, INP: ${inp?.p75 || 'N/A'}ms, CLS: ${cls?.p75 || 'N/A'}`);
      }

      return { lcp, inp, cls, overall };
    } catch (error) {
      logger.debug(`CrUX API failed: ${error instanceof Error ? error.message : error}`);
      return { overall: 'unknown' };
    }
  }

  /**
   * Ensure WordPress comment section is optimized for UGC generation.
   * Adds comment form enhancements and featured comments capability.
   */
  async ensureCommentEngagementSnippet(): Promise<void> {
    const phpCode = `
// Enhanced comment form with topic-specific prompts
add_filter('comment_form_defaults', function(\$defaults) {
    \$post_id = get_the_ID();
    \$category = '';
    \$categories = get_the_category(\$post_id);
    if (!empty(\$categories)) {
        \$category = \$categories[0]->name;
    }

    // Category-specific comment prompts
    \$prompts = array(
        'Korean Tech' => 'Share your experience with Korean tech products or your thoughts on this analysis...',
        'Korean Finance' => 'What\\'s your investment perspective? Share your strategy or questions...',
        'K-Beauty' => 'What\\'s your skin type and which K-beauty products work for you?',
        'Korea Travel' => 'Have you visited Korea? Share your tips or ask questions about planning your trip...',
        'K-Entertainment' => 'Who\\'s your bias? Share your K-pop or K-drama opinions...',
    );

    \$placeholder = isset(\$prompts[\$category]) ? \$prompts[\$category] : 'Share your thoughts, experience, or questions about this topic...';

    \$defaults['comment_field'] = '<p class="comment-form-comment"><label for="comment">Your Comment</label><textarea id="comment" name="comment" cols="45" rows="6" placeholder="' . esc_attr(\$placeholder) . '" required></textarea></p>';
    \$defaults['title_reply'] = 'Join the Discussion';
    \$defaults['label_submit'] = 'Post Comment';

    return \$defaults;
});

// Add structured data for comments (UserInteraction signals)
add_action('wp_footer', function() {
    if (!is_single()) return;
    \$comments = get_comments(array('post_id' => get_the_ID(), 'status' => 'approve', 'number' => 5));
    if (empty(\$comments)) return;

    \$comment_data = array();
    foreach (\$comments as \$comment) {
        \$comment_data[] = array(
            '@type' => 'Comment',
            'text' => wp_strip_all_tags(\$comment->comment_content),
            'dateCreated' => \$comment->comment_date,
            'author' => array('@type' => 'Person', 'name' => \$comment->comment_author),
        );
    }

    echo '<script type="application/ld+json">' . json_encode(array(
        '@context' => 'https://schema.org',
        '@type' => 'DiscussionForumPosting',
        'headline' => get_the_title(),
        'comment' => \$comment_data,
    )) . '</script>';
});`.trim();

    try {
      const { data: snippets } = await axios.get(
        `${this.wpUrl}/wp-json/code-snippets/v1/snippets`,
        { headers: this.api.defaults.headers as Record<string, string>, timeout: 30000 },
      );
      const existing = (snippets as Array<{ id: number; name: string }>)
        .find((s) => s.name === COMMENT_ENGAGEMENT_SNIPPET_TITLE);

      if (existing) {
        await axios.put(
          `${this.wpUrl}/wp-json/code-snippets/v1/snippets/${existing.id}`,
          { code: phpCode, active: true },
          { headers: this.api.defaults.headers as Record<string, string>, timeout: 30000 },
        );
        logger.info(`Comment engagement snippet updated (ID=${existing.id})`);
        return;
      }

      await axios.post(
        `${this.wpUrl}/wp-json/code-snippets/v1/snippets`,
        { name: COMMENT_ENGAGEMENT_SNIPPET_TITLE, code: phpCode, scope: 'global', active: true, priority: 10 },
        { headers: this.api.defaults.headers as Record<string, string>, timeout: 30000 },
      );
      logger.info('Comment engagement snippet installed via Code Snippets plugin');
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.warn(`Failed to install comment engagement snippet: ${msg}`);
    }
  }

  /**
   * Ensure CWV auto-fix PHP snippet is installed.
   * Adds <link rel="preload"> for first image (LCP optimization)
   * and forces explicit width/height on all post images (CLS prevention).
   */
  async ensureCwvAutoFixSnippet(): Promise<void> {
    const phpCode = `
// CWV Auto-Fix: Preload LCP image + force dimensions on all images
add_action('wp_head', function() {
    if (!is_singular('post')) return;
    global $post;
    if (!$post) return;
    // Find first image in content for LCP preload
    if (preg_match('/<img[^>]+src=["\\'](https?:\\/\\/[^"\\'>]+)/', $post->post_content, $match)) {
        echo '<link rel="preload" as="image" href="' . esc_url($match[1]) . '" fetchpriority="high" />' . "\\n";
    }
}, 5); // Priority 5 = before other head scripts

// Force width/height attributes on all post images (CLS prevention)
add_filter('the_content', function($content) {
    return preg_replace_callback('/<img([^>]*?)\\/?>/i', function($m) {
        $attrs = $m[1];
        // Skip if already has both width and height
        if (preg_match('/\\bwidth=/', $attrs) && preg_match('/\\bheight=/', $attrs)) return $m[0];
        // Add default dimensions if missing (16:9 aspect ratio)
        if (!preg_match('/\\bwidth=/', $attrs)) $attrs .= ' width="1200"';
        if (!preg_match('/\\bheight=/', $attrs)) $attrs .= ' height="675"';
        // Add aspect-ratio CSS for layout stability
        if (strpos($attrs, 'aspect-ratio') === false) {
            $attrs = preg_replace('/style="/', 'style="aspect-ratio:16/9;', $attrs);
            if (strpos($attrs, 'style=') === false) $attrs .= ' style="aspect-ratio:16/9;"';
        }
        return '<img' . $attrs . ' />';
    }, $content);
});

// Add prefetch hints for internal links (faster navigation)
add_action('wp_footer', function() {
    if (!is_singular('post')) return;
    echo '<script>document.addEventListener("DOMContentLoaded",function(){';
    echo 'var links=document.querySelectorAll("a[href*=\\"" + location.hostname + "\\"]");';
    echo 'var observer=new IntersectionObserver(function(entries){entries.forEach(function(e){';
    echo 'if(e.isIntersecting){var l=document.createElement("link");l.rel="prefetch";l.href=e.target.href;document.head.appendChild(l);observer.unobserve(e.target)}})});';
    echo 'links.forEach(function(l){observer.observe(l)})});</script>' . "\\n";
});`.trim();

    try {
      const { data: snippets } = await axios.get(
        `${this.wpUrl}/wp-json/code-snippets/v1/snippets`,
        { headers: this.api.defaults.headers as Record<string, string>, timeout: 30000 },
      );
      const existing = (snippets as Array<{ id: number; name: string }>)
        .find((s) => s.name === CWV_AUTOFIX_SNIPPET_TITLE);

      if (existing) {
        await axios.put(
          `${this.wpUrl}/wp-json/code-snippets/v1/snippets/${existing.id}`,
          { code: phpCode, active: true },
          { headers: this.api.defaults.headers as Record<string, string>, timeout: 30000 },
        );
        logger.info(`CWV auto-fix snippet updated (ID=${existing.id})`);
        return;
      }

      await axios.post(
        `${this.wpUrl}/wp-json/code-snippets/v1/snippets`,
        { name: CWV_AUTOFIX_SNIPPET_TITLE, code: phpCode, scope: 'global', active: true, priority: 5 },
        { headers: this.api.defaults.headers as Record<string, string>, timeout: 30000 },
      );
      logger.info('CWV auto-fix snippet installed via Code Snippets plugin');
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.warn(`Failed to install CWV auto-fix snippet: ${msg}`);
    }
  }

  /**
   * Ensure critical CSS is inlined for above-the-fold content.
   * Defers non-critical CSS loading for faster FCP/LCP.
   */
  async ensureCriticalCssSnippet(): Promise<void> {
    const phpCode = `
// Inline critical above-the-fold CSS and defer the rest
add_action('wp_head', function() {
    if (!is_singular('post')) return;
    echo '<style id="ab-critical-css">';
    echo 'body{font-family:"Noto Sans KR",system-ui,sans-serif;line-height:1.8;color:#1a1a2e;margin:0}';
    echo '.entry-content{max-width:760px;margin:0 auto;padding:0 20px}';
    echo '.entry-content h1,.entry-content h2{font-weight:700;color:#1a1a2e;line-height:1.3}';
    echo '.entry-content p{margin:0 0 1.2em}';
    echo '.entry-content img{max-width:100%;height:auto;display:block}';
    echo '.ab-toc{background:#f8f9fa;border-radius:12px;padding:24px;margin:30px 0}';
    echo '.ab-byline{display:flex;align-items:center;gap:16px;padding:20px 0;border-bottom:1px solid #eee}';
    echo '.ab-breadcrumb{font-size:13px;color:#888;margin-bottom:16px}';
    echo '</style>' . "\\n";
}, 1); // Very early priority`.trim();

    try {
      const { data: snippets } = await axios.get(
        `${this.wpUrl}/wp-json/code-snippets/v1/snippets`,
        { headers: this.api.defaults.headers as Record<string, string>, timeout: 30000 },
      );
      const existing = (snippets as Array<{ id: number; name: string }>)
        .find((s) => s.name === CRITICAL_CSS_SNIPPET_TITLE);

      if (existing) {
        await axios.put(
          `${this.wpUrl}/wp-json/code-snippets/v1/snippets/${existing.id}`,
          { code: phpCode, active: true },
          { headers: this.api.defaults.headers as Record<string, string>, timeout: 30000 },
        );
        logger.info(`Critical CSS snippet updated (ID=${existing.id})`);
        return;
      }

      await axios.post(
        `${this.wpUrl}/wp-json/code-snippets/v1/snippets`,
        { name: CRITICAL_CSS_SNIPPET_TITLE, code: phpCode, scope: 'global', active: true, priority: 1 },
        { headers: this.api.defaults.headers as Record<string, string>, timeout: 30000 },
      );
      logger.info('Critical CSS snippet installed via Code Snippets plugin');
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.warn(`Failed to install critical CSS snippet: ${msg}`);
    }
  }
}
