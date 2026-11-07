import { isSizeVariant, productMap, siblingBySize } from './catalog';
import { ENGINE_VERSION, SPECIAL_LOCATIONS, withDefaults } from './constants';
import { computeGrade, mergeCondition } from './grade';
import { detectInstructions } from './injection';
import { confusionEvent } from './loop';
import type {
  Cause,
  ConfusionEvent,
  EscalationReason,
  Grade,
  Order,
  PackCheck,
  PhotoPurpose,
  Product,
  ReturnCase,
  ReturnDecision,
  ReturnContext,
  ReturnFindings,
  ReturnFlag,
  ReturnInspection,
  ReturnItemStatus,
  StockProposal,
  WorkerInput,
} from './types';

const DAY_MS = 24 * 60 * 60 * 1000;

/** R2 */
export function requiredPhotos(product: Product, damageSuspected: boolean): PhotoPurpose[] {
  if (product.category === 'accessory') return ['front', 'packaging'];
  return damageSuspected ? ['front', 'label', 'damage'] : ['front', 'label'];
}

/** R6 */
export function shelfFor(grade: Grade, receivedProduct: Product | undefined): string | null {
  switch (grade) {
    case 'A':
      return receivedProduct?.location ?? null;
    case 'B':
      return SPECIAL_LOCATIONS.outlet;
    case 'C':
      return SPECIAL_LOCATIONS.repair;
    case 'D':
      return SPECIAL_LOCATIONS.scrap;
  }
}

/** R14. Late returns are escalated, never rejected automatically. */
export function isLateReturn(
  shippedAt: string | undefined,
  registeredAt: string | undefined,
  windowDays: number,
): boolean {
  if (!shippedAt || !registeredAt) return false;
  return new Date(registeredAt).getTime() - new Date(shippedAt).getTime() > windowDays * DAY_MS;
}

/** R3: pick the identity source (label first) and resolve a size read to a sibling SKU. */
function resolveIdentity(
  inspections: ReturnInspection[],
  orderedSku: string,
  products: Product[],
): { receivedSku: string | null; confidence: number } {
  const pm = productMap(products);
  const ordered = pm.get(orderedSku);
  // A size-variant item (shell jacket M/L) can only be identified by a size read. A front
  // shot that "recognises" the ordered size without reading it is a guess, not evidence.
  const needsSize = ordered ? isSizeVariant(ordered, products) : false;
  const ranked = inspections
    .filter((i) => (needsSize ? !!i.sizeRead : i.identifiedSku || i.sizeRead))
    .filter((i) => i.photoPurpose === 'label' || i.photoPurpose === 'front' || i.photoPurpose === 'packaging')
    .sort((a, b) => {
      const pa = a.photoPurpose === 'label' ? 1 : 0;
      const pb = b.photoPurpose === 'label' ? 1 : 0;
      return pb - pa || b.identityConfidence - a.identityConfidence;
    });
  const src = ranked[0];
  if (!src) return { receivedSku: null, confidence: 0 };

  let receivedSku = src.identifiedSku && pm.has(src.identifiedSku) ? src.identifiedSku : null;
  if (src.sizeRead) {
    const base = pm.get(receivedSku ?? orderedSku);
    const sib = base ? siblingBySize(base, src.sizeRead, products) : undefined;
    if (sib) receivedSku = sib.sku;
  }
  return { receivedSku, confidence: src.identityConfidence };
}

/**
 * Returns rules R1-R17 for one return item (R12: each item is decided on its own).
 * The server reruns this from stored rows on confirm (R16); the client only previews.
 */
export function evaluateReturn(
  ret: ReturnCase,
  order: Order,
  packEvidence: PackCheck | null,
  findings: ReturnFindings,
  worker: WorkerInput,
  ctx: ReturnContext,
): ReturnDecision {
  const s = withDefaults(ctx.settings);
  const pm = productMap(ctx.products);
  const item = ret.items[ctx.itemIndex ?? 0];
  if (!item) throw new Error(`Return ${ret.id} has no item ${ctx.itemIndex ?? 0}`);
  const ordered = pm.get(item.orderedSku);
  if (!ordered) throw new Error(`Unknown SKU ${item.orderedSku}`);

  // R1: order line value is the hard ceiling for any refund (R7, R15)
  const line = order.lines.find((l) => l.sku === item.orderedSku);
  const lineValueNok = line ? line.priceNok * Math.min(item.qty, line.qty) : 0;

  const valid = findings.inspections.filter((i) => !i.facePresent);
  const condition = mergeCondition(valid, worker);
  const damageSuspected = condition.damage !== 'none' || condition.stains !== 'none';

  // R2
  const required = requiredPhotos(ordered, damageSuspected);
  const taken = new Set(valid.map((i) => i.photoPurpose));
  const missingPhotos = required.filter((p) => !taken.has(p));

  // R3 + R9
  const { receivedSku, confidence } = resolveIdentity(valid, item.orderedSku, ctx.products);
  const identityOk = receivedSku !== null && confidence >= s.returnConfidenceMin;
  const retakes = findings.retakes ?? 0;

  const escalations: EscalationReason[] = [];
  let status: ReturnItemStatus;
  if (missingPhotos.length > 0) status = 'needs_photos';
  else if (!identityOk) {
    if (retakes >= s.maxRetakes) {
      status = 'escalated';
      escalations.push('low_confidence_after_retakes');
    } else status = 'needs_retake';
  } else status = 'ready';

  // R3 + R4
  const wrongItemShipped = identityOk && receivedSku !== item.orderedSku;
  let cause: Cause | null = null;
  if (wrongItemShipped) {
    if (!packEvidence) cause = 'unknown';
    else if (packEvidence.status === 'VERIFIED' && packEvidence.sizeVerified) cause = 'inconclusive';
    else cause = 'likely_warehouse_error';
  } else if (identityOk) {
    cause = 'customer_side';
  }
  if (cause === 'inconclusive') escalations.push('wrong_item_inconclusive');

  // R5 + R6
  const grade = valid.length > 0 ? computeGrade(condition) : null;
  const receivedProduct = receivedSku ? pm.get(receivedSku) : undefined;
  const locationCode = grade ? shelfFor(grade, receivedProduct) : null;

  // R7: never more than the line value; C/D with customer-side cause goes to the lead
  let refundNok: number | null = null;
  if (grade && (grade === 'A' || grade === 'B' || cause === 'likely_warehouse_error')) {
    refundNok = lineValueNok;
  }
  if (grade && (grade === 'C' || grade === 'D') && cause === 'customer_side') {
    escalations.push('customer_caused_damage');
  }

  // R8: customer note is text only
  const noteTexts = valid
    .map((i) => i.customerNoteText)
    .filter((t): t is string => !!t && t.trim().length > 0);
  const customerNoteText = noteTexts.length ? noteTexts.join('\n') : null;
  const suspiciousNote =
    valid.some((i) => i.containsInstructions) || noteTexts.some((t) => detectInstructions(t));
  if (suspiciousNote) escalations.push('suspicious_note');

  // R14
  const late = isLateReturn(order.shippedAt, ret.registeredAt, s.returnWindowDays);
  if (late) escalations.push('late_return');

  if ((findings.faceDiscards ?? 0) >= s.maxRetakes) escalations.push('face_in_frame_repeated');

  // R10 + R11
  const stockProposals: StockProposal[] = [];
  const confusionEvents: ConfusionEvent[] = [];
  if (wrongItemShipped && receivedSku) {
    stockProposals.push(
      { sku: item.orderedSku, delta: item.qty, reason: 'wrong_item_not_shipped' },
      { sku: receivedSku, delta: -item.qty, reason: 'wrong_item_shipped' },
    );
    confusionEvents.push(confusionEvent(item.orderedSku, receivedSku, 'found_at_returns', ctx.now));
  }

  const flags: ReturnFlag[] = [];
  if (suspiciousNote) flags.push('suspicious_note');
  if (wrongItemShipped) flags.push('wrong_item');
  if (late) flags.push('late_return');

  return {
    status,
    requiredPhotos: required,
    missingPhotos,
    orderedSku: item.orderedSku,
    receivedSku,
    identityConfidence: confidence,
    wrongItemShipped,
    cause,
    condition,
    grade,
    locationCode,
    lineValueNok,
    refundNok,
    stockProposals,
    customerNoteText,
    suspiciousNote,
    flags,
    escalations,
    confusionEvents,
    canConfirm: status === 'ready' && grade !== null && locationCode !== null,
    engineVersion: ENGINE_VERSION,
  };
}

/** R12: the return is confirmed when every item has a committed decision. */
export function isReturnComplete(itemDecided: boolean[]): boolean {
  return itemDecided.length > 0 && itemDecided.every(Boolean);
}

/** R13: a parcel with no registered return becomes an `unknown_return` escalation. */
export function resolveScan<T extends { id: string }>(
  code: string,
  returns: T[],
): { kind: 'found'; ret: T } | { kind: 'unknown'; escalation: 'unknown_return'; code: string } {
  const norm = code.trim().toUpperCase().replace(/^(RET|RETUR|R)[-\s:]*/, '');
  const ret = returns.find((r) => r.id.toUpperCase() === norm);
  return ret ? { kind: 'found', ret } : { kind: 'unknown', escalation: 'unknown_return', code: code.trim() };
}

export interface LeadOverride {
  grade?: Grade;
  locationCode?: string;
  refundNok?: number;
  reason: string;
}

/** R15: a lead may change grade, shelf or refund with a reason. Refund stays capped. */
export function applyOverride(
  decision: Pick<ReturnDecision, 'grade' | 'locationCode' | 'refundNok' | 'lineValueNok' | 'receivedSku'>,
  o: LeadOverride,
  ctx: { products: Product[]; validLocations: string[] },
): { grade: Grade; locationCode: string; refundNok: number | null; isOverride: true; overrideReason: string } {
  const reason = o.reason?.trim();
  if (!reason) throw new Error('Override requires a reason');
  const grade = o.grade ?? decision.grade;
  if (!grade) throw new Error('Override needs a grade');

  let locationCode = o.locationCode ?? null;
  if (!locationCode) {
    locationCode =
      o.grade && o.grade !== decision.grade
        ? shelfFor(grade, decision.receivedSku ? productMap(ctx.products).get(decision.receivedSku) : undefined)
        : decision.locationCode;
  }
  if (!locationCode || !ctx.validLocations.includes(locationCode)) {
    throw new Error(`Unknown location ${locationCode}`);
  }

  const requested = o.refundNok ?? decision.refundNok;
  const refundNok =
    requested === null || requested === undefined
      ? null
      : Math.max(0, Math.min(Math.round(requested), decision.lineValueNok));

  return { grade, locationCode, refundNok, isOverride: true, overrideReason: reason };
}
