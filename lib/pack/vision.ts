import 'server-only';
import { NextResponse } from 'next/server';
import { currentDeviceId, fail } from '@/lib/api/http';
import type { CurrentUser } from '@/lib/auth/dal';
import { createAdminClient } from '@/lib/supabase/admin';
import { inspectPackPhoto, readLabelPhoto, type TwoStageResult } from '@/lib/vision/client';
import { downloadImage, referenceImages } from '@/lib/vision/images';
import type { PackPurpose } from '@/lib/vision/schemas';
import { mismatchPayload } from './commit';
import { evaluateStored, loadPackContext, stationPhoto, type PackContext } from './server';
import type { PackPhoto } from './types';

/**
 * Vision for the packing station (POST /api/vision with a pack purpose). Closed set of candidate
 * SKUs, zod-validated output stored in vision_results, faces deleted at once. Then the server
 * reruns the engine from stored data; a wrong parcel caught here is recorded as a near-miss with
 * its confusion pairs (P1), whatever the client does next.
 */
export async function packVision(
  user: CurrentUser,
  body: { photoId: string; purpose: PackPurpose; sku?: string },
  record: (attempts: { model: string }[]) => Promise<void>,
) {
  const db = createAdminClient();
  const { data: photo } = await db
    .from('photos')
    .select('id, purpose, entity_type, entity_id, storage_path, created_at, vision_results(id)')
    .eq('id', body.photoId)
    .eq('warehouse_id', user.warehouseId)
    .maybeSingle();
  if (!photo || photo.entity_type !== 'order') return fail('not_found', 404);
  if (photo.purpose !== body.purpose) return fail('purpose_mismatch', 400);
  if ((photo.vision_results ?? []).length > 0) return fail('already_analysed', 409);
  if (!photo.storage_path) return fail('photo_deleted', 410);

  const ctx = await loadPackContext({ id: photo.entity_id }, user.warehouseId);
  if (!ctx) return fail('not_found', 404);
  if (ctx.order.status !== 'picked') return fail('already_sealed', 409);
  const lineSkus = ctx.order.lines.map((l) => l.sku);
  if (body.purpose === 'label_closeup' && (!body.sku || !lineSkus.includes(body.sku))) return fail('invalid_sku', 400);

  const image = await downloadImage(photo.storage_path);
  if (!image) return NextResponse.json({ ok: false, reason: 'upload' });

  // Reference photos: order lines first, then their variant siblings (up to 4).
  const references = await referenceImages(
    [...ctx.products].sort((a, b) => Number(!lineSkus.includes(a.sku)) - Number(!lineSkus.includes(b.sku))),
  );
  const task = { orderLines: ctx.order.lines.map((l) => ({ sku: l.sku, qty: l.qty })), candidates: ctx.products, referenceSkus: references.map((r) => r.sku) };
  const req = {
    image,
    references,
    task,
    confidenceMin: ctx.settings.packConfidenceMin,
    mock: { orderExt: ctx.order.id, nth: ctx.photos.filter((p) => p.purpose === 'pack_check').length },
  };

  const result: TwoStageResult<{ facePresent: boolean }> =
    body.purpose === 'pack_check' ? await inspectPackPhoto(req) : await readLabelPhoto({ ...req, sku: body.sku! });

  await record(result.attempts);
  const attempts = result.attempts.map(({ model, latencyMs, schemaValid, error }) => ({ model, latencyMs, schemaValid, error }));
  const face = result.ok && result.value.facePresent;
  const output = result.ok
    ? body.purpose === 'pack_check'
      ? { pack: result.value, attempts }
      : { label: { ...result.value, facePresent: undefined }, attempts }
    : { error: result.reason, sku: body.sku ?? null, attempts };
  await db.from('vision_results').insert({
    warehouse_id: user.warehouseId,
    photo_id: photo.id,
    purpose: body.purpose,
    model: result.ok ? result.model : (result.attempts.at(-1)?.model ?? 'none'),
    latency_ms: result.latencyMs,
    schema_valid: result.ok,
    output,
  });

  if (face) {
    await db.storage.from('photos').remove([photo.storage_path]);
    await db.from('photos').update({ storage_path: null, faces_discarded: true }).eq('id', photo.id);
    await db.from('audit_events').insert({
      warehouse_id: user.warehouseId,
      station: 'pack',
      type: 'PHOTO_FACE_DISCARDED',
      ref_type: 'order',
      ref_id: ctx.orderId,
      ref_label: ctx.order.id,
      summary_nb: `Ordre ${ctx.order.id}: bilde med ansikt slettet`,
      summary_en: `Order ${ctx.order.id}: photo with a face deleted`,
    });
  }

  // Server preview after this photo, from stored data only.
  const fresh = (await loadPackContext({ id: ctx.orderId }, user.warehouseId))!;
  const { decision, inputs } = evaluateStored(fresh);
  if (decision.status === 'MISMATCH') await recordMismatch(fresh, user, decision, inputs.overview?.photoId ?? null, 'camera');

  const stored = fresh.photos.find((p) => p.photoId === photo.id);
  const out: PackPhoto = stored
    ? await stationPhoto(stored)
    : { photoId: photo.id, purpose: body.purpose, sku: body.sku ?? null, url: null, takenAt: photo.created_at, vision: null, label: null, facesDiscarded: face };

  if (face) return NextResponse.json({ ok: false, reason: 'face', photo: out, decision });
  if (!result.ok) return NextResponse.json({ ok: false, reason: result.reason, photo: out, decision });
  return NextResponse.json({ ok: true, photo: out, decision });
}

/** A caught wrong parcel: one near-miss per order and each SKU pair once (record_pack_mismatch). */
export async function recordMismatch(
  ctx: PackContext,
  user: CurrentUser,
  decision: ReturnType<typeof evaluateStored>['decision'],
  photoId: string | null,
  method: 'camera' | 'barcode',
  extra?: { pairs: [string, string][]; wrongScanSku: string },
) {
  const p = mismatchPayload({
    warehouseId: user.warehouseId,
    orderId: ctx.orderId,
    orderExt: ctx.order.id,
    deviceId: await currentDeviceId(user.warehouseId),
    decision,
    products: ctx.products,
    method,
    photoId,
    extraPairs: extra?.pairs,
    wrongScanSku: extra?.wrongScanSku,
  });
  const { error } = await createAdminClient().rpc('record_pack_mismatch', { p });
  if (error && !error.message.includes('already_sealed')) console.error('[pack] record mismatch failed:', error.message);
}
