import { NextResponse } from 'next/server';
import { z } from 'zod';
import { fail, guard, RETURN_ROLES } from '@/lib/api/http';
import { loadSettings } from '@/lib/returns/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { RETURN_PURPOSES } from '@/lib/vision/schemas';

const Body = z.object({
  purpose: z.enum(RETURN_PURPOSES),
  entityType: z.literal('return_item'),
  entityId: z.uuid(),
});

const DAY = 24 * 60 * 60 * 1000;

/**
 * Signed upload URL to the private `photos` bucket. The photo row is created first so the
 * retention job (M7) can find and delete it even if the upload never finishes.
 * Packing purposes arrive in M4.
 */
export async function POST(req: Request) {
  const g = await guard(req, RETURN_ROLES, Body);
  if (!g.ok) return g.res;
  const { user, body } = g;
  const db = createAdminClient();

  const { data: item } = await db
    .from('return_items')
    .select('id, status, return_id')
    .eq('id', body.entityId)
    .eq('warehouse_id', user.warehouseId)
    .maybeSingle();
  if (!item) return fail('not_found', 404);
  if (item.status === 'decided') return fail('already_decided', 409);

  const settings = await loadSettings(db, user.warehouseId);
  const photoId = crypto.randomUUID();
  const path = `${user.warehouseId}/return_item/${item.id}/${photoId}.jpg`;

  const { error: insertError } = await db.from('photos').insert({
    id: photoId,
    warehouse_id: user.warehouseId,
    storage_path: path,
    purpose: body.purpose,
    entity_type: 'return_item',
    entity_id: item.id,
    expires_at: new Date(Date.now() + settings.photoRetentionDays * DAY).toISOString(),
  });
  if (insertError) return fail('failed', 500);

  const { data: signed, error } = await db.storage.from('photos').createSignedUploadUrl(path);
  if (error || !signed) return fail('failed', 500);

  if (item.status === 'pending') {
    await db.from('return_items').update({ status: 'inspecting' }).eq('id', item.id).eq('status', 'pending');
    await db.from('returns').update({ status: 'inspecting' }).eq('id', item.return_id).eq('status', 'pending');
  }

  return NextResponse.json({ photoId, path: signed.path, token: signed.token });
}
