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
const HOMEPAGE_META_SNIPPET_TITLE = 'Auto Blog Homepage Meta Tags';
const POST_CANONICAL_FALLBACK_SNIPPET_TITLE = 'Auto Blog Canonical Fallback';
const COOKIE_CONSENT_SNIPPET_TITLE = 'Auto Blog Cookie Consent';
const STICKY_ADS_SNIPPET_TITLE = 'Auto Blog Sticky Sidebar & Anchor Ads';
const EXIT_INTENT_SNIPPET_TITLE = 'Auto Blog Exit-Intent Lead Magnet';
const ADS_TXT_SNIPPET_TITLE = 'Auto Blog ads.txt';

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
   * Upsert a Code Snippets plugin PHP snippet (create if not exists, skip if already installed).
   * Returns true if the snippet is now active (installed or already existed), false on error.
   */
  private async upsertCodeSnippet(name: string, code: string): Promise<boolean> {
    const headers = this.api.defaults.headers as Record<string, string>;
    const snippetsUrl = `${this.wpUrl}/wp-json/code-snippets/v1/snippets`;
    try {
      const { data: snippets } = await axios.get(snippetsUrl, { headers, timeout: 30000 });
      const existing = (snippets as Array<{ id: number; name: string }>).find((s) => s.name === name);
      if (existing) {
        logger.debug(`Code snippet already installed (ID=${existing.id}): "${name}"`);
        return true;
      }
      await axios.post(snippetsUrl, { name, code, scope: 'global', active: true, priority: 10 }, { headers, timeout: 30000 });
      logger.info(`Code snippet installed: "${name}"`);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Set WordPress site title and tagline to reflect niche focus.
   */
  async ensureSiteTitle(siteName: string, categories: string[], taglineOverride?: string): Promise<void> {
    const tagline = taglineOverride || `Your Source for ${categories.join(', ')} Insights`;
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
    clarityProjectId?: string;
  }): Promise<void> {
    const { googleCode, naverCode, gaMeasurementId, adsensePubId, clarityProjectId } = options;

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
    // DNS prefetch for common external resources + affiliate networks
    parts.push(`<link rel="dns-prefetch" href="https://www.googletagmanager.com" />`);
    parts.push(`<link rel="dns-prefetch" href="https://pagead2.googlesyndication.com" />`);
    parts.push(`<link rel="dns-prefetch" href="https://www.amazon.com" />`);
    parts.push(`<link rel="dns-prefetch" href="https://www.cj.com" />`);
    parts.push(`<link rel="dns-prefetch" href="https://www.shareasale.com" />`);
    // Referrer-Policy: send origin only on cross-origin (protects query strings, preserves affiliate attribution)
    parts.push(`<meta name="referrer" content="strict-origin-when-cross-origin" />`);
    // OG locale for social media language detection (Facebook, LinkedIn preview language)
    parts.push(`<meta property="og:locale" content="en_US" />`);

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
      parts.push(`<script>\nwindow.dataLayer = window.dataLayer || [];\nfunction gtag(){dataLayer.push(arguments);}\ngtag('js', new Date());\ngtag('config', '${gaMeasurementId}', {site_search_term: new URLSearchParams(location.search).get('s')||undefined});\n` +
        `/* Micro-conversion tracking: scroll depth, share clicks, engaged reader */\n` +
        `document.addEventListener('DOMContentLoaded',function(){` +
        `var st=0;window.addEventListener('scroll',function(){var h=document.documentElement.scrollHeight-window.innerHeight;if(h>0){var p=Math.round(window.scrollY/h*100);if(p>=25&&st<25){st=25;gtag('event','scroll_depth',{percent:25})}if(p>=50&&st<50){st=50;gtag('event','scroll_depth',{percent:50})}if(p>=75&&st<75){st=75;gtag('event','scroll_depth',{percent:75})}if(p>=90&&st<90){st=90;gtag('event','scroll_depth',{percent:90})}}});` +
        `document.querySelectorAll('.ab-share-btn').forEach(function(b){b.addEventListener('click',function(){gtag('event','share',{method:b.textContent.trim()})})});` +
        `document.querySelectorAll('a[rel*="sponsored"],a[data-affiliate="true"]').forEach(function(a){a.addEventListener('click',function(){var cg='';var ct='';var cm=document.querySelector('meta[property="article:section"]');if(cm)cg=cm.getAttribute('content')||'';var ctm=document.querySelector('meta[name="autoblog:content_type"]');if(ctm)ct=ctm.getAttribute('content')||'';gtag('event','affiliate_click',{link_url:a.href,link_text:a.textContent.trim().slice(0,50),page_path:location.pathname,content_group:cg,content_type:ct})})});` +
        `/* Lead magnet CTA click tracking */` +
        `document.querySelectorAll('.ab-lead-magnet a,.ab-cta-newsletter a,.ab-content-upgrade a,.ab-lead-magnet-enhanced a').forEach(function(a){a.addEventListener('click',function(){var cg2='';var cm2=document.querySelector('meta[property="article:section"]');if(cm2)cg2=cm2.getAttribute('content')||'';gtag('event','lead_magnet_click',{link_url:a.href,link_text:a.textContent.trim().slice(0,50),page_path:location.pathname,content_group:cg2})})});` +
        `/* Outbound link click tracking */` +
        `document.querySelectorAll('a[href^="http"]').forEach(function(a){if(!a.href.includes(location.hostname)){a.addEventListener('click',function(){gtag('event','outbound_click',{link_url:a.href,link_text:a.textContent.trim().slice(0,50),page_path:location.pathname})})}});` +
        `var t=setTimeout(function(){gtag('event','engaged_reader',{engagement_time:30})},30000);` +
        `document.addEventListener('visibilitychange',function(){if(document.hidden)clearTimeout(t)});` +
        `/* Lead magnet CTA impression tracking (IntersectionObserver) */` +
        `if('IntersectionObserver' in window){var io=new IntersectionObserver(function(entries){entries.forEach(function(e){if(e.isIntersecting){gtag('event','lead_magnet_view',{page_path:location.pathname,element:e.target.className.split(' ')[0]||'cta'});io.unobserve(e.target)}})},{threshold:0.5});document.querySelectorAll('.ab-cta-newsletter,.ab-lead-magnet,.ab-lead-magnet-enhanced,.ab-content-upgrade').forEach(function(el){io.observe(el)})}` +
        `});\n</script>`);
    }

    // Microsoft Clarity (behavioral analytics: heatmaps, session recordings)
    if (clarityProjectId) {
      parts.push(`<!-- Microsoft Clarity -->`);
      parts.push(`<script type="text/javascript">\n(function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y)})(window,document,"clarity","script","${clarityProjectId}");\n</script>`);
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

    const installed = await this.upsertCodeSnippet(HREFLANG_SNIPPET_TITLE, phpCode);
    if (!installed) {
      logger.warn('=== hreflang Snippet Manual Setup Required ===');
      logger.warn('Install the "Code Snippets" plugin, then add the following PHP snippet:');
      logger.warn(`Title: ${HREFLANG_SNIPPET_TITLE}`);
      logger.warn(phpCode);
      logger.warn('Or add it to your theme functions.php');
      logger.warn('============================================');
    }
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

    const installed = await this.upsertCodeSnippet(ADSENSE_PADDING_SNIPPET_TITLE, phpCode);
    if (!installed) {
      logger.warn('Failed to install AdSense padding snippet via Code Snippets plugin');
      logger.warn('Manually add CSS: @media (max-width:768px) { body { padding-bottom:70px !important; } }');
    }
  }

  /**
   * Ensure sticky sidebar ad + anchor ad CSS/JS snippet is installed.
   * Sticky sidebar stays visible on scroll (desktop). Anchor ad sticks to bottom (mobile).
   * Only activates when AdSense Auto Ads is enabled.
   */
  async ensureStickyAdsSnippet(): Promise<void> {
    const phpCode = `
// Sticky sidebar ad + anchor bottom ad for improved viewability and RPM
add_action('wp_head', function() {
    if (!is_singular('post')) return;
    echo '<style>
/* Sticky sidebar ad (desktop only) */
@media (min-width: 1024px) {
    .sidebar .widget_custom_html:last-child,
    .sidebar .widget_block:last-child {
        position: sticky;
        top: 80px;
        z-index: 10;
    }
}
/* Anchor ad container (mobile) */
.autoblog-anchor-ad {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    z-index: 9999;
    background: rgba(30,30,46,0.95);
    padding: 8px;
    text-align: center;
    box-shadow: 0 -2px 10px rgba(0,0,0,0.2);
    display: none;
}
@media (max-width: 768px) {
    .autoblog-anchor-ad { display: block; }
    body { padding-bottom: 90px !important; }
}
.autoblog-anchor-close {
    position: absolute;
    top: 2px;
    right: 8px;
    background: none;
    border: none;
    color: #999;
    font-size: 18px;
    cursor: pointer;
    padding: 4px;
}
</style>';
});
// Anchor ad close button script
add_action('wp_footer', function() {
    if (!is_singular('post')) return;
    echo '<div class="autoblog-anchor-ad" id="anchor-ad">
        <button class="autoblog-anchor-close" onclick="document.getElementById(\\'anchor-ad\\').style.display=\\'none\\'">&times;</button>
        <ins class="adsbygoogle" style="display:inline-block;width:320;height:50" data-ad-format="auto"></ins>
    </div>';
});`.trim();

    const installed = await this.upsertCodeSnippet(STICKY_ADS_SNIPPET_TITLE, phpCode);
    if (!installed) {
      logger.warn(`Sticky ads snippet setup failed`);
    }
  }

  /**
   * Exit-intent popup that offers a lead magnet when the user is about to leave.
   * Triggers on mouse leaving viewport (desktop) or back button intent (mobile).
   * Suppressed for 7 days via cookie after dismissal or conversion.
   */
  async ensureExitIntentSnippet(newsletterUrl?: string): Promise<void> {
    const formUrl = newsletterUrl || '';
    const phpCode = `
// Exit-intent lead magnet popup — shown once per 7 days
add_action('wp_footer', function() {
    if (!is_singular('post')) return;
    \$newsletter_url = '${formUrl}';
    if (empty(\$newsletter_url)) \$newsletter_url = home_url('/newsletter/');
    ?>
    <div id="ab-exit-popup" style="display:none;position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,0.6);align-items:center;justify-content:center;">
        <div style="background:#1e1e2e;color:#e0e0e0;border-radius:12px;padding:32px;max-width:420px;width:90%;text-align:center;position:relative;box-shadow:0 8px 32px rgba(0,0,0,0.4);">
            <button onclick="document.getElementById('ab-exit-popup').style.display='none';document.cookie='ab_exit_seen=1;max-age=604800;path=/'" style="position:absolute;top:8px;right:12px;background:none;border:none;color:#999;font-size:22px;cursor:pointer;">&times;</button>
            <p style="font-size:20px;font-weight:700;margin:0 0 8px;">Wait — before you go!</p>
            <p style="font-size:14px;color:#aaa;margin:0 0 16px;">Get exclusive Korea insights delivered to your inbox. Free weekly digest.</p>
            <a href="<?php echo esc_url(\$newsletter_url); ?>" onclick="if(typeof gtag==='function')gtag('event','exit_intent_conversion',{page_path:location.pathname});document.cookie='ab_exit_seen=1;max-age=604800;path=/'" class="ab-lead-magnet" style="display:inline-block;padding:12px 28px;background:#0066FF;color:#fff;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px;">Subscribe Free</a>
        </div>
    </div>
    <script>
    (function(){
        if(document.cookie.indexOf('ab_exit_seen=1')!==-1)return;
        var shown=false;
        document.addEventListener('mouseout',function(e){
            if(!shown&&e.clientY<5&&e.relatedTarget===null){
                shown=true;
                document.getElementById('ab-exit-popup').style.display='flex';
                if(typeof gtag==='function')gtag('event','exit_intent_shown',{page_path:location.pathname});
            }
        });
    })();
    </script>
    <?php
});`.trim();

    const installed = await this.upsertCodeSnippet(EXIT_INTENT_SNIPPET_TITLE, phpCode);
    if (!installed) {
      logger.warn(`Exit-intent snippet setup failed`);
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

    // Content type meta tag for GA4 affiliate_click attribution
    $content_type = get_post_meta($post_id, '_autoblog_content_type', true);
    if ($content_type) echo '<meta name="autoblog:content_type" content="' . esc_attr($content_type) . '" />' . "\\n";

    // Pinterest Rich Pins + article OG tags (article:author, article:section)
    $categories = get_the_category($post_id);
    if (!empty($categories)) {
        echo '<meta property="article:section" content="' . esc_attr($categories[0]->name) . '" />' . "\\n";
    }
    $author_name = get_the_author_meta('display_name', get_post_field('post_author', $post_id));
    if ($author_name) {
        echo '<meta property="article:author" content="' . esc_attr($author_name) . '" />' . "\\n";
    }
    // OG image metadata (type, width, height) for proper social share rendering
    $thumb_id = get_post_thumbnail_id($post_id);
    if ($thumb_id) {
        $img_data = wp_get_attachment_image_src($thumb_id, 'full');
        if ($img_data) {
            $src = $img_data[0]; $w = $img_data[1]; $h = $img_data[2];
            $ext = strtolower(pathinfo(parse_url($src, PHP_URL_PATH), PATHINFO_EXTENSION));
            $type_map = ['jpg'=>'image/jpeg','jpeg'=>'image/jpeg','png'=>'image/png','webp'=>'image/webp','avif'=>'image/avif','gif'=>'image/gif'];
            $mime = isset($type_map[$ext]) ? $type_map[$ext] : 'image/jpeg';
            echo '<meta property="og:image:type" content="' . esc_attr($mime) . '" />' . "\\n";
            echo '<meta property="og:image:width" content="' . esc_attr($w) . '" />' . "\\n";
            echo '<meta property="og:image:height" content="' . esc_attr($h) . '" />' . "\\n";
        }
    }

    // Pinterest pin description from excerpt
    $excerpt = get_the_excerpt($post_id);
    if ($excerpt) {
        echo '<meta name="pinterest:description" content="' . esc_attr(wp_trim_words($excerpt, 50)) . '" />' . "\\n";
    }
});

// Register autoblog meta fields for REST API write access
add_action('init', function() {
    $fields = ['_autoblog_jsonld', '_autoblog_published_time', '_autoblog_modified_time', '_autoblog_content_type'];
    foreach ($fields as $field) {
        register_post_meta('post', $field, [
            'show_in_rest' => true,
            'single' => true,
            'type' => 'string',
            'auth_callback' => function() { return current_user_can('edit_posts'); },
        ]);
    }
});`.trim();

    const installed = await this.upsertCodeSnippet(JSONLD_SNIPPET_TITLE, phpCode);
    if (!installed) {
      logger.warn(`Failed to install JSON-LD snippet`);
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

    const installed = await this.upsertCodeSnippet(INDEXNOW_SNIPPET_TITLE, phpCode);
    if (!installed) {
      logger.warn(`Failed to install IndexNow key snippet`);
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
   * Submit sitemaps to Google Search Console via the Webmasters API.
   * Uses PUT to register sitemap_index.xml and news-sitemap.xml.
   * Gracefully handles 403 (service account lacks GSC owner permission).
   */
  async submitSitemapToGSC(gscSiteUrl?: string): Promise<void> {
    if (!gscSiteUrl || !this.indexingSaKey) {
      logger.debug('GSC sitemap submission skipped: GSC_SITE_URL or SA key not configured');
      return;
    }

    const sitemaps = [
      `${this.wpUrl}/sitemap_index.xml`,
      `${this.wpUrl}/news-sitemap.xml`,
    ];

    let accessToken: string;
    try {
      accessToken = await getGoogleAccessToken(this.indexingSaKey, 'https://www.googleapis.com/auth/webmasters');
    } catch (error) {
      logger.warn(`GSC sitemap auth failed: ${error instanceof Error ? error.message : error}`);
      return;
    }

    const encodedSite = encodeURIComponent(gscSiteUrl);

    for (const sitemapUrl of sitemaps) {
      try {
        await axios.put(
          `https://www.googleapis.com/webmasters/v3/sites/${encodedSite}/sitemaps/${encodeURIComponent(sitemapUrl)}`,
          undefined,
          {
            headers: { Authorization: `Bearer ${accessToken}` },
            timeout: 15000,
          },
        );
        logger.info(`GSC sitemap submitted: ${sitemapUrl}`);
      } catch (error) {
        const status = axios.isAxiosError(error) ? error.response?.status : undefined;
        if (status === 403) {
          logger.warn(`GSC sitemap 403: service account lacks owner permission for ${gscSiteUrl}`);
        } else {
          logger.warn(`GSC sitemap submission failed for ${sitemapUrl}: ${error instanceof Error ? error.message : error}`);
        }
      }
    }
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
        'rank_math_canonical_url',
        'rank_math_primary_category',
        'rank_math_advanced_robots',
        'rank_math_facebook_title',
        'rank_math_facebook_description',
        'rank_math_twitter_title',
        'rank_math_twitter_description',
        'rank_math_schema_Article',
        'rank_math_pillar_content',
        'rank_math_news_sitemap_robots',
        'rank_math_news_sitemap_stock_tickers',
        'rank_math_news_sitemap_genres',
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

    const installed = await this.upsertCodeSnippet(RANKMATH_REST_SNIPPET_TITLE, phpCode);
    if (!installed) {
      logger.warn(`Failed to install Rank Math REST snippet`);
      logger.warn('Manually add via Code Snippets plugin with title: ' + RANKMATH_REST_SNIPPET_TITLE);
    }
  }

  /**
   * Ensure canonical URL fallback when Rank Math is not active.
   * Outputs <link rel="canonical"> in wp_head only if Rank Math's canonical is absent.
   */
  async ensurePostCanonicalFallbackSnippet(): Promise<void> {
    const phpCode = `
// Canonical URL fallback when Rank Math is not active
add_action('wp_head', function() {
    if (class_exists('RankMath')) return; // Rank Math handles canonical
    if (!is_singular()) return;
    $canonical = get_permalink();
    $custom = get_post_meta(get_the_ID(), 'rank_math_canonical_url', true);
    if ($custom) $canonical = $custom;
    echo '<link rel="canonical" href="' . esc_url($canonical) . '" />' . "\\n";
}, 1);`.trim();

    const installed = await this.upsertCodeSnippet(POST_CANONICAL_FALLBACK_SNIPPET_TITLE, phpCode);
    if (!installed) {
      logger.warn(`Failed to install canonical fallback snippet`);
    }
  }

  /**
   * Ensure GDPR-compliant cookie consent banner via Code Snippets.
   * Displays a bottom banner with localStorage persistence (30 days).
   * Integrates with Google Consent Mode v2 for GA4/AdSense.
   */

  /**
   * Ensure ads.txt is served at the site root for Google AdSense verification.
   * Uses WordPress init hook to intercept /ads.txt requests and output the correct content.
   * This avoids needing file-level access to the web server root.
   */
  async ensureAdsTxtSnippet(adsensePubId: string): Promise<void> {
    if (!adsensePubId) {
      logger.debug('ads.txt snippet skipped: no AdSense publisher ID');
      return;
    }
    // Ensure pub ID format: "ca-pub-XXXX" → extract the numeric part for ads.txt
    const pubId = adsensePubId.startsWith('ca-pub-') ? adsensePubId : `ca-pub-${adsensePubId}`;

    const phpCode = `
// Serve ads.txt at site root for Google AdSense verification
add_action('init', function() {
    if (isset(\$_SERVER['REQUEST_URI']) && \$_SERVER['REQUEST_URI'] === '/ads.txt') {
        header('Content-Type: text/plain; charset=UTF-8');
        header('Cache-Control: public, max-age=86400');
        echo 'google.com, ${pubId.replace('ca-pub-', 'pub-')}, DIRECT, f08c47fec0942fa0' . "\\n";
        exit;
    }
});`.trim();

    const installed = await this.upsertCodeSnippet(ADS_TXT_SNIPPET_TITLE, phpCode);
    if (!installed) {
      logger.warn(`Failed to install ads.txt snippet`);
    }
  }

  async ensureCookieConsentSnippet(): Promise<void> {
    const phpCode = `
// GDPR Cookie Consent Banner with Google Consent Mode v2
add_action('wp_footer', function() {
?>
<div id="ab-cookie-consent" style="display:none;position:fixed;bottom:0;left:0;right:0;background:#1a1a2e;color:#fff;padding:14px 20px;z-index:99999;font-size:14px;box-shadow:0 -2px 10px rgba(0,0,0,0.2);font-family:system-ui,sans-serif;">
  <div style="max-width:1200px;margin:0 auto;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;">
    <p style="margin:0;flex:1;min-width:200px;line-height:1.5;">We use cookies to improve your experience and analyze site traffic. By clicking "Accept", you consent to our use of cookies. <a href="/privacy-policy/" style="color:#4fc3f7;text-decoration:underline;">Privacy Policy</a></p>
    <div style="display:flex;gap:8px;flex-shrink:0;">
      <button onclick="abCookieAccept()" style="background:#4fc3f7;color:#1a1a2e;border:none;padding:8px 20px;border-radius:6px;cursor:pointer;font-weight:600;font-size:14px;">Accept</button>
      <button onclick="abCookieDeny()" style="background:transparent;color:#aaa;border:1px solid #555;padding:8px 16px;border-radius:6px;cursor:pointer;font-size:14px;">Decline</button>
    </div>
  </div>
</div>
<script>
(function(){
  // Google Consent Mode v2 default (denied until consent)
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('consent', 'default', {
    'analytics_storage': 'denied',
    'ad_storage': 'denied',
    'ad_user_data': 'denied',
    'ad_personalization': 'denied',
    'wait_for_update': 500
  });

  var consent = localStorage.getItem('ab_cookie_consent');
  var consentTime = parseInt(localStorage.getItem('ab_cookie_consent_time') || '0', 10);
  var thirtyDays = 30 * 24 * 60 * 60 * 1000;

  if (consent === 'accepted' && (Date.now() - consentTime) < thirtyDays) {
    gtag('consent', 'update', {
      'analytics_storage': 'granted',
      'ad_storage': 'granted',
      'ad_user_data': 'granted',
      'ad_personalization': 'granted'
    });
  } else if (!consent || (Date.now() - consentTime) >= thirtyDays) {
    document.getElementById('ab-cookie-consent').style.display = 'block';
  }

  window.abCookieAccept = function() {
    localStorage.setItem('ab_cookie_consent', 'accepted');
    localStorage.setItem('ab_cookie_consent_time', String(Date.now()));
    gtag('consent', 'update', {
      'analytics_storage': 'granted',
      'ad_storage': 'granted',
      'ad_user_data': 'granted',
      'ad_personalization': 'granted'
    });
    document.getElementById('ab-cookie-consent').style.display = 'none';
  };

  window.abCookieDeny = function() {
    localStorage.setItem('ab_cookie_consent', 'denied');
    localStorage.setItem('ab_cookie_consent_time', String(Date.now()));
    document.getElementById('ab-cookie-consent').style.display = 'none';
  };
})();
</script>
<?php
});`.trim();

    const installed = await this.upsertCodeSnippet(COOKIE_CONSENT_SNIPPET_TITLE, phpCode);
    if (!installed) {
      logger.warn(`Failed to install cookie consent snippet`);
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

    // Always rebuild menu to reflect current niche configuration
    if ($menu_exists) {
        $existing_items = wp_get_nav_menu_items($menu_exists->term_id);
        if (!empty($existing_items)) {
            foreach ($existing_items as $item) {
                wp_delete_post($item->ID, true);
            }
        }
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

    // FAQ page
    $faq = get_page_by_path('faq');
    if ($faq) {
        wp_update_nav_menu_item($menu_id, 0, [
            'menu-item-title' => 'FAQ',
            'menu-item-object-id' => $faq->ID,
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
   * Outputs dark mode overrides for .entry-content via wp_head.
   */
  async ensureDarkModeSnippet(): Promise<void> {
    const phpCode = `
// Always-on dark theme for entire blog
add_action('wp_head', function() {
    echo '<style>
/* === Global Dark Theme (always on) === */
/* Override GeneratePress CSS variables */
:root{--contrast:#d4d4d4!important;--contrast-2:#9e9e9e!important;--contrast-3:#4e4e5e!important;--base:#1e1e2e!important;--base-2:#1e1e2e!important;--base-3:#1e1e2e!important;--accent:#7cacf8!important}
html,body{background:#1e1e2e!important;color:#d4d4d4!important}
a{color:#7cacf8!important}
a:hover{color:#9cc0ff!important}

/* Header / Navigation */
header,.site-header,.main-navigation,.nav-menu,#masthead{background:#1e1e2e!important;color:#d4d4d4!important;border-color:#3b3b4b!important}
.site-title a,.site-title{color:#f0f0f0!important}
.site-description{color:#9e9e9e!important}
nav a,nav li a,.menu-item a{color:#d4d4d4!important}
nav a:hover,.menu-item a:hover{color:#7cacf8!important}

/* Sidebar / Widgets */
.widget,.sidebar,.widget-area,aside{background:#1e1e2e!important;color:#d4d4d4!important;border-color:#3b3b4b!important}
.widget-title,.widgettitle{color:#f0f0f0!important;border-color:#3b3b4b!important}
.widget a{color:#7cacf8!important}
.widget li{border-color:#3b3b4b!important}

/* Footer */
footer,.site-footer,#colophon{background:#1e1e2e!important;color:#9e9e9e!important;border-color:#3b3b4b!important}
footer a,.site-footer a{color:#7cacf8!important}

/* Main Content Area */
main,.site-main,.content-area,#primary,#content,.site-content{background:#1e1e2e!important}
article,.hentry,.post,.page{background:#1e1e2e!important;color:#d4d4d4!important;border-color:#3b3b4b!important}
.entry-title,.entry-title a,.page-title{color:#f0f0f0!important}
.entry-meta,.entry-footer,.post-meta,.byline,.posted-on{color:#9e9e9e!important}
.entry-meta a,.entry-footer a{color:#7cacf8!important}
.cat-links a,.tag-links a,.tags-links a{color:#7cacf8!important}

/* Post Content */
.entry-content{background:#1e1e2e!important;color:#d4d4d4!important}
.entry-content p,.entry-content li,.entry-content td,.entry-content span{color:#d4d4d4!important}
.entry-content a{color:#7cacf8!important}
.entry-content h1,.entry-content h2,.entry-content h3,.entry-content h4{color:#f0f0f0!important}
.entry-content strong,.entry-content b{color:#f0f0f0!important}
.entry-content blockquote{background:#1e1e2e!important;color:#9e9e9e!important;border-left-color:#3b3b4b!important}
.entry-content code,.entry-content pre{background:#1e1e2e!important;color:#d4d4d4!important;border-color:#3b3b4b!important}
.entry-content hr{border-color:#3b3b4b!important}

/* Inline styled divs (banners, callouts, cards) — catch all light backgrounds */
.entry-content div[style*="background:#f0f4ff"],.entry-content div[style*="background:#f8f9fa"],.entry-content details[style*="background:#f0f4ff"],.entry-content details[style*="background:#f8f9fa"]{background:#1e1e2e!important;border-color:#3b3b4b!important;color:#d4d4d4!important}
.entry-content div[style*="background:#f0f8ff"]{background:#252540!important;border-color:#3b4a6e!important;color:#d4d4d4!important}
.entry-content div[style*="background:#e8f4fd"]{background:#252540!important;border-color:#3b4a6e!important;color:#d4d4d4!important}
.entry-content div[style*="background:#e8f0fe"]{background:#252540!important;border-color:#3b4a6e!important;color:#d4d4d4!important}
.entry-content div[style*="background:#fffbeb"]{background:#3a3220!important;border-color:#665500!important;color:#d4d4d4!important}
.entry-content div[style*="background:#f0fff4"]{background:#1e3a1e!important;border-color:#2e5e2e!important;color:#d4d4d4!important}
.entry-content div[style*="background:#fff5f5"]{background:#3a1e1e!important;border-color:#5e2e2e!important;color:#d4d4d4!important}
.entry-content div[style*="background:#fff;"]{background:#1e1e2e!important;border-color:#3b3b4b!important;color:#d4d4d4!important}
.entry-content div[style*="background:#ffffff"]{background:#1e1e2e!important;border-color:#3b3b4b!important;color:#d4d4d4!important}
.entry-content div[style*="background: #fff"]{background:#1e1e2e!important;border-color:#3b3b4b!important;color:#d4d4d4!important}
.entry-content div[style*="background:#f8f9fa"]{background:#1e1e2e!important;border-color:#3b3b4b!important}
.entry-content div[style*="background:linear-gradient(135deg,#f0f4ff"]{background:linear-gradient(135deg,#1e1e2e,#252540)!important}
.entry-content div[style*="background:linear-gradient(135deg,#f8f9fa"]{background:linear-gradient(135deg,#1e1e2e,#252540)!important}
.entry-content div[style*="background:linear-gradient"]{background:linear-gradient(135deg,#1e1e2e,#252540)!important}
.entry-content span[style*="background:#0066FF"]{background:#5b8def!important}

/* Override all inline light text colors */
.entry-content [style*="color:#333"]{color:#d4d4d4!important}
.entry-content [style*="color:#444"]{color:#d4d4d4!important}
.entry-content [style*="color:#555"]{color:#9e9e9e!important}
.entry-content [style*="color:#666"]{color:#9e9e9e!important}
.entry-content [style*="color:#777"]{color:#9e9e9e!important}
.entry-content [style*="color:#888"]{color:#9e9e9e!important}
.entry-content [style*="color:#999"]{color:#787878!important}
.entry-content [style*="color:#aaa"]{color:#787878!important}
.entry-content [style*="color:#222"]{color:#d4d4d4!important}
.entry-content [style*="color: #333"]{color:#d4d4d4!important}
.entry-content [style*="color: #555"]{color:#9e9e9e!important}
.entry-content [style*="color: #666"]{color:#9e9e9e!important}

/* CTA buttons and badges — keep visible on dark */
.entry-content div[style*="background:#0066FF"]{background:#5b8def!important}
.entry-content a[style*="background:#0066FF"]{background:#5b8def!important}
.entry-content a[style*="background:#fff"]{background:#1e1e2e!important;color:#7cacf8!important;border-color:#3b3b4b!important}
.entry-content input[style*="background:#fff"]{background:#1e1e2e!important;color:#d4d4d4!important;border-color:#3b3b4b!important}
.entry-content button[style*="background:#fff"]{background:#1e1e2e!important;color:#7cacf8!important;border-color:#3b3b4b!important}
.entry-content button[style*="border:2px solid"]{background:#1e1e2e!important;color:#d4d4d4!important}
.entry-content button[style*="background:transparent"]{background:transparent!important;color:#9e9e9e!important;border-color:#4e4e5e!important}

/* Newsletter/email forms */
.entry-content input[type="email"],.entry-content input[type="text"],.entry-content input[type="number"],.entry-content input[type="range"],.entry-content textarea,.entry-content select{background:#1e1e2e!important;color:#d4d4d4!important;border-color:#3b3b4b!important}
.entry-content input::placeholder,.entry-content textarea::placeholder{color:#4e4e5e!important}
.entry-content label{color:#9e9e9e!important}

/* Cite this article / collapsible details */
.entry-content details{border-color:#3b3b4b!important}
.entry-content details summary{background:#1e1e2e!important;color:#d4d4d4!important}
.entry-content details > div{background:#1e1e2e!important}

/* Poll buttons */
.entry-content button[style*="border:2px solid"][style*="background:#fff"]{background:#1e1e2e!important;color:#d4d4d4!important}

/* Badge "Related" in cross-niche */
.entry-content span[style*="background:#e8f5e9"]{background:#1e3a1e!important;color:#68d391!important}

/* Strong color override for result values */
.entry-content strong[style*="color:#0066FF"]{color:#7cacf8!important}
.entry-content strong[style*="color:#22543d"]{color:#68d391!important}

/* GeneratePress specific containers — eliminate card separation */
.separate-containers .inside-article,.inside-article{background:#1e1e2e!important;border:none!important;box-shadow:none!important}
.separate-containers .comments-area,.separate-containers .page-header,.separate-containers .paging-navigation{background:#1e1e2e!important;border:none!important;box-shadow:none!important}
.site-content,.content-area,.grid-container,#primary,#secondary{background:#1e1e2e!important}
.entry-header,.post-image,.featured-image,.page-hero{background:#1e1e2e!important}
.inside-page-header{background:#1e1e2e!important;color:#d4d4d4!important}
.inside-navigation{background:#1e1e2e!important}
.top-bar{background:#1e1e2e!important;color:#d4d4d4!important}
.site-info{background:#1e1e2e!important;color:#9e9e9e!important;border-color:#3b3b4b!important}
/* Remove GeneratePress card-style margins/padding that create visual gaps */
.separate-containers .site-main>*,.separate-containers .inside-article{margin-bottom:0!important}
.separate-containers .site-main{margin:0!important}
.generate-columns-container{background:#1e1e2e!important}

/* Post listing / archive pages */
.entry-summary,.entry-summary p{color:#d4d4d4!important}
.post-image img,.entry-content img{border-radius:8px}

/* Cookie consent / AI disclosure banners */
.entry-content div[style*="background:#1a1a2e"]{background:#1e1e2e!important}

/* Tables — comprehensive */
.entry-content table{border-color:#3b3b4b!important;border-collapse:collapse}
.entry-content th{background:#1e1e2e!important;color:#f0f0f0!important;border-color:#3b3b4b!important}
.entry-content td{border-color:#3b3b4b!important;color:#d4d4d4!important}
.entry-content tr{border-color:#3b3b4b!important}
.entry-content tr:nth-child(even){background:#1e1e2e!important}
.entry-content tr:nth-child(odd){background:#1e1e2e!important}
.entry-content table tr[style*="background:#fff"]{background:#1e1e2e!important}
.entry-content table tr[style*="background:#f8f9fa"]{background:#1e1e2e!important}
.entry-content table td[style*="background:#f8f9fa"]{background:#1e1e2e!important}
.entry-content table td[style*="color:#"]{color:#d4d4d4!important}
.entry-content table th[style*="background:#"]{background:#1e1e2e!important;color:#f0f0f0!important}

/* SVGs and charts */
.entry-content svg rect[fill="#f0f4ff"],.entry-content svg rect[fill="#fff"],.entry-content svg rect[fill="#ffffff"],.entry-content svg rect[fill="#f8f9fa"]{fill:#1e1e2e}
.entry-content svg text[fill="#333"],.entry-content svg text[fill="#666"],.entry-content svg text[fill="#999"],.entry-content svg text[fill="#444"]{fill:#9e9e9e}
.entry-content svg text[fill="#0052CC"]{fill:#7cacf8}
.entry-content svg line[stroke="#e0e0e0"],.entry-content svg line[stroke="#ddd"],.entry-content svg line[stroke="#e5e7eb"]{stroke:#3b3b4b}
.entry-content svg path[stroke="#e0e0e0"]{stroke:#3b3b4b}

/* Images */
.entry-content img{border-radius:8px;box-shadow:0 2px 12px rgba(0,0,0,0.4)!important}

/* Custom components */
.ab-ai-disclosure{background:#1e1e2e!important;border-color:#3b3b4b!important;color:#9e9e9e!important}
.ab-comment-prompt{background:#1e1e2e!important;border-color:#5b8def!important}
.ab-comment-prompt p{color:#d4d4d4!important}
.ab-series-nav{background:#1e1e2e!important;border-color:#3b3b4b!important;color:#d4d4d4!important}
.ab-affiliate-disclosure{background:#3a3220!important;border-color:#665500!important;color:#d4d4d4!important}

/* Comments */
.comments-area,.comment-list,.comment-body{background:#1e1e2e!important;color:#d4d4d4!important;border-color:#3b3b4b!important}
.comment-author,.comment-metadata{color:#9e9e9e!important}
.comment-content{color:#d4d4d4!important}
.comment-respond,.comment-form{background:#1e1e2e!important}
.comment-form input,.comment-form textarea,input[type="text"],input[type="email"],input[type="url"],textarea{background:#1e1e2e!important;color:#d4d4d4!important;border-color:#3b3b4b!important}
.comment-form input:focus,.comment-form textarea:focus,input:focus,textarea:focus{border-color:#7cacf8!important}
input[type="submit"],.comment-form .submit{background:#5b8def!important;color:#fff!important;border:none!important}

/* Search */
.search-form input[type="search"],.search-field{background:#1e1e2e!important;color:#d4d4d4!important;border-color:#3b3b4b!important}

/* Pagination */
.pagination,.nav-links,.page-numbers{color:#d4d4d4!important}
.page-numbers.current{background:#5b8def!important;color:#fff!important}
.page-numbers:hover{background:#3b3b4b!important}

/* Breadcrumbs */
.rank-math-breadcrumb,.breadcrumbs,.breadcrumb{color:#9e9e9e!important}
.rank-math-breadcrumb a,.breadcrumb a{color:#7cacf8!important}

/* Scrollbar */
::-webkit-scrollbar{width:8px;background:#1e1e2e}
::-webkit-scrollbar-thumb{background:#3b3b4b;border-radius:4px}
::-webkit-scrollbar-thumb:hover{background:#4e4e5e}
</style>';
});`.trim();

    const installed = await this.upsertCodeSnippet(DARKMODE_SNIPPET_TITLE, phpCode);
    if (!installed) {
      logger.warn(`Failed to install dark mode snippet`);
    }
  }


  /**
   * Ensure thin archive pages (tag, author, date) have noindex meta tag.
   * Prevents crawl budget waste on low-value pages while preserving link equity (follow).
   */
  async ensureNoindexThinPagesSnippet(): Promise<void> {
    const phpCode = `
// Noindex thin archive pages via Rank Math filter (prevents duplicate robots meta tag)
// Uses rank_math/frontend/robots hook to avoid conflicting with Rank Math's own robots output
add_filter('rank_math/frontend/robots', function(\$robots) {
    // Noindex tag, author, date archives (thin content, wastes crawl budget)
    if (is_tag() || is_author() || is_date()) {
        \$robots['index'] = 'noindex';
        \$robots['follow'] = 'follow';
        return \$robots;
    }
    // Noindex category pages with fewer than 3 posts (thin content)
    if (is_category()) {
        \$cat = get_queried_object();
        if (\$cat && \$cat->count < 3) {
            \$robots['index'] = 'noindex';
            \$robots['follow'] = 'follow';
        }
    }
    // Noindex paginated archive pages (page 2+) — low value for search
    if ((is_category() || is_tag() || is_home()) && get_query_var('paged') > 1) {
        \$robots['index'] = 'noindex';
        \$robots['follow'] = 'follow';
    }
    return \$robots;
});

// Pagination rel next/prev for archive pages (saves crawl budget on paginated categories)
add_action('wp_head', function() {
    if ((is_category() || is_tag() || is_home()) && get_query_var('paged') > 0) {
        global \$wp_query;
        \$paged = get_query_var('paged');
        if (\$paged > 1) {
            \$prev = get_pagenum_link(\$paged - 1);
            echo '<link rel="prev" href="' . esc_url(\$prev) . '" />' . "\\n";
        }
        if (\$paged < \$wp_query->max_num_pages) {
            \$next = get_pagenum_link(\$paged + 1);
            echo '<link rel="next" href="' . esc_url(\$next) . '" />' . "\\n";
        }
    }
    // NOTE: unavailable_after REMOVED — was expiring posts after 60 days causing mass de-indexing
    // Stale content management is now handled by content-refresh.service.ts pruning logic only
});`.trim();

    const installed = await this.upsertCodeSnippet(NOINDEX_THIN_SNIPPET_TITLE, phpCode);
    if (!installed) {
      logger.warn(`Failed to install noindex thin pages snippet`);
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

    const installed = await this.upsertCodeSnippet(RSS_OPTIMIZATION_SNIPPET_TITLE, phpCode);
    if (!installed) {
      logger.warn(`Failed to install RSS optimization snippet`);
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

    const installed = await this.upsertCodeSnippet(IMAGE_SITEMAP_SNIPPET_TITLE, phpCode);
    if (!installed) {
      logger.warn(`Failed to install image sitemap snippet`);
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

    const installed = await this.upsertCodeSnippet(SITEMAP_PRIORITY_SNIPPET_TITLE, phpCode);
    if (!installed) {
      logger.warn(`Failed to install sitemap priority snippet`);
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
.entry-content{max-width:760px;margin:0 auto;padding:0 20px;font-family:"Noto Sans KR",sans-serif;color:#333;line-height:1.7;font-size:16px}
.entry-content p{margin:0 0 20px 0;line-height:1.8;color:#333;font-size:16px}
.entry-content h2{border-left:5px solid #0066FF;padding-left:15px;font-size:22px;color:#222;margin:40px 0 20px 0}
.entry-content h3{font-size:18px;color:#444;margin:30px 0 15px 0;padding-bottom:8px;border-bottom:1px solid #eee}
.entry-content a{color:#0066FF;text-decoration:underline}
.entry-content a[target="_blank"]{color:#0066FF;text-decoration:underline}
.entry-content blockquote{border-left:4px solid #0066FF;margin:24px 0;padding:16px 24px;background:#f8f9fa;font-style:italic;color:#555;line-height:1.7}
.entry-content hr{border:none;height:1px;background:linear-gradient(to right,#ddd,#eee,#ddd);margin:36px 0}
.entry-content figure{margin:30px 0;text-align:center}
.entry-content figure img{max-width:100%;width:100%;height:auto;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,0.1);aspect-ratio:16/9;object-fit:cover}
.entry-content figcaption{margin-top:10px;font-size:13px;color:#888;line-height:1.5}
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
.entry-content{background:#1a1a2e!important;color:#e0e0e0!important}
.entry-content p,.entry-content li,.entry-content td{color:#e0e0e0!important}
.entry-content a{color:#4da6ff!important}
.entry-content h2,.entry-content h3{color:#f0f0f0!important}
.entry-content blockquote{background:#2a2a3e!important;color:#c0c0c0!important}
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
.entry-content table{border-color:#3a3a5e!important}
.entry-content th{background:#2a2a3e!important;color:#e0e0e0!important}
.entry-content td{border-color:#3a3a5e!important}
.entry-content tr:nth-child(even){background:#222238!important}
.entry-content strong{color:#f0f0f0!important}
div[style*="background:#fff"]{background:#2a2a3e!important;border-color:#3a3a5e!important}
div[style*="background:#f8f9fa"]{background:#2a2a3e!important;border-color:#3a3a5e!important}
.entry-content svg rect[fill="#f0f4ff"]{fill:#2a2a3e}
.entry-content svg text[fill="#666"],.entry-content svg text[fill="#999"]{fill:#b0b0b0}
.entry-content svg text[fill="#0052CC"]{fill:#6db8ff}
.entry-content img{box-shadow:0 2px 8px rgba(0,0,0,0.3)!important}
}
.ab-progress{position:fixed;top:0;left:0;width:0;height:3px;background:linear-gradient(90deg,#0052CC,#0066FF);z-index:99999;transition:width 0.1s linear}
</style>';
echo '<script>
(function(){if(!document.querySelector(".entry-content"))return;var b=document.createElement("div");b.className="ab-progress";document.body.appendChild(b);window.addEventListener("scroll",function(){var h=document.documentElement.scrollHeight-window.innerHeight;b.style.width=h>0?Math.min(100,(window.scrollY/h)*100)+"%":"0%"})})();
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

    const installed = await this.upsertCodeSnippet(POST_CSS_SNIPPET_TITLE, phpCode);
    if (!installed) {
      logger.warn(`Failed to install post CSS snippet (will use inline fallback)`);
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
// Google News Sitemap — serves /news-sitemap.xml
// Uses REQUEST_URI check instead of rewrite rules (no flush needed)
add_action('template_redirect', function() {
    // Match /news-sitemap.xml or /?autoblog_news_sitemap=1
    \$uri = trim(parse_url(\$_SERVER['REQUEST_URI'], PHP_URL_PATH), '/');
    if (\$uri !== 'news-sitemap.xml' && empty(\$_GET['autoblog_news_sitemap'])) return;

    status_header(200);
    header('Content-Type: application/xml; charset=UTF-8');
    header('X-Robots-Tag: noindex');
    header('Cache-Control: public, max-age=3600');

    echo '<?xml version="1.0" encoding="UTF-8"?>';
    echo '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">';

    // Google News: include posts from last 48 hours (all types, not just news-explainer)
    \$args = [
        'post_type' => 'post',
        'post_status' => 'publish',
        'posts_per_page' => 100,
        'date_query' => [['after' => '48 hours ago']],
        'orderby' => 'date',
        'order' => 'DESC',
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
        echo '<loc>' . esc_url(get_permalink()) . '</loc>';
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
}, 1); // Priority 1: run before theme template loading`.trim();

    const installed = await this.upsertCodeSnippet(NEWS_SITEMAP_SNIPPET_TITLE, phpCode);
    if (!installed) {
      logger.warn(`Failed to install news sitemap snippet`);
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

    const installed = await this.upsertCodeSnippet(VIDEO_SITEMAP_SNIPPET_TITLE, phpCode);
    if (!installed) {
      logger.warn(`Failed to install video sitemap snippet`);
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
    $logo_url = get_site_icon_url(512) ?: '';
    $org_schema = [
        '@context' => 'https://schema.org',
        '@type' => 'Organization',
        'name' => $site_name,
        'url' => $site_url,
        'description' => get_bloginfo('description'),
        'founder' => [
            '@type' => 'Person',
            'name' => $site_owner,
        ],
        ${sameAsPhp}
    ];
    if ($logo_url) {
        $org_schema['logo'] = [
            '@type' => 'ImageObject',
            'url' => $logo_url,
            'width' => 512,
            'height' => 512,
        ];
    }

    echo '<script type="application/ld+json">' . wp_json_encode($website_schema, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) . '</script>' . "\\n";
    echo '<script type="application/ld+json">' . wp_json_encode($org_schema, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) . '</script>' . "\\n";
}, 5);`.trim();

    const installed = await this.upsertCodeSnippet(SITE_SCHEMA_SNIPPET_TITLE, phpCode);
    if (!installed) {
      logger.warn(`Failed to install site schema snippet`);
    }
  }

  /**
   * Install a Code Snippet that adds OG tags, canonical, and meta robots to the homepage.
   * Rank Math may handle individual posts but can miss the homepage/front page.
   */
  async ensureHomepageMetaSnippet(siteName: string, siteDescription: string): Promise<void> {
    const phpCode = `
// Add OG tags, canonical, and meta robots to the homepage
add_action('wp_head', function() {
    if (!is_front_page() && !is_home()) return;
    $url = home_url('/');
    $title = get_bloginfo('name') . ' - ' . get_bloginfo('description');
    $desc = '${siteDescription.replace(/'/g, "\\'")}';
    $logo = get_site_icon_url(1200) ?: '';
    echo '<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1" />' . "\\n";
    echo '<link rel="canonical" href="' . esc_url($url) . '" />' . "\\n";
    echo '<meta property="og:type" content="website" />' . "\\n";
    echo '<meta property="og:title" content="' . esc_attr($title) . '" />' . "\\n";
    echo '<meta property="og:description" content="' . esc_attr($desc) . '" />' . "\\n";
    echo '<meta property="og:url" content="' . esc_url($url) . '" />' . "\\n";
    echo '<meta property="og:site_name" content="' . esc_attr(get_bloginfo('name')) . '" />' . "\\n";
    if ($logo) echo '<meta property="og:image" content="' . esc_url($logo) . '" />' . "\\n";
    echo '<meta name="twitter:card" content="summary_large_image" />' . "\\n";
    echo '<meta name="twitter:title" content="' . esc_attr($title) . '" />' . "\\n";
    echo '<meta name="twitter:description" content="' . esc_attr($desc) . '" />' . "\\n";
}, 1);`.trim();

    const installed = await this.upsertCodeSnippet(HOMEPAGE_META_SNIPPET_TITLE, phpCode);
    if (!installed) {
      logger.warn(`Failed to install homepage meta snippet`);
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
   * Purge specific URLs from Cloudflare edge cache (call after content refresh).
   */
  async purgeCloudflareUrls(cloudflareToken: string, zoneId: string, urls: string[]): Promise<number> {
    if (!cloudflareToken || !zoneId || urls.length === 0) return 0;
    try {
      // Cloudflare allows up to 30 URLs per purge request
      const batch = urls.slice(0, 30);
      await axios.post(
        `https://api.cloudflare.com/client/v4/zones/${zoneId}/purge_cache`,
        { files: batch },
        { headers: { Authorization: `Bearer ${cloudflareToken}`, 'Content-Type': 'application/json' }, timeout: 15000 },
      );
      logger.info(`Cloudflare: Purged cache for ${batch.length} URL(s)`);
      return batch.length;
    } catch (error) {
      logger.warn(`Cloudflare cache purge failed: ${error instanceof Error ? error.message : error}`);
      return 0;
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
// Enhanced comment form with topic-specific prompts and CTAs
add_filter('comment_form_defaults', function(\$defaults) {
    \$post_id = get_the_ID();
    \$category = '';
    \$categories = get_the_category(\$post_id);
    if (!empty(\$categories)) {
        \$category = \$categories[0]->name;
    }

    // Category-specific comment prompts (more specific CTAs per niche)
    \$prompts = array(
        'Korean Tech' => 'Which Korean tech brand do you use daily? Share your experience or ask a question about this analysis...',
        'Korean Finance' => 'Are you investing in Korean markets? Share your portfolio strategy or ask about KOSPI/KOSDAQ...',
        'K-Beauty' => 'What\\'s your skin type and current routine? Tell us which K-beauty products transformed your skincare...',
        'Korea Travel' => 'Planning a Korea trip or already been? Share your hidden gems, budget tips, or ask for recommendations...',
        'K-Entertainment' => 'Who\\'s your ult bias or current K-drama obsession? Drop your hot takes and recommendations...',
    );

    \$placeholder = isset(\$prompts[\$category]) ? \$prompts[\$category] : 'Share your thoughts, experience, or questions about this topic...';

    \$defaults['comment_field'] = '<p class="comment-form-comment"><label for="comment">Your Comment</label><textarea id="comment" name="comment" cols="45" rows="6" placeholder="' . esc_attr(\$placeholder) . '" required></textarea></p>';
    \$defaults['title_reply'] = 'Join the Discussion';
    \$defaults['label_submit'] = 'Post Comment';

    return \$defaults;
});

// Auto thank-you email to comment authors (comment_post hook)
add_action('comment_post', function(\$comment_id, \$approved) {
    if (\$approved !== 1) return;
    \$comment = get_comment(\$comment_id);
    if (!\$comment || !\$comment->comment_author_email) return;
    \$post = get_post(\$comment->comment_post_ID);
    if (!\$post) return;
    \$site_name = get_bloginfo('name');
    \$subject = "Thanks for your comment on \\"{$post->post_title}\\" — " . \$site_name;
    \$message = "Hi " . \$comment->comment_author . ",\\n\\n";
    \$message .= "Thanks for joining the discussion on \\"" . \$post->post_title . "\\"!\\n";
    \$message .= "Your insights help build a great community. Check out related articles: " . home_url() . "\\n\\n";
    \$message .= "— " . \$site_name;
    wp_mail(\$comment->comment_author_email, \$subject, \$message);
}, 10, 2);

// "Hot Discussion" badge for posts with 5+ comments
add_filter('the_title', function(\$title, \$id = null) {
    if (!is_singular('post') && !is_admin() && \$id) {
        \$count = get_comments_number(\$id);
        if (\$count >= 5) {
            \$title .= ' <span class="ab-hot-badge" style="display:inline-block;background:#ff5722;color:#fff;font-size:10px;padding:1px 6px;border-radius:4px;vertical-align:middle;margin-left:4px;">Hot Discussion</span>';
        }
    }
    return \$title;
}, 10, 2);

// Recent Comments widget in footer for engagement signals
add_action('wp_footer', function() {
    if (!is_singular('post')) return;
    \$recent = get_comments(array('number' => 3, 'status' => 'approve', 'post_status' => 'publish'));
    if (empty(\$recent)) return;
    echo '<div class="ab-recent-comments" style="max-width:720px;margin:24px auto;padding:16px 20px;background:#f8f9fa;border-radius:10px;font-family:system-ui,sans-serif;">';
    echo '<p style="margin:0 0 12px;font-weight:700;font-size:15px;color:#333;">Recent Comments Across the Site</p>';
    foreach (\$recent as \$c) {
        \$excerpt = wp_trim_words(wp_strip_all_tags(\$c->comment_content), 15);
        \$link = get_comment_link(\$c);
        echo '<div style="margin-bottom:8px;padding-bottom:8px;border-bottom:1px solid #e0e0e0;">';
        echo '<a href="' . esc_url(\$link) . '" style="color:#0066FF;text-decoration:none;font-size:13px;"><strong>' . esc_html(\$c->comment_author) . '</strong>: ' . esc_html(\$excerpt) . '</a>';
        echo '</div>';
    }
    echo '</div>';
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

    const installed = await this.upsertCodeSnippet(COMMENT_ENGAGEMENT_SNIPPET_TITLE, phpCode);
    if (!installed) {
      logger.warn(`Failed to install comment engagement snippet`);
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

    const installed = await this.upsertCodeSnippet(CWV_AUTOFIX_SNIPPET_TITLE, phpCode);
    if (!installed) {
      logger.warn(`Failed to install CWV auto-fix snippet`);
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

    const installed = await this.upsertCodeSnippet(CRITICAL_CSS_SNIPPET_TITLE, phpCode);
    if (!installed) {
      logger.warn(`Failed to install critical CSS snippet`);
    }
  }

  /**
   * Check PageSpeed Insights for a URL (PSI API v5 — no API key required).
   * Returns LCP, CLS, and performance score.
   */
  async checkPageSpeedInsights(url: string): Promise<{
    url: string;
    performanceScore: number;
    lcp: number;
    cls: number;
    fcp: number;
    pass: boolean;
  } | null> {
    try {
      const apiUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&category=performance&strategy=mobile`;
      const { data } = await axios.get(apiUrl, { timeout: 60000 });

      const result = data as {
        lighthouseResult?: {
          categories?: { performance?: { score?: number } };
          audits?: Record<string, { numericValue?: number }>;
        };
      };

      const perfScore = (result.lighthouseResult?.categories?.performance?.score ?? 0) * 100;
      const lcp = result.lighthouseResult?.audits?.['largest-contentful-paint']?.numericValue ?? 0;
      const cls = result.lighthouseResult?.audits?.['cumulative-layout-shift']?.numericValue ?? 0;
      const fcp = result.lighthouseResult?.audits?.['first-contentful-paint']?.numericValue ?? 0;

      // Pass if score >= 50 (mobile thresholds are strict)
      const pass = perfScore >= 50;

      return { url, performanceScore: Math.round(perfScore), lcp: Math.round(lcp), cls: parseFloat(cls.toFixed(3)), fcp: Math.round(fcp), pass };
    } catch (error) {
      logger.debug(`PSI check failed for ${url}: ${error instanceof Error ? error.message : error}`);
      return null;
    }
  }

  /**
   * Check multiple URLs and return failing ones (score < 50 or LCP > 4000ms).
   */
  async checkPageSpeedBatch(urls: string[]): Promise<Array<{
    url: string;
    performanceScore: number;
    lcp: number;
    cls: number;
    fcp: number;
    pass: boolean;
  }>> {
    const results: Array<{ url: string; performanceScore: number; lcp: number; cls: number; fcp: number; pass: boolean }> = [];
    // PSI is rate-limited; run sequentially
    for (const url of urls.slice(0, 5)) {
      const result = await this.checkPageSpeedInsights(url);
      if (result) {
        results.push(result);
        logger.info(`PSI [${result.performanceScore}] ${url} — LCP: ${result.lcp}ms, CLS: ${result.cls}, FCP: ${result.fcp}ms`);
      }
    }
    return results;
  }
}
