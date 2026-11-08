'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ConversationProvider } from '@elevenlabs/react';
import { Verdict } from '@/components/pack/pack-station';
import { usePackStation, type PackCameraTarget, type PackStation } from '@/components/pack/use-pack-station';
import { PublicHeader } from '@/components/public-header';
import { useVoiceLink } from '@/components/voice/voice-dock';
import { playEarcon } from '@/lib/audio/player';
import { pairKey, pairLabelNb, productMap } from '@/lib/engine/catalog';
import { CONFUSION_THRESHOLD, CONFUSION_WINDOW_DAYS } from '@/lib/engine/constants';
import { countInWindow, recordConfusion } from '@/lib/engine/loop';
import type { ConfusionEvent, Lang, PackAlert, Product } from '@/lib/engine/types';
import { t, type StringKey } from '@/lib/i18n/strings';
import { boxSignature, seenAs, type BoxUnit } from '@/lib/play/camera';
import { imageOf, PLAY_PARCELS, PLAY_PRODUCTS, parcelById, type PlayLesson, type PlayParcel } from '@/lib/play/catalog';
import { createPlayPort } from '@/lib/play/port';
import type { PackView } from '@/lib/pack/types';
import { captureResult } from '@/lib/voice/pack-tools';
import { PlayVoice } from './play-voice';

const PM = productMap(PLAY_PRODUCTS);
const nameOf = (p: Product | undefined, lang: Lang) => (p ? (lang === 'nb' ? p.nameNb : p.nameEn) : '?');
const LESSON: Record<PlayLesson, { title: StringKey; help: StringKey }> = {
  easy: { title: 'lesson_easy', help: 'lessonHelp_easy' },
  colour: { title: 'lesson_colour', help: 'lessonHelp_colour' },
  size: { title: 'lesson_size', help: 'lessonHelp_size' },
  alert: { title: 'lesson_alert', help: 'lessonHelp_alert' },
  big: { title: 'lesson_big', help: 'lessonHelp_big' },
};

function pairText(pair: [string, string], lang: Lang) {
  return lang === 'nb' ? pairLabelNb(pair, PLAY_PRODUCTS) : `${nameOf(PM.get(pair[0]), lang)} / ${nameOf(PM.get(pair[1]), lang)}`;
}

function Pic({ src, alt, className }: { src: string; alt: string; className?: string }) {
  // Static files from public/sample, already sized; plain img keeps them same-origin (CSP).
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} className={className} draggable={false} />;
}

// ------------------------------------------------------------------ session: the loop in small

/** Mix-ups this session. Each packing attempt counts a pair once, like record_pack_mismatch. */
interface Session {
  events: ConfusionEvent[];
  alerts: PackAlert[];
  counted: string[];
  newAlert: PackAlert | null;
}
const EMPTY: Session = { events: [], alerts: [], counted: [], newAlert: null };

function Mixups({ session, lang }: { session: Session; lang: Lang }) {
  const now = new Date();
  const pairs = [...new Map(session.events.map((e) => [pairKey(e.skuPair), e.skuPair])).values()];
  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm" data-testid="mixups">
      <h2 className="text-sm font-bold uppercase tracking-wide text-muted">{t('mixupsTitle', lang)}</h2>
      <p className="mt-1 text-sm text-muted">{t('mixupsHelp', lang).replace('{n}', String(CONFUSION_THRESHOLD))}</p>
      {pairs.length === 0 ? (
        <p className="mt-2 text-base">{t('mixupsNone', lang)}</p>
      ) : (
        <ul className="mt-2 flex flex-col gap-1.5">
          {pairs.map((pair) => {
            const n = countInWindow(session.events, pair, now, CONFUSION_WINDOW_DAYS);
            const alert = session.alerts.some((a) => a.active && pairKey(a.skuPair) === pairKey(pair));
            return (
              <li key={pairKey(pair)} className={`flex items-center justify-between gap-2 rounded-xl px-3 py-2 text-base ${alert ? 'bg-amber-50 font-semibold text-warn' : 'bg-slate-50'}`}>
                <span>
                  {alert && '⚠ '}
                  {pairText(pair, lang)}
                </span>
                <span className="shrink-0 font-mono text-sm">
                  {Math.min(n, CONFUSION_THRESHOLD)}/{CONFUSION_THRESHOLD}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

// ------------------------------------------------------------------ the app

export function PlayApp({ lang: serverLang, voice }: { lang: Lang; voice: boolean }) {
  const [lang, setLang] = useState(serverLang);
  const [fromServer, setFromServer] = useState(serverLang);
  if (serverLang !== fromServer) {
    setFromServer(serverLang);
    setLang(serverLang);
  }
  const [parcelId, setParcelId] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [session, setSession] = useState<Session>(EMPTY);
  const parcel = parcelId ? parcelById(parcelId) : undefined;

  const open = (id: string | null) => {
    setParcelId(id);
    setAttempt((a) => a + 1);
    window.scrollTo({ top: 0 });
  };

  const onMixups = useCallback((attemptKey: string, events: ConfusionEvent[]) => {
    setSession((s) => {
      let { events: ev, alerts, newAlert } = s;
      const counted = [...s.counted];
      for (const e of events) {
        const k = `${attemptKey}|${pairKey(e.skuPair)}`;
        if (counted.includes(k)) continue;
        counted.push(k);
        const r = recordConfusion(ev, alerts, e, new Date(e.at), PLAY_PRODUCTS);
        ev = r.events;
        alerts = r.alerts;
        if (r.newAlert) newAlert = r.newAlert;
      }
      return { events: ev, alerts, counted, newAlert };
    });
  }, []);

  /** The parcel's own alert plus any the visitor's mix-ups raised for its items. */
  const alertsFor = (p: PlayParcel) => {
    const skus = new Set(p.order.lines.map((l) => l.sku));
    const all = [...p.alerts, ...session.alerts.filter((a) => a.active && (skus.has(a.skuPair[0]) || skus.has(a.skuPair[1])))];
    return [...new Map(all.map((a) => [pairKey(a.skuPair), a])).values()];
  };

  const next = () => {
    const i = PLAY_PARCELS.findIndex((p) => p.order.id === parcelId);
    open(PLAY_PARCELS[(i + 1) % PLAY_PARCELS.length].order.id);
  };

  return (
    <div className="flex flex-1 flex-col bg-slate-100" lang={lang}>
      <PublicHeader lang={lang} current="play" onLangChange={setLang} />
      {session.newAlert && (
        <div className="mx-auto mt-3 flex w-full max-w-6xl px-4">
          <p role="alert" className="flex flex-1 items-center justify-between gap-3 rounded-2xl border-2 border-warn bg-amber-50 px-4 py-3 text-base font-semibold text-warn" data-testid="new-alert">
            <span>
              ⚠ {pairText(session.newAlert.skuPair, lang)}: {t('newAlert', lang)}
            </span>
            <button className="shrink-0 text-xl leading-none" aria-label="OK" onClick={() => setSession((s) => ({ ...s, newAlert: null }))}>
              ×
            </button>
          </p>
        </div>
      )}
      {parcel ? (
        <BenchWithVoice
          key={`${parcel.order.id}-${attempt}`}
          parcel={parcel}
          alerts={alertsFor(parcel)}
          attemptKey={`${parcel.order.id}-${attempt}`}
          lang={lang}
          setLang={setLang}
          voice={voice}
          session={session}
          onMixups={onMixups}
          onNext={next}
          onAgain={() => open(parcel.order.id)}
          onPick={() => open(null)}
        />
      ) : (
        <Picker lang={lang} session={session} onOpen={open} />
      )}
    </div>
  );
}

function Picker({ lang, session, onOpen }: { lang: Lang; session: Session; onOpen: (id: string) => void }) {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-4 pb-12">
      <section className="flex flex-col gap-2 pt-4">
        <h1 className="text-4xl font-black tracking-tight">{t('playTitle', lang)}</h1>
        <p className="max-w-2xl text-lg">{t('playIntro', lang)}</p>
        <p className="max-w-2xl text-base text-muted">{t('practiceNote', lang)}</p>
      </section>
      <section>
        <h2 className="mb-3 text-xl font-bold">{t('pickParcel', lang)}</h2>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {PLAY_PARCELS.map((p) => {
            const looks = [...new Set(p.order.lines.map((l) => imageOf(l.sku)))];
            const units = p.order.lines.reduce((n, l) => n + l.qty, 0);
            return (
              <li key={p.order.id}>
                <button
                  onClick={() => onOpen(p.order.id)}
                  className="flex h-full w-full flex-col gap-3 rounded-2xl bg-white p-4 text-left shadow-sm ring-accent transition hover:shadow-md focus-visible:ring-4 active:scale-[0.99]"
                  data-testid="parcel"
                  data-order={p.order.id}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-base text-muted">
                      {t('order', lang)} #{p.order.id}
                    </span>
                    <span className={`rounded-full px-3 py-1 text-sm font-bold ${p.lesson === 'alert' ? 'bg-amber-100 text-warn' : 'bg-blue-50 text-accent'}`}>
                      {t(LESSON[p.lesson].title, lang)}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    {looks.map((src) => (
                      <Pic key={src} src={src} alt="" className="h-20 w-20 rounded-xl bg-slate-50 object-contain p-1" />
                    ))}
                  </div>
                  <p className="text-base">{t(LESSON[p.lesson].help, lang)}</p>
                  <p className="mt-auto text-sm font-semibold text-muted">
                    {units} {t('items', lang)}
                  </p>
                </button>
              </li>
            );
          })}
        </ul>
      </section>
      <Mixups session={session} lang={lang} />
    </main>
  );
}

// ------------------------------------------------------------------ the bench

interface BenchProps {
  parcel: PlayParcel;
  alerts: PackAlert[];
  attemptKey: string;
  lang: Lang;
  setLang: (l: Lang) => void;
  voice: boolean;
  session: Session;
  onMixups: (attemptKey: string, events: ConfusionEvent[]) => void;
  onNext: () => void;
  onAgain: () => void;
  onPick: () => void;
}

function BenchWithVoice(props: BenchProps) {
  const [talk, setTalk] = useState(false);
  const [handsFree, setHandsFree] = useState(false);
  return (
    // Push-to-talk, as at the real station: the mic is muted unless held or hands-free.
    <ConversationProvider isMuted={!(talk || handsFree)}>
      <Bench {...props} mic={{ talk, setTalk, handsFree, setHandsFree }} />
    </ConversationProvider>
  );
}

function Bench({
  parcel,
  alerts,
  attemptKey,
  lang,
  setLang,
  voice,
  session,
  onMixups,
  onNext,
  onAgain,
  onPick,
  mic,
}: BenchProps & { mic: { talk: boolean; setTalk: (v: boolean) => void; handsFree: boolean; setHandsFree: (v: boolean) => void } }) {
  const order = parcel.order;
  const [initial] = useState<PackView>(() => ({ order, orderKey: order.id, products: PLAY_PRODUCTS, settings: {}, alerts, photos: [], scans: [], committed: null }));
  const [box, setBox] = useState<BoxUnit[]>([]);
  const [checkedSig, setCheckedSig] = useState<string | null>(null);
  const [port] = useState(() => createPlayPort({ initialView: initial, onOverview: setCheckedSig }));
  const raw = usePackStation(initial, port);
  // The port reads the box and the view at the moment of a check (a tap or a voice tool call).
  useLayoutEffect(() => port.sync(box, raw.view), [port, box, raw.view]);
  const uid = useRef(0);
  const voiceLink = useVoiceLink();

  // Earcons and the session loop for taps and voice alike (the live station's withEarcons).
  const station: PackStation = {
    ...raw,
    actions: {
      ...raw.actions,
      capture: async (target, image) => {
        playEarcon('shutter');
        const res = await raw.actions.capture(target, image);
        if (res.decision?.status === 'MISMATCH') {
          playEarcon('alert');
          onMixups(attemptKey, res.decision.confusionEvents);
        }
        return res;
      },
      seal: async () => {
        const res = await raw.actions.seal();
        if (res.ok) playEarcon('done');
        return res;
      },
    },
  };

  const { decision, needLabel, sealed, checked, latestPhoto, busy } = raw;
  const status = decision.status;
  const lastStatus = useRef(status);
  useEffect(() => {
    if (status === 'VERIFIED' && lastStatus.current !== 'VERIFIED') playEarcon('chime');
    lastStatus.current = status;
  }, [status]);

  const dirty = checkedSig !== null && boxSignature(box) !== checkedSig;
  const fresh = checked && !dirty && busy !== 'capture';
  const locked = sealed || busy !== null;

  // ---------- taps (told to the coach as "[screen]" updates, like the live station) ----------

  const tap = async (target: PackCameraTarget) => {
    const res = await station.actions.capture(target, null);
    const kind = target.purpose === 'pack_check' ? 'box' : 'label';
    voiceLink.say(`[screen] The visitor pressed the button for the ${kind} check. Result: ${captureResult(raw.view, kind, res, new Date())}`);
  };
  const seal = async () => {
    const res = await station.actions.seal();
    if (res.ok) voiceLink.say(`[screen] The visitor sealed order ${order.id}. The order is done.`);
  };
  const boxText = (b: BoxUnit[]) => (b.length ? b.map((u) => PM.get(u.sku)?.nameEn ?? u.sku).join('; ') : 'nothing');
  const add = (sku: string) => {
    if (locked) return;
    const next = [...box, { uid: `${sku}-${++uid.current}`, sku }];
    setBox(next);
    voiceLink.context(`[screen] The visitor put one ${PM.get(sku)?.nameEn} in the box. The box now holds: ${boxText(next)}.`);
  };
  const remove = (uid: string) => {
    if (locked) return;
    const u = box.find((x) => x.uid === uid);
    const next = box.filter((x) => x.uid !== uid);
    setBox(next);
    voiceLink.context(`[screen] The visitor took ${PM.get(u?.sku ?? '')?.nameEn} out of the box. The box now holds: ${boxText(next)}.`);
  };

  /** How a unit in the box looks after the latest check: what the engine decided about it. */
  const toneOf = (u: BoxUnit): 'ok' | 'bad' | 'warn' | null => {
    if (!fresh) return null;
    const seen = seenAs(u.sku, order);
    const line = seen.inOrder ? decision.lines.find((l) => l.sku === seen.sku) : undefined;
    if (!line) return 'bad';
    if (line.labelSizeMismatch && PM.get(u.sku)?.size !== PM.get(seen.sku)?.size) return 'bad';
    if (line.state === 'extra') return 'bad';
    return status === 'NEEDS_LABEL_PHOTO' && needLabel.includes(seen.sku) ? 'warn' : 'ok';
  };

  const label = fresh && latestPhoto?.purpose === 'label_closeup' ? latestPhoto.label : null;
  const labelOk = !!label?.sizeRead && label.sizeRead === PM.get(label.sku)?.size;
  const cols = Math.max(1, Math.ceil(Math.sqrt(box.length)));
  const inBox = (sku: string) => box.filter((u) => u.sku === sku).length;

  return (
    <main className="mx-auto grid w-full max-w-6xl flex-1 gap-4 p-4 pb-10 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]" data-testid="play-bench" data-status={fresh ? status : dirty ? 'DIRTY' : 'START'}>
      {/* ---------------- order + box ---------------- */}
      <div className="flex min-w-0 flex-col gap-4">
        <section className="rounded-2xl bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h1 className="text-2xl font-bold">
              {t('order', lang)} #{order.id}
            </h1>
            <button className="text-base text-accent underline" onClick={onPick}>
              {t('otherParcel', lang)}
            </button>
          </div>
          {decision.lines.some((l) => l.alertActive) && !sealed && (
            <p className="mt-3 rounded-xl border-2 border-warn bg-amber-50 px-3 py-2 text-base font-semibold text-warn" role="alert" data-testid="alert-banner">
              ⚠ {t('alertBanner', lang)}
            </p>
          )}
          <ul className="mt-3 flex flex-col gap-2">
            {decision.lines.map((l) => {
              const p = PM.get(l.sku);
              const bad = fresh && (l.state !== 'present' || !!l.labelSizeMismatch);
              const note = !fresh
                ? null
                : l.labelSizeMismatch
                  ? `${t('labelShows', lang)} ${l.labelSizeMismatch}`
                  : l.state === 'missing'
                    ? `${t('missing', lang)} ${l.diff}`
                    : l.state === 'extra'
                      ? `${l.diff} ${t('extra', lang)}`
                      : needLabel.includes(l.sku)
                        ? t('needsLabel', lang)
                        : t('correct', lang);
              return (
                <li key={l.sku} className={`flex items-center gap-3 rounded-xl border-2 p-2 ${bad ? 'border-bad' : fresh && note === t('correct', lang) ? 'border-ok' : 'border-gray-200'}`} data-testid="play-line" data-sku={l.sku}>
                  <Pic src={imageOf(l.sku)} alt="" className="h-14 w-14 shrink-0 rounded-lg bg-slate-50 object-contain p-0.5" />
                  <div className="min-w-0 flex-1">
                    <div className="text-base font-semibold leading-tight">{nameOf(p, lang)}</div>
                    <div className="mt-0.5 flex flex-wrap gap-1 text-sm">
                      {p?.size && <span className="rounded-md bg-frame px-1.5 font-bold text-white">{p.size}</span>}
                      <span className="font-mono text-muted">
                        {t('shelf', lang)} {p?.location}
                      </span>
                      {note && <span className={`rounded-full px-2 font-semibold ${bad ? 'bg-red-50 text-bad' : note === t('correct', lang) ? 'bg-green-50 text-ok' : 'bg-amber-50 text-warn'}`}>{note}</span>}
                      {fresh && l.sizeVerified && p?.size && <span className="rounded-full bg-green-50 px-2 text-ok">{t('sizeVerifiedTag', lang)} ✓</span>}
                    </div>
                  </div>
                  <span className={`flex h-11 min-w-11 shrink-0 items-center justify-center rounded-xl px-2 text-lg font-black ${!fresh ? 'bg-slate-100' : bad ? 'bg-bad text-white' : 'bg-ok text-white'}`}>
                    {fresh ? `${l.seen}/${l.ordered}` : `×${l.ordered}`}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="flex flex-col gap-3 rounded-2xl bg-white p-4 shadow-sm">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="text-sm font-bold uppercase tracking-wide text-muted">{t('boxTitle', lang)}</h2>
            {!sealed && box.length > 0 && <span className="text-sm text-muted">{t('boxHint', lang)}</span>}
          </div>

          {sealed ? (
            <div className="flex flex-col items-center gap-3 py-2 text-center" data-testid="sealed">
              <Pic src="/sample/parcel-sealed.webp" alt={t('sealed', lang)} className="h-48 w-48 object-contain" />
              <h2 className="text-2xl font-bold text-ok">✓ {t('sealed', lang)}</h2>
              <p className="text-base">{t('evidenceSaved', lang)}</p>
              <div className="grid w-full gap-2 sm:grid-cols-3">
                <button className="btn-primary" onClick={onNext}>
                  {t('nextOrder', lang)}
                </button>
                <button className="btn-secondary" onClick={onAgain}>
                  {t('packAgain', lang)}
                </button>
                <button className="btn-secondary" onClick={onPick}>
                  {t('otherParcel', lang)}
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="relative mx-auto aspect-square w-full max-w-md select-none">
                <Pic src="/sample/box-open.webp" alt="" className="absolute inset-0 h-full w-full object-contain" />
                <div
                  className="absolute grid gap-1"
                  style={{ top: '24%', bottom: '20%', left: '21%', right: '21%', gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
                  data-testid="box"
                >
                  {box.map((u, k) => {
                    const tone = toneOf(u);
                    const p = PM.get(u.sku);
                    return (
                      <button
                        key={u.uid}
                        onClick={() => remove(u.uid)}
                        disabled={locked}
                        className={`relative flex min-h-0 items-center justify-center rounded-xl transition ${tone === 'bad' ? 'bg-red-500/15 ring-4 ring-bad' : tone === 'warn' ? 'bg-amber-400/15 ring-4 ring-warn' : tone === 'ok' ? 'ring-4 ring-ok' : 'hover:bg-white/30'}`}
                        aria-label={`${nameOf(p, lang)} – ${t('boxHint', lang)}`}
                        data-testid="box-unit"
                        data-sku={u.sku}
                        data-tone={tone ?? 'none'}
                      >
                        <span className="flex h-full w-full items-center justify-center" style={{ transform: `rotate(${((k * 37) % 9) - 4}deg)` }}>
                          <Pic src={imageOf(u.sku)} alt={nameOf(p, lang)} className="h-full max-h-full w-full object-contain drop-shadow-md" />
                        </span>
                        {tone && (
                          <span className={`absolute -right-1 -top-1 flex h-7 w-7 items-center justify-center rounded-full text-base font-black text-white shadow ${tone === 'bad' ? 'bg-bad' : tone === 'warn' ? 'bg-warn' : 'bg-ok'}`}>
                            {tone === 'bad' ? '✕' : tone === 'warn' ? '?' : '✓'}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
                {box.length === 0 && (
                  <p className="absolute inset-x-[24%] top-1/2 -translate-y-1/2 text-center text-base font-semibold text-amber-900/70">{t('boxEmpty', lang)}</p>
                )}
                {busy === 'capture' && (
                  <div className="absolute inset-[18%] flex items-center justify-center rounded-2xl bg-accent/15 ring-4 ring-accent" aria-live="polite">
                    <span className="animate-pulse rounded-full bg-accent px-4 py-2 text-lg font-bold text-white">{t('checking', lang)}</span>
                  </div>
                )}
              </div>

              {dirty && (
                <p className="rounded-xl bg-amber-50 px-4 py-3 text-base font-semibold text-warn" data-testid="box-changed">
                  {t('boxChanged', lang)}
                </p>
              )}
              {fresh && <Verdict d={decision} lang={lang} />}
              {fresh && status === 'MISMATCH' && decision.unexpected.length > 0 && (
                <ul className="flex flex-col gap-1">
                  {decision.unexpected.map((u, k) => (
                    <li key={k} className="rounded-xl bg-red-50 px-3 py-2 text-base font-semibold text-bad">
                      ✕ {t('notInOrder', lang)}: {nameOf(u.sku ? PM.get(u.sku) : undefined, lang)}
                    </li>
                  ))}
                </ul>
              )}
              {label && (
                <div className={`flex items-center gap-3 rounded-xl px-3 py-2 ${labelOk ? 'bg-green-50 text-ok' : 'bg-red-50 text-bad'}`} data-testid="label-result">
                  <span className="flex h-12 w-12 items-center justify-center rounded-lg border-2 border-current bg-white text-xl font-black">{label.sizeRead ?? '?'}</span>
                  <span className="text-base font-semibold">
                    {t('labelShows', lang)} {label.sizeRead ?? '?'} · {nameOf(PM.get(label.sku), lang)}
                  </span>
                </div>
              )}

              <div className="flex flex-col gap-2">
                {!fresh ? (
                  <button className="btn-primary min-h-16 text-2xl" onClick={() => void tap({ purpose: 'pack_check' })} disabled={locked || box.length === 0} data-testid="play-check">
                    {checked ? t('checkAgain', lang) : t('check', lang)}
                  </button>
                ) : decision.canSeal ? (
                  <button className="btn min-h-16 bg-ok text-2xl text-white" onClick={() => void seal()} disabled={locked} data-testid="play-seal">
                    {t('readyToSeal', lang)}
                  </button>
                ) : status === 'NEEDS_LABEL_PHOTO' && needLabel.length > 0 ? (
                  <>
                    <button className="btn min-h-16 bg-warn text-xl text-white" onClick={() => void tap({ purpose: 'label_closeup', sku: needLabel[0] })} disabled={locked} data-testid="play-label">
                      {t('showLabel', lang)}: {nameOf(PM.get(needLabel[0]), lang)}
                    </button>
                    <button className="btn-secondary" onClick={() => void tap({ purpose: 'pack_check' })} disabled={locked}>
                      {t('checkAgain', lang)}
                    </button>
                  </>
                ) : (
                  <button className="btn-primary min-h-16 text-2xl" onClick={() => void tap({ purpose: 'pack_check' })} disabled={locked || box.length === 0} data-testid="play-check">
                    {t('checkAgain', lang)}
                  </button>
                )}
              </div>
            </>
          )}
        </section>
      </div>

      {/* ---------------- shelf + loop ---------------- */}
      <div className="flex min-w-0 flex-col gap-4">
        {voice && (
          <section className="order-2 flex flex-col gap-1 lg:order-none" data-testid="play-voice">
            <p className="px-1 text-sm text-muted">{t('voiceHint', lang)}</p>
            <PlayVoice station={station} lang={lang} onLangChange={setLang} {...mic} />
          </section>
        )}
        <section className="order-1 rounded-2xl bg-white p-4 shadow-sm lg:order-none" aria-labelledby="shelf-title">
          <h2 id="shelf-title" className="text-sm font-bold uppercase tracking-wide text-muted">
            {t('shelfTitle', lang)}
          </h2>
          <p className="mb-3 text-sm text-muted">{t('shelfHint', lang)}</p>
          <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-3">
            {parcel.shelf.map((sku) => {
              const p = PM.get(sku);
              const n = inBox(sku);
              return (
                <li key={sku}>
                  <button
                    onClick={() => add(sku)}
                    disabled={locked}
                    className="relative flex h-full w-full flex-col items-center gap-1 rounded-xl border-2 border-gray-200 bg-white p-2 text-center transition hover:border-accent active:scale-95 disabled:opacity-50"
                    data-testid="shelf-item"
                    data-sku={sku}
                  >
                    <Pic src={imageOf(sku)} alt="" className="aspect-square w-full rounded-lg bg-slate-50 object-contain p-1" />
                    <span className="text-sm font-semibold leading-tight">{nameOf(p, lang)}</span>
                    <span className="flex items-center gap-1 text-xs">
                      {p?.size && <span className="rounded bg-frame px-1.5 text-sm font-bold text-white">{p.size}</span>}
                      <span className="font-mono text-muted">{p?.location}</span>
                    </span>
                    {n > 0 && (
                      <span className="absolute right-1 top-1 rounded-full bg-accent px-2 text-sm font-bold text-white" aria-label={`${n} ${t('inBox', lang)}`}>
                        {n}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
        <div className="order-3 flex flex-col gap-4 lg:order-none">
          <Mixups session={session} lang={lang} />
          <p className="px-1 text-sm text-muted">{t('practiceNote', lang)}</p>
        </div>
      </div>

    </main>
  );
}
