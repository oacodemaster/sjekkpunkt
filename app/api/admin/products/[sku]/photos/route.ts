import { NextResponse, type NextRequest } from 'next/server';
import { ADMIN_ROLES, fail, sqlError } from '@/lib/api/http';
import { PRODUCT_ERRORS } from '@/lib/admin/schemas';
import { authorize } from '@/lib/auth/dal';
import { createAdminClient } from '@/lib/supabase/admin';

const MAX_BYTES = 2 * 1024 * 1024;

/**
 * Upload a reference photo for a product (multipart field `photo`). The browser has already
 * downscaled it to ~1024 px and re-encoded it as JPEG, which drops EXIF (lib/camera/image.ts);
 * the server accepts only real JPEG bytes. Vision sends the first reference photo per candidate SKU.
 */
export async function POST(req: NextRequest, ctx: RouteContext<'/api/admin/products/[sku]/photos'>) {
  const auth = await authorize(ADMIN_ROLES);
  if (!auth.ok) return fail(auth.status === 401 ? 'unauthenticated' : 'forbidden', auth.status);
  const { user } = auth;
  const { sku } = await ctx.params;

  let file: File | null = null;
  try {
    const f = (await req.formData()).get('photo');
    file = f instanceof File ? f : null;
  } catch {
    return fail('invalid_body');
  }
  if (!file) return fail('invalid_body');
  if (file.size > MAX_BYTES) return fail('too_large', 413);
  const bytes = Buffer.from(await file.arrayBuffer());
  if (!(bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)) return fail('not_jpeg', 415);

  const db = createAdminClient();
  const { data: product } = await db.from('products').select('id').eq('sku', sku).eq('warehouse_id', user.warehouseId).maybeSingle();
  if (!product) return fail('not_found', 404);

  const photoId = crypto.randomUUID();
  const path = `${user.warehouseId}/product/${product.id}/${photoId}.jpg`;
  const { error: upErr } = await db.storage.from('photos').upload(path, bytes, { contentType: 'image/jpeg', upsert: false });
  if (upErr) {
    console.error('[admin] reference upload failed:', upErr.message);
    return fail('failed', 500);
  }
  const { error } = await db.rpc('admin_add_reference_photo', {
    p: { warehouse_id: user.warehouseId, user_id: user.userId, sku, photo_id: photoId, storage_path: path },
  });
  if (error) {
    await db.storage.from('photos').remove([path]);
    const code = sqlError(error.message, PRODUCT_ERRORS);
    if (code) return fail(code, code === 'not_found' ? 404 : 409);
    console.error('[admin] reference photo failed:', error.message);
    return fail('failed', 500);
  }
  return NextResponse.json({ ok: true, photoId }, { status: 201 });
}
