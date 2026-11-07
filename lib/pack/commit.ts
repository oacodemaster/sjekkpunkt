// Builds the payloads for the record_pack_mismatch / commit_pack_check SQL functions, and the
// Norwegian and English lines for the audit log and the lead. Pure: the API routes supply the
// engine decision computed from stored rows (R16). Deterministic text, never model prose.

import { productMap, sortedPair } from '@/lib/engine/catalog';
import type { ManualReason, PackDecision, Product } from '@/lib/engine/types';
import { unitCount } from './inputs';

const MANUAL_NB: Record<ManualReason, string> = { polybag: 'plastpose', glare: 'gjenskinn', other: 'annet' };

const nameNb = (pm: Map<string, Product>, sku: string | null) => (sku ? (pm.get(sku)?.nameNb ?? sku) : 'ukjent vare');
const nameEn = (pm: Map<string, Product>, sku: string | null) => (sku ? (pm.get(sku)?.nameEn ?? sku) : 'unknown item');

/** Per-line results as stored on the pack check (no model free text). */
export function lineResults(d: PackDecision) {
  return {
    lines: d.lines.map((l) => ({
      sku: l.sku,
      ordered: l.ordered,
      seen: l.seen,
      state: l.state,
      sizeVerified: l.sizeVerified,
      method: l.method,
      confidence: Number(l.confidence.toFixed(3)),
      alertActive: l.alertActive,
      ...(l.labelSizeMismatch ? { labelSize: l.labelSizeMismatch } : {}),
    })),
    unexpected: d.unexpected.map((u) => ({ sku: u.sku, confidence: Number(u.confidence.toFixed(3)) })),
  };
}

/** "Hettegenser, sort, M i stedet for Hettegenser, marineblå, M; mangler 1 × Ullsokker" */
export function mismatchLines(orderExt: string, d: PackDecision, products: Product[], wrongScanSku?: string): { nb: string; en: string } {
  const pm = productMap(products);
  const nb: string[] = [];
  const en: string[] = [];
  if (wrongScanSku) {
    nb.push(`skannet ${nameNb(pm, wrongScanSku)}, som ikke er i ordren`);
    en.push(`scanned ${nameEn(pm, wrongScanSku)}, which is not in the order`);
  }
  for (const u of d.unexpected) {
    nb.push(`${nameNb(pm, u.sku)} er ikke i ordren`);
    en.push(`${nameEn(pm, u.sku)} is not in the order`);
  }
  for (const l of d.lines) {
    if (l.labelSizeMismatch) {
      nb.push(`etiketten på ${nameNb(pm, l.sku)} viser ${l.labelSizeMismatch}`);
      en.push(`the label on ${nameEn(pm, l.sku)} says ${l.labelSizeMismatch}`);
    } else if (l.state === 'missing') {
      nb.push(`mangler ${l.diff} × ${nameNb(pm, l.sku)}`);
      en.push(`missing ${l.diff} × ${nameEn(pm, l.sku)}`);
    } else if (l.state === 'extra') {
      nb.push(`${l.diff} for mye av ${nameNb(pm, l.sku)}`);
      en.push(`${l.diff} extra × ${nameEn(pm, l.sku)}`);
    }
  }
  return {
    nb: `Ordre ${orderExt}: feil stoppet før forsegling (${nb.join('; ') || 'feil vare'})`,
    en: `Order ${orderExt}: mistake caught before sealing (${en.join('; ') || 'wrong item'})`,
  };
}

export interface MismatchInput {
  warehouseId: string;
  orderId: string;
  orderExt: string;
  deviceId: string | null;
  decision: PackDecision;
  products: Product[];
  method: 'camera' | 'barcode';
  photoId: string | null;
  /** extra confusion pairs found outside the engine (a wrong barcode scanned) */
  extraPairs?: [string, string][];
  wrongScanSku?: string;
}

export function mismatchPayload(m: MismatchInput) {
  const pairs = new Map<string, [string, string]>();
  for (const e of m.decision.confusionEvents) {
    const p = sortedPair(e.skuPair[0], e.skuPair[1]);
    pairs.set(p.join('|'), p);
  }
  for (const [a, b] of m.extraPairs ?? []) {
    if (a !== b) pairs.set(sortedPair(a, b).join('|'), sortedPair(a, b));
  }
  const text = mismatchLines(m.orderExt, m.decision, m.products, m.wrongScanSku);
  return {
    warehouse_id: m.warehouseId,
    order_id: m.orderId,
    device_id: m.deviceId,
    method: m.method,
    photo_id: m.photoId,
    confidence: m.decision.confidence,
    line_results: lineResults(m.decision),
    engine_version: m.decision.engineVersion,
    confusion: [...pairs.values()].map(([a, b]) => ({ sku_a: a, sku_b: b })),
    audit: { ref_label: m.orderExt, summary_nb: text.nb, summary_en: text.en, payload: { decision: m.decision } },
  };
}

export function sealLines(orderExt: string, d: PackDecision, manualReason: ManualReason | null, evidence: boolean): { nb: string; en: string } {
  const { seen, ordered } = unitCount(d);
  if (d.status === 'MANUAL_CONFIRM') {
    const r = manualReason ?? 'other';
    return {
      nb: `Ordre ${orderExt} manuelt bekreftet (${MANUAL_NB[r]}), størrelse ikke lest`,
      en: `Order ${orderExt} confirmed manually (${r}), size not read`,
    };
  }
  const how = d.method === 'barcode' ? 'strekkode' : 'kamera';
  return {
    nb: `Ordre ${orderExt} verifisert med ${how}, ${seen} av ${ordered} varer${evidence ? ', bevisfoto lagret' : ''}`,
    en: `Order ${orderExt} verified by ${d.method === 'barcode' ? 'barcode' : 'camera'}, ${seen} of ${ordered} items${evidence ? ', evidence photo saved' : ''}`,
  };
}

export function manualOnAlertSummaryNb(orderExt: string, d: PackDecision, products: Product[], manualReason: ManualReason | null): string {
  const pm = productMap(products);
  const alerted = d.lines.filter((l) => l.alertActive).map((l) => nameNb(pm, l.sku));
  return (
    `Ordre ${orderExt}: ${alerted.join(' og ')} har aktivt pakkevarsel, men ble bekreftet manuelt ` +
    `(${MANUAL_NB[manualReason ?? 'other']}) uten at størrelsen ble lest. Sjekk gjerne pakken før den sendes.`
  );
}

export interface SealInput {
  warehouseId: string;
  orderId: string;
  orderExt: string;
  customerRef: string;
  deviceId: string | null;
  userId: string | null;
  decision: PackDecision;
  products: Product[];
  manualReason: ManualReason | null;
  evidencePhotoId: string | null;
  photoIds: string[];
}

export function sealPayload(s: SealInput) {
  const d = s.decision;
  if (!d.canSeal || (d.status !== 'VERIFIED' && d.status !== 'MANUAL_CONFIRM')) throw new Error('Decision is not ready to seal');
  const manual = d.status === 'MANUAL_CONFIRM';
  const text = sealLines(s.orderExt, d, s.manualReason, !!s.evidencePhotoId);
  return {
    warehouse_id: s.warehouseId,
    order_id: s.orderId,
    device_id: s.deviceId,
    // A person is recorded only for a manual confirm (addendum section 4).
    user_id: manual ? s.userId : null,
    status: d.status,
    method: d.method,
    size_verified: d.sizeVerified,
    confidence: d.confidence,
    evidence_photo_id: s.evidencePhotoId,
    manual_reason: manual ? s.manualReason : null,
    line_results: lineResults(d),
    engine_version: d.engineVersion,
    escalations: d.escalations.map((reason) => ({
      reason,
      summary_nb: reason === 'manual_confirm_on_alert' ? manualOnAlertSummaryNb(s.orderExt, d, s.products, s.manualReason) : `Ordre ${s.orderExt}: ${reason}`,
    })),
    // What Holio would receive (addendum section 7), in Holio's vocabulary.
    event: {
      ordre: s.orderExt,
      kunde: s.customerRef,
      status: d.status,
      metode: d.method,
      storrelseLest: d.sizeVerified,
      sikkerhet: Number(d.confidence.toFixed(3)),
      linjer: d.lines.map((l) => ({ sku: l.sku, antall: l.ordered, sett: l.seen, storrelseLest: l.sizeVerified, metode: l.method })),
      pakkebevis: s.evidencePhotoId,
      bilder: s.photoIds,
      manuellGrunn: manual ? s.manualReason : null,
      motorversjon: d.engineVersion,
    },
    audit: { ref_label: s.orderExt, summary_nb: text.nb, summary_en: text.en, payload: { decision: d, manualReason: s.manualReason } },
  };
}
