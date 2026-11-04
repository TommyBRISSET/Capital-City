'use client';

import React from 'react';
import { PLAYER_TOKENS } from '@capital-city/shared';
import { Button, Modal, PlayerTokenAvatar } from '@capital-city/ui';
import { useUiStore } from '@/store/ui-store';

export function SettingsModal() {
  const {
    settingsOpen,
    setSettingsOpen,
    reducedMotion,
    setReducedMotion,
    soundEnabled,
    setSoundEnabled,
    preferredToken,
    setPreferredToken,
    openTutorial,
  } = useUiStore();

  return (
    <Modal
      open={settingsOpen}
      onClose={() => setSettingsOpen(false)}
      title="Paramètres et confort visuel"
      subtitle="Personnalisez l’accessibilité, l’audio et votre pion favori"
    >
      <div className="space-y-5">
        <div className="flex items-center justify-between gap-4 rounded-xl border border-slate-800 bg-slate-950/70 p-4">
          <div>
            <div className="font-semibold text-sm text-white">Animations réduites</div>
            <p className="text-xs text-slate-400">
              Simplifie les transitions de pions, de cartes et de dés (respecte aussi
              prefers-reduced-motion).
            </p>
          </div>
          <input
            type="checkbox"
            aria-label="Activer les animations réduites"
            checked={reducedMotion}
            onChange={(e) => setReducedMotion(e.target.checked)}
            className="h-5 w-5 accent-teal-400 rounded cursor-pointer"
          />
        </div>

        <div className="flex items-center justify-between gap-4 rounded-xl border border-slate-800 bg-slate-950/70 p-4">
          <div>
            <div className="font-semibold text-sm text-white">Effets sonores</div>
            <p className="text-xs text-slate-400">
              Retours acoustiques discrets lors des lancers de dés, achats et alertes.
            </p>
          </div>
          <input
            type="checkbox"
            aria-label="Activer les effets sonores"
            checked={soundEnabled}
            onChange={(e) => setSoundEnabled(e.target.checked)}
            className="h-5 w-5 accent-teal-400 rounded cursor-pointer"
          />
        </div>

        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
            Pion par défaut
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {PLAYER_TOKENS.map((t) => {
              const selected = preferredToken === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setPreferredToken(t.id)}
                  className={`flex flex-col items-center gap-1.5 rounded-xl border p-2.5 text-center transition cursor-pointer ${
                    selected
                      ? 'border-teal-400 bg-teal-500/15 text-white'
                      : 'border-slate-800 bg-slate-950/60 text-slate-300 hover:border-slate-600'
                  }`}
                >
                  <PlayerTokenAvatar tokenId={t.id} size={32} active={selected} />
                  <span className="text-xs font-semibold leading-tight">{t.name}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-800">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setSettingsOpen(false);
              openTutorial(0);
            }}
          >
            Relancer le tutoriel interactif
          </Button>
          <Button variant="primary" size="sm" onClick={() => setSettingsOpen(false)}>
            Enregistrer et fermer
          </Button>
        </div>
      </div>
    </Modal>
  );
}
