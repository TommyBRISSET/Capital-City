'use client';

import React from 'react';
import type { DomainErrorPayload } from '@capital-city/shared';

export type SocketConnectionState = 'connecting' | 'connected' | 'reconnecting' | 'offline';

export function ConnectionBanner({
  connectionState,
  lastError,
  onDismissError,
  onManualReconnect,
}: {
  connectionState: SocketConnectionState;
  lastError: DomainErrorPayload | null;
  onDismissError: () => void;
  onManualReconnect: () => void;
}) {
  return (
    <div className="space-y-2">
      {connectionState !== 'connected' && (
        <div
          role="status"
          aria-live="polite"
          data-testid="connection-status-banner"
          className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border px-4 py-2.5 text-xs font-medium ${
            connectionState === 'offline'
              ? 'border-rose-500/40 bg-rose-950/75 text-rose-200'
              : 'border-amber-500/40 bg-amber-950/70 text-amber-200'
          }`}
        >
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-current animate-pulse" />
            <span>
              {connectionState === 'connecting'
                ? 'Connexion sécurisée au serveur temps réel…'
                : connectionState === 'reconnecting'
                  ? 'Connexion interrompue — reconnexion automatique en cours (état local préservé)…'
                  : 'Mode hors ligne temporaire — vos données de partie sont conservées sur le serveur.'}
            </span>
          </div>
          {connectionState === 'offline' && (
            <button
              type="button"
              onClick={onManualReconnect}
              className="rounded-lg bg-rose-500/25 px-2.5 py-1 text-xs font-semibold text-white hover:bg-rose-500/40 cursor-pointer"
            >
              Reconnecter maintenant
            </button>
          )}
        </div>
      )}

      {lastError && (
        <div
          role="alert"
          data-testid="domain-error-banner"
          className="flex items-center justify-between gap-3 rounded-xl border border-rose-500/45 bg-rose-950/80 px-4 py-2.5 text-xs text-rose-100 shadow-lg"
        >
          <div>
            <strong className="font-bold uppercase tracking-wider text-rose-300 mr-2">
              [{lastError.code}]
            </strong>
            <span>{lastError.message}</span>
          </div>
          <button
            type="button"
            onClick={onDismissError}
            aria-label="Fermer l'alerte"
            className="rounded-lg px-2 py-1 text-rose-300 hover:bg-rose-900/60 hover:text-white cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
