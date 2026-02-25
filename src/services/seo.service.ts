import axios, { type AxiosInstance } from 'axios';
import { logger } from '../utils/logger.js';

const WPCODE_SLUG = 'insert-headers-and-footers';
const HREFLANG_SNIPPET_TITLE = 'Auto Blog hreflang SEO';

export class SeoService {
  private api: AxiosInstance;
  private wpUrl: string;

  constructor(wpUrl: string, username: string, appPassword: string) {
    this.wpUrl = wpUrl.replace(/\/+$/, '');
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

  /** @deprecated Use ensureHeaderScripts instead */
  async ensureVerificationMetaTags(googleCode?: string, naverCode?: string): Promise<void> {
    return this.ensureHeaderScripts({ googleCode, naverCode });
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
