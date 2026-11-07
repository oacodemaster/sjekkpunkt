import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { fail, guard, LEAD_ROLES, sqlError } from '@/lib/api/http';
import { sortedPair } from '@/lib/engine/catalog';
import { createAdminClient } from '@/lib/supabase/admin';
import { planResolution, resolutionLines } from '@/lib/lead/plan';
import { loadCard, loadEscalationRow, loadItemState } from '@/lib/lead/server';

const Body = z.object({
  action: z.enum(['approve', 'override', 'reject']),
  grade: z.enum(['A', 'B', 'C', 'D']).optional(),
  locationCode: z.string().trim().max(20).optional(),
  refundNok: z.number().int().min(0).max(10_000_000).optional(),
  reason: z.string().trim().max(500).optional(),
  note: z.string().trim().max(500).optional(),
});

/**
 * The lead resolves an escalation: approve, override (grade, shelf, refund with a reason, R15) or
 * reject (no refund, with a reason). The server reloads the item, reruns the engine, applies the
 * cap and writes the decision, the escalation and the audit row in one transaction
 * (public.resolve_escalation). The lead is recorded as decided_by and actor_user.
 */
export async function POST(req: NextRequest, ctx: RouteContext<'/api/lead/escalations/[id]/resolve'>) {
  const g = await guard(req, LEAD_ROLES, Body);
  if (!g.ok) return g.res;
  const { user, body } = g;
  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success) return fail('not_found', 404);

  const esc = await loadEscalationRow(id, user.warehouseId);
  if (!esc) return fail('not_found', 404);
  if (esc.status !== 'open') return fail('already_resolved', 409);

  const db = createAdminClient();
  const loaded = esc.entity_type === 'return_item' && esc.entity_id ? await loadItemState(esc.entity_id, user.warehouseId) : null;
  if (esc.entity_type === 'return_item' && !loaded) return fail('not_found', 404);
  const { data: locs } = await db.from('locations').select('code').eq('warehouse_id', user.warehouseId);
  const plan = planResolution(esc.entity_type, body, loaded?.state, {
    products: loaded?.ctx.products ?? [],
    validLocations: (locs ?? []).map((l) => l.code),
  });
  if (!plan.ok) return fail(plan.error, 422);

  const card = await loadCard(esc, user.warehouseId, false);
  const labelEn = card.refLabel.replace(/^Retur /, 'Return ').replace(/^Ordre /, 'Order ').replace(/^Pakke /, 'Parcel ');
  const lines = resolutionLines(card.refLabel, labelEn, esc.reason, body.action, plan.decision, plan.note);
  const d = plan.decision;
  const proposal = loaded?.state.proposal;
  const item = loaded?.ctx;

  const payload = {
    warehouse_id: user.warehouseId,
    escalation_id: id,
    user_id: user.userId,
    action: body.action,
    note: plan.note,
    decision:
      d && item && proposal
        ? {
            return_item_id: item.item.id,
            grade: d.grade,
            location_code: d.locationCode,
            refund_nok: d.refundNok,
            cause: d.cause,
            flags: d.flags,
            engine_version: proposal.engineVersion,
            is_override: d.isOverride,
            override_reason: d.overrideReason,
            received_sku: d.receivedSku,
          }
        : null,
    stock: d && plan.writesItemEffects && proposal ? proposal.stockProposals.map((s) => ({ sku: s.sku, delta: s.delta, reason: s.reason })) : [],
    confusion:
      d && plan.writesItemEffects && proposal
        ? proposal.confusionEvents.map((e) => {
            const [a, b] = sortedPair(e.skuPair[0], e.skuPair[1]);
            return { sku_a: a, sku_b: b, kind: e.kind };
          })
        : [],
    // What Holio would receive, in Holio's vocabulary.
    item_event:
      d && item
        ? {
            retur: item.ret.id,
            ordre: item.order.id,
            bestiltSku: item.item.orderedSku,
            mottattSku: d.receivedSku,
            grad: d.grade,
            lokasjon: d.locationCode,
            refusjonNok: d.refundNok,
            sannsynligAarsak: d.cause,
            flagg: d.flags,
            overstyrt: d.isOverride,
            overstyringsgrunn: d.overrideReason,
            besluttetAv: 'teamleder',
            motorversjon: proposal?.engineVersion,
          }
        : null,
    audit: { ref_label: card.refLabel.replace(/^\S+ /, ''), summary_nb: lines.nb, summary_en: lines.en, payload: { reason: esc.reason, action: body.action, decision: d, note: plan.note } },
  };

  const { data, error } = await db.rpc('resolve_escalation', { p: payload });
  if (error) {
    const code = sqlError(error.message, ['already_resolved', 'escalation_not_found', 'wrong_entity']);
    if (code === 'already_resolved') return fail(code, 409);
    if (code) return fail(code, 404);
    console.error('[lead] resolve failed:', error.message);
    return fail('failed', 500);
  }
  return NextResponse.json({ ok: true, decision: d, ...(data as object) });
}
