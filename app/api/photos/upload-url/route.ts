import { NextResponse } from 'next/server';
import { z } from 'zod';
import { fail, guard, PACK_ROLES, RETURN_ROLES } from '@/lib/api/http';
import { loadSettings } from '@/lib/db/common';
import { createAdminClient } from '@/lib/supabase/admin';
import { PACK_PURPOSES, RETURN_PURPOSES } from '@/lib/vision/schemas';

const Body = z.discriminatedUnion('entityType', [
  z.object({ purpose: z.enum(RETURN_PURPOSES), entityType: z.literal('return_item'), entityId: z.uuid() }),
  z.object({ purpose: z.enum(PACK_PURPOSES), entityType: z.literal('order'), entityId: z.uuid() }),
]);

const DAY = 24 * 60 * 60 * 1000;

/**
 * Signed upload URL to the private `photos` bucket. The photo row is created first so the
 * retention job (M7) can find and delete it even if the upload never finishes.
 * Return photos belong to a return item (returns roles), packing photos to an order (packer roles).
 */
export async function POST(req: Request) {
  const g = await guard(req, [...new Set([...RETURN_ROLES, ...PACK_ROLES])], Body);
  if (!g.ok) return g.res;
  const { user, body } = g;
  const roles = body.entityType === 'order' ? PACK_ROLES : RETURN_ROLES;
  if (!roles.includes(user.role)) return fail('forbidden', 403);
  const db = createAdminClient();

  let onCreated: (() => Promise<unknown>) | null = null;
  if (body.entityType === 'return_item') {
    const { data: item } = await db
      .from('return_items')
      .select('id, status, return_id')
      .eq('id', body.entityId)
      .eq('warehouse_id', user.warehouseId)
      .maybeSingle();
    if (!item) return fail('not_found', 404);
    if (item.status === 'decided') return fail('already_decided', 409);
    if (item.status === 'pending') {
      onCreated = async () => {
        await db.from('return_items').update({ status: 'inspecting' }).eq('id', item.id).eq('status', 'pending');
        await db.from('returns').update({ status: 'inspecting' }).eq('id', item.return_id).eq('status', 'pending');
      };
    }
  } else {
    const { data: order } = await db.from('orders').select('id, status').eq('id', body.entityId).eq('warehouse_id', user.warehouseId).maybeSingle();
    if (!order) return fail('not_found', 404);
    if (order.status !== 'picked') return fail('already_sealed', 409);
  }

  const settings = await loadSettings(db, user.warehouseId);
  const photoId = crypto.randomUUID();
  const path = `${user.warehouseId}/${body.entityType}/${body.entityId}/${photoId}.jpg`;

  const { error: insertError } = await db.from('photos').insert({
    id: photoId,
    warehouse_id: user.warehouseId,
    storage_path: path,
    purpose: body.purpose,
    entity_type: body.entityType,
    entity_id: body.entityId,
    expires_at: new Date(Date.now() + settings.photoRetentionDays * DAY).toISOString(),
  });
  if (insertError) return fail('failed', 500);

  const { data: signed, error } = await db.storage.from('photos').createSignedUploadUrl(path);
  if (error || !signed) return fail('failed', 500);

  if (onCreated) await onCreated();
  return NextResponse.json({ photoId, path: signed.path, token: signed.token });
}
