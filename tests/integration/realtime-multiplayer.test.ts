import crypto from 'node:crypto';
import type { AddressInfo } from 'node:net';
import type { PrismaClient } from '@prisma/client';
import { io as createClient, type Socket as ClientSocket } from 'socket.io-client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDiceSequenceRng } from '@capital-city/game-engine';
import type { PublicGameState, RoomSummary } from '@capital-city/shared';
import { signSessionToken } from '@capital-city/shared/session';
import { createRealtimeServer } from '../../apps/realtime/src/index';
import { createConfiguredPrismaClient } from '../../apps/realtime/src/infra/prisma';
import type { AckResponse } from '../../apps/realtime/src/room-manager';

const TEST_SECRET = 'integration-test-secret-with-at-least-32-bytes-key-999';

function emitAck<T>(
  socket: ClientSocket,
  event: string,
  payload: unknown,
): Promise<AckResponse<T>> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Timeout waiting for ACK on ${event}`));
    }, 8000);

    socket.emit(event, payload, (res: AckResponse<T>) => {
      clearTimeout(timeout);
      resolve(res);
    });
  });
}

function connectAuthenticatedClient(
  baseUrl: string,
  userId: string,
  displayName: string,
): Promise<ClientSocket> {
  return new Promise((resolve, reject) => {
    const token = signSessionToken(
      {
        userId,
        displayName,
        exp: Date.now() + 3600_000,
      },
      TEST_SECRET,
    );

    const client = createClient(baseUrl, {
      auth: { token },
      transports: ['websocket'],
      reconnection: false,
    });

    client.once('connect', () => resolve(client));
    client.once('connect_error', (err) => reject(err));
  });
}

describe('Authoritative Socket.IO multiplayer, reconnection and server restart recovery', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = createConfiguredPrismaClient();
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('rejects unauthenticated sockets and synchronizes 3 players across lobby, auction, trade, disconnect and server restart', async () => {
    // Sequence:
    // Setup shuffle uses rng calls, then rolls:
    // Let's use a deterministic dice sequence for rolls by wrapping rng after start!
    let useFixedDice = false;
    const fixedDiceRng = createDiceSequenceRng([
      1,
      2, // Turn 1 (p1): rolls 1+2 = 3 (achetable)
      2,
      4, // Turn 2 (p2): rolls 2+4 = 6 (achetable)
      1,
      3, // Turn 3 (p3 auto-pass roll): rolls 1+3 = 4 (Taxe)
    ]);

    const server1 = createRealtimeServer({
      prisma,
      sessionSecret: TEST_SECRET,
      corsOrigins: '*',
      disconnectGraceMsOverride: 180,
      rng: () => (useFixedDice ? fixedDiceRng() : 0.42),
    });

    await server1.initialize();
    await new Promise<void>((resolve) =>
      server1.httpServer.listen(0, '127.0.0.1', () => resolve()),
    );
    const port1 = (server1.httpServer.address() as AddressInfo).port;
    const url1 = `http://127.0.0.1:${port1}`;

    const openClients: ClientSocket[] = [];

    try {
      // 1. Unauthenticated connection must fail with UNAUTHORIZED
      await expect(
        new Promise((resolve, reject) => {
          const bad = createClient(url1, {
            auth: { token: 'forged.invalid.token' },
            transports: ['websocket'],
            reconnection: false,
          });
          bad.once('connect', () => {
            bad.disconnect();
            resolve('connected');
          });
          bad.once('connect_error', (err) => {
            bad.disconnect();
            reject(err);
          });
        }),
      ).rejects.toThrow(/UNAUTHORIZED/);

      // 2. Connect 3 authenticated players
      const u1 = crypto.randomUUID();
      const u2 = crypto.randomUUID();
      const u3 = crypto.randomUUID();

      const c1 = await connectAuthenticatedClient(url1, u1, 'Alice');
      const c2 = await connectAuthenticatedClient(url1, u2, 'Bruno');
      const c3 = await connectAuthenticatedClient(url1, u3, 'Chloé');
      openClients.push(c1, c2, c3);

      // 3. Create room (Alice) + Join (Bruno, Chloé) + Select token + Update rules + Chat
      const createRes = await emitAck<{ room: RoomSummary }>(c1, 'room:create', {
        name: 'Table Nova Pro',
        boardPackId: 'nova-frontier',
        maxPlayers: 4,
        isPublic: false,
        tokenId: 'orbital-shuttle',
      });
      expect(createRes.ok).toBe(true);
      const roomCode = createRes.data!.room.code;

      const join2 = await emitAck<{ room: RoomSummary }>(c2, 'room:join', {
        code: roomCode,
        tokenId: 'maglev-train',
      });
      expect(join2.ok).toBe(true);

      const join3 = await emitAck<{ room: RoomSummary }>(c3, 'room:join', {
        code: roomCode,
        tokenId: 'cyber-drone',
      });
      expect(join3.ok).toBe(true);
      expect(join3.data!.room.players).toHaveLength(3);

      const tokenChange = await emitAck<{ room: RoomSummary }>(c3, 'room:select-token', {
        roomCode,
        tokenId: 'emerald-vault',
      });
      expect(tokenChange.ok).toBe(true);

      const rulesUpdate = await emitAck<{ room: RoomSummary }>(c1, 'room:update-rules', {
        roomCode,
        ruleset: { disconnectPolicy: 'AUTO_PASS', startingCash: 1500 },
      });
      expect(rulesUpdate.ok).toBe(true);

      const chatAck = await emitAck(c2, 'chat:send', {
        roomCode,
        text: 'Prêt pour Nova Frontier !',
      });
      expect(chatAck.ok).toBe(true);

      // 4. Mark Bruno & Chloé ready, then Alice starts game
      await emitAck(c2, 'room:ready', { roomCode, isReady: true });
      await emitAck(c3, 'room:ready', { roomCode, isReady: true });

      const startRes = await emitAck<{ room: RoomSummary; gameSnapshot: PublicGameState }>(
        c1,
        'game:start',
        { roomCode },
      );
      expect(startRes.ok).toBe(true);

      let snap = startRes.data!.gameSnapshot;
      expect(snap.players).toHaveLength(3);
      // Security assertion: secret deck orders must NEVER be exposed in PublicGameState!
      expect('eventDeckOrder' in (snap as unknown as Record<string, unknown>)).toBe(false);
      expect(snap.eventDeckRemaining).toBe(16);

      // Map userId -> socket client
      const socketByUser = new Map<string, ClientSocket>([
        [u1, c1],
        [u2, c2],
        [u3, c3],
      ]);

      const p1 = snap.players.find((p) => p.id === snap.currentPlayerId)!;
      const p2 = snap.players.find(
        (p) => p.orderIndex === (p1.orderIndex + 1) % snap.players.length,
      )!;
      const p3 = snap.players.find(
        (p) => p.orderIndex === (p1.orderIndex + 2) % snap.players.length,
      )!;

      const s1 = socketByUser.get(p1.userId)!;
      const s2 = socketByUser.get(p2.userId)!;
      const s3 = socketByUser.get(p3.userId)!;

      useFixedDice = true;

      // 5. Out-of-turn action from p2 is rejected with NOT_YOUR_TURN
      const outOfTurn = await emitAck(s2, 'game:command', {
        commandId: 'cmd-illegal-roll',
        gameId: snap.id,
        expectedVersion: snap.version,
        action: { type: 'turn:roll' },
      });
      expect(outOfTurn.ok).toBe(false);
      expect(outOfTurn.error?.code).toBe('NOT_YOUR_TURN');

      // 6. Active player p1 rolls 1+2 = space 3 (achetable) via direct event alias 'turn:roll'
      const roll1 = await emitAck<{ snapshot: PublicGameState; duplicate: boolean }>(
        s1,
        'turn:roll',
        {
          commandId: 'cmd-mp-roll-1',
          gameId: snap.id,
          expectedVersion: snap.version,
        },
      );
      expect(roll1.ok).toBe(true);
      expect(roll1.data!.duplicate).toBe(false);
      snap = roll1.data!.snapshot;
      expect(snap.phase).toBe('AWAITING_BUY_DECISION');
      expect(snap.pendingBuySpaceIndex).toBe(3);

      // 7. Re-sending exact same commandId returns duplicate=true idempotently!
      const dupRoll1 = await emitAck<{ snapshot: PublicGameState; duplicate: boolean }>(
        s1,
        'turn:roll',
        {
          commandId: 'cmd-mp-roll-1',
          gameId: snap.id,
          expectedVersion: 1,
        },
      );
      expect(dupRoll1.ok).toBe(true);
      expect(dupRoll1.data!.duplicate).toBe(true);
      expect(dupRoll1.data!.snapshot.version).toBe(snap.version);

      // 8. p1 declines purchase -> opens real-time AUCTION; p2 bids 75, p1 & p3 pass -> p2 wins space 3!
      const declineRes = await emitAck<{ snapshot: PublicGameState }>(s1, 'game:command', {
        commandId: 'cmd-mp-decline-1',
        gameId: snap.id,
        expectedVersion: snap.version,
        action: { type: 'property:decline' },
      });
      snap = declineRes.data!.snapshot;
      expect(snap.phase).toBe('AUCTION');

      const bidRes = await emitAck<{ snapshot: PublicGameState }>(s2, 'game:command', {
        commandId: 'cmd-mp-bid-1',
        gameId: snap.id,
        expectedVersion: snap.version,
        action: { type: 'auction:bid', amount: 75 },
      });
      snap = bidRes.data!.snapshot;
      expect(snap.auction?.currentBid).toBe(75);

      const pass1 = await emitAck<{ snapshot: PublicGameState }>(s1, 'game:command', {
        commandId: 'cmd-mp-pass-1',
        gameId: snap.id,
        expectedVersion: snap.version,
        action: { type: 'auction:pass' },
      });
      snap = pass1.data!.snapshot;

      const pass3 = await emitAck<{ snapshot: PublicGameState }>(s3, 'game:command', {
        commandId: 'cmd-mp-pass-3',
        gameId: snap.id,
        expectedVersion: snap.version,
        action: { type: 'auction:pass' },
      });
      snap = pass3.data!.snapshot;
      expect(snap.phase).toBe('MANAGE_AND_END');
      expect(snap.assets[3]!.ownerPlayerId).toBe(p2.id);

      // 9. p1 ends turn -> p2 rolls 2+4 = space 6 & buys it -> proposes trade to p1 -> p1 accepts!
      snap = (
        await emitAck<{ snapshot: PublicGameState }>(s1, 'game:command', {
          commandId: 'cmd-mp-end-1',
          gameId: snap.id,
          expectedVersion: snap.version,
          action: { type: 'turn:end' },
        })
      ).data!.snapshot;
      expect(snap.currentPlayerId).toBe(p2.id);

      snap = (
        await emitAck<{ snapshot: PublicGameState }>(s2, 'game:command', {
          commandId: 'cmd-mp-roll-2',
          gameId: snap.id,
          expectedVersion: snap.version,
          action: { type: 'turn:roll' },
        })
      ).data!.snapshot;
      expect(snap.pendingBuySpaceIndex).toBe(6);

      snap = (
        await emitAck<{ snapshot: PublicGameState }>(s2, 'game:command', {
          commandId: 'cmd-mp-buy-2',
          gameId: snap.id,
          expectedVersion: snap.version,
          action: { type: 'property:buy' },
        })
      ).data!.snapshot;
      expect(snap.assets[6]!.ownerPlayerId).toBe(p2.id);

      snap = (
        await emitAck<{ snapshot: PublicGameState }>(s2, 'game:command', {
          commandId: 'cmd-mp-trade-prop',
          gameId: snap.id,
          expectedVersion: snap.version,
          action: {
            type: 'trade:propose',
            targetPlayerId: p1.id,
            offeredSpaceIndices: [3],
            requestedSpaceIndices: [],
            offeredCash: 0,
            requestedCash: 90,
            offeredJailCards: 0,
            requestedJailCards: 0,
            note: 'Cession du lot #3 contre 90 Cr',
          },
        })
      ).data!.snapshot;
      const tradeId = snap.trades[0]!.id;

      snap = (
        await emitAck<{ snapshot: PublicGameState }>(s1, 'game:command', {
          commandId: 'cmd-mp-trade-acc',
          gameId: snap.id,
          expectedVersion: snap.version,
          action: { type: 'trade:accept', tradeId },
        })
      ).data!.snapshot;
      expect(snap.assets[3]!.ownerPlayerId).toBe(p1.id);

      // 10. Disconnect p3 before p3's turn -> grace timer (180ms) auto-rolls for p3!
      s3.disconnect();
      snap = (
        await emitAck<{ snapshot: PublicGameState }>(s2, 'game:command', {
          commandId: 'cmd-mp-end-2',
          gameId: snap.id,
          expectedVersion: snap.version,
          action: { type: 'turn:end' },
        })
      ).data!.snapshot;
      expect(snap.currentPlayerId).toBe(p3.id);

      // Reconnect s3 quickly and verify full state resynchronization
      const s3Reconnected = await connectAuthenticatedClient(url1, p3.userId, p3.displayName);
      openClients.push(s3Reconnected);
      const rejoinRes = await emitAck<{
        room: RoomSummary;
        gameSnapshot: PublicGameState | null;
      }>(s3Reconnected, 'room:join', { code: roomCode });
      expect(rejoinRes.ok).toBe(true);
      expect(rejoinRes.data!.gameSnapshot?.id).toBe(snap.id);

      const savedVersionBeforeRestart = rejoinRes.data!.gameSnapshot!.version;
      const savedGameId = snap.id;

      // Disconnect clients and shut down server1 completely (simulate server crash/restart)
      for (const c of openClients) {
        c.disconnect();
      }
      openClients.length = 0;
      await server1.close();

      // 11. Boot brand new server2 instance against PostgreSQL and verify seamless recovery!
      const server2 = createRealtimeServer({
        prisma,
        sessionSecret: TEST_SECRET,
        corsOrigins: '*',
      });
      await server2.initialize();
      await new Promise<void>((resolve) =>
        server2.httpServer.listen(0, '127.0.0.1', () => resolve()),
      );
      const port2 = (server2.httpServer.address() as AddressInfo).port;
      const url2 = `http://127.0.0.1:${port2}`;

      try {
        const healthResp = await fetch(`${url2}/health`);
        expect(healthResp.status).toBe(200);
        const healthJson = (await healthResp.json()) as { status: string };
        expect(healthJson.status).toBe('ok');

        const c1AfterRestart = await connectAuthenticatedClient(url2, u1, 'Alice');
        const resumeRes = await emitAck<{
          room: RoomSummary | null;
          gameSnapshot: PublicGameState | null;
        }>(c1AfterRestart, 'game:resume', { roomCode });

        expect(resumeRes.ok).toBe(true);
        expect(resumeRes.data!.gameSnapshot).not.toBeNull();
        expect(resumeRes.data!.gameSnapshot!.id).toBe(savedGameId);
        expect(resumeRes.data!.gameSnapshot!.version).toBeGreaterThanOrEqual(
          savedVersionBeforeRestart,
        );
        expect(resumeRes.data!.gameSnapshot!.assets[3]!.ownerPlayerId).toBe(p1.id);
        expect(resumeRes.data!.gameSnapshot!.assets[6]!.ownerPlayerId).toBe(p2.id);

        c1AfterRestart.disconnect();
      } finally {
        await server2.close();
      }
    } finally {
      for (const c of openClients) {
        c.disconnect();
      }
      await server1.close();
    }
  });
});
