import 'dotenv/config';
import { z } from 'zod';
import { ConfigError } from '../types/errors.js';

const envSchema = z.object({
  ANTHROPIC_API_KEY: z.string().min(1, 'ANTHROPIC_API_KEY is required'),
  GEMINI_API_KEY: z.string().min(1, 'GEMINI_API_KEY is required'),
  WP_URL: z.string().url('WP_URL must be a valid URL'),
  WP_USERNAME: z.string().min(1, 'WP_USERNAME is required'),
  WP_APP_PASSWORD: z.string().min(1, 'WP_APP_PASSWORD is required'),
  TRENDS_GEO: z.string().default('US'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  SITE_NAME: z.string().default('TrendHunt'),
  SITE_OWNER: z.string().default('TrendHunt'),
  CONTACT_EMAIL: z.string().default('snix.kr@gmail.com'),
  GA_MEASUREMENT_ID: z.string().default(''),
  GOOGLE_SITE_VERIFICATION: z.string().default(''),
  NAVER_SITE_VERIFICATION: z.string().default(''),
  INDEXNOW_KEY: z.string().default(''),
  CLAUDE_MODEL: z.string().default('claude-sonnet-4-6'),
  // Separate model for keyword research (cost optimization: use haiku for research, sonnet for content)
  CLAUDE_RESEARCH_MODEL: z.string().default(''),
  POST_COUNT: z.coerce.number().int().min(1).default(1),
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
  AUTHOR_BIO: z.string().default(''),
  AUTHOR_CREDENTIALS: z.string().default(''),
  // GA4 Data API for performance feedback
  GA4_PROPERTY_ID: z.string().default(''),
  // Google Search Console for search performance feedback
  GSC_SITE_URL: z.string().default(''),
  // Slack webhook for batch failure alerting
  SLACK_WEBHOOK_URL: z.string().default(''),
  // Image format: webp (default) or avif (better compression, newer format)
  IMAGE_FORMAT: z.enum(['webp', 'avif']).default('webp'),
  // Auto-rewrite underperforming posts (0 = disabled)
  AUTO_REWRITE_COUNT: z.coerce.number().int().min(0).default(2),
  AUTO_REWRITE_MIN_AGE_DAYS: z.coerce.number().int().min(7).default(30),
  // Pinterest - optional, enables auto-pinning for visual categories (Travel, Food, Beauty)
  PINTEREST_ACCESS_TOKEN: z.string().default(''),
  // Newsletter form URL (Mailchimp/ConvertKit/Substack) - optional, enables in-content email CTA
  NEWSLETTER_FORM_URL: z.string().default(''),
  // Affiliate settings - optional JSON mapping of category to affiliate program URLs
  AFFILIATE_MAP: z.string().default(''),
  // Niche focus mode: comma-separated niche IDs to concentrate on for topical authority
  // e.g., "korean-tech-ai,korean-finance-stocks,k-beauty-skincare"
  // When set, only these niches are used (ignoring others). Clear after cluster is built.
  NICHE_FOCUS_IDS: z.string().default(''),
  // Korean content generation: enable hreflang Korean versions of published posts
  // Set to 'true' to generate Korean versions after English posts are published
  ENABLE_KOREAN_CONTENT: z.enum(['true', 'false']).default('false'),
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
