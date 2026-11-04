'use client';

import React from 'react';
import { Button, Modal } from '@capital-city/ui';
import { useUiStore } from '@/store/ui-store';

export function RulesHelpModal() {
  const { rulesOpen, setRulesOpen, openTutorial } = useUiStore();

  const sections = [
    {
      title: '1. Tour de jeu et dés autoritaires',
      body: 'À votre tour, lancez les deux dés (générés côté serveur). Un double vous accorde un lancer supplémentaire, mais trois doubles consécutifs vous envoient immédiatement en détention. Franchir ou atteindre la case départ rapporte 200 Cr par défaut.',
    },
    {
      title: '2. Acquisition et enchères ouvertes',
      body: 'Lorsqu’un terrain, transport ou service est libre, vous pouvez l’acquérir au prix affiché. En cas de refus ou de trésorerie insuffisante, le bien est immédiatement mis aux enchères entre tous les joueurs solvables.',
    },
    {
      title: '3. Loyers et groupes complets',
      body: 'Posséder tous les terrains d’un même groupe de couleur double le loyer des terrains nus non hypothéqués et débloque la construction équilibrée. Les 4 transports rapportent 25 / 50 / 100 / 200 Cr ; les services rapportent 4× ou 10× les dés.',
    },
    {
      title: '4. Constructions équilibrées et stocks',
      body: 'Les maisons se construisent uniformément (+1 maximum d’écart entre deux terrains d’un groupe sans hypothèque). Quatre maisons peuvent être remplacées par un hôtel dans la limite des stocks de la banque (32 maisons, 12 hôtels). La revente restitue 50 % du coût.',
    },
    {
      title: '5. Hypothèques et échanges',
      body: 'Un bien sans bâtiment dans son groupe peut être hypothéqué pour 50 % de sa valeur (aucun loyer perçu). Sa levée coûte le principal majoré de 10 %. Les joueurs peuvent échanger simultanément propriétés non bâties, crédits et cartes de sortie de prison.',
    },
    {
      title: '6. Prison, dettes, faillite et victoire',
      body: 'Sortez de prison par un double, en réglant l’amende (50 Cr), avec une carte dédiée ou au 3e tour. Si une dette excède votre trésorerie, vendez des bâtiments, hypothéquez ou négociez avant de solder la dette ; à défaut, vos actifs sont liquidés. Le dernier joueur solvable l’emporte.',
    },
  ];

  return (
    <Modal
      open={rulesOpen}
      onClose={() => setRulesOpen(false)}
      title="Règles officielles — Capital City"
      subtitle="Référence rapide des mécaniques économiques et conditions de victoire"
      maxWidthClass="max-w-2xl"
    >
      <div className="space-y-3">
        {sections.map((s) => (
          <div
            key={s.title}
            className="rounded-xl border border-slate-800 bg-slate-950/70 p-3.5 space-y-1"
          >
            <h3 className="text-sm font-bold text-teal-300">{s.title}</h3>
            <p className="text-xs leading-relaxed text-slate-300">{s.body}</p>
          </div>
        ))}
        <div className="flex items-center justify-between pt-3 border-t border-slate-800">
          <Button
            variant="amber"
            size="sm"
            onClick={() => {
              setRulesOpen(false);
              openTutorial(0);
            }}
          >
            Ouvrir le guide pas-à-pas
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setRulesOpen(false)}>
            Fermer
          </Button>
        </div>
      </div>
    </Modal>
  );
}
