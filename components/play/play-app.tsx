'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { ConversationProvider } from '@elevenlabs/react';
import { Verdict } from '@/components/pack/pack-station';
import { Banner, Button, Card, Icon, OrderLine, StatusChip, type LineState, type Tone } from '@/components/ui';
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
    <Card eyebrow={t('mixupsTitle', lang)} data-testid="mixups">
      <p className="m-0 text-[16px] leading-[22px] text-ink-2">{t('mixupsHelp', lang).replace('{n}', String(CONFUSION_THRESHOLD))}</p>
      {pairs.length === 0 ? (
        <p className="type-body m-0">{t('mixupsNone', lang)}</p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {pairs.map((pair) => {
            const n = countInWindow(session.events, pair, now, CONFUSION_WINDOW_DAYS);
            const alert = session.alerts.some((a) => a.active && pairKey(a.skuPair) === pairKey(pair));
            return (
              <li key={pairKey(pair)} className={`play-mixup ${alert ? 'play-mixup--alert' : ''}`}>
                <span className="flex items-center gap-2">
                  {alert && <Icon name="warn" className="text-warn" />}
                  {pairText(pair, lang)}
                </span>
                <span className="sp-mono shrink-0">
                  {Math.min(n, CONFUSION_THRESHOLD)}/{CONFUSION_THRESHOLD}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

// ------------------------------------------------------------------ the app

export function PlayApp({ lang: serverLang, voice, initialParcel }: { lang: Lang; voice: boolean; initialParcel?: string }) {
  const [lang, setLang] = useState(serverLang);
  const [fromServer, setFromServer] = useState(serverLang);
  if (serverLang !== fromServer) {
    setFromServer(serverLang);
    setLang(serverLang);
  }
  const [parcelId, setParcelId] = useState<string | null>(initialParcel && parcelById(initialParcel) ? initialParcel : null);
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
    <div className="sp-light flex min-h-dvh flex-1 flex-col bg-surface-2 text-ink" lang={lang}>
      <PublicHeader lang={lang} current="play" onLangChange={setLang} />
      {session.newAlert && (
        <div className="mx-auto mt-4 w-full max-w-6xl px-4">
          <Banner tone="warn" role="alert" data-testid="new-alert" title={pairText(session.newAlert.skuPair, lang)}>
            <span className="flex flex-wrap items-center justify-between gap-2">
              {t('newAlert', lang)}
              <Button variant="quiet" className="min-h-12" onClick={() => setSession((s) => ({ ...s, newAlert: null }))}>
                OK
              </Button>
            </span>
          </Banner>
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
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 pb-12 pt-6">
      <section className="flex flex-col gap-3">
        <h1 className="m-0 text-[34px] font-extrabold leading-[40px] tracking-[-0.025em]">{t('playTitle', lang)}</h1>
        <p className="type-body m-0 max-w-2xl">{t('playIntro', lang)}</p>
        <p className="m-0 max-w-2xl text-[16px] leading-[22px] text-ink-2">{t('practiceNote', lang)}</p>
      </section>
      <section className="flex flex-col gap-3">
        <h2 className="type-title m-0">{t('pickParcel', lang)}</h2>
        <ul className="m-0 grid list-none gap-4 p-0 sm:grid-cols-2 lg:grid-cols-3">
          {PLAY_PARCELS.map((p) => {
            const looks = [...new Set(p.order.lines.map((l) => imageOf(l.sku)))];
            const units = p.order.lines.reduce((n, l) => n + l.qty, 0);
            return (
              <li key={p.order.id}>
                <button onClick={() => onOpen(p.order.id)} className="play-parcel" data-testid="parcel" data-order={p.order.id}>
                  <span className="flex flex-wrap items-center justify-between gap-2">
                    <span className="sp-mono text-[16px] text-ink-2">
                      {t('order', lang)} #{p.order.id}
                    </span>
                    <StatusChip tone={p.lesson === 'alert' ? 'warn' : undefined} icon={p.lesson === 'alert' ? undefined : 'box'} desk>
                      {t(LESSON[p.lesson].title, lang)}
                    </StatusChip>
                  </span>
                  <span className="play-parcel__pics">
                    {looks.map((src) => (
                      <Pic key={src} src={src} alt="" />
                    ))}
                  </span>
                  <span className="text-[17px] leading-[24px]">{t(LESSON[p.lesson].help, lang)}</span>
                  <span className="mt-auto text-[15px] font-semibold text-ink-2">
                    {units} {t('items', lang)}
                  </span>
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

const UNIT_ICON = { ok: 'ok', bad: 'stop', warn: 'warn' } as const;

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

  // The one main action, as at the station: check, show the label, or seal (commits are primary).
  const main: ReactNode = !fresh ? (
    <Button block icon="camera" onClick={() => void tap({ purpose: 'pack_check' })} disabled={locked || box.length === 0} data-testid="play-check">
      {busy === 'capture' ? t('checking', lang) : checked ? t('checkAgain', lang) : t('check', lang)}
    </Button>
  ) : decision.canSeal ? (
    <Button block icon="ok" onClick={() => void seal()} disabled={locked} data-testid="play-seal">
      {t('readyToSeal', lang)}
    </Button>
  ) : status === 'NEEDS_LABEL_PHOTO' && needLabel.length > 0 ? (
    <>
      <Button block icon="label" onClick={() => void tap({ purpose: 'label_closeup', sku: needLabel[0] })} disabled={locked} data-testid="play-label">
        {t('showLabel', lang)}: {nameOf(PM.get(needLabel[0]), lang)}
      </Button>
      <Button block variant="secondary" icon="camera" onClick={() => void tap({ purpose: 'pack_check' })} disabled={locked}>
        {t('checkAgain', lang)}
      </Button>
    </>
  ) : (
    <Button block icon="camera" onClick={() => void tap({ purpose: 'pack_check' })} disabled={locked || box.length === 0} data-testid="play-check">
      {t('checkAgain', lang)}
    </Button>
  );

  return (
    <main
      className="mx-auto grid w-full max-w-6xl flex-1 gap-4 px-4 pb-10 pt-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]"
      data-testid="play-bench"
      data-status={fresh ? status : dirty ? 'DIRTY' : 'START'}
    >
      {/* ---------------- order + box ---------------- */}
      <div className="flex min-w-0 flex-col gap-4">
        <Card>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h1 className="type-title m-0">
              {t('order', lang)} <span className="sp-mono">#{order.id}</span>
            </h1>
            <button className="sp-link min-h-12 bg-transparent text-[16px]" onClick={onPick}>
              {t('otherParcel', lang)}
            </button>
          </div>
          {decision.lines.some((l) => l.alertActive) && !sealed && (
            <Banner tone="warn" role="alert" data-testid="alert-banner">
              {t('alertBanner', lang)}
            </Banner>
          )}
          <ul className="sp-lines" aria-label={t('order', lang)}>
            {decision.lines.map((l) => {
              const p = PM.get(l.sku);
              const bad = fresh && (l.state !== 'present' || !!l.labelSizeMismatch);
              const state: LineState = !fresh ? 'idle' : l.state === 'missing' && !l.labelSizeMismatch ? 'missing' : bad ? 'stop' : needLabel.includes(l.sku) ? 'warn' : 'ok';
              const note: { tone: Tone; text: string; icon?: 'label' } | null = !fresh
                ? null
                : l.labelSizeMismatch
                  ? { tone: 'stop', text: `${t('labelShows', lang)} ${l.labelSizeMismatch}` }
                  : l.state === 'missing'
                    ? { tone: 'stop', text: `${t('missing', lang)} ${l.diff}` }
                    : l.state === 'extra'
                      ? { tone: 'stop', text: `${l.diff} ${t('extra', lang)}` }
                      : needLabel.includes(l.sku)
                        ? { tone: 'warn', text: t('needsLabel', lang), icon: 'label' }
                        : { tone: 'ok', text: t('correct', lang) };
              return (
                <OrderLine
                  key={l.sku}
                  name={nameOf(p, lang)}
                  sku={`${t('shelf', lang)} ${p?.location ?? ''}`}
                  thumb={{ url: imageOf(l.sku) }}
                  qty={fresh ? `${l.seen} ${t('of', lang)} ${l.ordered}` : `× ${l.ordered}`}
                  qtyDone={fresh && !bad && l.seen >= l.ordered}
                  qtyLabel={`${fresh ? l.seen : 0} ${t('of', lang)} ${l.ordered}`}
                  state={state}
                  data-testid="play-line"
                  data-sku={l.sku}
                  foot={
                    note && (
                      <>
                        <StatusChip tone={note.tone} icon={note.icon}>
                          {note.text}
                        </StatusChip>
                        {l.sizeVerified && p?.size && <StatusChip icon="label">{t('sizeVerifiedTag', lang)}</StatusChip>}
                      </>
                    )
                  }
                />
              );
            })}
          </ul>
        </Card>

        <Card eyebrow={t('boxTitle', lang)}>
          {!sealed && box.length > 0 && <p className="m-0 -mt-1 text-[16px] leading-[22px] text-ink-2">{t('boxHint', lang)}</p>}
          {sealed ? (
            <div className="sp-done" data-testid="sealed">
              <Pic src="/sample/parcel-sealed.webp" alt={t('sealed', lang)} className="h-44 w-44 object-contain" />
              <h2 className="type-title m-0 flex items-center gap-2">
                <Icon name="ok" className="text-ok" />
                {t('sealed', lang)}
              </h2>
              <p className="type-body m-0">{t('evidenceSaved', lang)}</p>
              <div className="grid w-full gap-2 sm:grid-cols-3">
                <Button block icon="arrow-right" onClick={onNext}>
                  {t('nextOrder', lang)}
                </Button>
                <Button block variant="secondary" onClick={onAgain}>
                  {t('packAgain', lang)}
                </Button>
                <Button block variant="secondary" onClick={onPick}>
                  {t('otherParcel', lang)}
                </Button>
              </div>
            </div>
          ) : (
            <>
              {fresh && <Verdict d={decision} lang={lang} />}
              <div className="sp-stage">
                <div className="play-box">
                  <Pic src="/sample/box-open.webp" alt="" />
                  <div className="play-box__grid" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }} data-testid="box">
                    {box.map((u, k) => {
                      const tone = toneOf(u);
                      const p = PM.get(u.sku);
                      return (
                        <button
                          key={u.uid}
                          onClick={() => remove(u.uid)}
                          disabled={locked}
                          className={`play-unit ${tone ? `play-unit--${tone}` : ''}`}
                          aria-label={`${nameOf(p, lang)} – ${t('boxHint', lang)}`}
                          data-testid="box-unit"
                          data-sku={u.sku}
                          data-tone={tone ?? 'none'}
                        >
                          <span className="flex h-full w-full items-center justify-center" style={{ transform: `rotate(${((k * 37) % 9) - 4}deg)` }}>
                            <Pic src={imageOf(u.sku)} alt={nameOf(p, lang)} />
                          </span>
                          {tone && (
                            <span className="play-unit__mark" aria-hidden>
                              <Icon name={UNIT_ICON[tone]} />
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                  {box.length === 0 && <p className="play-box__empty">{t('boxEmpty', lang)}</p>}
                </div>
                <div className="sp-stage__meta">
                  <span>
                    {t('order', lang)} {order.id}
                  </span>
                  <span>
                    {box.length} {t('items', lang)}
                  </span>
                </div>
              </div>
              {busy === 'capture' && (
                <p className="sp-busy m-0" aria-live="polite">
                  {t('checking', lang)}
                </p>
              )}
              {dirty && (
                <Banner tone="warn" data-testid="box-changed">
                  {t('boxChanged', lang)}
                </Banner>
              )}
              {fresh && status === 'MISMATCH' && decision.unexpected.length > 0 && (
                <ul className="m-0 flex list-none flex-wrap gap-2 p-0" data-testid="unexpected">
                  {decision.unexpected.map((u, k) => (
                    <li key={k}>
                      <StatusChip tone="stop">
                        {t('notInOrder', lang)}: {nameOf(u.sku ? PM.get(u.sku) : undefined, lang)}
                      </StatusChip>
                    </li>
                  ))}
                </ul>
              )}
              {label && (
                <div className={`play-label ${labelOk ? 'text-ok' : 'text-stop'}`} data-testid="label-result">
                  <span className="play-label__size">{label.sizeRead ?? '?'}</span>
                  <StatusChip tone={labelOk ? 'ok' : 'stop'} icon="label">
                    {t('labelShows', lang)} {label.sizeRead ?? '?'} · {nameOf(PM.get(label.sku), lang)}
                  </StatusChip>
                </div>
              )}
              <div className="flex flex-col gap-2">{main}</div>
            </>
          )}
        </Card>
      </div>

      {/* ---------------- shelf, coach, loop ---------------- */}
      <div className="flex min-w-0 flex-col gap-4">
        {voice && (
          <Card eyebrow={<><Icon name="mic" />{t('voiceHint', lang)}</>} className="order-2 lg:order-none" data-testid="play-voice">
            <PlayVoice station={station} lang={lang} onLangChange={setLang} {...mic} />
          </Card>
        )}
        <Card eyebrow={t('shelfTitle', lang)} className="order-1 lg:order-none" aria-labelledby="shelf-title">
          <p id="shelf-title" className="m-0 text-[16px] leading-[22px] text-ink-2">
            {t('shelfHint', lang)}
          </p>
          <ul className="m-0 grid list-none grid-cols-3 gap-2 p-0 sm:grid-cols-4 lg:grid-cols-3">
            {parcel.shelf.map((sku) => {
              const p = PM.get(sku);
              const n = inBox(sku);
              return (
                <li key={sku}>
                  <button onClick={() => add(sku)} disabled={locked} className="play-tile" data-testid="shelf-item" data-sku={sku}>
                    <Pic src={imageOf(sku)} alt="" />
                    <span className="play-tile__name">{nameOf(p, lang)}</span>
                    <span className="play-tile__meta">
                      {p?.size && <span className="play-size">{p.size}</span>}
                      {p?.location}
                    </span>
                    {n > 0 && (
                      <span className="play-count" aria-label={`${n} ${t('inBox', lang)}`}>
                        {n}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </Card>
        <div className="order-3 flex flex-col gap-4 lg:order-none">
          <Mixups session={session} lang={lang} />
          <p className="m-0 px-1 text-[15px] leading-[21px] text-ink-2">{t('practiceNote', lang)}</p>
        </div>
      </div>
    </main>
  );
}
