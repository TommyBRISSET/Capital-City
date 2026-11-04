import crypto from 'node:crypto';
import type { Server as SocketIOServer, Socket } from 'socket.io';
import { z } from 'zod';
import {
  DomainRuleError,
  applyDisconnectTimeoutPolicy,
  applyGameAction,
  expireAuctionIfDue,
  type DomainEvent,
  type RngFn,
} from '@capital-city/game-engine';
import {
  ChatMessageInputSchema,
  GameActionSchema,
  GameCommandEnvelopeSchema,
  RoomCreateInputSchema,
  RoomJoinInputSchema,
  RoomReadySchema,
  RoomSelectTokenSchema,
  RoomUpdateRulesSchema,
  toPublicGameState,
  type ChatMessagePayload,
  type DomainErrorPayload,
  type GameAction,
  type GameState,
  type PublicGameState,
  type RoomSummary,
  type SessionClaims,
} from '@capital-city/shared';
import { logger } from './infra/logger';
import type { RealtimeCoordinator } from './infra/redis-coordinator';
import type { GameRepository } from './persistence/game-repository';

export interface AckResponse<T = unknown> {
  ok: boolean;
  data?: T;
  error?: DomainErrorPayload;
}

type AckCallback<T = unknown> = ((res: AckResponse<T>) => void) | undefined;

const RoomCodePayloadSchema = z.object({
  roomCode: z.string().trim().min(4).max(12),
});

export interface RoomManagerOptions {
  rng?: RngFn;
  disconnectGraceMsOverride?: number;
  rateLimitMaxPer10s?: number;
}

const DIRECT_ACTION_TYPES: readonly GameAction['type'][] = [
  'turn:roll',
  'turn:end',
  'property:buy',
  'property:decline',
  'auction:bid',
  'auction:pass',
  'asset:build',
  'asset:sell',
  'asset:mortgage',
  'asset:redeem',
  'trade:propose',
  'trade:accept',
  'trade:reject',
  'trade:cancel',
  'jail:pay',
  'jail:use-card',
  'debt:settle',
  'player:declare-bankruptcy',
  'game:pause',
  'game:unpause',
];

export class RoomManager {
  private readonly activeGamesByRoom = new Map<string, GameState>();
  private readonly roomCodeByGameId = new Map<string, string>();
  private readonly hostByRoom = new Map<string, string>();
  private readonly roomChats = new Map<string, ChatMessagePayload[]>();
  private readonly roomLocks = new Map<string, Promise<void>>();
  private readonly auctionTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly disconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly socketRooms = new Map<string, Set<string>>();
  private isShuttingDown = false;
  private readonly rng: RngFn;
  private readonly disconnectGraceMsOverride: number | undefined;
  private readonly rateLimitMaxPer10s: number;

  constructor(
    private readonly io: SocketIOServer,
    private readonly repo: GameRepository,
    private readonly coordinator: RealtimeCoordinator,
    options?: RoomManagerOptions,
  ) {
    this.rng = options?.rng ?? (() => crypto.randomInt(0, 1_000_000) / 1_000_000);
    this.disconnectGraceMsOverride = options?.disconnectGraceMsOverride;
    this.rateLimitMaxPer10s =
      options?.rateLimitMaxPer10s ?? Number(process.env.RATE_LIMIT_MAX_COMMANDS_PER_10S || 35);
  }

  async initialize(): Promise<void> {
    const recovered = await this.repo.recoverActiveGames();
    for (const item of recovered) {
      const code = item.roomCode.toUpperCase();
      this.activeGamesByRoom.set(code, item.state);
      this.roomCodeByGameId.set(item.state.id, code);
      this.hostByRoom.set(code, item.hostUserId);
      this.syncAuctionTimer(code, item.state);
    }
    if (recovered.length > 0) {
      logger.info('Recovered active games from PostgreSQL', { count: recovered.length });
    }
  }

  async shutdown(): Promise<void> {
    this.isShuttingDown = true;
    for (const timer of this.auctionTimers.values()) {
      clearTimeout(timer);
    }
    this.auctionTimers.clear();

    for (const timer of this.disconnectTimers.values()) {
      clearTimeout(timer);
    }
    this.disconnectTimers.clear();

    await Promise.allSettled([...this.roomLocks.values()]);
  }

  private withRoomLock<T>(roomCode: string, fn: () => Promise<T>): Promise<T> {
    const key = roomCode.trim().toUpperCase();
    const prev = this.roomLocks.get(key) ?? Promise.resolve();
    let release!: () => void;
    const next = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.roomLocks.set(
      key,
      prev.then(() => next),
    );

    return prev.then(async () => {
      try {
        return await fn();
      } finally {
        release();
        if (this.roomLocks.get(key) === next) {
          this.roomLocks.delete(key);
        }
      }
    });
  }

  private getSession(socket: Socket): SessionClaims {
    const session = socket.data.session as SessionClaims | undefined;
    if (!session) {
      throw new DomainRuleError('UNAUTHORIZED', 'Session authentifiée requise.');
    }
    return session;
  }

  private emitError<T>(
    socket: Socket,
    err: unknown,
    commandId?: string,
    ack?: AckCallback<T>,
  ): void {
    let payload: DomainErrorPayload;
    if (err instanceof DomainRuleError) {
      payload = {
        code: err.code,
        message: err.message,
        ...(commandId ? { commandId } : {}),
      };
    } else if (err instanceof z.ZodError) {
      payload = {
        code: 'VALIDATION_ERROR',
        message: err.issues[0]?.message ?? 'Données de commande invalides.',
        ...(commandId ? { commandId } : {}),
      };
    } else {
      logger.error('Unhandled realtime command error', {
        commandId,
        error: err instanceof Error ? err.message : String(err),
      });
      payload = {
        code: 'INTERNAL_ERROR',
        message: 'Une erreur serveur inattendue est survenue.',
        ...(commandId ? { commandId } : {}),
      };
    }

    socket.emit('error:domain', payload);
    if (typeof ack === 'function') {
      ack({ ok: false, error: payload });
    }
  }

  private async enforceRateLimit(socket: Socket, session: SessionClaims): Promise<void> {
    const check = await this.coordinator.checkRateLimit(
      `user:${session.userId}`,
      this.rateLimitMaxPer10s,
    );
    if (!check.allowed) {
      throw new DomainRuleError(
        'RATE_LIMITED',
        'Trop d’actions envoyées en peu de temps. Patientez quelques secondes.',
      );
    }
  }

  private broadcastGameUpdate(
    roomCode: string,
    state: GameState,
    events: DomainEvent[],
  ): PublicGameState {
    const publicState = toPublicGameState(state);
    this.io.to(roomCode).emit('game:snapshot', publicState);

    for (const ev of events) {
      if (!ev.type.startsWith('log:')) {
        this.io.to(roomCode).emit(ev.type, ev.payload);
      }
    }

    return publicState;
  }

  private syncAuctionTimer(roomCode: string, state: GameState): void {
    const existing = this.auctionTimers.get(roomCode);
    if (existing) {
      clearTimeout(existing);
      this.auctionTimers.delete(roomCode);
    }

    if (state.status !== 'ACTIVE' || state.phase !== 'AUCTION' || !state.auction) {
      return;
    }

    const auctionId = state.auction.id;
    const delayMs = Math.max(50, state.auction.expiresAt - Date.now() + 25);

    const timer = setTimeout(() => {
      this.auctionTimers.delete(roomCode);
      void this.withRoomLock(roomCode, async () => {
        const current = this.activeGamesByRoom.get(roomCode);
        if (!current || current.auction?.id !== auctionId) return;

        const now = Math.max(Date.now(), current.auction.expiresAt);
        const expired = expireAuctionIfDue(current, now);
        if (!expired) return;

        const persisted = await this.repo.persistGameTransition({
          gameId: current.id,
          expectedVersion: current.version,
          commandId: `sys-auction-exp-${auctionId}-v${current.version}`,
          actorId: 'SYSTEM',
          commandType: 'auction:expire',
          nextState: expired.state,
          domainEvents: expired.events,
        });

        this.activeGamesByRoom.set(roomCode, persisted.state);
        this.broadcastGameUpdate(roomCode, persisted.state, expired.events);
        this.syncAuctionTimer(roomCode, persisted.state);
      }).catch((err) => {
        logger.error('Failed to finalize expired auction', {
          roomCode,
          error: err instanceof Error ? err.message : String(err),
        });
      });
    }, delayMs);

    this.auctionTimers.set(roomCode, timer);
  }

  private clearDisconnectTimer(roomCode: string, userId: string): void {
    const key = `${roomCode}:${userId}`;
    const timer = this.disconnectTimers.get(key);
    if (timer) {
      clearTimeout(timer);
      this.disconnectTimers.delete(key);
    }
  }

  private scheduleDisconnectGraceTimer(roomCode: string, userId: string, state: GameState): void {
    this.clearDisconnectTimer(roomCode, userId);
    if (state.status !== 'ACTIVE') return;

    const player = state.players.find((p) => p.userId === userId);
    if (!player || player.bankruptcyStatus === 'BANKRUPT') return;

    const graceMs = this.disconnectGraceMsOverride ?? state.ruleset.disconnectGraceSeconds * 1000;

    const key = `${roomCode}:${userId}`;
    const timer = setTimeout(() => {
      this.disconnectTimers.delete(key);
      void this.withRoomLock(roomCode, async () => {
        const current = this.activeGamesByRoom.get(roomCode);
        if (!current || current.status !== 'ACTIVE') return;

        const targetPlayer = current.players.find((p) => p.userId === userId);
        if (
          !targetPlayer ||
          targetPlayer.isConnected ||
          targetPlayer.bankruptcyStatus === 'BANKRUPT'
        ) {
          return;
        }

        const now = Date.now();
        const transition = applyDisconnectTimeoutPolicy(current, targetPlayer.id, {
          rng: this.rng,
          now,
          isHost: false,
        });
        if (!transition) return;

        const persisted = await this.repo.persistGameTransition({
          gameId: current.id,
          expectedVersion: current.version,
          commandId: `sys-disc-timeout-${targetPlayer.id}-v${current.version}`,
          actorId: targetPlayer.id,
          commandType: 'system:disconnect-policy',
          nextState: transition.state,
          domainEvents: transition.events,
        });

        this.activeGamesByRoom.set(roomCode, persisted.state);
        const roomSummary = await this.repo.getRoomSummary(roomCode);
        if (roomSummary) {
          this.io.to(roomCode).emit('room:updated', roomSummary);
        }
        this.broadcastGameUpdate(roomCode, persisted.state, transition.events);
        this.syncAuctionTimer(roomCode, persisted.state);
      }).catch((err) => {
        logger.error('Failed applying disconnect grace policy', {
          roomCode,
          actorId: userId,
          error: err instanceof Error ? err.message : String(err),
        });
      });
    }, graceMs);

    this.disconnectTimers.set(key, timer);
  }

  private trackSocketJoinRoom(socket: Socket, roomCode: string): void {
    const normalized = roomCode.trim().toUpperCase();
    void socket.join(normalized);
    let set = this.socketRooms.get(socket.id);
    if (!set) {
      set = new Set();
      this.socketRooms.set(socket.id, set);
    }
    set.add(normalized);
  }

  private async ensureRoomGameLoaded(roomCode: string): Promise<GameState | null> {
    const cached = this.activeGamesByRoom.get(roomCode);
    if (cached) return cached;

    const loaded = await this.repo.loadLatestGameForRoom(roomCode);
    if (loaded) {
      this.activeGamesByRoom.set(roomCode, loaded);
      this.roomCodeByGameId.set(loaded.id, roomCode);
      this.syncAuctionTimer(roomCode, loaded);
    }
    return loaded;
  }

  registerSocket(socket: Socket): void {
    const session = this.getSession(socket);
    socket.emit('server:ready', {
      userId: session.userId,
      displayName: session.displayName,
    });

    socket.on(
      'room:create',
      async (rawPayload: unknown, ack?: AckCallback<{ room: RoomSummary }>) => {
        try {
          await this.enforceRateLimit(socket, session);
          const input = RoomCreateInputSchema.parse(rawPayload);
          const room = await this.repo.createRoom({
            hostUserId: session.userId,
            hostDisplayName: session.displayName,
            name: input.name,
            boardPackId: input.boardPackId,
            maxPlayers: input.maxPlayers,
            isPublic: input.isPublic,
            tokenId: input.tokenId,
            ruleset: input.ruleset,
          });

          this.hostByRoom.set(room.code, room.hostId);
          this.trackSocketJoinRoom(socket, room.code);
          await this.coordinator.markPresence(room.code, session.userId, true);

          this.io.to(room.code).emit('room:updated', room);
          logger.info('Room created via Socket.IO', {
            roomCode: room.code,
            actorId: session.userId,
          });
          if (typeof ack === 'function') {
            ack({ ok: true, data: { room } });
          }
        } catch (err) {
          this.emitError(socket, err, undefined, ack);
        }
      },
    );

    socket.on(
      'room:join',
      async (
        rawPayload: unknown,
        ack?: AckCallback<{
          room: RoomSummary;
          gameSnapshot: PublicGameState | null;
          chatHistory: ChatMessagePayload[];
        }>,
      ) => {
        try {
          await this.enforceRateLimit(socket, session);
          const input = RoomJoinInputSchema.parse(rawPayload);
          const code = input.code.toUpperCase();

          const result = await this.withRoomLock(code, async () => {
            const room = await this.repo.joinRoom({
              code,
              userId: session.userId,
              displayName: session.displayName,
              preferredTokenId: input.tokenId,
            });
            this.hostByRoom.set(code, room.hostId);
            this.trackSocketJoinRoom(socket, code);
            this.clearDisconnectTimer(code, session.userId);
            await this.coordinator.markPresence(code, session.userId, true);

            let game = await this.ensureRoomGameLoaded(code);
            if (game) {
              const updatedPresence = await this.repo.updatePlayerPresence({
                gameId: game.id,
                roomCode: code,
                userId: session.userId,
                isConnected: true,
              });
              if (updatedPresence) {
                game = updatedPresence;
                this.activeGamesByRoom.set(code, game);
              }
            }

            this.io.to(code).emit('room:updated', room);
            this.io.to(code).emit('presence:updated', {
              userId: session.userId,
              displayName: session.displayName,
              isConnected: true,
            });

            const publicSnapshot = game ? toPublicGameState(game) : null;
            if (publicSnapshot) {
              this.io.to(code).emit('game:snapshot', publicSnapshot);
            }

            const chatHistory = this.roomChats.get(code) ?? [];
            return { room, gameSnapshot: publicSnapshot, chatHistory };
          });

          if (typeof ack === 'function') {
            ack({ ok: true, data: result });
          }
        } catch (err) {
          this.emitError(socket, err, undefined, ack);
        }
      },
    );

    socket.on('room:leave', async (rawPayload: unknown, ack?: AckCallback) => {
      try {
        const { roomCode } = RoomCodePayloadSchema.parse(rawPayload);
        const code = roomCode.toUpperCase();

        await this.withRoomLock(code, async () => {
          void socket.leave(code);
          this.socketRooms.get(socket.id)?.delete(code);
          await this.coordinator.markPresence(code, session.userId, false);

          const updatedRoom = await this.repo.leaveRoom({ code, userId: session.userId });
          if (updatedRoom) {
            this.hostByRoom.set(code, updatedRoom.hostId);
            this.io.to(code).emit('room:updated', updatedRoom);
          }

          const game = this.activeGamesByRoom.get(code);
          if (game) {
            const updatedState = await this.repo.updatePlayerPresence({
              gameId: game.id,
              roomCode: code,
              userId: session.userId,
              isConnected: false,
            });
            if (updatedState) {
              this.activeGamesByRoom.set(code, updatedState);
              this.io.to(code).emit('game:snapshot', toPublicGameState(updatedState));
              this.scheduleDisconnectGraceTimer(code, session.userId, updatedState);
            }
          }
        });

        if (typeof ack === 'function') {
          ack({ ok: true });
        }
      } catch (err) {
        this.emitError(socket, err, undefined, ack);
      }
    });

    socket.on(
      'room:select-token',
      async (rawPayload: unknown, ack?: AckCallback<{ room: RoomSummary }>) => {
        try {
          await this.enforceRateLimit(socket, session);
          const input = RoomSelectTokenSchema.parse(rawPayload);
          const code = input.roomCode.toUpperCase();

          const room = await this.withRoomLock(code, () =>
            this.repo.selectToken({
              code,
              userId: session.userId,
              tokenId: input.tokenId,
            }),
          );

          this.io.to(code).emit('room:updated', room);
          if (typeof ack === 'function') {
            ack({ ok: true, data: { room } });
          }
        } catch (err) {
          this.emitError(socket, err, undefined, ack);
        }
      },
    );

    socket.on(
      'room:ready',
      async (rawPayload: unknown, ack?: AckCallback<{ room: RoomSummary }>) => {
        try {
          await this.enforceRateLimit(socket, session);
          const input = RoomReadySchema.parse(rawPayload);
          const code = input.roomCode.toUpperCase();

          const room = await this.withRoomLock(code, () =>
            this.repo.setReady({
              code,
              userId: session.userId,
              isReady: input.isReady,
            }),
          );

          this.io.to(code).emit('room:updated', room);
          if (typeof ack === 'function') {
            ack({ ok: true, data: { room } });
          }
        } catch (err) {
          this.emitError(socket, err, undefined, ack);
        }
      },
    );

    socket.on(
      'room:update-rules',
      async (rawPayload: unknown, ack?: AckCallback<{ room: RoomSummary }>) => {
        try {
          await this.enforceRateLimit(socket, session);
          const input = RoomUpdateRulesSchema.parse(rawPayload);
          const code = input.roomCode.toUpperCase();

          const room = await this.withRoomLock(code, () =>
            this.repo.updateRoomRules({
              code,
              actorUserId: session.userId,
              boardPackId: input.boardPackId,
              maxPlayers: input.maxPlayers,
              ruleset: input.ruleset,
            }),
          );

          this.io.to(code).emit('room:updated', room);
          if (typeof ack === 'function') {
            ack({ ok: true, data: { room } });
          }
        } catch (err) {
          this.emitError(socket, err, undefined, ack);
        }
      },
    );

    socket.on(
      'game:start',
      async (
        rawPayload: unknown,
        ack?: AckCallback<{ room: RoomSummary; gameSnapshot: PublicGameState }>,
      ) => {
        try {
          await this.enforceRateLimit(socket, session);
          const { roomCode } = RoomCodePayloadSchema.parse(rawPayload);
          const code = roomCode.toUpperCase();

          const data = await this.withRoomLock(code, async () => {
            const started = await this.repo.startNewGameFromRoom({
              code,
              actorUserId: session.userId,
              rng: this.rng,
            });

            this.activeGamesByRoom.set(code, started.gameState);
            this.roomCodeByGameId.set(started.gameState.id, code);
            this.hostByRoom.set(code, started.room.hostId);

            const publicSnapshot = toPublicGameState(started.gameState);
            this.io.to(code).emit('room:updated', started.room);
            this.io.to(code).emit('game:started', publicSnapshot);
            this.io.to(code).emit('game:snapshot', publicSnapshot);

            logger.info('Game started', {
              roomCode: code,
              gameId: started.gameState.id,
              actorId: session.userId,
            });

            return { room: started.room, gameSnapshot: publicSnapshot };
          });

          if (typeof ack === 'function') {
            ack({ ok: true, data });
          }
        } catch (err) {
          this.emitError(socket, err, undefined, ack);
        }
      },
    );

    socket.on(
      'game:resume',
      async (
        rawPayload: unknown,
        ack?: AckCallback<{ room: RoomSummary | null; gameSnapshot: PublicGameState | null }>,
      ) => {
        try {
          const { roomCode } = RoomCodePayloadSchema.parse(rawPayload);
          const code = roomCode.toUpperCase();
          const data = await this.withRoomLock(code, async () => {
            const room = await this.repo.getRoomSummary(code);
            if (room) {
              this.hostByRoom.set(code, room.hostId);
              this.trackSocketJoinRoom(socket, code);
            }
            const state = await this.ensureRoomGameLoaded(code);
            const publicSnapshot = state ? toPublicGameState(state) : null;
            if (publicSnapshot) {
              socket.emit('game:snapshot', publicSnapshot);
            }
            return { room, gameSnapshot: publicSnapshot };
          });
          if (typeof ack === 'function') {
            ack({ ok: true, data });
          }
        } catch (err) {
          this.emitError(socket, err, undefined, ack);
        }
      },
    );

    socket.on(
      'game:rematch',
      async (rawPayload: unknown, ack?: AckCallback<{ room: RoomSummary }>) => {
        try {
          await this.enforceRateLimit(socket, session);
          const { roomCode } = RoomCodePayloadSchema.parse(rawPayload);
          const code = roomCode.toUpperCase();

          const room = await this.withRoomLock(code, async () => {
            const reset = await this.repo.resetRoomForRematch({
              code,
              actorUserId: session.userId,
            });
            const prevGame = this.activeGamesByRoom.get(code);
            if (prevGame) {
              this.roomCodeByGameId.delete(prevGame.id);
              this.activeGamesByRoom.delete(code);
            }
            this.io.to(code).emit('room:updated', reset);
            this.io.to(code).emit('game:rematch-ready', reset);
            return reset;
          });

          if (typeof ack === 'function') {
            ack({ ok: true, data: { room } });
          }
        } catch (err) {
          this.emitError(socket, err, undefined, ack);
        }
      },
    );

    socket.on(
      'game:command',
      async (
        rawPayload: unknown,
        ack?: AckCallback<{ snapshot: PublicGameState; duplicate: boolean }>,
      ) => {
        await this.processCommandEnvelope(socket, session, rawPayload, ack);
      },
    );

    // Enregistrement des alias d'événements directs (ex. 'turn:roll', 'auction:bid')
    for (const actionType of DIRECT_ACTION_TYPES) {
      socket.on(
        actionType,
        async (
          rawPayload: Record<string, unknown> | undefined,
          ack?: AckCallback<{ snapshot: PublicGameState; duplicate: boolean }>,
        ) => {
          const obj = rawPayload && typeof rawPayload === 'object' ? rawPayload : {};
          const { commandId, gameId, expectedVersion, ...rest } = obj;
          const synthesized = {
            commandId,
            gameId,
            expectedVersion,
            action: {
              type: actionType,
              ...rest,
            },
          };
          await this.processCommandEnvelope(socket, session, synthesized, ack);
        },
      );
    }

    socket.on(
      'chat:send',
      async (rawPayload: unknown, ack?: AckCallback<{ message: ChatMessagePayload }>) => {
        try {
          await this.enforceRateLimit(socket, session);
          const input = ChatMessageInputSchema.parse(rawPayload);
          const code = input.roomCode.toUpperCase();
          const room = await this.repo.getRoomSummary(code);
          if (!room || !room.players.some((p) => p.userId === session.userId)) {
            throw new DomainRuleError('PERMISSION_DENIED', 'Vous ne participez pas à cette salle.');
          }

          const msg: ChatMessagePayload = {
            id: crypto.randomUUID(),
            roomCode: code,
            senderId: session.userId,
            senderName: session.displayName,
            text: input.text,
            createdAt: Date.now(),
          };

          const history = this.roomChats.get(code) ?? [];
          history.push(msg);
          if (history.length > 50) {
            history.splice(0, history.length - 50);
          }
          this.roomChats.set(code, history);

          this.io.to(code).emit('chat:message', msg);
          if (typeof ack === 'function') {
            ack({ ok: true, data: { message: msg } });
          }
        } catch (err) {
          this.emitError(socket, err, undefined, ack);
        }
      },
    );

    socket.on('disconnect', () => {
      const joinedCodes = [...(this.socketRooms.get(socket.id) ?? [])];
      this.socketRooms.delete(socket.id);
      if (this.isShuttingDown) return;

      for (const code of joinedCodes) {
        void this.withRoomLock(code, async () => {
          if (this.isShuttingDown) return;
          // Vérifier si le même utilisateur possède encore un autre onglet/socket ouvert dans la salle
          const socketsInRoom = await this.io.in(code).fetchSockets();
          const stillOnline = socketsInRoom.some(
            (s) => (s.data.session as SessionClaims | undefined)?.userId === session.userId,
          );
          if (stillOnline) return;

          await this.coordinator.markPresence(code, session.userId, false);
          this.io.to(code).emit('presence:updated', {
            userId: session.userId,
            displayName: session.displayName,
            isConnected: false,
          });

          const game = this.activeGamesByRoom.get(code);
          if (game) {
            const updatedState = await this.repo.updatePlayerPresence({
              gameId: game.id,
              roomCode: code,
              userId: session.userId,
              isConnected: false,
            });
            if (updatedState) {
              this.activeGamesByRoom.set(code, updatedState);
              const summary = await this.repo.getRoomSummary(code);
              if (summary) {
                this.io.to(code).emit('room:updated', summary);
              }
              this.io.to(code).emit('game:snapshot', toPublicGameState(updatedState));
              this.scheduleDisconnectGraceTimer(code, session.userId, updatedState);
            }
          }
        }).catch((err) => {
          logger.error('Error handling socket disconnect', {
            roomCode: code,
            actorId: session.userId,
            error: err instanceof Error ? err.message : String(err),
          });
        });
      }
    });
  }

  private async processCommandEnvelope(
    socket: Socket,
    session: SessionClaims,
    rawPayload: unknown,
    ack?: AckCallback<{ snapshot: PublicGameState; duplicate: boolean }>,
  ): Promise<void> {
    let parsedCommandId: string | undefined;
    try {
      await this.enforceRateLimit(socket, session);
      const envelope = GameCommandEnvelopeSchema.parse(rawPayload);
      parsedCommandId = envelope.commandId;
      const action = GameActionSchema.parse(envelope.action);

      let roomCode = this.roomCodeByGameId.get(envelope.gameId);
      if (!roomCode) {
        const dbState = await this.repo.loadGameById(envelope.gameId);
        if (!dbState) {
          throw new DomainRuleError('GAME_NOT_ACTIVE', 'Partie introuvable.');
        }
        const prismaRoom = await this.repo.findRoomMetaById(dbState.roomId);
        if (!prismaRoom) {
          throw new DomainRuleError('GAME_NOT_ACTIVE', 'Salle associée introuvable.');
        }
        roomCode = prismaRoom.code;
        this.hostByRoom.set(roomCode, prismaRoom.hostId);
        this.activeGamesByRoom.set(roomCode, dbState);
        this.roomCodeByGameId.set(envelope.gameId, roomCode);
      }

      const code = roomCode;
      const result = await this.withRoomLock(code, async () => {
        const currentState = await this.ensureRoomGameLoaded(code);
        if (!currentState || currentState.id !== envelope.gameId) {
          throw new DomainRuleError('GAME_NOT_ACTIVE', 'Cette partie n’est plus active.');
        }

        // Vérification d'idempotence rapide avant même la validation de version
        const player = currentState.players.find((p) => p.userId === session.userId);
        const hostUserId =
          this.hostByRoom.get(code) ?? (await this.repo.getRoomSummary(code))?.hostId;
        const isHost = hostUserId === session.userId;

        if (!player && !isHost) {
          throw new DomainRuleError(
            'PERMISSION_DENIED',
            'Vous ne faites pas partie des joueurs de cette partie.',
          );
        }

        const actorPlayerId = player?.id ?? session.userId;

        // Si commandId déjà traité, retourner l'état courant de façon idempotente
        if (currentState.version !== envelope.expectedVersion) {
          // Peut être un rejeu réseau d'une commande déjà persistée : déléguer la vérification d'idempotence
          const idempotentCheck = await this.repo.isCommandProcessed(
            currentState.id,
            envelope.commandId,
          );
          if (idempotentCheck) {
            return {
              snapshot: toPublicGameState(currentState),
              duplicate: true,
            };
          }
          // Resynchroniser le client avec le dernier snapshot tout en signalant le conflit
          socket.emit('game:snapshot', toPublicGameState(currentState));
          throw new DomainRuleError(
            'STALE_STATE',
            `Votre affichage n’était pas à jour (v${envelope.expectedVersion} vs v${currentState.version}). L’état vient d’être resynchronisé.`,
          );
        }

        const transition = applyGameAction(currentState, actorPlayerId, action, {
          rng: this.rng,
          now: Date.now(),
          isHost,
        });

        const persisted = await this.repo.persistGameTransition({
          gameId: currentState.id,
          expectedVersion: envelope.expectedVersion,
          commandId: envelope.commandId,
          actorId: actorPlayerId,
          commandType: action.type,
          nextState: transition.state,
          domainEvents: transition.events,
        });

        this.activeGamesByRoom.set(code, persisted.state);

        if (persisted.duplicate) {
          return {
            snapshot: toPublicGameState(persisted.state),
            duplicate: true,
          };
        }

        if (
          persisted.state.status !== currentState.status ||
          action.type === 'game:pause' ||
          action.type === 'game:unpause'
        ) {
          const roomSummary = await this.repo.getRoomSummary(code);
          if (roomSummary) {
            this.io.to(code).emit('room:updated', roomSummary);
          }
        }

        const publicSnapshot = this.broadcastGameUpdate(code, persisted.state, transition.events);
        this.syncAuctionTimer(code, persisted.state);

        logger.info('Processed game command', {
          roomCode: code,
          gameId: currentState.id,
          actorId: actorPlayerId,
          commandId: envelope.commandId,
          actionType: action.type,
          version: persisted.state.version,
        });

        return {
          snapshot: publicSnapshot,
          duplicate: false,
        };
      });

      if (typeof ack === 'function') {
        ack({ ok: true, data: result });
      }
    } catch (err) {
      this.emitError(socket, err, parsedCommandId, ack);
    }
  }
}
