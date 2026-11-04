'use client';

import React, { useEffect, useMemo, useState } from 'react';
import type {
  BoardPackDefinition,
  PlayerState,
  PublicGameState,
  TradeOfferState,
} from '@capital-city/shared';
import { Badge, Button, Modal, formatCredits } from '@capital-city/ui';

export interface ProposeTradeInput {
  targetPlayerId: string;
  offeredSpaceIndices: number[];
  requestedSpaceIndices: number[];
  offeredCash: number;
  requestedCash: number;
  offeredJailCards: number;
  requestedJailCards: number;
  note?: string;
}

export function TradeModal({
  open,
  onClose,
  gameState,
  pack,
  myPlayer,
  busy,
  onPropose,
  onAccept,
  onReject,
  onCancel,
}: {
  open: boolean;
  onClose: () => void;
  gameState: PublicGameState;
  pack: BoardPackDefinition;
  myPlayer: PlayerState;
  busy: boolean;
  onPropose: (input: ProposeTradeInput) => void;
  onAccept: (tradeId: string) => void;
  onReject: (tradeId: string) => void;
  onCancel: (tradeId: string) => void;
}) {
  const solventPartners = useMemo(
    () =>
      gameState.players.filter((p) => p.id !== myPlayer.id && p.bankruptcyStatus !== 'BANKRUPT'),
    [gameState.players, myPlayer.id],
  );

  const pendingTrades = useMemo(
    () =>
      gameState.trades.filter(
        (t) =>
          t.status === 'PENDING' && (t.proposerId === myPlayer.id || t.targetId === myPlayer.id),
      ),
    [gameState.trades, myPlayer.id],
  );

  const [tab, setTab] = useState<'COMPOSE' | 'INBOX'>(
    pendingTrades.length > 0 ? 'INBOX' : 'COMPOSE',
  );
  const [targetId, setTargetId] = useState<string>(solventPartners[0]?.id ?? '');
  const [offeredSpaces, setOfferedSpaces] = useState<number[]>([]);
  const [requestedSpaces, setRequestedSpaces] = useState<number[]>([]);
  const [offeredCash, setOfferedCash] = useState(0);
  const [requestedCash, setRequestedCash] = useState(0);
  const [offeredJailCards, setOfferedJailCards] = useState(0);
  const [requestedJailCards, setRequestedJailCards] = useState(0);
  const [note, setNote] = useState('');
  const [previewMode, setPreviewMode] = useState(false);
  const [confirmAcceptId, setConfirmAcceptId] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setTab(pendingTrades.length > 0 ? 'INBOX' : 'COMPOSE');
    }
  }, [open, pendingTrades.length]);

  if (!open) return null;

  const effectiveTargetId = solventPartners.some((p) => p.id === targetId)
    ? targetId
    : (solventPartners[0]?.id ?? '');
  const partner = solventPartners.find((p) => p.id === effectiveTargetId) ?? null;

  const isSpaceTradeable = (spaceIndex: number, ownerId: string) => {
    const asset = gameState.assets[spaceIndex];
    if (!asset || asset.ownerPlayerId !== ownerId) return false;
    if (asset.houseCount > 0 || asset.hotelCount > 0) return false;
    const sp = pack.spaces[spaceIndex];
    if (sp?.groupCode) {
      const groupHasBuilding = pack.spaces
        .filter((s) => s.groupCode === sp.groupCode)
        .some((s) => {
          const a = gameState.assets[s.index];
          return a ? a.houseCount > 0 || a.hotelCount > 0 : false;
        });
      if (groupHasBuilding) return false;
    }
    return true;
  };

  const myTradeableSpaces = pack.spaces.filter((s) => isSpaceTradeable(s.index, myPlayer.id));
  const partnerTradeableSpaces = partner
    ? pack.spaces.filter((s) => isSpaceTradeable(s.index, partner.id))
    : [];

  const toggleIndex = (list: number[], setList: (next: number[]) => void, idx: number) => {
    if (list.includes(idx)) {
      setList(list.filter((i) => i !== idx));
    } else {
      setList([...list, idx]);
    }
  };

  const hasAnyItem =
    offeredSpaces.length > 0 ||
    requestedSpaces.length > 0 ||
    offeredCash > 0 ||
    requestedCash > 0 ||
    offeredJailCards > 0 ||
    requestedJailCards > 0;

  const handleCounterOffer = (t: TradeOfferState) => {
    const otherId = t.proposerId === myPlayer.id ? t.targetId : t.proposerId;
    setTargetId(otherId);
    setOfferedSpaces(t.requestedSpaceIndices);
    setRequestedSpaces(t.offeredSpaceIndices);
    setOfferedCash(t.requestedCash);
    setRequestedCash(t.offeredCash);
    setOfferedJailCards(t.requestedJailCards);
    setRequestedJailCards(t.offeredJailCards);
    setNote('Contre-proposition');
    setPreviewMode(false);
    setTab('COMPOSE');
    onReject(t.id);
  };

  const resetComposer = () => {
    setOfferedSpaces([]);
    setRequestedSpaces([]);
    setOfferedCash(0);
    setRequestedCash(0);
    setOfferedJailCards(0);
    setRequestedJailCards(0);
    setNote('');
    setPreviewMode(false);
  };

  return (
    <Modal
      open={open}
      onClose={() => {
        setPreviewMode(false);
        setConfirmAcceptId(null);
        onClose();
      }}
      title="Chambre de compensation — échanges entre joueurs"
      subtitle="Négociez terrains sans constructions, crédits et laissez-passer de détention."
      maxWidthClass="max-w-3xl"
    >
      <div className="space-y-4" data-testid="trade-modal">
        {/* Onglets */}
        <div className="flex gap-2 border-b border-slate-800 pb-2.5">
          <button
            type="button"
            onClick={() => setTab('COMPOSE')}
            data-testid="trade-tab-compose"
            className={`rounded-xl px-3.5 py-1.5 text-xs font-bold cursor-pointer ${
              tab === 'COMPOSE'
                ? 'bg-teal-500 text-slate-950'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            Nouvelle proposition
          </button>
          <button
            type="button"
            onClick={() => setTab('INBOX')}
            data-testid="trade-tab-inbox"
            className={`rounded-xl px-3.5 py-1.5 text-xs font-bold cursor-pointer ${
              tab === 'INBOX'
                ? 'bg-amber-500 text-slate-950'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            Offres actives ({pendingTrades.length})
          </button>
        </div>

        {tab === 'INBOX' ? (
          <div className="space-y-3">
            {pendingTrades.length === 0 ? (
              <div className="rounded-2xl border border-slate-800 bg-slate-950/80 p-6 text-center text-sm text-slate-400">
                Aucune offre d’échange en attente.
              </div>
            ) : (
              pendingTrades.map((t) => {
                const proposer = gameState.players.find((p) => p.id === t.proposerId);
                const target = gameState.players.find((p) => p.id === t.targetId);
                const incoming = t.targetId === myPlayer.id;

                return (
                  <div
                    key={t.id}
                    data-testid={`trade-offer-card-${t.id}`}
                    className="rounded-2xl border border-slate-700 bg-slate-950 p-4 space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-bold text-white">
                        {proposer?.displayName} → {target?.displayName}
                      </div>
                      <Badge tone={incoming ? 'amber' : 'teal'}>
                        {incoming ? 'Reçue (à valider)' : 'Envoyée'}
                      </Badge>
                    </div>

                    {t.note ? <p className="text-xs italic text-slate-400">« {t.note} »</p> : null}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                      <div className="rounded-xl bg-slate-900 p-3 border border-slate-800 space-y-1">
                        <div className="font-semibold text-teal-300">
                          {proposer?.displayName} cède :
                        </div>
                        {t.offeredCash > 0 && (
                          <div className="tabular-nums">• {formatCredits(t.offeredCash)}</div>
                        )}
                        {t.offeredJailCards > 0 && (
                          <div>• {t.offeredJailCards} carte(s) de sortie de prison</div>
                        )}
                        {t.offeredSpaceIndices.map((idx) => (
                          <div key={idx}>• {pack.spaces[idx]?.name}</div>
                        ))}
                        {t.offeredCash === 0 &&
                          t.offeredJailCards === 0 &&
                          t.offeredSpaceIndices.length === 0 && (
                            <div className="text-slate-500">Aucun élément</div>
                          )}
                      </div>

                      <div className="rounded-xl bg-slate-900 p-3 border border-slate-800 space-y-1">
                        <div className="font-semibold text-amber-300">
                          {target?.displayName} cède :
                        </div>
                        {t.requestedCash > 0 && (
                          <div className="tabular-nums">• {formatCredits(t.requestedCash)}</div>
                        )}
                        {t.requestedJailCards > 0 && (
                          <div>• {t.requestedJailCards} carte(s) de sortie de prison</div>
                        )}
                        {t.requestedSpaceIndices.map((idx) => (
                          <div key={idx}>• {pack.spaces[idx]?.name}</div>
                        ))}
                        {t.requestedCash === 0 &&
                          t.requestedJailCards === 0 &&
                          t.requestedSpaceIndices.length === 0 && (
                            <div className="text-slate-500">Aucun élément</div>
                          )}
                      </div>
                    </div>

                    {incoming ? (
                      confirmAcceptId === t.id ? (
                        <div className="flex items-center justify-between gap-2 rounded-xl border border-emerald-500/40 bg-emerald-950/40 p-3 text-xs">
                          <span className="font-semibold text-emerald-200">
                            Confirmer le transfert simultané immédiat ?
                          </span>
                          <div className="flex gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setConfirmAcceptId(null)}
                            >
                              Retour
                            </Button>
                            <Button
                              variant="primary"
                              size="sm"
                              loading={busy}
                              data-testid={`btn-confirm-accept-trade-${t.id}`}
                              onClick={() => {
                                setConfirmAcceptId(null);
                                onAccept(t.id);
                              }}
                            >
                              Signer l’accord
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-wrap justify-end gap-2 pt-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            loading={busy}
                            onClick={() => onReject(t.id)}
                            data-testid={`btn-reject-trade-${t.id}`}
                          >
                            Refuser
                          </Button>
                          <Button
                            variant="secondary"
                            size="sm"
                            loading={busy}
                            onClick={() => handleCounterOffer(t)}
                          >
                            Contre-proposer
                          </Button>
                          <Button
                            variant="primary"
                            size="sm"
                            loading={busy}
                            onClick={() => setConfirmAcceptId(t.id)}
                            data-testid={`btn-accept-trade-${t.id}`}
                          >
                            Accepter…
                          </Button>
                        </div>
                      )
                    ) : (
                      <div className="flex justify-end">
                        <Button
                          variant="danger"
                          size="sm"
                          loading={busy}
                          onClick={() => onCancel(t.id)}
                          data-testid={`btn-cancel-trade-${t.id}`}
                        >
                          Annuler mon offre
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        ) : !partner ? (
          <div className="text-sm text-slate-400">Aucun partenaire solvable disponible.</div>
        ) : previewMode ? (
          /* Étape obligatoire d'aperçu avant envoi */
          <div
            className="space-y-4 rounded-2xl border border-teal-500/40 bg-slate-950 p-4"
            data-testid="trade-preview-step"
          >
            <Badge tone="teal">Aperçu avant envoi</Badge>
            <h3 className="text-base font-bold text-white">
              Vérifiez les termes de votre proposition à {partner.displayName}
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="rounded-xl bg-slate-900 p-3 border border-slate-800 space-y-1">
                <div className="font-bold text-teal-300">Vous cédez :</div>
                {offeredCash > 0 && <div>• {formatCredits(offeredCash)}</div>}
                {offeredJailCards > 0 && (
                  <div>• {offeredJailCards} carte(s) de sortie de prison</div>
                )}
                {offeredSpaces.map((idx) => (
                  <div key={idx}>• {pack.spaces[idx]?.name}</div>
                ))}
                {offeredCash === 0 && offeredJailCards === 0 && offeredSpaces.length === 0 && (
                  <div className="text-slate-500">Rien</div>
                )}
              </div>

              <div className="rounded-xl bg-slate-900 p-3 border border-slate-800 space-y-1">
                <div className="font-bold text-amber-300">
                  Vous demandez à {partner.displayName} :
                </div>
                {requestedCash > 0 && <div>• {formatCredits(requestedCash)}</div>}
                {requestedJailCards > 0 && (
                  <div>• {requestedJailCards} carte(s) de sortie de prison</div>
                )}
                {requestedSpaces.map((idx) => (
                  <div key={idx}>• {pack.spaces[idx]?.name}</div>
                ))}
                {requestedCash === 0 &&
                  requestedJailCards === 0 &&
                  requestedSpaces.length === 0 && <div className="text-slate-500">Rien</div>}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" size="md" onClick={() => setPreviewMode(false)}>
                Modifier
              </Button>
              <Button
                variant="primary"
                size="md"
                loading={busy}
                data-testid="btn-send-trade"
                onClick={() => {
                  onPropose({
                    targetPlayerId: partner.id,
                    offeredSpaceIndices: offeredSpaces,
                    requestedSpaceIndices: requestedSpaces,
                    offeredCash,
                    requestedCash,
                    offeredJailCards,
                    requestedJailCards,
                    ...(note.trim() ? { note: note.trim() } : {}),
                  });
                  resetComposer();
                  setTab('INBOX');
                }}
              >
                Envoyer la proposition
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-xs font-semibold text-slate-300">Destinataire :</span>
              {solventPartners.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    setTargetId(p.id);
                    setRequestedSpaces([]);
                    setRequestedCash(0);
                    setRequestedJailCards(0);
                  }}
                  data-testid={`trade-partner-${p.displayName}`}
                  className={`rounded-xl border px-3 py-1.5 text-xs font-bold cursor-pointer ${
                    p.id === partner.id
                      ? 'border-amber-400 bg-amber-500/15 text-amber-300'
                      : 'border-slate-800 bg-slate-950 text-slate-300'
                  }`}
                >
                  {p.displayName} ({formatCredits(p.cash)})
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Côté Proposant */}
              <div className="rounded-2xl border border-slate-800 bg-slate-950/85 p-3.5 space-y-3">
                <div className="text-xs font-bold uppercase tracking-wider text-teal-300">
                  Votre offre ({formatCredits(myPlayer.cash)} max)
                </div>

                <label className="block space-y-1 text-xs">
                  <span className="text-slate-400">Crédits offerts</span>
                  <input
                    type="number"
                    min={0}
                    max={myPlayer.cash}
                    value={offeredCash}
                    onChange={(e) =>
                      setOfferedCash(
                        Math.max(
                          0,
                          Math.min(myPlayer.cash, Math.trunc(Number(e.target.value) || 0)),
                        ),
                      )
                    }
                    data-testid="trade-offered-cash"
                    className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs tabular-nums text-white"
                  />
                </label>

                {myPlayer.heldCards.length > 0 && (
                  <label className="block space-y-1 text-xs">
                    <span className="text-slate-400">
                      Cartes de sortie de prison ({myPlayer.heldCards.length} dispo)
                    </span>
                    <input
                      type="number"
                      min={0}
                      max={myPlayer.heldCards.length}
                      value={offeredJailCards}
                      onChange={(e) =>
                        setOfferedJailCards(
                          Math.max(
                            0,
                            Math.min(
                              myPlayer.heldCards.length,
                              Math.trunc(Number(e.target.value) || 0),
                            ),
                          ),
                        )
                      }
                      className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs tabular-nums text-white"
                    />
                  </label>
                )}

                <div className="space-y-1 max-h-40 overflow-y-auto text-xs">
                  <div className="text-slate-400">Vos propriétés cessibles :</div>
                  {myTradeableSpaces.length === 0 ? (
                    <div className="text-slate-500">Aucune propriété sans construction</div>
                  ) : (
                    myTradeableSpaces.map((sp) => (
                      <label
                        key={sp.id}
                        className="flex items-center gap-2 rounded-lg bg-slate-900/80 px-2.5 py-1.5 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={offeredSpaces.includes(sp.index)}
                          onChange={() => toggleIndex(offeredSpaces, setOfferedSpaces, sp.index)}
                          data-testid={`trade-offer-space-${sp.index}`}
                          className="accent-teal-400"
                        />
                        <span className="truncate">{sp.name}</span>
                      </label>
                    ))
                  )}
                </div>
              </div>

              {/* Côté Partenaire */}
              <div className="rounded-2xl border border-slate-800 bg-slate-950/85 p-3.5 space-y-3">
                <div className="text-xs font-bold uppercase tracking-wider text-amber-300">
                  Demandé à {partner.displayName} ({formatCredits(partner.cash)} max)
                </div>

                <label className="block space-y-1 text-xs">
                  <span className="text-slate-400">Crédits demandés</span>
                  <input
                    type="number"
                    min={0}
                    max={partner.cash}
                    value={requestedCash}
                    onChange={(e) =>
                      setRequestedCash(
                        Math.max(
                          0,
                          Math.min(partner.cash, Math.trunc(Number(e.target.value) || 0)),
                        ),
                      )
                    }
                    data-testid="trade-requested-cash"
                    className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs tabular-nums text-white"
                  />
                </label>

                {partner.heldCards.length > 0 && (
                  <label className="block space-y-1 text-xs">
                    <span className="text-slate-400">
                      Cartes de sortie de prison ({partner.heldCards.length} dispo)
                    </span>
                    <input
                      type="number"
                      min={0}
                      max={partner.heldCards.length}
                      value={requestedJailCards}
                      onChange={(e) =>
                        setRequestedJailCards(
                          Math.max(
                            0,
                            Math.min(
                              partner.heldCards.length,
                              Math.trunc(Number(e.target.value) || 0),
                            ),
                          ),
                        )
                      }
                      className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs tabular-nums text-white"
                    />
                  </label>
                )}

                <div className="space-y-1 max-h-40 overflow-y-auto text-xs">
                  <div className="text-slate-400">
                    Propriétés cessibles de {partner.displayName} :
                  </div>
                  {partnerTradeableSpaces.length === 0 ? (
                    <div className="text-slate-500">Aucune propriété sans construction</div>
                  ) : (
                    partnerTradeableSpaces.map((sp) => (
                      <label
                        key={sp.id}
                        className="flex items-center gap-2 rounded-lg bg-slate-900/80 px-2.5 py-1.5 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={requestedSpaces.includes(sp.index)}
                          onChange={() =>
                            toggleIndex(requestedSpaces, setRequestedSpaces, sp.index)
                          }
                          data-testid={`trade-request-space-${sp.index}`}
                          className="accent-amber-400"
                        />
                        <span className="truncate">{sp.name}</span>
                      </label>
                    ))
                  )}
                </div>
              </div>
            </div>

            <input
              type="text"
              maxLength={140}
              placeholder="Note facultative (ex. « Pour compléter ton quartier turquoise ! »)"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white"
            />

            <div className="flex justify-end">
              <Button
                variant="primary"
                size="md"
                disabled={!hasAnyItem}
                disabledReason="Sélectionnez au moins une propriété, une somme ou une carte."
                onClick={() => setPreviewMode(true)}
                data-testid="btn-preview-trade"
              >
                Prévisualiser l’offre →
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
