'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Camera } from '@/components/camera';
import { Banner, Button, Card, GradeBadge, Icon, PhotoStage, ShelfCode, StatusChip, StepIndicator, type StageBox } from '@/components/ui';
import { scrollBehavior } from '@/components/ui/motion';
import { productMap } from '@/lib/engine/catalog';
import type { Box2d, Lang, PhotoPurpose, Product, Severity } from '@/lib/engine/types';
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

const nok = (n: number) => `${n.toLocaleString('nb-NO').replace(/ /g, ' ')} kr`;
export const productName = (p: Product | undefined, sku: string, lang: Lang) => (p ? (lang === 'nb' ? p.nameNb : p.nameEn) : sku);

type BoxTone = 'ok' | 'bad' | 'warn';
const KIND: Record<BoxTone, StageBox['kind']> = { ok: 'present', bad: 'unexpected', warn: 'uncertain' };

/** A photo on the stage with one box (returns). */
export function PhotoWithBox({
  url,
  box,
  tone = 'ok',
  alt,
  tag,
  meta,
  onLoad,
}: {
  url: string | null;
  box?: Box2d;
  tone?: BoxTone;
  alt: string;
  tag?: string;
  meta?: [ReactNode, ReactNode?];
  onLoad?: () => void;
}) {
  return <PhotoStage url={url} boxes={box ? [{ box, kind: KIND[tone], tone, label: tag, icon: tag ? 'label' : undefined }] : []} alt={alt} meta={meta} onLoad={onLoad} />;
}

function NoticeBar({ station, lang }: { station: ReturnStation; lang: Lang }) {
  if (!station.notice) return null;
  const tone = station.notice.tone === 'bad' ? 'error' : station.notice.tone === 'warn' ? 'warn' : 'info';
  return (
    <Banner tone={tone} icon={station.notice.tone === 'ok' ? 'ok' : undefined} role="alert">
      {t(station.notice.key, lang)}
    </Banner>
  );
}

/** One choice of a few (findings). Selected is solid ink; every option is a 56px target. */
function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { v: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="type-label">{label}</span>
      <div role="radiogroup" aria-label={label} className="sp-seg">
        {options.map((o) => (
          <button key={o.v} type="button" role="radio" aria-checked={value === o.v} onClick={() => onChange(o.v)} className="sp-seg__opt">
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** A finding: colour, icon and word. ok green tick, a problem amber triangle, unknown neutral. */
function Row({ ok, label, value }: { ok: boolean | null; label: string; value: ReactNode }) {
  const icon = ok === null ? 'info' : ok ? 'ok' : 'warn';
  const tone = ok === null ? 'text-ink-2' : ok ? 'text-ok' : 'text-warn';
  return (
    <li className="flex items-start gap-3 border-t-2 border-line py-3 first:border-t-0">
      <span className={tone}>
        <Icon name={icon} />
      </span>
      <span className="type-body min-w-0 flex-1">{label}</span>
      <span className="type-label text-right">{value}</span>
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

/**
 * The returns station screen. Same component for live mode and demo mode. The phase's main action
 * sits in the thumb zone with the voice dock (`dock`, live mode) above it; the dock is always
 * mounted, so a voice session survives the camera and every phase change.
 */
export function ReturnStationView({
  station,
  lang,
  captureMode,
  onBackToQueue,
  dock,
}: {
  station: ReturnStation;
  lang: Lang;
  /** live: real camera; demo: the shutter uses the scripted fixture for this step */
  captureMode: 'camera' | 'fixture';
  onBackToQueue?: () => void;
  dock?: ReactNode;
}) {
  const { view, item, decision, steps, phase, activeStep, busy, actions } = station;
  const pm = productMap(view.products);
  const [escalating, setEscalating] = useState(false);
  const [note, setNote] = useState('');
  const decided = item.status === 'decided' || item.status === 'escalated';
  const cameraOpen = station.cameraOpen && captureMode === 'camera';

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
  const showResult = () => resultRef.current?.scrollIntoView({ block: 'nearest', behavior: scrollBehavior() });
  useEffect(() => {
    if (phase === 'decision' && decision.suspiciousNote) flagRef.current?.scrollIntoView({ block: 'nearest', behavior: scrollBehavior() });
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
  const evidenceTone = !ev ? undefined : ev.status === 'VERIFIED' && ev.sizeVerified ? 'ok' : 'warn';
  const stepIdx = Math.max(0, steps.findIndex((s) => s.purpose === activeStep));
  const activePhoto = latest(activeStep);
  // While the escalation form is open its Send is the primary action, so the phase action steps back.
  const mainVariant = escalating ? 'secondary' : 'primary';

  // The phase's main action (always a tap).
  let main: ReactNode = null;
  if (phase === 'overview') {
    main = (
      <Button block variant={mainVariant} icon="camera" onClick={actions.start}>
        {t('startInspection', lang)}
      </Button>
    );
  } else if (phase === 'photos' && !station.cameraOpen) {
    main = (
      <Button block variant={activePhoto ? mainVariant : 'secondary'} iconAfter="arrow-right" onClick={() => actions.setPhase('findings')} disabled={busy !== null}>
        {t('next', lang)}
      </Button>
    );
  } else if (phase === 'findings') {
    main = (
      <Button block variant={mainVariant} iconAfter="arrow-right" onClick={() => actions.setPhase('decision')}>
        {t('next', lang)}
      </Button>
    );
  } else if (phase === 'decision') {
    main = (
      <Button block variant={mainVariant} icon="ok" disabled={!decision.canConfirm || busy !== null} onClick={() => void actions.confirm()}>
        {busy === 'confirm' ? t('checking', lang) : t('confirmReturn', lang)}
      </Button>
    );
  } else if (phase === 'done') {
    main =
      station.nextOpenItem >= 0 ? (
        <Button block iconAfter="arrow-right" onClick={() => actions.selectItem(station.nextOpenItem)}>
          {t('nextItem', lang)}
        </Button>
      ) : (
        onBackToQueue && (
          <Button block iconAfter="arrow-right" onClick={onBackToQueue}>
            {t('backToQueue', lang)}
          </Button>
        )
      );
  }

  return (
    <div className="flex flex-1 flex-col" data-phase={phase}>
      <div className="flex flex-col gap-6 p-4">
        {/* Return, item switcher, retakes */}
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="type-title m-0">
            {t('returnWord', lang)} <span className="sp-mono">#{view.ret.id}</span>
          </h1>
          {station.retakes > 0 && !decided && (
            <StatusChip icon="camera">
              {t('retakes', lang)}: <span className="sp-mono">{station.retakes}</span>
            </StatusChip>
          )}
        </div>
        {view.items.length > 1 && (
          <nav className="sp-seg" aria-label={t('item', lang)}>
            {view.items.map((it, k) => (
              <button key={it.id} type="button" onClick={() => actions.selectItem(k)} aria-current={k === station.itemIdx} className="sp-seg__opt inline-flex items-center justify-center gap-2">
                {t('item', lang)} <span className="sp-mono">{k + 1}</span>
                {it.status === 'decided' && <Icon name="ok" />}
                {it.status === 'escalated' && <Icon name="arrow-right" />}
              </button>
            ))}
          </nav>
        )}

        <NoticeBar station={station} lang={lang} />

        {phase === 'overview' && (
          <section className="flex flex-col gap-4">
            {view.lateDays !== null && view.lateDays > (view.settings.returnWindowDays ?? 30) && (
              <Banner tone="warn" title={t('lateReturn', lang)}>
                {t('lateReturnHint', lang)}
              </Banner>
            )}
            <Card
              eyebrow={t('ordered', lang)}
              title={
                <>
                  {item.qty > 1 && <span className="sp-mono">{item.qty} × </span>}
                  {productName(ordered, item.orderedSku, lang)}
                </>
              }
            >
              <dl className="sp-kv">
                <dt>SKU</dt>
                <dd className="sp-mono">{item.orderedSku}</dd>
                <dt>{t('customerReason', lang)}</dt>
                <dd>«{view.ret.customerReasonNb}»</dd>
              </dl>
            </Card>
            <Card
              eyebrow={
                <span>
                  {t('packingEvidence', lang)} · {t('order', lang)} <span className="sp-mono">{view.order.id}</span>
                </span>
              }
            >
              <div className="flex flex-wrap items-center gap-3">
                {view.packEvidence?.photoUrl && (
                  <span className="sp-stage p-1.5">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={view.packEvidence.photoUrl} alt={t('packingEvidence', lang)} className="block h-20 w-20 rounded-[4px] object-contain" />
                  </span>
                )}
                <StatusChip tone={evidenceTone}>{t(evidenceKey, lang)}</StatusChip>
              </div>
            </Card>
          </section>
        )}

        {phase === 'photos' && (
          <section className="flex flex-col gap-4">
            <StepIndicator
              count={
                <span className="sp-mono">
                  {stepIdx + 1} {t('of', lang)} {steps.length}
                </span>
              }
              label={t('takePhoto', lang)}
              current={activeStep}
              onSelect={(k) => actions.selectStep(k as PhotoPurpose)}
              steps={steps.map(({ purpose, optional }) => ({ key: purpose, label: t(STEP_KEY[purpose], lang), optional: optional ? t('optional', lang) : undefined, done: !!latest(purpose)?.inspection }))}
            />

            {cameraOpen ? (
              <Camera
                lang={lang}
                hint={t(HINT_KEY[activeStep], lang)}
                onCapture={(jpeg) => void actions.capture(activeStep, jpeg)}
                onCancel={actions.closeCamera}
                controlRef={station.cameraControl}
                countdown={station.countdown}
              />
            ) : (
              <div className="flex flex-col gap-3">
                <p className="type-body m-0 font-semibold">{t(HINT_KEY[activeStep], lang)}</p>
                {(() => {
                  const p = activePhoto;
                  const summary = photoSummary(p, lang);
                  const weak = !!p && (!p.inspection || (activeStep === 'label' && (!p.inspection.sizeRead || p.inspection.identityConfidence < (view.settings.returnConfidenceMin ?? 0.7))));
                  const conf = p?.inspection?.identityConfidence;
                  return p ? (
                    <div className="flex flex-col gap-3" ref={resultRef}>
                      <PhotoWithBox
                        url={p.url}
                        box={p.inspection?.box_2d}
                        tone={p.inspection?.containsInstructions ? 'bad' : weak ? 'warn' : 'ok'}
                        tag={activeStep === 'label' && p.inspection?.sizeRead ? `${t('size', lang)} ${p.inspection.sizeRead}` : undefined}
                        alt={t(STEP_KEY[activeStep], lang)}
                        meta={[`${t('returnWord', lang)} ${view.ret.id} · ${t(STEP_KEY[activeStep], lang)}`, conf != null ? conf.toLocaleString('nb-NO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : undefined]}
                        onLoad={showResult}
                      />
                      {summary && (
                        <span>
                          <StatusChip tone={weak ? 'warn' : 'ok'}>{summary}</StatusChip>
                        </span>
                      )}
                    </div>
                  ) : null;
                })()}
                {busy === 'capture' ? (
                  <p className="sp-busy m-0" aria-live="polite">
                    {t('checking', lang)}
                  </p>
                ) : (
                  <Button
                    block
                    icon="camera"
                    variant={activePhoto ? 'secondary' : 'primary'}
                    onClick={() => (captureMode === 'camera' ? actions.openCamera() : void actions.capture(activeStep, null))}
                    disabled={decided}
                  >
                    {activePhoto ? t('retake', lang) : t('takePhoto', lang)}
                  </Button>
                )}
              </div>
            )}
          </section>
        )}

        {phase === 'findings' && (
          <section className="flex flex-col gap-4">
            <h2 className="type-title m-0">{t('findings', lang)}</h2>
            <ul className="m-0 list-none p-0">
              <Row
                ok={decision.receivedSku === null ? null : !decision.wrongItemShipped}
                label={decision.receivedSku === null ? t('identityUnknown', lang) : decision.wrongItemShipped ? t('wrongItemDelivered', lang) : t('rightItem', lang)}
                value={decision.receivedSku ? <span className="sp-mono">{decision.receivedSku}</span> : '—'}
              />
              {decision.wrongItemShipped && decision.cause && (
                <li className="pb-3 pl-9">
                  <StatusChip tone="warn">{t(CAUSE_KEY[decision.cause] ?? 'causeUnknown', lang)}</StatusChip>
                </li>
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
              <PhotoWithBox
                url={latest('label')!.url}
                box={latest('label')!.inspection!.box_2d}
                alt={t('stepLabel', lang)}
                tone={decision.wrongItemShipped ? 'bad' : 'ok'}
                tag={latest('label')!.inspection!.sizeRead ? `${t('size', lang)} ${latest('label')!.inspection!.sizeRead}` : undefined}
              />
            )}

            <Card title={t('anyDamage', lang)} className="bg-surface-2">
              <Segmented<Severity>
                label={t('stains', lang)}
                value={item.worker.stains ?? 'none'}
                onChange={(v) => actions.setWorker({ stains: v })}
                options={(['none', 'minor', 'major'] as const).map((v) => ({ v, label: t(v, lang) }))}
              />
              <Segmented<Severity>
                label={t('damage', lang)}
                value={item.worker.damage ?? 'none'}
                onChange={(v) => actions.setWorker({ damage: v })}
                options={(['none', 'minor', 'major'] as const).map((v) => ({ v, label: t(v, lang) }))}
              />
              <Segmented<'yes' | 'no'>
                label={t('tags', lang)}
                value={item.worker.tagsAttached === false ? 'no' : 'yes'}
                onChange={(v) => actions.setWorker({ tagsAttached: v === 'no' ? false : undefined })}
                options={[
                  { v: 'yes', label: t('attached', lang) },
                  { v: 'no', label: t('removed', lang) },
                ]}
              />
              <label className="sp-checkrow">
                <input type="checkbox" checked={!!item.worker.unusable} onChange={(e) => actions.setWorker({ unusable: e.target.checked })} />
                {t('unusable', lang)}
              </label>
            </Card>

            <Button variant="quiet" onClick={() => actions.setPhase('photos')}>
              {t('back', lang)}
            </Button>
          </section>
        )}

        {phase === 'decision' && (
          <section className="flex flex-col gap-4">
            <h2 className="type-title m-0">{t('decision', lang)}</h2>
            {decision.status === 'needs_photos' && (
              <button type="button" className="sp-banner sp-banner--warn w-full cursor-pointer text-left font-semibold" onClick={() => actions.selectStep(decision.missingPhotos[0])}>
                <Icon name="camera" />
                <span>
                  {t('missingPhotos', lang)}: {decision.missingPhotos.map((p) => t(STEP_KEY[p], lang)).join(', ')}
                </span>
              </button>
            )}
            {decision.status === 'needs_retake' && (
              <button type="button" className="sp-banner sp-banner--warn w-full cursor-pointer text-left font-semibold" onClick={() => actions.selectStep('label')}>
                <Icon name="camera" />
                <span>{t('retakeUnclear', lang)}</span>
              </button>
            )}
            {decision.status === 'escalated' && <Banner tone="warn">{t('escalatedHint', lang)}</Banner>}

            {decision.suspiciousNote && (
              <div ref={flagRef}>
                <Banner tone="error" role="alert" title={t('suspiciousNote', lang)}>
                  {t('noteReadAsText', lang)}
                </Banner>
              </div>
            )}

            {decision.grade && (
              // What the engine proposes, dashed until «Bekreft retur» commits it.
              <Card proposal>
                <div className="flex flex-wrap items-center gap-4">
                  <GradeBadge grade={decision.grade} kicker={`${t('grade', lang)} ${decision.grade}`} letterTestId="grade" />
                </div>
                <ShelfCode label={t('shelf', lang)} code={decision.locationCode ?? '—'} codeTestId="shelf" className="w-full" />
                <dl className="sp-kv">
                  <dt>{t('refund', lang)}</dt>
                  <dd>
                    <span className={decision.refundNok === null ? '' : 'sp-mono'} data-testid="refund">
                      {decision.refundNok === null ? t('leadDecidesRefund', lang) : nok(decision.refundNok)}
                    </span>
                  </dd>
                </dl>
                {decision.wrongItemShipped && received && (
                  <p className="type-body m-0">
                    <span className="block text-ink-2">{t('wrongItemDelivered', lang)}</span>
                    <strong>{productName(received, decision.receivedSku!, lang)}</strong> · {t(CAUSE_KEY[decision.cause ?? 'unknown'], lang)}
                  </p>
                )}
              </Card>
            )}
            {!decision.grade && decision.wrongItemShipped && received && (
              <p className="type-body m-0">
                <strong>{t('wrongItemDelivered', lang)}:</strong> {productName(received, decision.receivedSku!, lang)} · {t(CAUSE_KEY[decision.cause ?? 'unknown'], lang)}
              </p>
            )}
            {decision.stockProposals.length > 0 && (
              <Card proposal eyebrow={t('stockCorrection', lang)}>
                <ul className="m-0 flex list-none flex-col gap-1 p-0">
                  {decision.stockProposals.map((s) => (
                    <li key={s.sku} className="type-code flex justify-between gap-3">
                      <span>{s.sku}</span>
                      <span>{s.delta > 0 ? `+${s.delta}` : s.delta}</span>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
            {decision.escalations.length > 0 && !decision.suspiciousNote && decision.status !== 'escalated' && (
              <span>
                <StatusChip tone="warn" icon="arrow-right">
                  {t('goesToLead', lang)}
                </StatusChip>
              </span>
            )}

            <Button variant="quiet" onClick={() => actions.setPhase('findings')}>
              {t('back', lang)}
            </Button>
          </section>
        )}

        {phase === 'done' && (
          <section className="sp-done">
            <span className={`sp-done__icon ${item.status === 'escalated' ? 'sp-done__icon--warn' : 'sp-done__icon--ok'}`} aria-hidden>
              <Icon name={item.status === 'escalated' ? 'arrow-right' : 'ok'} />
            </span>
            <h2 className="type-title m-0">
              {item.status === 'escalated' ? t('sentToLead', lang) : view.status === 'confirmed' ? t('returnConfirmed', lang) : t('confirmed', lang)}
            </h2>
            {item.committed && (
              <p className="type-body m-0">
                {t('grade', lang)} <strong className="sp-mono">{item.committed.grade}</strong> · {t('shelf', lang)} <strong className="sp-mono">{item.committed.locationCode}</strong>
              </p>
            )}
          </section>
        )}

        {/* «Send til teamleder» is always available until the item is decided, never in a menu. */}
        {!decided && phase !== 'overview' && (
          <div>
            {escalating ? (
              <Card eyebrow={<><Icon name="arrow-right" />{t('sendToLead', lang)}</>}>
                <label className="sp-sr" htmlFor="escalate-note">
                  {t('notePlaceholder', lang)}
                </label>
                <textarea
                  id="escalate-note"
                  className="sp-input sp-textarea"
                  placeholder={t('notePlaceholder', lang)}
                  maxLength={500}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
                <div className="flex flex-wrap gap-2">
                  <Button variant="quiet" onClick={() => setEscalating(false)}>
                    {t('cancel', lang)}
                  </Button>
                  <Button
                    className="flex-1"
                    disabled={busy !== null}
                    onClick={async () => {
                      const r = await actions.escalate(note.trim() || undefined, lang);
                      if (r.ok) {
                        setEscalating(false);
                        setNote('');
                      }
                    }}
                  >
                    {t('send', lang)}
                  </Button>
                </div>
              </Card>
            ) : (
              <Button variant="secondary" block icon="arrow-right" onClick={() => setEscalating(true)}>
                {t('sendToLead', lang)}
              </Button>
            )}
          </div>
        )}
      </div>

      {(dock || main) && (
        <div className="sp-thumb">
          {dock}
          {main}
        </div>
      )}
    </div>
  );
}
