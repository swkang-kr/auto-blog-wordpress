/**
 * html-to-markdown.ts
 * Lightweight HTML → Markdown converter for Dev.to / Hashnode syndication.
 * No external dependencies — uses regex + string manipulation only.
 */

export function htmlToMarkdown(html: string): string {
  let md = html;

  // Strip outer wrapper div
  md = md.replace(/<div[^>]*>/gi, '').replace(/<\/div>/gi, '');

  // Headings
  md = md.replace(/<h1[^>]*>(.*?)<\/h1>/gis, '# $1\n\n');
  md = md.replace(/<h2[^>]*>(.*?)<\/h2>/gis, '## $1\n\n');
  md = md.replace(/<h3[^>]*>(.*?)<\/h3>/gis, '### $1\n\n');
  md = md.replace(/<h4[^>]*>(.*?)<\/h4>/gis, '#### $1\n\n');

  // Bold / italic
  md = md.replace(/<strong[^>]*>(.*?)<\/strong>/gis, '**$1**');
  md = md.replace(/<b[^>]*>(.*?)<\/b>/gis, '**$1**');
  md = md.replace(/<em[^>]*>(.*?)<\/em>/gis, '*$1*');
  md = md.replace(/<i[^>]*>(.*?)<\/i>/gis, '*$1*');

  // Links — preserve href and text
  md = md.replace(/<a[^>]*href=["']([^"']*)["'][^>]*>(.*?)<\/a>/gis, '[$2]($1)');

  // Images
  md = md.replace(/<img[^>]*alt=["']([^"']*)["'][^>]*src=["']([^"']*)["'][^>]*\/?>/gis, '![$1]($2)');
  md = md.replace(/<img[^>]*src=["']([^"']*)["'][^>]*alt=["']([^"']*)["'][^>]*\/?>/gis, '![$2]($1)');
  md = md.replace(/<img[^>]*src=["']([^"']*)["'][^>]*\/?>/gis, '![]($1)');

  // Image placeholders — remove (inline images not available on syndicated platforms)
  md = md.replace(/<!--IMAGE_PLACEHOLDER_\d+-->/gi, '');

  // Tables — convert to simple markdown tables
  md = md.replace(/<table[^>]*>/gi, '').replace(/<\/table>/gi, '\n');
  md = md.replace(/<thead[^>]*>/gi, '').replace(/<\/thead>/gi, '');
  md = md.replace(/<tbody[^>]*>/gi, '').replace(/<\/tbody>/gi, '');
  md = md.replace(/<tr[^>]*>/gi, '').replace(/<\/tr>/gi, '|\n');
  md = md.replace(/<th[^>]*>(.*?)<\/th>/gis, '| **$1** ');
  md = md.replace(/<td[^>]*>(.*?)<\/td>/gis, '| $1 ');

  // Blockquote / highlight boxes → markdown blockquote
  md = md.replace(/<div[^>]*border-left[^>]*>(.*?)<\/div>/gis, '> $1\n\n');

  // Ordered / unordered lists
  md = md.replace(/<ul[^>]*>/gi, '').replace(/<\/ul>/gi, '\n');
  md = md.replace(/<ol[^>]*>/gi, '').replace(/<\/ol>/gi, '\n');
  md = md.replace(/<li[^>]*>(.*?)<\/li>/gis, '- $1\n');

  // Paragraphs and line breaks
  md = md.replace(/<p[^>]*>(.*?)<\/p>/gis, '$1\n\n');
  md = md.replace(/<br\s*\/?>/gi, '\n');

  // Horizontal rules
  md = md.replace(/<hr[^>]*>/gi, '\n---\n\n');

  // Code blocks
  md = md.replace(/<pre[^>]*><code[^>]*>(.*?)<\/code><\/pre>/gis, '```\n$1\n```\n\n');
  md = md.replace(/<code[^>]*>(.*?)<\/code>/gis, '`$1`');

  // Strip any remaining HTML tags
  md = md.replace(/<[^>]+>/g, '');

  // Decode common HTML entities
  md = md.replace(/&amp;/g, '&');
  md = md.replace(/&lt;/g, '<');
  md = md.replace(/&gt;/g, '>');
  md = md.replace(/&quot;/g, '"');
  md = md.replace(/&#39;/g, "'");
  md = md.replace(/&nbsp;/g, ' ');

  // Collapse 3+ blank lines → 2
  md = md.replace(/\n{3,}/g, '\n\n');

  return md.trim();
}
