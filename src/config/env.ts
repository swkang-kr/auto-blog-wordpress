import { z } from 'zod';
import { ConfigError } from '../types/errors.js';

// Environment variables are loaded via Node's --env-file=.env flag (see package.json "start" script).
// No dotenv import needed — Node v20.6+ handles .env natively.

const envSchema = z.object({
  ANTHROPIC_API_KEY: z.string().min(1, 'ANTHROPIC_API_KEY is required'),
  GEMINI_API_KEY: z.string().min(1, 'GEMINI_API_KEY is required'),
  WP_URL: z.string().url('WP_URL must be a valid URL'),
  WP_USERNAME: z.string().min(1, 'WP_USERNAME is required'),
  WP_APP_PASSWORD: z.string().min(1, 'WP_APP_PASSWORD is required'),
  TRENDS_GEO: z.string().default('US'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  SITE_NAME: z.string().default('TrendHunt'),
  SITE_TAGLINE: z.string().default(''),
  SITE_OWNER: z.string().default('TrendHunt'),
  CONTACT_EMAIL: z.string().default('snix.kr@gmail.com'),
  GA_MEASUREMENT_ID: z.string().default(''),
  GOOGLE_SITE_VERIFICATION: z.string().default(''),
  NAVER_SITE_VERIFICATION: z.string().default(''),
  INDEXNOW_KEY: z.string().default(''),
  CLAUDE_MODEL: z.string().default('claude-sonnet-4-6'),
  // Separate model for keyword research (cost optimization: use haiku for research, sonnet for content)
  CLAUDE_RESEARCH_MODEL: z.string().default(''),
  POST_COUNT: z.coerce.number().int().min(1).default(4), // 시장/업종/테마/수급 4개 니치 × 1포스트
  // X (Twitter) - optional, all four must be set to enable promotion
  X_API_KEY: z.string().default(''),
  X_API_SECRET: z.string().default(''),
  X_ACCESS_TOKEN: z.string().default(''),
  X_ACCESS_TOKEN_SECRET: z.string().default(''),
  // Google Indexing API - optional, service account JSON key string
  GOOGLE_INDEXING_SA_KEY: z.string().default(''),
  // DEV.to - optional, enables auto-syndication to DEV.to
  DEVTO_API_KEY: z.string().default(''),
  // Hashnode - optional, enables auto-syndication to Hashnode
  HASHNODE_TOKEN: z.string().default(''),
  HASHNODE_PUBLICATION_ID: z.string().default(''),
  // Content quality & workflow
  MIN_QUALITY_SCORE: z.coerce.number().int().min(0).max(100).default(65),
  PUBLISH_STATUS: z.enum(['publish', 'draft']).default('publish'),
  PUBLISH_INTERVAL_MINUTES: z.coerce.number().int().min(0).default(0),
  // Manual review mode: auto-draft first N posts for quality review before AdSense approval
  // Posts publish as "draft" until total published count exceeds this threshold
  // Set to 0 to disable (default: 30 for AdSense safety)
  MANUAL_REVIEW_THRESHOLD: z.coerce.number().int().min(0).default(30),
  // Publish time optimization (24h format, e.g. "08:00" for 8 AM ET)
  PUBLISH_OPTIMAL_HOUR: z.coerce.number().int().min(0).max(23).default(8),
  PUBLISH_TIMEZONE: z.string().default('America/New_York'),
  // Author identity for E-E-A-T
  AUTHOR_LINKEDIN: z.string().default(''),
  AUTHOR_TWITTER: z.string().default(''),
  AUTHOR_WEBSITE: z.string().default(''),
  AUTHOR_BIO: z.string().default(''),
  AUTHOR_CREDENTIALS: z.string().default(''),
  // GA4 Data API for performance feedback
  GA4_PROPERTY_ID: z.string().default(''),
  // Google Search Console for search performance feedback
  GSC_SITE_URL: z.string().default(''),
  // Telegram bot for batch alerting (replaces Slack)
  TELEGRAM_BOT_TOKEN: z.string().default(''),
  TELEGRAM_CHAT_ID: z.string().default(''),
  // Image format: webp (default) or avif (better compression, newer format)
  IMAGE_FORMAT: z.enum(['webp', 'avif']).default('webp'),
  // Auto-rewrite underperforming posts (0 = disabled)
  AUTO_REWRITE_COUNT: z.coerce.number().int().min(0).default(2),
  AUTO_REWRITE_MIN_AGE_DAYS: z.coerce.number().int().min(7).default(30),
  // Pinterest - optional, enables auto-pinning for visual categories (Korean-Stock, AI-Trading)
  PINTEREST_ACCESS_TOKEN: z.string().default(''),
  // Newsletter form URL (Mailchimp/ConvertKit) - optional, enables in-content email CTA
  NEWSLETTER_FORM_URL: z.string().default(''),
  // Affiliate settings - optional JSON mapping of category to affiliate program URLs
  AFFILIATE_MAP: z.string().default(''),
  // Niche focus mode: comma-separated niche IDs to concentrate on for topical authority
  // e.g., "korean-stock-주식분석,korean-stock-makeup,ai-trading-business"
  // When set, only these niches are used (ignoring others). Clear after cluster is built.
  NICHE_FOCUS_IDS: z.string().default(''),
  // Korean content generation: enable hreflang Korean versions of published posts
  // Set to 'true' to generate Korean versions after English posts are published
  ENABLE_KOREAN_CONTENT: z.string().default('false').transform(v => v === 'true' ? 'true' : 'false').pipe(z.enum(['true', 'false'])),
  // YouTube Data API key for finding relevant videos to embed in posts (optional)
  YOUTUBE_API_KEY: z.string().default(''),
  // RPM overrides: JSON object of niche → actual RPM from AdSense (e.g., '{"Korean-Stock":8.5}')
  ADSENSE_RPM_OVERRIDES: z.string().default(''),
  // Reddit OAuth API credentials (optional — falls back to public JSON API if not set)
  REDDIT_CLIENT_ID: z.string().default(''),
  REDDIT_CLIENT_SECRET: z.string().default(''),
  // Cloudflare CDN/Edge Caching (optional — enables cache header management)
  CLOUDFLARE_API_TOKEN: z.string().default(''),
  CLOUDFLARE_ZONE_ID: z.string().default(''),
  // Google API Key for CrUX API (Core Web Vitals) + Rich Results Test (optional)
  GOOGLE_API_KEY: z.string().default(''),
  // Medium Integration Token — enables auto-syndication to Medium
  MEDIUM_TOKEN: z.string().default(''),
  // Email automation webhook URL (Mailchimp/ConvertKit/Zapier) — triggered on new post publish
  EMAIL_WEBHOOK_URL: z.string().default(''),
  // AdSense Management API — service account JSON key for automated RPM collection
  ADSENSE_SA_KEY: z.string().default(''),
  // AdSense account ID (e.g., "pub-1234567890")
  ADSENSE_ACCOUNT_ID: z.string().default(''),
  // AdSense publisher ID (e.g., "ca-pub-1234567890") — required for manual ad unit placement
  ADSENSE_PUB_ID: z.string().default(''),
  // SerpAPI key — fallback for Google Trends when unofficial API fails
  SERPAPI_KEY: z.string().default(''),
  // Naver Blog auto-seeding — cross-post excerpts to Naver Blog for Korean traffic
  NAVER_BLOG_ID: z.string().default(''),
  NAVER_CLIENT_ID: z.string().default(''),
  NAVER_CLIENT_SECRET: z.string().default(''),
  // Microsoft Clarity — behavioral analytics (heatmaps, session recordings)
  CLARITY_PROJECT_ID: z.string().default(''),
  // LinkedIn — auto-share published posts (requires Marketing API access token)
  LINKEDIN_ACCESS_TOKEN: z.string().default(''),
  LINKEDIN_PERSON_ID: z.string().default(''),
  // Reddit posting — auto-submit links to relevant subreddits (script app, password grant)
  REDDIT_POST_USERNAME: z.string().default(''),
  REDDIT_POST_PASSWORD: z.string().default(''),
  // Facebook Page auto-posting
  FB_ACCESS_TOKEN: z.string().default(''),
  FB_PAGE_ID: z.string().default(''),
  FB_APP_ID: z.string().default(''),
  FB_APP_SECRET: z.string().default(''),
  // Threads (Meta) — auto-posting to Threads profile
  THREADS_ACCESS_TOKEN: z.string().default(''),
  THREADS_APP_ID: z.string().default(''),
  THREADS_APP_SECRET: z.string().default(''),
  THREADS_USER_ID: z.string().default(''),
});

export type AppConfig = z.infer<typeof envSchema>;

export function loadConfig(): AppConfig {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const errors = result.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new ConfigError(`Environment variable validation failed:\n${errors}`);
  }
  return result.data;
}
