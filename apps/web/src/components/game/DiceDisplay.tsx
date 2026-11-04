'use client';

import React from 'react';
import type { DiceRollResult } from '@capital-city/shared';
import { Badge } from '@capital-city/ui';

const PIP_POSITIONS: Record<number, Array<[number, number]>> = {
  1: [[50, 50]],
  2: [
    [28, 28],
    [72, 72],
  ],
  3: [
    [28, 28],
    [50, 50],
    [72, 72],
  ],
  4: [
    [28, 28],
    [72, 28],
    [28, 72],
    [72, 72],
  ],
  5: [
    [28, 28],
    [72, 28],
    [50, 50],
    [28, 72],
    [72, 72],
  ],
  6: [
    [28, 24],
    [72, 24],
    [28, 50],
    [72, 50],
    [28, 76],
    [72, 76],
  ],
};

function DieFace({ value, rolling }: { value: number; rolling: boolean }) {
  const pips = PIP_POSITIONS[value] ?? PIP_POSITIONS[1]!;
  return (
    <svg
      width={46}
      height={46}
      viewBox="0 0 100 100"
      aria-label={`Dé : ${value}`}
      className={`rounded-xl shadow-lg ${rolling ? 'animate-bounce' : 'transition-transform duration-200'}`}
    >
      <rect
        x="4"
        y="4"
        width="92"
        height="92"
        rx="20"
        fill="#0F172A"
        stroke="#2DD4BF"
        strokeWidth="4"
      />
      {pips.map(([cx, cy], idx) => (
        <circle key={idx} cx={cx} cy={cy} r="9" fill="#F8FAFC" />
      ))}
    </svg>
  );
}

export function DiceDisplay({
  roll,
  reducedMotion,
  rolling = false,
}: {
  roll: DiceRollResult | null;
  reducedMotion: boolean;
  rolling?: boolean;
}) {
  if (!roll) {
    return (
      <div
        data-testid="dice-display-idle"
        className="inline-flex items-center gap-2 rounded-xl border border-slate-700/70 bg-slate-950/75 px-3 py-2 text-xs text-slate-300"
      >
        <span>🎲 Prêt pour le lancer des dés</span>
      </div>
    );
  }

  return (
    <div
      data-testid="dice-display"
      className="inline-flex items-center gap-3 rounded-2xl border border-slate-700/80 bg-slate-950/85 px-3.5 py-2 shadow-xl"
    >
      <div className="flex items-center gap-2">
        <DieFace value={roll.die1} rolling={rolling && !reducedMotion} />
        <DieFace value={roll.die2} rolling={rolling && !reducedMotion} />
      </div>
      <div className="text-left">
        <div className="tabular-nums text-sm sm:text-base font-extrabold text-white">
          Total : {roll.total}
        </div>
        {roll.isDouble ? (
          <Badge tone="amber">DOUBLE !</Badge>
        ) : (
          <span className="text-[11px] text-slate-400">
            {roll.die1} + {roll.die2}
          </span>
        )}
      </div>
    </div>
  );
}
