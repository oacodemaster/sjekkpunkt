'use client';

import { useState } from 'react';
import { Banner, Button, Icon, StatusChip } from '@/components/ui';
import type { FeedEvent, PackAlertView, StockAdjustmentView } from '@/lib/lead/types';
import { ERROR_NB, postJson } from './escalation-card';
import type { FeedState } from './use-live-feed';

const time = (iso: string) => new Date(iso).toLocaleTimeString('nb-NO', { timeZone: 'Europe/Oslo', hour: '2-digit', minute: '2-digit', second: '2-digit' });
const STATION_NB: Record<string, string> = { pack: 'Pakking', return: 'Retur', lead: 'Leder', admin: 'Admin', system: 'System' };
const ADJ_REASON_NB: Record<string, string> = { wrong_item_not_shipped: 'Bestilt vare ble aldri sendt', wrong_item_shipped: 'Feil vare ble sendt' };
const field = 'sp-input sp-input--desk';

export function Panel({ title, children, aside }: { title: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <section className="sp-card sp-card--desk gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="type-desk-title m-0">{title}</h2>
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
        <span data-testid="feed-state" data-state={state}>
          <StatusChip desk tone={state === 'live' ? 'ok' : undefined} icon={state === 'live' ? 'ok' : 'info'}>
            {state === 'live' ? 'Tilkoblet' : state === 'connecting' ? 'Kobler til …' : 'Frakoblet'}
          </StatusChip>
        </span>
      }
    >
      <ul className="type-dense m-0 flex max-h-96 list-none flex-col gap-2 overflow-y-auto p-0" data-testid="live-feed">
        {events.map((e) => (
          <li key={e.id} className="flex gap-2" title={e.summary_en}>
            <time className="type-code-dense shrink-0 text-ink-2">{time(e.at)}</time>
            <span className="type-dense-strong shrink-0 text-ink-2">{STATION_NB[e.station] ?? e.station}</span>
            <span className="min-w-0">{e.summary_nb}</span>
          </li>
        ))}
        {events.length === 0 && <li className="text-ink-2">Ingen hendelser ennå.</li>}
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
      <ul className="type-dense m-0 flex list-none flex-col gap-3 p-0" data-testid="stock-adjustments">
        {proposed.map((a) => (
          // A proposal from the engine: dashed until the lead approves.
          <li key={a.id} className="flex flex-col gap-2 rounded-lg border-2 border-dashed border-ink-2 p-3" data-testid="stock-adjustment">
            <div className="flex items-baseline justify-between gap-2">
              <span className="type-dense-strong">{a.name}</span>
              <span className="type-code-lg">{a.delta > 0 ? `+${a.delta}` : a.delta}</span>
            </div>
            <div className="text-ink-2">
              {ADJ_REASON_NB[a.reason] ?? a.reason}
              {a.sourceLabel ? ` · ${a.sourceLabel}` : ''}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button desk className="flex-1" disabled={busy === a.id} onClick={() => decide(a.id, 'approve')}>
                Godkjenn
              </Button>
              <Button desk variant="secondary" className="flex-1" disabled={busy === a.id} onClick={() => decide(a.id, 'reject')}>
                Avvis
              </Button>
            </div>
          </li>
        ))}
        {proposed.length === 0 && <li className="text-ink-2">Ingen forslag til godkjenning.</li>}
        {decided.map((a) => (
          <li key={a.id} className="flex justify-between gap-2 text-ink-2">
            <span className="type-code-dense">
              {a.sku} {a.delta > 0 ? `+${a.delta}` : a.delta}
            </span>
            <span>{a.status === 'approved' ? 'Godkjent' : 'Avvist'}</span>
          </li>
        ))}
      </ul>
      {error && (
        <Banner tone="error" role="alert">
          {error}
        </Banner>
      )}
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
      <ul className="type-dense m-0 flex list-none flex-col gap-3 p-0" data-testid="pack-alerts">
        {active.map((a) => (
          <li key={a.id} className="sp-banner sp-banner--warn flex-col gap-2 text-[15px] leading-[22px]" data-testid="pack-alert">
            <div className="flex w-full flex-wrap items-start justify-between gap-2">
              <span className="type-dense-strong flex items-center gap-2">
                <span className="text-warn">
                  <Icon name="warn" />
                </span>
                {a.label}
              </span>
              <StatusChip desk>{a.origin === 'auto' ? 'Automatisk' : 'Manuelt'}</StatusChip>
            </div>
            <div>{a.reasonNb}</div>
            <div className="flex w-full flex-wrap items-center justify-between gap-2">
              <span className="text-ink-2">
                <span className="sp-mono">{a.count}</span> {a.count === 1 ? 'forveksling' : 'forvekslinger'} siste {windowDays} dager · etikettfoto kreves
              </span>
              <Button desk variant="secondary" disabled={busy} onClick={() => run(`/api/lead/alerts/${a.id}/clear`, {})}>
                Fjern
              </Button>
            </div>
          </li>
        ))}
        {active.length === 0 && <li className="text-ink-2">Ingen aktive varsler.</li>}
        {cleared.map((a) => (
          <li key={a.id} className="flex justify-between gap-2 text-ink-2">
            <span>{a.label}</span>
            <span>Fjernet</span>
          </li>
        ))}
      </ul>

      <form
        className="flex flex-col gap-2 border-t-2 border-line pt-3"
        onSubmit={async (e) => {
          e.preventDefault();
          if (await run('/api/lead/alerts', { skuA, skuB, note: note.trim() || undefined })) {
            setSkuA('');
            setSkuB('');
            setNote('');
          }
        }}
      >
        <span className="type-dense-strong">Nytt varsel for et varepar</span>
        <select value={skuA} onChange={(e) => setSkuA(e.target.value)} className={field} aria-label="Vare 1" required>
          <option value="">Vare 1 …</option>
          {products.map((p) => (
            <option key={p.sku} value={p.sku}>
              {p.name}
            </option>
          ))}
        </select>
        <select value={skuB} onChange={(e) => setSkuB(e.target.value)} className={field} aria-label="Vare 2" required>
          <option value="">Vare 2 …</option>
          {second
            .filter((p) => p.sku !== skuA)
            .map((p) => (
              <option key={p.sku} value={p.sku}>
                {p.name}
              </option>
            ))}
        </select>
        <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder="Merknad (valgfri)" className={field} aria-label="Merknad" />
        <Button type="submit" desk variant="secondary" disabled={busy || !skuA || !skuB}>
          Opprett varsel
        </Button>
      </form>
      {error && (
        <Banner tone="error" role="alert">
          {error}
        </Banner>
      )}
    </Panel>
  );
}
