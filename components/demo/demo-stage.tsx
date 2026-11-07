'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { PackStationView } from '@/components/pack/pack-station';
import { usePackStation } from '@/components/pack/use-pack-station';
import { ReturnStationView } from '@/components/returns/return-station';
import { useReturnStation } from '@/components/returns/use-return-station';
import { earconSrc, playEarcon, playLine, preloadAudio, stopLine } from '@/lib/audio/player';
import { EARCONS, voiceLines, type EarconName } from '@/lib/demo/audio';
import { countInWindow, pairKey, pairLabelNb } from '@/lib/engine';
import { DEFAULT_SETTINGS } from '@/lib/engine/constants';
import type { Lang } from '@/lib/engine/types';
import { DEMO_SCRIPT, type DemoEffect, type DemoStep } from '@/lib/demo/script';
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
const SPEAKER_NB: Record<DemoStep['speaker'], string> = { agent: 'Coach', worker: 'Medarbeider', system: 'System', lead: 'Teamleder' };
const SCENES = [
  { prefix: 'PACK', name: 'Pakking' },
  { prefix: 'RET', name: 'Retur' },
  { prefix: 'LOOP', name: 'Løkka lukkes' },
].map((sc, k) => ({ ...sc, n: k + 1, start: DEMO_SCRIPT.findIndex((s) => s.id.startsWith(`${sc.prefix}-`)) }));
const sceneOf = (i: number) => (i < 0 ? null : [...SCENES].reverse().find((sc) => i >= sc.start)!);

/** Steps whose effect happens in the back office. On a phone the stage flips there by itself. */
const OFFICE_FOCUS: Partial<Record<DemoEffect, string>> = { confirm: 'return-record', leadSummary: 'lead-panel', loopAlert: 'insights' };
const LINE_FILES = new Set(voiceLines(DEMO_SCRIPT).map((l) => l.id));
const lineSrc = (id: string) => `/audio/${id}.mp3`;

const time = (iso: string) => new Date(iso).toLocaleTimeString('nb-NO', { timeZone: 'Europe/Oslo', hour: '2-digit', minute: '2-digit', second: '2-digit' });
const nok = (n: number) => `${n.toLocaleString('nb-NO').replace(/ /g, ' ')} kr`;
// Long enough for React to render and refresh stationRef between scripted actions.
const tick = () => new Promise((r) => setTimeout(r, 30));
const isNarrow = () => typeof window !== 'undefined' && window.matchMedia('(max-width: 1023px)').matches;

function Typewriter({ text, animate }: { text: string; animate: boolean }) {
  const [n, setN] = useState(animate ? 0 : text.length);
  useEffect(() => {
    if (!animate) return;
    const id = setInterval(() => setN((k) => (k >= text.length ? (clearInterval(id), k) : k + 2)), 18);
    return () => clearInterval(id);
  }, [text, animate]);
  return <>{text.slice(0, animate ? n : text.length)}</>;
}

function Panel({ title, children, className = '', testId }: { title: string; children: React.ReactNode; className?: string; testId?: string }) {
  return (
    <section className={`flex scroll-mt-2 flex-col rounded-2xl bg-white p-4 shadow lg:min-h-0 ${className}`} data-panel={testId}>
      <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-muted">{title}</h2>
      <div className="flex-1 lg:min-h-0 lg:overflow-auto">{children}</div>
    </section>
  );
}

/** Agent and worker bubbles with an EN or NB line under them. */
function Captions({
  spoken,
  currentId,
  captionLang,
  className,
  testId,
  compact = false,
}: {
  spoken: DemoStep[];
  currentId?: string;
  captionLang: 'en' | 'nb';
  className: string;
  testId?: string;
  compact?: boolean;
}) {
  return (
    <div className={className} aria-live="polite" data-testid={testId}>
      {spoken.map((s, k) => {
        const latest = k === spoken.length - 1 && currentId === s.id;
        return (
          <div key={s.id} className={`rounded-2xl ${compact ? 'px-3 py-1.5' : 'px-4 py-2'} ${s.speaker === 'worker' ? 'ml-8 bg-accent' : 'mr-8 bg-white/15'} ${latest ? '' : 'opacity-60'}`}>
            <div className={`${compact ? 'text-sm' : 'text-base'} leading-snug`}>{s.line}</div>
            {s.lang !== captionLang && (
              <div className={`mt-1 ${compact ? 'text-xs' : 'text-sm'} leading-snug text-slate-300`}>
                <Typewriter text={(captionLang === 'en' ? s.captionEn : s.captionNb) ?? ''} animate={latest} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * The scripted demo: phone frame (the real packing and returns stations on the demo adapters),
 * the mock back office, captions and the director bar. Keys: → / Space next, ← back, R reset,
 * 1 2 3 jump to a scene, D director bar, C captions EN/NB, M mute. On a phone the same run is
 * driven by the bar at the bottom, and the stage flips between the handheld and Holio.
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
  /** Phone only: which half of the stage is on screen */
  const [mobileView, setMobileView] = useState<'phone' | 'office'>('phone');
  /** Director bar: did the current step's voice file play, or is it caption only? */
  const [audioNote, setAudioNote] = useState<'lyd' | 'tekst' | null>(null);
  const busy = useRef(false);
  const lineTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const panels = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Load every sound up front, so nothing waits on the network during the pitch.
    preloadAudio([...(Object.keys(EARCONS) as EarconName[]).map(earconSrc), ...[...LINE_FILES].map(lineSrc)]);
    return () => stopLine();
  }, []);

  const silence = useCallback(() => {
    if (lineTimer.current) clearTimeout(lineTimer.current);
    lineTimer.current = null;
    stopLine();
  }, []);

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

  /** The step's sounds: the earcon first, the voice line after it so the two never overlap. */
  const sound = useCallback(
    (s: DemoStep) => {
      silence();
      if (s.earcon) playEarcon(s.earcon, muted);
      if (!s.line || s.speaker === 'worker') {
        setAudioNote(null);
        return;
      }
      if (!LINE_FILES.has(s.id) || muted) {
        setAudioNote('tekst');
        return;
      }
      const start = () => void playLine(lineSrc(s.id), muted).then((ok) => setAudioNote(ok ? 'lyd' : 'tekst'));
      const wait = s.earcon ? EARCONS[s.earcon].seconds * 1000 : 0;
      if (wait) lineTimer.current = setTimeout(start, wait);
      else start();
    },
    [muted, silence],
  );

  const apply = useCallback(
    async (s: DemoStep, live: boolean) => {
      const st = () => stationRef.current;
      if (live) sound(s);
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
    [resetAll, sound, store],
  );

  // Presses that arrive while a step is still running are queued, never dropped: the
  // operator can tap ahead and the run catches up deterministically.
  const stepRef = useRef(-1);
  const wanted = useRef<number | null>(null);
  const applyRef = useRef(apply);
  useEffect(() => {
    applyRef.current = apply;
  });

  /** Phone: show the half of the stage where the step happens, and scroll to its panel. */
  const showWhere = useCallback((i: number) => {
    if (!isNarrow()) return;
    const target = i >= 0 ? OFFICE_FOCUS[DEMO_SCRIPT[i].effect] : undefined;
    setMobileView(target ? 'office' : 'phone');
    if (target) setTimeout(() => panels.current?.querySelector(`[data-panel="${target}"]`)?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 60);
  }, []);

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
          silence();
          setAudioNote(null);
          await resetAll();
          for (let k = 0; k < to; k++) await applyRef.current(DEMO_SCRIPT[k], false);
        } else {
          for (let k = from + 1; k < to; k++) await applyRef.current(DEMO_SCRIPT[k], false);
        }
        if (to >= 0) await applyRef.current(DEMO_SCRIPT[to], true);
        stepRef.current = to;
        setStep(to);
        showWhere(to);
      }
      wanted.current = null;
    } finally {
      busy.current = false;
      setRunning(false);
    }
  }, [resetAll, showWhere, silence]);

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
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'ArrowRight' || e.key === ' ') {
        e.preventDefault();
        go((c) => c + 1);
      } else if (e.key === 'ArrowLeft') go((c) => c - 1);
      else if (e.key === 'r' || e.key === 'R') go(-1);
      else if (e.key === 'd' || e.key === 'D') setDirector((v) => !v);
      else if (e.key === 'c' || e.key === 'C') setCaptionLang((v) => (v === 'en' ? 'nb' : 'en'));
      else if (e.key === 'm' || e.key === 'M') setMuted((v) => !v);
      else if (['1', '2', '3'].includes(e.key)) go(SCENES[Number(e.key) - 1].start);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go]);

  // M while a line plays stops it.
  useEffect(() => {
    if (muted) silence();
  }, [muted, silence]);

  const spoken = DEMO_SCRIPT.slice(0, step + 1).filter((s) => s.line && s.speaker !== 'lead').slice(-2);
  const current = step >= 0 ? DEMO_SCRIPT[step] : undefined;
  const next = DEMO_SCRIPT[step + 1];
  const scene = sceneOf(step);
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
  const nextLabel = next ? `${next.id} · ${SPEAKER_NB[next.speaker]}${next.lang ? ` (${next.lang.toUpperCase()})` : ''}: ${next.line ?? next.effect}` : 'Slutt. R starter på nytt.';
  const progress = `${step + 1}/${DEMO_SCRIPT.length}`;

  const field = (label: string, value: React.ReactNode, wide = false, big = false) => (
    <div className={wide ? 'col-span-2' : ''}>
      <dt className="text-xs uppercase tracking-wide text-muted">{label}</dt>
      <dd className={big ? 'font-mono text-xl font-bold' : 'text-base leading-snug'}>{value}</dd>
    </div>
  );

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-frame text-white lg:h-screen lg:min-h-[860px]">
      {/* Top bar */}
      <header className="flex flex-wrap items-center gap-2 px-4 py-2 lg:gap-4 lg:px-6 lg:py-3">
        <span className="text-xl font-bold tracking-tight lg:text-2xl">Sjekkpunkt</span>
        <div className="hidden rounded-xl bg-white/10 p-1 text-base lg:flex">
          {(['pack', 'return'] as const).map((k) => (
            <span key={k} className={`rounded-lg px-4 py-1 transition-colors ${stationKind === k ? 'bg-white font-semibold text-frame' : 'text-slate-400'}`} data-testid={`station-${k}`} aria-current={stationKind === k}>
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
        <span className="ml-auto hidden text-sm text-slate-400 lg:inline">{DEMO_DEVICE}</span>
        {step < 0 && (
          <button className="hidden rounded-xl bg-accent px-4 py-2 font-semibold lg:block" onClick={() => go(0)}>
            Start demo →
          </button>
        )}
        {/* Phone: the handheld or the back office */}
        <div className="flex w-full rounded-xl bg-white/10 p-1 text-sm lg:hidden" role="tablist">
          {(['phone', 'office'] as const).map((v) => (
            <button
              key={v}
              role="tab"
              aria-selected={mobileView === v}
              className={`flex-1 rounded-lg px-3 py-1.5 ${mobileView === v ? 'bg-white font-semibold text-frame' : 'text-slate-300'}`}
              onClick={() => setMobileView(v)}
            >
              {v === 'phone' ? (stationKind === 'pack' ? 'Håndholdt · Pakking' : 'Håndholdt · Retur') : 'Holio WMS'}
            </button>
          ))}
        </div>
      </header>

      <div className="flex min-h-0 flex-1 gap-6 overflow-y-auto lg:overflow-hidden lg:px-6 lg:pb-4">
        {/* Phone frame + captions */}
        <div className={`w-full shrink-0 flex-col gap-3 lg:flex lg:w-[420px] ${mobileView === 'phone' ? 'flex' : 'hidden'}`}>
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-white text-foreground lg:rounded-[2.2rem] lg:border-[10px] lg:border-slate-800 lg:shadow-2xl">
            <div className="min-h-0 flex-1 lg:overflow-y-auto">
              {stationKind === 'pack' ? (
                <PackStationView station={pack} lang={lang} captureMode="fixture" />
              ) : (
                <ReturnStationView station={station} lang={lang} captureMode="fixture" />
              )}
            </div>
          </div>
          <Captions spoken={spoken} currentId={current?.id} captionLang={captionLang} className="hidden min-h-[150px] flex-col justify-end gap-2 lg:flex" testId="captions" />
        </div>

        {/* Back office */}
        <div ref={panels} className={`min-h-0 flex-1 flex-col gap-3 px-3 pb-3 text-foreground lg:flex lg:px-0 lg:pb-0 ${mobileView === 'office' ? 'flex' : 'hidden'}`}>
          <div className="hidden text-lg font-semibold text-slate-300 lg:block">Holio WMS (mock)</div>
          <div className="grid gap-3 lg:min-h-0 lg:flex-1 lg:grid-cols-2 lg:grid-rows-[minmax(0,1.12fr)_minmax(0,1fr)] lg:gap-4">
            <Panel title="Hendelseslogg" testId="event-log" className="order-4 lg:order-none">
              <ul className="flex flex-col gap-1.5 text-base" data-testid="event-log">
                {state.events.map((e) => (
                  <li key={e.id} className="flex gap-3" title={e.summaryEn}>
                    <span className="shrink-0 font-mono text-sm text-muted">{time(e.at)}</span>
                    <span className="flex-1">{e.summaryNb}</span>
                    <span className="hidden shrink-0 font-mono text-xs text-muted sm:inline">{e.actor}</span>
                  </li>
                ))}
              </ul>
            </Panel>

            <Panel title="Returkort" testId="return-record" className="order-1 lg:order-none">
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2" data-testid="return-record">
                {field('Retur', <span className="font-mono">{state.view.ret.id}</span>)}
                {field('Ordre', <span className="font-mono">{state.view.order.id}</span>)}
                {field('Lokasjon', decided?.committed.locationCode ?? '—', false, true)}
                {field('Grad', decided?.committed.grade ?? '—', false, true)}
                {field('Tilstand', decided ? (decided.decision.condition.damage === 'none' && decided.decision.condition.stains === 'none' ? 'Som ny' : 'Merker/skade') : '—')}
                {field('Refusjon', decided ? (decided.committed.refundNok === null ? 'Teamleder avgjør' : nok(decided.committed.refundNok)) : '—')}
                {field('Returårsak', state.view.ret.customerReasonNb)}
                {field('Sannsynlig årsak', decided?.committed.cause ? CAUSE_NB[decided.committed.cause] : '—')}
                {field(
                  'Flagg',
                  <span className="flex flex-wrap gap-1">
                    {(decided?.committed.flags ?? []).map((f) => (
                      <span key={f} className={`rounded-full px-2 py-0.5 text-sm font-semibold ${f === 'suspicious_note' ? 'bg-red-50 text-bad' : 'bg-amber-50 text-warn'}`}>
                        {FLAG_NB[f] ?? f}
                      </span>
                    ))}
                    {!decided && '—'}
                  </span>,
                )}
                {field('Lagerkorreksjon', <span className="font-mono text-sm">{decided ? decided.decision.stockProposals.map((s) => `${s.sku} ${s.delta > 0 ? '+' : ''}${s.delta}`).join(' · ') || '—' : '—'}</span>)}
                {field(
                  'Bilder',
                  <span className="flex gap-1">
                    {record?.photos.map((p) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={p.photoId} src={p.url ?? ''} alt={p.purpose} className="h-11 w-11 rounded object-cover" />
                    ))}
                    {!record?.photos.length && '—'}
                  </span>,
                )}
                {field(
                  'Pakkebevis',
                  <span className="flex items-center gap-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={state.view.packEvidence?.photoUrl ?? ''} alt="Pakkebevis" className="h-11 w-11 rounded object-cover" />
                    <span className="text-sm leading-tight">Manuelt bekreftet, størrelse ikke lest</span>
                  </span>,
                )}
              </dl>
            </Panel>

            <Panel title="Forvekslinger siste 7 dager" testId="insights" className={`order-3 lg:order-none ${loopHighlight ? 'animate-pulse ring-4 ring-warn' : ''}`}>
              <ul className="flex flex-col gap-2 text-base" data-testid="insights">
                {pairs.map(({ pair, count }) => {
                  const alert = state.alerts.find((a) => a.active && pairKey(a.skuPair) === pairKey(pair));
                  return (
                    <li key={pairKey(pair)} className={`rounded-xl px-3 py-2 transition-colors ${alert ? 'bg-amber-50 ring-2 ring-warn' : 'bg-slate-50'}`}>
                      <div className="flex justify-between">
                        <span className="font-semibold">{pairLabelNb(pair, PRODUCTS)}</span>
                        <span className="font-mono text-lg font-bold">{count}</span>
                      </div>
                      {alert && <div className="text-sm font-semibold text-warn">Pakkevarsel aktivt: etikettfoto kreves</div>}
                    </li>
                  );
                })}
              </ul>
            </Panel>

            <Panel title="Teamleder" testId="lead-panel" className="order-2 lg:order-none">
              <ul className="flex flex-col gap-3" data-testid="lead-panel">
                {state.leadCards.map((c) => {
                  const spokenCard = leadPlaying && c.reason === 'suspicious_note';
                  return (
                    <li key={c.id} className="rounded-xl border-2 border-warn p-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-warn">{REASON_NB[c.reason] ?? c.reason}</span>
                        <button
                          className="shrink-0 rounded-full bg-frame px-3 py-1 text-sm text-white"
                          onClick={() => {
                            setLeadPlaying(true);
                            void playLine(lineSrc(leadLine.id), muted);
                          }}
                          aria-label="Spill av oppsummering"
                        >
                          ▶ Spill av
                        </button>
                      </div>
                      <p className="mt-1 text-[15px] leading-snug">{spokenCard ? leadLine.line : c.summaryNb}</p>
                      {spokenCard && captionLang === 'en' && <p className="mt-1 text-sm leading-snug text-muted">{leadLine.captionEn}</p>}
                    </li>
                  );
                })}
                {state.leadCards.length === 0 && <li className="text-muted">Ingen saker.</li>}
              </ul>
            </Panel>
          </div>
        </div>
      </div>

      {/* Phone: the latest line and the controls (there are no keys on a phone) */}
      <div className="border-t border-white/10 bg-black/60 px-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 lg:hidden" data-testid="mobile-bar">
        <Captions spoken={spoken.slice(-1)} currentId={current?.id} captionLang={captionLang} className="mb-2 flex max-h-36 flex-col overflow-y-auto" compact />
        <div className="flex items-center gap-2">
          <button className="h-12 w-12 rounded-xl bg-white/10 text-xl disabled:opacity-40" onClick={() => go((c) => c - 1)} disabled={step < 0} aria-label="Forrige steg">
            ←
          </button>
          <button className="flex min-w-0 flex-1 flex-col items-start rounded-xl px-2 text-left" onClick={() => setDirector((v) => !v)} aria-expanded={director} aria-label="Regi">
            <span className="font-mono text-sm font-bold" data-testid="mobile-step">
              {current?.id ?? 'START'} <span className="font-normal text-slate-400">{progress}</span>
              {running && <span className="ml-1 animate-pulse" data-testid="step-running">…</span>}
            </span>
            <span className="w-full truncate text-xs text-slate-400">{scene ? `Scene ${scene.n} · ${scene.name}` : 'Trykk → for å starte'}</span>
          </button>
          <button className="h-12 min-w-24 rounded-xl bg-accent px-4 text-lg font-semibold disabled:opacity-40" onClick={() => go((c) => c + 1)} disabled={step >= DEMO_SCRIPT.length - 1} aria-label="Neste steg">
            {step < 0 ? 'Start →' : '→'}
          </button>
        </div>
        {director && (
          <div className="mt-2 flex flex-col gap-2 text-sm">
            <p className="text-slate-300">Neste: {nextLabel}</p>
            <div className="flex flex-wrap gap-2">
              {SCENES.map((sc) => (
                <button key={sc.n} className="rounded-lg bg-white/10 px-3 py-1.5" onClick={() => go(sc.start)}>
                  {sc.n} {sc.name}
                </button>
              ))}
              <button className="rounded-lg bg-white/10 px-3 py-1.5" onClick={() => go(-1)}>
                Nullstill
              </button>
              <button className="rounded-lg bg-white/10 px-3 py-1.5" onClick={() => setMuted((v) => !v)}>
                {muted ? 'Lyd på' : 'Lyd av'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Director bar (projector; hidden by default, D toggles) */}
      {director && (
        <footer className="hidden flex-col border-t border-white/10 bg-black/70 text-sm lg:flex" data-testid="director">
          <div className="h-1 bg-white/10">
            <div className="h-1 bg-accent transition-all" style={{ width: `${((step + 1) / DEMO_SCRIPT.length) * 100}%` }} />
          </div>
          <div className="flex items-center gap-4 px-6 py-2">
            <span className="font-mono font-bold" data-testid="director-step">
              {current?.id ?? 'START'}
            </span>
            <span className="font-mono text-slate-400">{progress}</span>
            <span className="text-slate-400">{scene ? `Scene ${scene.n} · ${scene.name}` : 'Klar'}</span>
            {audioNote && (
              <span className={`rounded px-1.5 py-0.5 text-xs ${audioNote === 'lyd' ? 'bg-ok/30' : 'bg-white/10 text-slate-400'}`} data-testid="director-audio">
                {audioNote}
              </span>
            )}
            <span className="min-w-0 flex-1 truncate text-slate-300" title={nextLabel}>
              Neste: {nextLabel}
            </span>
            {running && <span className="animate-pulse" data-testid="step-running">…</span>}
            <button className="rounded bg-white/10 px-3 py-1" onClick={() => go((c) => c - 1)} aria-label="Forrige steg">
              ←
            </button>
            <button className="rounded bg-white/10 px-3 py-1" onClick={() => go((c) => c + 1)} aria-label="Neste steg">
              →
            </button>
            <button className="rounded bg-white/10 px-3 py-1" onClick={() => go(-1)}>
              R
            </button>
            <span className="text-slate-500">1 2 3 scene · C tekst · M lyd · D skjul</span>
          </div>
        </footer>
      )}
    </div>
  );
}
