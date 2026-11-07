'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { BarcodeScanner } from '@/components/barcode-scanner';
import { Camera } from '@/components/camera';
import { Banner, Button, Card, Icon, OrderLine, PhotoStage, StatusChip, VerdictBanner, type LineState, type StageBox, type Tone } from '@/components/ui';
import { scrollBehavior } from '@/components/ui/motion';
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

/** The verdict banner from the brief: red «Feil vare», amber «Vis etiketten», green «Klar til forsegling». */
function Verdict({ d, lang }: { d: PackDecision; lang: Lang }) {
  const { seen, ordered } = unitCount(d);
  const conf: Record<PackDecision['status'], { tone: Tone; title: string; text?: string }> = {
    MISMATCH: { tone: 'stop', title: t('wrongItem', lang), text: t('packMismatchMsg', lang) },
    NEEDS_LABEL_PHOTO: {
      tone: 'warn',
      title: t('showLabel', lang),
      text: d.messageKey === 'packAlertNeedsLabel' ? t('alertBanner', lang) : t('packNeedsLabelMsg', lang),
    },
    RETAKE: { tone: 'warn', title: t('retake', lang), text: d.messageKey === 'faceInFrame' ? t('faceInFrame', lang) : t('packTimeoutMsg', lang) },
    VERIFIED: { tone: 'ok', title: t('readyToSeal', lang), text: `${seen} ${t('of', lang)} ${ordered} · ${t('correct', lang)}` },
    MANUAL_CONFIRM: { tone: 'ok', title: t('manualChosen', lang), text: `${seen} ${t('of', lang)} ${ordered}` },
  };
  const c = conf[d.status];
  return <VerdictBanner tone={c.tone} word={c.title} text={c.text} data-testid="verdict" data-status={d.status} />;
}

/**
 * Boxes on the photo: green for an item in the order (tagged with its name), red for one that is
 * not (or is one too many, or the wrong size), amber when the model is unsure. data-tone keeps the
 * old ok / bad / warn values for the e2e tests.
 */
function photoBoxes(photo: PackPhoto, d: PackDecision, products: Product[], minConf: number, lang: Lang): StageBox[] {
  const pm = productMap(products);
  if (photo.purpose === 'label_closeup') {
    const l = photo.label;
    if (!l?.box_2d) return [];
    const p = l.sku ? pm.get(l.sku) : undefined;
    const ok = !!l.sizeRead && l.confidence >= minConf && l.sizeRead.trim().toUpperCase() === p?.size?.toUpperCase();
    const wrong = !!l.sizeRead && l.confidence >= minConf && !ok;
    return [
      {
        box: l.box_2d,
        kind: ok ? 'present' : wrong ? 'unexpected' : 'uncertain',
        tone: ok ? 'ok' : wrong ? 'bad' : 'warn',
        icon: 'label',
        label: `${t('size', lang)} ${l.sizeRead ?? '?'}`,
      },
    ];
  }
  const lines = new Map(d.lines.map((l) => [l.sku, l]));
  return (photo.vision?.items ?? []).map((i) => {
    const line = i.matchedSku ? lines.get(i.matchedSku) : undefined;
    const tone = line ? (line.state === 'extra' || line.labelSizeMismatch ? 'bad' : i.confidence >= minConf ? 'ok' : 'warn') : i.matchedSku === null && i.confidence < minConf ? 'warn' : 'bad';
    const label =
      tone === 'warn'
        ? t('unclearItem', lang)
        : tone === 'ok'
          ? name(pm.get(line!.sku), line!.sku, lang)
          : line?.labelSizeMismatch
            ? `${t('labelShows', lang)} ${line.labelSizeMismatch}`
            : line?.state === 'extra'
              ? `${line.diff} ${t('extra', lang)}`
              : t('notInOrder', lang);
    return { box: i.box_2d, kind: tone === 'ok' ? 'present' : tone === 'bad' ? 'unexpected' : 'uncertain', tone, label };
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
  const state: LineState = !checked ? 'idle' : line.state === 'missing' && !line.labelSizeMismatch ? 'missing' : bad ? 'stop' : 'ok';
  const status: { tone: Tone; text: string } | null = !checked
    ? null
    : line.labelSizeMismatch
      ? { tone: 'stop', text: `${t('labelShows', lang)} ${line.labelSizeMismatch}` }
      : line.state === 'missing'
        ? { tone: 'stop', text: `${t('missing', lang)} ${line.diff}` }
        : line.state === 'extra'
          ? { tone: 'warn', text: `${line.diff} ${t('extra', lang)}` }
          : { tone: 'ok', text: t('correct', lang) };
  return (
    <OrderLine
      name={name(product, line.sku, lang)}
      sku={line.sku}
      qty={`${checked ? line.seen : 0} ${t('of', lang)} ${line.ordered}`}
      qtyDone={checked && !bad && line.seen >= line.ordered}
      qtyLabel={`${line.seen} ${t('of', lang)} ${line.ordered}`}
      qtyTestId="qty-badge"
      state={state}
      data-testid="pack-line"
      data-sku={line.sku}
      data-state={checked ? (line.labelSizeMismatch ? 'wrong_size' : line.state) : 'unchecked'}
      foot={
        <>
          {status && <StatusChip tone={status.tone}>{status.text}</StatusChip>}
          {checked && line.sizeVerified && product?.size && <StatusChip icon="label">{t('sizeVerifiedTag', lang)}</StatusChip>}
          {line.method === 'barcode' && <StatusChip icon="barcode">{t('barcode', lang)}</StatusChip>}
          {line.alertActive && <StatusChip tone="warn">{t('showLabel', lang)}</StatusChip>}
          {needsLabel && <StatusChip tone="warn" icon="label">{t('needsLabel', lang)}</StatusChip>}
          {!sealed && (
            <span className="flex w-full flex-wrap gap-2">
              <Button variant="secondary" icon="label" className="flex-[1_1_auto]" disabled={busy !== null} onClick={() => shoot({ purpose: 'label_closeup', sku: line.sku })}>
                {t('stepLabel', lang)}
              </Button>
              <Button variant="secondary" icon="barcode" className="flex-[1_1_auto]" disabled={busy !== null} onClick={() => actions.openScanner(line.sku)}>
                {t('barcode', lang)}
              </Button>
            </span>
          )}
        </>
      }
    />
  );
}

/**
 * The packing station screen. Same component for live mode and demo mode. Top to bottom: the
 * verdict, the photo, the order and its lines, then the main action pinned in the thumb zone with
 * the voice dock (`dock`, live mode) above it. The dock is always mounted, so a voice session
 * survives the camera opening.
 */
export function PackStationView({
  station,
  lang,
  captureMode,
  onBackToQueue,
  dock,
}: {
  station: PackStation;
  lang: Lang;
  /** live: real camera; demo: the shutter uses the scripted fixture */
  captureMode: 'camera' | 'fixture';
  onBackToQueue?: () => void;
  dock?: ReactNode;
}) {
  const { view, decision, inputs, needLabel, sealed, checked, latestPhoto, camera, scanner, busy, actions } = station;
  const pm = productMap(view.products);
  const minConf = withDefaults(view.settings).packConfidenceMin;
  const alerted = decision.lines.some((l) => l.alertActive);
  const evidence = inputs.overview?.vision ? inputs.overview : null;
  const cameraOpen = !!camera && captureMode === 'camera';

  // Keep the screen awake while the station is open (addendum section 7).
  useEffect(() => {
    if (captureMode !== 'camera' || !('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    navigator.wakeLock.request('screen').then((l) => (lock = l)).catch(() => {});
    return () => void lock?.release().catch(() => {});
  }, [captureMode]);

  // Bring the newest result into view on a small screen or the demo frame.
  const resultRef = useRef<HTMLDivElement>(null);
  const showResult = () => resultRef.current?.scrollIntoView({ block: 'nearest', behavior: scrollBehavior() });
  useEffect(() => {
    resultRef.current?.scrollIntoView({ block: 'nearest', behavior: scrollBehavior() });
  }, [decision.status, latestPhoto?.photoId]);

  const shoot = (target: PackCameraTarget) =>
    captureMode === 'camera' ? actions.openCamera(target) : void actions.capture(target, null);
  const overview = () => shoot({ purpose: 'pack_check' });
  const labelFirst = () => needLabel[0] && shoot({ purpose: 'label_closeup', sku: needLabel[0] });

  const unexpectedNames = decision.unexpected.map((u) => (u.sku ? name(pm.get(u.sku), u.sku, lang) : t('unclearItem', lang)));

  // The one main action of the screen (always primary, always a tap).
  let main: ReactNode = null;
  if (sealed) {
    main = onBackToQueue && (
      <Button block icon="arrow-right" onClick={onBackToQueue}>
        {t('nextOrder', lang)}
      </Button>
    );
  } else if (!cameraOpen) {
    main = !checked ? (
      <Button block icon="camera" onClick={overview} disabled={busy !== null}>
        {t('check', lang)}
      </Button>
    ) : decision.canSeal ? (
      <Button block icon="ok" onClick={() => void actions.seal()} disabled={busy !== null} data-testid="seal">
        {busy === 'seal' ? t('checking', lang) : t('readyToSeal', lang)}
      </Button>
    ) : decision.status === 'NEEDS_LABEL_PHOTO' && needLabel.length > 0 ? (
      <Button block icon="label" onClick={labelFirst} disabled={busy !== null}>
        {t('showLabel', lang)}
      </Button>
    ) : (
      <Button block icon="camera" onClick={overview} disabled={busy !== null}>
        {decision.status === 'RETAKE' ? t('retake', lang) : t('checkAgain', lang)}
      </Button>
    );
  }

  return (
    <div className="flex flex-1 flex-col" data-pack-status={checked ? decision.status : 'START'}>
      <div className="flex flex-col gap-6 p-4">
        {busy === 'capture' && !cameraOpen && (
          <p className="sp-busy m-0" aria-live="polite">
            {t('checking', lang)}
          </p>
        )}
        {!sealed && !cameraOpen && checked && busy !== 'capture' && (
          <div className="flex flex-col gap-3" ref={resultRef}>
            <Verdict d={decision} lang={lang} />
            {latestPhoto && (
              <PhotoStage
                url={latestPhoto.url}
                boxes={photoBoxes(latestPhoto, decision, view.products, minConf, lang)}
                alt={latestPhoto.purpose === 'pack_check' ? t('check', lang) : t('stepLabel', lang)}
                onLoad={showResult}
                testId="pack-photo"
                meta={[`${t('order', lang)} ${view.order.id}`, latestPhoto.purpose === 'pack_check' ? t('check', lang) : t('stepLabel', lang)]}
              />
            )}
            {decision.status === 'MISMATCH' && unexpectedNames.length > 0 && (
              <ul className="m-0 flex list-none flex-wrap gap-2 p-0" data-testid="unexpected">
                {unexpectedNames.map((n, k) => (
                  <li key={k}>
                    <StatusChip tone="stop">
                      {t('notInOrder', lang)}: {n}
                    </StatusChip>
                  </li>
                ))}
              </ul>
            )}
            {(decision.status === 'VERIFIED' || decision.status === 'MANUAL_CONFIRM') && evidence && (
              <span>
                <StatusChip tone="ok" icon="camera">
                  {t('evidenceSaved', lang)}
                </StatusChip>
              </span>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="type-title m-0">
            {t('order', lang)} <span className="sp-mono">#{view.order.id}</span>
          </h1>
          {inputs.retakes > 0 && !sealed && (
            <StatusChip icon="camera" data-testid="retakes">
              {t('retakes', lang)}: <span className="sp-mono">{inputs.retakes}</span>
            </StatusChip>
          )}
        </div>

        {alerted && !sealed && (
          <Banner tone="warn" role="alert" data-testid="alert-banner">
            {t('alertBanner', lang)}
          </Banner>
        )}

        {station.notice && (
          <Banner tone={station.notice.tone === 'bad' ? 'error' : station.notice.tone === 'warn' ? 'warn' : 'info'} icon={station.notice.tone === 'ok' ? 'ok' : undefined} role="alert">
            {t(station.notice.key, lang)}
          </Banner>
        )}

        {sealed ? (
          <section className="sp-done" data-testid="sealed">
            <span className="sp-done__icon sp-done__icon--ok" aria-hidden>
              <Icon name="ok" />
            </span>
            <h2 className="type-title m-0">{t('sealed', lang)}</h2>
            <p className="type-body m-0">
              {view.committed!.status === 'MANUAL_CONFIRM' ? t('manualChosen', lang) : view.committed!.method === 'barcode' ? t('barcode', lang) : t('correct', lang)}
              {view.committed!.evidencePhotoId && <> · {t('evidenceSaved', lang)}</>}
            </p>
          </section>
        ) : cameraOpen ? (
          <Camera
            lang={lang}
            hint={camera.purpose === 'pack_check' ? t('hintBox', lang) : `${t('hintLabelCloseup', lang)} ${name(pm.get(camera.sku), camera.sku, lang)}`}
            onCapture={(jpeg) => void actions.capture(camera, jpeg)}
            onCancel={actions.closeCamera}
            controlRef={station.cameraControl}
            countdown={station.countdown}
          />
        ) : (
          !checked && busy !== 'capture' && <p className="type-body m-0">{t('packStart', lang)}</p>
        )}

        {!sealed && !cameraOpen && (
          <ul className="sp-lines" aria-label={t('order', lang)}>
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

        {/* The other paths: check again, cancel a manual choice, manual confirm with a reason, barcode. */}
        {!sealed && !cameraOpen && checked && (
          <div className="flex flex-col gap-3 empty:hidden">
            {decision.canSeal && decision.status === 'MANUAL_CONFIRM' && decision.escalations.includes('manual_confirm_on_alert') && <Banner tone="warn">{t('manualLeadNotified', lang)}</Banner>}
            {decision.canSeal && decision.status === 'MANUAL_CONFIRM' && (
              <Button variant="secondary" block onClick={() => void actions.chooseManual(null)}>
                {t('cancel', lang)}
              </Button>
            )}
            {!decision.canSeal && decision.status === 'NEEDS_LABEL_PHOTO' && needLabel.length > 0 && (
              <Button variant="secondary" block icon="camera" onClick={overview} disabled={busy !== null}>
                {t('checkAgain', lang)}
              </Button>
            )}
            {decision.canManualConfirm && decision.status !== 'MANUAL_CONFIRM' && (
              <Card eyebrow={t('manualConfirm', lang)} data-testid="manual-confirm">
                <p className="type-body m-0">{t('manualWhy', lang)}</p>
                <div className="flex flex-wrap gap-2">
                  {REASONS.map((r) => (
                    <Button key={r.v} variant="secondary" className="flex-[1_1_auto]" disabled={busy !== null} onClick={() => void actions.chooseManual(r.v)}>
                      {t(r.key, lang)}
                    </Button>
                  ))}
                </div>
              </Card>
            )}
          </div>
        )}
        {!sealed && !cameraOpen && scanner === false && (
          <Button variant="quiet" icon="barcode" onClick={() => actions.openScanner(null)}>
            {t('scanBarcode', lang)}
          </Button>
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
