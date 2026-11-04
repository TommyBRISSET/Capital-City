import crypto from 'node:crypto';
import type { SignedSessionClaims } from './session-types';

export type { SessionClaims, SignedSessionClaims } from './session-types';

function getSecret(secretOverride?: string): string {
  return (
    secretOverride ||
    process.env.SESSION_SECRET ||
    'local-dev-secret-capital-city-hmac-2026-9876543210abcdef'
  );
}

export function signSessionToken(claims: SignedSessionClaims, secretOverride?: string): string {
  const payloadBase64 = Buffer.from(JSON.stringify(claims), 'utf8').toString('base64url');
  const sig = crypto
    .createHmac('sha256', getSecret(secretOverride))
    .update(payloadBase64)
    .digest('base64url');
  return `${payloadBase64}.${sig}`;
}

export function verifySessionToken(
  token: string | undefined | null,
  secretOverride?: string,
): SignedSessionClaims | null {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payloadBase64, sig] = parts as [string, string];
  const expectedSig = crypto
    .createHmac('sha256', getSecret(secretOverride))
    .update(payloadBase64)
    .digest('base64url');

  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }

  try {
    const parsed = JSON.parse(
      Buffer.from(payloadBase64, 'base64url').toString('utf8'),
    ) as SignedSessionClaims;
    if (!parsed.userId || !parsed.displayName || typeof parsed.exp !== 'number') {
      return null;
    }
    if (Date.now() > parsed.exp) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}
