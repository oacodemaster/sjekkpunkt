import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { currentDeviceId, fail, guard, PACK_ROLES } from '@/lib/api/http';
import { sealPayload } from '@/lib/pack/commit';
import { evaluateStored, loadPackContext } from '@/lib/pack/server';
import type { PackCommitted } from '@/lib/pack/types';
import { createAdminClient } from '@/lib/supabase/admin';

// Only the worker's reason for a manual confirm is read. Any status, method, size or line
// result a client sends is dropped by the schema: the server recomputes everything (R16).
const Body = z.object({ manualReason: z.enum(['polybag', 'glare', 'other']).optional() });

/**
 * "Klar til forsegling": reloads the stored photos, scans, alerts and settings, reruns the
 * engine and commits VERIFIED or MANUAL_CONFIRM in one transaction (public.commit_pack_check):
 * the packing evidence, order status, escalations, the Holio event and the audit row.
 */
export async function POST(req: NextRequest, ctx: RouteContext<'/api/pack/[orderId]/seal'>) {
  const g = await guard(req, PACK_ROLES, Body);
  if (!g.ok) return g.res;
  const { user, body } = g;
  const { orderId } = await ctx.params;
  if (!z.uuid().safeParse(orderId).success) return fail('not_found', 404);
  const pack = await loadPackContext({ id: orderId }, user.warehouseId);
  if (!pack) return fail('not_found', 404);
  if (pack.order.status !== 'picked') return fail('already_sealed', 409);

  const { decision, inputs } = evaluateStored(pack, new Date(), body.manualReason);
  if (!decision.canSeal) return fail('not_ready', 409, { decision });

  // The overview photo is the evidence when the camera saw the box; a pure barcode or manual
  // seal keeps the latest overview too, so returns can show what was in the box.
  const evidence = inputs.overview && inputs.overview.vision ? inputs.overview.photoId : null;
  const payload = sealPayload({
    warehouseId: user.warehouseId,
    orderId: pack.orderId,
    orderExt: pack.order.id,
    customerRef: pack.order.customerRef,
    deviceId: await currentDeviceId(user.warehouseId),
    userId: user.userId,
    decision,
    products: pack.products,
    manualReason: body.manualReason ?? null,
    evidencePhotoId: evidence,
    photoIds: pack.photos.filter((p) => p.vision || p.label).map((p) => p.photoId),
  });

  const { error } = await createAdminClient().rpc('commit_pack_check', { p: payload });
  if (error) {
    if (error.message.includes('already_sealed')) return fail('already_sealed', 409);
    console.error('[seal] commit failed:', error.message);
    return fail('failed', 500);
  }
  const committed: PackCommitted = {
    status: decision.status as PackCommitted['status'],
    method: decision.method,
    sizeVerified: decision.sizeVerified,
    manualReason: decision.status === 'MANUAL_CONFIRM' ? (body.manualReason ?? null) : null,
    evidencePhotoId: evidence,
    sealedAt: new Date().toISOString(),
  };
  return NextResponse.json({ ok: true, decision, committed });
}
