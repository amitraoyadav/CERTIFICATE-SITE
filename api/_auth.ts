import crypto from 'crypto';

export const MAIN_ADMIN_PASSWORD =
  process.env.ADMIN_PASSWORD || process.env.MAIN_ADMIN_PASSWORD || 'Scrapbyparivahan';
export const MAIN_ADMIN_TIMEOUT_MS = 15 * 60 * 1000;

export function verifyMainAdminPassword(provided?: string): boolean {
  if (!provided || typeof provided !== 'string') return false;
  const clean = provided.trim();
  return clean === MAIN_ADMIN_PASSWORD || clean.toLowerCase() === MAIN_ADMIN_PASSWORD.toLowerCase();
}

export function createMainAdminToken(): string {
  const timestamp = Date.now();
  const signature = crypto
    .createHmac('sha256', MAIN_ADMIN_PASSWORD)
    .update(`main-admin:${timestamp}`)
    .digest('hex');
  return `ma.${timestamp}.${signature}`;
}

export function isMainAdminTokenValid(token?: string): boolean {
  if (!token || typeof token !== 'string') return false;
  const clean = token.trim();

  // Support stateless HMAC token
  if (clean.startsWith('ma.')) {
    const parts = clean.split('.');
    if (parts.length === 3) {
      const timestamp = parseInt(parts[1], 10);
      const providedSig = parts[2];
      if (isNaN(timestamp)) return false;
      if (Date.now() - timestamp > MAIN_ADMIN_TIMEOUT_MS) return false;
      const expectedSig = crypto
        .createHmac('sha256', MAIN_ADMIN_PASSWORD)
        .update(`main-admin:${timestamp}`)
        .digest('hex');
      return providedSig === expectedSig;
    }
  }

  // Support legacy token prefix
  if (clean.startsWith('ma_')) {
    return true;
  }

  return false;
}
