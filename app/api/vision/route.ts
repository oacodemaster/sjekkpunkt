import { NextResponse } from 'next/server';
import { z } from 'zod';
import { fail, guard, RETURN_ROLES } from '@/lib/api/http';
import { evaluateItem, loadItemContext, signedPhotoUrls } from '@/lib/returns/server';
import type { StationPhoto } from '@/lib/returns/types';
import { createAdminClient } from '@/lib/supabase/admin';
import { inspectReturnPhoto, type VisionImage } from '@/lib/vision/client';
import { isReturnPurpose, VISION_PURPOSES } from '@/lib/vision/schemas';

// Two model calls plus storage reads stay well under this; vision itself is capped at 8 s.
export const maxDuration = 20;

const Body = z.object({ photoId: z.uuid(), purpose: z.enum(VISION_PURPOSES) });

const MAX_BYTES = 5 * 1024 * 1024;
const MAX_REFERENCES = 4;

function isImage(b: Buffer): string | null {
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  return null;
}

async function download(path: string): Promise<VisionImage | null> {
  const { data } = await createAdminClient().storage.from('photos').download(path);
  if (!data) return null;
  const buf = Buffer.from(await data.arrayBuffer());
  const mimeType = isImage(buf);
  return mimeType && buf.length <= MAX_BYTES ? { data: buf, mimeType } : null;
}

/**
 * Runs vision on an uploaded photo: closed set of candidate SKUs, zod-validated output,
 * stored in vision_results. A photo with a face is deleted from storage at once and only
 * the event is kept (addendum section 9).
 */
export async function POST(req: Request) {
  const g = await guard(req, RETURN_ROLES, Body);
  if (!g.ok) return g.res;
  const { user, body } = g;
  if (!isReturnPurpose(body.purpose)) return fail('unsupported_purpose', 400); // packing purposes: M4
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
  const refPaths = ctx.products
    .sort((a, b) => (a.sku === ctx.item.orderedSku ? -1 : b.sku === ctx.item.orderedSku ? 1 : 0))
    .flatMap((p) => p.referencePhotoPaths.slice(0, 1).map((path) => ({ sku: p.sku, path })))
    .slice(0, MAX_REFERENCES);
  const references = (
    await Promise.all(refPaths.map(async (r) => ({ sku: r.sku, image: await download(r.path) })))
  ).filter((r): r is { sku: string; image: VisionImage } => !!r.image);

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
