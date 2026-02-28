import axios, { type AxiosInstance } from 'axios';
import { createSign } from 'crypto';
import { logger } from '../utils/logger.js';

const WPCODE_SLUG = 'insert-headers-and-footers';
const HREFLANG_SNIPPET_TITLE = 'Auto Blog hreflang SEO';
const ADSENSE_PADDING_SNIPPET_TITLE = 'Auto Blog AdSense Mobile Padding';
const INDEXNOW_SNIPPET_TITLE = 'Auto Blog IndexNow Key';

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

  async ensureHeaderScripts(options: {
    googleCode?: string;
    naverCode?: string;
    gaMeasurementId?: string;
  }): Promise<void> {
    const { googleCode, naverCode, gaMeasurementId } = options;
    if (!googleCode && !naverCode && !gaMeasurementId) return;

    const parts: string[] = [];

    // Verification meta tags
    if (googleCode) parts.push(`<meta name="google-site-verification" content="${googleCode}" />`);
    if (naverCode) parts.push(`<meta name="naver-site-verification" content="${naverCode}" />`);

    // Google Analytics 4
    if (gaMeasurementId) {
      parts.push(`<!-- Google Analytics 4 -->`);
      parts.push(`<script async src="https://www.googletagmanager.com/gtag/js?id=${gaMeasurementId}"></script>`);
      parts.push(`<script>\nwindow.dataLayer = window.dataLayer || [];\nfunction gtag(){dataLayer.push(arguments);}\ngtag('js', new Date());\ngtag('config', '${gaMeasurementId}');\n</script>`);
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
      logger.info('Header scripts (verification + GA4) configured successfully');
    } else {
      this.logManualInstructions(headerHtml);
    }
  }

  /**
   * Ensure hreflang PHP snippet is installed via Code Snippets plugin.
   * Registers post meta (hreflang_ko, hreflang_en) and outputs <link rel="alternate"> in wp_head.
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
    register_post_meta('post', 'hreflang_en', [
        'show_in_rest' => true,
        'single' => true,
        'type' => 'string',
        'sanitize_callback' => 'esc_url_raw',
    ]);
});

// Output hreflang link tags in <head>
add_action('wp_head', function() {
    if (!is_singular('post')) return;
    $post_id = get_the_ID();
    $ko_url = get_post_meta($post_id, 'hreflang_ko', true);
    $en_url = get_post_meta($post_id, 'hreflang_en', true);
    $current_url = get_permalink($post_id);
    if ($ko_url) {
        echo '<link rel="alternate" hreflang="en" href="' . esc_url($current_url) . '" />' . "\\n";
        echo '<link rel="alternate" hreflang="ko" href="' . esc_url($ko_url) . '" />' . "\\n";
        echo '<link rel="alternate" hreflang="x-default" href="' . esc_url($current_url) . '" />' . "\\n";
    }
    if ($en_url) {
        echo '<link rel="alternate" hreflang="ko" href="' . esc_url($current_url) . '" />' . "\\n";
        echo '<link rel="alternate" hreflang="en" href="' . esc_url($en_url) . '" />' . "\\n";
        echo '<link rel="alternate" hreflang="x-default" href="' . esc_url($en_url) . '" />' . "\\n";
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
      const accessToken = await this.getGoogleAccessToken();
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

  /** @deprecated Use ensureHeaderScripts instead */
  async ensureVerificationMetaTags(googleCode?: string, naverCode?: string): Promise<void> {
    return this.ensureHeaderScripts({ googleCode, naverCode });
  }

  private async getGoogleAccessToken(): Promise<string> {
    const sa = JSON.parse(this.indexingSaKey) as {
      client_email: string;
      private_key: string;
    };

    const now = Math.floor(Date.now() / 1000);
    const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(
      JSON.stringify({
        iss: sa.client_email,
        scope: 'https://www.googleapis.com/auth/indexing',
        aud: 'https://oauth2.googleapis.com/token',
        exp: now + 3600,
        iat: now,
      }),
    ).toString('base64url');

    const sign = createSign('RSA-SHA256');
    sign.update(`${header}.${payload}`);
    const signature = sign.sign(sa.private_key, 'base64url');

    const jwt = `${header}.${payload}.${signature}`;

    const { data } = await axios.post<{ access_token: string }>(
      'https://oauth2.googleapis.com/token',
      new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: jwt,
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 10000 },
    );

    return data.access_token;
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
}
