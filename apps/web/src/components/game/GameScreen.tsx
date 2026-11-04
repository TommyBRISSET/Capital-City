'use client';

import React, { useEffect, useState } from 'react';
import { getBoardPack } from '@capital-city/board-packs';
import type {
  ChatMessagePayload,
  GameAction,
  PublicGameState,
  RoomSummary,
} from '@capital-city/shared';
import {
  Badge,
  Button,
  GameBoard,
  MoneyDisplay,
  PlayerTokenAvatar,
  PropertyDeedCard,
  formatCredits,
} from '@capital-city/ui';
import { useUiStore } from '@/store/ui-store';
import { ActivityLogPanel } from './ActivityLogPanel';
import { AssetManagerModal } from './AssetManagerModal';
import { AuctionModal } from './AuctionModal';
import { BuyDecisionPanel } from './BuyDecisionPanel';
import { CardRevealModal } from './CardRevealModal';
import { DiceDisplay } from './DiceDisplay';
import { GameOverModal } from './GameOverModal';
import { TradeModal } from './TradeModal';

function getPhaseLabel(state: PublicGameState, activeName: string, isMyTurn: boolean): string {
  if (state.status === 'PAUSED') return 'Partie en pause';
  if (state.status === 'FINISHED') return 'Partie terminée';
  switch (state.phase) {
    case 'ROLL_DICE':
      return isMyTurn ? 'À vous de lancer les dés !' : `${activeName} s’apprête à lancer les dés`;
    case 'AWAITING_BUY_DECISION':
      return isMyTurn
        ? 'Décision d’achat ou mise aux enchères'
        : `${activeName} consulte un titre foncier`;
    case 'AUCTION':
      return 'Enchère immobilière ouverte à tous !';
    case 'DEBT_RESOLUTION':
      return isMyTurn
        ? 'Régularisez votre dette avant faillite'
        : `${activeName} doit régulariser une dette`;
    case 'MANAGE_AND_END':
      return isMyTurn
        ? 'Gérez votre patrimoine ou terminez votre tour'
        : `${activeName} gère son portefeuille`;
    default:
      return '';
  }
}

export function GameScreen({
  room,
  gameState,
  currentUserId,
  chatMessages,
  busyCommand,
  onDispatchAction,
  onSendChat,
  onRematch,
  onReturnHome,
}: {
  room: RoomSummary;
  gameState: PublicGameState;
  currentUserId: string;
  chatMessages: ChatMessagePayload[];
  busyCommand: boolean;
  onDispatchAction: (action: GameAction) => void;
  onSendChat: (text: string) => void;
  onRematch: () => void;
  onReturnHome: () => void;
}) {
  const { reducedMotion, openTutorial } = useUiStore();
  const pack = getBoardPack(gameState.boardPackId);

  const myPlayer = gameState.players.find((p) => p.userId === currentUserId) ?? null;
  const activePlayer =
    gameState.players.find((p) => p.id === gameState.currentPlayerId) ?? gameState.players[0]!;
  const isMyTurn = Boolean(myPlayer && myPlayer.id === gameState.currentPlayerId);
  const isHost = room.hostId === currentUserId;

  const [selectedSpaceIndex, setSelectedSpaceIndex] = useState<number>(
    myPlayer?.position ?? activePlayer.position,
  );
  const [assetModalOpen, setAssetModalOpen] = useState(false);
  const [tradeModalOpen, setTradeModalOpen] = useState(false);
  const [confirmAbandon, setConfirmAbandon] = useState(false);
  const [dismissedCardTimestamp, setDismissedCardTimestamp] = useState<number | null>(null);
  const [mobileTab, setMobileTab] = useState<'ACTION' | 'PLAYERS' | 'LOG'>('ACTION');

  // Mettre en évidence automatiquement la case d'action lors d'un achat proposé
  useEffect(() => {
    if (gameState.pendingBuySpaceIndex !== null) {
      setSelectedSpaceIndex(gameState.pendingBuySpaceIndex);
    }
  }, [gameState.pendingBuySpaceIndex]);

  const incomingTradesCount = myPlayer
    ? gameState.trades.filter((t) => t.status === 'PENDING' && t.targetId === myPlayer.id).length
    : 0;

  const pendingBuySpace =
    gameState.phase === 'AWAITING_BUY_DECISION' && gameState.pendingBuySpaceIndex !== null
      ? (pack.spaces[gameState.pendingBuySpaceIndex] ?? null)
      : null;

  const inspectedSpace = pack.spaces[selectedSpaceIndex] ?? pack.spaces[0]!;
  const inspectedAsset = gameState.assets[inspectedSpace.index] ?? null;
  const inspectedOwner = inspectedAsset?.ownerPlayerId
    ? gameState.players.find((p) => p.id === inspectedAsset.ownerPlayerId)
    : null;

  const visibleRevealedCard =
    gameState.lastRevealedCard && gameState.lastRevealedCard.timestamp !== dismissedCardTimestamp
      ? gameState.lastRevealedCard
      : null;

  return (
    <div
      className="mx-auto w-full max-w-[1440px] px-2.5 sm:px-5 py-3 pb-24 lg:pb-6 space-y-3"
      data-testid="game-screen"
    >
      {/* Barre supérieure tactique */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/90 px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2 shadow-lg">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="font-mono text-xs font-bold text-amber-300 bg-slate-950 px-2.5 py-1 rounded-lg border border-slate-800">
            {room.code}
          </span>
          <Badge tone="teal">Tour #{gameState.turnNumber}</Badge>
          <div
            className="flex items-center gap-2 text-xs sm:text-sm font-bold text-white"
            data-testid="turn-indicator"
          >
            <PlayerTokenAvatar tokenId={activePlayer.tokenId} size={22} active={true} />
            <span>{getPhaseLabel(gameState, activePlayer.displayName, isMyTurn)}</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {myPlayer && myPlayer.bankruptcyStatus !== 'BANKRUPT' && (
            <>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setAssetModalOpen(true)}
                data-testid="btn-open-assets"
              >
                🏗 Patrimoine
              </Button>
              <Button
                variant={incomingTradesCount > 0 ? 'amber' : 'secondary'}
                size="sm"
                onClick={() => setTradeModalOpen(true)}
                data-testid="btn-open-trades"
              >
                ⇄ Échanges {incomingTradesCount > 0 ? `(${incomingTradesCount})` : ''}
              </Button>
            </>
          )}

          {isHost && gameState.status !== 'FINISHED' && (
            <Button
              variant="ghost"
              size="sm"
              loading={busyCommand}
              onClick={() =>
                onDispatchAction({
                  type: gameState.status === 'PAUSED' ? 'game:unpause' : 'game:pause',
                })
              }
              data-testid="btn-toggle-pause"
            >
              {gameState.status === 'PAUSED' ? '▶ Reprendre' : '⏸ Pause'}
            </Button>
          )}

          <Button
            variant="ghost"
            size="sm"
            onClick={() => openTutorial(0)}
            title="Relancer le guide interactif"
          >
            Tutoriel
          </Button>
        </div>
      </div>

      {/* Grille principale : Plateau central + Colonne tactique latérale */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* Plateau 40 cases (Central) */}
        <div className="lg:col-span-7 xl:col-span-8">
          <GameBoard
            pack={pack}
            players={gameState.players}
            assets={gameState.assets}
            selectedSpaceIndex={selectedSpaceIndex}
            highlightedSpaceIndex={gameState.pendingBuySpaceIndex ?? activePlayer.position}
            freeParkingPot={gameState.freeParkingPot}
            onSelectSpace={(idx) => setSelectedSpaceIndex(idx)}
            centerOverlay={
              <div className="flex flex-col items-center gap-2">
                <DiceDisplay
                  roll={gameState.lastDiceRoll}
                  reducedMotion={reducedMotion}
                  rolling={busyCommand && gameState.phase === 'ROLL_DICE'}
                />
                {gameState.status === 'PAUSED' && (
                  <Badge tone="amber">⏸ Partie en pause par l’hôte</Badge>
                )}
              </div>
            }
          />
        </div>

        {/* Sélecteur d'onglets sur mobile (< lg) */}
        <div className="flex lg:hidden gap-1.5 rounded-xl bg-slate-900 p-1 border border-slate-800">
          <button
            type="button"
            onClick={() => setMobileTab('ACTION')}
            className={`flex-1 rounded-lg py-2 text-xs font-bold ${
              mobileTab === 'ACTION' ? 'bg-teal-500 text-slate-950' : 'text-slate-300'
            }`}
          >
            Actions et fiche
          </button>
          <button
            type="button"
            onClick={() => setMobileTab('PLAYERS')}
            className={`flex-1 rounded-lg py-2 text-xs font-bold ${
              mobileTab === 'PLAYERS' ? 'bg-teal-500 text-slate-950' : 'text-slate-300'
            }`}
          >
            Joueurs ({gameState.players.length})
          </button>
          <button
            type="button"
            onClick={() => setMobileTab('LOG')}
            className={`flex-1 rounded-lg py-2 text-xs font-bold ${
              mobileTab === 'LOG' ? 'bg-teal-500 text-slate-950' : 'text-slate-300'
            }`}
          >
            Journal et discussion
          </button>
        </div>

        {/* Colonne latérale droite */}
        <div className="lg:col-span-5 xl:col-span-4 space-y-3.5">
          {/* Panneau d'action principal */}
          <div
            className={
              mobileTab === 'ACTION' ? 'block space-y-3.5' : 'hidden lg:block lg:space-y-3.5'
            }
          >
            <section
              data-testid="action-panel"
              className="rounded-2xl border border-slate-800 bg-slate-900/90 p-4 space-y-3 shadow-xl"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Poste de commande
                </span>
                {myPlayer ? (
                  <MoneyDisplay amount={myPlayer.cash} size="md" />
                ) : (
                  <Badge>Mode spectateur</Badge>
                )}
              </div>

              {/* Phase ROLL_DICE */}
              {gameState.status === 'ACTIVE' && gameState.phase === 'ROLL_DICE' && (
                <div className="space-y-2.5">
                  {myPlayer?.inJail && isMyTurn && (
                    <div className="rounded-xl border border-amber-500/40 bg-amber-950/40 p-3 space-y-2 text-xs">
                      <div className="font-bold text-amber-200">
                        ⛓ Vous êtes en détention (tour {myPlayer.jailTurns + 1} /{' '}
                        {gameState.ruleset.maxJailTurns})
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="amber"
                          size="sm"
                          loading={busyCommand}
                          disabled={myPlayer.cash < gameState.ruleset.jailFine}
                          disabledReason="Trésorerie insuffisante pour régler la caution"
                          onClick={() => onDispatchAction({ type: 'jail:pay' })}
                          data-testid="btn-jail-pay"
                        >
                          Payer la caution ({formatCredits(gameState.ruleset.jailFine)})
                        </Button>
                        {myPlayer.heldCards.length > 0 && (
                          <Button
                            variant="secondary"
                            size="sm"
                            loading={busyCommand}
                            onClick={() => onDispatchAction({ type: 'jail:use-card' })}
                            data-testid="btn-jail-card"
                          >
                            Utiliser ma carte de sortie ({myPlayer.heldCards.length})
                          </Button>
                        )}
                      </div>
                    </div>
                  )}

                  <Button
                    variant="primary"
                    size="lg"
                    loading={busyCommand}
                    disabled={!isMyTurn}
                    disabledReason={`En attente du lancer de ${activePlayer.displayName}`}
                    onClick={() => onDispatchAction({ type: 'turn:roll' })}
                    data-testid="btn-roll-dice"
                    className="w-full"
                  >
                    🎲{' '}
                    {myPlayer?.inJail && isMyTurn
                      ? 'Tenter un double aux dés'
                      : 'Lancer les deux dés'}
                  </Button>
                </div>
              )}

              {/* Phase AWAITING_BUY_DECISION */}
              {gameState.status === 'ACTIVE' && pendingBuySpace && (
                <BuyDecisionPanel
                  space={pendingBuySpace}
                  pack={pack}
                  playerCash={myPlayer?.cash ?? 0}
                  isMyTurn={isMyTurn}
                  activePlayerName={activePlayer.displayName}
                  auctionEnabled={gameState.ruleset.auctionEnabled}
                  busy={busyCommand}
                  onBuy={() => onDispatchAction({ type: 'property:buy' })}
                  onDecline={() => onDispatchAction({ type: 'property:decline' })}
                  onInspectSpace={() => setSelectedSpaceIndex(pendingBuySpace.index)}
                />
              )}

              {/* Phase DEBT_RESOLUTION */}
              {gameState.status === 'ACTIVE' &&
                gameState.phase === 'DEBT_RESOLUTION' &&
                gameState.pendingDebt && (
                  <div
                    data-testid="debt-resolution-panel"
                    className="rounded-xl border border-rose-500/50 bg-rose-950/60 p-3.5 space-y-3 text-xs"
                  >
                    <div className="font-bold text-rose-200">
                      ⚠ Dette exigible : {formatCredits(gameState.pendingDebt.amount)} (
                      {gameState.pendingDebt.reason})
                    </div>
                    {myPlayer && gameState.pendingDebt.debtorId === myPlayer.id ? (
                      <>
                        <p className="text-slate-300">
                          Vendez des constructions, hypothéquez des terrains ou concluez un échange
                          pour réunir {formatCredits(gameState.pendingDebt.amount)}.
                        </p>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => setAssetModalOpen(true)}
                          >
                            Ouvrir le patrimoine
                          </Button>
                          <Button
                            variant="primary"
                            size="sm"
                            loading={busyCommand}
                            disabled={myPlayer.cash < gameState.pendingDebt.amount}
                            disabledReason={`Il manque ${formatCredits(gameState.pendingDebt.amount - myPlayer.cash)}`}
                            onClick={() => onDispatchAction({ type: 'debt:settle' })}
                            data-testid="btn-settle-debt"
                          >
                            Régler la dette ({formatCredits(gameState.pendingDebt.amount)})
                          </Button>
                          <Button
                            variant="danger"
                            size="sm"
                            loading={busyCommand}
                            onClick={() => onDispatchAction({ type: 'player:declare-bankruptcy' })}
                            data-testid="btn-declare-bankruptcy"
                          >
                            Déclarer faillite
                          </Button>
                        </div>
                      </>
                    ) : (
                      <p className="text-slate-300">
                        En attente de la régularisation par {activePlayer.displayName}…
                      </p>
                    )}
                  </div>
                )}

              {/* Phase MANAGE_AND_END */}
              {gameState.status === 'ACTIVE' && gameState.phase === 'MANAGE_AND_END' && (
                <div className="space-y-2">
                  <Button
                    variant="amber"
                    size="lg"
                    loading={busyCommand}
                    disabled={!isMyTurn}
                    disabledReason={`C’est au tour de ${activePlayer.displayName} de conclure`}
                    onClick={() => onDispatchAction({ type: 'turn:end' })}
                    data-testid="btn-end-turn"
                    className="w-full"
                  >
                    {gameState.extraRollGranted && isMyTurn
                      ? '🎲 Rejouer (bonus double !)'
                      : 'Terminer mon tour →'}
                  </Button>
                </div>
              )}

              {/* Abandon volontaire avec confirmation */}
              {myPlayer &&
                myPlayer.bankruptcyStatus !== 'BANKRUPT' &&
                gameState.status !== 'FINISHED' && (
                  <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-xs">
                    {confirmAbandon ? (
                      <div className="flex items-center justify-between w-full gap-2">
                        <span className="text-rose-300 font-semibold">Abandonner la partie ?</span>
                        <div className="flex gap-1.5">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setConfirmAbandon(false)}
                          >
                            Non
                          </Button>
                          <Button
                            variant="danger"
                            size="sm"
                            loading={busyCommand}
                            onClick={() => {
                              setConfirmAbandon(false);
                              onDispatchAction({ type: 'player:declare-bankruptcy' });
                            }}
                          >
                            Confirmer l’abandon
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmAbandon(true)}
                        className="text-[11px] text-slate-500 hover:text-rose-400 cursor-pointer"
                      >
                        Abandonner la partie…
                      </button>
                    )}
                  </div>
                )}
            </section>

            {/* Fiche de propriété inspectée */}
            <PropertyDeedCard
              space={inspectedSpace}
              groupTheme={
                inspectedSpace.groupCode ? pack.theme.groups[inspectedSpace.groupCode] : null
              }
              asset={inspectedAsset}
              ownerName={inspectedOwner?.displayName ?? null}
              mortgageInterestRate={gameState.ruleset.mortgageInterestRate}
            />
          </div>

          {/* Liste des joueurs */}
          <section
            data-testid="players-panel"
            className={`${
              mobileTab === 'PLAYERS' ? 'block' : 'hidden lg:block'
            } rounded-2xl border border-slate-800 bg-slate-900/85 p-3.5 space-y-2.5`}
          >
            <div className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Investisseurs ({gameState.players.length})
            </div>
            <div className="space-y-2">
              {gameState.players.map((p) => {
                const isTurn =
                  p.id === gameState.currentPlayerId && gameState.status !== 'FINISHED';
                const ownedCount = Object.values(gameState.assets).filter(
                  (a) => a.ownerPlayerId === p.id,
                ).length;

                return (
                  <div
                    key={p.id}
                    data-testid={`player-card-${p.displayName}`}
                    className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-xs ${
                      p.bankruptcyStatus === 'BANKRUPT'
                        ? 'border-slate-800/50 bg-slate-950/35 opacity-50'
                        : isTurn
                          ? 'border-teal-400/70 bg-teal-500/10'
                          : 'border-slate-800 bg-slate-950/75'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <PlayerTokenAvatar tokenId={p.tokenId} size={28} active={isTurn} />
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-white truncate">{p.displayName}</span>
                          {p.userId === currentUserId && (
                            <span className="text-[10px] text-teal-300">(vous)</span>
                          )}
                          <span
                            title={p.isConnected ? 'En ligne' : 'Déconnecté'}
                            className={`h-2 w-2 rounded-full ${
                              p.isConnected ? 'bg-emerald-400' : 'bg-rose-400'
                            }`}
                          />
                        </div>
                        <div className="text-[11px] text-slate-400">
                          Case #{p.position} • {ownedCount} actif(s)
                          {p.inJail ? ' • ⛓ détention' : ''}
                          {p.heldCards.length > 0 ? ` • 🎫×${p.heldCards.length}` : ''}
                        </div>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      {p.bankruptcyStatus === 'BANKRUPT' ? (
                        <Badge tone="rose">Faillite</Badge>
                      ) : (
                        <MoneyDisplay amount={p.cash} size="sm" />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Journal des événements & Chat */}
          <div className={mobileTab === 'LOG' ? 'block' : 'hidden lg:block'}>
            <ActivityLogPanel
              entries={gameState.activityLog}
              chatMessages={chatMessages}
              onSendChat={onSendChat}
            />
          </div>
        </div>
      </div>

      {/* Barre d'action fixe accessible au pouce sur Mobile */}
      {myPlayer && gameState.status === 'ACTIVE' && (
        <div className="fixed bottom-0 inset-x-0 z-30 lg:hidden border-t border-slate-800 bg-slate-950/95 backdrop-blur px-3 py-2.5 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="text-[10px] text-slate-400 truncate">
              {isMyTurn ? 'Votre tour' : `Tour de ${activePlayer.displayName}`}
            </div>
            <MoneyDisplay amount={myPlayer.cash} size="sm" />
          </div>
          <div className="flex items-center gap-2">
            {isMyTurn && gameState.phase === 'ROLL_DICE' && (
              <Button
                variant="primary"
                size="sm"
                loading={busyCommand}
                onClick={() => onDispatchAction({ type: 'turn:roll' })}
              >
                🎲 Lancer
              </Button>
            )}
            {isMyTurn && gameState.phase === 'MANAGE_AND_END' && (
              <Button
                variant="amber"
                size="sm"
                loading={busyCommand}
                onClick={() => onDispatchAction({ type: 'turn:end' })}
              >
                Finir tour
              </Button>
            )}
            <Button variant="secondary" size="sm" onClick={() => setAssetModalOpen(true)}>
              Patrimoine
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setTradeModalOpen(true)}>
              Échanges
            </Button>
          </div>
        </div>
      )}

      {/* Modales contextuelles */}
      <AuctionModal
        auction={gameState.phase === 'AUCTION' ? gameState.auction : null}
        pack={pack}
        players={gameState.players}
        myPlayer={myPlayer}
        busy={busyCommand}
        onBid={(amount) => onDispatchAction({ type: 'auction:bid', amount })}
        onPass={() => onDispatchAction({ type: 'auction:pass' })}
      />

      {myPlayer && (
        <>
          <AssetManagerModal
            open={assetModalOpen}
            onClose={() => setAssetModalOpen(false)}
            gameState={gameState}
            pack={pack}
            myPlayer={myPlayer}
            busy={busyCommand}
            onBuild={(spaceIndex) => onDispatchAction({ type: 'asset:build', spaceIndex })}
            onSellBuilding={(spaceIndex) => onDispatchAction({ type: 'asset:sell', spaceIndex })}
            onMortgage={(spaceIndex) => onDispatchAction({ type: 'asset:mortgage', spaceIndex })}
            onRedeem={(spaceIndex) => onDispatchAction({ type: 'asset:redeem', spaceIndex })}
          />

          <TradeModal
            open={tradeModalOpen}
            onClose={() => setTradeModalOpen(false)}
            gameState={gameState}
            pack={pack}
            myPlayer={myPlayer}
            busy={busyCommand}
            onPropose={(input) => onDispatchAction({ type: 'trade:propose', ...input })}
            onAccept={(tradeId) => onDispatchAction({ type: 'trade:accept', tradeId })}
            onReject={(tradeId) => onDispatchAction({ type: 'trade:reject', tradeId })}
            onCancel={(tradeId) => onDispatchAction({ type: 'trade:cancel', tradeId })}
          />
        </>
      )}

      <CardRevealModal
        revealed={visibleRevealedCard}
        pack={pack}
        players={gameState.players}
        onDismiss={() => {
          if (visibleRevealedCard) {
            setDismissedCardTimestamp(visibleRevealedCard.timestamp);
          }
        }}
      />

      <GameOverModal
        gameState={gameState}
        isHost={isHost}
        busy={busyCommand}
        onRematch={onRematch}
        onReturnHome={onReturnHome}
      />
    </div>
  );
}
