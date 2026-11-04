import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { SessionInitInputSchema } from '@capital-city/shared';
import { signSessionToken, verifySessionToken } from '@capital-city/shared/session';
import { prisma } from '@/lib/prisma';
import { verifyMutationSecurity } from '@/lib/request-security';

const COOKIE_NAME = process.env.SESSION_COOKIE_NAME || 'cc_session';
const MAX_AGE = Number(process.env.SESSION_MAX_AGE_SECONDS || 604800);

export async function GET() {
  const cookieStore = await cookies();
  const raw = cookieStore.get(COOKIE_NAME)?.value;
  const claims = verifySessionToken(raw);
  if (!claims || !raw) {
    return NextResponse.json({ authenticated: false, session: null });
  }

  return NextResponse.json({
    authenticated: true,
    session: {
      userId: claims.userId,
      displayName: claims.displayName,
      token: raw,
    },
  });
}

export async function POST(request: Request) {
  const secErr = verifyMutationSecurity(request);
  if (secErr) return secErr;
  try {
    const body: unknown = await request.json();
    const parsed = SessionInitInputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Données de session invalides' },
        { status: 400 },
      );
    }

    const cookieStore = await cookies();
    const existingToken = cookieStore.get(COOKIE_NAME)?.value;
    const existingClaims = verifySessionToken(existingToken);

    let userId = existingClaims?.userId;
    if (userId) {
      const existingUser = await prisma.user.findUnique({ where: { id: userId } });
      if (existingUser) {
        await prisma.user.update({
          where: { id: userId },
          data: {
            displayName: parsed.data.displayName,
            ...(parsed.data.avatar ? { avatar: parsed.data.avatar } : {}),
          },
        });
      } else {
        userId = undefined;
      }
    }

    if (!userId) {
      const created = await prisma.user.create({
        data: {
          displayName: parsed.data.displayName,
          avatar: parsed.data.avatar ?? 'skyline-tower',
          isGuest: true,
        },
      });
      userId = created.id;
    }

    const exp = Date.now() + MAX_AGE * 1000;
    const signedToken = signSessionToken({
      userId,
      displayName: parsed.data.displayName,
      exp,
    });

    cookieStore.set(COOKIE_NAME, signedToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: MAX_AGE,
    });

    return NextResponse.json({
      authenticated: true,
      session: {
        userId,
        displayName: parsed.data.displayName,
        token: signedToken,
      },
    });
  } catch (err) {
    console.error('[api/session] Error:', err);
    return NextResponse.json({ error: 'Erreur interne de session' }, { status: 500 });
  }
}
