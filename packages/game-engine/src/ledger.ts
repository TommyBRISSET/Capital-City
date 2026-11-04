import type {
  ActivityCategory,
  ActivityLogEntry,
  GameState,
  PlayerState,
} from '@capital-city/shared';
import { DomainRuleError } from './errors';

export interface DomainEvent {
  type: string;
  actorId: string | null;
  payload: Record<string, unknown>;
}

export function appendActivityLog(
  state: GameState,
  events: DomainEvent[],
  params: {
    timestamp: number;
    category: ActivityCategory;
    actorId: string | null;
    message: string;
    amount?: number;
    payerId?: string | 'BANK' | 'JACKPOT';
    payeeId?: string | 'BANK' | 'JACKPOT';
    spaceIndex?: number;
    cardTitle?: string;
    eventType?: string;
    eventPayload?: Record<string, unknown>;
  },
): ActivityLogEntry {
  const sequence = state.nextSequence;
  state.nextSequence += 1;

  const entry: ActivityLogEntry = {
    id: `evt-${sequence}`,
    sequence,
    timestamp: params.timestamp,
    category: params.category,
    actorId: params.actorId,
    message: params.message,
    ...(params.amount !== undefined ? { amount: params.amount } : {}),
    ...(params.payerId !== undefined ? { payerId: params.payerId } : {}),
    ...(params.payeeId !== undefined ? { payeeId: params.payeeId } : {}),
    ...(params.spaceIndex !== undefined ? { spaceIndex: params.spaceIndex } : {}),
    ...(params.cardTitle !== undefined ? { cardTitle: params.cardTitle } : {}),
  };

  state.activityLog.push(entry);
  if (state.activityLog.length > 250) {
    state.activityLog.splice(0, state.activityLog.length - 250);
  }

  events.push({
    type: params.eventType ?? `log:${params.category.toLowerCase()}`,
    actorId: params.actorId,
    payload: {
      sequence,
      message: params.message,
      ...(params.eventPayload ?? {}),
    },
  });

  return entry;
}

function findPlayer(state: GameState, playerId: string): PlayerState {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) {
    throw new DomainRuleError('PLAYER_NOT_FOUND', `Joueur introuvable : ${playerId}`);
  }
  return player;
}

export interface TransferCreditsParams {
  from: string | 'BANK' | 'JACKPOT';
  to: string | 'BANK' | 'JACKPOT';
  amount: number;
  category: ActivityCategory;
  reason: string;
  timestamp: number;
  actorId?: string | null;
  spaceIndex?: number;
  /**
   * Si true, une insolvabilité bascule la partie en phase DEBT_RESOLUTION au lieu de lever une erreur.
   */
  mandatory?: boolean;
  /**
   * Si true et que la règle freeParkingJackpot est active, un paiement vers la banque alimente la cagnotte.
   */
  routeTaxToJackpot?: boolean;
}

/**
 * Fonction transactionnelle centrale unique pour TOUS les mouvements d'argent.
 */
export function transferCredits(
  state: GameState,
  events: DomainEvent[],
  params: TransferCreditsParams,
): { completed: boolean; debtCreated: boolean } {
  const amount = Math.trunc(params.amount);
  if (!Number.isFinite(amount) || amount < 0) {
    throw new DomainRuleError('INSUFFICIENT_FUNDS', 'Montant de transaction invalide.');
  }
  if (amount === 0 || params.from === params.to) {
    return { completed: true, debtCreated: false };
  }

  const effectiveTo: string | 'BANK' | 'JACKPOT' =
    params.to === 'BANK' && params.routeTaxToJackpot && state.ruleset.freeParkingJackpot
      ? 'JACKPOT'
      : params.to;

  if (params.from !== 'BANK' && params.from !== 'JACKPOT') {
    const payer = findPlayer(state, params.from);
    if (payer.cash < amount) {
      if (!params.mandatory) {
        throw new DomainRuleError(
          'INSUFFICIENT_FUNDS',
          `Trésorerie insuffisante (${payer.cash} Cr disponibles pour ${amount} Cr requis).`,
        );
      }

      payer.bankruptcyStatus = 'DEBT_PENDING';
      state.pendingDebt = {
        debtorId: payer.id,
        creditorId: effectiveTo === 'JACKPOT' ? 'BANK' : effectiveTo,
        amount,
        reason: params.reason,
      };
      state.phase = 'DEBT_RESOLUTION';

      appendActivityLog(state, events, {
        timestamp: params.timestamp,
        category: 'BANKRUPTCY',
        actorId: payer.id,
        amount,
        payerId: payer.id,
        payeeId: effectiveTo,
        spaceIndex: params.spaceIndex,
        message: `${payer.displayName} doit régler ${amount} Cr (${params.reason}) mais ne dispose que de ${payer.cash} Cr.`,
        eventType: 'debt:created',
        eventPayload: {
          debtorId: payer.id,
          creditorId: state.pendingDebt.creditorId,
          amount,
          reason: params.reason,
        },
      });

      return { completed: false, debtCreated: true };
    }

    payer.cash -= amount;
  } else if (params.from === 'JACKPOT') {
    state.freeParkingPot = Math.max(0, state.freeParkingPot - amount);
  }

  let payeeLabel = 'la Banque';
  let newPayeeBalance: number | undefined;

  if (effectiveTo === 'JACKPOT') {
    state.freeParkingPot += amount;
    payeeLabel = 'la Cagnotte Pause';
    newPayeeBalance = state.freeParkingPot;
  } else if (effectiveTo !== 'BANK') {
    const payee = findPlayer(state, effectiveTo);
    payee.cash += amount;
    payeeLabel = payee.displayName;
    newPayeeBalance = payee.cash;
  }

  const payerLabel =
    params.from === 'BANK'
      ? 'La Banque'
      : params.from === 'JACKPOT'
        ? 'La Cagnotte Pause'
        : findPlayer(state, params.from).displayName;

  const payerBalance =
    params.from !== 'BANK' && params.from !== 'JACKPOT'
      ? findPlayer(state, params.from).cash
      : undefined;

  appendActivityLog(state, events, {
    timestamp: params.timestamp,
    category: params.category,
    actorId:
      params.actorId ?? (params.from !== 'BANK' && params.from !== 'JACKPOT' ? params.from : null),
    amount,
    payerId: params.from,
    payeeId: effectiveTo,
    spaceIndex: params.spaceIndex,
    message: `${payerLabel} verse ${amount} Cr à ${payeeLabel} (${params.reason}).`,
    eventType: 'money:transferred',
    eventPayload: {
      from: params.from,
      to: effectiveTo,
      amount,
      reason: params.reason,
      payerBalance,
      payeeBalance: newPayeeBalance,
    },
  });

  return { completed: true, debtCreated: false };
}
