import { NextResponse } from 'next/server';
import { z } from 'zod';
import { fail, guard, PACK_ROLES, RETURN_ROLES } from '@/lib/api/http';
import { packVision } from '@/lib/pack/vision';
import { evaluateItem, loadItemContext, signedPhotoUrls } from '@/lib/returns/server';
import type { StationPhoto } from '@/lib/returns/types';
import { createAdminClient } from '@/lib/supabase/admin';
import { limitCall, limitResponse } from '@/lib/limits/server';
import { visionCostOre } from '@/lib/limits/policy';
import { FAST_MODEL, inspectReturnPhoto, STRONG_MODEL } from '@/lib/vision/client';
import { downloadImage as download, referenceImages } from '@/lib/vision/images';
import { isPackPurpose, isReturnPurpose, VISION_PURPOSES } from '@/lib/vision/schemas';

// Two model calls plus storage reads stay well under this; vision itself is capped at 8 s.
export const maxDuration = 20;

const Body = z.object({
  photoId: z.uuid(),
  purpose: z.enum(VISION_PURPOSES),
  /** label_closeup only: the order line whose size label is in the photo */
  sku: z.string().trim().min(1).max(64).optional(),
});

/**
 * Runs vision on an uploaded photo: closed set of candidate SKUs, zod-validated output,
 * stored in vision_results. A photo with a face is deleted from storage at once and only
 * the event is kept (addendum section 9).
 */
export async function POST(req: Request) {
  const g = await guard(req, [...new Set([...RETURN_ROLES, ...PACK_ROLES])], Body);
  if (!g.ok) return g.res;
  const { user, body } = g;
  const packing = isPackPurpose(body.purpose);
  if (!(packing ? PACK_ROLES : RETURN_ROLES).includes(user.role)) return fail('forbidden', 403);
  if (!packing && !isReturnPurpose(body.purpose)) return fail('unsupported_purpose', 400);

  // Rate limit per user and device, and today's vision budget (M8). Over the budget the station
  // goes tap-only: barcodes at packing, the lead for returns.
  const limit = await limitCall(user, 'vision');
  if (!limit.ok && limit.reason === 'rate_limited') return limitResponse(limit);
  if (!limit.ok) return NextResponse.json({ ok: false, reason: 'spend_cap' });
  const record = (attempts: { model: string }[]) => limit.record(visionCostOre(attempts, { fast: FAST_MODEL, strong: STRONG_MODEL }));

  if (isPackPurpose(body.purpose)) {
    return packVision(user, { photoId: body.photoId, purpose: body.purpose, sku: body.sku }, record);
  }
  if (!isReturnPurpose(body.purpose)) return fail('unsupported_purpose', 400);
  const db = createAdminClient();

  const { data: photo } = await db
    .from('photos')
    .select('id, purpose, entity_type, entity_id, storage_path, faces_discarded, created_at, vision_results(id)')
    .eq('id', body.photoId)
    .eq('warehouse_id', user.warehouseId)
    .maybeSingle();
  if (!photo || photo.entity_type !== 'return_item') return fail('not_found', 404);
  if (photo.purpose !== body.purpose) return fail('purpose_mismatch', 400);
  if ((photo.vision_results ?? []).length > 0) return fail('already_analysed', 409);
  if (!photo.storage_path) return fail('photo_deleted', 410);

  const ctx = await loadItemContext(photo.entity_id, user.warehouseId);
  if (!ctx) return fail('not_found', 404);
  if (ctx.item.status === 'decided') return fail('already_decided', 409);

  const image = await download(photo.storage_path);
  if (!image) return NextResponse.json({ ok: false, reason: 'upload' satisfies string });

  // Up to 4 reference photos of the candidate SKUs (closed set). The ordered SKU first.
  const references = await referenceImages(
    [...ctx.products].sort((a, b) => (a.sku === ctx.item.orderedSku ? -1 : b.sku === ctx.item.orderedSku ? 1 : 0)),
  );

  const result = await inspectReturnPhoto({
    purpose: body.purpose,
    image,
    references,
    confidenceMin: ctx.settings.returnConfidenceMin,
    task: {
      purpose: body.purpose,
      orderLines: ctx.order.lines.map((l) => ({ sku: l.sku, qty: l.qty })),
      orderedSku: ctx.item.orderedSku,
      candidates: ctx.products,
      referenceSkus: references.map((r) => r.sku),
    },
  });

  await record(result.attempts);
  const attempts = result.attempts.map(({ model, latencyMs, schemaValid, error }) => ({ model, latencyMs, schemaValid, error }));
  await db.from('vision_results').insert({
    warehouse_id: user.warehouseId,
    photo_id: photo.id,
    purpose: body.purpose,
    model: result.ok ? result.model : (result.attempts.at(-1)?.model ?? 'none'),
    latency_ms: result.latencyMs,
    schema_valid: result.ok,
    output: result.ok ? { inspection: result.inspection, attempts } : { error: result.reason, attempts },
  });

  const face = result.ok && result.inspection.facePresent;
  if (face) {
    await db.storage.from('photos').remove([photo.storage_path]);
    await db.from('photos').update({ storage_path: null, faces_discarded: true }).eq('id', photo.id);
    await db.from('audit_events').insert({
      warehouse_id: user.warehouseId,
      station: 'return',
      type: 'PHOTO_FACE_DISCARDED',
      ref_type: 'return_item',
      ref_id: ctx.item.id,
      ref_label: ctx.ret.id,
      summary_nb: `Retur ${ctx.ret.id}: bilde med ansikt slettet`,
      summary_en: `Return ${ctx.ret.id}: photo with a face deleted`,
    });
  }

  // Server preview after this photo, from stored data only.
  const fresh = await loadItemContext(photo.entity_id, user.warehouseId);
  const { decision } = evaluateItem(fresh!);
  const url = face ? null : ((await signedPhotoUrls([photo.storage_path])).get(photo.storage_path) ?? null);

  const stationPhoto: StationPhoto = {
    photoId: photo.id,
    purpose: body.purpose,
    url,
    takenAt: photo.created_at,
    inspection: result.ok && !face ? result.inspection : null,
    facesDiscarded: face,
    model: result.ok ? result.model : undefined,
  };

  if (face) return NextResponse.json({ ok: false, reason: 'face', photo: stationPhoto, decision });
  if (!result.ok) return NextResponse.json({ ok: false, reason: result.reason, photo: stationPhoto, decision });
  return NextResponse.json({ ok: true, photo: stationPhoto, decision });
}
