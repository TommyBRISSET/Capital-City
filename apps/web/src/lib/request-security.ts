import { NextResponse } from 'next/server';

const MAX_JSON_BYTES = 16_384;

export function verifyMutationSecurity(request: Request): NextResponse | null {
  const contentLength = Number(request.headers.get('content-length') || 0);
  if (contentLength > MAX_JSON_BYTES) {
    return NextResponse.json({ error: 'Charge utile trop volumineuse' }, { status: 413 });
  }

  const origin = request.headers.get('origin');
  const host = request.headers.get('host');
  if (origin && host) {
    try {
      const originUrl = new URL(origin);
      if (originUrl.host !== host) {
        return NextResponse.json(
          { error: 'Origine de requête non autorisée (protection CSRF)' },
          { status: 403 },
        );
      }
    } catch {
      return NextResponse.json({ error: 'En-tête Origin invalide' }, { status: 403 });
    }
  }

  return null;
}
