/**
 * UTM parameter builder for social media URLs.
 * Appends utm_source, utm_medium, and utm_campaign to track traffic from each platform.
 */

export function buildUtmUrl(
  url: string,
  source: string,
  medium: string = 'social',
  campaign?: string,
): string {
  try {
    const u = new URL(url);
    u.searchParams.set('utm_source', source);
    u.searchParams.set('utm_medium', medium);
    if (campaign) {
      u.searchParams.set('utm_campaign', campaign);
    }
    return u.toString();
  } catch {
    // If URL parsing fails, append manually
    const sep = url.includes('?') ? '&' : '?';
    const params = `utm_source=${encodeURIComponent(source)}&utm_medium=${encodeURIComponent(medium)}${campaign ? `&utm_campaign=${encodeURIComponent(campaign)}` : ''}`;
    return `${url}${sep}${params}`;
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
