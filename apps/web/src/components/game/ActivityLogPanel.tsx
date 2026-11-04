'use client';

import React, { useState } from 'react';
import type { ActivityCategory, ActivityLogEntry, ChatMessagePayload } from '@capital-city/shared';
import { Button } from '@capital-city/ui';

type LogFilter = 'ALL' | 'DICE' | 'PURCHASE' | 'RENT' | 'AUCTION' | 'TRADE' | 'CARD';

const FILTERS: Array<{ id: LogFilter; label: string; categories?: ActivityCategory[] }> = [
  { id: 'ALL', label: 'Tout' },
  { id: 'DICE', label: 'Dés et mouvements', categories: ['DICE', 'MOVEMENT', 'JAIL'] },
  { id: 'PURCHASE', label: 'Achats et bâti', categories: ['PURCHASE', 'BUILD', 'MORTGAGE'] },
  { id: 'RENT', label: 'Loyers', categories: ['RENT', 'BANKRUPTCY'] },
  { id: 'AUCTION', label: 'Enchères', categories: ['AUCTION'] },
  { id: 'TRADE', label: 'Échanges', categories: ['TRADE'] },
  { id: 'CARD', label: 'Cartes', categories: ['CARD'] },
];

export function ActivityLogPanel({
  entries,
  chatMessages,
  onSendChat,
}: {
  entries: ActivityLogEntry[];
  chatMessages: ChatMessagePayload[];
  onSendChat: (text: string) => void;
}) {
  const [tab, setTab] = useState<'LOG' | 'CHAT'>('LOG');
  const [filter, setFilter] = useState<LogFilter>('ALL');
  const [chatText, setChatText] = useState('');

  const activeFilterDef = FILTERS.find((f) => f.id === filter) ?? FILTERS[0]!;
  const filteredEntries = [...entries]
    .filter((e) =>
      activeFilterDef.categories ? activeFilterDef.categories.includes(e.category) : true,
    )
    .reverse();

  return (
    <section
      data-testid="activity-log-panel"
      className="rounded-2xl border border-slate-800 bg-slate-900/85 p-3.5 space-y-3"
    >
      <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-2">
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={() => setTab('LOG')}
            data-testid="tab-activity-log"
            className={`rounded-lg px-2.5 py-1 text-xs font-semibold cursor-pointer ${
              tab === 'LOG'
                ? 'bg-teal-500/20 text-teal-300 border border-teal-500/40'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Journal ({entries.length})
          </button>
          <button
            type="button"
            onClick={() => setTab('CHAT')}
            data-testid="tab-room-chat"
            className={`rounded-lg px-2.5 py-1 text-xs font-semibold cursor-pointer ${
              tab === 'CHAT'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Discussion ({chatMessages.length})
          </button>
        </div>
      </div>

      {tab === 'LOG' ? (
        <>
          <div className="flex flex-wrap gap-1" role="tablist" aria-label="Filtres du journal">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                role="tab"
                aria-selected={filter === f.id}
                onClick={() => setFilter(f.id)}
                className={`rounded-full px-2 py-0.5 text-[11px] font-medium transition cursor-pointer ${
                  filter === f.id
                    ? 'bg-slate-200 text-slate-950 font-bold'
                    : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div
            data-testid="activity-log-entries"
            className="h-44 overflow-y-auto space-y-1.5 pr-1 text-xs"
          >
            {filteredEntries.length === 0 ? (
              <p className="text-slate-500 py-4 text-center">
                Aucun événement dans cette catégorie.
              </p>
            ) : (
              filteredEntries.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-start justify-between gap-2 rounded-lg bg-slate-950/70 px-2.5 py-1.5 border border-slate-800/70"
                >
                  <span className="text-slate-200 leading-snug">{entry.message}</span>
                  {typeof entry.amount === 'number' && entry.amount > 0 ? (
                    <span className="tabular-nums shrink-0 font-bold text-amber-300">
                      {entry.amount} Cr
                    </span>
                  ) : null}
                </div>
              ))
            )}
          </div>
        </>
      ) : (
        <div className="space-y-2.5">
          <div className="h-40 overflow-y-auto space-y-1.5 rounded-xl bg-slate-950/75 p-2.5 border border-slate-800/80 text-xs">
            {chatMessages.length === 0 ? (
              <p className="text-slate-500 text-center py-4">Aucun message dans la discussion.</p>
            ) : (
              chatMessages.map((m) => (
                <div key={m.id}>
                  <strong className="text-teal-300">{m.senderName} :</strong>{' '}
                  <span className="text-slate-200">{m.text}</span>
                </div>
              ))
            )}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!chatText.trim()) return;
              onSendChat(chatText.trim());
              setChatText('');
            }}
            className="flex gap-2"
          >
            <input
              type="text"
              maxLength={240}
              placeholder="Message aux joueurs…"
              value={chatText}
              onChange={(e) => setChatText(e.target.value)}
              data-testid="game-chat-input"
              className="flex-1 rounded-xl border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-white focus:border-teal-400 focus:outline-none"
            />
            <Button type="submit" variant="secondary" size="sm" disabled={!chatText.trim()}>
              Envoyer
            </Button>
          </form>
        </div>
      )}
    </section>
  );
}
