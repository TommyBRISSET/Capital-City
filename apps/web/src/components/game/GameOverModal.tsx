'use client';

import React from 'react';
import type { PublicGameState } from '@capital-city/shared';
import { Badge, Button, Modal, MoneyDisplay, PlayerTokenAvatar } from '@capital-city/ui';

export function GameOverModal({
  gameState,
  isHost,
  busy,
  onRematch,
  onReturnHome,
}: {
  gameState: PublicGameState;
  isHost: boolean;
  busy: boolean;
  onRematch: () => void;
  onReturnHome: () => void;
}) {
  if (gameState.status !== 'FINISHED') return null;

  const standings = gameState.finalStandings ?? [];
  const winner = standings[0] ?? null;

  return (
    <Modal
      open={true}
      onClose={() => {
        // Reste affiché en fin de partie
      }}
      title="Fin de la partie — palmarès officiel"
      subtitle={`Partie conclue au tour #${gameState.turnNumber}`}
      maxWidthClass="max-w-2xl"
    >
      <div className="space-y-5" data-testid="game-over-modal">
        {winner && (
          <div className="rounded-2xl border border-amber-400/50 bg-gradient-to-r from-amber-950/60 via-slate-900 to-teal-950/50 p-5 flex items-center gap-4">
            <PlayerTokenAvatar tokenId={winner.tokenId} size={56} active={true} />
            <div>
              <Badge tone="amber">🏆 Vainqueur de Capital City</Badge>
              <h3 className="mt-1 text-2xl font-black text-white">{winner.displayName}</h3>
              <p className="text-xs text-slate-300 mt-0.5">
                Patrimoine final évalué à <MoneyDisplay amount={winner.netWorth} size="sm" />
              </p>
            </div>
          </div>
        )}

        <div className="space-y-2">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-400">
            Classement des investisseurs
          </div>
          <div className="space-y-2">
            {standings.map((row) => (
              <div
                key={row.playerId}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-xs"
              >
                <div className="flex items-center gap-3">
                  <span className="font-black text-base text-amber-300 w-5">#{row.rank}</span>
                  <PlayerTokenAvatar tokenId={row.tokenId} size={28} />
                  <div>
                    <div className="font-bold text-sm text-white">{row.displayName}</div>
                    <div className="text-slate-400">
                      {row.propertiesCount} propriété(s) • {row.buildingsCount} bâtiment(s)
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  {row.isBankrupt ? (
                    <Badge tone="rose">Faillite</Badge>
                  ) : (
                    <MoneyDisplay amount={row.netWorth} size="md" />
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap justify-end gap-3 pt-3 border-t border-slate-800">
          <Button variant="secondary" size="md" onClick={onReturnHome}>
            Retour à l’accueil
          </Button>
          {isHost ? (
            <Button
              variant="amber"
              size="md"
              loading={busy}
              onClick={onRematch}
              data-testid="btn-rematch"
            >
              Lancer une revanche dans cette salle
            </Button>
          ) : (
            <span className="self-center text-xs text-slate-400">
              L’hôte peut relancer une revanche dans cette salle.
            </span>
          )}
        </div>
      </div>
    </Modal>
  );
}
