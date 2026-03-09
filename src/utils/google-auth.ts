import axios from 'axios';
import { createSign } from 'crypto';

interface CachedToken {
  accessToken: string;
  expiresAt: number;
}

// Cache keyed by scope — 50-min TTL (tokens last 60 min, refresh 10 min early)
const tokenCache = new Map<string, CachedToken>();
const TTL_MS = 50 * 60 * 1000;

/**
 * Get a Google OAuth2 access token using a service account key.
 * Caches tokens per scope for 50 minutes to avoid redundant JWT exchanges.
 */
export async function getGoogleAccessToken(saKeyJson: string, scope: string): Promise<string> {
  const cached = tokenCache.get(scope);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.accessToken;
  }

  const sa = JSON.parse(saKeyJson) as {
    client_email: string;
    private_key: string;
  };

  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({
      iss: sa.client_email,
      scope,
      aud: 'https://oauth2.googleapis.com/token',
      exp: now + 3600,
      iat: now,
    }),
  ).toString('base64url');

  const sign = createSign('RSA-SHA256');
  sign.update(`${header}.${payload}`);
  const signature = sign.sign(sa.private_key, 'base64url');

  const jwt = `${header}.${payload}.${signature}`;

  const { data } = await axios.post<{ access_token: string }>(
    'https://oauth2.googleapis.com/token',
    new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 10000 },
  );

  tokenCache.set(scope, {
    accessToken: data.access_token,
    expiresAt: Date.now() + TTL_MS,
  });

  return data.access_token;
}
