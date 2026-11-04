'use client';

import React from 'react';
import type { BoardPackDefinition, BoardSpaceDefinition } from '@capital-city/shared';
import { Badge, Button, formatCredits } from '@capital-city/ui';

export function BuyDecisionPanel({
  space,
  pack,
  playerCash,
  isMyTurn,
  activePlayerName,
  auctionEnabled,
  busy,
  onBuy,
  onDecline,
  onInspectSpace,
}: {
  space: BoardSpaceDefinition;
  pack: BoardPackDefinition;
  playerCash: number;
  isMyTurn: boolean;
  activePlayerName: string;
  auctionEnabled: boolean;
  busy: boolean;
  onBuy: () => void;
  onDecline: () => void;
  onInspectSpace: () => void;
}) {
  const groupTheme = space.groupCode ? pack.theme.groups[space.groupCode] : null;
  const canAfford = playerCash >= space.price;

  return (
    <div
      data-testid="buy-decision-panel"
      className="rounded-2xl border border-teal-500/45 bg-slate-900/95 p-4 shadow-xl space-y-3"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <Badge tone="teal">Opportunité d’acquisition</Badge>
          <h3 className="mt-1 text-base font-extrabold text-white">{space.name}</h3>
          {groupTheme ? (
            <span
              style={{ backgroundColor: groupTheme.bg, color: groupTheme.text }}
              className="mt-1 inline-block rounded px-2 py-0.5 text-[10px] font-bold uppercase"
            >
              {groupTheme.name}
            </span>
          ) : null}
        </div>
        <div className="text-right">
          <div className="text-[11px] text-slate-400">Prix</div>
          <div className="tabular-nums text-lg font-black text-amber-300">
            {formatCredits(space.price)}
          </div>
        </div>
      </div>

      {isMyTurn ? (
        <>
          <div className="flex items-center justify-between rounded-xl bg-slate-950/80 px-3 py-2 text-xs border border-slate-800">
            <span className="text-slate-400">Solde après achat :</span>
            <span
              className={`tabular-nums font-bold ${canAfford ? 'text-emerald-300' : 'text-rose-400'}`}
            >
              {formatCredits(playerCash - space.price)}
            </span>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              variant="primary"
              size="md"
              loading={busy}
              disabled={!canAfford}
              disabledReason={`Trésorerie insuffisante (${formatCredits(playerCash)} disponibles).`}
              onClick={onBuy}
              data-testid="btn-buy-property"
              className="flex-1"
            >
              Acheter ({formatCredits(space.price)})
            </Button>
            <Button
              variant="amber"
              size="md"
              loading={busy}
              onClick={onDecline}
              data-testid="btn-decline-property"
              className="flex-1"
            >
              {auctionEnabled ? 'Refuser → enchères' : 'Passer l’achat'}
            </Button>
          </div>
        </>
      ) : (
        <p className="text-xs text-slate-300">
          <strong>{activePlayerName}</strong> examine le titre de propriété…
        </p>
      )}

      <button
        type="button"
        onClick={onInspectSpace}
        className="text-[11px] font-semibold text-teal-300 hover:underline cursor-pointer"
      >
        Inspecter le barème détaillé des loyers →
      </button>
    </div>
  );
}
