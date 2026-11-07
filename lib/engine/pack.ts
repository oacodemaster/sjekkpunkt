import { isSizeVariant, pairKey, productMap, siblingBySize, sortedPair } from './catalog';
import { ENGINE_VERSION, withDefaults } from './constants';
import { activeAlertFor, confusionEvent } from './loop';
import type {
  Box2d,
  ConfusionEvent,
  EscalationReason,
  Order,
  PackAlert,
  PackContext,
  PackDecision,
  PackDecisionStatus,
  PackLineResult,
  PackMessageKey,
  PackMethod,
  PackUnexpected,
  PackVision,
} from './types';

const eqSize = (a: string | null | undefined, b: string | null | undefined) =>
  !!a && !!b && a.trim().toUpperCase() === b.trim().toUpperCase();

/**
 * Packing rules P1-P9 (brief section 6 + addendum section 5).
 * P5: text seen in the photo (`vision.visibleText`) is data and is never read here.
 */
export function evaluatePack(
  order: Order,
  vision: PackVision | null,
  alerts: PackAlert[],
  ctx: PackContext,
): PackDecision {
  const s = withDefaults(ctx.settings);
  const pm = productMap(ctx.products);
  const retakes = ctx.retakes ?? 0;
  const scans = ctx.barcodeScans ?? [];
  const labelChecks = ctx.labelChecks ?? [];
  const orderSkus = new Set(order.lines.map((l) => l.sku));

  const allBarcode = order.lines.every(
    (l) => scans.filter((x) => x === l.sku).length >= l.qty,
  );
  const timedOut = ctx.visionTimedOut === true || vision === null;
  const face = vision?.facePresent === true;
  const items = vision && !timedOut && !face ? vision.items : [];

  // ---- per line (P1, P2, P3, P4, P6, P7) ----
  const lines: PackLineResult[] = order.lines.map((line) => {
    const product = pm.get(line.sku);
    const camItems = items.filter((i) => i.matchedSku === line.sku);
    const barcodeCount = scans.filter((x) => x === line.sku).length;
    const method: PackMethod = barcodeCount >= line.qty ? 'barcode' : 'camera';
    const seen = Math.max(camItems.length, barcodeCount);

    const label = [...labelChecks].reverse().find((c) => c.sku === line.sku);
    const labelConfident = !!label && label.confidence >= s.packConfidenceMin;
    const labelOk = labelConfident && eqSize(label!.sizeRead, product?.size);
    const camWrongSize = camItems.find(
      (i) => i.sizeRead && product?.size && !eqSize(i.sizeRead, product.size) && i.confidence >= s.packConfidenceMin,
    );
    const labelSizeMismatch =
      labelConfident && label!.sizeRead && product?.size && !eqSize(label!.sizeRead, product.size)
        ? label!.sizeRead
        : camWrongSize?.sizeRead ?? undefined;

    const camConfidence = camItems.length ? Math.min(...camItems.map((i) => i.confidence)) : 0;
    const confidence =
      method === 'barcode' ? 1 : labelOk ? Math.max(camConfidence, label!.confidence) : camConfidence;

    const sizeVerified =
      method === 'barcode' ||
      labelOk ||
      (camItems.length > 0 &&
        camItems.every((i) => eqSize(i.sizeRead, product?.size) && i.confidence >= s.packConfidenceMin));

    const diff = seen - line.qty;
    return {
      sku: line.sku,
      ordered: line.qty,
      seen,
      state: diff < 0 ? 'missing' : diff > 0 ? 'extra' : 'present',
      diff: Math.abs(diff),
      sizeVerified,
      method,
      confidence,
      boxes: camItems.map((i) => i.box_2d as Box2d),
      alertActive: !!activeAlertFor(alerts, line.sku),
      labelSizeMismatch: labelSizeMismatch ?? undefined,
    };
  });

  const unexpectedRaw = items.filter((i) => !i.matchedSku || !orderSkus.has(i.matchedSku));
  // An item the model could not identify with confidence is uncertain, not wrong.
  const unidentified = unexpectedRaw.filter(
    (i) => i.matchedSku === null && i.confidence < s.packConfidenceMin,
  );
  const unexpected: PackUnexpected[] = unexpectedRaw
    .filter((i) => !unidentified.includes(i))
    .map((i) => ({ sku: i.matchedSku, description: i.description, confidence: i.confidence, box_2d: i.box_2d }));

  const missingUnits = lines.filter((l) => l.state === 'missing').reduce((n, l) => n + l.diff, 0);
  const hardMismatch =
    unexpected.length > 0 ||
    lines.some((l) => l.state === 'extra' || l.labelSizeMismatch) ||
    missingUnits > unidentified.length;

  const variantLines = lines.filter((l) => {
    const p = pm.get(l.sku);
    return p ? isSizeVariant(p, ctx.products) : false;
  });
  const alertUnsatisfied = lines.filter((l) => {
    if (!l.alertActive) return false;
    const label = [...labelChecks].reverse().find((c) => c.sku === l.sku);
    const labelOk =
      !!label && label.confidence >= s.packConfidenceMin && eqSize(label.sizeRead, pm.get(l.sku)?.size);
    return !(l.method === 'barcode' || labelOk);
  });
  const uncertain =
    missingUnits > 0 ||
    lines.some((l) => l.confidence < s.packConfidenceMin) ||
    variantLines.some((l) => !l.sizeVerified);

  // ---- status ----
  let status: PackDecisionStatus;
  let messageKey: PackMessageKey;
  if (face) {
    status = 'RETAKE';
    messageKey = 'faceInFrame';
  } else if (timedOut && !allBarcode) {
    status = 'RETAKE'; // P9: never auto-verify
    messageKey = 'visionTimeout';
  } else if (hardMismatch) {
    status = 'MISMATCH';
    messageKey = 'packMismatch';
  } else if (alertUnsatisfied.length > 0) {
    status = 'NEEDS_LABEL_PHOTO'; // P4: regardless of confidence
    messageKey = 'packAlertNeedsLabel';
  } else if (uncertain) {
    status = 'NEEDS_LABEL_PHOTO'; // P3
    messageKey = 'packNeedsLabel';
  } else {
    status = 'VERIFIED'; // P2
    messageKey = 'packVerified';
  }

  // ---- P8 manual confirm ----
  const canManualConfirm =
    retakes >= s.maxRetakes &&
    (status === 'NEEDS_LABEL_PHOTO' || (status === 'RETAKE' && messageKey === 'visionTimeout'));
  const escalations: EscalationReason[] = [];
  let method: PackMethod = lines.every((l) => l.method === 'barcode') ? 'barcode' : 'camera';
  if (ctx.manualReason && canManualConfirm) {
    status = 'MANUAL_CONFIRM';
    messageKey = 'packManualConfirmed';
    method = 'manual';
    if (lines.some((l) => l.alertActive)) escalations.push('manual_confirm_on_alert');
  }
  if (face && (ctx.retakes ?? 0) >= s.maxRetakes) escalations.push('face_in_frame_repeated');

  // ---- P1 confusion events: (missing SKU, unexpected SKU) in the same variant group ----
  const confusionEvents: ConfusionEvent[] = [];
  if (status === 'MISMATCH') {
    const seenPairs = new Set<string>();
    const add = (a: string, b: string) => {
      const key = pairKey(sortedPair(a, b));
      if (a === b || seenPairs.has(key)) return;
      seenPairs.add(key);
      confusionEvents.push(confusionEvent(a, b, 'caught_at_packing', ctx.now));
    };
    for (const l of lines) {
      const p = pm.get(l.sku);
      if (!p?.variantGroup) continue;
      if (l.state === 'missing') {
        for (const u of unexpected) {
          const up = u.sku ? pm.get(u.sku) : undefined;
          if (up && up.variantGroup === p.variantGroup) add(l.sku, up.sku);
        }
      }
      if (l.labelSizeMismatch) {
        const sib = siblingBySize(p, l.labelSizeMismatch, ctx.products);
        if (sib) add(l.sku, sib.sku);
      }
    }
  }

  const counted = lines.filter((l) => l.seen > 0);
  return {
    status,
    lines,
    unexpected,
    messageKey,
    confusionEvents,
    canSeal: status === 'VERIFIED' || status === 'MANUAL_CONFIRM',
    canManualConfirm,
    sizeVerified: variantLines.every((l) => l.sizeVerified),
    confidence: counted.length ? Math.min(...counted.map((l) => l.confidence)) : 0,
    method,
    escalations,
    engineVersion: ENGINE_VERSION,
  };
}
