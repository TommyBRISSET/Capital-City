'use client';

import React, { useState } from 'react';
import { canBuildOnSpace, canSellBuildingOnSpace } from '@capital-city/game-engine';
import type {
  BoardPackDefinition,
  GameState,
  PlayerState,
  PublicGameState,
} from '@capital-city/shared';
import { Badge, Button, Modal, formatCredits } from '@capital-city/ui';

export function AssetManagerModal({
  open,
  onClose,
  gameState,
  pack,
  myPlayer,
  busy,
  onBuild,
  onSellBuilding,
  onMortgage,
  onRedeem,
}: {
  open: boolean;
  onClose: () => void;
  gameState: PublicGameState;
  pack: BoardPackDefinition;
  myPlayer: PlayerState;
  busy: boolean;
  onBuild: (spaceIndex: number) => void;
  onSellBuilding: (spaceIndex: number) => void;
  onMortgage: (spaceIndex: number) => void;
  onRedeem: (spaceIndex: number) => void;
}) {
  const [confirmAction, setConfirmAction] = useState<{
    kind: 'SELL_BUILDING' | 'MORTGAGE';
    spaceIndex: number;
    label: string;
  } | null>(null);

  if (!open) return null;

  const engineCompatState = {
    ...gameState,
    eventDeckOrder: [],
    communityDeckOrder: [],
  } as GameState;

  const mySpaces = pack.spaces.filter(
    (s) => gameState.assets[s.index]?.ownerPlayerId === myPlayer.id,
  );

  const isMyActiveTurn = gameState.currentPlayerId === myPlayer.id;

  return (
    <Modal
      open={open}
      onClose={() => {
        setConfirmAction(null);
        onClose();
      }}
      title="Gestion du patrimoine — constructions et hypothèques"
      subtitle={`Trésorerie : ${formatCredits(myPlayer.cash)} • Banque : ${gameState.bankHousesAvailable} maisons / ${gameState.bankHotelsAvailable} hôtels disponibles`}
      maxWidthClass="max-w-3xl"
    >
      <div className="space-y-4" data-testid="asset-manager-modal">
        {confirmAction ? (
          <div
            role="alertdialog"
            aria-label="Confirmation d'opération patrimoniale"
            className="rounded-2xl border border-amber-500/50 bg-amber-950/50 p-4 space-y-3"
          >
            <div className="text-sm font-bold text-amber-200">
              Confirmer l’opération : {confirmAction.label} ?
            </div>
            <p className="text-xs text-slate-300">
              {confirmAction.kind === 'MORTGAGE'
                ? 'Une propriété hypothéquée ne perçoit plus de loyer tant qu’elle n’est pas remboursée (+10 % d’intérêts).'
                : 'La revente d’une construction à la banque restitue 50 % de son coût d’achat.'}
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setConfirmAction(null)}>
                Annuler
              </Button>
              <Button
                variant="amber"
                size="sm"
                loading={busy}
                data-testid="confirm-asset-action-btn"
                onClick={() => {
                  if (confirmAction.kind === 'MORTGAGE') {
                    onMortgage(confirmAction.spaceIndex);
                  } else {
                    onSellBuilding(confirmAction.spaceIndex);
                  }
                  setConfirmAction(null);
                }}
              >
                Confirmer l’opération
              </Button>
            </div>
          </div>
        ) : null}

        {mySpaces.length === 0 ? (
          <div className="rounded-2xl border border-slate-800 bg-slate-950/80 p-6 text-center text-sm text-slate-400">
            Vous ne détenez encore aucun actif immobilier. Acquérez des terrains sur le plateau ou
            lors d’enchères !
          </div>
        ) : (
          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
            {mySpaces.map((space) => {
              const asset = gameState.assets[space.index]!;
              const groupTheme = space.groupCode ? pack.theme.groups[space.groupCode] : null;
              const buildCheck = canBuildOnSpace(engineCompatState, pack, myPlayer.id, space.index);
              const sellCheck = canSellBuildingOnSpace(
                engineCompatState,
                pack,
                myPlayer.id,
                space.index,
              );

              const redeemCost = Math.ceil(
                space.mortgageValue * (1 + gameState.ruleset.mortgageInterestRate),
              );

              const groupBuilt = space.groupCode
                ? pack.spaces
                    .filter((s) => s.groupCode === space.groupCode)
                    .some((s) => {
                      const a = gameState.assets[s.index];
                      return a ? a.houseCount > 0 || a.hotelCount > 0 : false;
                    })
                : false;

              const canMortgage =
                !asset.isMortgaged &&
                asset.houseCount === 0 &&
                asset.hotelCount === 0 &&
                !groupBuilt &&
                (isMyActiveTurn || gameState.phase === 'DEBT_RESOLUTION');

              const canRedeem = asset.isMortgaged && isMyActiveTurn && myPlayer.cash >= redeemCost;

              return (
                <div
                  key={space.id}
                  data-testid={`owned-asset-row-${space.index}`}
                  className="rounded-2xl border border-slate-800 bg-slate-950/85 p-3.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
                >
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {groupTheme ? (
                        <span
                          style={{ backgroundColor: groupTheme.bg, color: groupTheme.text }}
                          className="rounded px-2 py-0.5 text-[10px] font-bold uppercase"
                        >
                          {groupTheme.name}
                        </span>
                      ) : (
                        <Badge>{space.type === 'TRANSPORT' ? 'Transport' : 'Service'}</Badge>
                      )}
                      <span className="font-bold text-sm text-white">{space.name}</span>
                      {asset.isMortgaged ? <Badge tone="rose">Hypothéquée</Badge> : null}
                      {asset.hotelCount > 0 ? (
                        <Badge tone="amber">1 hôtel</Badge>
                      ) : asset.houseCount > 0 ? (
                        <Badge tone="emerald">{asset.houseCount} maison(s)</Badge>
                      ) : null}
                    </div>
                    <div className="text-[11px] text-slate-400 tabular-nums">
                      {space.type === 'PROPERTY'
                        ? `Coût bâti : ${formatCredits(space.houseCost)} • `
                        : ''}
                      Hypothèque : +{formatCredits(space.mortgageValue)} • Levée :{' '}
                      {formatCredits(redeemCost)}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-start gap-2">
                    {space.type === 'PROPERTY' && (
                      <>
                        <Button
                          variant="primary"
                          size="sm"
                          loading={busy}
                          disabled={!isMyActiveTurn || !buildCheck.allowed}
                          disabledReason={
                            !isMyActiveTurn ? 'Disponible pendant votre tour' : buildCheck.reason
                          }
                          onClick={() => onBuild(space.index)}
                          data-testid={`btn-build-${space.index}`}
                        >
                          {asset.houseCount === 4 ? '+ hôtel' : '+ maison'} (
                          {formatCredits(space.houseCost)})
                        </Button>

                        {(asset.houseCount > 0 || asset.hotelCount > 0) && (
                          <Button
                            variant="secondary"
                            size="sm"
                            loading={busy}
                            disabled={
                              (!isMyActiveTurn && gameState.phase !== 'DEBT_RESOLUTION') ||
                              !sellCheck.allowed
                            }
                            disabledReason={sellCheck.reason}
                            onClick={() =>
                              setConfirmAction({
                                kind: 'SELL_BUILDING',
                                spaceIndex: space.index,
                                label: `Vendre 1 niveau sur ${space.name} (+${formatCredits(Math.floor(space.houseCost * 0.5))})`,
                              })
                            }
                            data-testid={`btn-sell-building-${space.index}`}
                          >
                            Vendre bâti (+{formatCredits(Math.floor(space.houseCost * 0.5))})
                          </Button>
                        )}
                      </>
                    )}

                    {!asset.isMortgaged ? (
                      <Button
                        variant="secondary"
                        size="sm"
                        loading={busy}
                        disabled={!canMortgage}
                        disabledReason={
                          groupBuilt
                            ? 'Vendez d’abord les bâtiments du groupe'
                            : !isMyActiveTurn && gameState.phase !== 'DEBT_RESOLUTION'
                              ? 'Disponible pendant votre tour'
                              : undefined
                        }
                        onClick={() =>
                          setConfirmAction({
                            kind: 'MORTGAGE',
                            spaceIndex: space.index,
                            label: `Hypothéquer ${space.name} (+${formatCredits(space.mortgageValue)})`,
                          })
                        }
                        data-testid={`btn-mortgage-${space.index}`}
                      >
                        Hypothéquer (+{formatCredits(space.mortgageValue)})
                      </Button>
                    ) : (
                      <Button
                        variant="amber"
                        size="sm"
                        loading={busy}
                        disabled={!canRedeem}
                        disabledReason={
                          !isMyActiveTurn
                            ? 'Disponible pendant votre tour'
                            : myPlayer.cash < redeemCost
                              ? 'Solde insuffisant'
                              : undefined
                        }
                        onClick={() => onRedeem(space.index)}
                        data-testid={`btn-redeem-${space.index}`}
                      >
                        Lever ({formatCredits(redeemCost)})
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Modal>
  );
}
