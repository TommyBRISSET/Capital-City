'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { ALL_BOARD_PACKS, getBoardPack } from '@capital-city/board-packs';
import type { BoardPackId } from '@capital-city/shared';
import { Badge, Button, GameBoard, PropertyDeedCard } from '@capital-city/ui';
import { AppHeader } from '@/components/AppHeader';

export default function BoardsShowcasePage() {
  const [packId, setPackId] = useState<BoardPackId>('asteria-city');
  const [selectedSpace, setSelectedSpace] = useState<number>(39);

  const pack = getBoardPack(packId);
  const space = pack.spaces[selectedSpace] ?? pack.spaces[0]!;
  const groupTheme = space.groupCode ? pack.theme.groups[space.groupCode] : null;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      <AppHeader />

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 sm:px-6 py-6 space-y-6">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <Badge tone="teal">3 univers originaux • 40 cases canoniques</Badge>
            <h1 className="mt-2 text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
              Atlas des plateaux Capital City
            </h1>
            <p className="mt-1 text-sm text-slate-400 max-w-2xl">
              Explorez chaque case, ses loyers, coûts de construction et paquets de cartes. Les
              trois univers partagent exactement le même équilibre économique.
            </p>
          </div>
          <Link href="/create">
            <Button variant="primary">Créer une partie sur {pack.name}</Button>
          </Link>
        </div>

        {/* Sélecteur de pack */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {ALL_BOARD_PACKS.map((p) => {
            const active = p.id === packId;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setPackId(p.id)}
                data-testid={`select-pack-${p.id}`}
                className={`rounded-2xl border p-4 text-left transition cursor-pointer ${
                  active
                    ? 'border-teal-400 bg-slate-900 shadow-lg shadow-teal-500/10'
                    : 'border-slate-800 bg-slate-900/50 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-white">{p.name}</span>
                  {active ? <Badge tone="teal">Actif</Badge> : null}
                </div>
                <div className="text-xs text-teal-300 mt-0.5">{p.subtitle}</div>
                <p className="mt-2 text-xs text-slate-400 line-clamp-2">{p.description}</p>
              </button>
            );
          })}
        </div>

        {/* Plateau + Fiche de la case sélectionnée */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-8">
            <GameBoard
              pack={pack}
              selectedSpaceIndex={selectedSpace}
              onSelectSpace={setSelectedSpace}
            />
          </div>

          <aside className="lg:col-span-4 space-y-4">
            <PropertyDeedCard space={space} groupTheme={groupTheme} />

            <div className="rounded-2xl border border-slate-800 bg-slate-900/75 p-4 space-y-3">
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Paquets de cartes du plateau ({pack.eventCards.length + pack.communityCards.length}{' '}
                cartes)
              </div>
              <div className="rounded-xl bg-slate-950/70 p-3 border border-slate-800">
                <div className="text-xs font-bold text-teal-300">
                  ✦ {pack.theme.eventDeckName} ({pack.eventCards.length})
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  Ex. « {pack.eventCards[0]?.title} » — {pack.eventCards[0]?.description}
                </p>
              </div>
              <div className="rounded-xl bg-slate-950/70 p-3 border border-slate-800">
                <div className="text-xs font-bold text-amber-300">
                  🏛 {pack.theme.communityDeckName} ({pack.communityCards.length})
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  Ex. « {pack.communityCards[0]?.title} » — {pack.communityCards[0]?.description}
                </p>
              </div>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}
