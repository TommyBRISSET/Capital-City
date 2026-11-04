'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import type { Socket } from 'socket.io-client';
import {
  PLAYER_TOKENS,
  type BoardPackId,
  type ChatMessagePayload,
  type DomainErrorPayload,
  type GameAction,
  type PublicGameState,
  type RoomSummary,
  type RulesetConfig,
  type TokenId,
} from '@capital-city/shared';
import { Badge, Button, PlayerTokenAvatar } from '@capital-city/ui';
import { AppHeader } from '@/components/AppHeader';
import { ConnectionBanner, type SocketConnectionState } from '@/components/game/ConnectionBanner';
import { GameScreen } from '@/components/game/GameScreen';
import { LobbyView } from '@/components/game/LobbyView';
import { createAuthenticatedSocket, makeCommandId } from '@/lib/realtime-client';
import { playSoundCue } from '@/lib/sound';
import { useUiStore } from '@/store/ui-store';

interface ClientSession {
  userId: string;
  displayName: string;
  token: string;
}

export default function RoomPage() {
  const params = useParams<{ code: string }>();
  const router = useRouter();
  const roomCode = (params?.code ?? '').toString().trim().toUpperCase();

  const {
    displayName: storedName,
    setDisplayName,
    preferredToken,
    setPreferredToken,
    soundEnabled,
    addRecentRoomCode,
  } = useUiStore();

  const [session, setSession] = useState<ClientSession | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [guestNameInput, setGuestNameInput] = useState(storedName || 'Investisseur');
  const [guestTokenInput, setGuestTokenInput] = useState<TokenId>(preferredToken);
  const [onboardingBusy, setOnboardingBusy] = useState(false);

  const [connectionState, setConnectionState] = useState<SocketConnectionState>('connecting');
  const [room, setRoom] = useState<RoomSummary | null>(null);
  const [gameState, setGameState] = useState<PublicGameState | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessagePayload[]>([]);
  const [lastError, setLastError] = useState<DomainErrorPayload | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  const socketRef = useRef<Socket | null>(null);
  const soundEnabledRef = useRef(soundEnabled);
  soundEnabledRef.current = soundEnabled;

  // 1. Vérifier la session existante au chargement
  useEffect(() => {
    let active = true;
    fetch('/api/session')
      .then((r) => r.json())
      .then((data: { authenticated?: boolean; session?: ClientSession | null }) => {
        if (!active) return;
        if (data.authenticated && data.session) {
          setSession(data.session);
        }
      })
      .catch(() => {
        // Affichage du formulaire invité si pas de session
      })
      .finally(() => {
        if (active) setCheckingSession(false);
      });

    return () => {
      active = false;
    };
  }, []);

  // 2. Connexion Socket.IO temps réel dès que la session est disponible
  useEffect(() => {
    if (!session || !roomCode) return;

    addRecentRoomCode(roomCode);
    setConnectionState('connecting');

    const socket = createAuthenticatedSocket(session.token);
    socketRef.current = socket;

    const joinOrRejoin = () => {
      socket.emit(
        'room:join',
        { code: roomCode, tokenId: preferredToken },
        (ack?: {
          ok: boolean;
          data?: {
            room: RoomSummary;
            gameSnapshot: PublicGameState | null;
            chatHistory: ChatMessagePayload[];
          };
          error?: DomainErrorPayload;
        }) => {
          if (ack?.ok && ack.data) {
            setRoom(ack.data.room);
            if (ack.data.gameSnapshot) {
              setGameState(ack.data.gameSnapshot);
            }
            setChatMessages(ack.data.chatHistory ?? []);
          } else if (ack?.error) {
            setLastError(ack.error);
          }
        },
      );
    };

    socket.on('connect', () => {
      setConnectionState('connected');
      setLastError(null);
      joinOrRejoin();
    });

    socket.io.on('reconnect_attempt', () => {
      setConnectionState('reconnecting');
    });

    socket.on('disconnect', () => {
      setConnectionState('reconnecting');
    });

    socket.on('connect_error', () => {
      setConnectionState('offline');
    });

    socket.on('room:updated', (nextRoom: RoomSummary) => {
      setRoom(nextRoom);
      if (nextRoom.status === 'WAITING') {
        setGameState(null);
      }
    });

    socket.on('game:started', (snap: PublicGameState) => {
      setGameState(snap);
      playSoundCue('cash', soundEnabledRef.current);
    });

    socket.on('game:snapshot', (snap: PublicGameState) => {
      setGameState(snap);
    });

    socket.on('game:rematch-ready', (resetRoom: RoomSummary) => {
      setRoom(resetRoom);
      setGameState(null);
    });

    socket.on('chat:message', (msg: ChatMessagePayload) => {
      setChatMessages((prev) => [...prev.slice(-49), msg]);
    });

    socket.on('dice:rolled', () => {
      playSoundCue('dice', soundEnabledRef.current);
    });

    socket.on('asset:updated', () => {
      playSoundCue('buy', soundEnabledRef.current);
    });

    socket.on('card:revealed', () => {
      playSoundCue('card', soundEnabledRef.current);
    });

    socket.on('game:ended', () => {
      playSoundCue('victory', soundEnabledRef.current);
    });

    socket.on('error:domain', (errPayload: DomainErrorPayload) => {
      setLastError(errPayload);
      playSoundCue('alert', soundEnabledRef.current);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [session, roomCode, preferredToken, addRecentRoomCode]);

  const handleGuestOnboarding = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!guestNameInput.trim()) return;
    setOnboardingBusy(true);
    setLastError(null);
    try {
      const res = await fetch('/api/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName: guestNameInput.trim(),
          avatar: guestTokenInput,
        }),
      });
      const json = (await res.json()) as {
        authenticated?: boolean;
        session?: ClientSession;
        error?: string;
      };
      if (!res.ok || !json.session) {
        throw new Error(json.error || 'Impossible de créer votre session');
      }
      setDisplayName(guestNameInput.trim());
      setPreferredToken(guestTokenInput);
      setSession(json.session);
    } catch (err) {
      setLastError({
        code: 'SESSION_ERROR',
        message: err instanceof Error ? err.message : 'Erreur de session',
      });
    } finally {
      setOnboardingBusy(false);
    }
  };

  const handleDispatchGameAction = useCallback(
    (action: GameAction) => {
      const socket = socketRef.current;
      if (!socket || !gameState) return;
      setBusyAction(action.type);
      socket.emit(
        'game:command',
        {
          commandId: makeCommandId(action.type.replace(':', '-')),
          gameId: gameState.id,
          expectedVersion: gameState.version,
          action,
        },
        () => {
          setBusyAction(null);
        },
      );
    },
    [gameState],
  );

  const handleSelectToken = (tokenId: TokenId) => {
    const socket = socketRef.current;
    if (!socket) return;
    setPreferredToken(tokenId);
    socket.emit('room:select-token', { roomCode, tokenId });
  };

  const handleToggleReady = (isReady: boolean) => {
    const socket = socketRef.current;
    if (!socket) return;
    setBusyAction('ready');
    socket.emit('room:ready', { roomCode, isReady }, () => setBusyAction(null));
  };

  const handleUpdateRules = (patch: {
    boardPackId?: BoardPackId;
    maxPlayers?: number;
    ruleset?: Partial<RulesetConfig>;
  }) => {
    const socket = socketRef.current;
    if (!socket) return;
    socket.emit('room:update-rules', { roomCode, ...patch });
  };

  const handleStartGame = () => {
    const socket = socketRef.current;
    if (!socket) return;
    setBusyAction('start');
    socket.emit('game:start', { roomCode }, () => setBusyAction(null));
  };

  const handleLeaveRoom = () => {
    const socket = socketRef.current;
    if (socket) {
      socket.emit('room:leave', { roomCode }, () => {
        router.push('/');
      });
    } else {
      router.push('/');
    }
  };

  const handleSendChat = (text: string) => {
    const socket = socketRef.current;
    if (!socket) return;
    socket.emit('chat:send', { roomCode, text });
  };

  const handleRematch = () => {
    const socket = socketRef.current;
    if (!socket) return;
    setBusyAction('rematch');
    socket.emit('game:rematch', { roomCode }, () => setBusyAction(null));
  };

  return (
    <div className="min-h-screen bg-[#060B16] text-slate-100 flex flex-col">
      <AppHeader />

      <div className="mx-auto w-full max-w-[1440px] px-3 sm:px-5 pt-3">
        <ConnectionBanner
          connectionState={session ? connectionState : 'connected'}
          lastError={lastError}
          onDismissError={() => setLastError(null)}
          onManualReconnect={() => socketRef.current?.connect()}
        />
      </div>

      {checkingSession ? (
        <main className="flex-1 flex items-center justify-center p-6">
          <div className="text-sm text-slate-400">Chargement de la salle {roomCode}…</div>
        </main>
      ) : !session ? (
        /* Accueil direct par lien partagé sans session préalable */
        <main className="mx-auto w-full max-w-lg flex-1 px-4 py-12">
          <form
            onSubmit={handleGuestOnboarding}
            data-testid="direct-join-onboarding"
            className="rounded-3xl border border-slate-800 bg-slate-900/90 p-6 sm:p-8 shadow-2xl space-y-5"
          >
            <div>
              <Badge tone="amber">Invitation directe • {roomCode}</Badge>
              <h1 className="mt-2 text-2xl font-extrabold text-white">
                Entrer dans la salle {roomCode}
              </h1>
              <p className="mt-1 text-xs text-slate-400">
                Choisissez votre pseudonyme et votre pion pour rejoindre la table immédiatement.
              </p>
            </div>

            <label className="block space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                Pseudonyme
              </span>
              <input
                type="text"
                required
                minLength={2}
                maxLength={24}
                value={guestNameInput}
                onChange={(e) => setGuestNameInput(e.target.value)}
                data-testid="direct-join-name"
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm text-white focus:border-teal-400 focus:outline-none"
              />
            </label>

            <div className="space-y-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                Pion souhaité
              </span>
              <div className="grid grid-cols-4 gap-2">
                {PLAYER_TOKENS.map((t) => {
                  const active = guestTokenInput === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setGuestTokenInput(t.id)}
                      className={`flex flex-col items-center rounded-xl border p-2 cursor-pointer ${
                        active
                          ? 'border-teal-400 bg-teal-500/15'
                          : 'border-slate-800 bg-slate-950/70'
                      }`}
                    >
                      <PlayerTokenAvatar tokenId={t.id} size={26} active={active} />
                    </button>
                  );
                })}
              </div>
            </div>

            <Button
              type="submit"
              variant="primary"
              size="lg"
              loading={onboardingBusy}
              className="w-full"
              data-testid="direct-join-submit"
            >
              Rejoindre la salle {roomCode}
            </Button>
          </form>
        </main>
      ) : !room ? (
        <main className="flex-1 flex flex-col items-center justify-center p-6 gap-4">
          <div className="text-sm text-slate-300">
            Synchronisation de la salle <strong className="text-amber-300">{roomCode}</strong>…
          </div>
          {lastError ? (
            <Button variant="secondary" size="sm" onClick={() => router.push('/join')}>
              Choisir un autre code de salle
            </Button>
          ) : null}
        </main>
      ) : room.status === 'WAITING' || !gameState ? (
        <main className="flex-1">
          <LobbyView
            room={room}
            currentUserId={session.userId}
            chatMessages={chatMessages}
            busyAction={busyAction}
            onSelectToken={handleSelectToken}
            onToggleReady={handleToggleReady}
            onUpdateRules={handleUpdateRules}
            onStartGame={handleStartGame}
            onLeaveRoom={handleLeaveRoom}
            onSendChat={handleSendChat}
          />
        </main>
      ) : (
        <main className="flex-1">
          <GameScreen
            room={room}
            gameState={gameState}
            currentUserId={session.userId}
            chatMessages={chatMessages}
            busyCommand={busyAction !== null}
            onDispatchAction={handleDispatchGameAction}
            onSendChat={handleSendChat}
            onRematch={handleRematch}
            onReturnHome={() => router.push('/')}
          />
        </main>
      )}
    </div>
  );
}
