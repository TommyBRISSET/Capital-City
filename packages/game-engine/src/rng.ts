import type { DiceRollResult } from '@capital-city/shared';

export type RngFn = () => number;

export function rollDie(rng: RngFn): number {
  const raw = rng();
  const clamped = Math.max(0, Math.min(0.999999, raw));
  return Math.floor(clamped * 6) + 1;
}

export function rollTwoDice(rng: RngFn, timestamp: number): DiceRollResult {
  const die1 = rollDie(rng);
  const die2 = rollDie(rng);
  return {
    die1,
    die2,
    total: die1 + die2,
    isDouble: die1 === die2,
    rolledAt: timestamp,
  };
}

export function shuffleArray<T>(items: readonly T[], rng: RngFn): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.max(0, Math.min(0.999999, rng())) * (i + 1));
    const tmp = copy[i]!;
    copy[i] = copy[j]!;
    copy[j] = tmp;
  }
  return copy;
}

/**
 * Utilitaire de test déterministe produisant des lancers de dés exacts (1..6).
 */
export function createDiceSequenceRng(diceValues: readonly number[]): RngFn {
  let cursor = 0;
  return () => {
    const val = diceValues[cursor % diceValues.length] ?? 1;
    cursor += 1;
    return (Math.min(6, Math.max(1, val)) - 0.5) / 6;
  };
}
