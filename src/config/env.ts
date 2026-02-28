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
  SITE_OWNER: z.string().default(''),
  CONTACT_EMAIL: z.string().default('snix.kr@gmail.com'),
  GA_MEASUREMENT_ID: z.string().default(''),
  GOOGLE_SITE_VERIFICATION: z.string().default(''),
  NAVER_SITE_VERIFICATION: z.string().default(''),
  INDEXNOW_KEY: z.string().default(''),
  CLAUDE_MODEL: z.string().default('claude-sonnet-4-6'),
  DEEPL_API_KEY: z.string().default(''),
  // X (Twitter) - optional, all four must be set to enable promotion
  X_API_KEY: z.string().default(''),
  X_API_SECRET: z.string().default(''),
  X_ACCESS_TOKEN: z.string().default(''),
  X_ACCESS_TOKEN_SECRET: z.string().default(''),
  // Google Indexing API - optional, service account JSON key string
  GOOGLE_INDEXING_SA_KEY: z.string().default(''),
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
