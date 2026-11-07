'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { PackStationView } from '@/components/pack/pack-station';
import { usePackStation } from '@/components/pack/use-pack-station';
import { ReturnStationView } from '@/components/returns/return-station';
import { useReturnStation } from '@/components/returns/use-return-station';
import { countInWindow, pairKey, pairLabelNb } from '@/lib/engine';
import { DEFAULT_SETTINGS } from '@/lib/engine/constants';
import type { Lang } from '@/lib/engine/types';
import { DEMO_SCRIPT, type DemoStep } from '@/lib/demo/script';
import { PRODUCTS } from '@/lib/demo/seed';
import { createDemoStore, DEMO_DEVICE, type DemoState } from '@/lib/demo/store';
import { escalationSummaryNb } from '@/lib/returns/summary';

const CAUSE_NB: Record<string, string> = {
  likely_warehouse_error: 'Sannsynlig pakkefeil',
  inconclusive: 'Uklar',
  unknown: 'Ukjent',
  customer_side: 'Kundens side',
};
const FLAG_NB: Record<string, string> = { suspicious_note: 'Mistenkelig kundelapp', wrong_item: 'Feil vare', late_return: 'For sen retur' };
const REASON_NB: Record<string, string> = {
  suspicious_note: 'Mistenkelig kundelapp',
  wrong_item_inconclusive: 'Feil vare, uklar årsak',
  customer_caused_damage: 'Skade fra kunden',
  low_confidence_after_retakes: 'Usikker identifisering',
  late_return: 'For sen retur',
  worker_request: 'Sendt av medarbeider',
};
const time = (iso: string) => new Date(iso).toLocaleTimeString('nb-NO', { timeZone: 'Europe/Oslo', hour: '2-digit', minute: '2-digit', second: '2-digit' });
const nok = (n: number) => `${n.toLocaleString('nb-NO').replace(/ /g, ' ')} kr`;
// Long enough for React to render and refresh stationRef between scripted actions.
const tick = () => new Promise((r) => setTimeout(r, 30));

/** Plays a file if it exists. A missing file never breaks the run (brief section 13). */
function play(src: string, muted: boolean) {
  if (muted) return;
  const a = new Audio(src);
  a.play().catch(() => {});
}

function Typewriter({ text, animate }: { text: string; animate: boolean }) {
  const [n, setN] = useState(animate ? 0 : text.length);
  useEffect(() => {
    if (!animate) return;
    const id = setInterval(() => setN((k) => (k >= text.length ? (clearInterval(id), k) : k + 2)), 18);
    return () => clearInterval(id);
  }, [text, animate]);
  return <>{text.slice(0, animate ? n : text.length)}</>;
}

function Panel({ title, children, className = '' }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`flex min-h-0 flex-col rounded-2xl bg-white p-4 shadow ${className}`}>
      <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-muted">{title}</h2>
      <div className="min-h-0 flex-1 overflow-auto">{children}</div>
    </section>
  );
}

/**
 * The scripted demo: phone frame (the real packing and returns stations on the demo adapters),
 * the mock back office, captions and the director bar. Keys: → / Space next, ← back, R reset,
 * D director bar, C captions EN/NB, M mute.
 */
export function DemoStage() {
  const store = useMemo(() => createDemoStore(), []);
  const state = useSyncExternalStore<DemoState>(store.subscribe, store.getState, store.getState);
  const station = useReturnStation(state.view, store.port, store.now);
  const stationRef = useRef(station);
  const pack = usePackStation(state.packView, store.packPort, store.now);
  const packRef = useRef(pack);
  useEffect(() => {
    stationRef.current = station;
    packRef.current = pack;
  });
  const [stationKind, setStationKind] = useState<'pack' | 'return'>('pack');

  const [step, setStep] = useState(-1);
  const [lang, setLang] = useState<Lang>('nb');
  const [captionLang, setCaptionLang] = useState<'en' | 'nb'>('en');
  const [director, setDirector] = useState(false);
  const [muted, setMuted] = useState(false);
  const [running, setRunning] = useState(false);
  const [leadPlaying, setLeadPlaying] = useState(false);
  /** LOOP-01: the insights panel pulses on the new alert */
  const [loopHighlight, setLoopHighlight] = useState(false);
  const busy = useRef(false);

  /** Back to seed: both stations, the back office, the language and the lead panel. */
  const resetAll = useCallback(async () => {
    store.reset();
    await tick();
    stationRef.current.actions.reset(store.getState().view);
    packRef.current.actions.reset(store.getState().packView);
    setStationKind('pack');
    setLang('nb');
    setLeadPlaying(false);
    setLoopHighlight(false);
  }, [store]);

  const apply = useCallback(
    async (s: DemoStep, live: boolean) => {
      const st = () => stationRef.current;
      if (live && s.earcon) play(`/audio/${s.earcon}.mp3`, muted);
      if (live && s.line && s.speaker !== 'worker') play(`/audio/${s.id}.mp3`, muted);
      switch (s.effect) {
        case 'loadOrder':
          await resetAll();
          break;
        case 'showOrder':
        case 'showPackResult':
          break;
        case 'capturePack':
          // "Sjekker…" for 1.5 s on stage (brief PACK-04); instant when replaying.
          store.setCaptureDelay(live ? 1500 : 0);
          await packRef.current.actions.capture({ purpose: 'pack_check' }, null);
          store.setCaptureDelay(0);
          break;
        case 'loadReturn':
          setStationKind('return');
          st().actions.reset(store.getState().view);
          setLang('nb');
          setLeadPlaying(false);
          break;
        case 'switchLang':
          if (s.lang) setLang(s.lang);
          break;
        case 'askLabel':
          // The quiet front shot R2 needs (docs/decisions.md), then the stepper on Etikett.
          st().actions.start();
          await tick();
          await st().actions.capture('front', null);
          await tick();
          st().actions.selectStep('label');
          break;
        case 'captureLabel':
          st().actions.selectStep('label');
          await tick();
          await st().actions.capture('label', null);
          break;
        case 'labelFindings':
          st().actions.setPhase('findings');
          break;
        case 'workerNoDamage':
          st().actions.setPhase('findings');
          await tick();
          st().actions.setWorker({ damage: 'none', stains: 'none' });
          break;
        case 'showDecision':
          st().actions.setPhase('decision');
          break;
        case 'captureNote':
          st().actions.selectStep('customer_note');
          await tick();
          await st().actions.capture('customer_note', null);
          break;
        case 'flagNote': {
          st().actions.setPhase('decision');
          await tick();
          const d = st().decision;
          if (d.suspiciousNote) {
            store.addLeadCard('suspicious_note', escalationSummaryNb('suspicious_note', { returnId: '1043', decision: d, products: PRODUCTS }));
          }
          break;
        }
        case 'confirm':
          st().actions.setPhase('decision');
          await tick();
          await st().actions.confirm();
          break;
        case 'leadSummary':
          setLeadPlaying(true);
          break;
        case 'loopAlert':
          setLoopHighlight(true);
          break;
        case 'loadAlertOrder':
          // Order 2311 with the alert the loop opened. The overview shot is quiet (like RET-03's
          // front shot): the jacket is there, the size is not visible, so the banner asks for the label.
          store.loadPackOrder('2311');
          await tick();
          packRef.current.actions.reset(store.getState().packView);
          setStationKind('pack');
          setLang('pl');
          setLoopHighlight(false);
          await tick();
          await packRef.current.actions.capture({ purpose: 'pack_check' }, null);
          break;
        case 'capturePackLabel':
          store.setCaptureDelay(live ? 1500 : 0);
          await packRef.current.actions.capture({ purpose: 'label_closeup', sku: 'JK-SHELL-L' }, null);
          store.setCaptureDelay(0);
          break;
      }
      await tick();
    },
    [muted, resetAll, store],
  );

  // Presses that arrive while a step is still running are queued, never dropped: the
  // operator can tap ahead and the run catches up deterministically.
  const stepRef = useRef(-1);
  const wanted = useRef<number | null>(null);
  const applyRef = useRef(apply);
  useEffect(() => {
    applyRef.current = apply;
  });

  const run = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setRunning(true);
    try {
      while (wanted.current !== null && wanted.current !== stepRef.current) {
        const to = wanted.current;
        const from = stepRef.current;
        if (to < from || from < 0) {
          // Back and reset replay from seed, so every step is reproducible.
          await resetAll();
          for (let k = 0; k < to; k++) await applyRef.current(DEMO_SCRIPT[k], false);
        } else {
          for (let k = from + 1; k < to; k++) await applyRef.current(DEMO_SCRIPT[k], false);
        }
        if (to >= 0) await applyRef.current(DEMO_SCRIPT[to], true);
        stepRef.current = to;
        setStep(to);
      }
      wanted.current = null;
    } finally {
      busy.current = false;
      setRunning(false);
    }
  }, [resetAll]);

  /** Go to a step (absolute) or move by a delta from wherever the queue will be. */
  const go = useCallback(
    (target: number | ((current: number) => number)) => {
      const base = wanted.current ?? stepRef.current;
      const to = typeof target === 'function' ? target(base) : target;
      wanted.current = Math.max(-1, Math.min(to, DEMO_SCRIPT.length - 1));
      if (to === -1 && stepRef.current === -1) stepRef.current = -2; // R at START still resets
      void run();
    },
    [run],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') return;
      if (e.key === 'ArrowRight' || e.key === ' ') {
        e.preventDefault();
        go((c) => c + 1);
      } else if (e.key === 'ArrowLeft') go((c) => c - 1);
      else if (e.key === 'r' || e.key === 'R') go(-1);
      else if (e.key === 'd' || e.key === 'D') setDirector((v) => !v);
      else if (e.key === 'c' || e.key === 'C') setCaptionLang((v) => (v === 'en' ? 'nb' : 'en'));
      else if (e.key === 'm' || e.key === 'M') setMuted((v) => !v);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go]);

  const spoken = DEMO_SCRIPT.slice(0, step + 1).filter((s) => s.line && s.speaker !== 'lead').slice(-2);
  const next = DEMO_SCRIPT[step + 1];
  const record = state.view.items[0];
  const decided = record ? state.decided[record.id] : undefined;
  const now = store.now();
  const pairs = useMemo(() => {
    const keys = new Map<string, [string, string]>();
    for (const e of state.confusion) keys.set(pairKey(e.skuPair), e.skuPair);
    return [...keys.values()]
      .map((p) => ({ pair: p, count: countInWindow(state.confusion, p, now, DEFAULT_SETTINGS.confusionWindowDays) }))
      .filter((p) => p.count > 0)
      .sort((a, b) => b.count - a.count);
  }, [state.confusion, now]);
  const leadLine = DEMO_SCRIPT.find((s) => s.id === 'RET-11')!;

  return (
    <div className="flex h-screen min-h-[860px] flex-col bg-frame text-white">
      {/* Top bar */}
      <header className="flex items-center gap-4 px-6 py-3">
        <span className="text-2xl font-bold tracking-tight">Sjekkpunkt</span>
        <div className="flex rounded-xl bg-white/10 p-1 text-base">
          {(['pack', 'return'] as const).map((k) => (
            <span key={k} className={`rounded-lg px-4 py-1 ${stationKind === k ? 'bg-white font-semibold text-frame' : 'text-slate-400'}`} data-testid={`station-${k}`} aria-current={stationKind === k}>
              {k === 'pack' ? 'Pakking' : 'Retur'}
            </span>
          ))}
        </div>
        <span className="rounded-md bg-warn px-2 py-0.5 text-sm font-bold">DEMO</span>
        <span className="rounded-full bg-white/15 px-3 py-1 font-semibold" aria-label="worker language" data-testid="lang-chip">
          {lang.toUpperCase()}
        </span>
        <button className="rounded-full bg-white/15 px-3 py-1 text-sm" onClick={() => setCaptionLang((v) => (v === 'en' ? 'nb' : 'en'))}>
          Tekst: {captionLang.toUpperCase()}
        </button>
        {muted && <span className="text-sm text-slate-400">Lyd av</span>}
        <span className="ml-auto text-sm text-slate-400">{DEMO_DEVICE}</span>
        {step < 0 && (
          <button className="rounded-xl bg-accent px-4 py-2 font-semibold" onClick={() => go(0)}>
            Start demo →
          </button>
        )}
      </header>

      <div className="flex min-h-0 flex-1 gap-6 px-6 pb-4">
        {/* Phone frame + captions */}
        <div className="flex w-[420px] shrink-0 flex-col gap-3">
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[2.2rem] border-[10px] border-slate-800 bg-white text-foreground shadow-2xl">
            <div className="min-h-0 flex-1 overflow-y-auto">
              {stationKind === 'pack' ? (
                <PackStationView station={pack} lang={lang} captureMode="fixture" />
              ) : (
                <ReturnStationView station={station} lang={lang} captureMode="fixture" />
              )}
            </div>
          </div>
          <div className="flex min-h-[150px] flex-col justify-end gap-2" aria-live="polite" data-testid="captions">
            {spoken.map((s, k) => {
              const latest = k === spoken.length - 1 && DEMO_SCRIPT[step]?.id === s.id;
              return (
                <div key={s.id} className={`rounded-2xl px-4 py-2 ${s.speaker === 'worker' ? 'ml-8 bg-accent' : 'mr-8 bg-white/15'} ${latest ? '' : 'opacity-60'}`}>
                  <div className="text-base leading-snug">{s.line}</div>
                  {s.lang !== captionLang && (
                    <div className="mt-1 text-sm leading-snug text-slate-300">
                      <Typewriter text={(captionLang === 'en' ? s.captionEn : s.captionNb) ?? ''} animate={latest} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Back office */}
        <div className="flex min-h-0 flex-1 flex-col gap-3 text-foreground">
          <div className="text-lg font-semibold text-slate-300">Holio WMS (mock)</div>
          <div className="grid min-h-0 flex-1 grid-cols-2 grid-rows-2 gap-4">
            <Panel title="Hendelseslogg">
              <ul className="flex flex-col gap-1.5 text-base" data-testid="event-log">
                {state.events.map((e) => (
                  <li key={e.id} className="flex gap-3" title={e.summaryEn}>
                    <span className="shrink-0 font-mono text-sm text-muted">{time(e.at)}</span>
                    <span className="flex-1">{e.summaryNb}</span>
                    <span className="shrink-0 font-mono text-xs text-muted">{e.actor}</span>
                  </li>
                ))}
              </ul>
            </Panel>

            <Panel title="Returkort">
              <dl className="grid grid-cols-[9rem_1fr] gap-x-4 gap-y-1.5 text-base" data-testid="return-record">
                <dt className="text-muted">Retur</dt>
                <dd className="font-mono">{state.view.ret.id}</dd>
                <dt className="text-muted">Ordre</dt>
                <dd className="font-mono">{state.view.order.id}</dd>
                <dt className="text-muted">Returårsak</dt>
                <dd>{state.view.ret.customerReasonNb}</dd>
                <dt className="text-muted">Lokasjon</dt>
                <dd className="font-mono text-xl font-bold">{decided?.committed.locationCode ?? '—'}</dd>
                <dt className="text-muted">Grad</dt>
                <dd className="text-xl font-bold">{decided?.committed.grade ?? '—'}</dd>
                <dt className="text-muted">Tilstand</dt>
                <dd>{decided ? (decided.decision.condition.damage === 'none' && decided.decision.condition.stains === 'none' ? 'Som ny' : 'Merker/skade') : '—'}</dd>
                <dt className="text-muted">Refusjon</dt>
                <dd>{decided ? (decided.committed.refundNok === null ? 'Teamleder avgjør' : nok(decided.committed.refundNok)) : '—'}</dd>
                <dt className="text-muted">Sannsynlig årsak</dt>
                <dd>{decided?.committed.cause ? CAUSE_NB[decided.committed.cause] : '—'}</dd>
                <dt className="text-muted">Flagg</dt>
                <dd className="flex flex-wrap gap-1">
                  {(decided?.committed.flags ?? []).map((f) => (
                    <span key={f} className={`rounded-full px-2 py-0.5 text-sm font-semibold ${f === 'suspicious_note' ? 'bg-red-50 text-bad' : 'bg-amber-50 text-warn'}`}>
                      {FLAG_NB[f] ?? f}
                    </span>
                  ))}
                  {!decided && '—'}
                </dd>
                <dt className="text-muted">Lagerkorreksjon</dt>
                <dd className="font-mono text-sm">{decided ? decided.decision.stockProposals.map((s) => `${s.sku} ${s.delta > 0 ? '+' : ''}${s.delta}`).join(' · ') || '—' : '—'}</dd>
                <dt className="text-muted">Bilder</dt>
                <dd className="flex gap-1">
                  {record?.photos.map((p) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={p.photoId} src={p.url ?? ''} alt={p.purpose} className="h-12 w-12 rounded object-cover" />
                  ))}
                </dd>
                <dt className="text-muted">Pakkebevis</dt>
                <dd className="flex items-center gap-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={state.view.packEvidence?.photoUrl ?? ''} alt="Pakkebevis" className="h-12 w-12 rounded object-cover" />
                  <span className="text-sm">Manuelt bekreftet, størrelse ikke lest</span>
                </dd>
              </dl>
            </Panel>

            <Panel title="Forvekslinger siste 7 dager" className={loopHighlight ? 'animate-pulse ring-4 ring-warn' : ''}>
              <ul className="flex flex-col gap-2 text-base" data-testid="insights">
                {pairs.map(({ pair, count }) => {
                  const alert = state.alerts.find((a) => a.active && pairKey(a.skuPair) === pairKey(pair));
                  return (
                    <li key={pairKey(pair)} className={`rounded-xl px-3 py-2 ${alert ? 'bg-amber-50 ring-2 ring-warn' : 'bg-slate-50'}`}>
                      <div className="flex justify-between">
                        <span className="font-semibold">{pairLabelNb(pair, PRODUCTS)}</span>
                        <span className="font-mono">{count}</span>
                      </div>
                      {alert && <div className="text-sm font-semibold text-warn">Pakkevarsel aktivt: etikettfoto kreves</div>}
                    </li>
                  );
                })}
              </ul>
            </Panel>

            <Panel title="Teamleder">
              <ul className="flex flex-col gap-3" data-testid="lead-panel">
                {state.leadCards.map((c) => (
                  <li key={c.id} className="rounded-xl border-2 border-warn p-3">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-warn">{REASON_NB[c.reason] ?? c.reason}</span>
                      <button
                        className="rounded-full bg-frame px-3 py-1 text-sm text-white"
                        onClick={() => {
                          setLeadPlaying(true);
                          play(`/audio/${leadLine.id}.mp3`, muted);
                        }}
                        aria-label="Spill av oppsummering"
                      >
                        ▶ Spill av
                      </button>
                    </div>
                    <p className="mt-1 text-base">{leadPlaying && c.reason === 'suspicious_note' ? leadLine.line : c.summaryNb}</p>
                    {leadPlaying && c.reason === 'suspicious_note' && captionLang === 'en' && <p className="mt-1 text-sm text-muted">{leadLine.captionEn}</p>}
                  </li>
                ))}
                {state.leadCards.length === 0 && <li className="text-muted">Ingen saker.</li>}
              </ul>
            </Panel>
          </div>
        </div>
      </div>

      {/* Director bar (hidden by default, D toggles) */}
      {director && (
        <footer className="flex items-center gap-4 border-t border-white/10 bg-black/60 px-6 py-2 text-sm" data-testid="director">
          <span className="font-mono font-bold" data-testid="director-step">{step >= 0 ? DEMO_SCRIPT[step].id : 'START'}</span>
          <span className="flex-1 truncate text-slate-300">
            Neste: {next ? `${next.id} ${next.line ?? `(${next.effect})`}` : 'slutt'}
          </span>
          {running && <span className="animate-pulse">…</span>}
          <button className="rounded bg-white/10 px-3 py-1" onClick={() => go((c) => c - 1)}>
            ←
          </button>
          <button className="rounded bg-white/10 px-3 py-1" onClick={() => go((c) => c + 1)}>
            →
          </button>
          <button className="rounded bg-white/10 px-3 py-1" onClick={() => go(-1)}>
            R
          </button>
          <span className="text-slate-500">C tekst · M lyd · D skjul</span>
        </footer>
      )}
    </div>
  );
}
