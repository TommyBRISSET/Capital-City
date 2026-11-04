import crypto from 'node:crypto';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { ALL_BOARD_PACKS } from '@capital-city/board-packs';
import {
  RoomCreateInputSchema,
  RulesetConfigSchema,
  type LobbyPlayerSlot,
} from '@capital-city/shared';
import { verifySessionToken } from '@capital-city/shared/session';
import { prisma } from '@/lib/prisma';
import { verifyMutationSecurity } from '@/lib/request-security';

const COOKIE_NAME = process.env.SESSION_COOKIE_NAME || 'cc_session';

function generateRoomCode(packId: string): string {
  const prefix = packId === 'riviera-district' ? 'RIV' : packId === 'nova-frontier' ? 'NOV' : 'AST';
  const alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let suffix = '';
  for (let i = 0; i < 4; i++) {
    suffix += alphabet[crypto.randomInt(0, alphabet.length)];
  }
  return `${prefix}-${suffix}`;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code')?.trim().toUpperCase();

  if (code) {
    const room = await prisma.gameRoom.findUnique({
      where: { code },
      include: {
        games: {
          orderBy: { startedAt: 'desc' },
          take: 1,
          select: { id: true, status: true },
        },
      },
    });
    if (!room || room.status === 'CLOSED') {
      return NextResponse.json({ error: 'Code de salle introuvable' }, { status: 404 });
    }
    return NextResponse.json({
      room: {
        id: room.id,
        code: room.code,
        name: room.name,
        isPublic: room.isPublic,
        hostId: room.hostId,
        boardPackId: room.boardPackId,
        maxPlayers: room.maxPlayers,
        status: room.status,
        ruleset: room.rulesetConfig,
        players: room.lobbySlots,
        activeGameId: room.games[0]?.id ?? null,
        createdAt: room.createdAt.getTime(),
      },
    });
  }

  const publicRooms = await prisma.gameRoom.findMany({
    where: { isPublic: true, status: 'WAITING' },
    orderBy: { createdAt: 'desc' },
    take: 12,
  });

  return NextResponse.json({
    rooms: publicRooms.map((r) => ({
      id: r.id,
      code: r.code,
      name: r.name,
      boardPackId: r.boardPackId,
      maxPlayers: r.maxPlayers,
      playersCount: Array.isArray(r.lobbySlots) ? r.lobbySlots.length : 1,
      createdAt: r.createdAt.getTime(),
    })),
  });
}

export async function POST(request: Request) {
  const secErr = verifyMutationSecurity(request);
  if (secErr) return secErr;
  try {
    const cookieStore = await cookies();
    const rawToken = cookieStore.get(COOKIE_NAME)?.value;
    const claims = verifySessionToken(rawToken);
    if (!claims) {
      return NextResponse.json(
        { error: 'Session requise. Choisissez un pseudonyme avant de créer une salle.' },
        { status: 401 },
      );
    }

    const body: unknown = await request.json();
    const parsed = RoomCreateInputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Paramètres de salle invalides' },
        { status: 400 },
      );
    }

    const { name, boardPackId, maxPlayers, isPublic, tokenId, ruleset } = parsed.data;
    const fullRuleset = RulesetConfigSchema.parse(ruleset ?? {});

    await prisma.user.upsert({
      where: { id: claims.userId },
      update: { displayName: claims.displayName },
      create: {
        id: claims.userId,
        displayName: claims.displayName,
        avatar: tokenId ?? 'skyline-tower',
        isGuest: true,
      },
    });

    // S'assurer que le BoardPack existe en base même avant un seed manuel
    const packDef = ALL_BOARD_PACKS.find((p) => p.id === boardPackId);
    if (packDef) {
      await prisma.boardPack.upsert({
        where: { id: packDef.id },
        update: {},
        create: {
          id: packDef.id,
          name: packDef.name,
          subtitle: packDef.subtitle,
          description: packDef.description,
          language: packDef.language,
          version: packDef.version,
          theme: JSON.parse(JSON.stringify(packDef.theme)),
          cardsData: {},
        },
      });
    }

    let code = generateRoomCode(boardPackId);
    for (let attempt = 0; attempt < 5; attempt++) {
      const clash = await prisma.gameRoom.findUnique({ where: { code } });
      if (!clash) break;
      code = generateRoomCode(boardPackId);
    }

    const hostSlot: LobbyPlayerSlot = {
      userId: claims.userId,
      displayName: claims.displayName,
      tokenId: tokenId ?? 'skyline-tower',
      isReady: true,
      isHost: true,
      isConnected: true,
      joinedAt: Date.now(),
    };

    const created = await prisma.gameRoom.create({
      data: {
        code,
        name,
        isPublic,
        hostId: claims.userId,
        boardPackId,
        rulesetId: 'custom',
        rulesetConfig: JSON.parse(JSON.stringify(fullRuleset)),
        lobbySlots: JSON.parse(JSON.stringify([hostSlot])),
        status: 'WAITING',
        maxPlayers,
        expiresAt: new Date(Date.now() + 24 * 3600 * 1000),
      },
    });

    return NextResponse.json({
      room: {
        id: created.id,
        code: created.code,
        name: created.name,
        boardPackId: created.boardPackId,
        maxPlayers: created.maxPlayers,
      },
    });
  } catch (err) {
    console.error('[api/rooms] POST error:', err);
    return NextResponse.json({ error: 'Impossible de créer la salle' }, { status: 500 });
  }
}
