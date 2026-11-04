'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';
import { Button, CapitalCityLogo } from '@capital-city/ui';
import { useUiStore } from '@/store/ui-store';
import { RulesHelpModal } from './RulesHelpModal';
import { SettingsModal } from './SettingsModal';
import { TutorialOverlay } from './TutorialOverlay';

export function AppHeader({ autoOpenTutorial = false }: { autoOpenTutorial?: boolean }) {
  const { setRulesOpen, setSettingsOpen, openTutorial, reducedMotion } = useUiStore();

  useEffect(() => {
    document.documentElement.dataset.reducedMotion = reducedMotion ? 'true' : 'false';
  }, [reducedMotion]);

  return (
    <>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-xl focus:bg-teal-400 focus:px-4 focus:py-2 focus:text-xs focus:font-bold focus:text-slate-950"
      >
        Aller au contenu principal
      </a>
      <header
        data-reduced-motion={reducedMotion ? 'true' : 'false'}
        className="sticky top-0 z-30 border-b border-slate-800/80 bg-slate-950/85 backdrop-blur-md"
      >
        <div className="mx-auto max-w-7xl px-2.5 sm:px-6 h-14 sm:h-16 flex items-center justify-between gap-1.5 sm:gap-3">
          <Link
            href="/"
            className="flex items-center gap-2 sm:gap-3 min-w-0 group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 rounded-xl"
          >
            <CapitalCityLogo size={32} />
            <div className="min-w-0">
              <span className="block text-sm sm:text-lg font-extrabold tracking-tight text-white whitespace-nowrap group-hover:text-teal-300 transition-colors">
                Capital City
              </span>
              <span className="hidden md:block text-[11px] text-slate-400 -mt-0.5">
                Stratégie immobilière multijoueur
              </span>
            </div>
          </Link>

          <nav
            aria-label="Navigation principale"
            className="flex items-center gap-1 sm:gap-2 shrink-0"
          >
            <Link
              href="/boards"
              data-testid="nav-boards"
              className="px-2 sm:px-3 py-1.5 rounded-lg text-[11px] sm:text-sm font-medium text-slate-300 hover:text-white hover:bg-slate-800/80 transition"
            >
              Plateaux
            </Link>
            <Button
              variant="ghost"
              size="sm"
              className="!px-2 sm:!px-3 !text-[11px] sm:!text-xs"
              onClick={() => openTutorial(0)}
              data-testid="nav-tutorial"
            >
              Tutoriel
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="!px-2 sm:!px-3 !text-[11px] sm:!text-xs"
              onClick={() => setRulesOpen(true)}
              data-testid="nav-rules"
            >
              Règles
            </Button>
            <Button
              variant="secondary"
              size="sm"
              className="!px-2 sm:!px-3 !text-[11px] sm:!text-xs"
              onClick={() => setSettingsOpen(true)}
              data-testid="nav-settings"
            >
              Paramètres
            </Button>
          </nav>
        </div>
      </header>

      <SettingsModal />
      <RulesHelpModal />
      <TutorialOverlay autoOpenOnFirstVisit={autoOpenTutorial} />
    </>
  );
}
