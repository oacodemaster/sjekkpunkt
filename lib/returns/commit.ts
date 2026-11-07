// Builds the payload for the commit_return_item / escalate_return_item SQL functions.
// Pure: the API route supplies the engine decision computed from stored rows (R16).

import { sortedPair } from '@/lib/engine/catalog';
import type { Product, ReturnDecision } from '@/lib/engine/types';
import { decidedAuditLines, escalationSummaryNb, type ItemEscalationReason } from './summary';

export interface CommitInput {
  warehouseId: string;
  returnItemId: string;
  deviceId: string | null;
  returnExtId: string;
  orderExtId: string;
  customerReasonNb: string;
  decision: ReturnDecision;
  products: Product[];
  retakes: number;
  lateDays: number | null;
  returnWindowDays: number;
  workerNoteNb: string | null;
  photoIds: string[];
}

export function commitPayload(c: CommitInput) {
  const d = c.decision;
  if (!d.canConfirm || !d.grade || !d.locationCode) throw new Error('Decision is not ready to commit');
  const summaryCtx = {
    returnId: c.returnExtId,
    decision: d,
    products: c.products,
    retakes: c.retakes,
    lateDays: c.lateDays ?? undefined,
    returnWindowDays: c.returnWindowDays,
    workerNoteNb: c.workerNoteNb,
  };
  const audit = decidedAuditLines(c.returnExtId, d);
  return {
    warehouse_id: c.warehouseId,
    return_item_id: c.returnItemId,
    device_id: c.deviceId,
    engine_version: d.engineVersion,
    received_sku: d.receivedSku,
    decision: {
      grade: d.grade,
      location_code: d.locationCode,
      refund_nok: d.refundNok,
      cause: d.cause,
      flags: d.flags,
    },
    stock: d.stockProposals.map((s) => ({ sku: s.sku, delta: s.delta, reason: s.reason })),
    confusion: d.confusionEvents.map((e) => {
      const [a, b] = sortedPair(e.skuPair[0], e.skuPair[1]);
      return { sku_a: a, sku_b: b, kind: e.kind };
    }),
    escalations: d.escalations.map((reason) => ({
      reason,
      entity: reason === 'late_return' ? 'return' : 'return_item',
      summary_nb: escalationSummaryNb(reason, summaryCtx),
    })),
    // What Holio would receive (addendum section 7), in Holio's vocabulary.
    item_event: {
      retur: c.returnExtId,
      ordre: c.orderExtId,
      returaarsak: c.customerReasonNb,
      bestiltSku: d.orderedSku,
      mottattSku: d.receivedSku,
      tilstand: d.condition,
      grad: d.grade,
      lokasjon: d.locationCode,
      refusjonNok: d.refundNok,
      sannsynligAarsak: d.cause,
      flagg: d.flags,
      merknad: c.workerNoteNb,
      kundelapp: d.customerNoteText,
      bilder: c.photoIds,
      lagerkorreksjon: d.stockProposals,
      motorversjon: d.engineVersion,
    },
    audit: {
      ref_label: c.returnExtId,
      summary_nb: audit.nb,
      summary_en: audit.en,
      payload: { decision: d },
    },
  };
}

export function escalatePayload(
  c: Omit<CommitInput, 'orderExtId' | 'customerReasonNb' | 'photoIds'>,
  reasons: ItemEscalationReason[],
) {
  const summaryCtx = {
    returnId: c.returnExtId,
    decision: c.decision,
    products: c.products,
    retakes: c.retakes,
    lateDays: c.lateDays ?? undefined,
    returnWindowDays: c.returnWindowDays,
    workerNoteNb: c.workerNoteNb,
  };
  const unique = [...new Set(reasons)].filter((r) => r !== 'late_return');
  return {
    warehouse_id: c.warehouseId,
    return_item_id: c.returnItemId,
    device_id: c.deviceId,
    escalations: unique.map((reason) => ({ reason, summary_nb: escalationSummaryNb(reason, summaryCtx) })),
    audit: {
      ref_label: c.returnExtId,
      summary_nb: `Retur ${c.returnExtId}: ${c.decision.orderedSku} sendt til teamleder`,
      summary_en: `Return ${c.returnExtId}: ${c.decision.orderedSku} sent to team lead`,
      payload: { reasons: unique, decision: c.decision },
    },
  };
}
