import type { BoardCardDefinition, BoardPackId, DeckType } from './board';
import type { RulesetConfig } from './rules';
import type { TokenId } from './tokens';

export type TurnPhase =
  | 'ROLL_DICE'
  | 'AWAITING_BUY_DECISION'
  | 'AUCTION'
  | 'MANAGE_AND_END'
  | 'DEBT_RESOLUTION'
  | 'PAUSED'
  | 'GAME_OVER';

export type BankruptcyStatus = 'SOLVENT' | 'DEBT_PENDING' | 'BANKRUPT';

export interface HeldCardInfo {
  cardId: string;
  deckType: DeckType;
  title: string;
  description: string;
}

export interface PlayerState {
  id: string;
  userId: string;
  displayName: string;
  tokenId: TokenId;
  orderIndex: number;
  cash: number;
  position: number;
  inJail: boolean;
  jailTurns: number;
  consecutiveDoubles: number;
  heldCards: HeldCardInfo[];
  bankruptcyStatus: BankruptcyStatus;
  isConnected: boolean;
  disconnectedAt: number | null;
}

export interface AssetState {
  spaceIndex: number;
  ownerPlayerId: string | null;
  isMortgaged: boolean;
  houseCount: number;
  hotelCount: number;
}

export interface DiceRollResult {
  die1: number;
  die2: number;
  total: number;
  isDouble: boolean;
  rolledAt: number;
}

export interface AuctionState {
  id: string;
  spaceIndex: number;
  currentBid: number;
  highestBidderId: string | null;
  minNextBid: number;
  eligiblePlayerIds: string[];
  passedPlayerIds: string[];
  startedAt: number;
  expiresAt: number;
  queuedSpaceIndices: number[];
}

export type TradeOfferStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'CANCELLED';

export interface TradeOfferState {
  id: string;
  proposerId: string;
  targetId: string;
  offeredSpaceIndices: number[];
  requestedSpaceIndices: number[];
  offeredCash: number;
  requestedCash: number;
  offeredJailCards: number;
  requestedJailCards: number;
  status: TradeOfferStatus;
  createdAt: number;
  note?: string;
}

export interface PendingDebtState {
  debtorId: string;
  creditorId: string | 'BANK';
  amount: number;
  reason: string;
}

export type ActivityCategory =
  | 'DICE'
  | 'MOVEMENT'
  | 'PURCHASE'
  | 'RENT'
  | 'CARD'
  | 'AUCTION'
  | 'BUILD'
  | 'MORTGAGE'
  | 'TRADE'
  | 'JAIL'
  | 'BANKRUPTCY'
  | 'SYSTEM';

export interface ActivityLogEntry {
  id: string;
  sequence: number;
  timestamp: number;
  category: ActivityCategory;
  actorId: string | null;
  message: string;
  amount?: number;
  payerId?: string | 'BANK' | 'JACKPOT';
  payeeId?: string | 'BANK' | 'JACKPOT';
  spaceIndex?: number;
  cardTitle?: string;
}

export interface PlayerRankingEntry {
  playerId: string;
  displayName: string;
  tokenId: TokenId;
  rank: number;
  netWorth: number;
  cash: number;
  propertiesCount: number;
  buildingsCount: number;
  isBankrupt: boolean;
}

export interface RevealedCardSummary {
  card: BoardCardDefinition;
  actorId: string;
  timestamp: number;
}

/**
 * État complet côté serveur (inclut l'ordre secret des paquets de cartes).
 */
export interface GameState {
  id: string;
  roomId: string;
  boardPackId: BoardPackId;
  ruleset: RulesetConfig;
  status: 'ACTIVE' | 'PAUSED' | 'FINISHED';
  phase: TurnPhase;
  phaseBeforePause: TurnPhase | null;
  version: number;
  turnNumber: number;
  currentPlayerId: string;
  hasRolledThisTurn: boolean;
  extraRollGranted: boolean;
  lastDiceRoll: DiceRollResult | null;
  lastRevealedCard: RevealedCardSummary | null;
  pendingBuySpaceIndex: number | null;
  rentMultiplierOverride: number | null;
  utilityDiceMultiplierOverride: number | null;
  freeParkingPot: number;
  bankHousesAvailable: number;
  bankHotelsAvailable: number;
  players: PlayerState[];
  assets: Record<number, AssetState>;
  eventDeckOrder: string[];
  communityDeckOrder: string[];
  auction: AuctionState | null;
  trades: TradeOfferState[];
  pendingDebt: PendingDebtState | null;
  activityLog: ActivityLogEntry[];
  nextSequence: number;
  winnerPlayerId: string | null;
  finalStandings: PlayerRankingEntry[] | null;
  startedAt: number;
  endedAt: number | null;
}

/**
 * Snapshot assaini envoyé aux clients web (sans l'ordre futur des paquets de cartes).
 */
export type PublicGameState = Omit<GameState, 'eventDeckOrder' | 'communityDeckOrder'> & {
  eventDeckRemaining: number;
  communityDeckRemaining: number;
};

export function toPublicGameState(state: GameState): PublicGameState {
  const { eventDeckOrder, communityDeckOrder, ...rest } = state;
  return {
    ...rest,
    eventDeckRemaining: eventDeckOrder.length,
    communityDeckRemaining: communityDeckOrder.length,
  };
}

export interface LobbyPlayerSlot {
  userId: string;
  displayName: string;
  tokenId: TokenId;
  isReady: boolean;
  isHost: boolean;
  isConnected: boolean;
  joinedAt: number;
}

export interface RoomSummary {
  id: string;
  code: string;
  name: string;
  isPublic: boolean;
  hostId: string;
  boardPackId: BoardPackId;
  maxPlayers: number;
  status: 'WAITING' | 'IN_GAME' | 'PAUSED' | 'FINISHED' | 'CLOSED';
  ruleset: RulesetConfig;
  players: LobbyPlayerSlot[];
  activeGameId: string | null;
  createdAt: number;
}
