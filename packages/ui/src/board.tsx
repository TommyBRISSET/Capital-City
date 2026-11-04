'use client';

import React from 'react';
import {
  PLAYER_TOKENS,
  type AssetState,
  type BoardPackDefinition,
  type BoardSpaceDefinition,
  type PlayerState,
} from '@capital-city/shared';
import { BoardCenterArtwork, PlayerTokenAvatar } from './artwork';
import { formatCredits } from './tokens';

export function getGridCoordinatesForSpace(index: number): { gridRow: number; gridColumn: number } {
  if (index === 0) return { gridRow: 11, gridColumn: 11 };
  if (index >= 1 && index <= 9) return { gridRow: 11, gridColumn: 11 - index };
  if (index === 10) return { gridRow: 11, gridColumn: 1 };
  if (index >= 11 && index <= 19) return { gridRow: 11 - (index - 10), gridColumn: 1 };
  if (index === 20) return { gridRow: 1, gridColumn: 1 };
  if (index >= 21 && index <= 29) return { gridRow: 1, gridColumn: 1 + (index - 20) };
  if (index === 30) return { gridRow: 1, gridColumn: 11 };
  return { gridRow: 1 + (index - 30), gridColumn: 11 };
}

function getSpaceGlyph(space: BoardSpaceDefinition): string {
  switch (space.type) {
    case 'START':
      return '➔';
    case 'TRANSPORT':
      return '🚝';
    case 'UTILITY':
      return '⚡';
    case 'EVENT':
      return '✦';
    case 'COMMUNITY':
      return '🏛';
    case 'TAX':
      return '◈';
    case 'JAIL':
      return '⛓';
    case 'PARKING':
      return '◎';
    case 'GO_TO_JAIL':
      return '⚠';
    default:
      return '';
  }
}

export interface BoardCellProps {
  space: BoardSpaceDefinition;
  pack: BoardPackDefinition;
  asset?: AssetState;
  ownerColor?: string | null;
  playersOnSpace: PlayerState[];
  selected?: boolean;
  highlighted?: boolean;
  onSelect: (spaceIndex: number) => void;
}

export function BoardCell({
  space,
  pack,
  asset,
  ownerColor,
  playersOnSpace,
  selected = false,
  highlighted = false,
  onSelect,
}: BoardCellProps) {
  const { gridRow, gridColumn } = getGridCoordinatesForSpace(space.index);
  const groupTheme = space.groupCode ? pack.theme.groups[space.groupCode] : null;
  const isCorner = space.index % 10 === 0;
  const glyph = getSpaceGlyph(space);

  return (
    <button
      type="button"
      onClick={() => onSelect(space.index)}
      style={{
        gridRow,
        gridColumn,
        backgroundColor: pack.theme.cellBg,
        borderColor: selected
          ? pack.theme.accentPrimary
          : highlighted
            ? pack.theme.accentSecondary
            : pack.theme.cellBorder,
      }}
      aria-label={`Case ${space.index} : ${space.name}${space.price > 0 ? `, ${space.price} crédits` : ''}`}
      data-testid={`board-cell-${space.index}`}
      className={`relative min-w-0 min-h-0 flex flex-col justify-between rounded-[6px] border p-0.5 sm:p-1 text-left transition-all hover:z-10 hover:brightness-125 focus-visible:z-20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 overflow-hidden cursor-pointer ${
        selected ? 'ring-2 ring-teal-400 z-10' : ''
      } ${isCorner ? 'bg-slate-900/95' : ''}`}
    >
      {/* Bande de couleur du groupe + bâtiments */}
      {groupTheme ? (
        <div
          style={{ backgroundColor: groupTheme.bg }}
          className="w-full h-2 sm:h-2.5 rounded-[3px] flex items-center justify-center gap-0.5 px-0.5 shrink-0"
        >
          {asset && asset.hotelCount > 0 ? (
            <span
              title="1 Hôtel"
              className="h-1.5 w-2.5 sm:h-2 sm:w-3 rounded-[2px] bg-amber-300 border border-slate-950 shadow-sm"
            />
          ) : asset && asset.houseCount > 0 ? (
            Array.from({ length: asset.houseCount }).map((_, idx) => (
              <span
                key={idx}
                title={`${asset.houseCount} maison(s)`}
                className="h-1.5 w-1.5 rounded-[1px] bg-emerald-300 border border-slate-950"
              />
            ))
          ) : null}
        </div>
      ) : (
        <div className="flex items-center justify-between w-full text-[9px] sm:text-[11px] text-teal-300/90 leading-none">
          <span>{glyph}</span>
          <span className="text-[8px] text-slate-500">#{space.index}</span>
        </div>
      )}

      {/* Libellé compact */}
      <div className="my-auto px-0.5 leading-[1.05]">
        <div className="text-[8px] sm:text-[10px] font-semibold text-slate-100 truncate">
          {space.shortName}
        </div>
        {space.price > 0 ? (
          <div className="tabular-nums text-[7px] sm:text-[9px] font-medium text-amber-300/95">
            {space.price}
          </div>
        ) : space.taxAmount > 0 ? (
          <div className="tabular-nums text-[7px] sm:text-[9px] font-medium text-rose-300">
            -{space.taxAmount}
          </div>
        ) : null}
      </div>

      {/* Statut propriétaire / hypothèque */}
      <div className="flex items-center justify-between gap-0.5 min-h-[10px]">
        {ownerColor ? (
          <span
            style={{ backgroundColor: ownerColor }}
            title={asset?.isMortgaged ? 'Propriété hypothéquée' : 'Propriété détenue'}
            className={`h-1.5 flex-1 rounded-full ${asset?.isMortgaged ? 'opacity-40 border border-dashed border-rose-400' : ''}`}
          />
        ) : (
          <span className="h-1 flex-1" />
        )}
        {asset?.isMortgaged ? (
          <span className="text-[7px] font-bold px-0.5 rounded bg-rose-900/90 text-rose-200">
            H
          </span>
        ) : null}
      </div>

      {/* Pions présents sur la case */}
      {playersOnSpace.length > 0 && (
        <div className="absolute bottom-0.5 right-0.5 flex flex-wrap justify-end gap-0.5 max-w-full pointer-events-none">
          {playersOnSpace.map((p) => (
            <span
              key={p.id}
              className={p.inJail && space.index === 10 ? 'ring-1 ring-rose-500 rounded-full' : ''}
            >
              <PlayerTokenAvatar
                tokenId={p.tokenId}
                size={16}
                label={`${p.displayName}${p.inJail && space.index === 10 ? ' (En détention)' : ''}`}
              />
            </span>
          ))}
        </div>
      )}
    </button>
  );
}

export interface GameBoardProps {
  pack: BoardPackDefinition;
  players?: PlayerState[];
  assets?: Record<number, AssetState>;
  selectedSpaceIndex: number | null;
  highlightedSpaceIndex?: number | null;
  freeParkingPot?: number;
  centerOverlay?: React.ReactNode;
  onSelectSpace: (spaceIndex: number) => void;
}

export function GameBoard({
  pack,
  players = [],
  assets = {},
  selectedSpaceIndex,
  highlightedSpaceIndex = null,
  freeParkingPot = 0,
  centerOverlay,
  onSelectSpace,
}: GameBoardProps) {
  const activePlayers = players.filter((p) => p.bankruptcyStatus !== 'BANKRUPT');

  const ownerColorByPlayerId = new Map<string, string>();
  for (const p of players) {
    const token = PLAYER_TOKENS.find((t) => t.id === p.tokenId);
    ownerColorByPlayerId.set(p.id, token?.color ?? '#2DD4BF');
  }

  return (
    <div
      style={{ backgroundColor: pack.theme.boardSurface, borderColor: pack.theme.cellBorder }}
      data-testid="game-board"
      className="w-full max-w-[780px] aspect-square mx-auto rounded-2xl border-2 p-1 sm:p-2.5 shadow-2xl select-none overflow-hidden"
    >
      <div className="grid grid-cols-[repeat(11,minmax(0,1fr))] grid-rows-[repeat(11,minmax(0,1fr))] gap-0.5 sm:gap-1 w-full h-full">
        {pack.spaces.map((space) => {
          const asset = assets[space.index];
          const ownerColor = asset?.ownerPlayerId
            ? (ownerColorByPlayerId.get(asset.ownerPlayerId) ?? null)
            : null;
          const playersOnSpace = activePlayers.filter((p) => p.position === space.index);

          return (
            <BoardCell
              key={space.id}
              space={space}
              pack={pack}
              asset={asset}
              ownerColor={ownerColor}
              playersOnSpace={playersOnSpace}
              selected={selectedSpaceIndex === space.index}
              highlighted={highlightedSpaceIndex === space.index}
              onSelect={onSelectSpace}
            />
          );
        })}

        {/* Centre du plateau (9x9) */}
        <div
          style={{
            gridRow: '2 / 11',
            gridColumn: '2 / 11',
            background: pack.theme.boardCenterGradient,
            borderColor: pack.theme.cellBorder,
          }}
          className="rounded-xl border p-3 sm:p-5 flex flex-col items-center justify-between text-center overflow-hidden relative"
        >
          <div className="flex items-center justify-between w-full gap-2 text-[10px] sm:text-xs">
            <span className="px-2.5 py-1 rounded-full bg-slate-950/65 border border-slate-700/70 text-teal-300 font-semibold">
              ✦ {pack.theme.eventDeckName}
            </span>
            {freeParkingPot > 0 ? (
              <span className="px-2.5 py-1 rounded-full bg-amber-500/20 border border-amber-400/40 text-amber-300 tabular-nums font-bold">
                cagnotte : {formatCredits(freeParkingPot)}
              </span>
            ) : null}
            <span className="px-2.5 py-1 rounded-full bg-slate-950/65 border border-slate-700/70 text-amber-300 font-semibold">
              🏛 {pack.theme.communityDeckName}
            </span>
          </div>

          <div className="flex flex-col items-center my-auto px-2">
            <BoardCenterArtwork packId={pack.id} />
            <h2 className="mt-1 text-base sm:text-2xl font-black tracking-tight text-white uppercase">
              {pack.name}
            </h2>
            <p className="text-[10px] sm:text-xs text-slate-300 max-w-md">{pack.subtitle}</p>
          </div>

          {centerOverlay ? (
            <div className="w-full z-10">{centerOverlay}</div>
          ) : (
            <div className="h-2" />
          )}
        </div>
      </div>
    </div>
  );
}
