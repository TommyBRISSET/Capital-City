'use client';

import React, { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ALL_BOARD_PACKS } from '@capital-city/board-packs';
import {
  DEFAULT_RULESET_CONFIG,
  PLAYER_TOKENS,
  type BoardPackId,
  type TokenId,
} from '@capital-city/shared';
import { Badge, Button, PlayerTokenAvatar } from '@capital-city/ui';
import { AppHeader } from '@/components/AppHeader';
import { useUiStore } from '@/store/ui-store';

function CreateRoomForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialPack = (searchParams.get('pack') as BoardPackId | null) ?? 'asteria-city';

  const { displayName, setDisplayName, preferredToken, setPreferredToken, addRecentRoomCode } =
    useUiStore();

  const [playerName, setPlayerName] = useState(displayName || 'Architecte');
  const [roomName, setRoomName] = useState('Salon prestige');
  const [boardPackId, setBoardPackId] = useState<BoardPackId>(
    ALL_BOARD_PACKS.some((p) => p.id === initialPack) ? initialPack : 'asteria-city',
  );
  const [tokenId, setTokenId] = useState<TokenId>(preferredToken);
  const [maxPlayers, setMaxPlayers] = useState(4);
  const [startingCash, setStartingCash] = useState(DEFAULT_RULESET_CONFIG.startingCash);
  const [passStartBonus, setPassStartBonus] = useState(DEFAULT_RULESET_CONFIG.passStartBonus);
  const [freeParkingJackpot, setFreeParkingJackpot] = useState(false);
  const [maxDurationMinutes, setMaxDurationMinutes] = useState<number | null>(null);
  const [isPublic, setIsPublic] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const sessionRes = await fetch('/api/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: playerName.trim(), avatar: tokenId }),
      });
      const sessionJson = (await sessionRes.json()) as { error?: string };
      if (!sessionRes.ok) {
        throw new Error(sessionJson.error || 'Échec d’initialisation du profil');
      }

      setDisplayName(playerName.trim());
      setPreferredToken(tokenId);

      const roomRes = await fetch('/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: roomName.trim(),
          boardPackId,
          maxPlayers,
          isPublic,
          tokenId,
          ruleset: {
            startingCash,
            passStartBonus,
            freeParkingJackpot,
            maxDurationMinutes,
          },
        }),
      });
      const roomJson = (await roomRes.json()) as {
        room?: { code: string };
        error?: string;
      };
      if (!roomRes.ok || !roomJson.room) {
        throw new Error(roomJson.error || 'Impossible de créer la salle');
      }

      addRecentRoomCode(roomJson.room.code);
      router.push(`/room/${roomJson.room.code}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inattendue');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6" data-testid="create-room-form">
      {error ? (
        <div
          role="alert"
          className="rounded-xl border border-rose-500/40 bg-rose-950/60 px-4 py-3 text-sm text-rose-200"
        >
          {error}
        </div>
      ) : null}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <label className="block space-y-1.5">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-300">
            Votre pseudonyme
          </span>
          <input
            type="text"
            required
            minLength={2}
            maxLength={24}
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            data-testid="input-player-name"
            className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm text-white focus:border-teal-400 focus:outline-none"
          />
        </label>

        <label className="block space-y-1.5">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-300">
            Nom de la salle
          </span>
          <input
            type="text"
            required
            minLength={2}
            maxLength={40}
            value={roomName}
            onChange={(e) => setRoomName(e.target.value)}
            data-testid="input-room-name"
            className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm text-white focus:border-teal-400 focus:outline-none"
          />
        </label>
      </div>

      {/* Choix du plateau */}
      <div className="space-y-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-300">
          Plateau thématique
        </span>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {ALL_BOARD_PACKS.map((p) => {
            const active = boardPackId === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setBoardPackId(p.id)}
                data-testid={`create-pack-${p.id}`}
                className={`rounded-xl border p-3.5 text-left transition cursor-pointer ${
                  active
                    ? 'border-teal-400 bg-teal-500/10 text-white'
                    : 'border-slate-800 bg-slate-950/70 text-slate-300 hover:border-slate-600'
                }`}
              >
                <div className="font-bold text-sm">{p.name}</div>
                <div className="text-[11px] text-teal-300">{p.subtitle}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Choix du pion */}
      <div className="space-y-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-300">
          Votre pion
        </span>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {PLAYER_TOKENS.map((t) => {
            const active = tokenId === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTokenId(t.id)}
                data-testid={`token-option-${t.id}`}
                className={`flex items-center gap-2.5 rounded-xl border p-2.5 text-left transition cursor-pointer ${
                  active
                    ? 'border-teal-400 bg-teal-500/15 text-white'
                    : 'border-slate-800 bg-slate-950/60 text-slate-300 hover:border-slate-600'
                }`}
              >
                <PlayerTokenAvatar tokenId={t.id} size={28} active={active} />
                <span className="text-xs font-semibold truncate">{t.name}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Paramètres économiques */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-2 border-t border-slate-800">
        <label className="block space-y-1">
          <span className="text-xs text-slate-400">Joueurs max (2–8)</span>
          <select
            value={maxPlayers}
            onChange={(e) => setMaxPlayers(Number(e.target.value))}
            className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
          >
            {[2, 3, 4, 5, 6, 7, 8].map((n) => (
              <option key={n} value={n}>
                {n} joueurs
              </option>
            ))}
          </select>
        </label>

        <label className="block space-y-1">
          <span className="text-xs text-slate-400">Capital initial</span>
          <select
            value={startingCash}
            onChange={(e) => setStartingCash(Number(e.target.value))}
            className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white tabular-nums"
          >
            {[1000, 1500, 2000, 2500].map((c) => (
              <option key={c} value={c}>
                {c} Cr
              </option>
            ))}
          </select>
        </label>

        <label className="block space-y-1">
          <span className="text-xs text-slate-400">Prime de départ</span>
          <select
            value={passStartBonus}
            onChange={(e) => setPassStartBonus(Number(e.target.value))}
            className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white tabular-nums"
          >
            {[100, 200, 300, 400].map((b) => (
              <option key={b} value={b}>
                {b} Cr
              </option>
            ))}
          </select>
        </label>

        <label className="block space-y-1">
          <span className="text-xs text-slate-400">Durée limite</span>
          <select
            value={maxDurationMinutes ?? 0}
            onChange={(e) => {
              const v = Number(e.target.value);
              setMaxDurationMinutes(v === 0 ? null : v);
            }}
            className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
          >
            <option value={0}>Sans limite (classique)</option>
            <option value={30}>30 minutes</option>
            <option value={60}>60 minutes</option>
            <option value={90}>90 minutes</option>
          </select>
        </label>
      </div>

      <div className="flex flex-wrap gap-6 pt-1 text-xs text-slate-300">
        <label className="inline-flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={freeParkingJackpot}
            onChange={(e) => setFreeParkingJackpot(e.target.checked)}
            className="h-4 w-4 accent-teal-400 rounded"
          />
          <span>Cagnotte sur la case pause (optionnel)</span>
        </label>

        <label className="inline-flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={isPublic}
            onChange={(e) => setIsPublic(e.target.checked)}
            className="h-4 w-4 accent-teal-400 rounded"
          />
          <span>Lister la salle publiquement dans le salon</span>
        </label>
      </div>

      <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
        <Button
          type="submit"
          variant="primary"
          size="lg"
          loading={loading}
          disabled={!playerName.trim() || !roomName.trim()}
          disabledReason="Renseignez votre pseudonyme et le nom de la salle."
          data-testid="submit-create-room"
        >
          Générer le code et ouvrir le salon
        </Button>
      </div>
    </form>
  );
}

export default function CreateRoomPage() {
  return (
    <div className="min-h-screen bg-[#060B16] text-slate-100 flex flex-col">
      <AppHeader />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 sm:px-6 py-8">
        <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6 sm:p-8 shadow-2xl space-y-6">
          <div>
            <Badge tone="teal">Nouvelle partie multijoueur</Badge>
            <h1 className="mt-2 text-2xl sm:text-3xl font-extrabold text-white">
              Créer une salle privée
            </h1>
            <p className="mt-1 text-xs sm:text-sm text-slate-400">
              Configurez votre plateau, vos règles économiques et partagez le code court avec vos
              invités.
            </p>
          </div>
          <Suspense fallback={<div className="text-sm text-slate-400">Chargement…</div>}>
            <CreateRoomForm />
          </Suspense>
        </div>
      </main>
    </div>
  );
}
