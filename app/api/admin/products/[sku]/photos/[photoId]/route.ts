import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { ADMIN_ROLES, fail } from '@/lib/api/http';
import { authorize } from '@/lib/auth/dal';
import { createAdminClient } from '@/lib/supabase/admin';

/** Remove a reference photo: the product forgets the path, the file is deleted from Storage. */
export async function DELETE(_req: NextRequest, ctx: RouteContext<'/api/admin/products/[sku]/photos/[photoId]'>) {
  const auth = await authorize(ADMIN_ROLES);
  if (!auth.ok) return fail(auth.status === 401 ? 'unauthenticated' : 'forbidden', auth.status);
  const { sku, photoId } = await ctx.params;
  if (!z.uuid().safeParse(photoId).success) return fail('not_found', 404);

  const db = createAdminClient();
  const { data, error } = await db.rpc('admin_remove_reference_photo', {
    p: { warehouse_id: auth.user.warehouseId, user_id: auth.user.userId, sku, photo_id: photoId },
  });
  if (error) {
    if (error.message.includes('not_found')) return fail('not_found', 404);
    console.error('[admin] remove reference photo failed:', error.message);
    return fail('failed', 500);
  }
  const { error: rmErr } = await db.storage.from('photos').remove([(data as { path: string }).path]);
  if (rmErr) console.error('[admin] reference file not removed:', rmErr.message);
  return NextResponse.json({ ok: true });
}
