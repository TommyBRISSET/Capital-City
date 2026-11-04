import { describe, expect, it } from 'vitest';
import { getBoardPack } from '@capital-city/board-packs';
import type { GameState } from '@capital-city/shared';
import {
  DomainRuleError,
  applyDisconnectTimeoutPolicy,
  applyGameAction,
  calculateRent,
  canBuildOnSpace,
  canSellBuildingOnSpace,
  computeStandings,
  createDiceSequenceRng,
  createInitialGameState,
  expireAuctionIfDue,
  transferCredits,
} from './index';

function makeThreePlayerGame(
  overrides?: Parameters<typeof createInitialGameState>[0]['ruleset'],
): GameState {
  return createInitialGameState({
    gameId: 'game-test-1',
    roomId: 'room-test-1',
    boardPackId: 'asteria-city',
    players: [
      { id: 'p1', userId: 'u1', displayName: 'Alice', tokenId: 'skyline-tower' },
      { id: 'p2', userId: 'u2', displayName: 'Bruno', tokenId: 'luxury-yacht' },
      { id: 'p3', userId: 'u3', displayName: 'Chloé', tokenId: 'maglev-train' },
    ],
    ruleset: overrides,
    rng: createDiceSequenceRng([1, 2, 3, 4]),
    now: 1_000_000,
  });
}

describe('Capital City Pure Game Engine', () => {
  it('validates player count between 2 and 8 at creation', () => {
    expect(() =>
      createInitialGameState({
        gameId: 'bad',
        roomId: 'r',
        boardPackId: 'asteria-city',
        players: [{ id: 'p1', userId: 'u1', displayName: 'Solo', tokenId: 'skyline-tower' }],
        rng: () => 0.2,
        now: 1000,
      }),
    ).toThrow(DomainRuleError);
  });

  it('handles dice roll, movement, passing Start bonus, and exact Start double bonus', () => {
    let state = makeThreePlayerGame({ exactStartDoubleBonus: true, passStartBonus: 200 });
    state.players[0]!.position = 37;

    // 1 + 2 = 3 -> lands exactly on index 0 (Start) -> double bonus = 400 Cr
    const res1 = applyGameAction(
      state,
      'p1',
      { type: 'turn:roll' },
      { rng: createDiceSequenceRng([1, 2]), now: 1_001_000 },
    );
    state = res1.state;
    expect(state.players[0]!.position).toBe(0);
    expect(state.players[0]!.cash).toBe(1900);
    expect(state.phase).toBe('MANAGE_AND_END');

    // End turn -> p2's turn, place p2 at 38, roll 2 + 3 = 5 -> lands on 3 (passes Start -> +200 Cr)
    state = applyGameAction(
      state,
      'p1',
      { type: 'turn:end' },
      { rng: () => 0.1, now: 1_002_000 },
    ).state;
    expect(state.currentPlayerId).toBe('p2');
    state.players[1]!.position = 38;

    state = applyGameAction(
      state,
      'p2',
      { type: 'turn:roll' },
      { rng: createDiceSequenceRng([2, 3]), now: 1_003_000 },
    ).state;
    expect(state.players[1]!.position).toBe(3);
    expect(state.players[1]!.cash).toBe(1700);
    expect(state.phase).toBe('AWAITING_BUY_DECISION');
  });

  it('grants extra roll on doubles and sends player to jail on 3 consecutive doubles', () => {
    let state = makeThreePlayerGame();

    // Double #1: 3 + 3 = 6 (lands on 6, property -> buy -> end turn gives extra roll!)
    state = applyGameAction(
      state,
      'p1',
      { type: 'turn:roll' },
      { rng: createDiceSequenceRng([3, 3]), now: 10_000 },
    ).state;
    expect(state.extraRollGranted).toBe(true);
    state = applyGameAction(
      state,
      'p1',
      { type: 'property:buy' },
      { rng: () => 0.5, now: 11_000 },
    ).state;
    state = applyGameAction(
      state,
      'p1',
      { type: 'turn:end' },
      { rng: () => 0.5, now: 12_000 },
    ).state;
    expect(state.currentPlayerId).toBe('p1');
    expect(state.phase).toBe('ROLL_DICE');

    // Double #2: 2 + 2 = 4 -> lands on 10 (Jail simple visit)
    state = applyGameAction(
      state,
      'p1',
      { type: 'turn:roll' },
      { rng: createDiceSequenceRng([2, 2]), now: 13_000 },
    ).state;
    expect(state.players[0]!.inJail).toBe(false);
    expect(state.players[0]!.position).toBe(10);
    state = applyGameAction(
      state,
      'p1',
      { type: 'turn:end' },
      { rng: () => 0.5, now: 14_000 },
    ).state;
    expect(state.currentPlayerId).toBe('p1');

    // Double #3: 4 + 4 = 8 -> 3rd consecutive double -> sent to jail immediately!
    state = applyGameAction(
      state,
      'p1',
      { type: 'turn:roll' },
      { rng: createDiceSequenceRng([4, 4]), now: 15_000 },
    ).state;
    expect(state.players[0]!.inJail).toBe(true);
    expect(state.players[0]!.position).toBe(10);
    expect(state.extraRollGranted).toBe(false);

    state = applyGameAction(
      state,
      'p1',
      { type: 'turn:end' },
      { rng: () => 0.5, now: 16_000 },
    ).state;
    expect(state.currentPlayerId).toBe('p2');
  });

  it('computes rents accurately for bare properties, full color groups, transports, utilities, and mortgages', () => {
    const pack = getBoardPack('asteria-city');
    const state = makeThreePlayerGame();

    // Single G1 property (space 1: base rent 2)
    state.assets[1]!.ownerPlayerId = 'p2';
    expect(calculateRent(state, pack, 1, 7)).toBe(2);

    // Full G1 group (spaces 1 and 3) -> rent doubles to 4 on space 1!
    state.assets[3]!.ownerPlayerId = 'p2';
    expect(calculateRent(state, pack, 1, 7)).toBe(4);

    // Mortgaged space collects 0 rent
    state.assets[1]!.isMortgaged = true;
    expect(calculateRent(state, pack, 1, 7)).toBe(0);
    // Unmortgaged partner in full group still collects double bare rent
    expect(calculateRent(state, pack, 3, 7)).toBe(8);

    // Transports: 1->25, 2->50, 3->100, 4->200
    state.assets[5]!.ownerPlayerId = 'p2';
    expect(calculateRent(state, pack, 5, 7)).toBe(25);
    state.assets[15]!.ownerPlayerId = 'p2';
    expect(calculateRent(state, pack, 5, 7)).toBe(50);
    state.assets[25]!.ownerPlayerId = 'p2';
    expect(calculateRent(state, pack, 5, 7)).toBe(100);
    state.assets[35]!.ownerPlayerId = 'p2';
    expect(calculateRent(state, pack, 5, 7)).toBe(200);

    // Utilities: 1->4x dice, 2->10x dice
    state.assets[12]!.ownerPlayerId = 'p3';
    expect(calculateRent(state, pack, 12, 8)).toBe(32);
    state.assets[28]!.ownerPlayerId = 'p3';
    expect(calculateRent(state, pack, 12, 8)).toBe(80);
  });

  it('opens an auction on decline, allows declining player to bid, and awards highest bidder atomically', () => {
    let state = makeThreePlayerGame();

    // p1 rolls 1 + 2 = 3 -> space 3 (price 60)
    state = applyGameAction(
      state,
      'p1',
      { type: 'turn:roll' },
      { rng: createDiceSequenceRng([1, 2]), now: 1000 },
    ).state;
    expect(state.phase).toBe('AWAITING_BUY_DECISION');

    // p1 declines -> AUCTION starts!
    state = applyGameAction(
      state,
      'p1',
      { type: 'property:decline' },
      { rng: () => 0.1, now: 2000 },
    ).state;
    expect(state.phase).toBe('AUCTION');
    expect(state.auction?.eligiblePlayerIds).toEqual(['p1', 'p2', 'p3']);

    // p1 (who declined) bids 20 Cr!
    state = applyGameAction(
      state,
      'p1',
      { type: 'auction:bid', amount: 20 },
      { rng: () => 0.1, now: 3000 },
    ).state;
    // p2 bids 35 Cr
    state = applyGameAction(
      state,
      'p2',
      { type: 'auction:bid', amount: 35 },
      { rng: () => 0.1, now: 4000 },
    ).state;
    // p1 and p3 pass -> p2 wins space 3 for 35 Cr!
    state = applyGameAction(
      state,
      'p1',
      { type: 'auction:pass' },
      { rng: () => 0.1, now: 5000 },
    ).state;
    state = applyGameAction(
      state,
      'p3',
      { type: 'auction:pass' },
      { rng: () => 0.1, now: 6000 },
    ).state;

    expect(state.phase).toBe('MANAGE_AND_END');
    expect(state.assets[3]!.ownerPlayerId).toBe('p2');
    expect(state.players[1]!.cash).toBe(1465);

    // Also test auction timeout expiration when nobody bids
    state = applyGameAction(state, 'p1', { type: 'turn:end' }, { rng: () => 0.1, now: 7000 }).state;
    state = applyGameAction(
      state,
      'p2',
      { type: 'turn:roll' },
      { rng: createDiceSequenceRng([2, 4]), now: 8000 },
    ).state; // lands on 6
    state = applyGameAction(
      state,
      'p2',
      { type: 'property:decline' },
      { rng: () => 0.1, now: 9000 },
    ).state;
    const expired = expireAuctionIfDue(state, 9000 + 60_000);
    expect(expired).not.toBeNull();
    expect(expired!.state.phase).toBe('MANAGE_AND_END');
    expect(expired!.state.assets[6]!.ownerPlayerId).toBeNull();
  });

  it('enforces balanced construction, hotel upgrade, bank stock limits, balanced sale, and mortgage rules', () => {
    let state = makeThreePlayerGame();
    state.phase = 'MANAGE_AND_END';
    // Give p1 full G1 group (spaces 1 and 3, houseCost = 50)
    state.assets[1]!.ownerPlayerId = 'p1';
    state.assets[3]!.ownerPlayerId = 'p1';
    state.players[0]!.cash = 2000;

    // Build 1 house on space 1
    state = applyGameAction(
      state,
      'p1',
      { type: 'asset:build', spaceIndex: 1 },
      { rng: () => 0.1, now: 1000 },
    ).state;
    expect(state.assets[1]!.houseCount).toBe(1);
    expect(state.bankHousesAvailable).toBe(31);

    // Cannot build 2nd house on space 1 before space 3 has 1 house!
    expect(() =>
      applyGameAction(
        state,
        'p1',
        { type: 'asset:build', spaceIndex: 1 },
        { rng: () => 0.1, now: 1100 },
      ),
    ).toThrow(DomainRuleError);

    // Cannot mortgage space 3 while space 1 has a house!
    expect(() =>
      applyGameAction(
        state,
        'p1',
        { type: 'asset:mortgage', spaceIndex: 3 },
        { rng: () => 0.1, now: 1200 },
      ),
    ).toThrow(DomainRuleError);

    // Build evenly up to 4 houses on both, then upgrade space 1 to hotel!
    state = applyGameAction(
      state,
      'p1',
      { type: 'asset:build', spaceIndex: 3 },
      { rng: () => 0.1, now: 1300 },
    ).state;
    for (let h = 2; h <= 4; h++) {
      state = applyGameAction(
        state,
        'p1',
        { type: 'asset:build', spaceIndex: 1 },
        { rng: () => 0.1, now: 1400 + h },
      ).state;
      state = applyGameAction(
        state,
        'p1',
        { type: 'asset:build', spaceIndex: 3 },
        { rng: () => 0.1, now: 1500 + h },
      ).state;
    }
    expect(state.bankHousesAvailable).toBe(24);

    // Upgrade space 1 to Hotel -> returns 4 houses to stock (28), uses 1 hotel (11)
    state = applyGameAction(
      state,
      'p1',
      { type: 'asset:build', spaceIndex: 1 },
      { rng: () => 0.1, now: 2000 },
    ).state;
    expect(state.assets[1]!.hotelCount).toBe(1);
    expect(state.assets[1]!.houseCount).toBe(0);
    expect(state.bankHousesAvailable).toBe(28);
    expect(state.bankHotelsAvailable).toBe(11);

    // Cannot sell from space 3 (level 4) while space 1 is level 5!
    expect(() =>
      applyGameAction(
        state,
        'p1',
        { type: 'asset:sell', spaceIndex: 3 },
        { rng: () => 0.1, now: 2100 },
      ),
    ).toThrow(DomainRuleError);

    // Sell hotel on space 1 -> back to 4 houses, +25 Cr refund
    state = applyGameAction(
      state,
      'p1',
      { type: 'asset:sell', spaceIndex: 1 },
      { rng: () => 0.1, now: 2200 },
    ).state;
    expect(state.assets[1]!.hotelCount).toBe(0);
    expect(state.assets[1]!.houseCount).toBe(4);

    // Sell all remaining houses evenly, then mortgage & redeem space 1
    for (let h = 4; h >= 1; h--) {
      state = applyGameAction(
        state,
        'p1',
        { type: 'asset:sell', spaceIndex: 1 },
        { rng: () => 0.1, now: 2300 },
      ).state;
      state = applyGameAction(
        state,
        'p1',
        { type: 'asset:sell', spaceIndex: 3 },
        { rng: () => 0.1, now: 2350 },
      ).state;
    }

    const cashBeforeMortgage = state.players[0]!.cash;
    state = applyGameAction(
      state,
      'p1',
      { type: 'asset:mortgage', spaceIndex: 1 },
      { rng: () => 0.1, now: 3000 },
    ).state;
    expect(state.assets[1]!.isMortgaged).toBe(true);
    expect(state.players[0]!.cash).toBe(cashBeforeMortgage + 30);

    // Redeem costs 30 + 10% = 33 Cr
    state = applyGameAction(
      state,
      'p1',
      { type: 'asset:redeem', spaceIndex: 1 },
      { rng: () => 0.1, now: 3100 },
    ).state;
    expect(state.assets[1]!.isMortgaged).toBe(false);
    expect(state.players[0]!.cash).toBe(cashBeforeMortgage + 30 - 33);
  });

  it('handles jail exits via card, fine payment, doubles, and 3rd failed roll', () => {
    let state = makeThreePlayerGame();
    const p1 = state.players[0]!;
    p1.inJail = true;
    p1.position = 10;
    p1.heldCards = [
      {
        cardId: 'ast-ev-13',
        deckType: 'EVENT',
        title: 'Accréditation Préfectorale',
        description: 'Sortie libre',
      },
    ];

    // 1. Exit using held card
    state = applyGameAction(
      state,
      'p1',
      { type: 'jail:use-card' },
      { rng: () => 0.1, now: 1000 },
    ).state;
    expect(state.players[0]!.inJail).toBe(false);
    expect(state.players[0]!.heldCards).toHaveLength(0);
    expect(state.eventDeckOrder).toContain('ast-ev-13');

    // 2. Put back in jail and exit by paying fine
    state.players[0]!.inJail = true;
    state = applyGameAction(state, 'p1', { type: 'jail:pay' }, { rng: () => 0.1, now: 2000 }).state;
    expect(state.players[0]!.inJail).toBe(false);
    expect(state.players[0]!.cash).toBe(1450);

    // 3. Put in jail and fail 3 rolls -> mandatory fine + move on 3rd turn
    state.players[0]!.inJail = true;
    state.players[0]!.jailTurns = 2;
    state = applyGameAction(
      state,
      'p1',
      { type: 'turn:roll' },
      { rng: createDiceSequenceRng([1, 2]), now: 3000 },
    ).state;
    expect(state.players[0]!.inJail).toBe(false);
    expect(state.players[0]!.position).toBe(13);
    expect(state.players[0]!.cash).toBe(1400);
  });

  it('executes simultaneous trades of properties, cash, and jail cards with strict validation', () => {
    let state = makeThreePlayerGame();
    state.assets[1]!.ownerPlayerId = 'p1';
    state.assets[3]!.ownerPlayerId = 'p2';
    state.players[1]!.heldCards = [
      { cardId: 'ast-cm-10', deckType: 'COMMUNITY', title: 'Immunité', description: 'Sortie' },
    ];

    // p1 proposes: space 1 + 100 Cr for space 3 + 1 jail card
    state = applyGameAction(
      state,
      'p1',
      {
        type: 'trade:propose',
        targetPlayerId: 'p2',
        offeredSpaceIndices: [1],
        requestedSpaceIndices: [3],
        offeredCash: 100,
        requestedCash: 0,
        offeredJailCards: 0,
        requestedJailCards: 1,
        note: 'Complète ton quartier ou le mien',
      },
      { rng: () => 0.1, now: 1000 },
    ).state;

    const tradeId = state.trades[0]!.id;

    // p3 cannot accept a trade targeted to p2
    expect(() =>
      applyGameAction(
        state,
        'p3',
        { type: 'trade:accept', tradeId },
        { rng: () => 0.1, now: 1500 },
      ),
    ).toThrow(DomainRuleError);

    // p2 accepts!
    state = applyGameAction(
      state,
      'p2',
      { type: 'trade:accept', tradeId },
      { rng: () => 0.1, now: 2000 },
    ).state;

    expect(state.assets[1]!.ownerPlayerId).toBe('p2');
    expect(state.assets[3]!.ownerPlayerId).toBe('p1');
    expect(state.players[0]!.cash).toBe(1400);
    expect(state.players[1]!.cash).toBe(1600);
    expect(state.players[0]!.heldCards).toHaveLength(1);
    expect(state.players[1]!.heldCards).toHaveLength(0);
  });

  it('resolves card draws across discriminated effect types and Free Parking jackpot', () => {
    let state = makeThreePlayerGame({ freeParkingJackpot: true });
    // Pay tax onto jackpot: p1 at index 2, roll 1+1=2 -> lands on 4 (Tax 200 Cr)
    state.players[0]!.position = 2;
    state = applyGameAction(
      state,
      'p1',
      { type: 'turn:roll' },
      { rng: createDiceSequenceRng([1, 1]), now: 1000 },
    ).state;
    expect(state.freeParkingPot).toBe(200);

    // Extra roll from double -> place p1 at 17, roll 1+2=3 -> lands on 20 (Parking -> collects 200 Cr!)
    state = applyGameAction(state, 'p1', { type: 'turn:end' }, { rng: () => 0.1, now: 1100 }).state;
    state.players[0]!.position = 17;
    state = applyGameAction(
      state,
      'p1',
      { type: 'turn:roll' },
      { rng: createDiceSequenceRng([1, 2]), now: 1200 },
    ).state;
    expect(state.freeParkingPot).toBe(0);
    expect(state.players[0]!.cash).toBe(1500);

    // Test MOVE_TO_NEAREST_TRANSPORT with 2x rent card ('ast-ev-05')
    state = applyGameAction(state, 'p1', { type: 'turn:end' }, { rng: () => 0.1, now: 1300 }).state;
    state.assets[15]!.ownerPlayerId = 'p1'; // p1 owns transport #15 (normal rent 25, 2x = 50)
    state.players[1]!.position = 4;
    state.eventDeckOrder = [
      'ast-ev-05',
      ...state.eventDeckOrder.filter((id) => id !== 'ast-ev-05'),
    ];
    // p2 rolls 1+2=3 -> lands on 7 (Event) -> draws ast-ev-05 -> moves to 15 -> pays 50 Cr to p1!
    state = applyGameAction(
      state,
      'p2',
      { type: 'turn:roll' },
      { rng: createDiceSequenceRng([1, 2]), now: 1400 },
    ).state;
    expect(state.players[1]!.position).toBe(15);
    expect(state.players[1]!.cash).toBe(1450);
    expect(state.players[0]!.cash).toBe(1550);
  });

  it('handles debt resolution, bankruptcy to creditor, bankruptcy to bank, and victory', () => {
    let state = makeThreePlayerGame();
    // p2 owns Tour Horizon (#39) with an hotel (rent = 2000 Cr!)
    state.assets[37]!.ownerPlayerId = 'p2';
    state.assets[39]!.ownerPlayerId = 'p2';
    state.assets[39]!.hotelCount = 1;

    // p1 has 100 Cr cash + owns space #5 (Transport, mortgage = 100)
    state.players[0]!.cash = 100;
    state.assets[5]!.ownerPlayerId = 'p1';
    state.players[0]!.position = 36;

    // p1 rolls 1 + 2 = 3 -> lands on #39 -> owes 2000 Cr to p2 -> DEBT_RESOLUTION!
    state = applyGameAction(
      state,
      'p1',
      { type: 'turn:roll' },
      { rng: createDiceSequenceRng([1, 2]), now: 1000 },
    ).state;
    expect(state.phase).toBe('DEBT_RESOLUTION');
    expect(state.pendingDebt?.amount).toBe(2000);

    // p1 declares bankruptcy -> p2 receives p1's cash (100) and space #5!
    state = applyGameAction(
      state,
      'p1',
      { type: 'player:declare-bankruptcy' },
      { rng: () => 0.1, now: 2000 },
    ).state;
    expect(state.players[0]!.bankruptcyStatus).toBe('BANKRUPT');
    expect(state.assets[5]!.ownerPlayerId).toBe('p2');
    expect(state.players[1]!.cash).toBe(1600);
    expect(state.status).toBe('ACTIVE'); // p2 and p3 still remain!

    // Now p3 abandons / declares bankruptcy -> only p2 remains -> GAME_OVER & p2 wins!
    state = applyGameAction(
      state,
      'p3',
      { type: 'player:declare-bankruptcy' },
      { rng: () => 0.1, now: 3000 },
    ).state;
    expect(state.status).toBe('FINISHED');
    expect(state.phase).toBe('GAME_OVER');
    expect(state.winnerPlayerId).toBe('p2');
    expect(state.finalStandings?.[0]?.playerId).toBe('p2');
  });

  it('supports debt settlement after mortgaging an asset, pause/unpause, disconnect policies, and time-limit victory', () => {
    let state = makeThreePlayerGame({ maxDurationMinutes: 30, disconnectPolicy: 'AUTO_PASS' });
    // p1 owes 200 Cr tax on space #4 with only 180 Cr cash, but owns space #1 (mortgage +30 Cr -> 210 Cr!)
    state.players[0]!.cash = 180;
    state.players[0]!.position = 1;
    state.assets[1]!.ownerPlayerId = 'p1';

    state = applyGameAction(
      state,
      'p1',
      { type: 'turn:roll' },
      { rng: createDiceSequenceRng([1, 2]), now: 1000 },
    ).state; // 1+3=4 (Tax 200)
    expect(state.phase).toBe('DEBT_RESOLUTION');

    // Mortgage space #1 (+30 -> 210 Cr), then settle debt (-200 -> 10 Cr)!
    state = applyGameAction(
      state,
      'p1',
      { type: 'asset:mortgage', spaceIndex: 1 },
      { rng: () => 0.1, now: 1500 },
    ).state;
    state = applyGameAction(
      state,
      'p1',
      { type: 'debt:settle' },
      { rng: () => 0.1, now: 1600 },
    ).state;
    expect(state.phase).toBe('MANAGE_AND_END');
    expect(state.players[0]!.cash).toBe(10);

    // Host pause & unpause
    state = applyGameAction(
      state,
      'p1',
      { type: 'game:pause' },
      { rng: () => 0.1, now: 1700, isHost: true },
    ).state;
    expect(state.status).toBe('PAUSED');
    state = applyGameAction(
      state,
      'p1',
      { type: 'game:unpause' },
      { rng: () => 0.1, now: 1800, isHost: true },
    ).state;
    expect(state.status).toBe('ACTIVE');

    // Disconnect timeout AUTO_PASS ends p1's MANAGE_AND_END turn, and passing deadline triggers time-limit victory!
    const afterDeadline = state.startedAt + 31 * 60 * 1000;
    const autoRes = applyDisconnectTimeoutPolicy(state, 'p1', {
      rng: () => 0.2,
      now: afterDeadline,
    });
    expect(autoRes).not.toBeNull();
    expect(autoRes!.state.status).toBe('FINISHED');
    expect(autoRes!.state.winnerPlayerId).toBeDefined();
    expect(computeStandings(autoRes!.state, getBoardPack('asteria-city'))).toHaveLength(3);
  });

  it('maintains strict economic and structural invariants across 120 simulated multi-player turns', () => {
    let seed = 42;
    const seededRng = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };

    let state = createInitialGameState({
      gameId: 'sim-1',
      roomId: 'room-sim',
      boardPackId: 'nova-frontier',
      players: [
        { id: 'p1', userId: 'u1', displayName: 'A', tokenId: 'skyline-tower' },
        { id: 'p2', userId: 'u2', displayName: 'B', tokenId: 'cyber-drone' },
        { id: 'p3', userId: 'u3', displayName: 'C', tokenId: 'orbital-shuttle' },
        { id: 'p4', userId: 'u4', displayName: 'D', tokenId: 'emerald-vault' },
      ],
      rng: seededRng,
      now: 100_000,
    });

    // Verify invalid command does not mutate input state
    const snapshotBefore = JSON.stringify(state);
    expect(() =>
      applyGameAction(state, 'p2', { type: 'turn:roll' }, { rng: seededRng, now: 100_100 }),
    ).toThrow(DomainRuleError);
    expect(JSON.stringify(state)).toBe(snapshotBefore);

    let now = 101_000;
    for (let step = 0; step < 120 && state.status === 'ACTIVE'; step++) {
      now += 1000;
      const current = state.players.find((p) => p.id === state.currentPlayerId)!;

      if (state.phase === 'ROLL_DICE') {
        state = applyGameAction(
          state,
          current.id,
          { type: 'turn:roll' },
          { rng: seededRng, now },
        ).state;
      } else if (state.phase === 'AWAITING_BUY_DECISION') {
        const spaceIdx = state.pendingBuySpaceIndex!;
        const price = getBoardPack(state.boardPackId).spaces[spaceIdx]!.price;
        if (current.cash >= price + 150) {
          state = applyGameAction(
            state,
            current.id,
            { type: 'property:buy' },
            { rng: seededRng, now },
          ).state;
        } else {
          state = applyGameAction(
            state,
            current.id,
            { type: 'property:decline' },
            { rng: seededRng, now },
          ).state;
        }
      } else if (state.phase === 'AUCTION' && state.auction) {
        const bidderId = state.auction.eligiblePlayerIds.find(
          (id) =>
            !state.auction!.passedPlayerIds.includes(id) && id !== state.auction!.highestBidderId,
        );
        if (bidderId) {
          const bidder = state.players.find((p) => p.id === bidderId)!;
          if (state.auction.currentBid === 0 && bidder.cash >= state.auction.minNextBid + 100) {
            state = applyGameAction(
              state,
              bidderId,
              { type: 'auction:bid', amount: state.auction.minNextBid },
              { rng: seededRng, now },
            ).state;
          } else {
            state = applyGameAction(
              state,
              bidderId,
              { type: 'auction:pass' },
              { rng: seededRng, now },
            ).state;
          }
        }
      } else if (state.phase === 'DEBT_RESOLUTION' && state.pendingDebt) {
        state = applyGameAction(
          state,
          state.pendingDebt.debtorId,
          { type: 'player:declare-bankruptcy' },
          { rng: seededRng, now },
        ).state;
      } else if (state.phase === 'MANAGE_AND_END') {
        state = applyGameAction(
          state,
          current.id,
          { type: 'turn:end' },
          { rng: seededRng, now },
        ).state;
      }

      // Check invariants at every single state transition
      for (const p of state.players) {
        expect(p.cash).toBeGreaterThanOrEqual(0);
        expect(Number.isInteger(p.cash)).toBe(true);
        expect(p.position).toBeGreaterThanOrEqual(0);
        expect(p.position).toBeLessThan(40);
      }
      for (const asset of Object.values(state.assets)) {
        if (asset.ownerPlayerId) {
          const owner = state.players.find((p) => p.id === asset.ownerPlayerId);
          expect(owner?.bankruptcyStatus).not.toBe('BANKRUPT');
        }
      }
    }
  });

  it('covers remaining card effects (REPAIR_BUILDINGS, PAY_EACH, COLLECT_FROM_EACH, MOVE_STEPS, MOVE_TO_NEAREST_UTILITY, GO_TO_JAIL)', () => {
    let state = makeThreePlayerGame();
    // Give p1 buildings on spaces 1 and 3 to test REPAIR_BUILDINGS ('ast-ev-09': 25/house, 100/hotel)
    state.assets[1]!.ownerPlayerId = 'p1';
    state.assets[1]!.houseCount = 2;
    state.assets[3]!.ownerPlayerId = 'p1';
    state.assets[3]!.hotelCount = 1;

    // 1. REPAIR_BUILDINGS (2*25 + 1*100 = 150 Cr)
    state.players[0]!.position = 4;
    state.eventDeckOrder = ['ast-ev-09', ...state.eventDeckOrder];
    state = applyGameAction(
      state,
      'p1',
      { type: 'turn:roll' },
      { rng: createDiceSequenceRng([1, 2]), now: 1000 },
    ).state;
    expect(state.players[0]!.cash).toBe(1350);

    // 2. PAY_EACH ('ast-ev-12': 50 Cr to p2 and p3 = -100 Cr)
    state = applyGameAction(state, 'p1', { type: 'turn:end' }, { rng: () => 0.1, now: 1100 }).state;
    state.players[1]!.position = 4;
    state.eventDeckOrder = ['ast-ev-12', ...state.eventDeckOrder];
    state = applyGameAction(
      state,
      'p2',
      { type: 'turn:roll' },
      { rng: createDiceSequenceRng([1, 2]), now: 1200 },
    ).state;
    expect(state.players[1]!.cash).toBe(1400);
    expect(state.players[0]!.cash).toBe(1400);
    expect(state.players[2]!.cash).toBe(1550);

    // 3. COLLECT_FROM_EACH ('ast-cm-04': 20 Cr from each active player = +40 Cr)
    state = applyGameAction(state, 'p2', { type: 'turn:end' }, { rng: () => 0.1, now: 1300 }).state;
    state.players[2]!.position = 14;
    state.communityDeckOrder = ['ast-cm-04', ...state.communityDeckOrder];
    state = applyGameAction(
      state,
      'p3',
      { type: 'turn:roll' },
      { rng: createDiceSequenceRng([1, 2]), now: 1400 },
    ).state; // 14+3=17 (Community)
    expect(state.players[2]!.cash).toBe(1590);

    // 4. MOVE_TO_NEAREST_UTILITY ('ast-ev-06': 10x dice) when p2 owns #28
    state = applyGameAction(state, 'p3', { type: 'turn:end' }, { rng: () => 0.1, now: 1500 }).state;
    state.assets[28]!.ownerPlayerId = 'p2';
    state.players[0]!.position = 19;
    state.eventDeckOrder = ['ast-ev-06', ...state.eventDeckOrder];
    state = applyGameAction(
      state,
      'p1',
      { type: 'turn:roll' },
      { rng: createDiceSequenceRng([1, 2]), now: 1600 },
    ).state; // 19+3=22 (Event) -> moves to 28 -> pays 10 * 3 = 30 Cr to p2!
    expect(state.players[0]!.position).toBe(28);
    expect(state.players[0]!.cash).toBe(1350);

    // 5. MOVE_STEPS ('ast-ev-10': -3 steps from 7 -> lands on 4 Tax 200!)
    state = applyGameAction(state, 'p1', { type: 'turn:end' }, { rng: () => 0.1, now: 1700 }).state;
    state.players[1]!.position = 4;
    state.eventDeckOrder = ['ast-ev-10', ...state.eventDeckOrder];
    state = applyGameAction(
      state,
      'p2',
      { type: 'turn:roll' },
      { rng: createDiceSequenceRng([1, 2]), now: 1800 },
    ).state; // 4+3=7 -> -3 -> 4 (Tax 200)
    expect(state.players[1]!.position).toBe(4);

    // 6. Landing on space #30 GO_TO_JAIL
    state = applyGameAction(state, 'p2', { type: 'turn:end' }, { rng: () => 0.1, now: 1900 }).state;
    state.players[2]!.position = 27;
    state = applyGameAction(
      state,
      'p3',
      { type: 'turn:roll' },
      { rng: createDiceSequenceRng([1, 2]), now: 2000 },
    ).state; // 27+3=30 -> Jail!
    expect(state.players[2]!.inJail).toBe(true);
    expect(state.players[2]!.position).toBe(10);
  });

  it('covers jail exit by rolling doubles, trade reject/cancel, PAUSE/ABANDON disconnect policies, and bank foreclosure auction queue', () => {
    let state = makeThreePlayerGame({ disconnectPolicy: 'PAUSE' });

    // Jail exit via doubles
    state.players[0]!.inJail = true;
    state.players[0]!.position = 10;
    state = applyGameAction(
      state,
      'p1',
      { type: 'turn:roll' },
      { rng: createDiceSequenceRng([4, 4]), now: 1000 },
    ).state;
    expect(state.players[0]!.inJail).toBe(false);
    expect(state.players[0]!.position).toBe(18);
    expect(state.extraRollGranted).toBe(false);
    state = applyGameAction(
      state,
      'p1',
      { type: 'property:buy' },
      { rng: () => 0.1, now: 1100 },
    ).state;

    // Trade propose -> reject, and propose -> cancel
    state = applyGameAction(
      state,
      'p1',
      {
        type: 'trade:propose',
        targetPlayerId: 'p2',
        offeredSpaceIndices: [18],
        requestedSpaceIndices: [],
        offeredCash: 0,
        requestedCash: 250,
        offeredJailCards: 0,
        requestedJailCards: 0,
      },
      { rng: () => 0.1, now: 1200 },
    ).state;
    const t1 = state.trades[0]!.id;
    state = applyGameAction(
      state,
      'p2',
      { type: 'trade:reject', tradeId: t1 },
      { rng: () => 0.1, now: 1300 },
    ).state;
    expect(state.trades[0]!.status).toBe('REJECTED');

    state = applyGameAction(
      state,
      'p1',
      {
        type: 'trade:propose',
        targetPlayerId: 'p3',
        offeredSpaceIndices: [18],
        requestedSpaceIndices: [],
        offeredCash: 0,
        requestedCash: 300,
        offeredJailCards: 0,
        requestedJailCards: 0,
      },
      { rng: () => 0.1, now: 1400 },
    ).state;
    const t2 = state.trades[1]!.id;
    state = applyGameAction(
      state,
      'p1',
      { type: 'trade:cancel', tradeId: t2 },
      { rng: () => 0.1, now: 1500 },
    ).state;
    expect(state.trades[1]!.status).toBe('CANCELLED');

    // PAUSE disconnect policy
    const paused = applyDisconnectTimeoutPolicy(state, 'p1', { rng: () => 0.1, now: 1600 });
    expect(paused?.state.status).toBe('PAUSED');

    // Bank foreclosure with multiple properties + buildings + held card -> sequential auctions!
    state.assets[1]!.ownerPlayerId = 'p1';
    state.assets[3]!.ownerPlayerId = 'p1';
    state.assets[1]!.houseCount = 1;
    state.players[0]!.heldCards = [
      { cardId: 'ast-ev-13', deckType: 'EVENT', title: 'Pass', description: 'Sortie' },
    ];
    state.ruleset.disconnectPolicy = 'ABANDON';

    const abandoned = applyDisconnectTimeoutPolicy(state, 'p1', { rng: () => 0.1, now: 2000 })!;
    state = abandoned.state;
    expect(state.players[0]!.bankruptcyStatus).toBe('BANKRUPT');
    expect(state.phase).toBe('AUCTION');
    expect(state.auction?.queuedSpaceIndices.length).toBeGreaterThanOrEqual(2);

    // Pass both p2 and p3 through all queued foreclosure auctions
    while (state.phase === 'AUCTION' && state.auction) {
      state = applyGameAction(
        state,
        'p2',
        { type: 'auction:pass' },
        { rng: () => 0.1, now: 2100 },
      ).state;
      if (state.phase === 'AUCTION') {
        state = applyGameAction(
          state,
          'p3',
          { type: 'auction:pass' },
          { rng: () => 0.1, now: 2200 },
        ).state;
      }
    }
    expect(state.phase).toBe('ROLL_DICE');
  });

  it('rejects building when bank house/hotel stocks are depleted or player lacks full group', () => {
    const state = makeThreePlayerGame();
    state.phase = 'MANAGE_AND_END';
    state.assets[1]!.ownerPlayerId = 'p1';

    // Incomplete group
    expect(() =>
      applyGameAction(
        state,
        'p1',
        { type: 'asset:build', spaceIndex: 1 },
        { rng: () => 0.1, now: 1000 },
      ),
    ).toThrow(DomainRuleError);

    // Full group, 0 houses in bank stock
    state.assets[3]!.ownerPlayerId = 'p1';
    state.bankHousesAvailable = 0;
    expect(() =>
      applyGameAction(
        state,
        'p1',
        { type: 'asset:build', spaceIndex: 1 },
        { rng: () => 0.1, now: 1000 },
      ),
    ).toThrow(DomainRuleError);

    // 4 houses built, 0 hotels in bank stock
    state.assets[1]!.houseCount = 4;
    state.assets[3]!.houseCount = 4;
    state.bankHotelsAvailable = 0;
    expect(() =>
      applyGameAction(
        state,
        'p1',
        { type: 'asset:build', spaceIndex: 1 },
        { rng: () => 0.1, now: 1000 },
      ),
    ).toThrow(DomainRuleError);

    // Hotel built, < 4 houses in bank stock blocks selling hotel
    state.assets[1]!.houseCount = 0;
    state.assets[1]!.hotelCount = 1;
    state.bankHousesAvailable = 2;
    expect(() =>
      applyGameAction(
        state,
        'p1',
        { type: 'asset:sell', spaceIndex: 1 },
        { rng: () => 0.1, now: 1000 },
      ),
    ).toThrow(DomainRuleError);
  });

  it('enforces all security, phase, turn, mortgage, trade, ledger, and auto-pass guards', () => {
    const pack = getBoardPack('asteria-city');
    const emptySeq = createDiceSequenceRng([]);
    expect(emptySeq()).toBeGreaterThan(0);

    let state = makeThreePlayerGame({ auctionEnabled: false });

    // Ledger guards
    expect(() =>
      transferCredits(state, [], {
        from: 'p1',
        to: 'p2',
        amount: -10,
        category: 'SYSTEM',
        reason: 'Invalid',
        timestamp: 100,
      }),
    ).toThrow(DomainRuleError);
    expect(
      transferCredits(state, [], {
        from: 'p1',
        to: 'p1',
        amount: 0,
        category: 'SYSTEM',
        reason: 'Noop',
        timestamp: 100,
      }).completed,
    ).toBe(true);
    expect(() =>
      transferCredits(state, [], {
        from: 'unknown',
        to: 'BANK',
        amount: 10,
        category: 'SYSTEM',
        reason: 'Unknown',
        timestamp: 100,
      }),
    ).toThrow(DomainRuleError);
    expect(() =>
      transferCredits(state, [], {
        from: 'p1',
        to: 'BANK',
        amount: 99_999,
        category: 'SYSTEM',
        reason: 'Non-mandatory insufficient',
        timestamp: 100,
      }),
    ).toThrow(DomainRuleError);

    // Out-of-turn & invalid-phase action guards
    expect(() =>
      applyGameAction(state, 'p2', { type: 'turn:roll' }, { rng: () => 0.1, now: 100 }),
    ).toThrow(DomainRuleError);
    expect(() =>
      applyGameAction(state, 'p1', { type: 'turn:end' }, { rng: () => 0.1, now: 100 }),
    ).toThrow(DomainRuleError);
    expect(() =>
      applyGameAction(state, 'p1', { type: 'property:buy' }, { rng: () => 0.1, now: 100 }),
    ).toThrow(DomainRuleError);
    expect(() =>
      applyGameAction(state, 'p1', { type: 'property:decline' }, { rng: () => 0.1, now: 100 }),
    ).toThrow(DomainRuleError);
    expect(() =>
      applyGameAction(
        state,
        'p1',
        { type: 'auction:bid', amount: 50 },
        { rng: () => 0.1, now: 100 },
      ),
    ).toThrow(DomainRuleError);
    expect(() =>
      applyGameAction(state, 'p1', { type: 'auction:pass' }, { rng: () => 0.1, now: 100 }),
    ).toThrow(DomainRuleError);
    expect(() =>
      applyGameAction(state, 'p1', { type: 'jail:pay' }, { rng: () => 0.1, now: 100 }),
    ).toThrow(DomainRuleError);
    expect(() =>
      applyGameAction(state, 'p1', { type: 'jail:use-card' }, { rng: () => 0.1, now: 100 }),
    ).toThrow(DomainRuleError);
    expect(() =>
      applyGameAction(state, 'p1', { type: 'debt:settle' }, { rng: () => 0.1, now: 100 }),
    ).toThrow(DomainRuleError);
    expect(() =>
      applyGameAction(
        state,
        'p2',
        { type: 'game:pause' },
        { rng: () => 0.1, now: 100, isHost: false },
      ),
    ).toThrow(DomainRuleError);
    expect(() =>
      applyGameAction(
        state,
        'p1',
        { type: 'game:unpause' },
        { rng: () => 0.1, now: 100, isHost: true },
      ),
    ).toThrow(DomainRuleError);

    // Helper checks on non-property space (0 = START)
    expect(canBuildOnSpace(state, pack, 'p1', 0).allowed).toBe(false);
    expect(canSellBuildingOnSpace(state, pack, 'p1', 0).allowed).toBe(false);

    // Decline when auctionEnabled=false simply transitions to MANAGE_AND_END
    state = applyGameAction(
      state,
      'p1',
      { type: 'turn:roll' },
      { rng: createDiceSequenceRng([1, 2]), now: 200 },
    ).state;
    expect(state.phase).toBe('AWAITING_BUY_DECISION');
    // AUTO_PASS on AWAITING_BUY_DECISION
    state = applyDisconnectTimeoutPolicy(state, 'p1', { rng: () => 0.1, now: 250 })!.state;
    expect(state.phase).toBe('MANAGE_AND_END');

    // Mortgage & redeem validation guards
    state.assets[1]!.ownerPlayerId = 'p1';
    state.assets[3]!.ownerPlayerId = 'p1';
    state.assets[1]!.houseCount = 1;
    expect(() =>
      applyGameAction(
        state,
        'p1',
        { type: 'asset:mortgage', spaceIndex: 3 },
        { rng: () => 0.1, now: 300 },
      ),
    ).toThrow(DomainRuleError);
    expect(() =>
      applyGameAction(
        state,
        'p1',
        { type: 'asset:redeem', spaceIndex: 3 },
        { rng: () => 0.1, now: 300 },
      ),
    ).toThrow(DomainRuleError);

    // Trade validation guards (self-trade, built group property)
    expect(() =>
      applyGameAction(
        state,
        'p1',
        {
          type: 'trade:propose',
          targetPlayerId: 'p1',
          offeredSpaceIndices: [],
          requestedSpaceIndices: [],
          offeredCash: 10,
          requestedCash: 0,
          offeredJailCards: 0,
          requestedJailCards: 0,
        },
        { rng: () => 0.1, now: 310 },
      ),
    ).toThrow(DomainRuleError);
    expect(() =>
      applyGameAction(
        state,
        'p1',
        {
          type: 'trade:propose',
          targetPlayerId: 'p2',
          offeredSpaceIndices: [3],
          requestedSpaceIndices: [],
          offeredCash: 0,
          requestedCash: 50,
          offeredJailCards: 0,
          requestedJailCards: 0,
        },
        { rng: () => 0.1, now: 315 },
      ),
    ).toThrow(DomainRuleError);

    // AUTO_PASS on MANAGE_AND_END -> advances to p2 in ROLL_DICE
    state = applyDisconnectTimeoutPolicy(state, 'p1', { rng: () => 0.1, now: 400 })!.state;
    expect(state.currentPlayerId).toBe('p2');
    expect(state.phase).toBe('ROLL_DICE');

    // AUTO_PASS on non-current player in ROLL_DICE returns null
    expect(applyDisconnectTimeoutPolicy(state, 'p3', { rng: () => 0.1, now: 410 })).toBeNull();
    // AUTO_PASS on current player in ROLL_DICE rolls dice
    state = applyDisconnectTimeoutPolicy(state, 'p2', {
      rng: createDiceSequenceRng([2, 3]),
      now: 420,
    })!.state;
    expect(state.hasRolledThisTurn).toBe(true);

    // expireAuctionIfDue returns null when not in auction or before expiry
    expect(expireAuctionIfDue(state, 500)).toBeNull();

    // Voluntary bankruptcy by non-current player (p3) leaves p2's turn active
    state = applyGameAction(
      state,
      'p3',
      { type: 'player:declare-bankruptcy' },
      { rng: () => 0.1, now: 600 },
    ).state;
    expect(state.players[2]!.bankruptcyStatus).toBe('BANKRUPT');
    expect(state.currentPlayerId).toBe('p2');
    expect(() =>
      applyGameAction(state, 'p3', { type: 'turn:roll' }, { rng: () => 0.1, now: 610 }),
    ).toThrow(DomainRuleError);

    // AUTO_PASS in DEBT_RESOLUTION triggers bankruptcy
    state.phase = 'DEBT_RESOLUTION';
    state.pendingDebt = { debtorId: 'p2', creditorId: 'p1', amount: 5000, reason: 'Dette test' };
    state = applyDisconnectTimeoutPolicy(state, 'p2', { rng: () => 0.1, now: 700 })!.state;
    expect(state.status).toBe('FINISHED');
    expect(state.winnerPlayerId).toBe('p1');
    expect(() =>
      applyGameAction(state, 'p1', { type: 'turn:roll' }, { rng: () => 0.1, now: 710 }),
    ).toThrow(DomainRuleError);
  });
});
