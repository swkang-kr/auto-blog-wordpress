/**
 * [#17] Lead Magnet Content Generator — creates niche-specific lead magnet content.
 * Generates downloadable guides/checklists using Claude CLI for each niche category.
 *
 * Usage: npx tsx src/scripts/generate-lead-magnets.ts [--niche=korean-tech-ai]
 */
import { spawnSync } from 'child_process';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { loadConfig } from '../config/env.js';
import { NICHES } from '../config/niches.js';
import { logger } from '../utils/logger.js';

const LEAD_MAGNET_PROMPTS: Record<string, { title: string; type: string; description: string }> = {
  '시장분석': {
    title: 'KOSPI/KOSDAQ 시황 분석 체크리스트',
    type: 'checklist',
    description: 'A daily market analysis checklist covering KOSPI/KOSDAQ key levels, BOK policy, foreign net buying, and macro indicators for Korean stock investors.',
  },
  '업종분석': {
    title: '한국 업종별 투자 전략 가이드',
    type: 'guide',
    description: 'Sector rotation guide for Korean stocks — semiconductors, batteries, bio, internet, and financial sectors with earnings cycle maps.',
  },
  '테마분석': {
    title: '한국 테마주 발굴 워크시트',
    type: 'workbook',
    description: 'A structured workbook for identifying theme stocks (테마주): policy catalysts, beneficiary companies, entry timing, and risk checklist.',
  },
  '종목분석': {
    title: '한국 주식 종목 분석 툴킷',
    type: 'toolkit',
    description: 'Fundamental + technical analysis toolkit for Korean stocks: PER/PBR/ROE templates, DART disclosure reading guide, and quant scoring framework.',
  },
};

async function main(): Promise<void> {
  const config = loadConfig();
  const claudeBin = process.env.CLAUDE_BIN || 'claude';
  const nicheArg = process.argv.find(a => a.startsWith('--niche='))?.split('=')[1];

  const targetNiches = nicheArg
    ? NICHES.filter(n => n.id === nicheArg)
    : NICHES;

  if (targetNiches.length === 0) {
    logger.error(`No niche found for ID: ${nicheArg}`);
    process.exit(1);
  }

  const outputDir = join(process.cwd(), 'data', 'lead-magnets');
  mkdirSync(outputDir, { recursive: true });

  for (const niche of targetNiches) {
    const prompt = LEAD_MAGNET_PROMPTS[niche.category];
    if (!prompt) {
      logger.info(`No lead magnet template for ${niche.category}, skipping`);
      continue;
    }

    logger.info(`Generating lead magnet for ${niche.category}: "${prompt.title}"`);

    const fullPrompt = `Create a comprehensive ${prompt.type} titled "${prompt.title}".

Description: ${prompt.description}

Requirements:
- Write in professional, authoritative English
- Include actionable content that provides immediate value
- Structure with clear headings, numbered lists, and checklists where appropriate
- Include Korea-specific data, links to official resources, and insider tips
- Target 3000-5000 words
- Format as clean HTML with inline CSS (suitable for PDF conversion)
- Include a professional cover section with title and subtitle
- Add a "About ${config.SITE_NAME}" section at the end with site URL: ${config.WP_URL}

Output format: Pure HTML document.`;

    try {
      const { ANTHROPIC_API_KEY: _unused, ...safeEnv } = process.env;
      const result = spawnSync(claudeBin, ['-p', fullPrompt, '--model', 'opus'], {
        encoding: 'utf8',
        maxBuffer: 16 * 1024 * 1024,
        env: safeEnv,
      });

      if (result.status !== 0) {
        throw new Error(`Claude CLI failed: ${result.stderr?.slice(0, 300)}`);
      }

      const content = result.stdout?.trim() ?? '';
      if (!content) throw new Error('Empty response from Claude CLI');

      const filename = `${niche.id}-lead-magnet.html`;
      writeFileSync(join(outputDir, filename), content, 'utf-8');
      logger.info(`  Saved: ${filename} (${content.length} chars)`);
    } catch (error) {
      logger.error(`  Failed for ${niche.category}: ${error instanceof Error ? error.message : error}`);
    }
  }

  logger.info(`\nLead magnets saved to: ${outputDir}`);
  logger.info('Convert to PDF with: wkhtmltopdf or browser print');
}

main().catch((error) => {
  logger.error(`Fatal error: ${error instanceof Error ? error.message : error}`);
  process.exit(1);
});
