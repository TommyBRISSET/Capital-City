'use client';

import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { AssetState, BoardSpaceDefinition, GroupTheme } from '@capital-city/shared';
import { formatCredits } from './tokens';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'amber' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  disabledReason?: string;
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabledReason,
  disabled,
  className = '',
  children,
  ...rest
}: ButtonProps) {
  const isDisabled = Boolean(disabled || loading);

  const variantClasses: Record<NonNullable<ButtonProps['variant']>, string> = {
    primary:
      'bg-teal-500 text-slate-950 hover:bg-teal-400 active:bg-teal-600 shadow-lg shadow-teal-500/20 font-semibold',
    secondary:
      'bg-slate-800/90 text-slate-100 border border-slate-700 hover:bg-slate-700/90 hover:border-slate-500 font-medium',
    amber:
      'bg-amber-500 text-slate-950 hover:bg-amber-400 active:bg-amber-600 shadow-lg shadow-amber-500/20 font-semibold',
    danger:
      'bg-rose-600 text-white hover:bg-rose-500 active:bg-rose-700 shadow-lg shadow-rose-600/20 font-semibold',
    ghost: 'bg-transparent text-slate-300 hover:bg-slate-800/70 hover:text-white font-medium',
  };

  const sizeClasses: Record<NonNullable<ButtonProps['size']>, string> = {
    sm: 'px-3 py-1.5 text-xs rounded-lg min-h-[34px]',
    md: 'px-4 py-2.5 text-sm rounded-xl min-h-[42px]',
    lg: 'px-6 py-3 text-base rounded-xl min-h-[48px]',
  };

  return (
    <div className="inline-flex flex-col items-stretch">
      <button
        type="button"
        disabled={isDisabled}
        aria-disabled={isDisabled}
        title={isDisabled && disabledReason ? disabledReason : rest.title}
        className={`inline-flex items-center justify-center gap-2 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 disabled:opacity-45 disabled:pointer-events-none cursor-pointer ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
        {...rest}
      >
        {loading && (
          <span
            aria-hidden="true"
            className="h-4 w-4 rounded-full border-2 border-current border-t-transparent animate-spin"
          />
        )}
        {children}
      </button>
      {isDisabled && disabledReason ? (
        <span className="mt-1 text-[11px] leading-tight text-slate-400" role="note">
          {disabledReason}
        </span>
      ) : null}
    </div>
  );
}

export function Badge({
  children,
  tone = 'neutral',
  className = '',
}: {
  children: React.ReactNode;
  tone?: 'neutral' | 'teal' | 'amber' | 'rose' | 'emerald';
  className?: string;
}) {
  const tones = {
    neutral: 'bg-slate-800/90 text-slate-300 border-slate-700',
    teal: 'bg-teal-500/15 text-teal-300 border-teal-500/35',
    amber: 'bg-amber-500/15 text-amber-300 border-amber-500/35',
    rose: 'bg-rose-500/15 text-rose-300 border-rose-500/35',
    emerald: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/35',
  };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium ${tones[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

export function MoneyDisplay({
  amount,
  size = 'md',
  delta,
  className = '',
}: {
  amount: number;
  size?: 'sm' | 'md' | 'lg';
  delta?: number | null;
  className?: string;
}) {
  const sizes = {
    sm: 'text-xs',
    md: 'text-base',
    lg: 'text-2xl',
  };

  return (
    <span
      className={`inline-flex items-baseline gap-1.5 tabular-nums font-bold ${sizes[size]} ${className}`}
    >
      <span className={amount < 0 ? 'text-rose-400' : 'text-amber-300'}>
        {formatCredits(amount)}
      </span>
      {typeof delta === 'number' && delta !== 0 ? (
        <span
          className={`text-xs font-semibold ${delta > 0 ? 'text-emerald-400' : 'text-rose-400'}`}
        >
          {delta > 0 ? `+${formatCredits(delta)}` : formatCredits(delta)}
        </span>
      ) : null}
    </span>
  );
}

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  maxWidthClass = 'max-w-lg',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  maxWidthClass?: string;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const previousFocused = document.activeElement as HTMLElement | null;
    const dialogEl = dialogRef.current;

    const focusable = dialogEl?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    focusable?.[0]?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === 'Tab' && dialogEl) {
        const nodes = dialogEl.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        );
        if (nodes.length === 0) return;
        const first = nodes[0]!;
        const last = nodes[nodes.length - 1]!;
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      previousFocused?.focus?.();
    };
  }, [open, onClose]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`w-full ${maxWidthClass} max-h-[90vh] overflow-y-auto rounded-2xl border border-slate-700/80 bg-slate-900 text-slate-100 shadow-2xl p-6`}
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-800 pb-4">
          <div>
            <h2 className="text-lg font-bold tracking-tight text-white">{title}</h2>
            {subtitle ? <p className="mt-0.5 text-xs text-slate-400">{subtitle}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer la fenêtre"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 cursor-pointer"
          >
            ✕
          </button>
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

export function PropertyDeedCard({
  space,
  groupTheme,
  asset,
  ownerName,
  mortgageInterestRate = 0.1,
}: {
  space: BoardSpaceDefinition;
  groupTheme?: GroupTheme | null;
  asset?: AssetState | null;
  ownerName?: string | null;
  mortgageInterestRate?: number;
}) {
  const redeemCost = Math.ceil(space.mortgageValue * (1 + mortgageInterestRate));

  return (
    <div className="rounded-2xl border border-slate-700/80 bg-slate-950/90 overflow-hidden shadow-xl">
      <div
        style={{
          backgroundColor: groupTheme?.bg ?? '#1E293B',
          color: groupTheme?.text ?? '#F8FAFC',
        }}
        className="px-4 py-3 border-b border-black/20"
      >
        <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider opacity-90">
          <span>
            {groupTheme
              ? groupTheme.name
              : space.type === 'TRANSPORT'
                ? 'Réseau de transport'
                : space.type === 'UTILITY'
                  ? 'Service public'
                  : 'Case spéciale'}
          </span>
          <span>Case #{space.index}</span>
        </div>
        <h3 className="mt-0.5 text-lg font-extrabold tracking-tight">{space.name}</h3>
      </div>

      <div className="p-4 space-y-3 text-sm">
        <p className="text-xs text-slate-400 italic">{space.flavorText}</p>

        {space.price > 0 ? (
          <>
            <div className="flex items-center justify-between rounded-xl bg-slate-900 px-3 py-2 border border-slate-800">
              <span className="text-slate-400 text-xs">Valeur d’acquisition</span>
              <span className="tabular-nums font-bold text-amber-300">
                {formatCredits(space.price)}
              </span>
            </div>

            {space.type === 'PROPERTY' && (
              <div className="space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-400">Loyer terrain nu</span>
                  <span className="tabular-nums font-semibold">
                    {formatCredits(space.rents[0] ?? 0)}
                  </span>
                </div>
                <div className="flex justify-between text-teal-300">
                  <span>Groupe complet (sans construction)</span>
                  <span className="tabular-nums font-semibold">
                    {formatCredits((space.rents[0] ?? 0) * 2)}
                  </span>
                </div>
                {[1, 2, 3, 4].map((h) => (
                  <div key={h} className="flex justify-between">
                    <span className="text-slate-400">
                      Avec {h} {h === 1 ? 'maison' : 'maisons'}
                    </span>
                    <span className="tabular-nums font-medium">
                      {formatCredits(space.rents[h] ?? 0)}
                    </span>
                  </div>
                ))}
                <div className="flex justify-between font-semibold text-amber-300 pt-1 border-t border-slate-800">
                  <span>Avec hôtel</span>
                  <span className="tabular-nums">{formatCredits(space.rents[5] ?? 0)}</span>
                </div>
              </div>
            )}

            {space.type === 'TRANSPORT' && (
              <div className="space-y-1.5 text-xs">
                {[1, 2, 3, 4].map((count, idx) => (
                  <div key={count} className="flex justify-between">
                    <span className="text-slate-400">
                      Si {count} {count === 1 ? 'transport détenu' : 'transports détenus'}
                    </span>
                    <span className="tabular-nums font-semibold">
                      {formatCredits(space.rents[idx] ?? 0)}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {space.type === 'UTILITY' && (
              <div className="space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-400">1 service possédé</span>
                  <span className="tabular-nums font-semibold">4 × somme des dés</span>
                </div>
                <div className="flex justify-between text-teal-300">
                  <span>Les 2 services possédés</span>
                  <span className="tabular-nums font-semibold">10 × somme des dés</span>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-800 text-xs">
              {space.houseCost > 0 && (
                <div className="rounded-lg bg-slate-900/80 p-2">
                  <div className="text-slate-400">Coût bâtiment</div>
                  <div className="tabular-nums font-semibold text-slate-100">
                    {formatCredits(space.houseCost)}
                  </div>
                </div>
              )}
              <div className="rounded-lg bg-slate-900/80 p-2">
                <div className="text-slate-400">Hypothèque / levée</div>
                <div className="tabular-nums font-semibold text-slate-100">
                  {formatCredits(space.mortgageValue)} / {formatCredits(redeemCost)}
                </div>
              </div>
            </div>
          </>
        ) : space.taxAmount > 0 ? (
          <div className="rounded-xl bg-rose-950/40 border border-rose-500/30 p-3 flex justify-between items-center">
            <span className="text-xs text-rose-200">Prélèvement obligatoire</span>
            <span className="tabular-nums font-bold text-rose-300">
              {formatCredits(space.taxAmount)}
            </span>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-800 text-xs">
          <span className="text-slate-400">
            Propriétaire :{' '}
            <strong className="text-slate-100">{ownerName ? ownerName : 'Banque (libre)'}</strong>
          </span>
          {asset?.isMortgaged ? <Badge tone="rose">Hypothéquée</Badge> : null}
          {asset && asset.hotelCount > 0 ? (
            <Badge tone="amber">1 hôtel</Badge>
          ) : asset && asset.houseCount > 0 ? (
            <Badge tone="emerald">{asset.houseCount} maisons</Badge>
          ) : null}
        </div>
      </div>
    </div>
  );
}
