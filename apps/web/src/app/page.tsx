'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ALL_BOARD_PACKS } from '@capital-city/board-packs';
import { DEFAULT_RULESET_CONFIG, PLAYER_TOKENS } from '@capital-city/shared';
import {
  Badge,
  BoardCenterArtwork,
  Button,
  MoneyDisplay,
  PlayerTokenAvatar,
} from '@capital-city/ui';
import { AppHeader } from '@/components/AppHeader';
import { GameArrivalIntro, INTRO_SEEN_SESSION_KEY } from '@/components/home/GameArrivalIntro';
import { LiveBoardShowcase } from '@/components/home/LiveBoardShowcase';
import { useUiStore } from '@/store/ui-store';

export default function HomePage() {
  const {
    recentRoomCodes,
    selectedPreviewPack,
    reducedMotion,
    setSelectedPreviewPack,
    openTutorial,
    setRulesOpen,
    setSettingsOpen,
  } = useUiStore();

  const [introActive, setIntroActive] = useState(false);
  const [readyForTutorial, setReadyForTutorial] = useState(false);

  const handleIntroComplete = useCallback(() => {
    setIntroActive(false);
    setReadyForTutorial(true);
  }, []);

  const handleReplayIntro = useCallback(() => {
    setIntroActive(true);
  }, []);

  useEffect(() => {
    let alreadySeen = false;
    try {
      alreadySeen = window.sessionStorage.getItem(INTRO_SEEN_SESSION_KEY) === '1';
    } catch {
      alreadySeen = false;
    }

    if (!reducedMotion && !alreadySeen) {
      setIntroActive(true);
    } else {
      setReadyForTutorial(true);
    }
  }, [reducedMotion]);

  return (
    <div className="min-h-screen bg-[#060B16] text-slate-100 flex flex-col">
      <AppHeader autoOpenTutorial={readyForTutorial} />

      <GameArrivalIntro active={introActive} onComplete={handleIntroComplete} />

      <main
        id="main-content"
        className="mx-auto w-full max-w-7xl flex-1 px-4 sm:px-6 py-6 sm:py-10 space-y-12"
      >
        {/* Section principale avec plateau animé en direct */}
        <section className="relative overflow-hidden rounded-3xl border border-slate-800/90 bg-gradient-to-br from-slate-900 via-[#0B152B] to-slate-950 p-5 sm:p-9 lg:p-11 shadow-2xl">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            <div className="lg:col-span-7 space-y-5 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="teal">Multijoueur temps réel • 2 à 8 joueurs</Badge>
                <Badge tone="amber">Serveur autoritaire et sauvegarde auto</Badge>
              </div>

              <h1 className="text-3xl sm:text-5xl font-black tracking-tight text-white leading-[1.08]">
                Bâtissez l’empire immobilier ultime dans{' '}
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-teal-300 via-cyan-300 to-amber-300">
                  Capital City
                </span>
                .
              </h1>

              <p className="text-sm sm:text-base text-slate-300 max-w-2xl leading-relaxed">
                Achetez des quartiers stratégiques, négociez des alliances décisives, remportez les
                enchères et érigez vos hôtels sur trois plateaux originaux en ligne.
              </p>

              <div className="flex flex-wrap items-center gap-3 pt-1">
                <Link href="/create" data-testid="cta-create-room">
                  <Button variant="primary" size="lg">
                    Créer une salle privée
                  </Button>
                </Link>
                <Link href="/join" data-testid="cta-join-room">
                  <Button variant="amber" size="lg">
                    Rejoindre avec un code
                  </Button>
                </Link>
                <Link href="/boards">
                  <Button variant="secondary" size="lg">
                    Explorer les 3 plateaux
                  </Button>
                </Link>
              </div>

              <div className="flex flex-wrap items-center gap-5 pt-2 text-xs text-slate-400">
                <div>
                  Capital initial :{' '}
                  <MoneyDisplay amount={DEFAULT_RULESET_CONFIG.startingCash} size="sm" />
                </div>
                <div>
                  Prime de départ :{' '}
                  <MoneyDisplay amount={DEFAULT_RULESET_CONFIG.passStartBonus} size="sm" />
                </div>
                <button
                  type="button"
                  onClick={() => openTutorial(0)}
                  className="text-teal-300 hover:underline font-medium cursor-pointer"
                >
                  Découvrir le tutoriel interactif →
                </button>
              </div>

              {/* Ruban des 8 pions originaux et salles récentes */}
              <div className="rounded-2xl border border-slate-800/90 bg-slate-950/65 p-3.5 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-teal-300">
                    Les 8 pions originaux
                  </span>
                  <span className="text-[11px] text-slate-400">Exclusivité par salon</span>
                </div>
                <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
                  {PLAYER_TOKENS.map((t) => (
                    <div
                      key={t.id}
                      className="flex flex-col items-center gap-1 rounded-xl border border-slate-800/80 bg-slate-900/70 p-2 text-center"
                    >
                      <PlayerTokenAvatar tokenId={t.id} size={28} />
                      <span className="text-[10px] font-medium text-slate-200 leading-tight truncate max-w-full">
                        {t.name}
                      </span>
                    </div>
                  ))}
                </div>

                {recentRoomCodes.length > 0 && (
                  <div className="pt-2.5 border-t border-slate-800 flex flex-wrap items-center gap-2">
                    <span className="text-xs font-semibold text-slate-400">Salles récentes :</span>
                    {recentRoomCodes.map((code) => (
                      <Link
                        key={code}
                        href={`/room/${code}`}
                        className="rounded-lg border border-teal-500/35 bg-teal-500/10 px-2.5 py-1 text-xs font-bold text-teal-300 hover:bg-teal-500/20"
                      >
                        {code} →
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Scène de jeu animée en direct (lorsqu'on n'est pas en partie) */}
            <div className="lg:col-span-5 min-w-0">
              <LiveBoardShowcase
                packId={selectedPreviewPack}
                reducedMotion={reducedMotion}
                onSelectPack={setSelectedPreviewPack}
                onReplayIntro={handleReplayIntro}
              />
            </div>
          </div>
        </section>

        {/* Aperçu des 3 plateaux */}
        <section className="space-y-4">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-white">
                Trois univers thématiques originaux
              </h2>
              <p className="text-xs sm:text-sm text-slate-400">
                40 cases, 8 groupes de couleur, 4 transports, 2 services et 32 cartes dédiées par
                plateau.
              </p>
            </div>
            <div className="hidden sm:flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => setRulesOpen(true)}>
                Consulter les règles
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setSettingsOpen(true)}>
                Paramètres
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {ALL_BOARD_PACKS.map((pack) => (
              <div
                key={pack.id}
                className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 flex flex-col justify-between gap-4 hover:border-teal-500/50 transition"
              >
                <div className="space-y-3">
                  <div
                    style={{ background: pack.theme.boardCenterGradient }}
                    className="rounded-xl border border-slate-800 p-4 flex items-center justify-center h-36"
                  >
                    <BoardCenterArtwork packId={pack.id} />
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-teal-300">{pack.subtitle}</div>
                    <h3 className="text-lg font-bold text-white">{pack.name}</h3>
                    <p className="mt-1 text-xs text-slate-400 leading-relaxed">
                      {pack.description}
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-slate-800">
                  <span className="text-[11px] text-slate-400">
                    Joyau : <strong className="text-amber-300">{pack.spaces[39]?.name}</strong>
                  </span>
                  <Link
                    href={`/create?pack=${pack.id}`}
                    className="text-xs font-semibold text-teal-300 hover:text-teal-200"
                  >
                    Jouer ici →
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
