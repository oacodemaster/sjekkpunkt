import { NextResponse, type NextRequest } from 'next/server';
import { ADMIN_ROLES, fail, guard, sqlError } from '@/lib/api/http';
import { PRODUCT_ERRORS, productSchema } from '@/lib/admin/schemas';
import { createAdminClient } from '@/lib/supabase/admin';

/** Create a product. A new shelf code becomes a stock location. */
export async function POST(req: NextRequest) {
  const g = await guard(req, ADMIN_ROLES, productSchema);
  if (!g.ok) return g.res;
  const { data, error } = await createAdminClient().rpc('admin_save_product', {
    p: { warehouse_id: g.user.warehouseId, user_id: g.user.userId, mode: 'create', product: g.body },
  });
  if (error) {
    const code = sqlError(error.message, PRODUCT_ERRORS);
    if (code) return fail(code, 409);
    console.error('[admin] create product failed:', error.message);
    return fail('failed', 500);
  }
  return NextResponse.json({ ok: true, ...(data as object) }, { status: 201 });
}
