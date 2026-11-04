export const DESIGN_TOKENS = {
  brandName: 'Capital City',
  palette: {
    midnight: '#060B16',
    deepNavy: '#0B1325',
    graphite: '#111C33',
    slateBorder: '#1E2D4A',
    turquoise: '#2DD4BF',
    turquoiseDark: '#0D9488',
    amber: '#F59E0B',
    amberLight: '#FBBF24',
    coral: '#FB7185',
    emerald: '#34D399',
  },
  radii: {
    sm: '0.5rem',
    md: '0.75rem',
    lg: '1rem',
    xl: '1.25rem',
  },
  motion: {
    fastMs: 150,
    normalMs: 260,
    tokenMoveMs: 420,
  },
} as const;

export function formatCredits(amount: number, currencyLabel = 'Cr'): string {
  const safe = Number.isFinite(amount) ? Math.trunc(amount) : 0;
  const formatted = new Intl.NumberFormat('fr-FR', {
    maximumFractionDigits: 0,
  }).format(safe);
  return `${formatted} ${currencyLabel}`;
}
