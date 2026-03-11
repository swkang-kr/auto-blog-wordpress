import { logger } from '../utils/logger.js';

interface AdSenseReportRow {
  cells: Array<{ value: string }>;
}

/**
 * AdSense Management API service for automated RPM collection.
 * Fetches actual RPM data per ad unit/URL pattern to replace manual ADSENSE_RPM_OVERRIDES.
 */
export class AdSenseApiService {
  private accountId: string;
  private saKey: string;
  private accessToken: string | null = null;
  private tokenExpiry = 0;

  constructor(accountId: string, saKeyJson: string) {
    this.accountId = accountId;
    this.saKey = saKeyJson;
  }

  /**
   * Fetch RPM data per URL pattern (category) for the last 30 days.
   * Returns map of category pattern → RPM value.
   */
  async getRpmByCategory(categoryPatterns: Record<string, string>): Promise<Record<string, number>> {
    try {
      const token = await this.getAccessToken();
      if (!token) return {};

      // AdSense Reporting API v2
      const params = new URLSearchParams({
        'dateRange': 'LAST_30_DAYS',
        'metrics': 'PAGE_VIEWS_RPM',
        'dimensions': 'URL_CHANNEL_NAME',
      });

      const response = await fetch(
        `https://adsense.googleapis.com/v2/accounts/${this.accountId}/reports:generate?${params}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );

      if (!response.ok) {
        logger.warn(`AdSense API: ${response.status} ${response.statusText}`);
        return {};
      }

      const data = await response.json() as { rows?: AdSenseReportRow[] };
      const rpmMap: Record<string, number> = {};

      if (data.rows) {
        for (const [category, pattern] of Object.entries(categoryPatterns)) {
          const matchingRow = data.rows.find(row =>
            row.cells[0]?.value?.includes(pattern),
          );
          if (matchingRow && matchingRow.cells[1]) {
            const rpm = parseFloat(matchingRow.cells[1].value);
            if (!isNaN(rpm) && rpm > 0) {
              rpmMap[category] = rpm;
            }
          }
        }
      }

      if (Object.keys(rpmMap).length > 0) {
        logger.info(`AdSense API: RPM data fetched for ${Object.keys(rpmMap).length} categories: ${JSON.stringify(rpmMap)}`);
      } else {
        logger.debug('AdSense API: No RPM data matched category patterns');
      }

      return rpmMap;
    } catch (error) {
      logger.warn(`AdSense API RPM fetch failed: ${error instanceof Error ? error.message : error}`);
      return {};
    }
  }

  /**
   * Get OAuth2 access token via service account JWT.
   */
  private async getAccessToken(): Promise<string | null> {
    if (this.accessToken && Date.now() < this.tokenExpiry) {
      return this.accessToken;
    }

    try {
      let saData: { client_email: string; private_key: string };
      try {
        saData = JSON.parse(this.saKey);
      } catch {
        logger.warn('AdSense API: Invalid service account key JSON');
        return null;
      }

      // Build JWT for Google OAuth2
      const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
      const now = Math.floor(Date.now() / 1000);
      const claim = Buffer.from(JSON.stringify({
        iss: saData.client_email,
        scope: 'https://www.googleapis.com/auth/adsense.readonly',
        aud: 'https://oauth2.googleapis.com/token',
        iat: now,
        exp: now + 3600,
      })).toString('base64url');

      const { createSign } = await import('crypto');
      const sign = createSign('RSA-SHA256');
      sign.update(`${header}.${claim}`);
      const signature = sign.sign(saData.private_key, 'base64url');

      const jwt = `${header}.${claim}.${signature}`;

      const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
          assertion: jwt,
        }),
      });

      const tokenData = await response.json() as { access_token?: string; expires_in?: number };
      if (tokenData.access_token) {
        this.accessToken = tokenData.access_token;
        this.tokenExpiry = Date.now() + ((tokenData.expires_in || 3600) - 60) * 1000;
        return this.accessToken;
      }
      return null;
    } catch (error) {
      logger.warn(`AdSense API auth failed: ${error instanceof Error ? error.message : error}`);
      return null;
    }
  }
}
