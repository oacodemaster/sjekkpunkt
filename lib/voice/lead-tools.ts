// The lead agent's client tools: parameter schemas and the short results the agent gets.
// Pure and client-safe. The agent explains; it cannot resolve anything (no tool changes data).
// Results carry the stored summary, reasons, decision facts and the worker's note. Never the text
// of a customer note: only whether it was flagged (LLM01).

import { z } from 'zod';
import { REASON_NB } from '@/lib/lead/plan';
import type { LeadCard } from '@/lib/lead/types';

export const LeadToolParams = {
  list_escalations: z.object({}).loose(),
  get_escalation: z.object({ number: z.coerce.number().int().min(1).optional() }).loose(),
  show_escalation: z.object({ number: z.coerce.number().int().min(1) }),
} as const;

const json = (v: unknown) => JSON.stringify(v);
export const leadToolError = (error: string, say?: string) => json({ error, ...(say ? { say } : {}) });

const CAUSE_NB: Record<string, string> = {
  likely_warehouse_error: 'sannsynlig pakkefeil',
  inconclusive: 'uklar årsak, pakkebeviset viste riktig vare',
  unknown: 'ukjent, ingen pakkebevis',
  customer_side: 'kundens side',
  transit_damage: 'transportskade',
};

const FLAG_NB: Record<string, string> = {
  suspicious_note: 'mistenkelig kundelapp',
  wrong_item: 'feil vare',
  late_return: 'for sen retur',
  carrier_claim: 'krav mot transportør',
};

const EVIDENCE_NB: Record<string, string> = { VERIFIED: 'verifisert med kamera', MANUAL_CONFIRM: 'manuelt bekreftet' };

function minutesAgo(iso: string, now: Date) {
  return Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / 60000));
}

export function listResult(cards: LeadCard[], now: Date): string {
  return json({
    open_count: cards.length,
    escalations: cards.map((c, k) => ({
      number: k + 1,
      case: c.refLabel,
      reason: REASON_NB[c.reason] ?? c.reason,
      minutes_ago: minutesAgo(c.createdAt, now),
    })),
  });
}

/** What the lead can tap on this card, in plain words for the agent. */
function actionsNb(c: LeadCard): string[] {
  const out: string[] = [];
  if (c.actions.approve) out.push('Godkjenn');
  if (c.actions.override) out.push('Overstyr (grad, hylle eller refusjon, med grunn)');
  if (c.actions.reject) out.push(c.entityType === 'return_item' ? 'Avvis refusjon (med grunn)' : 'Avvis');
  return out;
}

export function escalationResult(card: LeadCard, number: number, now: Date): string {
  const i = card.item;
  const confidences = (i?.photos ?? []).map((p) => p.confidence).filter((x): x is number => x !== null);
  return json({
    number,
    case: card.refLabel,
    reason: REASON_NB[card.reason] ?? card.reason,
    minutes_ago: minutesAgo(card.createdAt, now),
    summary_nb: card.summaryNb,
    ...(i
      ? {
          item: {
            ordered: i.orderedName,
            received: i.receivedName,
            wrong_item: !!i.receivedSku && i.receivedSku !== i.orderedSku,
            line_value_nok: i.lineValueNok,
            decision: i.decision
              ? {
                  grade: i.decision.grade,
                  shelf: i.decision.locationCode,
                  refund_nok: i.decision.refundNok,
                  refund_decided_by_lead: i.decision.refundNok === null,
                  cause: i.decision.cause ? CAUSE_NB[i.decision.cause] : null,
                  flags: i.decision.flags.map((f) => FLAG_NB[f] ?? f),
                  overridden: i.decision.isOverride,
                }
              : null,
            engine_proposal: i.decision ? undefined : { grade: i.proposal.grade, shelf: i.proposal.locationCode, refund_nok: i.proposal.refundNok },
            photos_taken: i.photos.filter((p) => !p.facesDiscarded).length,
            model_confidence: confidences.length ? { lowest: Math.min(...confidences), highest: Math.max(...confidences) } : null,
            customer_note_flagged: i.suspiciousNote,
            packing_evidence: i.packEvidence
              ? { status: EVIDENCE_NB[i.packEvidence.status] ?? i.packEvidence.status, size_read_at_packing: i.packEvidence.sizeVerified }
              : null,
          },
          worker_note: i.workerNote ? { original: i.workerNote.original, language: i.workerNote.lang, norwegian: i.workerNote.nb } : null,
        }
      : {}),
    ...(card.order
      ? { order: { number: card.order.orderExt, check: EVIDENCE_NB[card.order.status] ?? card.order.status, manual_reason: card.order.manualReason, size_read: card.order.sizeVerified } }
      : {}),
    lead_can_tap: actionsNb(card),
    note: 'You cannot resolve this. The lead taps the buttons.',
  });
}
