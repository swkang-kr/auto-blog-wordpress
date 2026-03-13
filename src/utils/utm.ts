/**
 * UTM parameter builder for social media URLs.
 * Appends utm_source, utm_medium, utm_campaign, utm_content, and utm_term
 * to track traffic from each platform with full attribution.
 */

export interface UtmParams {
  source: string;
  medium?: string;
  campaign?: string;
  /** Content identifier — e.g. "thread-tweet-1", "pin-image", "linkedin-article" */
  content?: string;
  /** Keyword/term — e.g. the target keyword of the post */
  term?: string;
}

export function buildUtmUrl(
  url: string,
  sourceOrParams: string | UtmParams,
  medium: string = 'social',
  campaign?: string,
): string {
  // Support both old signature and new UtmParams object
  const params: UtmParams = typeof sourceOrParams === 'string'
    ? { source: sourceOrParams, medium, campaign }
    : sourceOrParams;

  try {
    const u = new URL(url);
    u.searchParams.set('utm_source', params.source);
    u.searchParams.set('utm_medium', params.medium || 'social');
    if (params.campaign) u.searchParams.set('utm_campaign', params.campaign);
    if (params.content) u.searchParams.set('utm_content', params.content);
    if (params.term) u.searchParams.set('utm_term', params.term);
    return u.toString();
  } catch {
    // If URL parsing fails, append manually
    const sep = url.includes('?') ? '&' : '?';
    const parts = [
      `utm_source=${encodeURIComponent(params.source)}`,
      `utm_medium=${encodeURIComponent(params.medium || 'social')}`,
    ];
    if (params.campaign) parts.push(`utm_campaign=${encodeURIComponent(params.campaign)}`);
    if (params.content) parts.push(`utm_content=${encodeURIComponent(params.content)}`);
    if (params.term) parts.push(`utm_term=${encodeURIComponent(params.term)}`);
    return `${url}${sep}${parts.join('&')}`;
  }
}

/** Extract a slug from a URL path for use as campaign name */
export function extractSlugFromUrl(url: string): string {
  try {
    const pathname = new URL(url).pathname;
    // Remove trailing slash and get last segment
    const segments = pathname.replace(/\/+$/, '').split('/').filter(Boolean);
    return segments[segments.length - 1] || 'post';
  } catch {
    return 'post';
  }
}
