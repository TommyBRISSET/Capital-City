import crypto from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DomainRuleError, applyGameAction, createDiceSequenceRng } from '@capital-city/game-engine';
import { createConfiguredPrismaClient } from '../../apps/realtime/src/infra/prisma';
import { GameRepository } from '../../apps/realtime/src/persistence/game-repository';

describe('PostgreSQL transactional persistence, idempotence and crash recovery', () => {
  let prisma: PrismaClient;
  let repo: GameRepository;

  beforeAll(async () => {
    prisma = createConfiguredPrismaClient();
    await prisma.$connect();
    repo = new GameRepository(prisma, { snapshotInterval: 2 });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('manages room lifecycle, host transfer, token uniqueness, game start, atomic transitions, idempotence, optimistic lock, and crash recovery', async () => {
    const hostUserId = crypto.randomUUID();
    const p2UserId = crypto.randomUUID();
    const p3UserId = crypto.randomUUID();

    // 1. Create room
    const created = await repo.createRoom({
      hostUserId,
      hostDisplayName: 'Alice Hôte',
      name: 'Salon Riviera Test',
      boardPackId: 'riviera-district',
      maxPlayers: 4,
      isPublic: true,
      tokenId: 'luxury-yacht',
      ruleset: { startingCash: 1600, auctionDurationSeconds: 20 },
    });
    expect(created.code).toMatch(/^RIV-[A-Z0-9]{4}$/);
    expect(created.players).toHaveLength(1);
    expect(created.players[0]!.isHost).toBe(true);

    // 2. Join P2 and P3
    await repo.joinRoom({
      code: created.code,
      userId: p2UserId,
      displayName: 'Bruno',
      preferredTokenId: 'luxury-yacht', // Already taken -> auto-picks another free token!
    });
    const afterP3 = await repo.joinRoom({
      code: created.code,
      userId: p3UserId,
      displayName: 'Chloé',
      preferredTokenId: 'solar-roadster',
    });
    expect(afterP3.players).toHaveLength(3);
    expect(afterP3.players[1]!.tokenId).not.toBe('luxury-yacht');
    expect(afterP3.players[2]!.tokenId).toBe('solar-roadster');

    // 3. Reject selecting an already-taken token
    await expect(
      repo.selectToken({
        code: created.code,
        userId: p2UserId,
        tokenId: 'solar-roadster',
      }),
    ).rejects.toThrow(DomainRuleError);

    // 4. Host leaves in WAITING -> Bruno becomes new host automatically!
    const afterHostLeave = await repo.leaveRoom({
      code: created.code,
      userId: hostUserId,
    });
    expect(afterHostLeave).not.toBeNull();
    expect(afterHostLeave!.hostId).toBe(p2UserId);
    expect(afterHostLeave!.players).toHaveLength(2);
    expect(afterHostLeave!.players[0]!.isHost).toBe(true);
    expect(afterHostLeave!.players[0]!.isReady).toBe(true);

    // 5. Reject starting before Chloé is ready
    await expect(
      repo.startNewGameFromRoom({
        code: created.code,
        actorUserId: p2UserId,
      }),
    ).rejects.toThrow(DomainRuleError);

    // 6. Chloé marks ready & new host Bruno starts game
    await repo.setReady({ code: created.code, userId: p3UserId, isReady: true });
    const started = await repo.startNewGameFromRoom({
      code: created.code,
      actorUserId: p2UserId,
      rng: createDiceSequenceRng([1, 2, 3, 4]),
      now: 1_700_000_000_000,
    });

    expect(started.room.status).toBe('IN_GAME');
    expect(started.gameState.version).toBe(1);
    expect(started.gameState.players).toHaveLength(2);
    expect(started.gameState.players[0]!.cash).toBe(1600);

    const gameId = started.gameState.id;
    const activePlayerId = started.gameState.currentPlayerId;

    // 7. Execute a dice roll (1+2 = space 3: propiedad achetable) & persist atomically
    const rollTransition = applyGameAction(
      started.gameState,
      activePlayerId,
      { type: 'turn:roll' },
      { rng: createDiceSequenceRng([1, 2]), now: 1_700_000_001_000 },
    );
    expect(rollTransition.state.phase).toBe('AWAITING_BUY_DECISION');

    const persistedRoll = await repo.persistGameTransition({
      gameId,
      expectedVersion: 1,
      commandId: 'cmd-roll-001',
      actorId: activePlayerId,
      commandType: 'turn:roll',
      nextState: rollTransition.state,
      domainEvents: rollTransition.events,
    });
    expect(persistedRoll.duplicate).toBe(false);
    expect(persistedRoll.state.version).toBe(2);

    // 8. Idempotency check: re-submitting identical commandId returns duplicate=true without re-mutating!
    const dupRoll = await repo.persistGameTransition({
      gameId,
      expectedVersion: 1,
      commandId: 'cmd-roll-001',
      actorId: activePlayerId,
      commandType: 'turn:roll',
      nextState: rollTransition.state,
      domainEvents: rollTransition.events,
    });
    expect(dupRoll.duplicate).toBe(true);
    expect(dupRoll.state.version).toBe(2);

    // 9. Optimistic concurrency check: submitting a new commandId with stale expectedVersion=1 throws STALE_STATE!
    await expect(
      repo.persistGameTransition({
        gameId,
        expectedVersion: 1,
        commandId: 'cmd-stale-002',
        actorId: activePlayerId,
        commandType: 'property:buy',
        nextState: rollTransition.state,
        domainEvents: [],
      }),
    ).rejects.toThrow(DomainRuleError);

    // 10. Purchase property on space 3 & verify relational AssetOwnership + Player cash + GameEvent + GameSnapshot
    const buyTransition = applyGameAction(
      persistedRoll.state,
      activePlayerId,
      { type: 'property:buy' },
      { rng: () => 0.2, now: 1_700_000_002_000 },
    );
    const persistedBuy = await repo.persistGameTransition({
      gameId,
      expectedVersion: 2,
      commandId: 'cmd-buy-003',
      actorId: activePlayerId,
      commandType: 'property:buy',
      nextState: buyTransition.state,
      domainEvents: buyTransition.events,
    });
    expect(persistedBuy.state.version).toBe(3);

    const dbAsset = await prisma.assetOwnership.findUnique({
      where: { gameId_spaceIndex: { gameId, spaceIndex: 3 } },
    });
    expect(dbAsset).not.toBeNull();
    expect(dbAsset!.ownerPlayerId).toBe(activePlayerId);

    const dbEvents = await prisma.gameEvent.findMany({
      where: { gameId },
      orderBy: { sequence: 'asc' },
    });
    expect(dbEvents.length).toBeGreaterThanOrEqual(3);
    expect(dbEvents[0]!.sequence).toBe(1);
    expect(dbEvents[1]!.sequence).toBe(2);

    const dbSnapshots = await prisma.gameSnapshot.findMany({
      where: { gameId },
      orderBy: { version: 'asc' },
    });
    // v1 initial + v2 (snapshotInterval = 2)
    expect(dbSnapshots.map((s) => s.version)).toContain(1);
    expect(dbSnapshots.map((s) => s.version)).toContain(2);

    // 11. Simulate server restart & crash recovery from PostgreSQL
    const freshRepo = new GameRepository(prisma);
    const recoveredList = await freshRepo.recoverActiveGames();
    const recoveredEntry = recoveredList.find((r) => r.roomCode === created.code);
    expect(recoveredEntry).toBeDefined();
    expect(recoveredEntry!.state.id).toBe(gameId);
    expect(recoveredEntry!.state.version).toBe(3);
    expect(recoveredEntry!.state.assets[3]!.ownerPlayerId).toBe(activePlayerId);
    expect(recoveredEntry!.state.eventDeckOrder).toHaveLength(16);
  });
});
