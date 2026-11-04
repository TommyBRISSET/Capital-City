import { z } from 'zod';
import { BoardPackIdSchema } from './board';
import { RulesetConfigSchema } from './rules';
import { TOKEN_IDS } from './tokens';

export const TokenIdSchema = z.enum(TOKEN_IDS);

export const SessionInitInputSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(2, 'Le pseudonyme doit contenir au moins 2 caractères')
    .max(24, 'Le pseudonyme ne peut pas dépasser 24 caractères')
    .regex(/^[\p{L}\p{N}_\- ]+$/u, 'Caractères non autorisés dans le pseudonyme'),
  avatar: TokenIdSchema.optional(),
});
export type SessionInitInput = z.infer<typeof SessionInitInputSchema>;

export const RoomCreateInputSchema = z.object({
  name: z.string().trim().min(2).max(40),
  boardPackId: BoardPackIdSchema,
  maxPlayers: z.number().int().min(2).max(8).default(4),
  isPublic: z.boolean().default(false),
  tokenId: TokenIdSchema.optional(),
  ruleset: RulesetConfigSchema.partial().optional(),
});
export type RoomCreateInput = z.infer<typeof RoomCreateInputSchema>;

export const RoomJoinInputSchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .min(4)
    .max(12)
    .regex(/^[A-Z0-9-]+$/),
  tokenId: TokenIdSchema.optional(),
});
export type RoomJoinInput = z.infer<typeof RoomJoinInputSchema>;

export const RoomSelectTokenSchema = z.object({
  roomCode: z.string().trim().min(4).max(12),
  tokenId: TokenIdSchema,
});

export const RoomReadySchema = z.object({
  roomCode: z.string().trim().min(4).max(12),
  isReady: z.boolean(),
});

export const RoomUpdateRulesSchema = z.object({
  roomCode: z.string().trim().min(4).max(12),
  boardPackId: BoardPackIdSchema.optional(),
  maxPlayers: z.number().int().min(2).max(8).optional(),
  ruleset: RulesetConfigSchema.partial().optional(),
});

export const GameActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('turn:roll') }),
  z.object({ type: z.literal('turn:end') }),
  z.object({ type: z.literal('property:buy') }),
  z.object({ type: z.literal('property:decline') }),
  z.object({
    type: z.literal('auction:bid'),
    amount: z.number().int().positive().max(100_000),
  }),
  z.object({ type: z.literal('auction:pass') }),
  z.object({
    type: z.literal('asset:build'),
    spaceIndex: z.number().int().min(0).max(39),
  }),
  z.object({
    type: z.literal('asset:sell'),
    spaceIndex: z.number().int().min(0).max(39),
  }),
  z.object({
    type: z.literal('asset:mortgage'),
    spaceIndex: z.number().int().min(0).max(39),
  }),
  z.object({
    type: z.literal('asset:redeem'),
    spaceIndex: z.number().int().min(0).max(39),
  }),
  z.object({
    type: z.literal('trade:propose'),
    targetPlayerId: z.string().min(1),
    offeredSpaceIndices: z.array(z.number().int().min(0).max(39)).max(28),
    requestedSpaceIndices: z.array(z.number().int().min(0).max(39)).max(28),
    offeredCash: z.number().int().min(0).max(100_000).default(0),
    requestedCash: z.number().int().min(0).max(100_000).default(0),
    offeredJailCards: z.number().int().min(0).max(4).default(0),
    requestedJailCards: z.number().int().min(0).max(4).default(0),
    note: z.string().trim().max(140).optional(),
  }),
  z.object({
    type: z.literal('trade:accept'),
    tradeId: z.string().min(1),
  }),
  z.object({
    type: z.literal('trade:reject'),
    tradeId: z.string().min(1),
  }),
  z.object({
    type: z.literal('trade:cancel'),
    tradeId: z.string().min(1),
  }),
  z.object({ type: z.literal('jail:pay') }),
  z.object({ type: z.literal('jail:use-card') }),
  z.object({ type: z.literal('debt:settle') }),
  z.object({ type: z.literal('player:declare-bankruptcy') }),
  z.object({ type: z.literal('game:pause') }),
  z.object({ type: z.literal('game:unpause') }),
]);

export type GameAction = z.infer<typeof GameActionSchema>;

export const GameCommandEnvelopeSchema = z.object({
  commandId: z.string().min(8).max(64),
  gameId: z.string().min(1).max(64),
  expectedVersion: z.number().int().min(1),
  action: GameActionSchema,
});

export type GameCommandEnvelope = z.infer<typeof GameCommandEnvelopeSchema>;

export const ChatMessageInputSchema = z.object({
  roomCode: z.string().trim().min(4).max(12),
  text: z.string().trim().min(1).max(240),
});
export type ChatMessageInput = z.infer<typeof ChatMessageInputSchema>;

export interface ChatMessagePayload {
  id: string;
  roomCode: string;
  senderId: string;
  senderName: string;
  text: string;
  createdAt: number;
}

export interface DomainErrorPayload {
  code: string;
  message: string;
  commandId?: string;
}
