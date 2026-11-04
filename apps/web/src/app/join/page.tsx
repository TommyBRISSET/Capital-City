'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PLAYER_TOKENS, type TokenId } from '@capital-city/shared';
import { Badge, Button, PlayerTokenAvatar } from '@capital-city/ui';
import { AppHeader } from '@/components/AppHeader';
import { useUiStore } from '@/store/ui-store';

interface PublicRoomItem {
  id: string;
  code: string;
  name: string;
  boardPackId: string;
  maxPlayers: number;
  playersCount: number;
}

export default function JoinRoomPage() {
  const router = useRouter();
  const { displayName, setDisplayName, preferredToken, setPreferredToken, addRecentRoomCode } =
    useUiStore();

  const [playerName, setPlayerName] = useState(displayName || 'Investisseur');
  const [roomCode, setRoomCode] = useState('');
  const [tokenId, setTokenId] = useState<TokenId>(preferredToken);
  const [publicRooms, setPublicRooms] = useState<PublicRoomItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/rooms')
      .then((r) => r.json())
      .then((data: { rooms?: PublicRoomItem[] }) => {
        if (data.rooms) setPublicRooms(data.rooms);
      })
      .catch(() => {
        // Ignore silent fetch error on public list
      });
  }, []);

  const joinTargetCode = async (targetCode: string) => {
    const cleanCode = targetCode.trim().toUpperCase();
    if (!cleanCode) return;
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
        throw new Error(sessionJson.error || 'Profil invalide');
      }

      const checkRes = await fetch(`/api/rooms?code=${encodeURIComponent(cleanCode)}`);
      if (!checkRes.ok) {
        throw new Error('Code de salle invalide ou salle fermée.');
      }

      setDisplayName(playerName.trim());
      setPreferredToken(tokenId);
      addRecentRoomCode(cleanCode);
      router.push(`/room/${cleanCode}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible de rejoindre la salle');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#060B16] text-slate-100 flex flex-col">
      <AppHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 sm:px-6 py-8 space-y-6">
        <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6 sm:p-8 shadow-2xl space-y-6">
          <div>
            <Badge tone="amber">Accès salle privée ou salon</Badge>
            <h1 className="mt-2 text-2xl sm:text-3xl font-extrabold text-white">
              Rejoindre une partie
            </h1>
            <p className="mt-1 text-xs sm:text-sm text-slate-400">
              Saisissez le code d’invitation transmis par l’hôte (ex. AST-7K9P).
            </p>
          </div>

          {error ? (
            <div
              role="alert"
              data-testid="join-error"
              className="rounded-xl border border-rose-500/40 bg-rose-950/60 px-4 py-3 text-sm text-rose-200"
            >
              {error}
            </div>
          ) : null}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void joinTargetCode(roomCode);
            }}
            className="space-y-5"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                  data-testid="join-player-name"
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm text-white focus:border-teal-400 focus:outline-none"
                />
              </label>

              <label className="block space-y-1.5">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                  Code d’invitation
                </span>
                <input
                  type="text"
                  required
                  placeholder="AST-4K9M"
                  value={roomCode}
                  onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                  data-testid="join-room-code"
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm font-mono uppercase tracking-widest text-amber-300 focus:border-amber-400 focus:outline-none"
                />
              </label>
            </div>

            <div className="space-y-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                Pion souhaité
              </span>
              <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
                {PLAYER_TOKENS.map((t) => {
                  const active = tokenId === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setTokenId(t.id)}
                      title={t.name}
                      className={`flex flex-col items-center justify-center rounded-xl border p-2 transition cursor-pointer ${
                        active
                          ? 'border-teal-400 bg-teal-500/15'
                          : 'border-slate-800 bg-slate-950/60 hover:border-slate-600'
                      }`}
                    >
                      <PlayerTokenAvatar tokenId={t.id} size={28} active={active} />
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <Button
                type="submit"
                variant="amber"
                size="lg"
                loading={loading}
                disabled={roomCode.trim().length < 4 || playerName.trim().length < 2}
                disabledReason="Entrez un pseudonyme et un code de salle d’au moins 4 caractères."
                data-testid="submit-join-room"
              >
                Rejoindre la salle
              </Button>
            </div>
          </form>

          {publicRooms.length > 0 && (
            <div className="pt-5 border-t border-slate-800 space-y-3">
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Salles publiques en attente
              </div>
              <div className="space-y-2">
                {publicRooms.map((r) => (
                  <div
                    key={r.id}
                    className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950/70 px-4 py-3"
                  >
                    <div>
                      <div className="text-sm font-bold text-white">{r.name}</div>
                      <div className="text-xs text-slate-400">
                        Code {r.code} • {r.playersCount}/{r.maxPlayers} joueurs • {r.boardPackId}
                      </div>
                    </div>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => void joinTargetCode(r.code)}
                    >
                      Entrer
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
