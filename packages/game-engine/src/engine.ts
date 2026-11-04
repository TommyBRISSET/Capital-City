import { getBoardPack } from '@capital-city/board-packs';
import {
  DEFAULT_RULESET_CONFIG,
  type AssetState,
  type BoardCardDefinition,
  type BoardPackDefinition,
  type BoardPackId,
  type GameAction,
  type GameState,
  type PlayerState,
  type RulesetConfig,
  type TokenId,
} from '@capital-city/shared';
import { DomainRuleError } from './errors';
import { appendActivityLog, transferCredits, type DomainEvent } from './ledger';
import { rollTwoDice, shuffleArray, type RngFn } from './rng';
import {
  calculateRent,
  canBuildOnSpace,
  canMortgageSpace,
  canRedeemSpace,
  canSellBuildingOnSpace,
  computeStandings,
  groupHasAnyBuilding,
} from './rules-helpers';

export interface CreateGamePlayerSeed {
  id: string;
  userId: string;
  displayName: string;
  tokenId: TokenId;
}

export interface CreateInitialGameParams {
  gameId: string;
  roomId: string;
  boardPackId: BoardPackId;
  players: readonly CreateGamePlayerSeed[];
  ruleset?: Partial<RulesetConfig>;
  rng: RngFn;
  now: number;
}

export interface EngineExecutionOptions {
  rng: RngFn;
  now: number;
  isHost?: boolean;
}

export interface EngineTransitionResult {
  state: GameState;
  events: DomainEvent[];
}

function cloneGameState(state: GameState): GameState {
  return structuredClone(state);
}

export function createInitialGameState(params: CreateInitialGameParams): GameState {
  if (params.players.length < 2 || params.players.length > 8) {
    throw new DomainRuleError('INVALID_PHASE', 'Une partie requiert entre 2 et 8 participants.');
  }

  const pack = getBoardPack(params.boardPackId);
  const ruleset: RulesetConfig = {
    ...DEFAULT_RULESET_CONFIG,
    ...(params.ruleset ?? {}),
  };

  const assets: Record<number, AssetState> = {};
  for (const space of pack.spaces) {
    assets[space.index] = {
      spaceIndex: space.index,
      ownerPlayerId: null,
      isMortgaged: false,
      houseCount: 0,
      hotelCount: 0,
    };
  }

  const players: PlayerState[] = params.players.map((seed, idx) => ({
    id: seed.id,
    userId: seed.userId,
    displayName: seed.displayName,
    tokenId: seed.tokenId,
    orderIndex: idx,
    cash: ruleset.startingCash,
    position: 0,
    inJail: false,
    jailTurns: 0,
    consecutiveDoubles: 0,
    heldCards: [],
    bankruptcyStatus: 'SOLVENT',
    isConnected: true,
    disconnectedAt: null,
  }));

  const eventDeckOrder = shuffleArray(
    pack.eventCards.map((c) => c.id),
    params.rng,
  );
  const communityDeckOrder = shuffleArray(
    pack.communityCards.map((c) => c.id),
    params.rng,
  );

  const firstPlayer = players[0]!;
  const state: GameState = {
    id: params.gameId,
    roomId: params.roomId,
    boardPackId: params.boardPackId,
    ruleset,
    status: 'ACTIVE',
    phase: 'ROLL_DICE',
    phaseBeforePause: null,
    version: 1,
    turnNumber: 1,
    currentPlayerId: firstPlayer.id,
    hasRolledThisTurn: false,
    extraRollGranted: false,
    lastDiceRoll: null,
    lastRevealedCard: null,
    pendingBuySpaceIndex: null,
    rentMultiplierOverride: null,
    utilityDiceMultiplierOverride: null,
    freeParkingPot: 0,
    bankHousesAvailable: ruleset.maxHousesStock,
    bankHotelsAvailable: ruleset.maxHotelsStock,
    players,
    assets,
    eventDeckOrder,
    communityDeckOrder,
    auction: null,
    trades: [],
    pendingDebt: null,
    activityLog: [],
    nextSequence: 1,
    winnerPlayerId: null,
    finalStandings: null,
    startedAt: params.now,
    endedAt: null,
  };

  appendActivityLog(state, [], {
    timestamp: params.now,
    category: 'SYSTEM',
    actorId: null,
    message: `La partie débute sur ${pack.name} avec ${players.length} joueurs. À ${firstPlayer.displayName} de lancer les dés !`,
  });

  return state;
}

function getSolventPlayers(state: GameState): PlayerState[] {
  return state.players.filter((p) => p.bankruptcyStatus !== 'BANKRUPT');
}

function getPlayerOrThrow(state: GameState, playerId: string): PlayerState {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) {
    throw new DomainRuleError('PLAYER_NOT_FOUND', 'Joueur introuvable dans cette partie.');
  }
  return player;
}

function sendPlayerToJail(
  state: GameState,
  events: DomainEvent[],
  player: PlayerState,
  reason: string,
  now: number,
): void {
  player.position = 10;
  player.inJail = true;
  player.jailTurns = 0;
  player.consecutiveDoubles = 0;
  state.extraRollGranted = false;
  state.pendingBuySpaceIndex = null;
  state.phase = 'MANAGE_AND_END';

  appendActivityLog(state, events, {
    timestamp: now,
    category: 'JAIL',
    actorId: player.id,
    spaceIndex: 10,
    message: `${player.displayName} est envoyé en détention (${reason}).`,
    eventType: 'jail:updated',
    eventPayload: { playerId: player.id, inJail: true, reason },
  });
}

function startAuctionForSpace(
  state: GameState,
  pack: BoardPackDefinition,
  events: DomainEvent[],
  spaceIndex: number,
  queuedSpaceIndices: number[],
  now: number,
): void {
  const space = pack.spaces[spaceIndex];
  const eligible = getSolventPlayers(state).filter(
    (p) => p.cash >= state.ruleset.auctionMinIncrement,
  );

  if (!space || !state.ruleset.auctionEnabled || eligible.length === 0) {
    if (queuedSpaceIndices.length > 0) {
      const [nextIdx, ...rest] = queuedSpaceIndices;
      if (nextIdx !== undefined) {
        startAuctionForSpace(state, pack, events, nextIdx, rest, now);
        return;
      }
    }
    state.auction = null;
    state.phase = 'MANAGE_AND_END';
    return;
  }

  state.auction = {
    id: `auc-${state.nextSequence}`,
    spaceIndex,
    currentBid: 0,
    highestBidderId: null,
    minNextBid: state.ruleset.auctionMinIncrement,
    eligiblePlayerIds: eligible.map((p) => p.id),
    passedPlayerIds: [],
    startedAt: now,
    expiresAt: now + state.ruleset.auctionTimeoutSeconds * 1000,
    queuedSpaceIndices,
  };
  state.pendingBuySpaceIndex = null;
  state.phase = 'AUCTION';

  appendActivityLog(state, events, {
    timestamp: now,
    category: 'AUCTION',
    actorId: null,
    spaceIndex,
    message: `Enchère ouverte pour ${space.name} (mise minimale : ${state.ruleset.auctionMinIncrement} Cr).`,
    eventType: 'auction:updated',
    eventPayload: { auction: state.auction },
  });
}

function finalizeAuction(
  state: GameState,
  pack: BoardPackDefinition,
  events: DomainEvent[],
  now: number,
): void {
  const auction = state.auction;
  if (!auction) return;

  const space = pack.spaces[auction.spaceIndex]!;
  const queued = [...auction.queuedSpaceIndices];

  if (auction.highestBidderId && auction.currentBid > 0) {
    const winner = getPlayerOrThrow(state, auction.highestBidderId);
    if (winner.cash >= auction.currentBid) {
      transferCredits(state, events, {
        from: winner.id,
        to: 'BANK',
        amount: auction.currentBid,
        category: 'AUCTION',
        reason: `Adjudication aux enchères de ${space.name}`,
        timestamp: now,
        actorId: winner.id,
        spaceIndex: space.index,
      });
      const asset = state.assets[space.index]!;
      asset.ownerPlayerId = winner.id;
      asset.isMortgaged = false;
      asset.houseCount = 0;
      asset.hotelCount = 0;

      appendActivityLog(state, events, {
        timestamp: now,
        category: 'AUCTION',
        actorId: winner.id,
        amount: auction.currentBid,
        spaceIndex: space.index,
        message: `${winner.displayName} remporte ${space.name} aux enchères pour ${auction.currentBid} Cr !`,
        eventType: 'asset:updated',
        eventPayload: { spaceIndex: space.index, asset },
      });
    }
  } else {
    appendActivityLog(state, events, {
      timestamp: now,
      category: 'AUCTION',
      actorId: null,
      spaceIndex: space.index,
      message: `Aucune offre retenue pour ${space.name} : l’actif demeure libre à la banque.`,
    });
  }

  state.auction = null;

  if (queued.length > 0) {
    const [nextSpace, ...rest] = queued;
    if (nextSpace !== undefined) {
      startAuctionForSpace(state, pack, events, nextSpace, rest, now);
      return;
    }
  }

  const activeTurnPlayer = state.players.find((p) => p.id === state.currentPlayerId);
  if (!activeTurnPlayer || activeTurnPlayer.bankruptcyStatus === 'BANKRUPT') {
    advanceTurnToNextPlayer(state, pack, events, now);
    return;
  }

  state.phase = state.hasRolledThisTurn ? 'MANAGE_AND_END' : 'ROLL_DICE';
}

function checkAndFinalizeVictory(
  state: GameState,
  pack: BoardPackDefinition,
  events: DomainEvent[],
  now: number,
  reason = 'Dernier joueur solvable',
): boolean {
  const solvent = getSolventPlayers(state);
  if (solvent.length <= 1) {
    const winner = solvent[0] ?? null;
    state.status = 'FINISHED';
    state.phase = 'GAME_OVER';
    state.auction = null;
    state.pendingDebt = null;
    state.endedAt = now;
    state.finalStandings = computeStandings(state, pack);
    state.winnerPlayerId = winner?.id ?? state.finalStandings[0]?.playerId ?? null;

    const winnerName = winner?.displayName ?? 'Aucun vainqueur';
    appendActivityLog(state, events, {
      timestamp: now,
      category: 'SYSTEM',
      actorId: state.winnerPlayerId,
      message: `Victoire de ${winnerName} ! (${reason})`,
      eventType: 'game:ended',
      eventPayload: {
        winnerPlayerId: state.winnerPlayerId,
        standings: state.finalStandings,
        reason,
      },
    });
    return true;
  }
  return false;
}

function advancePlayerToIndex(
  state: GameState,
  events: DomainEvent[],
  player: PlayerState,
  targetIndex: number,
  collectStartBonus: boolean,
  now: number,
  pack: BoardPackDefinition,
): void {
  const prevPos = player.position;
  const wrapped = targetIndex < prevPos;
  player.position = targetIndex;

  if (collectStartBonus && (wrapped || targetIndex === 0)) {
    const isExactDouble = targetIndex === 0 && state.ruleset.exactStartDoubleBonus;
    const bonus = state.ruleset.passStartBonus * (isExactDouble ? 2 : 1);
    if (bonus > 0) {
      transferCredits(state, events, {
        from: 'BANK',
        to: player.id,
        amount: bonus,
        category: 'MOVEMENT',
        reason: targetIndex === 0 ? 'Arrêt sur Départ' : 'Passage par Départ',
        timestamp: now,
        actorId: player.id,
        spaceIndex: 0,
      });
    }
  }

  const destSpace = pack.spaces[targetIndex]!;
  appendActivityLog(state, events, {
    timestamp: now,
    category: 'MOVEMENT',
    actorId: player.id,
    spaceIndex: targetIndex,
    message: `${player.displayName} avance sur ${destSpace.name} (case #${targetIndex}).`,
    eventType: 'movement:resolved',
    eventPayload: {
      playerId: player.id,
      from: prevPos,
      to: targetIndex,
    },
  });
}

function drawNextCard(
  state: GameState,
  pack: BoardPackDefinition,
  deckType: 'EVENT' | 'COMMUNITY',
): BoardCardDefinition {
  const deckOrder = deckType === 'EVENT' ? state.eventDeckOrder : state.communityDeckOrder;
  const catalog = deckType === 'EVENT' ? pack.eventCards : pack.communityCards;

  const heldIds = new Set<string>();
  for (const p of state.players) {
    for (const hc of p.heldCards) {
      if (hc.deckType === deckType) heldIds.add(hc.cardId);
    }
  }

  let pickedId = deckOrder.shift();
  while (pickedId && heldIds.has(pickedId) && deckOrder.length > 0) {
    pickedId = deckOrder.shift();
  }

  if (!pickedId) {
    // Reconstituer le paquet hors cartes détenues si nécessaire
    for (const c of catalog) {
      if (!heldIds.has(c.id)) deckOrder.push(c.id);
    }
    pickedId = deckOrder.shift() ?? catalog[0]!.id;
  }

  const card = catalog.find((c) => c.id === pickedId) ?? catalog[0]!;
  if (card.effect.type !== 'GET_OUT_OF_JAIL') {
    deckOrder.push(card.id);
  }
  return card;
}

function resolveSpaceLanding(
  state: GameState,
  pack: BoardPackDefinition,
  events: DomainEvent[],
  player: PlayerState,
  options: EngineExecutionOptions,
  depth = 0,
): void {
  const space = pack.spaces[player.position]!;

  switch (space.type) {
    case 'START':
    case 'JAIL':
      state.phase = 'MANAGE_AND_END';
      break;

    case 'PARKING': {
      if (state.ruleset.freeParkingJackpot && state.freeParkingPot > 0) {
        const pot = state.freeParkingPot;
        transferCredits(state, events, {
          from: 'JACKPOT',
          to: player.id,
          amount: pot,
          category: 'SYSTEM',
          reason: `Cagnotte ${space.name}`,
          timestamp: options.now,
          actorId: player.id,
          spaceIndex: space.index,
        });
      }
      state.phase = 'MANAGE_AND_END';
      break;
    }

    case 'GO_TO_JAIL': {
      sendPlayerToJail(state, events, player, `Case ${space.name}`, options.now);
      break;
    }

    case 'TAX': {
      const res = transferCredits(state, events, {
        from: player.id,
        to: 'BANK',
        amount: space.taxAmount,
        category: 'SYSTEM',
        reason: space.name,
        timestamp: options.now,
        actorId: player.id,
        spaceIndex: space.index,
        mandatory: true,
        routeTaxToJackpot: true,
      });
      if (res.completed) {
        state.phase = 'MANAGE_AND_END';
      }
      break;
    }

    case 'PROPERTY':
    case 'TRANSPORT':
    case 'UTILITY': {
      const asset = state.assets[space.index]!;
      if (!asset.ownerPlayerId) {
        state.pendingBuySpaceIndex = space.index;
        state.phase = 'AWAITING_BUY_DECISION';
        state.rentMultiplierOverride = null;
        state.utilityDiceMultiplierOverride = null;
      } else if (asset.ownerPlayerId !== player.id && !asset.isMortgaged) {
        const diceTotal = state.lastDiceRoll?.total ?? 7;
        const rent = calculateRent(state, pack, space.index, diceTotal);
        state.rentMultiplierOverride = null;
        state.utilityDiceMultiplierOverride = null;

        if (rent > 0) {
          const res = transferCredits(state, events, {
            from: player.id,
            to: asset.ownerPlayerId,
            amount: rent,
            category: 'RENT',
            reason: `Loyer sur ${space.name}`,
            timestamp: options.now,
            actorId: player.id,
            spaceIndex: space.index,
            mandatory: true,
          });
          if (res.completed) {
            state.phase = 'MANAGE_AND_END';
          }
        } else {
          state.phase = 'MANAGE_AND_END';
        }
      } else {
        state.rentMultiplierOverride = null;
        state.utilityDiceMultiplierOverride = null;
        state.phase = 'MANAGE_AND_END';
      }
      break;
    }

    case 'EVENT':
    case 'COMMUNITY': {
      if (depth > 2) {
        state.phase = 'MANAGE_AND_END';
        return;
      }
      const deckType = space.type === 'EVENT' ? 'EVENT' : 'COMMUNITY';
      const card = drawNextCard(state, pack, deckType);
      state.lastRevealedCard = {
        card,
        actorId: player.id,
        timestamp: options.now,
      };

      appendActivityLog(state, events, {
        timestamp: options.now,
        category: 'CARD',
        actorId: player.id,
        spaceIndex: space.index,
        cardTitle: card.title,
        message: `${player.displayName} tire « ${card.title} » : ${card.description}`,
        eventType: 'card:revealed',
        eventPayload: { card, actorId: player.id },
      });

      resolveCardEffect(state, pack, events, player, card, options, depth + 1);
      break;
    }
  }
}

function resolveCardEffect(
  state: GameState,
  pack: BoardPackDefinition,
  events: DomainEvent[],
  player: PlayerState,
  card: BoardCardDefinition,
  options: EngineExecutionOptions,
  depth: number,
): void {
  const eff = card.effect;

  switch (eff.type) {
    case 'COLLECT_FROM_BANK': {
      transferCredits(state, events, {
        from: 'BANK',
        to: player.id,
        amount: eff.amount,
        category: 'CARD',
        reason: card.title,
        timestamp: options.now,
        actorId: player.id,
      });
      state.phase = 'MANAGE_AND_END';
      break;
    }

    case 'PAY_BANK': {
      const res = transferCredits(state, events, {
        from: player.id,
        to: 'BANK',
        amount: eff.amount,
        category: 'CARD',
        reason: card.title,
        timestamp: options.now,
        actorId: player.id,
        mandatory: true,
        routeTaxToJackpot: true,
      });
      if (res.completed) {
        state.phase = 'MANAGE_AND_END';
      }
      break;
    }

    case 'COLLECT_FROM_EACH': {
      const others = getSolventPlayers(state).filter((p) => p.id !== player.id);
      for (const other of others) {
        const collectible = Math.min(other.cash, eff.amountPerPlayer);
        if (collectible > 0) {
          transferCredits(state, events, {
            from: other.id,
            to: player.id,
            amount: collectible,
            category: 'CARD',
            reason: card.title,
            timestamp: options.now,
            actorId: player.id,
          });
        }
      }
      state.phase = 'MANAGE_AND_END';
      break;
    }

    case 'PAY_EACH': {
      const others = getSolventPlayers(state).filter((p) => p.id !== player.id);
      const totalNeeded = others.length * eff.amountPerPlayer;
      if (player.cash < totalNeeded) {
        transferCredits(state, events, {
          from: player.id,
          to: 'BANK',
          amount: totalNeeded,
          category: 'CARD',
          reason: `${card.title} (${eff.amountPerPlayer} Cr × ${others.length} joueurs)`,
          timestamp: options.now,
          actorId: player.id,
          mandatory: true,
        });
        return;
      }
      for (const other of others) {
        transferCredits(state, events, {
          from: player.id,
          to: other.id,
          amount: eff.amountPerPlayer,
          category: 'CARD',
          reason: card.title,
          timestamp: options.now,
          actorId: player.id,
        });
      }
      state.phase = 'MANAGE_AND_END';
      break;
    }

    case 'REPAIR_BUILDINGS': {
      let houses = 0;
      let hotels = 0;
      for (const asset of Object.values(state.assets)) {
        if (asset.ownerPlayerId === player.id) {
          houses += asset.houseCount;
          hotels += asset.hotelCount;
        }
      }
      const totalRepair = houses * eff.perHouse + hotels * eff.perHotel;
      if (totalRepair > 0) {
        const res = transferCredits(state, events, {
          from: player.id,
          to: 'BANK',
          amount: totalRepair,
          category: 'CARD',
          reason: `${card.title} (${houses}M, ${hotels}H)`,
          timestamp: options.now,
          actorId: player.id,
          mandatory: true,
          routeTaxToJackpot: true,
        });
        if (res.completed) {
          state.phase = 'MANAGE_AND_END';
        }
      } else {
        state.phase = 'MANAGE_AND_END';
      }
      break;
    }

    case 'GET_OUT_OF_JAIL': {
      player.heldCards.push({
        cardId: card.id,
        deckType: card.deckType,
        title: card.title,
        description: card.description,
      });
      state.phase = 'MANAGE_AND_END';
      break;
    }

    case 'GO_TO_JAIL': {
      sendPlayerToJail(state, events, player, card.title, options.now);
      break;
    }

    case 'MOVE_TO': {
      advancePlayerToIndex(
        state,
        events,
        player,
        eff.targetIndex,
        eff.collectStartBonus,
        options.now,
        pack,
      );
      resolveSpaceLanding(state, pack, events, player, options, depth);
      break;
    }

    case 'MOVE_STEPS': {
      const nextPos = (((player.position + eff.steps) % 40) + 40) % 40;
      const passedStart = eff.steps > 0 && player.position + eff.steps >= 40;
      player.position = nextPos;
      if (passedStart && state.ruleset.passStartBonus > 0) {
        transferCredits(state, events, {
          from: 'BANK',
          to: player.id,
          amount: state.ruleset.passStartBonus,
          category: 'MOVEMENT',
          reason: 'Passage par Départ',
          timestamp: options.now,
          actorId: player.id,
          spaceIndex: 0,
        });
      }
      appendActivityLog(state, events, {
        timestamp: options.now,
        category: 'MOVEMENT',
        actorId: player.id,
        spaceIndex: nextPos,
        message: `${player.displayName} se déplace sur ${pack.spaces[nextPos]!.name} (#${nextPos}).`,
        eventType: 'movement:resolved',
        eventPayload: { playerId: player.id, to: nextPos },
      });
      resolveSpaceLanding(state, pack, events, player, options, depth);
      break;
    }

    case 'MOVE_TO_NEAREST_TRANSPORT': {
      const transports = [5, 15, 25, 35];
      const nextTransport = transports.find((idx) => idx > player.position) ?? transports[0]!;
      state.rentMultiplierOverride = eff.rentMultiplier;
      advancePlayerToIndex(state, events, player, nextTransport, true, options.now, pack);
      resolveSpaceLanding(state, pack, events, player, options, depth);
      break;
    }

    case 'MOVE_TO_NEAREST_UTILITY': {
      const utilities = [12, 28];
      const nextUtility = utilities.find((idx) => idx > player.position) ?? utilities[0]!;
      state.utilityDiceMultiplierOverride = eff.diceMultiplier;
      advancePlayerToIndex(state, events, player, nextUtility, true, options.now, pack);
      resolveSpaceLanding(state, pack, events, player, options, depth);
      break;
    }
  }
}

function advanceTurnToNextPlayer(
  state: GameState,
  pack: BoardPackDefinition,
  events: DomainEvent[],
  now: number,
): void {
  // Vérifier la limite de durée éventuelle
  if (state.ruleset.maxDurationMinutes !== null) {
    const deadline = state.startedAt + state.ruleset.maxDurationMinutes * 60 * 1000;
    if (now >= deadline) {
      state.status = 'FINISHED';
      state.phase = 'GAME_OVER';
      state.endedAt = now;
      state.finalStandings = computeStandings(state, pack);
      state.winnerPlayerId = state.finalStandings[0]?.playerId ?? null;
      const top = state.finalStandings[0];
      appendActivityLog(state, events, {
        timestamp: now,
        category: 'SYSTEM',
        actorId: state.winnerPlayerId,
        message: `Temps réglementaire écoulé ! ${top?.displayName ?? 'Le leader'} l’emporte au patrimoine net (${top?.netWorth ?? 0} Cr).`,
        eventType: 'game:ended',
        eventPayload: {
          winnerPlayerId: state.winnerPlayerId,
          standings: state.finalStandings,
          reason: 'Limite de durée atteinte',
        },
      });
      return;
    }
  }

  if (checkAndFinalizeVictory(state, pack, events, now)) {
    return;
  }

  const currentPlayer = state.players.find((p) => p.id === state.currentPlayerId);
  if (
    currentPlayer &&
    currentPlayer.bankruptcyStatus === 'SOLVENT' &&
    state.extraRollGranted &&
    !currentPlayer.inJail
  ) {
    state.hasRolledThisTurn = false;
    state.extraRollGranted = false;
    state.phase = 'ROLL_DICE';
    appendActivityLog(state, events, {
      timestamp: now,
      category: 'DICE',
      actorId: currentPlayer.id,
      message: `${currentPlayer.displayName} bénéficie d’un lancer supplémentaire grâce à son double !`,
      eventType: 'turn:updated',
      eventPayload: { currentPlayerId: currentPlayer.id, turnNumber: state.turnNumber },
    });
    return;
  }

  if (currentPlayer) {
    currentPlayer.consecutiveDoubles = 0;
  }

  const ordered = [...state.players].sort((a, b) => a.orderIndex - b.orderIndex);
  const currentIdx = ordered.findIndex((p) => p.id === state.currentPlayerId);
  let nextPlayer: PlayerState | null = null;

  for (let offset = 1; offset <= ordered.length; offset++) {
    const candidate = ordered[(currentIdx + offset) % ordered.length]!;
    if (candidate.bankruptcyStatus !== 'BANKRUPT') {
      nextPlayer = candidate;
      break;
    }
  }

  if (!nextPlayer) {
    checkAndFinalizeVictory(state, pack, events, now);
    return;
  }

  state.currentPlayerId = nextPlayer.id;
  state.turnNumber += 1;
  state.hasRolledThisTurn = false;
  state.extraRollGranted = false;
  state.pendingBuySpaceIndex = null;
  state.phase = 'ROLL_DICE';

  appendActivityLog(state, events, {
    timestamp: now,
    category: 'SYSTEM',
    actorId: nextPlayer.id,
    message: `Tour #${state.turnNumber} — c’est au tour de ${nextPlayer.displayName}.`,
    eventType: 'turn:updated',
    eventPayload: { currentPlayerId: nextPlayer.id, turnNumber: state.turnNumber },
  });
}

function executeBankruptcy(
  state: GameState,
  pack: BoardPackDefinition,
  events: DomainEvent[],
  debtor: PlayerState,
  creditorId: string | 'BANK',
  now: number,
): void {
  // 1. Vendre d'abord tous les bâtiments du débiteur à la banque (50 %)
  let buildingLiquidationCash = 0;
  for (const space of pack.spaces) {
    const asset = state.assets[space.index];
    if (!asset || asset.ownerPlayerId !== debtor.id) continue;
    const refundPerUnit = Math.floor(space.houseCost * state.ruleset.buildingSellRate);
    if (asset.hotelCount > 0) {
      buildingLiquidationCash += 5 * refundPerUnit;
      state.bankHotelsAvailable = Math.min(
        state.ruleset.maxHotelsStock,
        state.bankHotelsAvailable + asset.hotelCount,
      );
      asset.hotelCount = 0;
    }
    if (asset.houseCount > 0) {
      buildingLiquidationCash += asset.houseCount * refundPerUnit;
      state.bankHousesAvailable = Math.min(
        state.ruleset.maxHousesStock,
        state.bankHousesAvailable + asset.houseCount,
      );
      asset.houseCount = 0;
    }
  }
  debtor.cash += buildingLiquidationCash;

  // Annuler toutes les offres d'échange en attente impliquant le débiteur
  for (const trade of state.trades) {
    if (
      trade.status === 'PENDING' &&
      (trade.proposerId === debtor.id || trade.targetId === debtor.id)
    ) {
      trade.status = 'CANCELLED';
    }
  }

  const foreclosedSpaces: number[] = [];

  if (creditorId !== 'BANK') {
    const creditor = getPlayerOrThrow(state, creditorId);
    const cashTransferred = debtor.cash;
    if (cashTransferred > 0) {
      transferCredits(state, events, {
        from: debtor.id,
        to: creditor.id,
        amount: cashTransferred,
        category: 'BANKRUPTCY',
        reason: `Liquidation de faillite de ${debtor.displayName}`,
        timestamp: now,
        actorId: debtor.id,
      });
    }

    // Transférer les propriétés (en conservant leur statut d'hypothèque)
    for (const asset of Object.values(state.assets)) {
      if (asset.ownerPlayerId === debtor.id) {
        asset.ownerPlayerId = creditor.id;
      }
    }

    // Transférer les cartes Sortie de prison conservées
    if (debtor.heldCards.length > 0) {
      creditor.heldCards.push(...debtor.heldCards);
      debtor.heldCards = [];
    }
  } else {
    // Faillite envers la Banque
    if (debtor.cash > 0) {
      transferCredits(state, events, {
        from: debtor.id,
        to: 'BANK',
        amount: debtor.cash,
        category: 'BANKRUPTCY',
        reason: `Saisie bancaire (${debtor.displayName})`,
        timestamp: now,
        actorId: debtor.id,
      });
    }

    for (const asset of Object.values(state.assets)) {
      if (asset.ownerPlayerId === debtor.id) {
        asset.ownerPlayerId = null;
        asset.isMortgaged = false;
        asset.houseCount = 0;
        asset.hotelCount = 0;
        foreclosedSpaces.push(asset.spaceIndex);
      }
    }

    // Réintégrer les cartes Sortie de prison dans leur paquet
    for (const hc of debtor.heldCards) {
      if (hc.deckType === 'EVENT') {
        state.eventDeckOrder.push(hc.cardId);
      } else {
        state.communityDeckOrder.push(hc.cardId);
      }
    }
    debtor.heldCards = [];
  }

  debtor.cash = 0;
  debtor.inJail = false;
  debtor.bankruptcyStatus = 'BANKRUPT';
  state.pendingDebt = null;
  state.extraRollGranted = false;

  appendActivityLog(state, events, {
    timestamp: now,
    category: 'BANKRUPTCY',
    actorId: debtor.id,
    message:
      creditorId === 'BANK'
        ? `${debtor.displayName} fait faillite envers la Banque ! Ses propriétés retournent aux enchères.`
        : `${debtor.displayName} fait faillite ! Ses actifs sont transférés à ${getPlayerOrThrow(state, creditorId).displayName}.`,
    eventType: 'player:bankrupt',
    eventPayload: { playerId: debtor.id, creditorId },
  });

  if (checkAndFinalizeVictory(state, pack, events, now)) {
    return;
  }

  if (creditorId === 'BANK' && foreclosedSpaces.length > 0 && state.ruleset.auctionEnabled) {
    const [firstIdx, ...rest] = foreclosedSpaces;
    if (firstIdx !== undefined) {
      startAuctionForSpace(state, pack, events, firstIdx, rest, now);
      return;
    }
  }

  if (debtor.id === state.currentPlayerId) {
    advanceTurnToNextPlayer(state, pack, events, now);
  }
}

export function applyGameAction(
  currentState: GameState,
  actorPlayerId: string,
  action: GameAction,
  options: EngineExecutionOptions,
): EngineTransitionResult {
  const state = cloneGameState(currentState);
  const events: DomainEvent[] = [];
  const pack = getBoardPack(state.boardPackId);

  if (state.status === 'FINISHED' || state.phase === 'GAME_OVER') {
    throw new DomainRuleError('GAME_NOT_ACTIVE', 'La partie est déjà terminée.');
  }

  // Gestion Pause / Reprise (réservée à l'hôte si activée)
  if (action.type === 'game:pause') {
    if (!state.ruleset.allowHostPause || !options.isHost) {
      throw new DomainRuleError('PERMISSION_DENIED', 'Seul l’hôte peut mettre la partie en pause.');
    }
    if (state.status === 'PAUSED') {
      throw new DomainRuleError('INVALID_PHASE', 'La partie est déjà en pause.');
    }
    state.phaseBeforePause = state.phase;
    state.status = 'PAUSED';
    state.phase = 'PAUSED';
    state.version += 1;
    appendActivityLog(state, events, {
      timestamp: options.now,
      category: 'SYSTEM',
      actorId: actorPlayerId,
      message: 'La partie a été mise en pause par l’hôte.',
    });
    return { state, events };
  }

  if (action.type === 'game:unpause') {
    if (!options.isHost) {
      throw new DomainRuleError('PERMISSION_DENIED', 'Seul l’hôte peut reprendre la partie.');
    }
    if (state.status !== 'PAUSED' || !state.phaseBeforePause) {
      throw new DomainRuleError('INVALID_PHASE', 'La partie n’est pas en pause.');
    }
    state.status = 'ACTIVE';
    state.phase = state.phaseBeforePause;
    state.phaseBeforePause = null;
    state.version += 1;
    appendActivityLog(state, events, {
      timestamp: options.now,
      category: 'SYSTEM',
      actorId: actorPlayerId,
      message: 'La partie reprend !',
    });
    return { state, events };
  }

  if (state.status === 'PAUSED' || state.phase === 'PAUSED') {
    throw new DomainRuleError('GAME_PAUSED', 'La partie est actuellement en pause.');
  }

  const actor = getPlayerOrThrow(state, actorPlayerId);
  if (actor.bankruptcyStatus === 'BANKRUPT') {
    throw new DomainRuleError('PLAYER_BANKRUPT', 'Un joueur en faillite ne peut plus jouer.');
  }

  const isCurrentTurnPlayer = state.currentPlayerId === actor.id;

  switch (action.type) {
    case 'turn:roll': {
      if (!isCurrentTurnPlayer) {
        throw new DomainRuleError('NOT_YOUR_TURN', 'Ce n’est pas votre tour de lancer les dés.');
      }
      if (state.phase !== 'ROLL_DICE') {
        throw new DomainRuleError(
          'INVALID_PHASE',
          'Les dés ne peuvent pas être lancés maintenant.',
        );
      }

      const roll = rollTwoDice(options.rng, options.now);
      state.lastDiceRoll = roll;
      state.hasRolledThisTurn = true;

      appendActivityLog(state, events, {
        timestamp: options.now,
        category: 'DICE',
        actorId: actor.id,
        message: `${actor.displayName} lance ${roll.die1} + ${roll.die2} = ${roll.total}${roll.isDouble ? ' (double !)' : ''}.`,
        eventType: 'dice:rolled',
        eventPayload: { playerId: actor.id, roll },
      });

      if (actor.inJail) {
        if (roll.isDouble) {
          actor.inJail = false;
          actor.jailTurns = 0;
          actor.consecutiveDoubles = 0;
          state.extraRollGranted = false;
          appendActivityLog(state, events, {
            timestamp: options.now,
            category: 'JAIL',
            actorId: actor.id,
            message: `${actor.displayName} obtient un double et sort de détention !`,
            eventType: 'jail:updated',
            eventPayload: { playerId: actor.id, inJail: false },
          });
          const dest = (actor.position + roll.total) % 40;
          advancePlayerToIndex(state, events, actor, dest, true, options.now, pack);
          resolveSpaceLanding(state, pack, events, actor, options);
        } else {
          actor.jailTurns += 1;
          if (actor.jailTurns >= state.ruleset.maxJailTurns) {
            actor.inJail = false;
            actor.jailTurns = 0;
            const fineRes = transferCredits(state, events, {
              from: actor.id,
              to: 'BANK',
              amount: state.ruleset.jailFine,
              category: 'JAIL',
              reason: 'Caution obligatoire (fin de détention)',
              timestamp: options.now,
              actorId: actor.id,
              mandatory: true,
              routeTaxToJackpot: true,
            });
            if (fineRes.completed) {
              const dest = (actor.position + roll.total) % 40;
              advancePlayerToIndex(state, events, actor, dest, true, options.now, pack);
              resolveSpaceLanding(state, pack, events, actor, options);
            }
          } else {
            appendActivityLog(state, events, {
              timestamp: options.now,
              category: 'JAIL',
              actorId: actor.id,
              message: `${actor.displayName} reste en détention (tentative ${actor.jailTurns}/${state.ruleset.maxJailTurns}).`,
            });
            state.phase = 'MANAGE_AND_END';
          }
        }
        break;
      }

      if (roll.isDouble) {
        actor.consecutiveDoubles += 1;
        if (actor.consecutiveDoubles >= 3) {
          sendPlayerToJail(state, events, actor, '3 doubles consécutifs', options.now);
          break;
        }
        state.extraRollGranted = true;
      } else {
        actor.consecutiveDoubles = 0;
        state.extraRollGranted = false;
      }

      const targetIndex = (actor.position + roll.total) % 40;
      const collectStart = actor.position + roll.total >= 40;
      advancePlayerToIndex(state, events, actor, targetIndex, collectStart, options.now, pack);
      resolveSpaceLanding(state, pack, events, actor, options);
      break;
    }

    case 'jail:pay': {
      if (!isCurrentTurnPlayer) {
        throw new DomainRuleError('NOT_YOUR_TURN', 'Attendez votre tour pour payer la caution.');
      }
      if (!actor.inJail || state.phase !== 'ROLL_DICE') {
        throw new DomainRuleError('JAIL_ERROR', 'Vous ne pouvez pas payer la caution maintenant.');
      }
      transferCredits(state, events, {
        from: actor.id,
        to: 'BANK',
        amount: state.ruleset.jailFine,
        category: 'JAIL',
        reason: 'Paiement de la caution de sortie',
        timestamp: options.now,
        actorId: actor.id,
        routeTaxToJackpot: true,
      });
      actor.inJail = false;
      actor.jailTurns = 0;
      appendActivityLog(state, events, {
        timestamp: options.now,
        category: 'JAIL',
        actorId: actor.id,
        message: `${actor.displayName} règle ${state.ruleset.jailFine} Cr et quitte la détention. Il peut lancer les dés.`,
        eventType: 'jail:updated',
        eventPayload: { playerId: actor.id, inJail: false },
      });
      break;
    }

    case 'jail:use-card': {
      if (!isCurrentTurnPlayer) {
        throw new DomainRuleError('NOT_YOUR_TURN', 'Attendez votre tour pour utiliser une carte.');
      }
      if (!actor.inJail || state.phase !== 'ROLL_DICE') {
        throw new DomainRuleError(
          'JAIL_ERROR',
          'Vous n’êtes pas en détention au début de votre tour.',
        );
      }
      const held = actor.heldCards.shift();
      if (!held) {
        throw new DomainRuleError(
          'JAIL_ERROR',
          'Vous ne détenez aucune carte de sortie de prison.',
        );
      }
      if (held.deckType === 'EVENT') {
        state.eventDeckOrder.push(held.cardId);
      } else {
        state.communityDeckOrder.push(held.cardId);
      }
      actor.inJail = false;
      actor.jailTurns = 0;
      appendActivityLog(state, events, {
        timestamp: options.now,
        category: 'JAIL',
        actorId: actor.id,
        message: `${actor.displayName} utilise sa carte « ${held.title} » et sort librement de détention !`,
        eventType: 'jail:updated',
        eventPayload: { playerId: actor.id, inJail: false },
      });
      break;
    }

    case 'property:buy': {
      if (!isCurrentTurnPlayer || state.phase !== 'AWAITING_BUY_DECISION') {
        throw new DomainRuleError('INVALID_PHASE', 'Aucun achat direct disponible actuellement.');
      }
      const spaceIdx = state.pendingBuySpaceIndex;
      if (spaceIdx === null) {
        throw new DomainRuleError('INVALID_SPACE', 'Aucun terrain sélectionné pour l’achat.');
      }
      const space = pack.spaces[spaceIdx]!;
      const asset = state.assets[spaceIdx]!;
      if (asset.ownerPlayerId) {
        throw new DomainRuleError('ALREADY_OWNED', 'Cet actif appartient déjà à un joueur.');
      }

      transferCredits(state, events, {
        from: actor.id,
        to: 'BANK',
        amount: space.price,
        category: 'PURCHASE',
        reason: `Acquisition de ${space.name}`,
        timestamp: options.now,
        actorId: actor.id,
        spaceIndex: spaceIdx,
      });

      asset.ownerPlayerId = actor.id;
      asset.isMortgaged = false;
      state.pendingBuySpaceIndex = null;
      state.phase = 'MANAGE_AND_END';

      appendActivityLog(state, events, {
        timestamp: options.now,
        category: 'PURCHASE',
        actorId: actor.id,
        amount: space.price,
        spaceIndex: spaceIdx,
        message: `${actor.displayName} acquiert ${space.name} pour ${space.price} Cr.`,
        eventType: 'asset:updated',
        eventPayload: { spaceIndex: spaceIdx, asset },
      });
      break;
    }

    case 'property:decline': {
      if (!isCurrentTurnPlayer || state.phase !== 'AWAITING_BUY_DECISION') {
        throw new DomainRuleError('INVALID_PHASE', 'Aucune proposition d’achat en attente.');
      }
      const spaceIdx = state.pendingBuySpaceIndex;
      if (spaceIdx === null) {
        throw new DomainRuleError('INVALID_SPACE', 'Aucune propriété en attente.');
      }
      const space = pack.spaces[spaceIdx]!;
      appendActivityLog(state, events, {
        timestamp: options.now,
        category: 'AUCTION',
        actorId: actor.id,
        spaceIndex: spaceIdx,
        message: `${actor.displayName} décline l’achat direct de ${space.name}.`,
      });
      startAuctionForSpace(state, pack, events, spaceIdx, [], options.now);
      break;
    }

    case 'auction:bid': {
      if (state.phase !== 'AUCTION' || !state.auction) {
        throw new DomainRuleError('AUCTION_ERROR', 'Aucune enchère en cours.');
      }
      const auction = state.auction;
      if (!auction.eligiblePlayerIds.includes(actor.id)) {
        throw new DomainRuleError('AUCTION_ERROR', 'Vous n’êtes pas éligible à cette enchère.');
      }
      if (auction.passedPlayerIds.includes(actor.id)) {
        throw new DomainRuleError('AUCTION_ERROR', 'Vous avez déjà passé sur cette enchère.');
      }
      if (action.amount < auction.minNextBid) {
        throw new DomainRuleError(
          'AUCTION_ERROR',
          `L’offre minimale est de ${auction.minNextBid} Cr.`,
        );
      }
      if (actor.cash < action.amount) {
        throw new DomainRuleError(
          'INSUFFICIENT_FUNDS',
          `Votre offre (${action.amount} Cr) dépasse votre trésorerie (${actor.cash} Cr).`,
        );
      }

      auction.currentBid = action.amount;
      auction.highestBidderId = actor.id;
      auction.minNextBid = action.amount + state.ruleset.auctionMinIncrement;
      auction.expiresAt = options.now + state.ruleset.auctionTimeoutSeconds * 1000;

      const space = pack.spaces[auction.spaceIndex]!;
      appendActivityLog(state, events, {
        timestamp: options.now,
        category: 'AUCTION',
        actorId: actor.id,
        amount: action.amount,
        spaceIndex: auction.spaceIndex,
        message: `${actor.displayName} enchérit ${action.amount} Cr sur ${space.name}.`,
        eventType: 'auction:updated',
        eventPayload: { auction },
      });

      const activeBidders = auction.eligiblePlayerIds.filter(
        (id) => !auction.passedPlayerIds.includes(id),
      );
      if (activeBidders.length === 1 && activeBidders[0] === actor.id) {
        finalizeAuction(state, pack, events, options.now);
      }
      break;
    }

    case 'auction:pass': {
      if (state.phase !== 'AUCTION' || !state.auction) {
        throw new DomainRuleError('AUCTION_ERROR', 'Aucune enchère en cours.');
      }
      const auction = state.auction;
      if (auction.highestBidderId === actor.id) {
        throw new DomainRuleError(
          'AUCTION_ERROR',
          'Vous détenez déjà la meilleure offre en cours.',
        );
      }
      if (!auction.passedPlayerIds.includes(actor.id)) {
        auction.passedPlayerIds.push(actor.id);
      }

      appendActivityLog(state, events, {
        timestamp: options.now,
        category: 'AUCTION',
        actorId: actor.id,
        spaceIndex: auction.spaceIndex,
        message: `${actor.displayName} se retire de l’enchère.`,
        eventType: 'auction:updated',
        eventPayload: { auction },
      });

      const remaining = auction.eligiblePlayerIds.filter(
        (id) => !auction.passedPlayerIds.includes(id),
      );
      if (
        remaining.length === 0 ||
        (remaining.length === 1 && auction.highestBidderId === remaining[0])
      ) {
        finalizeAuction(state, pack, events, options.now);
      }
      break;
    }

    case 'asset:build': {
      if (
        !isCurrentTurnPlayer ||
        (state.phase !== 'MANAGE_AND_END' && state.phase !== 'ROLL_DICE')
      ) {
        throw new DomainRuleError(
          'NOT_YOUR_TURN',
          'La construction est uniquement autorisée pendant votre tour.',
        );
      }
      const check = canBuildOnSpace(state, pack, actor.id, action.spaceIndex);
      if (!check.allowed) {
        throw new DomainRuleError('CANNOT_BUILD', check.reason ?? 'Construction impossible.');
      }
      const space = pack.spaces[action.spaceIndex]!;
      const asset = state.assets[action.spaceIndex]!;

      transferCredits(state, events, {
        from: actor.id,
        to: 'BANK',
        amount: check.cost,
        category: 'BUILD',
        reason: `Construction sur ${space.name}`,
        timestamp: options.now,
        actorId: actor.id,
        spaceIndex: space.index,
      });

      let labelBuilt: string;
      if (asset.houseCount === 4) {
        asset.houseCount = 0;
        asset.hotelCount = 1;
        state.bankHousesAvailable += 4;
        state.bankHotelsAvailable -= 1;
        labelBuilt = 'un hôtel';
      } else {
        asset.houseCount += 1;
        state.bankHousesAvailable -= 1;
        labelBuilt = `une maison (${asset.houseCount}/4)`;
      }

      appendActivityLog(state, events, {
        timestamp: options.now,
        category: 'BUILD',
        actorId: actor.id,
        amount: check.cost,
        spaceIndex: space.index,
        message: `${actor.displayName} construit ${labelBuilt} sur ${space.name}.`,
        eventType: 'asset:updated',
        eventPayload: {
          spaceIndex: space.index,
          asset,
          bankHousesAvailable: state.bankHousesAvailable,
          bankHotelsAvailable: state.bankHotelsAvailable,
        },
      });
      break;
    }

    case 'asset:sell': {
      const allowedPhase =
        (isCurrentTurnPlayer &&
          (state.phase === 'MANAGE_AND_END' || state.phase === 'ROLL_DICE')) ||
        (state.phase === 'DEBT_RESOLUTION' && state.pendingDebt?.debtorId === actor.id);

      if (!allowedPhase) {
        throw new DomainRuleError(
          'INVALID_PHASE',
          'Vous ne pouvez pas vendre de bâtiment maintenant.',
        );
      }

      const check = canSellBuildingOnSpace(state, pack, actor.id, action.spaceIndex);
      if (!check.allowed) {
        throw new DomainRuleError('CANNOT_SELL_BUILDING', check.reason ?? 'Vente impossible.');
      }

      const space = pack.spaces[action.spaceIndex]!;
      const asset = state.assets[action.spaceIndex]!;

      if (asset.hotelCount > 0) {
        asset.hotelCount = 0;
        asset.houseCount = 4;
        state.bankHotelsAvailable += 1;
        state.bankHousesAvailable -= 4;
      } else {
        asset.houseCount -= 1;
        state.bankHousesAvailable += 1;
      }

      transferCredits(state, events, {
        from: 'BANK',
        to: actor.id,
        amount: check.refund,
        category: 'BUILD',
        reason: `Vente d’un bâtiment sur ${space.name}`,
        timestamp: options.now,
        actorId: actor.id,
        spaceIndex: space.index,
      });

      appendActivityLog(state, events, {
        timestamp: options.now,
        category: 'BUILD',
        actorId: actor.id,
        amount: check.refund,
        spaceIndex: space.index,
        message: `${actor.displayName} revend un bâtiment sur ${space.name} (+${check.refund} Cr).`,
        eventType: 'asset:updated',
        eventPayload: { spaceIndex: space.index, asset },
      });
      break;
    }

    case 'asset:mortgage': {
      const allowedPhase =
        (isCurrentTurnPlayer &&
          (state.phase === 'MANAGE_AND_END' || state.phase === 'ROLL_DICE')) ||
        (state.phase === 'DEBT_RESOLUTION' && state.pendingDebt?.debtorId === actor.id);

      if (!allowedPhase) {
        throw new DomainRuleError('INVALID_PHASE', 'Hypothèque non autorisée hors de votre tour.');
      }

      const check = canMortgageSpace(state, pack, actor.id, action.spaceIndex);
      if (!check.allowed) {
        throw new DomainRuleError('CANNOT_MORTGAGE', check.reason ?? 'Hypothèque impossible.');
      }

      const space = pack.spaces[action.spaceIndex]!;
      const asset = state.assets[action.spaceIndex]!;
      asset.isMortgaged = true;

      transferCredits(state, events, {
        from: 'BANK',
        to: actor.id,
        amount: check.payout,
        category: 'MORTGAGE',
        reason: `Hypothèque de ${space.name}`,
        timestamp: options.now,
        actorId: actor.id,
        spaceIndex: space.index,
      });

      appendActivityLog(state, events, {
        timestamp: options.now,
        category: 'MORTGAGE',
        actorId: actor.id,
        amount: check.payout,
        spaceIndex: space.index,
        message: `${actor.displayName} hypothèque ${space.name} (+${check.payout} Cr).`,
        eventType: 'asset:updated',
        eventPayload: { spaceIndex: space.index, asset },
      });
      break;
    }

    case 'asset:redeem': {
      if (
        !isCurrentTurnPlayer ||
        (state.phase !== 'MANAGE_AND_END' && state.phase !== 'ROLL_DICE')
      ) {
        throw new DomainRuleError('NOT_YOUR_TURN', 'Levée d’hypothèque réservée à votre tour.');
      }
      const check = canRedeemSpace(state, pack, actor.id, action.spaceIndex);
      if (!check.allowed) {
        throw new DomainRuleError('CANNOT_REDEEM', check.reason ?? 'Levée impossible.');
      }
      const space = pack.spaces[action.spaceIndex]!;
      const asset = state.assets[action.spaceIndex]!;

      transferCredits(state, events, {
        from: actor.id,
        to: 'BANK',
        amount: check.cost,
        category: 'MORTGAGE',
        reason: `Levée d’hypothèque de ${space.name}`,
        timestamp: options.now,
        actorId: actor.id,
        spaceIndex: space.index,
      });

      asset.isMortgaged = false;
      appendActivityLog(state, events, {
        timestamp: options.now,
        category: 'MORTGAGE',
        actorId: actor.id,
        amount: check.cost,
        spaceIndex: space.index,
        message: `${actor.displayName} lève l’hypothèque de ${space.name} (${check.cost} Cr).`,
        eventType: 'asset:updated',
        eventPayload: { spaceIndex: space.index, asset },
      });
      break;
    }

    case 'trade:propose': {
      if (state.phase === 'AUCTION') {
        throw new DomainRuleError(
          'TRADE_ERROR',
          'Attendez la fin de l’enchère en cours avant de proposer un échange.',
        );
      }
      if (action.targetPlayerId === actor.id) {
        throw new DomainRuleError('TRADE_ERROR', 'Impossible d’échanger avec vous-même.');
      }
      const target = getPlayerOrThrow(state, action.targetPlayerId);
      if (target.bankruptcyStatus === 'BANKRUPT') {
        throw new DomainRuleError('TRADE_ERROR', 'Ce joueur est en faillite.');
      }

      const offeredUnique = [...new Set(action.offeredSpaceIndices)];
      const requestedUnique = [...new Set(action.requestedSpaceIndices)];

      const hasAnyValue =
        offeredUnique.length > 0 ||
        requestedUnique.length > 0 ||
        action.offeredCash > 0 ||
        action.requestedCash > 0 ||
        action.offeredJailCards > 0 ||
        action.requestedJailCards > 0;

      if (!hasAnyValue) {
        throw new DomainRuleError('TRADE_ERROR', 'L’offre d’échange est vide.');
      }

      if (actor.cash < action.offeredCash) {
        throw new DomainRuleError(
          'INSUFFICIENT_FUNDS',
          'Vous ne disposez pas des crédits proposés dans l’échange.',
        );
      }
      if (actor.heldCards.length < action.offeredJailCards) {
        throw new DomainRuleError('TRADE_ERROR', 'Cartes de sortie proposées insuffisantes.');
      }
      if (target.heldCards.length < action.requestedJailCards) {
        throw new DomainRuleError(
          'TRADE_ERROR',
          'Le destinataire ne possède pas autant de cartes de sortie.',
        );
      }

      for (const idx of offeredUnique) {
        const space = pack.spaces[idx];
        const asset = state.assets[idx];
        if (!space || !asset || asset.ownerPlayerId !== actor.id) {
          throw new DomainRuleError('TRADE_ERROR', 'Vous ne possédez pas tous les actifs offerts.');
        }
        if (space.groupCode && groupHasAnyBuilding(state, pack, space.groupCode)) {
          throw new DomainRuleError(
            'TRADE_ERROR',
            `Vendez d’abord les bâtiments du groupe avant d’échanger ${space.name}.`,
          );
        }
      }

      for (const idx of requestedUnique) {
        const space = pack.spaces[idx];
        const asset = state.assets[idx];
        if (!space || !asset || asset.ownerPlayerId !== target.id) {
          throw new DomainRuleError(
            'TRADE_ERROR',
            `${target.displayName} ne possède pas tous les actifs demandés.`,
          );
        }
        if (space.groupCode && groupHasAnyBuilding(state, pack, space.groupCode)) {
          throw new DomainRuleError(
            'TRADE_ERROR',
            `Des bâtiments bloquent l’échange de ${space.name}.`,
          );
        }
      }

      const offer = {
        id: `trd-${state.nextSequence}`,
        proposerId: actor.id,
        targetId: target.id,
        offeredSpaceIndices: offeredUnique,
        requestedSpaceIndices: requestedUnique,
        offeredCash: action.offeredCash,
        requestedCash: action.requestedCash,
        offeredJailCards: action.offeredJailCards,
        requestedJailCards: action.requestedJailCards,
        status: 'PENDING' as const,
        createdAt: options.now,
        ...(action.note ? { note: action.note } : {}),
      };

      state.trades.push(offer);
      appendActivityLog(state, events, {
        timestamp: options.now,
        category: 'TRADE',
        actorId: actor.id,
        message: `${actor.displayName} propose un échange commercial à ${target.displayName}.`,
        eventType: 'trade:created',
        eventPayload: { trade: offer },
      });
      break;
    }

    case 'trade:accept': {
      const trade = state.trades.find((t) => t.id === action.tradeId && t.status === 'PENDING');
      if (!trade) {
        throw new DomainRuleError('TRADE_ERROR', 'Offre d’échange introuvable ou expirée.');
      }
      if (trade.targetId !== actor.id) {
        throw new DomainRuleError(
          'PERMISSION_DENIED',
          'Seul le destinataire de l’offre peut l’accepter.',
        );
      }

      const proposer = getPlayerOrThrow(state, trade.proposerId);
      const target = actor;

      if (proposer.bankruptcyStatus === 'BANKRUPT') {
        throw new DomainRuleError('TRADE_ERROR', 'L’initiateur de l’échange est en faillite.');
      }
      if (proposer.cash < trade.offeredCash) {
        throw new DomainRuleError(
          'INSUFFICIENT_FUNDS',
          `${proposer.displayName} n’a plus la trésorerie proposée.`,
        );
      }
      if (target.cash < trade.requestedCash) {
        throw new DomainRuleError(
          'INSUFFICIENT_FUNDS',
          `Votre trésorerie est insuffisante pour accepter (${trade.requestedCash} Cr requis).`,
        );
      }
      if (
        proposer.heldCards.length < trade.offeredJailCards ||
        target.heldCards.length < trade.requestedJailCards
      ) {
        throw new DomainRuleError('TRADE_ERROR', 'Les cartes conservées ne sont plus disponibles.');
      }

      for (const idx of trade.offeredSpaceIndices) {
        const space = pack.spaces[idx];
        const asset = state.assets[idx];
        if (!space || !asset || asset.ownerPlayerId !== proposer.id) {
          throw new DomainRuleError('TRADE_ERROR', 'Un actif offert a changé de propriétaire.');
        }
        if (space.groupCode && groupHasAnyBuilding(state, pack, space.groupCode)) {
          throw new DomainRuleError('TRADE_ERROR', 'Un groupe offert comporte des bâtiments.');
        }
      }

      for (const idx of trade.requestedSpaceIndices) {
        const space = pack.spaces[idx];
        const asset = state.assets[idx];
        if (!space || !asset || asset.ownerPlayerId !== target.id) {
          throw new DomainRuleError(
            'TRADE_ERROR',
            'Un actif demandé n’est plus en votre possession.',
          );
        }
        if (space.groupCode && groupHasAnyBuilding(state, pack, space.groupCode)) {
          throw new DomainRuleError('TRADE_ERROR', 'Un groupe demandé comporte des bâtiments.');
        }
      }

      if (trade.offeredCash > 0) {
        transferCredits(state, events, {
          from: proposer.id,
          to: target.id,
          amount: trade.offeredCash,
          category: 'TRADE',
          reason: `Échange avec ${target.displayName}`,
          timestamp: options.now,
          actorId: actor.id,
        });
      }
      if (trade.requestedCash > 0) {
        transferCredits(state, events, {
          from: target.id,
          to: proposer.id,
          amount: trade.requestedCash,
          category: 'TRADE',
          reason: `Échange avec ${proposer.displayName}`,
          timestamp: options.now,
          actorId: actor.id,
        });
      }

      for (const idx of trade.offeredSpaceIndices) {
        state.assets[idx]!.ownerPlayerId = target.id;
      }
      for (const idx of trade.requestedSpaceIndices) {
        state.assets[idx]!.ownerPlayerId = proposer.id;
      }

      if (trade.offeredJailCards > 0) {
        const moved = proposer.heldCards.splice(0, trade.offeredJailCards);
        target.heldCards.push(...moved);
      }
      if (trade.requestedJailCards > 0) {
        const moved = target.heldCards.splice(0, trade.requestedJailCards);
        proposer.heldCards.push(...moved);
      }

      trade.status = 'ACCEPTED';
      appendActivityLog(state, events, {
        timestamp: options.now,
        category: 'TRADE',
        actorId: actor.id,
        message: `${target.displayName} accepte l’échange proposé par ${proposer.displayName} !`,
        eventType: 'trade:completed',
        eventPayload: { trade },
      });
      break;
    }

    case 'trade:reject': {
      const trade = state.trades.find((t) => t.id === action.tradeId && t.status === 'PENDING');
      if (!trade || trade.targetId !== actor.id) {
        throw new DomainRuleError('TRADE_ERROR', 'Impossible de refuser cette offre.');
      }
      trade.status = 'REJECTED';
      appendActivityLog(state, events, {
        timestamp: options.now,
        category: 'TRADE',
        actorId: actor.id,
        message: `${actor.displayName} refuse l’offre d’échange.`,
        eventType: 'trade:updated',
        eventPayload: { trade },
      });
      break;
    }

    case 'trade:cancel': {
      const trade = state.trades.find((t) => t.id === action.tradeId && t.status === 'PENDING');
      if (!trade || trade.proposerId !== actor.id) {
        throw new DomainRuleError('TRADE_ERROR', 'Impossible d’annuler cette offre.');
      }
      trade.status = 'CANCELLED';
      appendActivityLog(state, events, {
        timestamp: options.now,
        category: 'TRADE',
        actorId: actor.id,
        message: `${actor.displayName} annule sa proposition d’échange.`,
        eventType: 'trade:updated',
        eventPayload: { trade },
      });
      break;
    }

    case 'debt:settle': {
      if (state.phase !== 'DEBT_RESOLUTION' || !state.pendingDebt) {
        throw new DomainRuleError('DEBT_ERROR', 'Aucune dette en attente de règlement.');
      }
      if (state.pendingDebt.debtorId !== actor.id) {
        throw new DomainRuleError('PERMISSION_DENIED', 'Cette dette concerne un autre joueur.');
      }
      const debt = state.pendingDebt;
      if (actor.cash < debt.amount) {
        throw new DomainRuleError(
          'INSUFFICIENT_FUNDS',
          `Il vous manque encore ${debt.amount - actor.cash} Cr pour régler votre dette.`,
        );
      }

      transferCredits(state, events, {
        from: actor.id,
        to: debt.creditorId,
        amount: debt.amount,
        category: 'RENT',
        reason: `Règlement : ${debt.reason}`,
        timestamp: options.now,
        actorId: actor.id,
        routeTaxToJackpot: debt.creditorId === 'BANK',
      });

      actor.bankruptcyStatus = 'SOLVENT';
      state.pendingDebt = null;
      state.phase = 'MANAGE_AND_END';
      break;
    }

    case 'player:declare-bankruptcy': {
      if (
        state.phase === 'DEBT_RESOLUTION' &&
        state.pendingDebt &&
        state.pendingDebt.debtorId === actor.id
      ) {
        executeBankruptcy(state, pack, events, actor, state.pendingDebt.creditorId, options.now);
      } else {
        // Abandon volontaire du joueur vers la Banque
        const wasCurrent = state.currentPlayerId === actor.id;
        executeBankruptcy(state, pack, events, actor, 'BANK', options.now);
        if (!wasCurrent && state.status === 'ACTIVE' && state.phase !== 'AUCTION') {
          // Ne pas perturber le tour d'un autre joueur s'il jouait déjà
        }
      }
      break;
    }

    case 'turn:end': {
      if (!isCurrentTurnPlayer) {
        throw new DomainRuleError('NOT_YOUR_TURN', 'Seul le joueur actif peut terminer son tour.');
      }
      if (state.phase !== 'MANAGE_AND_END') {
        throw new DomainRuleError(
          'INVALID_PHASE',
          'Terminez d’abord l’action obligatoire en cours avant de finir votre tour.',
        );
      }
      advanceTurnToNextPlayer(state, pack, events, options.now);
      break;
    }
  }

  state.version += 1;
  return { state, events };
}

/**
 * Clôture automatique d'une enchère arrivée à expiration côté serveur.
 */
export function expireAuctionIfDue(
  currentState: GameState,
  now: number,
): EngineTransitionResult | null {
  if (
    currentState.status !== 'ACTIVE' ||
    currentState.phase !== 'AUCTION' ||
    !currentState.auction ||
    now < currentState.auction.expiresAt
  ) {
    return null;
  }

  const state = cloneGameState(currentState);
  const events: DomainEvent[] = [];
  const pack = getBoardPack(state.boardPackId);
  finalizeAuction(state, pack, events, now);
  state.version += 1;
  return { state, events };
}

/**
 * Applique la politique configurée lorsqu'un joueur déconnecté dépasse le délai de grâce.
 */
export function applyDisconnectTimeoutPolicy(
  currentState: GameState,
  disconnectedPlayerId: string,
  options: EngineExecutionOptions,
): EngineTransitionResult | null {
  if (currentState.status !== 'ACTIVE') return null;

  const target = currentState.players.find((p) => p.id === disconnectedPlayerId);
  if (!target || target.bankruptcyStatus === 'BANKRUPT') return null;

  const policy = currentState.ruleset.disconnectPolicy;

  if (policy === 'PAUSE') {
    const state = cloneGameState(currentState);
    const events: DomainEvent[] = [];
    state.phaseBeforePause = state.phase;
    state.status = 'PAUSED';
    state.phase = 'PAUSED';
    state.version += 1;
    appendActivityLog(state, events, {
      timestamp: options.now,
      category: 'SYSTEM',
      actorId: target.id,
      message: `Partie mise en pause suite à la déconnexion prolongée de ${target.displayName}.`,
    });
    return { state, events };
  }

  if (policy === 'ABANDON') {
    return applyGameAction(currentState, target.id, { type: 'player:declare-bankruptcy' }, options);
  }

  // AUTO_PASS : effectue l'action automatique minimale sûre si le joueur bloque la partie
  if (currentState.phase === 'AUCTION' && currentState.auction) {
    if (
      currentState.auction.eligiblePlayerIds.includes(target.id) &&
      !currentState.auction.passedPlayerIds.includes(target.id) &&
      currentState.auction.highestBidderId !== target.id
    ) {
      return applyGameAction(currentState, target.id, { type: 'auction:pass' }, options);
    }
    return null;
  }

  if (currentState.currentPlayerId !== target.id) return null;

  if (currentState.phase === 'ROLL_DICE') {
    return applyGameAction(currentState, target.id, { type: 'turn:roll' }, options);
  }
  if (currentState.phase === 'AWAITING_BUY_DECISION') {
    return applyGameAction(currentState, target.id, { type: 'property:decline' }, options);
  }
  if (currentState.phase === 'MANAGE_AND_END') {
    return applyGameAction(currentState, target.id, { type: 'turn:end' }, options);
  }
  if (currentState.phase === 'DEBT_RESOLUTION') {
    return applyGameAction(currentState, target.id, { type: 'player:declare-bankruptcy' }, options);
  }

  return null;
}
