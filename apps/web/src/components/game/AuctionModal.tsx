'use client';

import React, { useEffect, useState } from 'react';
import type { AuctionState, BoardPackDefinition, PlayerState } from '@capital-city/shared';
import { Badge, Button, Modal, MoneyDisplay, formatCredits } from '@capital-city/ui';

export function AuctionModal({
  auction,
  pack,
  players,
  myPlayer,
  busy,
  onBid,
  onPass,
}: {
  auction: AuctionState | null;
  pack: BoardPackDefinition;
  players: PlayerState[];
  myPlayer: PlayerState | null;
  busy: boolean;
  onBid: (amount: number) => void;
  onPass: () => void;
}) {
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [customBid, setCustomBid] = useState('');

  useEffect(() => {
    if (!auction) return;
    const updateClock = () => {
      const remaining = Math.max(0, Math.ceil((auction.expiresAt - Date.now()) / 1000));
      setSecondsLeft(remaining);
    };
    updateClock();
    const interval = setInterval(updateClock, 250);
    return () => clearInterval(interval);
  }, [auction]);

  useEffect(() => {
    if (auction) {
      setCustomBid(String(auction.minNextBid));
    }
  }, [auction]);

  if (!auction) return null;

  const space = pack.spaces[auction.spaceIndex]!;
  const groupTheme = space.groupCode ? pack.theme.groups[space.groupCode] : null;
  const highestBidder = players.find((p) => p.id === auction.highestBidderId);
  const iHavePassed = myPlayer ? auction.passedPlayerIds.includes(myPlayer.id) : true;
  const amEligible = myPlayer ? auction.eligiblePlayerIds.includes(myPlayer.id) : false;
  const parsedCustom = Math.trunc(Number(customBid) || 0);
  const canCustomBid =
    Boolean(myPlayer) &&
    amEligible &&
    !iHavePassed &&
    parsedCustom >= auction.minNextBid &&
    parsedCustom <= (myPlayer?.cash ?? 0);

  return (
    <Modal
      open={true}
      onClose={() => {
        // Une enchère active reste affichée jusqu'à sa résolution pour tous les joueurs
      }}
      title={`Enchère ouverte — ${space.name}`}
      subtitle={`Valeur catalogue : ${formatCredits(space.price)} • Loyer de base : ${formatCredits(space.rents[0] ?? 0)}`}
      maxWidthClass="max-w-xl"
    >
      <div className="space-y-4" data-testid="auction-modal">
        {/* Bandeau compte à rebours + Meilleure offre */}
        <div className="grid grid-cols-2 gap-3 rounded-2xl border border-amber-500/40 bg-slate-950 p-4">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-slate-400">
              Meilleure offre actuelle
            </div>
            <div className="mt-1">
              {auction.currentBid > 0 ? (
                <MoneyDisplay amount={auction.currentBid} size="lg" />
              ) : (
                <span className="text-lg font-bold text-slate-400">Aucune offre</span>
              )}
            </div>
            <div className="mt-1 text-xs text-teal-300">
              {highestBidder
                ? `Meneur : ${highestBidder.displayName}`
                : `Mise min : ${formatCredits(auction.minNextBid)}`}
            </div>
          </div>

          <div className="text-right flex flex-col justify-between items-end">
            <Badge tone={secondsLeft <= 5 ? 'rose' : 'amber'}>⏱ Clôture dans {secondsLeft}s</Badge>
            {groupTheme ? (
              <span
                style={{ backgroundColor: groupTheme.bg, color: groupTheme.text }}
                className="rounded px-2.5 py-0.5 text-[11px] font-bold uppercase"
              >
                {groupTheme.name}
              </span>
            ) : null}
            {myPlayer ? (
              <div className="text-xs text-slate-400">
                Votre solde :{' '}
                <strong className="text-white tabular-nums">{formatCredits(myPlayer.cash)}</strong>
              </div>
            ) : null}
          </div>
        </div>

        {/* Statut des enchérisseurs */}
        <div className="flex flex-wrap gap-1.5">
          {auction.eligiblePlayerIds.map((pid) => {
            const p = players.find((pl) => pl.id === pid);
            if (!p) return null;
            const passed = auction.passedPlayerIds.includes(pid);
            const leading = auction.highestBidderId === pid;
            return (
              <Badge key={pid} tone={leading ? 'amber' : passed ? 'neutral' : 'teal'}>
                {p.displayName} {leading ? '★ meneur' : passed ? '(passé)' : ''}
              </Badge>
            );
          })}
        </div>

        {/* Contrôles d'enchère */}
        {myPlayer && amEligible && !iHavePassed ? (
          <div className="space-y-3 pt-2 border-t border-slate-800">
            <div className="grid grid-cols-3 gap-2">
              {[0, 15, 40].map((extra) => {
                const targetAmount = auction.minNextBid + extra;
                const affordable = myPlayer.cash >= targetAmount;
                return (
                  <Button
                    key={extra}
                    variant="secondary"
                    size="sm"
                    loading={busy}
                    disabled={!affordable}
                    disabledReason="Solde insuffisant"
                    onClick={() => onBid(targetAmount)}
                    data-testid={`auction-quick-bid-${extra}`}
                  >
                    Offrir {formatCredits(targetAmount)}
                  </Button>
                );
              })}
            </div>

            <div className="flex items-start gap-2">
              <input
                type="number"
                min={auction.minNextBid}
                max={myPlayer.cash}
                step={1}
                value={customBid}
                onChange={(e) => setCustomBid(e.target.value)}
                data-testid="auction-custom-input"
                aria-label="Montant de votre enchère"
                className="w-36 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm font-bold tabular-nums text-amber-300 focus:border-amber-400 focus:outline-none"
              />
              <Button
                variant="amber"
                size="md"
                loading={busy}
                disabled={!canCustomBid}
                disabledReason={
                  parsedCustom < auction.minNextBid
                    ? `Minimum requis : ${formatCredits(auction.minNextBid)}`
                    : 'Solde insuffisant'
                }
                onClick={() => onBid(parsedCustom)}
                data-testid="btn-auction-bid"
                className="flex-1"
              >
                Surenchérir
              </Button>
              <Button
                variant="ghost"
                size="md"
                loading={busy}
                onClick={onPass}
                data-testid="btn-auction-pass"
              >
                Passer
              </Button>
            </div>
          </div>
        ) : (
          <div className="rounded-xl bg-slate-950/75 border border-slate-800 px-4 py-3 text-xs text-slate-300 text-center">
            {iHavePassed
              ? 'Vous avez passé votre tour sur cette enchère. En attente des autres offres…'
              : 'Observation de l’enchère en cours…'}
          </div>
        )}
      </div>
    </Modal>
  );
}
