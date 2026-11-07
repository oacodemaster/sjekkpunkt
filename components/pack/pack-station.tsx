'use client';

import { useEffect, useRef } from 'react';
import { BarcodeScanner } from '@/components/barcode-scanner';
import { Camera } from '@/components/camera';
import { PhotoWithBoxes, type PhotoBox } from '@/components/photo-boxes';
import { productMap } from '@/lib/engine/catalog';
import { withDefaults } from '@/lib/engine/constants';
import type { Lang, ManualReason, PackDecision, PackLineResult, Product } from '@/lib/engine/types';
import { t, type StringKey } from '@/lib/i18n/strings';
import { unitCount } from '@/lib/pack/inputs';
import type { PackPhoto } from '@/lib/pack/types';
import type { PackCameraTarget, PackStation } from './use-pack-station';

const name = (p: Product | undefined, sku: string | null, lang: Lang) => (p ? (lang === 'nb' ? p.nameNb : p.nameEn) : (sku ?? '?'));

const REASONS: { v: ManualReason; key: StringKey }[] = [
  { v: 'polybag', key: 'reasonPolybag' },
  { v: 'glare', key: 'reasonGlare' },
  { v: 'other', key: 'reasonOther' },
];

/** The verdict banner from the brief: red "Feil vare", amber "Vis etiketten", green "Klar til forsegling". */
function Verdict({ d, lang }: { d: PackDecision; lang: Lang }) {
  const { seen, ordered } = unitCount(d);
  const conf: Record<PackDecision['status'], { tone: string; title: string; text?: string }> = {
    MISMATCH: { tone: 'bg-bad text-white', title: t('wrongItem', lang), text: t('packMismatchMsg', lang) },
    NEEDS_LABEL_PHOTO: {
      tone: 'bg-warn text-white',
      title: t('showLabel', lang),
      text: d.messageKey === 'packAlertNeedsLabel' ? t('alertBanner', lang) : t('packNeedsLabelMsg', lang),
    },
    RETAKE: { tone: 'bg-warn text-white', title: t('retake', lang), text: d.messageKey === 'faceInFrame' ? t('faceInFrame', lang) : t('packTimeoutMsg', lang) },
    VERIFIED: { tone: 'bg-ok text-white', title: t('readyToSeal', lang), text: `${seen} ${t('of', lang)} ${ordered} · ${t('correct', lang)}` },
    MANUAL_CONFIRM: { tone: 'bg-ok text-white', title: t('manualChosen', lang), text: `${seen} ${t('of', lang)} ${ordered}` },
  };
  const c = conf[d.status];
  return (
    <div className={`rounded-2xl px-4 py-3 ${c.tone}`} role="status" data-testid="verdict" data-status={d.status}>
      <div className="text-3xl font-black">{c.title}</div>
      {c.text && <div className="text-lg font-semibold">{c.text}</div>}
    </div>
  );
}

function photoBoxes(photo: PackPhoto, d: PackDecision, products: Product[], minConf: number, lang: Lang): PhotoBox[] {
  const pm = productMap(products);
  if (photo.purpose === 'label_closeup') {
    const l = photo.label;
    if (!l?.box_2d) return [];
    const p = l.sku ? pm.get(l.sku) : undefined;
    const ok = !!l.sizeRead && l.confidence >= minConf && l.sizeRead.trim().toUpperCase() === p?.size?.toUpperCase();
    const wrong = !!l.sizeRead && l.confidence >= minConf && !ok;
    return [{ box: l.box_2d, tone: ok ? 'ok' : wrong ? 'bad' : 'warn', label: l.sizeRead ?? '?' }];
  }
  const lines = new Map(d.lines.map((l) => [l.sku, l]));
  return (photo.vision?.items ?? []).map((i) => {
    const line = i.matchedSku ? lines.get(i.matchedSku) : undefined;
    const tone = line ? (line.state === 'extra' || line.labelSizeMismatch ? 'bad' : i.confidence >= minConf ? 'ok' : 'warn') : i.matchedSku === null && i.confidence < minConf ? 'warn' : 'bad';
    const label = tone === 'bad' ? t('wrongItem', lang) : tone === 'warn' ? '?' : '✓';
    return { box: i.box_2d, tone, label };
  });
}

function LineRow({
  line,
  product,
  lang,
  checked,
  needsLabel,
  station,
  shoot,
}: {
  line: PackLineResult;
  product: Product | undefined;
  lang: Lang;
  checked: boolean;
  needsLabel: boolean;
  station: PackStation;
  shoot: (target: PackCameraTarget) => void;
}) {
  const { actions, sealed, busy } = station;
  const bad = checked && (line.state !== 'present' || !!line.labelSizeMismatch);
  const status = !checked
    ? null
    : line.labelSizeMismatch
      ? `${t('labelShows', lang)} ${line.labelSizeMismatch}`
      : line.state === 'missing'
        ? `${t('missing', lang)} ${line.diff}`
        : line.state === 'extra'
          ? `${line.diff} ${t('extra', lang)}`
          : t('correct', lang);
  return (
    <li
      className={`flex flex-col gap-2 rounded-2xl border-2 p-3 ${bad ? (line.state === 'missing' ? 'border-dashed border-bad' : 'border-bad') : checked && line.state === 'present' ? 'border-ok' : 'border-gray-200'}`}
      data-testid="pack-line"
      data-sku={line.sku}
      data-state={checked ? (line.labelSizeMismatch ? 'wrong_size' : line.state) : 'unchecked'}
    >
      <div className="flex items-start gap-3">
        <span
          className={`flex h-12 min-w-12 shrink-0 items-center justify-center rounded-xl px-2 text-xl font-black ${!checked ? 'bg-slate-100' : bad ? 'bg-bad text-white' : 'bg-ok text-white'}`}
          data-testid="qty-badge"
          aria-label={`${line.seen} ${t('of', lang)} ${line.ordered}`}
        >
          {checked ? `${line.seen}/${line.ordered}` : `×${line.ordered}`}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-lg font-semibold leading-tight">{name(product, line.sku, lang)}</div>
          <div className="font-mono text-sm text-muted">{line.sku}</div>
          <div className="mt-1 flex flex-wrap gap-1 text-sm">
            {status && <span className={`rounded-full px-2 py-0.5 font-semibold ${bad ? 'bg-red-50 text-bad' : 'bg-green-50 text-ok'}`}>{status}</span>}
            {checked && line.sizeVerified && product?.size && <span className="rounded-full bg-green-50 px-2 py-0.5 text-ok">{t('sizeVerifiedTag', lang)} ✓</span>}
            {line.method === 'barcode' && <span className="rounded-full bg-blue-50 px-2 py-0.5 text-accent">{t('barcode', lang)} ✓</span>}
            {line.alertActive && <span className="rounded-full bg-amber-50 px-2 py-0.5 font-semibold text-warn">⚠ {t('showLabel', lang)}</span>}
            {needsLabel && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-warn">{t('needsLabel', lang)}</span>}
          </div>
        </div>
      </div>
      {!sealed && (
        <div className="grid grid-cols-2 gap-2">
          <button
            className={`min-h-12 rounded-xl border-2 px-2 text-base font-semibold ${needsLabel ? 'border-warn bg-amber-50 text-warn' : 'border-gray-200'}`}
            disabled={busy !== null}
            onClick={() => shoot({ purpose: 'label_closeup', sku: line.sku })}
          >
            {t('stepLabel', lang)}
          </button>
          <button className="min-h-12 rounded-xl border-2 border-gray-200 px-2 text-base font-semibold" disabled={busy !== null} onClick={() => actions.openScanner(line.sku)}>
            {t('barcode', lang)}
          </button>
        </div>
      )}
    </li>
  );
}

/** The packing station screen. Same component for live mode and demo mode. */
export function PackStationView({
  station,
  lang,
  captureMode,
  onBackToQueue,
}: {
  station: PackStation;
  lang: Lang;
  /** live: real camera; demo: the shutter uses the scripted fixture */
  captureMode: 'camera' | 'fixture';
  onBackToQueue?: () => void;
}) {
  const { view, decision, inputs, needLabel, sealed, checked, latestPhoto, camera, scanner, busy, actions } = station;
  const pm = productMap(view.products);
  const minConf = withDefaults(view.settings).packConfidenceMin;
  const alerted = decision.lines.some((l) => l.alertActive);
  const evidence = inputs.overview?.vision ? inputs.overview : null;

  // Keep the screen awake while the station is open (addendum section 7).
  useEffect(() => {
    if (captureMode !== 'camera' || !('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    navigator.wakeLock.request('screen').then((l) => (lock = l)).catch(() => {});
    return () => void lock?.release().catch(() => {});
  }, [captureMode]);

  // Bring the newest result into view on a small screen or the demo frame.
  const resultRef = useRef<HTMLDivElement>(null);
  const showResult = () => resultRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  useEffect(() => {
    resultRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [decision.status, latestPhoto?.photoId]);

  const shoot = (target: PackCameraTarget) =>
    captureMode === 'camera' ? actions.openCamera(target) : void actions.capture(target, null);
  const overview = () => shoot({ purpose: 'pack_check' });
  const labelFirst = () => needLabel[0] && shoot({ purpose: 'label_closeup', sku: needLabel[0] });

  const unexpectedNames = decision.unexpected.map((u) => (u.sku ? name(pm.get(u.sku), u.sku, lang) : t('unclearItem', lang)));

  return (
    <div className="flex flex-1 flex-col gap-4 p-4" data-pack-status={checked ? decision.status : 'START'}>
      <div className="flex items-baseline justify-between gap-2">
        <h1 className="text-2xl font-bold">
          {t('order', lang)} #{view.order.id}
        </h1>
        {inputs.retakes > 0 && !sealed && (
          <span className="rounded-full bg-amber-50 px-3 py-1 text-sm font-semibold text-warn" data-testid="retakes">
            {t('retakes', lang)}: {inputs.retakes}
          </span>
        )}
      </div>

      {alerted && !sealed && (
        <p className="rounded-xl border-2 border-warn bg-amber-50 px-4 py-3 text-lg font-semibold text-warn" role="alert" data-testid="alert-banner">
          ⚠ {t('alertBanner', lang)}
        </p>
      )}

      {station.notice && (
        <p
          role="alert"
          className={`rounded-xl px-4 py-3 text-lg font-semibold ${station.notice.tone === 'bad' ? 'bg-red-50 text-bad' : station.notice.tone === 'warn' ? 'bg-amber-50 text-warn' : 'bg-green-50 text-ok'}`}
        >
          {t(station.notice.key, lang)}
        </p>
      )}

      {sealed ? (
        <section className="flex flex-col items-center gap-4 py-6 text-center" data-testid="sealed">
          <div className="flex h-24 w-24 items-center justify-center rounded-full bg-ok text-5xl text-white" aria-hidden>
            ✓
          </div>
          <h2 className="text-2xl font-bold">{t('sealed', lang)}</h2>
          <p className="text-lg">
            {view.committed!.status === 'MANUAL_CONFIRM' ? t('manualChosen', lang) : view.committed!.method === 'barcode' ? t('barcode', lang) : t('correct', lang)}
            {view.committed!.evidencePhotoId && <> · {t('evidenceSaved', lang)}</>}
          </p>
          {onBackToQueue && (
            <button className="btn-primary w-full text-xl" onClick={onBackToQueue}>
              {t('nextOrder', lang)}
            </button>
          )}
        </section>
      ) : camera && captureMode === 'camera' ? (
        <Camera
          lang={lang}
          hint={camera.purpose === 'pack_check' ? t('hintBox', lang) : `${t('hintLabelCloseup', lang)} ${name(pm.get(camera.sku), camera.sku, lang)}`}
          onCapture={(jpeg) => void actions.capture(camera, jpeg)}
          onCancel={actions.closeCamera}
          controlRef={station.cameraControl}
          countdown={station.countdown}
        />
      ) : (
        <>
          {busy === 'capture' && (
            <p className="btn-secondary animate-pulse" aria-live="polite">
              {t('checking', lang)}
            </p>
          )}
          {checked && busy !== 'capture' && (
            <div className="flex flex-col gap-3" ref={resultRef}>
              <Verdict d={decision} lang={lang} />
              {latestPhoto && (
                <PhotoWithBoxes
                  url={latestPhoto.url}
                  boxes={photoBoxes(latestPhoto, decision, view.products, minConf, lang)}
                  alt={latestPhoto.purpose === 'pack_check' ? t('check', lang) : t('stepLabel', lang)}
                  onLoad={showResult}
                  testId="pack-photo"
                />
              )}
              {decision.status === 'MISMATCH' && unexpectedNames.length > 0 && (
                <ul className="flex flex-col gap-1" data-testid="unexpected">
                  {unexpectedNames.map((n, k) => (
                    <li key={k} className="rounded-xl bg-red-50 px-3 py-2 text-lg font-semibold text-bad">
                      ✕ {t('notInOrder', lang)}: {n}
                    </li>
                  ))}
                </ul>
              )}
              {(decision.status === 'VERIFIED' || decision.status === 'MANUAL_CONFIRM') && evidence && (
                <p className="text-lg font-semibold text-ok">✓ {t('evidenceSaved', lang)}</p>
              )}
            </div>
          )}
          {!checked && busy !== 'capture' && <p className="text-lg">{t('packStart', lang)}</p>}
        </>
      )}

      {!sealed && !(camera && captureMode === 'camera') && (
        <ul className="flex flex-col gap-2" aria-label={t('order', lang)}>
          {decision.lines.map((l) => (
            <LineRow key={l.sku} line={l} product={pm.get(l.sku)} lang={lang} checked={checked} needsLabel={checked && needLabel.includes(l.sku)} station={station} shoot={shoot} />
          ))}
        </ul>
      )}

      {!sealed && scanner !== false && (
        <BarcodeScanner
          lang={lang}
          title={scanner ? `${t('scanBarcode', lang)}: ${name(pm.get(scanner), scanner, lang)}` : t('scanBarcode', lang)}
          busy={busy !== null}
          onCode={(code) => void actions.scan(code)}
          onClose={actions.closeScanner}
        />
      )}

      {!sealed && !(camera && captureMode === 'camera') && (
        <div className="mt-auto flex flex-col gap-3 pt-2">
          {!checked ? (
            <button className="btn-primary min-h-20 text-3xl" onClick={overview} disabled={busy !== null}>
              {t('check', lang)}
            </button>
          ) : decision.canSeal ? (
            <>
              {decision.status === 'MANUAL_CONFIRM' && decision.escalations.includes('manual_confirm_on_alert') && (
                <p className="rounded-xl bg-amber-50 px-4 py-3 text-warn">{t('manualLeadNotified', lang)}</p>
              )}
              <button className="btn min-h-20 bg-ok text-2xl text-white" onClick={() => void actions.seal()} disabled={busy !== null} data-testid="seal">
                {busy === 'seal' ? t('checking', lang) : t('readyToSeal', lang)}
              </button>
              {decision.status === 'MANUAL_CONFIRM' && (
                <button className="btn-secondary" onClick={() => void actions.chooseManual(null)}>
                  {t('cancel', lang)}
                </button>
              )}
            </>
          ) : decision.status === 'NEEDS_LABEL_PHOTO' && needLabel.length > 0 ? (
            <>
              <button className="btn min-h-16 bg-warn text-2xl text-white" onClick={labelFirst} disabled={busy !== null}>
                {t('showLabel', lang)}
              </button>
              <button className="btn-secondary" onClick={overview} disabled={busy !== null}>
                {t('checkAgain', lang)}
              </button>
            </>
          ) : (
            <button className="btn-primary min-h-16 text-2xl" onClick={overview} disabled={busy !== null}>
              {decision.status === 'RETAKE' ? t('retake', lang) : t('checkAgain', lang)}
            </button>
          )}

          {checked && decision.canManualConfirm && decision.status !== 'MANUAL_CONFIRM' && (
            <div className="flex flex-col gap-2 rounded-2xl border-2 border-gray-200 p-3" data-testid="manual-confirm">
              <div className="text-base font-semibold">
                {t('manualConfirm', lang)} · {t('manualWhy', lang)}
              </div>
              <div className="grid grid-cols-3 gap-2">
                {REASONS.map((r) => (
                  <button key={r.v} className="min-h-12 rounded-xl border-2 border-gray-300 text-base font-semibold" disabled={busy !== null} onClick={() => void actions.chooseManual(r.v)}>
                    {t(r.key, lang)}
                  </button>
                ))}
              </div>
            </div>
          )}

          {scanner === false && (
            <button className="text-base text-muted underline" onClick={() => actions.openScanner(null)}>
              {t('scanBarcode', lang)}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
