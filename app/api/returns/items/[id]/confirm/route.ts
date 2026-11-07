import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { currentDeviceId, fail, guard, RETURN_ROLES } from '@/lib/api/http';
import { commitPayload } from '@/lib/returns/commit';
import { evaluateItem, loadItemContext } from '@/lib/returns/server';
import type { CommittedDecision } from '@/lib/returns/types';
import { createAdminClient } from '@/lib/supabase/admin';

// The body is ignored on purpose: any grade, shelf or refund a client sends is dropped (R16).
const Body = z.object({});

/**
 * "Bekreft retur" for one item. Loads stored vision results, worker input, packing evidence
 * and settings, reruns the engine, and commits everything in one transaction
 * (public.commit_return_item). The worker's tap is the human confirmation; the actor is
 * the device, not the person.
 */
export async function POST(req: NextRequest, ctx: RouteContext<'/api/returns/items/[id]/confirm'>) {
  const g = await guard(req, RETURN_ROLES, Body);
  if (!g.ok) return g.res;
  const { user } = g;
  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success) return fail('not_found', 404);

  const item = await loadItemContext(id, user.warehouseId);
  if (!item) return fail('not_found', 404);
  if (item.item.status === 'decided') return fail('already_decided', 409);
  if (item.item.status === 'escalated') return fail('escalated', 409);

  const { decision, retakes } = evaluateItem(item);
  if (!decision.canConfirm) return fail('not_ready', 409, { decision });

  const payload = commitPayload({
    warehouseId: user.warehouseId,
    returnItemId: id,
    deviceId: await currentDeviceId(user.warehouseId),
    returnExtId: item.ret.id,
    orderExtId: item.order.id,
    customerReasonNb: item.ret.customerReasonNb,
    decision,
    products: item.products,
    retakes,
    lateDays: item.lateDays,
    returnWindowDays: item.settings.returnWindowDays,
    workerNoteNb: item.workerNote.nb,
    photoIds: item.photos.filter((p) => p.inspection).map((p) => p.photoId),
  });

  const { data, error } = await createAdminClient().rpc('commit_return_item', { p: payload });
  if (error) {
    if (error.message.includes('already_decided')) return fail('already_decided', 409);
    console.error('[confirm] commit failed:', error.message);
    return fail('failed', 500);
  }

  const committed: CommittedDecision = {
    grade: decision.grade!,
    locationCode: decision.locationCode!,
    refundNok: decision.refundNok,
    cause: decision.cause,
    flags: decision.flags,
    receivedSku: decision.receivedSku,
    decidedAt: new Date().toISOString(),
  };
  return NextResponse.json({ ok: true, decision, committed, returnStatus: (data as { returnStatus: string }).returnStatus });
}
