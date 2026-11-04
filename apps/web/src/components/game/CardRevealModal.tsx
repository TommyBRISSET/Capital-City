'use client';

import React from 'react';
import type { BoardPackDefinition, PlayerState, RevealedCardSummary } from '@capital-city/shared';
import { Badge, Button, Modal } from '@capital-city/ui';

export function CardRevealModal({
  revealed,
  pack,
  players,
  onDismiss,
}: {
  revealed: RevealedCardSummary | null;
  pack: BoardPackDefinition;
  players: PlayerState[];
  onDismiss: () => void;
}) {
  if (!revealed) return null;

  const actor = players.find((p) => p.id === revealed.actorId);
  const isEvent = revealed.card.deckType === 'EVENT';
  const deckTitle = isEvent ? pack.theme.eventDeckName : pack.theme.communityDeckName;

  return (
    <Modal
      open={true}
      onClose={onDismiss}
      title={deckTitle}
      subtitle={`Carte tirée par ${actor?.displayName ?? 'un joueur'}`}
      maxWidthClass="max-w-md"
    >
      <div className="space-y-4 text-center" data-testid="card-reveal-modal">
        <div
          className={`rounded-2xl border p-6 space-y-3 ${
            isEvent
              ? 'border-teal-500/45 bg-gradient-to-br from-teal-950/60 to-slate-950'
              : 'border-amber-500/45 bg-gradient-to-br from-amber-950/50 to-slate-950'
          }`}
        >
          <Badge tone={isEvent ? 'teal' : 'amber'}>
            {isEvent ? '✦ Carte événement' : '🏛 Carte communauté'}
          </Badge>
          <h3 className="text-xl font-black text-white">{revealed.card.title}</h3>
          <p className="text-sm text-slate-200 leading-relaxed">{revealed.card.description}</p>
        </div>

        <div className="flex justify-center">
          <Button variant="primary" size="md" onClick={onDismiss} data-testid="btn-dismiss-card">
            Continuer la partie
          </Button>
        </div>
      </div>
    </Modal>
  );
}
