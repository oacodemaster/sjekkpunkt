'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Camera } from '@/components/camera';
import { productMap } from '@/lib/engine/catalog';
import type { Box2d, Grade, Lang, PhotoPurpose, Product, Severity } from '@/lib/engine/types';
import { t, type StringKey } from '@/lib/i18n/strings';
import type { StationPhoto } from '@/lib/returns/types';
import type { ReturnStation } from './use-return-station';

const STEP_KEY: Record<PhotoPurpose, StringKey> = {
  front: 'stepFront',
  label: 'stepLabel',
  damage: 'stepDamage',
  customer_note: 'stepNote',
  packaging: 'stepPackaging',
};
const HINT_KEY: Record<PhotoPurpose, StringKey> = {
  front: 'hintFront',
  label: 'hintLabel',
  damage: 'hintDamage',
  customer_note: 'hintNote',
  packaging: 'hintPackaging',
};
const CAUSE_KEY: Record<string, StringKey> = {
  likely_warehouse_error: 'causeWarehouse',
  inconclusive: 'causeInconclusive',
  unknown: 'causeUnknown',
  customer_side: 'causeCustomer',
};
const GRADE_TONE: Record<Grade, string> = {
  A: 'bg-ok text-white',
  B: 'bg-accent text-white',
  C: 'bg-warn text-white',
  D: 'bg-bad text-white',
};

const nok = (n: number) => `${n.toLocaleString('nb-NO').replace(/ /g, ' ')} kr`;
export const productName = (p: Product | undefined, sku: string, lang: Lang) => (p ? (lang === 'nb' ? p.nameNb : p.nameEn) : sku);

/** A photo with the model's box drawn on it (normalized [ymin, xmin, ymax, xmax] in 0-1000). */
export function PhotoWithBox({ url, box, tone = 'ok', alt, onLoad }: { url: string | null; box?: Box2d; tone?: 'ok' | 'bad' | 'warn'; alt: string; onLoad?: () => void }) {
  if (!url) return null;
  const color = tone === 'ok' ? 'border-ok' : tone === 'bad' ? 'border-bad' : 'border-warn';
  const show = box && box[2] > box[0] && box[3] > box[1];
  // The wrapper shrink-wraps the image, so the percentage box always lines up with it.
  return (
    <div className="relative mx-auto w-fit max-w-full overflow-hidden rounded-xl bg-slate-100">
      {/* eslint-disable-next-line @next/next/no-img-element -- signed URLs and local illustrations */}
      <img src={url} alt={alt} className="block max-h-64 w-auto max-w-full" onLoad={onLoad} />
      {show && (
        <div
          className={`absolute rounded-md border-4 ${color}`}
          style={{ top: `${box[0] / 10}%`, left: `${box[1] / 10}%`, height: `${(box[2] - box[0]) / 10}%`, width: `${(box[3] - box[1]) / 10}%` }}
        />
      )}
    </div>
  );
}

function NoticeBar({ station, lang }: { station: ReturnStation; lang: Lang }) {
  if (!station.notice) return null;
  const tone = station.notice.tone === 'bad' ? 'bg-red-50 text-bad' : station.notice.tone === 'warn' ? 'bg-amber-50 text-warn' : 'bg-green-50 text-ok';
  return (
    <p role="alert" className={`rounded-xl px-4 py-3 text-lg font-semibold ${tone}`}>
      {t(station.notice.key, lang)}
    </p>
  );
}

function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { v: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="grid grid-flow-col gap-1 rounded-xl bg-slate-100 p-1">
      {options.map((o) => (
        <button
          key={o.v}
          role="radio"
          aria-checked={value === o.v}
          onClick={() => onChange(o.v)}
          className={`min-h-12 rounded-lg px-2 text-base font-semibold ${value === o.v ? 'bg-white shadow' : 'text-muted'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Row({ ok, label, value }: { ok: boolean | null; label: string; value: ReactNode }) {
  const icon = ok === null ? '?' : ok ? '✓' : '!';
  const tone = ok === null ? 'bg-slate-200 text-muted' : ok ? 'bg-ok text-white' : 'bg-warn text-white';
  return (
    <li className="flex items-center gap-3 py-2">
      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-lg font-bold ${tone}`} aria-hidden>
        {icon}
      </span>
      <span className="flex-1 text-lg">{label}</span>
      <span className="text-right text-lg font-semibold">{value}</span>
    </li>
  );
}

function photoSummary(p: StationPhoto | undefined, lang: Lang): string | null {
  if (!p) return null;
  if (p.facesDiscarded) return t('faceInFrame', lang);
  const i = p.inspection;
  if (!i) return t('retakeInvalid', lang);
  if (p.purpose === 'label') return `${t('size', lang)}: ${i.sizeRead ?? t('notReadable', lang)}`;
  if (p.purpose === 'customer_note') return t('noteRead', lang);
  return t('photoOk', lang);
}

/** The returns station screen. Same component for live mode and demo mode. */
export function ReturnStationView({
  station,
  lang,
  captureMode,
  onBackToQueue,
}: {
  station: ReturnStation;
  lang: Lang;
  /** live: real camera; demo: the shutter uses the scripted fixture for this step */
  captureMode: 'camera' | 'fixture';
  onBackToQueue?: () => void;
}) {
  const { view, item, decision, steps, phase, activeStep, busy, actions } = station;
  const pm = productMap(view.products);
  const [escalating, setEscalating] = useState(false);
  const [note, setNote] = useState('');
  const decided = item.status === 'decided' || item.status === 'escalated';

  // Keep the screen awake while the station is open (addendum section 7).
  useEffect(() => {
    if (captureMode !== 'camera' || !('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    navigator.wakeLock.request('screen').then((l) => (lock = l)).catch(() => {});
    return () => void lock?.release().catch(() => {});
  }, [captureMode]);

  // Bring a new photo result, or a raised flag, into view on a small screen or the demo frame.
  const resultRef = useRef<HTMLDivElement>(null);
  const flagRef = useRef<HTMLDivElement>(null);
  const showResult = () => resultRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  useEffect(() => {
    if (phase === 'decision' && decision.suspiciousNote) flagRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [phase, decision.suspiciousNote]);

  const latest = (p: PhotoPurpose) => [...item.photos].reverse().find((x) => x.purpose === p);
  const ordered = pm.get(item.orderedSku);
  const received = decision.receivedSku ? pm.get(decision.receivedSku) : undefined;
  const ev = view.packEvidence?.check;
  const evidenceKey: StringKey = !ev
    ? 'noEvidence'
    : ev.status === 'VERIFIED'
      ? ev.sizeVerified
        ? 'evidenceVerifiedSize'
        : 'evidenceVerified'
      : 'evidenceManual';

  return (
    <div className="flex flex-1 flex-col gap-4 p-4" data-phase={phase}>
      {/* Header: return, item switcher, retakes */}
      <div className="flex items-baseline justify-between gap-2">
        <h1 className="text-2xl font-bold">
          {t('returnWord', lang)} #{view.ret.id}
        </h1>
        {station.retakes > 0 && !decided && (
          <span className="rounded-full bg-amber-50 px-3 py-1 text-sm font-semibold text-warn">
            {t('retakes', lang)}: {station.retakes}
          </span>
        )}
      </div>
      {view.items.length > 1 && (
        <nav className="flex gap-2 overflow-x-auto" aria-label={t('item', lang)}>
          {view.items.map((it, k) => (
            <button
              key={it.id}
              onClick={() => actions.selectItem(k)}
              aria-current={k === station.itemIdx}
              className={`min-h-12 shrink-0 rounded-xl border-2 px-4 text-base font-semibold ${k === station.itemIdx ? 'border-accent bg-blue-50' : 'border-gray-200'}`}
            >
              {t('item', lang)} {k + 1}
              {it.status === 'decided' ? ' ✓' : it.status === 'escalated' ? ' →' : ''}
            </button>
          ))}
        </nav>
      )}

      <NoticeBar station={station} lang={lang} />

      {phase === 'overview' && (
        <section className="flex flex-col gap-4">
          {view.lateDays !== null && view.lateDays > (view.settings.returnWindowDays ?? 30) && (
            <p className="rounded-xl bg-amber-50 px-4 py-3 text-warn">
              <strong>{t('lateReturn', lang)}.</strong> {t('lateReturnHint', lang)}
            </p>
          )}
          <div>
            <div className="text-sm text-muted">{t('ordered', lang)}</div>
            <div className="text-xl font-semibold">
              {item.qty > 1 && `${item.qty} × `}
              {productName(ordered, item.orderedSku, lang)}
            </div>
            <div className="font-mono text-sm text-muted">{item.orderedSku}</div>
          </div>
          <div>
            <div className="text-sm text-muted">{t('customerReason', lang)}</div>
            <p className="text-xl">“{view.ret.customerReasonNb}”</p>
          </div>
          <div className="rounded-2xl border-2 border-gray-200 p-3">
            <div className="text-sm text-muted">
              {t('packingEvidence', lang)} · {t('order', lang)} {view.order.id}
            </div>
            <div className="mt-1 flex items-center gap-3">
              {view.packEvidence?.photoUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={view.packEvidence.photoUrl} alt={t('packingEvidence', lang)} className="h-20 w-20 rounded-lg object-cover" />
              )}
              <span className={`text-lg font-semibold ${ev && !(ev.status === 'VERIFIED' && ev.sizeVerified) ? 'text-warn' : ''}`}>{t(evidenceKey, lang)}</span>
            </div>
          </div>
          <button className="btn-primary text-xl" onClick={actions.start}>
            {t('startInspection', lang)}
          </button>
        </section>
      )}

      {phase === 'photos' && (
        <section className="flex flex-col gap-3">
          <ol className="grid grid-cols-2 gap-2" aria-label={t('takePhoto', lang)}>
            {steps.map(({ purpose, optional }) => {
              const p = latest(purpose);
              const done = !!p?.inspection;
              const active = purpose === activeStep;
              return (
                <li key={purpose}>
                  <button
                    onClick={() => actions.selectStep(purpose)}
                    aria-current={active ? 'step' : undefined}
                    className={`flex min-h-14 w-full items-center justify-between rounded-xl border-2 px-3 text-left text-base font-semibold ${active ? 'border-accent bg-blue-50' : 'border-gray-200'}`}
                  >
                    <span>
                      {t(STEP_KEY[purpose], lang)}
                      {optional && <span className="block text-xs font-normal text-muted">{t('optional', lang)}</span>}
                    </span>
                    <span aria-hidden className={done ? 'text-ok' : 'text-muted'}>
                      {done ? '✓' : '○'}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>

          {station.cameraOpen && captureMode === 'camera' ? (
            <Camera
              lang={lang}
              hint={t(HINT_KEY[activeStep], lang)}
              onCapture={(jpeg) => void actions.capture(activeStep, jpeg)}
              onCancel={actions.closeCamera}
            />
          ) : (
            <div className="flex flex-col gap-3">
              <p className="text-lg font-semibold">{t(HINT_KEY[activeStep], lang)}</p>
              {(() => {
                const p = latest(activeStep);
                const summary = photoSummary(p, lang);
                const weak = !!p && (!p.inspection || (activeStep === 'label' && (!p.inspection.sizeRead || p.inspection.identityConfidence < (view.settings.returnConfidenceMin ?? 0.7))));
                return p ? (
                  <div className="flex flex-col gap-2" ref={resultRef}>
                    <PhotoWithBox url={p.url} box={p.inspection?.box_2d} tone={p.inspection?.containsInstructions ? 'bad' : weak ? 'warn' : 'ok'} alt={t(STEP_KEY[activeStep], lang)} onLoad={showResult} />
                    {summary && <p className={`text-lg font-semibold ${weak ? 'text-warn' : 'text-ok'}`}>{summary}</p>}
                  </div>
                ) : null;
              })()}
              {busy === 'capture' ? (
                <p className="btn-secondary animate-pulse" aria-live="polite">
                  {t('checking', lang)}
                </p>
              ) : (
                <button
                  className={latest(activeStep) ? 'btn-secondary' : 'btn-primary text-xl'}
                  onClick={() => (captureMode === 'camera' ? actions.openCamera() : void actions.capture(activeStep, null))}
                  disabled={decided}
                >
                  {latest(activeStep) ? t('retake', lang) : t('takePhoto', lang)}
                </button>
              )}
            </div>
          )}

          {!station.cameraOpen && (
            <button className="btn-primary mt-2" onClick={() => actions.setPhase('findings')} disabled={busy !== null}>
              {t('next', lang)}
            </button>
          )}
        </section>
      )}

      {phase === 'findings' && (
        <section className="flex flex-col gap-4">
          <h2 className="text-xl font-bold">{t('findings', lang)}</h2>
          <ul className="divide-y">
            <Row
              ok={decision.receivedSku === null ? null : !decision.wrongItemShipped}
              label={decision.receivedSku === null ? t('identityUnknown', lang) : decision.wrongItemShipped ? t('wrongItemDelivered', lang) : t('rightItem', lang)}
              value={decision.receivedSku ? <span className="font-mono">{decision.receivedSku}</span> : '—'}
            />
            {decision.wrongItemShipped && decision.cause && (
              <li className="py-1 pl-11 text-lg font-semibold text-warn">{t(CAUSE_KEY[decision.cause] ?? 'causeUnknown', lang)}</li>
            )}
            <Row
              ok={decision.condition.tagsAttached === 'unknown' ? null : decision.condition.tagsAttached}
              label={t('tags', lang)}
              value={decision.condition.tagsAttached === 'unknown' ? t('unknownWord', lang) : decision.condition.tagsAttached ? t('attached', lang) : t('removed', lang)}
            />
            <Row ok={decision.condition.damage === 'none'} label={t('damage', lang)} value={t(decision.condition.damage, lang)} />
            <Row ok={decision.condition.stains === 'none'} label={t('stains', lang)} value={t(decision.condition.stains, lang)} />
            <Row
              ok={decision.condition.packaging !== 'missing'}
              label={t('packaging', lang)}
              value={t(decision.condition.packaging === 'missing' ? 'missingWord' : decision.condition.packaging, lang)}
            />
          </ul>

          {latest('label')?.inspection && (
            <PhotoWithBox url={latest('label')!.url} box={latest('label')!.inspection!.box_2d} alt={t('stepLabel', lang)} tone={decision.wrongItemShipped ? 'bad' : 'ok'} />
          )}

          <div className="flex flex-col gap-3 rounded-2xl bg-slate-50 p-3">
            <h3 className="text-lg font-semibold">{t('anyDamage', lang)}</h3>
            <label className="text-sm text-muted">{t('stains', lang)}</label>
            <Segmented<Severity>
              label={t('stains', lang)}
              value={item.worker.stains ?? 'none'}
              onChange={(v) => actions.setWorker({ stains: v })}
              options={(['none', 'minor', 'major'] as const).map((v) => ({ v, label: t(v, lang) }))}
            />
            <label className="text-sm text-muted">{t('damage', lang)}</label>
            <Segmented<Severity>
              label={t('damage', lang)}
              value={item.worker.damage ?? 'none'}
              onChange={(v) => actions.setWorker({ damage: v })}
              options={(['none', 'minor', 'major'] as const).map((v) => ({ v, label: t(v, lang) }))}
            />
            <label className="text-sm text-muted">{t('tags', lang)}</label>
            <Segmented<'yes' | 'no'>
              label={t('tags', lang)}
              value={item.worker.tagsAttached === false ? 'no' : 'yes'}
              onChange={(v) => actions.setWorker({ tagsAttached: v === 'no' ? false : undefined })}
              options={[
                { v: 'yes', label: t('attached', lang) },
                { v: 'no', label: t('removed', lang) },
              ]}
            />
            <label className="flex min-h-12 items-center gap-3 text-lg">
              <input type="checkbox" className="h-6 w-6" checked={!!item.worker.unusable} onChange={(e) => actions.setWorker({ unusable: e.target.checked })} />
              {t('unusable', lang)}
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <button className="btn-secondary" onClick={() => actions.setPhase('photos')}>
              {t('back', lang)}
            </button>
            <button className="btn-primary" onClick={() => actions.setPhase('decision')}>
              {t('next', lang)}
            </button>
          </div>
        </section>
      )}

      {phase === 'decision' && (
        <section className="flex flex-col gap-4">
          <h2 className="text-xl font-bold">{t('decision', lang)}</h2>
          {decision.status === 'needs_photos' && (
            <button className="rounded-xl bg-amber-50 px-4 py-3 text-left text-lg font-semibold text-warn" onClick={() => actions.selectStep(decision.missingPhotos[0])}>
              {t('missingPhotos', lang)}: {decision.missingPhotos.map((p) => t(STEP_KEY[p], lang)).join(', ')}
            </button>
          )}
          {decision.status === 'needs_retake' && (
            <button className="rounded-xl bg-amber-50 px-4 py-3 text-left text-lg font-semibold text-warn" onClick={() => actions.selectStep('label')}>
              {t('retakeUnclear', lang)}
            </button>
          )}
          {decision.status === 'escalated' && <p className="rounded-xl bg-amber-50 px-4 py-3 text-lg font-semibold text-warn">{t('escalatedHint', lang)}</p>}

          {decision.grade && (
            <div className="flex items-center gap-4">
              <span className={`flex h-24 w-24 items-center justify-center rounded-2xl text-6xl font-black ${GRADE_TONE[decision.grade]}`} data-testid="grade">
                {decision.grade}
              </span>
              <div>
                <div className="text-sm text-muted">{t('shelf', lang)}</div>
                <div className="font-mono text-5xl font-black tracking-tight" data-testid="shelf">
                  {decision.locationCode}
                </div>
              </div>
            </div>
          )}
          {decision.grade && (
            <div className="flex items-baseline justify-between rounded-xl bg-slate-50 px-4 py-3">
              <span className="text-lg">{t('refund', lang)}</span>
              <span className="text-2xl font-bold" data-testid="refund">
                {decision.refundNok === null ? t('leadDecidesRefund', lang) : nok(decision.refundNok)}
              </span>
            </div>
          )}
          {decision.suspiciousNote && (
            <div ref={flagRef} className="rounded-xl border-2 border-bad bg-red-50 px-4 py-3 text-bad" role="alert">
              <div className="text-lg font-bold">⚑ {t('suspiciousNote', lang)}</div>
              <p>{t('noteReadAsText', lang)}</p>
            </div>
          )}
          {decision.wrongItemShipped && received && (
            <p className="text-lg">
              <strong>{t('wrongItemDelivered', lang)}:</strong> {productName(received, decision.receivedSku!, lang)} · {t(CAUSE_KEY[decision.cause ?? 'unknown'], lang)}
            </p>
          )}
          {decision.stockProposals.length > 0 && (
            <div className="rounded-xl border-2 border-gray-200 px-4 py-3">
              <div className="text-sm text-muted">{t('stockCorrection', lang)}</div>
              {decision.stockProposals.map((s) => (
                <div key={s.sku} className="flex justify-between font-mono text-lg">
                  <span>{s.sku}</span>
                  <span className={s.delta > 0 ? 'text-ok' : 'text-bad'}>{s.delta > 0 ? `+${s.delta}` : s.delta}</span>
                </div>
              ))}
            </div>
          )}
          {decision.escalations.length > 0 && !decision.suspiciousNote && decision.status !== 'escalated' && (
            <p className="text-lg font-semibold text-warn">{t('goesToLead', lang)}</p>
          )}

          <button className="btn min-h-16 bg-ok text-2xl text-white" disabled={!decision.canConfirm || busy !== null} onClick={() => void actions.confirm()}>
            {busy === 'confirm' ? t('checking', lang) : t('confirmReturn', lang)}
          </button>
          <button className="btn-secondary" onClick={() => actions.setPhase('findings')}>
            {t('back', lang)}
          </button>
        </section>
      )}

      {phase === 'done' && (
        <section className="flex flex-col items-center gap-4 py-6 text-center">
          <div className={`flex h-24 w-24 items-center justify-center rounded-full text-5xl text-white ${item.status === 'escalated' ? 'bg-warn' : 'bg-ok'}`} aria-hidden>
            {item.status === 'escalated' ? '→' : '✓'}
          </div>
          <h2 className="text-2xl font-bold">
            {item.status === 'escalated' ? t('sentToLead', lang) : view.status === 'confirmed' ? t('returnConfirmed', lang) : t('confirmed', lang)}
          </h2>
          {item.committed && (
            <p className="text-xl">
              {t('grade', lang)} <strong>{item.committed.grade}</strong> · {t('shelf', lang)}{' '}
              <strong className="font-mono">{item.committed.locationCode}</strong>
            </p>
          )}
          {station.nextOpenItem >= 0 ? (
            <button className="btn-primary w-full text-xl" onClick={() => actions.selectItem(station.nextOpenItem)}>
              {t('nextItem', lang)}
            </button>
          ) : (
            onBackToQueue && (
              <button className="btn-primary w-full text-xl" onClick={onBackToQueue}>
                {t('backToQueue', lang)}
              </button>
            )
          )}
        </section>
      )}

      {/* "Send til teamleder" is always available until the item is decided. */}
      {!decided && phase !== 'overview' && (
        <div className="mt-auto pt-2">
          {escalating ? (
            <div className="flex flex-col gap-2 rounded-2xl border-2 border-warn p-3">
              <textarea
                className="min-h-20 rounded-xl border-2 border-gray-200 p-3 text-lg"
                placeholder={t('notePlaceholder', lang)}
                maxLength={500}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
              <div className="grid grid-cols-2 gap-2">
                <button className="btn-secondary" onClick={() => setEscalating(false)}>
                  {t('cancel', lang)}
                </button>
                <button
                  className="btn bg-warn text-white"
                  disabled={busy !== null}
                  onClick={async () => {
                    const r = await actions.escalate(note.trim() || undefined);
                    if (r.ok) {
                      setEscalating(false);
                      setNote('');
                    }
                  }}
                >
                  {t('send', lang)}
                </button>
              </div>
            </div>
          ) : (
            <button className={`w-full ${decision.status === 'escalated' ? 'btn bg-warn text-white' : 'btn-secondary'}`} onClick={() => setEscalating(true)}>
              {t('sendToLead', lang)}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
