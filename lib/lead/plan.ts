// What a lead action does, decided on the server from stored data. Pure and deterministic:
// the route loads the item, reruns the engine, and calls these. R15: an override needs a reason,
// the refund stays capped at the order line value, and the shelf must exist.
// Action meanings (docs/decisions.md): approve = accept the decision as it stands (or the engine's
// proposal for an item nobody could confirm); override = change grade, shelf or refund with a
// reason; reject = no refund (0 kr) with a reason. Cards that are not about a return item can only
// be approved or rejected; that records the lead's call and changes no data.

import { applyOverride } from '@/lib/engine/returns';
import type { Cause, Grade, Product, ReturnDecision } from '@/lib/engine/types';
import type { EscalationEntity, LeadAction, LeadDecisionView } from './types';

export const REASON_NB: Record<string, string> = {
  suspicious_note: 'Mistenkelig kundelapp',
  low_confidence_after_retakes: 'Usikker identifisering',
  wrong_item_inconclusive: 'Feil vare, uklar årsak',
  customer_caused_damage: 'Skade fra kunden',
  unknown_return: 'Ukjent pakke',
  late_return: 'For sen retur',
  manual_confirm_on_alert: 'Manuelt bekreftet med pakkevarsel',
  face_in_frame_repeated: 'Ansikt i bildet',
  worker_request: 'Sendt av medarbeider',
};

export const REASON_EN: Record<string, string> = {
  suspicious_note: 'Suspicious customer note',
  low_confidence_after_retakes: 'Unsure identification',
  wrong_item_inconclusive: 'Wrong item, unclear cause',
  customer_caused_damage: 'Customer-caused damage',
  unknown_return: 'Unknown parcel',
  late_return: 'Late return',
  manual_confirm_on_alert: 'Manual confirm on an alert',
  face_in_frame_repeated: 'Face in frame',
  worker_request: 'Sent by worker',
};

export interface ResolveRequest {
  action: LeadAction;
  grade?: Grade;
  locationCode?: string;
  refundNok?: number;
  /** required for override and reject */
  reason?: string;
  /** optional for approve */
  note?: string;
}

/** The decision row the resolve function writes. */
export interface PlannedDecision {
  grade: Grade;
  locationCode: string;
  refundNok: number | null;
  cause: Cause | null;
  flags: string[];
  receivedSku: string | null;
  isOverride: boolean;
  overrideReason: string | null;
}

export type PlanError = 'reason_required' | 'refund_required' | 'not_ready' | 'not_applicable' | 'bad_location' | 'shelf_required' | 'grade_required';

export type Plan =
  | { ok: true; decision: PlannedDecision | null; writesItemEffects: boolean; note: string | null }
  | { ok: false; error: PlanError };

export interface ItemState {
  /** latest stored decision, null while undecided */
  decided: (LeadDecisionView & { receivedSku: string | null }) | null;
  /** the server's engine rerun from stored photos and worker input */
  proposal: ReturnDecision;
}

/** Which buttons a card offers (the server still checks each request). */
export function availableActions(entity: EscalationEntity, item?: ItemState) {
  if (entity !== 'return_item' || !item) return { approve: true, override: false, reject: true, refundRequired: false };
  if (item.decided) {
    const refundRequired = item.decided.refundNok === null;
    return { approve: !refundRequired, override: true, reject: true, refundRequired };
  }
  const p = item.proposal;
  const ready = !!p.grade && !!p.locationCode && p.refundNok !== null;
  return { approve: ready, override: true, reject: !!p.grade, refundRequired: !ready };
}

export function planResolution(
  entity: EscalationEntity,
  req: ResolveRequest,
  item: ItemState | undefined,
  ctx: { products: Product[]; validLocations: string[] },
): Plan {
  const reason = req.reason?.trim() || null;
  const note = req.note?.trim() || null;
  if ((req.action === 'override' || req.action === 'reject') && !reason) return { ok: false, error: 'reason_required' };

  if (entity !== 'return_item' || !item) {
    if (req.action === 'override') return { ok: false, error: 'not_applicable' };
    return { ok: true, decision: null, writesItemEffects: false, note: reason ?? note };
  }

  const p = item.proposal;
  const base = item.decided
    ? { grade: item.decided.grade, locationCode: item.decided.locationCode, refundNok: item.decided.refundNok, lineValueNok: p.lineValueNok, receivedSku: item.decided.receivedSku }
    : { grade: p.grade, locationCode: p.locationCode, refundNok: p.refundNok, lineValueNok: p.lineValueNok, receivedSku: p.receivedSku };
  const cause = item.decided ? item.decided.cause : p.cause;
  const flags = item.decided ? item.decided.flags : p.flags;
  const writesItemEffects = !item.decided;

  if (req.action === 'approve') {
    if (item.decided) {
      if (item.decided.refundNok === null) return { ok: false, error: 'refund_required' };
      return { ok: true, decision: null, writesItemEffects: false, note };
    }
    if (!p.grade || !p.locationCode) return { ok: false, error: 'not_ready' };
    if (p.refundNok === null) return { ok: false, error: 'refund_required' };
    return {
      ok: true,
      writesItemEffects,
      note,
      decision: { grade: p.grade, locationCode: p.locationCode, refundNok: p.refundNok, cause, flags, receivedSku: p.receivedSku, isOverride: false, overrideReason: null },
    };
  }

  const change =
    req.action === 'reject'
      ? { refundNok: 0, reason: reason! }
      : { grade: req.grade, locationCode: req.locationCode || undefined, refundNok: req.refundNok, reason: reason! };
  let o: ReturnType<typeof applyOverride>;
  try {
    o = applyOverride(base, change, ctx);
  } catch (e) {
    const msg = (e as Error).message;
    // A grade A item that was never identified has no own shelf: the lead picks one.
    if (msg === 'Unknown location null') return { ok: false, error: 'shelf_required' };
    return { ok: false, error: msg.startsWith('Unknown location') ? 'bad_location' : msg.includes('grade') ? 'grade_required' : 'reason_required' };
  }
  if (o.refundNok === null) return { ok: false, error: 'refund_required' };
  return {
    ok: true,
    writesItemEffects,
    note: reason,
    decision: { grade: o.grade, locationCode: o.locationCode, refundNok: o.refundNok, cause, flags, receivedSku: base.receivedSku, isOverride: true, overrideReason: o.overrideReason },
  };
}

const nok = (n: number) => `${n.toLocaleString('nb-NO').replace(/\s/g, ' ')} kr`;

/** Audit lines for a resolution, in Norwegian and English. Deterministic, never model prose. */
export function resolutionLines(refLabelNb: string, refLabelEn: string, reasonKey: string, action: LeadAction, d: PlannedDecision | null, text: string | null) {
  const rNb = REASON_NB[reasonKey] ?? reasonKey;
  const rEn = REASON_EN[reasonKey] ?? reasonKey;
  const quoteNb = text ? ` Grunn: «${text}»` : '';
  const quoteEn = text ? ` Reason: "${text}"` : '';
  const facts = d ? { nb: `grad ${d.grade}, ${d.locationCode}, refusjon ${d.refundNok === null ? '–' : nok(d.refundNok)}`, en: `grade ${d.grade}, ${d.locationCode}, refund ${d.refundNok ?? '–'} NOK` } : null;
  switch (action) {
    case 'approve':
      return {
        nb: `${refLabelNb}: sak godkjent av teamleder (${rNb})${facts ? `, ${facts.nb}` : ''}.${text ? ` Merknad: «${text}»` : ''}`,
        en: `${refLabelEn}: case approved by team lead (${rEn})${facts ? `, ${facts.en}` : ''}.${text ? ` Note: "${text}"` : ''}`,
      };
    case 'override':
      return {
        nb: `${refLabelNb}: overstyrt av teamleder til ${facts?.nb ?? '–'} (${rNb}).${quoteNb}`,
        en: `${refLabelEn}: overridden by team lead to ${facts?.en ?? '–'} (${rEn}).${quoteEn}`,
      };
    case 'reject':
      return d
        ? { nb: `${refLabelNb}: refusjon avvist av teamleder, ${facts!.nb} (${rNb}).${quoteNb}`, en: `${refLabelEn}: refund rejected by team lead, ${facts!.en} (${rEn}).${quoteEn}` }
        : { nb: `${refLabelNb}: sak avvist av teamleder (${rNb}).${quoteNb}`, en: `${refLabelEn}: case rejected by team lead (${rEn}).${quoteEn}` };
  }
}
