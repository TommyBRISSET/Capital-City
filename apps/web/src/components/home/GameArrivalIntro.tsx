'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Badge, CapitalCityLogo, PlayerTokenAvatar } from '@capital-city/ui';

const INTRO_RING_TILES: Array<{
  row: number;
  col: number;
  label: string;
  price?: string;
  barColor?: string;
  glyph?: string;
}> = [
  { row: 4, col: 4, label: 'Départ', price: '+200 Cr', glyph: '➔' },
  { row: 4, col: 3, label: 'Q. des Arts', price: '100', barColor: '#06B6D4' },
  { row: 4, col: 2, label: 'Botanique', price: '140', barColor: '#A855F7' },
  { row: 4, col: 1, label: 'Visite', glyph: '⛓' },
  { row: 3, col: 1, label: 'Arcades', price: '180', barColor: '#F97316' },
  { row: 2, col: 1, label: 'Méridienne', price: '200', barColor: '#F97316' },
  { row: 1, col: 1, label: 'Pause', glyph: '◎' },
  { row: 1, col: 2, label: 'Opéra', price: '240', barColor: '#EF4444' },
  { row: 1, col: 3, label: 'Zénith', price: '260', barColor: '#EAB308' },
  { row: 1, col: 4, label: 'Enchères', glyph: '★' },
  { row: 2, col: 4, label: 'Citadelle', price: '320', barColor: '#10B981' },
  { row: 3, col: 4, label: 'Horizon', price: '400', barColor: '#2DD4BF' },
];

function IntroDieSvg({ value, accent }: { value: 5 | 6; accent: 'teal' | 'amber' }) {
  const stroke = accent === 'teal' ? '#2DD4BF' : '#F59E0B';
  const pipFill = accent === 'teal' ? '#CCFBF1' : '#FEF3C7';
  const pips: Array<[number, number]> =
    value === 6
      ? [
          [14, 13],
          [34, 13],
          [14, 24],
          [34, 24],
          [14, 35],
          [34, 35],
        ]
      : [
          [14, 13],
          [34, 13],
          [24, 24],
          [14, 35],
          [34, 35],
        ];

  return (
    <svg
      width="50"
      height="50"
      viewBox="0 0 48 48"
      fill="none"
      aria-hidden="true"
      className="drop-shadow-[0_8px_18px_rgba(0,0,0,0.65)]"
    >
      <rect
        x="3"
        y="3"
        width="42"
        height="42"
        rx="11"
        fill="#0B162C"
        stroke={stroke}
        strokeWidth="2.2"
      />
      <rect
        x="6.5"
        y="6.5"
        width="35"
        height="35"
        rx="8"
        stroke="#FFFFFF"
        strokeOpacity="0.08"
        strokeWidth="1"
      />
      {pips.map(([cx, cy], idx) => (
        <circle key={idx} cx={cx} cy={cy} r="3.4" fill={pipFill} />
      ))}
    </svg>
  );
}

export const INTRO_SEEN_SESSION_KEY = 'cc_intro_seen_v1';

export function GameArrivalIntro({
  active,
  onComplete,
}: {
  active: boolean;
  onComplete: () => void;
}) {
  const [exiting, setExiting] = useState(false);
  const completedRef = useRef(false);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    if (active) {
      completedRef.current = false;
      setExiting(false);
    }
  }, [active]);

  const finishNow = useCallback(() => {
    if (completedRef.current) return;
    completedRef.current = true;
    setExiting(true);
    try {
      window.sessionStorage.setItem(INTRO_SEEN_SESSION_KEY, '1');
    } catch {
      // Ignorer en navigation restreinte
    }
    window.setTimeout(() => {
      setExiting(false);
      onCompleteRef.current();
    }, 200);
  }, []);

  useEffect(() => {
    if (!active) return;

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        finishNow();
      }
    };
    window.addEventListener('keydown', handleKey);

    const autoTimer = window.setTimeout(() => {
      finishNow();
    }, 2400);

    return () => {
      window.removeEventListener('keydown', handleKey);
      window.clearTimeout(autoTimer);
    };
  }, [active, finishNow]);

  if (!active) return null;

  return (
    <div
      data-testid="game-arrival-intro"
      role="region"
      aria-label="Animation d’ouverture Capital City"
      onClick={finishNow}
      className={`fixed inset-0 z-40 flex items-center justify-center p-4 bg-[#050A14]/95 backdrop-blur-xl transition-all duration-200 ${
        exiting ? 'opacity-0 scale-105 pointer-events-none' : 'opacity-100 scale-100'
      }`}
    >
      {/* Halos lumineux d'arrière-plan */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-24 left-1/4 h-80 w-80 rounded-full bg-teal-500/20 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-24 right-1/4 h-80 w-80 rounded-full bg-amber-500/20 blur-3xl"
      />

      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-[540px] rounded-3xl border border-slate-700/80 bg-gradient-to-b from-slate-900/95 via-[#091326] to-slate-950 p-4 sm:p-6 shadow-[0_25px_80px_rgba(0,0,0,0.85)] space-y-4"
      >
        {/* Couronne de 12 cases illuminées en cascade autour de la scène centrale */}
        <div className="grid grid-cols-4 grid-rows-4 gap-1.5 sm:gap-2 aspect-square w-full max-w-[430px] mx-auto">
          {INTRO_RING_TILES.map((tile, idx) => (
            <div
              key={tile.label}
              style={{
                gridRow: tile.row,
                gridColumn: tile.col,
                animationDelay: `${idx * 55}ms`,
              }}
              className="animate-cc-tile-ignite rounded-xl border border-slate-700/80 bg-slate-900/95 p-1.5 flex flex-col justify-between overflow-hidden shadow-md"
            >
              {tile.barColor ? (
                <span
                  style={{ backgroundColor: tile.barColor }}
                  className="h-2 w-full rounded-[4px] block"
                />
              ) : (
                <span className="text-[11px] font-bold text-teal-300 leading-none">
                  {tile.glyph}
                </span>
              )}
              <div className="leading-tight">
                <div className="text-[9px] sm:text-[10px] font-bold text-slate-100 truncate">
                  {tile.label}
                </div>
                {tile.price ? (
                  <div className="text-[8px] sm:text-[9px] font-semibold tabular-nums text-amber-300">
                    {tile.price}
                  </div>
                ) : null}
              </div>
            </div>
          ))}

          {/* Cœur central (2x2) : Logo, Dés bondissants & Pions */}
          <div
            style={{ gridRow: '2 / 4', gridColumn: '2 / 4' }}
            className="rounded-2xl border border-teal-500/35 bg-gradient-to-br from-[#0D1F3C] via-[#081224] to-[#131C36] p-3 flex flex-col items-center justify-between text-center shadow-inner overflow-hidden"
          >
            <div className="flex items-center gap-2">
              <CapitalCityLogo size={30} />
              <div className="text-left">
                <div className="text-xs sm:text-sm font-black tracking-tight text-white uppercase">
                  Capital City
                </div>
                <div className="text-[9px] font-semibold uppercase tracking-widest text-teal-300">
                  Ouverture du plateau
                </div>
              </div>
            </div>

            {/* Deux dés animés */}
            <div className="flex items-center justify-center gap-3 my-1">
              <div style={{ animationDelay: '90ms' }} className="animate-cc-dice-tumble">
                <IntroDieSvg value={6} accent="teal" />
              </div>
              <div style={{ animationDelay: '210ms' }} className="animate-cc-dice-tumble">
                <IntroDieSvg value={6} accent="amber" />
              </div>
            </div>

            {/* Pions & Prime Départ */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-center gap-2">
                <PlayerTokenAvatar tokenId="skyline-tower" size={26} active />
                <PlayerTokenAvatar tokenId="luxury-yacht" size={26} active />
                <PlayerTokenAvatar tokenId="orbital-shuttle" size={26} active />
              </div>
              <Badge tone="amber" className="!text-[10px]">
                🎲 Double 6 • départ +200 Cr
              </Badge>
            </div>
          </div>
        </div>

        {/* Barre de progression fluide + bouton Passer */}
        <div className="space-y-2 pt-1">
          <div className="h-1.5 w-full rounded-full bg-slate-800/90 overflow-hidden">
            <div className="h-full w-full rounded-full bg-gradient-to-r from-teal-400 via-cyan-300 to-amber-400 animate-cc-intro-progress" />
          </div>
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Préparation des 3 métropoles…</span>
            <button
              type="button"
              onClick={finishNow}
              data-testid="btn-skip-intro"
              className="font-semibold text-teal-300 hover:text-teal-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 rounded px-2 py-0.5 cursor-pointer"
            >
              Passer l’intro →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
