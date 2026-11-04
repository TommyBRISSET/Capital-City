import crypto from 'node:crypto';
import type { Prisma, PrismaClient } from '@prisma/client';
import { getBoardPack } from '@capital-city/board-packs';
import {
  DomainRuleError,
  createInitialGameState,
  type DomainEvent,
  type RngFn,
} from '@capital-city/game-engine';
import {
  RulesetConfigSchema,
  TOKEN_IDS,
  type BoardPackId,
  type GameState,
  type LobbyPlayerSlot,
  type RoomSummary,
  type RulesetConfig,
  type TokenId,
} from '@capital-city/shared';

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function generateInviteCode(packId: BoardPackId): string {
  const prefix = packId === 'riviera-district' ? 'RIV' : packId === 'nova-frontier' ? 'NOV' : 'AST';
  const alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let suffix = '';
  for (let i = 0; i < 4; i++) {
    suffix += alphabet[crypto.randomInt(0, alphabet.length)];
  }
  return `${prefix}-${suffix}`;
}

function parseLobbySlots(raw: Prisma.JsonValue): LobbyPlayerSlot[] {
  if (!Array.isArray(raw)) return [];
  return raw as unknown as LobbyPlayerSlot[];
}

function parseRuleset(raw: Prisma.JsonValue): RulesetConfig {
  return RulesetConfigSchema.parse(raw ?? {});
}

function pickFirstAvailableToken(takenTokens: Set<TokenId>, preferred?: TokenId): TokenId {
  if (preferred && !takenTokens.has(preferred)) {
    return preferred;
  }
  for (const candidate of TOKEN_IDS) {
    if (!takenTokens.has(candidate)) {
      return candidate;
    }
  }
  throw new DomainRuleError('TOKEN_ALREADY_TAKEN', 'Aucun pion disponible dans cette salle.');
}

export interface CreateRoomParams {
  hostUserId: string;
  hostDisplayName: string;
  name: string;
  boardPackId: BoardPackId;
  maxPlayers?: number;
  isPublic?: boolean;
  tokenId?: TokenId;
  ruleset?: Partial<RulesetConfig>;
}

export interface PersistTransitionParams {
  gameId: string;
  expectedVersion: number;
  commandId: string;
  actorId: string;
  commandType: string;
  nextState: GameState;
  domainEvents: DomainEvent[];
}

export interface PersistTransitionResult {
  duplicate: boolean;
  state: GameState;
}

export class GameRepository {
  private readonly snapshotInterval: number;

  constructor(
    private readonly prisma: PrismaClient,
    options?: { snapshotInterval?: number },
  ) {
    this.snapshotInterval = Math.max(
      1,
      options?.snapshotInterval ?? Number(process.env.SNAPSHOT_EVERY_EVENTS || 5),
    );
  }

  async ensureUser(userId: string, displayName: string, avatar: TokenId = 'skyline-tower') {
    await this.prisma.user.upsert({
      where: { id: userId },
      update: { displayName },
      create: {
        id: userId,
        displayName,
        avatar,
        isGuest: true,
      },
    });
  }

  async ensureBoardPack(boardPackId: BoardPackId) {
    const pack = getBoardPack(boardPackId);
    await this.prisma.boardPack.upsert({
      where: { id: pack.id },
      update: {},
      create: {
        id: pack.id,
        name: pack.name,
        subtitle: pack.subtitle,
        description: pack.description,
        language: pack.language,
        version: pack.version,
        theme: toJson(pack.theme),
        cardsData: toJson({
          eventCards: pack.eventCards,
          communityCards: pack.communityCards,
        }),
      },
    });
  }

  async createRoom(params: CreateRoomParams): Promise<RoomSummary> {
    const maxPlayers = params.maxPlayers ?? 4;
    if (maxPlayers < 2 || maxPlayers > 8) {
      throw new DomainRuleError('INVALID_PLAYER_COUNT', 'Une salle accepte entre 2 et 8 joueurs.');
    }

    const token = params.tokenId ?? 'skyline-tower';
    await this.ensureUser(params.hostUserId, params.hostDisplayName, token);
    await this.ensureBoardPack(params.boardPackId);

    let code = generateInviteCode(params.boardPackId);
    for (let attempt = 0; attempt < 6; attempt++) {
      const existing = await this.prisma.gameRoom.findUnique({ where: { code } });
      if (!existing) break;
      code = generateInviteCode(params.boardPackId);
    }

    const ruleset = RulesetConfigSchema.parse(params.ruleset ?? {});
    const hostSlot: LobbyPlayerSlot = {
      userId: params.hostUserId,
      displayName: params.hostDisplayName,
      tokenId: token,
      isReady: true,
      isHost: true,
      isConnected: true,
      joinedAt: Date.now(),
    };

    const room = await this.prisma.gameRoom.create({
      data: {
        code,
        name: params.name,
        isPublic: params.isPublic ?? false,
        hostId: params.hostUserId,
        boardPackId: params.boardPackId,
        rulesetId: 'custom',
        rulesetConfig: toJson(ruleset),
        lobbySlots: toJson([hostSlot]),
        status: 'WAITING',
        maxPlayers,
        expiresAt: new Date(Date.now() + 24 * 3600 * 1000),
      },
    });

    return {
      id: room.id,
      code: room.code,
      name: room.name,
      isPublic: room.isPublic,
      hostId: room.hostId,
      boardPackId: room.boardPackId as BoardPackId,
      maxPlayers: room.maxPlayers,
      status: room.status,
      ruleset,
      players: [hostSlot],
      activeGameId: null,
      createdAt: room.createdAt.getTime(),
    };
  }

  async getRoomSummary(rawCode: string): Promise<RoomSummary | null> {
    const code = rawCode.trim().toUpperCase();
    const room = await this.prisma.gameRoom.findUnique({
      where: { code },
      include: {
        games: {
          orderBy: { startedAt: 'desc' },
          take: 1,
          select: { id: true },
        },
      },
    });
    if (!room || room.status === 'CLOSED') {
      return null;
    }

    return {
      id: room.id,
      code: room.code,
      name: room.name,
      isPublic: room.isPublic,
      hostId: room.hostId,
      boardPackId: room.boardPackId as BoardPackId,
      maxPlayers: room.maxPlayers,
      status: room.status,
      ruleset: parseRuleset(room.rulesetConfig),
      players: parseLobbySlots(room.lobbySlots),
      activeGameId: room.games[0]?.id ?? null,
      createdAt: room.createdAt.getTime(),
    };
  }

  async joinRoom(params: {
    code: string;
    userId: string;
    displayName: string;
    preferredTokenId?: TokenId;
  }): Promise<RoomSummary> {
    const code = params.code.trim().toUpperCase();
    const room = await this.prisma.gameRoom.findUnique({
      where: { code },
      include: {
        games: {
          orderBy: { startedAt: 'desc' },
          take: 1,
          select: { id: true },
        },
      },
    });

    if (!room || room.status === 'CLOSED') {
      throw new DomainRuleError('INVALID_PHASE', `Salle ${code} introuvable ou fermée.`);
    }

    await this.ensureUser(params.userId, params.displayName, params.preferredTokenId);

    const slots = parseLobbySlots(room.lobbySlots);
    const existingSlot = slots.find((s) => s.userId === params.userId);

    if (existingSlot) {
      existingSlot.isConnected = true;
      existingSlot.displayName = params.displayName;
      await this.prisma.gameRoom.update({
        where: { id: room.id },
        data: { lobbySlots: toJson(slots) },
      });
      return {
        id: room.id,
        code: room.code,
        name: room.name,
        isPublic: room.isPublic,
        hostId: room.hostId,
        boardPackId: room.boardPackId as BoardPackId,
        maxPlayers: room.maxPlayers,
        status: room.status,
        ruleset: parseRuleset(room.rulesetConfig),
        players: slots,
        activeGameId: room.games[0]?.id ?? null,
        createdAt: room.createdAt.getTime(),
      };
    }

    if (room.status !== 'WAITING') {
      throw new DomainRuleError(
        'GAME_NOT_ACTIVE',
        'Cette partie a déjà commencé : seuls les joueurs inscrits peuvent s’y reconnecter.',
      );
    }

    if (slots.length >= room.maxPlayers) {
      throw new DomainRuleError(
        'INVALID_PLAYER_COUNT',
        `Cette salle est complète (${room.maxPlayers}/${room.maxPlayers} joueurs).`,
      );
    }

    const takenTokens = new Set<TokenId>(slots.map((s) => s.tokenId));
    const chosenToken = pickFirstAvailableToken(takenTokens, params.preferredTokenId);

    const newSlot: LobbyPlayerSlot = {
      userId: params.userId,
      displayName: params.displayName,
      tokenId: chosenToken,
      isReady: false,
      isHost: false,
      isConnected: true,
      joinedAt: Date.now(),
    };

    const nextSlots = [...slots, newSlot];
    await this.prisma.gameRoom.update({
      where: { id: room.id },
      data: { lobbySlots: toJson(nextSlots) },
    });

    return {
      id: room.id,
      code: room.code,
      name: room.name,
      isPublic: room.isPublic,
      hostId: room.hostId,
      boardPackId: room.boardPackId as BoardPackId,
      maxPlayers: room.maxPlayers,
      status: room.status,
      ruleset: parseRuleset(room.rulesetConfig),
      players: nextSlots,
      activeGameId: room.games[0]?.id ?? null,
      createdAt: room.createdAt.getTime(),
    };
  }

  async leaveRoom(params: { code: string; userId: string }): Promise<RoomSummary | null> {
    const code = params.code.trim().toUpperCase();
    const room = await this.prisma.gameRoom.findUnique({
      where: { code },
      include: {
        games: {
          orderBy: { startedAt: 'desc' },
          take: 1,
          select: { id: true },
        },
      },
    });
    if (!room || room.status === 'CLOSED') return null;

    const slots = parseLobbySlots(room.lobbySlots);

    // En salle d'attente : retrait complet et transfert automatique de l'hôte si nécessaire
    if (room.status === 'WAITING') {
      const remaining = slots.filter((s) => s.userId !== params.userId);
      if (remaining.length === 0) {
        await this.prisma.gameRoom.update({
          where: { id: room.id },
          data: { status: 'CLOSED', lobbySlots: toJson([]) },
        });
        return null;
      }

      let nextHostId = room.hostId;
      if (room.hostId === params.userId) {
        const promoted = remaining[0]!;
        promoted.isHost = true;
        promoted.isReady = true;
        nextHostId = promoted.userId;
      }

      await this.prisma.gameRoom.update({
        where: { id: room.id },
        data: {
          hostId: nextHostId,
          lobbySlots: toJson(remaining),
        },
      });

      return {
        id: room.id,
        code: room.code,
        name: room.name,
        isPublic: room.isPublic,
        hostId: nextHostId,
        boardPackId: room.boardPackId as BoardPackId,
        maxPlayers: room.maxPlayers,
        status: room.status,
        ruleset: parseRuleset(room.rulesetConfig),
        players: remaining,
        activeGameId: room.games[0]?.id ?? null,
        createdAt: room.createdAt.getTime(),
      };
    }

    // En cours de partie : marquer le slot déconnecté tout en conservant sa place pour la reconnexion
    const target = slots.find((s) => s.userId === params.userId);
    if (target) {
      target.isConnected = false;
      await this.prisma.gameRoom.update({
        where: { id: room.id },
        data: { lobbySlots: toJson(slots) },
      });
    }

    return {
      id: room.id,
      code: room.code,
      name: room.name,
      isPublic: room.isPublic,
      hostId: room.hostId,
      boardPackId: room.boardPackId as BoardPackId,
      maxPlayers: room.maxPlayers,
      status: room.status,
      ruleset: parseRuleset(room.rulesetConfig),
      players: slots,
      activeGameId: room.games[0]?.id ?? null,
      createdAt: room.createdAt.getTime(),
    };
  }

  async selectToken(params: {
    code: string;
    userId: string;
    tokenId: TokenId;
  }): Promise<RoomSummary> {
    const code = params.code.trim().toUpperCase();
    const room = await this.prisma.gameRoom.findUnique({ where: { code } });
    if (!room || room.status !== 'WAITING') {
      throw new DomainRuleError(
        'INVALID_PHASE',
        'Le choix du pion est uniquement modifiable dans le salon d’attente.',
      );
    }

    const slots = parseLobbySlots(room.lobbySlots);
    const me = slots.find((s) => s.userId === params.userId);
    if (!me) {
      throw new DomainRuleError('PLAYER_NOT_FOUND', 'Vous ne faites pas partie de cette salle.');
    }

    const collision = slots.some((s) => s.userId !== params.userId && s.tokenId === params.tokenId);
    if (collision) {
      throw new DomainRuleError(
        'TOKEN_ALREADY_TAKEN',
        'Ce pion est déjà sélectionné par un autre joueur de la salle.',
      );
    }

    me.tokenId = params.tokenId;
    await this.prisma.gameRoom.update({
      where: { id: room.id },
      data: { lobbySlots: toJson(slots) },
    });

    return {
      id: room.id,
      code: room.code,
      name: room.name,
      isPublic: room.isPublic,
      hostId: room.hostId,
      boardPackId: room.boardPackId as BoardPackId,
      maxPlayers: room.maxPlayers,
      status: room.status,
      ruleset: parseRuleset(room.rulesetConfig),
      players: slots,
      activeGameId: null,
      createdAt: room.createdAt.getTime(),
    };
  }

  async setReady(params: { code: string; userId: string; isReady: boolean }): Promise<RoomSummary> {
    const code = params.code.trim().toUpperCase();
    const room = await this.prisma.gameRoom.findUnique({ where: { code } });
    if (!room || room.status !== 'WAITING') {
      throw new DomainRuleError('INVALID_PHASE', 'La salle n’est plus en attente.');
    }

    const slots = parseLobbySlots(room.lobbySlots);
    const me = slots.find((s) => s.userId === params.userId);
    if (!me) {
      throw new DomainRuleError('PLAYER_NOT_FOUND', 'Vous ne faites pas partie de cette salle.');
    }

    me.isReady = me.isHost ? true : params.isReady;
    await this.prisma.gameRoom.update({
      where: { id: room.id },
      data: { lobbySlots: toJson(slots) },
    });

    return {
      id: room.id,
      code: room.code,
      name: room.name,
      isPublic: room.isPublic,
      hostId: room.hostId,
      boardPackId: room.boardPackId as BoardPackId,
      maxPlayers: room.maxPlayers,
      status: room.status,
      ruleset: parseRuleset(room.rulesetConfig),
      players: slots,
      activeGameId: null,
      createdAt: room.createdAt.getTime(),
    };
  }

  async updateRoomRules(params: {
    code: string;
    actorUserId: string;
    boardPackId?: BoardPackId;
    maxPlayers?: number;
    ruleset?: Partial<RulesetConfig>;
  }): Promise<RoomSummary> {
    const code = params.code.trim().toUpperCase();
    const room = await this.prisma.gameRoom.findUnique({ where: { code } });
    if (!room || room.status !== 'WAITING') {
      throw new DomainRuleError(
        'INVALID_PHASE',
        'Les paramètres de salle ne peuvent être modifiés qu’avant le lancement.',
      );
    }

    if (room.hostId !== params.actorUserId) {
      throw new DomainRuleError(
        'PERMISSION_DENIED',
        'Seul l’hôte de la salle peut modifier la configuration.',
      );
    }

    const slots = parseLobbySlots(room.lobbySlots);
    const nextMaxPlayers = params.maxPlayers ?? room.maxPlayers;
    if (nextMaxPlayers < slots.length || nextMaxPlayers < 2 || nextMaxPlayers > 8) {
      throw new DomainRuleError(
        'INVALID_PLAYER_COUNT',
        `Le nombre maximum de joueurs doit être compris entre ${Math.max(2, slots.length)} et 8.`,
      );
    }

    const nextBoardPackId = params.boardPackId ?? (room.boardPackId as BoardPackId);
    if (params.boardPackId) {
      await this.ensureBoardPack(params.boardPackId);
    }

    const currentRules = parseRuleset(room.rulesetConfig);
    const mergedRules = RulesetConfigSchema.parse({
      ...currentRules,
      ...(params.ruleset ?? {}),
    });

    await this.prisma.gameRoom.update({
      where: { id: room.id },
      data: {
        boardPackId: nextBoardPackId,
        maxPlayers: nextMaxPlayers,
        rulesetConfig: toJson(mergedRules),
      },
    });

    return {
      id: room.id,
      code: room.code,
      name: room.name,
      isPublic: room.isPublic,
      hostId: room.hostId,
      boardPackId: nextBoardPackId,
      maxPlayers: nextMaxPlayers,
      status: room.status,
      ruleset: mergedRules,
      players: slots,
      activeGameId: null,
      createdAt: room.createdAt.getTime(),
    };
  }

  async resetRoomForRematch(params: { code: string; actorUserId: string }): Promise<RoomSummary> {
    const code = params.code.trim().toUpperCase();
    const room = await this.prisma.gameRoom.findUnique({ where: { code } });
    if (!room) {
      throw new DomainRuleError('INVALID_PHASE', 'Salle introuvable.');
    }
    if (room.hostId !== params.actorUserId) {
      throw new DomainRuleError('PERMISSION_DENIED', 'Seul l’hôte peut préparer une revanche.');
    }
    if (room.status !== 'FINISHED') {
      throw new DomainRuleError(
        'INVALID_PHASE',
        'Une revanche ne peut être proposée qu’une fois la partie terminée.',
      );
    }

    const slots = parseLobbySlots(room.lobbySlots).map((s) => ({
      ...s,
      isReady: s.userId === room.hostId,
    }));

    await this.prisma.gameRoom.update({
      where: { id: room.id },
      data: {
        status: 'WAITING',
        lobbySlots: toJson(slots),
      },
    });

    return {
      id: room.id,
      code: room.code,
      name: room.name,
      isPublic: room.isPublic,
      hostId: room.hostId,
      boardPackId: room.boardPackId as BoardPackId,
      maxPlayers: room.maxPlayers,
      status: 'WAITING',
      ruleset: parseRuleset(room.rulesetConfig),
      players: slots,
      activeGameId: null,
      createdAt: room.createdAt.getTime(),
    };
  }

  async startNewGameFromRoom(params: {
    code: string;
    actorUserId: string;
    rng?: RngFn;
    now?: number;
  }): Promise<{ room: RoomSummary; gameState: GameState }> {
    const code = params.code.trim().toUpperCase();
    const room = await this.prisma.gameRoom.findUnique({ where: { code } });
    if (!room || room.status !== 'WAITING') {
      throw new DomainRuleError('INVALID_PHASE', 'Cette salle ne peut pas démarrer une partie.');
    }

    if (room.hostId !== params.actorUserId) {
      throw new DomainRuleError('PERMISSION_DENIED', 'Seul l’hôte peut lancer la partie.');
    }

    const slots = parseLobbySlots(room.lobbySlots);
    if (slots.length < 2 || slots.length > room.maxPlayers) {
      throw new DomainRuleError(
        'INVALID_PLAYER_COUNT',
        'Il faut au moins 2 joueurs présents dans la salle pour lancer la partie.',
      );
    }

    const unready = slots.filter((s) => !s.isHost && !s.isReady);
    if (unready.length > 0) {
      throw new DomainRuleError(
        'INVALID_PHASE',
        `Tous les joueurs doivent être prêts (${unready.map((u) => u.displayName).join(', ')}).`,
      );
    }

    const ruleset = parseRuleset(room.rulesetConfig);
    const boardPackId = room.boardPackId as BoardPackId;
    const pack = getBoardPack(boardPackId);
    await this.ensureBoardPack(boardPackId);

    for (const s of slots) {
      await this.ensureUser(s.userId, s.displayName, s.tokenId);
    }

    const gameId = crypto.randomUUID();
    const now = params.now ?? Date.now();
    const rng: RngFn = params.rng ?? (() => crypto.randomInt(0, 1_000_000) / 1_000_000);

    const playerSeeds = slots.map((s) => ({
      id: crypto.randomUUID(),
      userId: s.userId,
      displayName: s.displayName,
      tokenId: s.tokenId,
    }));

    const initialState = createInitialGameState({
      gameId,
      roomId: room.id,
      boardPackId,
      players: playerSeeds,
      ruleset,
      rng,
      now,
    });

    const eventCardMap = new Map(pack.eventCards.map((c) => [c.id, c]));
    const communityCardMap = new Map(pack.communityCards.map((c) => [c.id, c]));

    const deckRows: Prisma.CardDeckCreateManyInput[] = [
      ...initialState.eventDeckOrder.map((cardId, idx) => {
        const def = eventCardMap.get(cardId)!;
        return {
          gameId,
          deckType: 'EVENT' as const,
          cardId,
          orderIndex: idx,
          effectType: def.effect.type,
          effectPayload: toJson(def.effect),
          isHeld: false,
          heldByPlayerId: null,
        };
      }),
      ...initialState.communityDeckOrder.map((cardId, idx) => {
        const def = communityCardMap.get(cardId)!;
        return {
          gameId,
          deckType: 'COMMUNITY' as const,
          cardId,
          orderIndex: idx,
          effectType: def.effect.type,
          effectPayload: toJson(def.effect),
          isHeld: false,
          heldByPlayerId: null,
        };
      }),
    ];

    await this.prisma.$transaction([
      this.prisma.game.create({
        data: {
          id: gameId,
          roomId: room.id,
          boardPackId,
          status: 'ACTIVE',
          currentPlayerId: initialState.currentPlayerId,
          currentPhase: initialState.phase,
          turnNumber: 1,
          version: 1,
          stateSnapshot: toJson(initialState),
          startedAt: new Date(now),
        },
      }),
      this.prisma.player.createMany({
        data: initialState.players.map((p) => ({
          id: p.id,
          gameId,
          userId: p.userId,
          displayName: p.displayName,
          tokenId: p.tokenId,
          orderIndex: p.orderIndex,
          cash: p.cash,
          position: p.position,
          inJail: p.inJail,
          jailTurns: p.jailTurns,
          heldJailCards: p.heldCards.length,
          bankruptcyStatus: p.bankruptcyStatus,
          isConnected: p.isConnected,
        })),
      }),
      this.prisma.cardDeck.createMany({
        data: deckRows,
      }),
      this.prisma.gameEvent.create({
        data: {
          gameId,
          sequence: 1,
          actorId: params.actorUserId,
          eventType: 'game:started',
          payload: toJson({
            boardPackId,
            playersCount: initialState.players.length,
            firstPlayerId: initialState.currentPlayerId,
          }),
        },
      }),
      this.prisma.gameSnapshot.create({
        data: {
          gameId,
          version: 1,
          serializedState: toJson(initialState),
        },
      }),
      this.prisma.gameRoom.update({
        where: { id: room.id },
        data: { status: 'IN_GAME' },
      }),
    ]);

    const updatedRoom: RoomSummary = {
      id: room.id,
      code: room.code,
      name: room.name,
      isPublic: room.isPublic,
      hostId: room.hostId,
      boardPackId,
      maxPlayers: room.maxPlayers,
      status: 'IN_GAME',
      ruleset,
      players: slots,
      activeGameId: gameId,
      createdAt: room.createdAt.getTime(),
    };

    return { room: updatedRoom, gameState: initialState };
  }

  async persistGameTransition(params: PersistTransitionParams): Promise<PersistTransitionResult> {
    // 1. Contrôle d'idempotence (clé commandId unique par partie)
    const alreadyProcessed = await this.prisma.processedCommand.findUnique({
      where: {
        gameId_commandId: {
          gameId: params.gameId,
          commandId: params.commandId,
        },
      },
    });

    if (alreadyProcessed) {
      const existing = await this.loadGameById(params.gameId);
      if (!existing) {
        throw new DomainRuleError('GAME_NOT_ACTIVE', 'Partie introuvable.');
      }
      return { duplicate: true, state: existing };
    }

    // 2. Lecture de la dernière séquence d'événement persistée pour continuité stricte
    const lastEvent = await this.prisma.gameEvent.findFirst({
      where: { gameId: params.gameId },
      orderBy: { sequence: 'desc' },
      select: { sequence: true },
    });
    let nextSeq = (lastEvent?.sequence ?? 0) + 1;

    // 3. Verrouillage optimiste atomique sur Game.version
    const lockUpdate = await this.prisma.game.updateMany({
      where: {
        id: params.gameId,
        version: params.expectedVersion,
      },
      data: {
        version: params.nextState.version,
        status: params.nextState.status,
        currentPlayerId: params.nextState.currentPlayerId,
        currentPhase: params.nextState.phase,
        turnNumber: params.nextState.turnNumber,
        winnerPlayerId: params.nextState.winnerPlayerId,
        endedAt: params.nextState.endedAt ? new Date(params.nextState.endedAt) : null,
        stateSnapshot: toJson(params.nextState),
      },
    });

    if (lockUpdate.count !== 1) {
      throw new DomainRuleError(
        'STALE_STATE',
        `Conflit de version détecté (version attendue : ${params.expectedVersion}). Veuillez resynchroniser l’état.`,
      );
    }

    const pack = getBoardPack(params.nextState.boardPackId);
    const ownedAssets = Object.values(params.nextState.assets).filter(
      (a) => a.ownerPlayerId !== null,
    );
    const unownedIndices = Object.values(params.nextState.assets)
      .filter((a) => a.ownerPlayerId === null)
      .map((a) => a.spaceIndex);

    const heldCardOwners = new Map<string, string>();
    for (const p of params.nextState.players) {
      for (const hc of p.heldCards) {
        heldCardOwners.set(hc.cardId, p.id);
      }
    }

    const ops: Prisma.PrismaPromise<unknown>[] = [
      this.prisma.processedCommand.create({
        data: {
          gameId: params.gameId,
          commandId: params.commandId,
          actorId: params.actorId,
          commandType: params.commandType,
          resultVersion: params.nextState.version,
        },
      }),
    ];

    // Synchroniser les joueurs
    for (const p of params.nextState.players) {
      ops.push(
        this.prisma.player.update({
          where: { id: p.id },
          data: {
            cash: p.cash,
            position: p.position,
            inJail: p.inJail,
            jailTurns: p.jailTurns,
            heldJailCards: p.heldCards.length,
            bankruptcyStatus: p.bankruptcyStatus,
            isConnected: p.isConnected,
            disconnectedAt: p.disconnectedAt ? new Date(p.disconnectedAt) : null,
          },
        }),
      );
    }

    // Nettoyer les propriétés retournées à la banque
    if (unownedIndices.length > 0) {
      ops.push(
        this.prisma.assetOwnership.deleteMany({
          where: {
            gameId: params.gameId,
            spaceIndex: { in: unownedIndices },
          },
        }),
      );
    }

    // Upsert des propriétés détenues
    for (const asset of ownedAssets) {
      const spaceDef = pack.spaces[asset.spaceIndex]!;
      ops.push(
        this.prisma.assetOwnership.upsert({
          where: {
            gameId_spaceIndex: {
              gameId: params.gameId,
              spaceIndex: asset.spaceIndex,
            },
          },
          update: {
            ownerPlayerId: asset.ownerPlayerId!,
            isMortgaged: asset.isMortgaged,
            houseCount: asset.houseCount,
            hotelCount: asset.hotelCount,
          },
          create: {
            gameId: params.gameId,
            spaceIndex: asset.spaceIndex,
            assetId: spaceDef.id,
            ownerPlayerId: asset.ownerPlayerId!,
            isMortgaged: asset.isMortgaged,
            houseCount: asset.houseCount,
            hotelCount: asset.hotelCount,
          },
        }),
      );
    }

    // Synchroniser les offres d'échange
    for (const trade of params.nextState.trades) {
      ops.push(
        this.prisma.tradeOffer.upsert({
          where: { id: trade.id },
          update: {
            status: trade.status,
          },
          create: {
            id: trade.id,
            gameId: params.gameId,
            proposerId: trade.proposerId,
            targetId: trade.targetId,
            offeredAssets: toJson(trade.offeredSpaceIndices),
            requestedAssets: toJson(trade.requestedSpaceIndices),
            offeredCash: trade.offeredCash,
            requestedCash: trade.requestedCash,
            offeredCards: trade.offeredJailCards,
            requestedCards: trade.requestedJailCards,
            cashDelta: trade.offeredCash - trade.requestedCash,
            status: trade.status,
            createdAt: new Date(trade.createdAt),
          },
        }),
      );
    }

    // Mettre à jour le statut des cartes conservées
    ops.push(
      this.prisma.cardDeck.updateMany({
        where: {
          gameId: params.gameId,
          cardId: { notIn: [...heldCardOwners.keys()] },
          isHeld: true,
        },
        data: {
          isHeld: false,
          heldByPlayerId: null,
        },
      }),
    );

    for (const [cardId, ownerPlayerId] of heldCardOwners.entries()) {
      ops.push(
        this.prisma.cardDeck.updateMany({
          where: {
            gameId: params.gameId,
            cardId,
          },
          data: {
            isHeld: true,
            heldByPlayerId: ownerPlayerId,
          },
        }),
      );
    }

    // Journaliser les événements métier dans GameEvent (append-only)
    const eventsToWrite =
      params.domainEvents.length > 0
        ? params.domainEvents
        : [
            {
              type: params.commandType,
              actorId: params.actorId,
              payload: { version: params.nextState.version },
            },
          ];

    ops.push(
      this.prisma.gameEvent.createMany({
        data: eventsToWrite.map((ev) => ({
          gameId: params.gameId,
          sequence: nextSeq++,
          actorId: ev.actorId,
          eventType: ev.type,
          payload: toJson(ev.payload),
        })),
      }),
    );

    // Snapshot périodique + snapshot final systématique
    const shouldWriteSnapshot =
      params.nextState.version % this.snapshotInterval === 0 ||
      params.nextState.status === 'FINISHED';

    if (shouldWriteSnapshot) {
      ops.push(
        this.prisma.gameSnapshot.upsert({
          where: {
            gameId_version: {
              gameId: params.gameId,
              version: params.nextState.version,
            },
          },
          update: {
            serializedState: toJson(params.nextState),
          },
          create: {
            gameId: params.gameId,
            version: params.nextState.version,
            serializedState: toJson(params.nextState),
          },
        }),
      );
    }

    // Aligner le statut de la salle GameRoom
    const roomStatus =
      params.nextState.status === 'FINISHED'
        ? 'FINISHED'
        : params.nextState.status === 'PAUSED'
          ? 'PAUSED'
          : 'IN_GAME';

    ops.push(
      this.prisma.gameRoom.update({
        where: { id: params.nextState.roomId },
        data: { status: roomStatus },
      }),
    );

    await this.prisma.$transaction(ops);

    return { duplicate: false, state: params.nextState };
  }

  async updatePlayerPresence(params: {
    gameId: string;
    roomCode: string;
    userId: string;
    isConnected: boolean;
    now?: number;
  }): Promise<GameState | null> {
    const now = params.now ?? Date.now();
    const game = await this.prisma.game.findUnique({ where: { id: params.gameId } });
    if (!game) return null;

    const state = game.stateSnapshot as unknown as GameState;
    const player = state.players.find((p) => p.userId === params.userId);
    if (!player) return state;

    player.isConnected = params.isConnected;
    player.disconnectedAt = params.isConnected ? null : now;

    const room = await this.prisma.gameRoom.findUnique({
      where: { code: params.roomCode.trim().toUpperCase() },
    });

    const ops: Prisma.PrismaPromise<unknown>[] = [
      this.prisma.game.update({
        where: { id: game.id },
        data: { stateSnapshot: toJson(state) },
      }),
      this.prisma.player.update({
        where: { id: player.id },
        data: {
          isConnected: params.isConnected,
          disconnectedAt: params.isConnected ? null : new Date(now),
          ...(params.isConnected ? { connectedAt: new Date(now) } : {}),
        },
      }),
    ];

    if (room) {
      const slots = parseLobbySlots(room.lobbySlots);
      const slot = slots.find((s) => s.userId === params.userId);
      if (slot) {
        slot.isConnected = params.isConnected;
        ops.push(
          this.prisma.gameRoom.update({
            where: { id: room.id },
            data: { lobbySlots: toJson(slots) },
          }),
        );
      }
    }

    await this.prisma.$transaction(ops);
    return state;
  }

  async loadGameById(gameId: string): Promise<GameState | null> {
    const game = await this.prisma.game.findUnique({
      where: { id: gameId },
      select: { stateSnapshot: true },
    });
    if (!game) return null;
    return game.stateSnapshot as unknown as GameState;
  }

  async loadLatestGameForRoom(rawCode: string): Promise<GameState | null> {
    const code = rawCode.trim().toUpperCase();
    const room = await this.prisma.gameRoom.findUnique({
      where: { code },
      include: {
        games: {
          orderBy: { startedAt: 'desc' },
          take: 1,
          select: { stateSnapshot: true },
        },
      },
    });
    const latest = room?.games[0];
    if (!latest) return null;
    return latest.stateSnapshot as unknown as GameState;
  }

  /**
   * Reprise après redémarrage serveur : recharge toutes les parties actives ou en pause
   * ainsi que le code de leur salle associée.
   */
  async recoverActiveGames(): Promise<
    Array<{ roomCode: string; hostUserId: string; state: GameState }>
  > {
    const activeGames = await this.prisma.game.findMany({
      where: {
        status: { in: ['ACTIVE', 'PAUSED'] },
      },
      include: {
        room: {
          select: { code: true, hostId: true, status: true },
        },
      },
    });

    return activeGames
      .filter((g) => g.room.status !== 'CLOSED')
      .map((g) => ({
        roomCode: g.room.code,
        hostUserId: g.room.hostId,
        state: g.stateSnapshot as unknown as GameState,
      }));
  }

  async findRoomMetaById(roomId: string): Promise<{ code: string; hostId: string } | null> {
    const room = await this.prisma.gameRoom.findUnique({
      where: { id: roomId },
      select: { code: true, hostId: true },
    });
    return room ? { code: room.code.toUpperCase(), hostId: room.hostId } : null;
  }

  async isCommandProcessed(gameId: string, commandId: string): Promise<boolean> {
    const existing = await this.prisma.processedCommand.findUnique({
      where: { gameId_commandId: { gameId, commandId } },
      select: { id: true },
    });
    return existing !== null;
  }
}
