'use client';

import { useState } from 'react';
import type { FeedEvent, PackAlertView, StockAdjustmentView } from '@/lib/lead/types';
import { ERROR_NB, postJson } from './escalation-card';
import type { FeedState } from './use-live-feed';

const time = (iso: string) => new Date(iso).toLocaleTimeString('nb-NO', { timeZone: 'Europe/Oslo', hour: '2-digit', minute: '2-digit', second: '2-digit' });
const STATION_NB: Record<string, string> = { pack: 'Pakking', return: 'Retur', lead: 'Leder', admin: 'Admin', system: 'System' };
const ADJ_REASON_NB: Record<string, string> = { wrong_item_not_shipped: 'Bestilt vare ble aldri sendt', wrong_item_shipped: 'Feil vare ble sendt' };

export function Panel({ title, children, aside }: { title: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <h2 className="text-lg font-semibold">{title}</h2>
        <span className="ml-auto">{aside}</span>
      </div>
      {children}
    </section>
  );
}

export function LiveFeed({ events, state }: { events: FeedEvent[]; state: FeedState }) {
  return (
    <Panel
      title="Live"
      aside={
        <span className={`flex items-center gap-1.5 text-sm ${state === 'live' ? 'text-ok' : 'text-muted'}`} data-testid="feed-state" data-state={state}>
          <span className={`inline-block h-2.5 w-2.5 rounded-full ${state === 'live' ? 'animate-pulse bg-ok' : 'bg-slate-300'}`} />
          {state === 'live' ? 'Tilkoblet' : state === 'connecting' ? 'Kobler til…' : 'Frakoblet'}
        </span>
      }
    >
      <ul className="flex max-h-96 flex-col gap-2 overflow-y-auto text-base" data-testid="live-feed">
        {events.map((e) => (
          <li key={e.id} className="flex gap-2" title={e.summary_en}>
            <time className="shrink-0 font-mono text-sm text-muted">{time(e.at)}</time>
            <span className="shrink-0 text-xs font-semibold uppercase leading-6 text-muted">{STATION_NB[e.station] ?? e.station}</span>
            <span className="leading-snug">{e.summary_nb}</span>
          </li>
        ))}
        {events.length === 0 && <li className="text-muted">Ingen hendelser ennå.</li>}
      </ul>
    </Panel>
  );
}

export function StockAdjustments({ items, onDone }: { items: StockAdjustmentView[]; onDone: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const proposed = items.filter((a) => a.status === 'proposed');
  const decided = items.filter((a) => a.status !== 'proposed').slice(0, 4);
  const decide = async (id: string, decision: 'approve' | 'reject') => {
    setBusy(id);
    setError(null);
    const r = await postJson(`/api/lead/stock-adjustments/${id}/decide`, { decision });
    setBusy(null);
    if (!r.ok) setError(ERROR_NB[r.error] ?? r.error);
    onDone();
  };
  return (
    <Panel title="Lagerkorreksjoner">
      <ul className="flex flex-col gap-3" data-testid="stock-adjustments">
        {proposed.map((a) => (
          <li key={a.id} className="rounded-xl bg-amber-50 p-3" data-testid="stock-adjustment">
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-semibold">{a.name}</span>
              <span className={`font-mono text-xl font-bold ${a.delta > 0 ? 'text-ok' : 'text-bad'}`}>{a.delta > 0 ? `+${a.delta}` : a.delta}</span>
            </div>
            <div className="text-sm text-muted">
              {ADJ_REASON_NB[a.reason] ?? a.reason}
              {a.sourceLabel ? ` · ${a.sourceLabel}` : ''}
            </div>
            <div className="mt-2 flex gap-2">
              <button className="btn-primary flex-1 px-3 text-base" disabled={busy === a.id} onClick={() => decide(a.id, 'approve')}>
                Godkjenn
              </button>
              <button className="btn-secondary flex-1 px-3 text-base" disabled={busy === a.id} onClick={() => decide(a.id, 'reject')}>
                Avvis
              </button>
            </div>
          </li>
        ))}
        {proposed.length === 0 && <li className="text-muted">Ingen forslag til godkjenning.</li>}
        {decided.map((a) => (
          <li key={a.id} className="flex justify-between text-sm text-muted">
            <span>
              {a.sku} {a.delta > 0 ? `+${a.delta}` : a.delta}
            </span>
            <span>{a.status === 'approved' ? 'Godkjent' : 'Avvist'}</span>
          </li>
        ))}
      </ul>
      {error && <p role="alert" className="mt-2 font-semibold text-bad">{error}</p>}
    </Panel>
  );
}

export function PackAlerts({
  alerts,
  products,
  windowDays,
  onDone,
}: {
  alerts: PackAlertView[];
  products: { sku: string; name: string; variantGroup: string | null }[];
  windowDays: number;
  onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [skuA, setSkuA] = useState('');
  const [skuB, setSkuB] = useState('');
  const [note, setNote] = useState('');
  const active = alerts.filter((a) => a.active);
  const cleared = alerts.filter((a) => !a.active).slice(0, 3);
  // Mix-ups happen inside a variant group, so those come first for the second pick.
  const group = products.find((p) => p.sku === skuA)?.variantGroup;
  const second = [...products].sort((x, y) => Number(y.variantGroup === group && !!group) - Number(x.variantGroup === group && !!group));

  const run = async (url: string, body: unknown) => {
    setBusy(true);
    setError(null);
    const r = await postJson(url, body);
    setBusy(false);
    if (!r.ok) {
      setError(ERROR_NB[r.error] ?? r.error);
      return false;
    }
    onDone();
    return true;
  };

  return (
    <Panel title="Pakkevarsler">
      <ul className="flex flex-col gap-3" data-testid="pack-alerts">
        {active.map((a) => (
          <li key={a.id} className="rounded-xl border-2 border-warn bg-amber-50 p-3" data-testid="pack-alert">
            <div className="flex items-start justify-between gap-2">
              <span className="font-semibold">{a.label}</span>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${a.origin === 'auto' ? 'bg-warn text-white' : 'bg-slate-200'}`}>{a.origin === 'auto' ? 'Automatisk' : 'Manuelt'}</span>
            </div>
            <div className="text-sm">{a.reasonNb}</div>
            <div className="mt-1 flex items-center justify-between">
              <span className="text-sm text-muted">
                {a.count} {a.count === 1 ? 'forveksling' : 'forvekslinger'} siste {windowDays} dager · etikettfoto kreves
              </span>
              <button className="rounded-lg border-2 border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold" disabled={busy} onClick={() => run(`/api/lead/alerts/${a.id}/clear`, {})}>
                Fjern
              </button>
            </div>
          </li>
        ))}
        {active.length === 0 && <li className="text-muted">Ingen aktive varsler.</li>}
        {cleared.map((a) => (
          <li key={a.id} className="flex justify-between text-sm text-muted">
            <span>{a.label}</span>
            <span>Fjernet</span>
          </li>
        ))}
      </ul>

      <form
        className="mt-4 flex flex-col gap-2 border-t pt-3"
        onSubmit={async (e) => {
          e.preventDefault();
          if (await run('/api/lead/alerts', { skuA, skuB, note: note.trim() || undefined })) {
            setSkuA('');
            setSkuB('');
            setNote('');
          }
        }}
      >
        <span className="text-sm font-semibold">Nytt varsel for et varepar</span>
        <select value={skuA} onChange={(e) => setSkuA(e.target.value)} className="min-h-11 rounded-lg border px-2" aria-label="Vare 1" required>
          <option value="">Vare 1…</option>
          {products.map((p) => (
            <option key={p.sku} value={p.sku}>
              {p.name}
            </option>
          ))}
        </select>
        <select value={skuB} onChange={(e) => setSkuB(e.target.value)} className="min-h-11 rounded-lg border px-2" aria-label="Vare 2" required>
          <option value="">Vare 2…</option>
          {second
            .filter((p) => p.sku !== skuA)
            .map((p) => (
              <option key={p.sku} value={p.sku}>
                {p.name}
              </option>
            ))}
        </select>
        <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder="Merknad (valgfri)" className="min-h-11 rounded-lg border px-2" aria-label="Merknad" />
        <button className="btn-secondary px-3 text-base" disabled={busy || !skuA || !skuB}>
          Opprett varsel
        </button>
      </form>
      {error && <p role="alert" className="mt-2 font-semibold text-bad">{error}</p>}
    </Panel>
  );
}
