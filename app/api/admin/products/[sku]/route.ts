import { NextResponse, type NextRequest } from 'next/server';
import { ADMIN_ROLES, fail, guard, sqlError } from '@/lib/api/http';
import { PRODUCT_ERRORS, productSchema } from '@/lib/admin/schemas';
import { createAdminClient } from '@/lib/supabase/admin';

/** Update a product. The SKU is its key (orders, returns and alerts refer to it), so it cannot change. */
export async function PATCH(req: NextRequest, ctx: RouteContext<'/api/admin/products/[sku]'>) {
  const { sku } = await ctx.params;
  const g = await guard(req, ADMIN_ROLES, productSchema.omit({ sku: true }));
  if (!g.ok) return g.res;
  const { data, error } = await createAdminClient().rpc('admin_save_product', {
    p: { warehouse_id: g.user.warehouseId, user_id: g.user.userId, mode: 'update', product: { ...g.body, sku } },
  });
  if (error) {
    const code = sqlError(error.message, PRODUCT_ERRORS);
    if (code) return fail(code, code === 'not_found' ? 404 : 409);
    console.error('[admin] update product failed:', error.message);
    return fail('failed', 500);
  }
  return NextResponse.json({ ok: true, ...(data as object) });
}
