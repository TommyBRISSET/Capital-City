import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'Capital City — jeu de plateau immobilier multijoueur',
  description:
    'Construisez votre empire urbain en ligne de 2 à 8 joueurs sur Asteria City, Riviera District et Nova Frontier.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr" className="dark">
      <body className="antialiased selection:bg-teal-500/30 selection:text-teal-200">
        {children}
      </body>
    </html>
  );
}
