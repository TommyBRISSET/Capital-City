'use client';

import React, { useEffect, useState } from 'react';
import { ALL_BOARD_PACKS, getBoardPack } from '@capital-city/board-packs';
import type { BoardPackId, TokenId } from '@capital-city/shared';
import { Badge, BoardCenterArtwork, MoneyDisplay, PlayerTokenAvatar } from '@capital-city/ui';

/**
 * 16 cases emblématiques extraites du plateau sélectionné (indices 0..39)
 * disposées sur une couronne 5x5 autour de la scène centrale (3x3).
 */
const PERIMETER_RING: Array<{ ringIdx: number; spaceIndex: number; row: number; col: number }> = [
  { ringIdx: 0, spaceIndex: 0, row: 5, col: 5 }, // Départ
  { ringIdx: 1, spaceIndex: 3, row: 5, col: 4 },
  { ringIdx: 2, spaceIndex: 5, row: 5, col: 3 }, // Transport 1
  { ringIdx: 3, spaceIndex: 9, row: 5, col: 2 },
  { ringIdx: 4, spaceIndex: 10, row: 5, col: 1 }, // Prison / Visite
  { ringIdx: 5, spaceIndex: 14, row: 4, col: 1 },
  { ringIdx: 6, spaceIndex: 17, row: 3, col: 1 }, // Communauté
  { ringIdx: 7, spaceIndex: 19, row: 2, col: 1 },
  { ringIdx: 8, spaceIndex: 20, row: 1, col: 1 }, // Pause
  { ringIdx: 9, spaceIndex: 24, row: 1, col: 2 },
  { ringIdx: 10, spaceIndex: 27, row: 1, col: 3 },
  { ringIdx: 11, spaceIndex: 29, row: 1, col: 4 },
  { ringIdx: 12, spaceIndex: 30, row: 1, col: 5 }, // Coin 30
  { ringIdx: 13, spaceIndex: 32, row: 2, col: 5 },
  { ringIdx: 14, spaceIndex: 36, row: 3, col: 5 }, // Événement
  { ringIdx: 15, spaceIndex: 39, row: 4, col: 5 }, // Joyau final (400 Cr)
];

interface DemoKeyframe {
  activeToken: TokenId;
  dice: [number, number];
  positions: Record<'skyline-tower' | 'luxury-yacht' | 'maglev-train', number>;
  cash: Record<'skyline-tower' | 'luxury-yacht' | 'maglev-train', number>;
  buildings: Record<number, 'house2' | 'hotel'>;
  owners: Record<number, TokenId>;
  highlightRingIdx: number;
  headline: (jewelName: string) => string;
  tone: 'teal' | 'amber' | 'emerald';
}

const DEMO_KEYFRAMES: DemoKeyframe[] = [
  {
    activeToken: 'skyline-tower',
    dice: [4, 3],
    positions: { 'skyline-tower': 7, 'luxury-yacht': 3, 'maglev-train': 0 },
    cash: { 'skyline-tower': 1320, 'luxury-yacht': 1500, 'maglev-train': 1500 },
    buildings: { 3: 'house2' },
    owners: { 3: 'luxury-yacht', 7: 'skyline-tower' },
    highlightRingIdx: 7,
    headline: () => '🎲 Tour Zénith lance 7 et acquiert un quartier stratégique !',
    tone: 'teal',
  },
  {
    activeToken: 'luxury-yacht',
    dice: [6, 6],
    positions: { 'skyline-tower': 7, 'luxury-yacht': 15, 'maglev-train': 0 },
    cash: { 'skyline-tower': 1320, 'luxury-yacht': 1100, 'maglev-train': 1500 },
    buildings: { 3: 'house2' },
    owners: { 3: 'luxury-yacht', 7: 'skyline-tower', 15: 'luxury-yacht' },
    highlightRingIdx: 15,
    headline: (jewel) => `★ Double 6 ! Yacht Azur s’offre ${jewel} (400 Cr)`,
    tone: 'amber',
  },
  {
    activeToken: 'maglev-train',
    dice: [5, 4],
    positions: { 'skyline-tower': 7, 'luxury-yacht': 15, 'maglev-train': 9 },
    cash: { 'skyline-tower': 1320, 'luxury-yacht': 1100, 'maglev-train': 1260 },
    buildings: { 3: 'house2', 7: 'house2' },
    owners: {
      3: 'luxury-yacht',
      7: 'skyline-tower',
      9: 'maglev-train',
      15: 'luxury-yacht',
    },
    highlightRingIdx: 9,
    headline: () => '🏗 Constructions équilibrées : +2 maisons érigées !',
    tone: 'emerald',
  },
  {
    activeToken: 'skyline-tower',
    dice: [5, 2],
    positions: { 'skyline-tower': 14, 'luxury-yacht': 15, 'maglev-train': 9 },
    cash: { 'skyline-tower': 1470, 'luxury-yacht': 1100, 'maglev-train': 1260 },
    buildings: { 3: 'house2', 7: 'house2', 15: 'hotel' },
    owners: {
      3: 'luxury-yacht',
      7: 'skyline-tower',
      9: 'maglev-train',
      15: 'luxury-yacht',
    },
    highlightRingIdx: 14,
    headline: () => '✦ Carte événement : dividende métropolitain +150 Cr !',
    tone: 'teal',
  },
  {
    activeToken: 'maglev-train',
    dice: [4, 3],
    positions: { 'skyline-tower': 14, 'luxury-yacht': 15, 'maglev-train': 0 },
    cash: { 'skyline-tower': 1470, 'luxury-yacht': 1100, 'maglev-train': 1460 },
    buildings: { 3: 'house2', 7: 'house2', 15: 'hotel' },
    owners: {
      3: 'luxury-yacht',
      7: 'skyline-tower',
      9: 'maglev-train',
      15: 'luxury-yacht',
    },
    highlightRingIdx: 0,
    headline: () => '➔ Passage sur la case départ : +200 Cr crédités !',
    tone: 'emerald',
  },
  {
    activeToken: 'skyline-tower',
    dice: [1, 1],
    positions: { 'skyline-tower': 15, 'luxury-yacht': 3, 'maglev-train': 0 },
    cash: { 'skyline-tower': 1220, 'luxury-yacht': 1350, 'maglev-train': 1460 },
    buildings: { 3: 'house2', 7: 'house2', 15: 'hotel' },
    owners: {
      3: 'luxury-yacht',
      7: 'skyline-tower',
      9: 'maglev-train',
      15: 'luxury-yacht',
    },
    highlightRingIdx: 15,
    headline: (jewel) => `⇄ Hôtel sur ${jewel} : loyer transféré (+250 Cr) !`,
    tone: 'amber',
  },
];

const DEMO_PLAYERS: Array<{
  tokenId: 'skyline-tower' | 'luxury-yacht' | 'maglev-train';
  name: string;
  color: string;
  offset: { dx: number; dy: number };
}> = [
  { tokenId: 'skyline-tower', name: 'Zénith', color: '#2DD4BF', offset: { dx: 12, dy: 10 } },
  { tokenId: 'luxury-yacht', name: 'Azur', color: '#38BDF8', offset: { dx: 12, dy: -8 } },
  { tokenId: 'maglev-train', name: 'Maglev', color: '#F59E0B', offset: { dx: -8, dy: 12 } },
];

function MiniDieFace({ value }: { value: number }) {
  return (
    <span className="inline-flex h-7 w-7 sm:h-8 sm:w-8 items-center justify-center rounded-lg border border-teal-400/60 bg-slate-950 text-xs sm:text-sm font-black tabular-nums text-amber-300 shadow-md">
      {value}
    </span>
  );
}

export function LiveBoardShowcase({
  packId,
  reducedMotion,
  onSelectPack,
  onReplayIntro,
}: {
  packId: BoardPackId;
  reducedMotion: boolean;
  onSelectPack: (id: BoardPackId) => void;
  onReplayIntro: () => void;
}) {
  const [frameIndex, setFrameIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (reducedMotion || paused) return;
    const interval = window.setInterval(() => {
      setFrameIndex((prev) => (prev + 1) % DEMO_KEYFRAMES.length);
    }, 2400);
    return () => window.clearInterval(interval);
  }, [reducedMotion, paused]);

  const pack = getBoardPack(packId);
  const frame = DEMO_KEYFRAMES[frameIndex]!;
  const jewelSpace = pack.spaces[39]!;

  const getRingCoordsPercent = (ringIdx: number) => {
    const item = PERIMETER_RING[ringIdx] ?? PERIMETER_RING[0]!;
    return {
      left: ((item.col - 0.5) / 5) * 100,
      top: ((item.row - 0.5) / 5) * 100,
    };
  };

  return (
    <div
      data-testid="live-board-showcase"
      className="rounded-2xl border border-slate-800 bg-slate-950/85 p-3.5 sm:p-4 space-y-3 shadow-2xl overflow-hidden"
    >
      {/* En-tête : Sélecteur d'univers en direct + Contrôles d'animation */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className={`h-2 w-2 rounded-full ${
              reducedMotion || paused ? 'bg-amber-400' : 'bg-emerald-400 animate-pulse'
            }`}
          />
          <span className="text-[11px] font-bold uppercase tracking-wider text-teal-300">
            Aperçu de partie animé
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => {
              if (reducedMotion) {
                setFrameIndex((prev) => (prev + 1) % DEMO_KEYFRAMES.length);
              } else {
                setPaused((p) => !p);
              }
            }}
            data-testid="btn-step-or-pause-showcase"
            className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-[11px] font-semibold text-slate-200 hover:border-teal-400 hover:text-white cursor-pointer"
          >
            {reducedMotion ? 'Étape suivante →' : paused ? '▶ Lecture' : '⏸ Pause'}
          </button>
          <button
            type="button"
            onClick={onReplayIntro}
            data-testid="btn-replay-intro"
            className="rounded-lg border border-teal-500/40 bg-teal-500/10 px-2 py-1 text-[11px] font-semibold text-teal-300 hover:bg-teal-500/20 cursor-pointer"
          >
            ✨ Intro
          </button>
        </div>
      </div>

      {/* Commutateur rapide des 3 plateaux */}
      <div className="grid grid-cols-3 gap-1.5">
        {ALL_BOARD_PACKS.map((candidate) => {
          const selected = candidate.id === packId;
          return (
            <button
              key={candidate.id}
              type="button"
              onClick={() => onSelectPack(candidate.id)}
              className={`rounded-lg border px-2 py-1 text-[11px] font-bold truncate transition cursor-pointer ${
                selected
                  ? 'border-teal-400 bg-teal-500/15 text-teal-200'
                  : 'border-slate-800 bg-slate-900/80 text-slate-400 hover:text-slate-200'
              }`}
            >
              {candidate.name}
            </button>
          );
        })}
      </div>

      {/* Mini-plateau 5x5 animé avec pions glissants */}
      <div
        style={{ backgroundColor: pack.theme.boardSurface, borderColor: pack.theme.cellBorder }}
        className="relative w-full aspect-square rounded-2xl border p-1.5 shadow-inner select-none overflow-hidden"
      >
        <div className="grid grid-cols-[repeat(5,minmax(0,1fr))] grid-rows-[repeat(5,minmax(0,1fr))] gap-1 w-full h-full">
          {PERIMETER_RING.map((slot) => {
            const space = pack.spaces[slot.spaceIndex]!;
            const groupTheme = space.groupCode ? pack.theme.groups[space.groupCode] : null;
            const building = frame.buildings[slot.ringIdx];
            const ownerToken = frame.owners[slot.ringIdx];
            const ownerMeta = DEMO_PLAYERS.find((d) => d.tokenId === ownerToken);
            const isHighlighted = frame.highlightRingIdx === slot.ringIdx;

            return (
              <div
                key={slot.ringIdx}
                style={{
                  gridRow: slot.row,
                  gridColumn: slot.col,
                  backgroundColor: pack.theme.cellBg,
                  borderColor: isHighlighted ? pack.theme.accentPrimary : pack.theme.cellBorder,
                }}
                className={`min-w-0 min-h-0 rounded-lg border p-1 flex flex-col justify-between transition-all ${
                  isHighlighted ? 'ring-2 ring-teal-400/90 brightness-125 z-10' : ''
                }`}
              >
                {groupTheme ? (
                  <div
                    style={{ backgroundColor: groupTheme.bg }}
                    className="h-2 w-full rounded-[3px] flex items-center justify-center gap-0.5 px-0.5 shrink-0"
                  >
                    {building === 'hotel' ? (
                      <span
                        title="Hôtel"
                        className="h-1.5 w-3 rounded-[2px] bg-amber-300 border border-slate-950"
                      />
                    ) : building === 'house2' ? (
                      <>
                        <span className="h-1.5 w-1.5 rounded-[1px] bg-emerald-300 border border-slate-950" />
                        <span className="h-1.5 w-1.5 rounded-[1px] bg-emerald-300 border border-slate-950" />
                      </>
                    ) : null}
                  </div>
                ) : (
                  <span className="text-[10px] font-bold text-teal-300 leading-none">
                    {space.type === 'START'
                      ? '➔'
                      : space.type === 'TRANSPORT'
                        ? '🚝'
                        : space.type === 'EVENT'
                          ? '✦'
                          : space.type === 'COMMUNITY'
                            ? '🏛'
                            : '◎'}
                  </span>
                )}

                <div className="leading-tight min-w-0">
                  <div className="text-[8px] sm:text-[9px] font-semibold text-slate-100 truncate">
                    {space.shortName}
                  </div>
                  {space.price > 0 ? (
                    <div className="text-[7px] sm:text-[8px] tabular-nums text-amber-300/95 font-medium">
                      {space.price}
                    </div>
                  ) : null}
                </div>

                <span
                  style={{
                    backgroundColor: ownerMeta ? ownerMeta.color : 'transparent',
                  }}
                  className="h-1 w-full rounded-full block"
                />
              </div>
            );
          })}

          {/* Scène centrale (3x3) */}
          <div
            style={{
              gridRow: '2 / 5',
              gridColumn: '2 / 5',
              background: pack.theme.boardCenterGradient,
              borderColor: pack.theme.cellBorder,
            }}
            className="rounded-xl border p-2 sm:p-3 flex flex-col items-center justify-between text-center overflow-hidden"
          >
            <div className="text-[9px] sm:text-[10px] font-bold uppercase tracking-widest text-teal-300">
              {pack.name}
            </div>

            <div className="w-full max-w-[150px] sm:max-w-[180px] my-auto">
              <BoardCenterArtwork packId={pack.id} />
            </div>

            {/* Dés animés au centre */}
            <div
              key={frameIndex}
              className={`flex items-center gap-2 ${reducedMotion ? '' : 'animate-cc-dice-tumble'}`}
            >
              <MiniDieFace value={frame.dice[0]} />
              <span className="text-xs font-bold text-slate-400">+</span>
              <MiniDieFace value={frame.dice[1]} />
              <span className="text-xs font-extrabold text-teal-300 tabular-nums">
                = {frame.dice[0] + frame.dice[1]}
              </span>
            </div>
          </div>
        </div>

        {/* Calque des 3 pions glissant de case en case */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-1.5">
          {DEMO_PLAYERS.map((dp) => {
            const targetRingIdx = frame.positions[dp.tokenId];
            const coords = getRingCoordsPercent(targetRingIdx);
            const isMover = frame.activeToken === dp.tokenId;

            return (
              <div
                key={dp.tokenId}
                style={{
                  left: `calc(${coords.left}% + ${dp.offset.dx}px)`,
                  top: `calc(${coords.top}% + ${dp.offset.dy}px)`,
                  transition: reducedMotion
                    ? 'none'
                    : 'left 680ms cubic-bezier(0.34, 1.56, 0.64, 1), top 680ms cubic-bezier(0.34, 1.56, 0.64, 1)',
                }}
                className={`absolute -translate-x-1/2 -translate-y-1/2 z-20 ${
                  isMover && !reducedMotion ? 'scale-110' : 'scale-100'
                }`}
              >
                <PlayerTokenAvatar tokenId={dp.tokenId} size={20} active={isMover} />
              </div>
            );
          })}
        </div>
      </div>

      {/* Bandeau d'événement animé + Soldes des 3 joueurs de démonstration */}
      <div key={`toast-${frameIndex}`} className={reducedMotion ? '' : 'animate-cc-float-up'}>
        <Badge tone={frame.tone} className="w-full justify-center py-1 !text-[11px] truncate">
          {frame.headline(jewelSpace.shortName)}
        </Badge>
      </div>

      <div className="grid grid-cols-3 gap-1.5 pt-0.5">
        {DEMO_PLAYERS.map((dp) => {
          const isTurn = frame.activeToken === dp.tokenId;
          return (
            <div
              key={dp.tokenId}
              className={`flex items-center justify-between gap-1 rounded-xl border px-2 py-1.5 text-[11px] transition ${
                isTurn ? 'border-teal-400/70 bg-teal-500/10' : 'border-slate-800/90 bg-slate-900/70'
              }`}
            >
              <div className="flex items-center gap-1.5 min-w-0">
                <PlayerTokenAvatar tokenId={dp.tokenId} size={18} active={isTurn} />
                <span className="font-semibold text-slate-200 truncate">{dp.name}</span>
              </div>
              <MoneyDisplay amount={frame.cash[dp.tokenId]} size="sm" />
            </div>
          );
        })}
      </div>
    </div>
  );
}
