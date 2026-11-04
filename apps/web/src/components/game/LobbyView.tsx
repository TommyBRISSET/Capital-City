'use client';

import React, { useState } from 'react';
import { ALL_BOARD_PACKS } from '@capital-city/board-packs';
import {
  PLAYER_TOKENS,
  type BoardPackId,
  type ChatMessagePayload,
  type RoomSummary,
  type RulesetConfig,
  type TokenId,
} from '@capital-city/shared';
import { Badge, Button, PlayerTokenAvatar } from '@capital-city/ui';

export interface LobbyViewProps {
  room: RoomSummary;
  currentUserId: string;
  chatMessages: ChatMessagePayload[];
  busyAction: string | null;
  onSelectToken: (tokenId: TokenId) => void;
  onToggleReady: (nextReady: boolean) => void;
  onUpdateRules: (patch: {
    boardPackId?: BoardPackId;
    maxPlayers?: number;
    ruleset?: Partial<RulesetConfig>;
  }) => void;
  onStartGame: () => void;
  onLeaveRoom: () => void;
  onSendChat: (text: string) => void;
}

export function LobbyView({
  room,
  currentUserId,
  chatMessages,
  busyAction,
  onSelectToken,
  onToggleReady,
  onUpdateRules,
  onStartGame,
  onLeaveRoom,
  onSendChat,
}: LobbyViewProps) {
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [chatText, setChatText] = useState('');

  const me = room.players.find((p) => p.userId === currentUserId);
  const isHost = room.hostId === currentUserId;
  const unreadyGuests = room.players.filter((p) => !p.isHost && !p.isReady);
  const canStart = isHost && room.players.length >= 2 && unreadyGuests.length === 0;

  let startDisabledReason: string | undefined;
  if (!isHost) {
    startDisabledReason = 'Seul l’hôte de la salle peut lancer la partie.';
  } else if (room.players.length < 2) {
    startDisabledReason = 'Invitez au moins un second joueur (2 à 8 joueurs requis).';
  } else if (unreadyGuests.length > 0) {
    startDisabledReason = `En attente de : ${unreadyGuests.map((u) => u.displayName).join(', ')}`;
  }

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(room.code);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 1800);
    } catch {
      // Ignore clipboard restriction
    }
  };

  const handleCopyLink = async () => {
    try {
      const url =
        typeof window !== 'undefined' ? `${window.location.origin}/room/${room.code}` : room.code;
      await navigator.clipboard.writeText(url);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 1800);
    } catch {
      // Ignore clipboard restriction
    }
  };

  return (
    <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 py-6 space-y-6" data-testid="lobby-view">
      {/* En-tête de la salle d'attente */}
      <div className="rounded-3xl border border-slate-800 bg-slate-900/85 p-5 sm:p-7 shadow-2xl flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="teal">Salon d’attente</Badge>
            <Badge tone="amber">
              {room.players.length} / {room.maxPlayers} joueurs
            </Badge>
            {room.isPublic ? <Badge tone="emerald">Salle publique</Badge> : <Badge>Privée</Badge>}
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white">{room.name}</h1>
          <p className="text-xs sm:text-sm text-slate-400">
            Partagez le code ou le lien d’invitation, choisissez chacun un pion unique puis
            marquez-vous prêt.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="rounded-2xl border border-amber-500/40 bg-slate-950 px-4 py-2 text-center">
            <div className="text-[10px] uppercase tracking-wider text-slate-400">
              Code d’invitation
            </div>
            <div
              data-testid="lobby-room-code"
              className="font-mono text-xl font-black tracking-widest text-amber-300"
            >
              {room.code}
            </div>
          </div>

          <Button variant="secondary" size="sm" onClick={() => void handleCopyCode()}>
            {copiedCode ? '✓ Code copié' : 'Copier le code'}
          </Button>
          <Button variant="secondary" size="sm" onClick={() => void handleCopyLink()}>
            {copiedLink ? '✓ Lien copié' : 'Copier le lien'}
          </Button>
          <Button variant="ghost" size="sm" onClick={onLeaveRoom}>
            Quitter
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Colonne gauche : Participants & Choix du pion */}
        <div className="lg:col-span-7 space-y-6">
          {/* Liste des joueurs */}
          <section className="rounded-3xl border border-slate-800 bg-slate-900/80 p-5 sm:p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-white">Participants connectés</h2>
              <span className="text-xs text-slate-400">Minimum 2 joueurs</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" data-testid="lobby-players-list">
              {room.players.map((slot) => (
                <div
                  key={slot.userId}
                  data-testid={`lobby-player-${slot.displayName}`}
                  className={`flex items-center justify-between rounded-2xl border p-3.5 ${
                    slot.userId === currentUserId
                      ? 'border-teal-500/50 bg-teal-500/10'
                      : 'border-slate-800 bg-slate-950/75'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <PlayerTokenAvatar tokenId={slot.tokenId} size={36} active={slot.isReady} />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-sm text-white truncate">
                          {slot.displayName}
                        </span>
                        {slot.userId === currentUserId && (
                          <span className="text-[10px] text-teal-300 font-semibold">(vous)</span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span
                          className={`h-2 w-2 rounded-full ${slot.isConnected ? 'bg-emerald-400' : 'bg-amber-400'}`}
                        />
                        <span className="text-[11px] text-slate-400">
                          {slot.isHost ? 'Hôte de la table' : 'Invité'}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div>
                    {slot.isHost ? (
                      <Badge tone="amber">Hôte</Badge>
                    ) : slot.isReady ? (
                      <Badge tone="emerald">Prêt ✓</Badge>
                    ) : (
                      <Badge tone="neutral">En attente</Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Sélection des 8 pions */}
          <section
            className="rounded-3xl border border-slate-800 bg-slate-900/80 p-5 sm:p-6 space-y-4"
            data-testid="lobby-token-picker"
          >
            <div>
              <h2 className="text-base font-bold text-white">Choix de votre pion</h2>
              <p className="text-xs text-slate-400">
                Chaque joueur dispose d’un pion exclusif sur le plateau.
              </p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {PLAYER_TOKENS.map((t) => {
                const holder = room.players.find((p) => p.tokenId === t.id);
                const isMine = me?.tokenId === t.id;
                const takenByOther = Boolean(holder && holder.userId !== currentUserId);

                return (
                  <button
                    key={t.id}
                    type="button"
                    disabled={takenByOther}
                    onClick={() => onSelectToken(t.id)}
                    data-testid={`lobby-token-${t.id}`}
                    title={takenByOther ? `Déjà choisi par ${holder?.displayName}` : t.description}
                    className={`flex flex-col items-start gap-2 rounded-2xl border p-3 text-left transition ${
                      isMine
                        ? 'border-teal-400 bg-teal-500/15 text-white cursor-pointer'
                        : takenByOther
                          ? 'border-slate-800/70 bg-slate-950/35 opacity-45 cursor-not-allowed'
                          : 'border-slate-800 bg-slate-950/75 text-slate-200 hover:border-slate-600 cursor-pointer'
                    }`}
                  >
                    <div className="flex items-center justify-between w-full">
                      <PlayerTokenAvatar tokenId={t.id} size={30} active={isMine} />
                      {isMine ? <Badge tone="teal">Choisi</Badge> : null}
                    </div>
                    <div className="w-full">
                      <div className="text-xs font-bold truncate">{t.name}</div>
                      <div className="text-[10px] text-slate-400 truncate">
                        {takenByOther ? `Pris par ${holder?.displayName}` : 'Disponible'}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        </div>

        {/* Colonne droite : Paramètres de partie, Action Prêt/Démarrer & Chat */}
        <div className="lg:col-span-5 space-y-6">
          <section className="rounded-3xl border border-slate-800 bg-slate-900/80 p-5 sm:p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-white">Configuration de la partie</h2>
              {!isHost && <Badge>Lecture seule</Badge>}
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <div className="text-slate-400 mb-1.5">Plateau thématique</div>
                <div className="grid grid-cols-3 gap-2">
                  {ALL_BOARD_PACKS.map((p) => {
                    const active = room.boardPackId === p.id;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        disabled={!isHost}
                        onClick={() => onUpdateRules({ boardPackId: p.id })}
                        data-testid={`lobby-pack-${p.id}`}
                        className={`rounded-xl border px-2.5 py-2 text-left transition ${
                          active
                            ? 'border-teal-400 bg-teal-500/15 text-white font-bold'
                            : 'border-slate-800 bg-slate-950/70 text-slate-300'
                        } ${isHost ? 'cursor-pointer hover:border-slate-600' : 'cursor-default'}`}
                      >
                        <div className="truncate">{p.name}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-1">
                <label className="block space-y-1">
                  <span className="text-slate-400">Capital initial</span>
                  <select
                    disabled={!isHost}
                    value={room.ruleset.startingCash}
                    onChange={(e) =>
                      onUpdateRules({ ruleset: { startingCash: Number(e.target.value) } })
                    }
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white tabular-nums disabled:opacity-70"
                  >
                    {[1000, 1500, 2000, 2500].map((v) => (
                      <option key={v} value={v}>
                        {v} Cr
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block space-y-1">
                  <span className="text-slate-400">Prime de départ</span>
                  <select
                    disabled={!isHost}
                    value={room.ruleset.passStartBonus}
                    onChange={(e) =>
                      onUpdateRules({ ruleset: { passStartBonus: Number(e.target.value) } })
                    }
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white tabular-nums disabled:opacity-70"
                  >
                    {[100, 200, 300, 400].map((v) => (
                      <option key={v} value={v}>
                        {v} Cr
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="flex flex-wrap gap-4 pt-1">
                <label className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    disabled={!isHost}
                    checked={room.ruleset.auctionEnabled}
                    onChange={(e) =>
                      onUpdateRules({ ruleset: { auctionEnabled: e.target.checked } })
                    }
                    className="h-4 w-4 accent-teal-400"
                  />
                  <span className="text-slate-300">Enchères sur refus d’achat</span>
                </label>

                <label className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    disabled={!isHost}
                    checked={room.ruleset.freeParkingJackpot}
                    onChange={(e) =>
                      onUpdateRules({ ruleset: { freeParkingJackpot: e.target.checked } })
                    }
                    className="h-4 w-4 accent-teal-400"
                  />
                  <span className="text-slate-300">Cagnotte pause</span>
                </label>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-800 flex flex-col gap-2.5">
              {!isHost && me ? (
                <Button
                  variant={me.isReady ? 'secondary' : 'primary'}
                  size="lg"
                  loading={busyAction === 'ready'}
                  onClick={() => onToggleReady(!me.isReady)}
                  data-testid="lobby-ready-btn"
                  className="w-full"
                >
                  {me.isReady ? 'Annuler « prêt »' : 'Je suis prêt !'}
                </Button>
              ) : null}

              {isHost ? (
                <Button
                  variant="amber"
                  size="lg"
                  loading={busyAction === 'start'}
                  disabled={!canStart}
                  disabledReason={startDisabledReason}
                  onClick={onStartGame}
                  data-testid="lobby-start-btn"
                  className="w-full"
                >
                  Lancer la partie ({room.players.length} joueurs)
                </Button>
              ) : null}
            </div>
          </section>

          {/* Chat du salon */}
          <section className="rounded-3xl border border-slate-800 bg-slate-900/80 p-5 space-y-3">
            <h2 className="text-sm font-bold text-white">Discussion de la salle</h2>
            <div className="h-36 overflow-y-auto space-y-2 rounded-xl bg-slate-950/75 p-3 border border-slate-800/80 text-xs">
              {chatMessages.length === 0 ? (
                <p className="text-slate-500">
                  Aucun message pour le moment. Saluez vos adversaires !
                </p>
              ) : (
                chatMessages.map((m) => (
                  <div key={m.id}>
                    <strong className="text-teal-300">{m.senderName} :</strong>{' '}
                    <span className="text-slate-200">{m.text}</span>
                  </div>
                ))
              )}
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!chatText.trim()) return;
                onSendChat(chatText.trim());
                setChatText('');
              }}
              className="flex gap-2"
            >
              <input
                type="text"
                maxLength={240}
                placeholder="Écrire un message…"
                value={chatText}
                onChange={(e) => setChatText(e.target.value)}
                data-testid="lobby-chat-input"
                className="flex-1 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white focus:border-teal-400 focus:outline-none"
              />
              <Button type="submit" variant="secondary" size="sm" disabled={!chatText.trim()}>
                Envoyer
              </Button>
            </form>
          </section>
        </div>
      </div>
    </div>
  );
}
