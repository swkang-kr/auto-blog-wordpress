/**
 * [#17] Lead Magnet Content Generator — creates niche-specific lead magnet content.
 * Generates downloadable guides/checklists using Claude API for each niche category.
 *
 * Usage: npx tsx src/scripts/generate-lead-magnets.ts [--niche=korean-tech-ai]
 */
import Anthropic from '@anthropic-ai/sdk';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { loadConfig } from '../config/env.js';
import { NICHES } from '../config/niches.js';
import { logger } from '../utils/logger.js';

const LEAD_MAGNET_PROMPTS: Record<string, { title: string; type: string; description: string }> = {
  'Korean Tech': {
    title: 'Korea AI & Tech Investment Starter Kit',
    type: 'guide',
    description: 'A comprehensive guide covering Korean AI companies, semiconductor investments, and tech startup ecosystem for international investors.',
  },
  'Korean Finance': {
    title: 'Korea Stock Market Investing Checklist',
    type: 'checklist',
    description: 'Step-by-step checklist for opening a Korean brokerage account, selecting KOSPI/KOSDAQ stocks, and understanding Korean market regulations.',
  },
  'K-Beauty': {
    title: 'Korean Skincare Routine Builder Workbook',
    type: 'workbook',
    description: 'A printable workbook for building a personalized Korean skincare routine, with ingredient guides, product recommendations, and tracking sheets.',
  },
  'Korea Travel': {
    title: 'Korea Travel Planning Template',
    type: 'template',
    description: 'Complete trip planning template with daily itineraries, budget tracker, packing list, essential Korean phrases, and transit guide.',
  },
  'K-Entertainment': {
    title: 'K-Pop Business Analysis Toolkit',
    type: 'toolkit',
    description: 'Industry analysis frameworks for understanding K-pop agencies, revenue models, and entertainment stock valuations.',
  },
};

async function main(): Promise<void> {
  const config = loadConfig();
  const nicheArg = process.argv.find(a => a.startsWith('--niche='))?.split('=')[1];

  const targetNiches = nicheArg
    ? NICHES.filter(n => n.id === nicheArg)
    : NICHES;

  if (targetNiches.length === 0) {
    logger.error(`No niche found for ID: ${nicheArg}`);
    process.exit(1);
  }

  const client = new Anthropic({ apiKey: config.ANTHROPIC_API_KEY });
  const outputDir = join(process.cwd(), 'data', 'lead-magnets');
  mkdirSync(outputDir, { recursive: true });

  for (const niche of targetNiches) {
    const prompt = LEAD_MAGNET_PROMPTS[niche.category];
    if (!prompt) {
      logger.info(`No lead magnet template for ${niche.category}, skipping`);
      continue;
    }

    logger.info(`Generating lead magnet for ${niche.category}: "${prompt.title}"`);

    try {
      const response = await client.messages.create({
        model: config.CLAUDE_MODEL,
        max_tokens: 8000,
        messages: [{
          role: 'user',
          content: `Create a comprehensive ${prompt.type} titled "${prompt.title}".

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

Output format: Pure HTML document.`,
        }],
      });

      const content = response.content[0].type === 'text' ? response.content[0].text : '';
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
