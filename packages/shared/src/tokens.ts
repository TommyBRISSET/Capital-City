export const PLAYER_TOKENS = [
  {
    id: 'skyline-tower',
    name: 'Tour Zénith',
    description: 'Gratte-ciel architectural en verre prismatique',
    color: '#2DD4BF',
    accent: '#0F766E',
  },
  {
    id: 'luxury-yacht',
    name: 'Yacht Azur',
    description: 'Navire profilé des marinas côtières',
    color: '#38BDF8',
    accent: '#0369A1',
  },
  {
    id: 'maglev-train',
    name: 'Express Maglev',
    description: 'Train à sustentation magnétique haute vitesse',
    color: '#F59E0B',
    accent: '#B45309',
  },
  {
    id: 'cyber-drone',
    name: 'Drone Orbital',
    description: 'Unité autonome de reconnaissance urbaine',
    color: '#A78BFA',
    accent: '#6D28D9',
  },
  {
    id: 'solar-roadster',
    name: 'Roadster Solaire',
    description: 'Coupé grand tourisme électrique de prestige',
    color: '#FB7185',
    accent: '#BE123C',
  },
  {
    id: 'emerald-vault',
    name: 'Coffre Émeraude',
    description: 'Symbole de haute réserve fiduciaire',
    color: '#34D399',
    accent: '#047857',
  },
  {
    id: 'orbital-shuttle',
    name: 'Navette Nova',
    description: 'Transporteur suborbital de nouvelle génération',
    color: '#F472B6',
    accent: '#9D174D',
  },
  {
    id: 'crown-compass',
    name: 'Boussole Impériale',
    description: 'Instrument des grands bâtisseurs urbains',
    color: '#FBBF24',
    accent: '#92400E',
  },
] as const;

export type TokenId = (typeof PLAYER_TOKENS)[number]['id'];

export const TOKEN_IDS = PLAYER_TOKENS.map((t) => t.id) as [TokenId, ...TokenId[]];
