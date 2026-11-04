'use client';

import React, { useEffect } from 'react';
import { Button, Modal, PlayerTokenAvatar } from '@capital-city/ui';
import { useUiStore } from '@/store/ui-store';

const TUTORIAL_STEPS = [
  {
    badge: 'Étape 1 / 11 — identité et pion',
    title: 'Choisir votre pion et votre identité',
    description:
      'Dans chaque salle privée (2 à 8 joueurs), sélectionnez un pseudonyme visible et l’un des 8 pions originaux Capital City (Tour Zénith, Yacht Azur, Express Maglev, Drone Orbital…).',
    tip: 'Astuce : chaque joueur d’une même salle possède un pion unique pour une lisibilité immédiate sur le plateau.',
  },
  {
    badge: 'Étape 2 / 11 — le plateau de 40 cases',
    title: 'Comprendre la structure du plateau',
    description:
      'Les trois univers (Asteria City, Riviera District, Nova Frontier) partagent un parcours carré de 40 cases : départ (#0), 22 propriétés réparties en 8 groupes de couleur, 4 transports, 2 services, 6 cases de cartes, 2 taxes et 3 coins spéciaux.',
    tip: 'Cliquez ou appuyez sur n’importe quelle case à tout moment pour consulter sa fiche complète.',
  },
  {
    badge: 'Étape 3 / 11 — lancer des dés',
    title: 'Lancer les deux dés (autorité serveur)',
    description:
      'Au début de votre tour, cliquez sur « Lancer les deux dés ». Le serveur génère le tirage de manière sécurisée. Un double vous offre un lancer supplémentaire, mais trois doubles d’affilée vous conduisent en prison !',
    tip: 'Le navigateur ne choisit jamais le résultat des dés.',
  },
  {
    badge: 'Étape 4 / 11 — déplacements et départ',
    title: 'Avancer et franchir la case départ',
    description:
      'Votre pion avance automatiquement selon la somme des dés. Chaque passage ou arrêt sur la case départ (#0) crédite immédiatement la prime configurée (200 Cr par défaut).',
    tip: 'Aller directement en prison ne fait pas franchir la case départ.',
  },
  {
    badge: 'Étape 5 / 11 — acquisition',
    title: 'Acheter une propriété libre',
    description:
      'Si vous atteignez un terrain, un transport ou un service non détenu, vous pouvez l’acheter au prix affiché. Il rejoint aussitôt votre portefeuille foncier.',
    tip: 'Surveillez votre réserve de liquidités pour faire face aux prochains loyers.',
  },
  {
    badge: 'Étape 6 / 11 — enchères ouvertes',
    title: 'Participer aux enchères',
    description:
      'Si le joueur actif décline l’achat (ou manque de trésorerie), une enchère ouverte démarre immédiatement. Tous les joueurs solvables — y compris celui qui a refusé — peuvent surenchérir ou passer.',
    tip: 'Une belle opportunité d’acquérir un terrain stratégique à prix réduit !',
  },
  {
    badge: 'Étape 7 / 11 — perception des loyers',
    title: 'Encaisser les loyers automatiquement',
    description:
      'Lorsqu’un adversaire s’arrête sur l’un de vos actifs non hypothéqués, le loyer est transféré automatiquement. Réunir tous les terrains d’une même couleur double le loyer des terrains nus.',
    tip: 'Les 4 transports et les 2 services voient leur rendement croître selon le nombre possédé.',
  },
  {
    badge: 'Étape 8 / 11 — constructions équilibrées',
    title: 'Bâtir maisons et hôtels',
    description:
      'Sur un groupe complet sans hypothèque, construisez des maisons de manière équilibrée (écart maximal d’une maison dans le groupe). À 4 maisons, érigez un hôtel pour maximiser les loyers !',
    tip: 'La banque dispose d’un stock limité : 32 maisons et 12 hôtels.',
  },
  {
    badge: 'Étape 9 / 11 — hypothèques',
    title: 'Mobiliser des liquidités par l’hypothèque',
    description:
      'En cas de besoin de trésorerie, vendez d’abord d’éventuels bâtiments (à 50 %), puis hypothéquez un actif pour recevoir 50 % de son prix. Vous pourrez lever l’hypothèque plus tard contre le principal + 10 %.',
    tip: 'Aucun loyer n’est perçu sur une propriété hypothéquée.',
  },
  {
    badge: 'Étape 10 / 11 — négociation et échanges',
    title: 'Négocier des échanges entre joueurs',
    description:
      'Proposez un échange combinant terrains non bâtis, crédits et cartes de sortie de prison. Prévisualisez l’accord avant envoi ; votre interlocuteur peut accepter, refuser ou contre-proposer.',
    tip: 'Les échanges mutuellement profitables débloquent souvent les groupes complets décisifs.',
  },
  {
    badge: 'Étape 11 / 11 — faillite et victoire',
    title: 'Remporter la partie',
    description:
      'Si un joueur ne peut plus honorer une dette même après liquidation, il fait faillite. Le dernier joueur non en faillite remporte la victoire (ou le plus grand patrimoine net si une limite de durée est activée).',
    tip: 'Vous pouvez rouvrir ce guide à tout moment depuis le bouton « Tutoriel ».',
  },
];

export function TutorialOverlay({
  autoOpenOnFirstVisit = false,
}: {
  autoOpenOnFirstVisit?: boolean;
}) {
  const {
    tutorialOpen,
    tutorialCompleted,
    tutorialStep,
    preferredToken,
    openTutorial,
    setTutorialStep,
    closeTutorial,
  } = useUiStore();

  useEffect(() => {
    if (autoOpenOnFirstVisit && !tutorialCompleted) {
      const timer = setTimeout(() => {
        openTutorial(0);
      }, 350);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [autoOpenOnFirstVisit, tutorialCompleted, openTutorial]);

  const stepIndex = Math.min(Math.max(tutorialStep, 0), TUTORIAL_STEPS.length - 1);
  const current = TUTORIAL_STEPS[stepIndex]!;
  const isLast = stepIndex === TUTORIAL_STEPS.length - 1;

  return (
    <Modal
      open={tutorialOpen}
      onClose={() => closeTutorial(true)}
      title="Guide interactif — bienvenue dans Capital City"
      subtitle="Maîtrisez toutes les mécaniques en moins d’une minute"
      maxWidthClass="max-w-xl"
    >
      <div className="space-y-4" data-testid="tutorial-modal">
        <div className="flex items-center justify-between gap-3">
          <span className="rounded-full bg-teal-500/15 border border-teal-500/35 px-3 py-1 text-xs font-semibold text-teal-300">
            {current.badge}
          </span>
          <PlayerTokenAvatar tokenId={preferredToken} size={34} active />
        </div>

        {/* Barre de progression */}
        <div className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden">
          <div
            style={{ width: `${((stepIndex + 1) / TUTORIAL_STEPS.length) * 100}%` }}
            className="h-full bg-gradient-to-r from-teal-400 to-amber-400 transition-all"
          />
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-4 space-y-2">
          <h3 className="text-base font-bold text-white">{current.title}</h3>
          <p className="text-sm leading-relaxed text-slate-300">{current.description}</p>
          <p className="text-xs text-amber-300/90 pt-1">{current.tip}</p>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-800">
          <Button variant="ghost" size="sm" onClick={() => closeTutorial(true)}>
            Passer le tutoriel
          </Button>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={stepIndex === 0}
              onClick={() => setTutorialStep(stepIndex - 1)}
            >
              Précédent
            </Button>
            {isLast ? (
              <Button variant="primary" size="sm" onClick={() => closeTutorial(true)}>
                Terminer et jouer
              </Button>
            ) : (
              <Button variant="primary" size="sm" onClick={() => setTutorialStep(stepIndex + 1)}>
                Suivant
              </Button>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
