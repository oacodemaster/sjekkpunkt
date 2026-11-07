import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { fail, guard, PACK_ROLES } from '@/lib/api/http';
import { evaluateStored, loadPackContext } from '@/lib/pack/server';
import type { ScanResult } from '@/lib/pack/types';
import { recordMismatch } from '@/lib/pack/vision';
import { createAdminClient } from '@/lib/supabase/admin';

const Body = z.object({ code: z.string().trim().min(1).max(64) });

/**
 * Verify a line by its barcode (P7). The code is looked up in the catalogue (barcode, or the SKU
 * printed on the label). A scan counts only for an order line and only up to its quantity, so a
 * double beep cannot make a line "extra". A product that is not in the order is a caught wrong
 * item: a near-miss, and a confusion pair when it looks like an order line (same variant group).
 */
export async function POST(req: NextRequest, ctx: RouteContext<'/api/pack/[orderId]/barcode'>) {
  const g = await guard(req, PACK_ROLES, Body);
  if (!g.ok) return g.res;
  const { user, body } = g;
  const { orderId } = await ctx.params;
  if (!z.uuid().safeParse(orderId).success) return fail('not_found', 404);
  const pack = await loadPackContext({ id: orderId }, user.warehouseId);
  if (!pack) return fail('not_found', 404);
  if (pack.order.status !== 'picked') return fail('already_sealed', 409);

  const db = createAdminClient();
  // Only letters, digits and dashes reach the query filter.
  const code = body.code.replace(/[^0-9A-Za-z-]/g, '');
  const { data: product } = code
    ? await db
        .from('products')
        .select('sku, variant_group')
        .eq('warehouse_id', user.warehouseId)
        .or(`barcode.eq.${code},sku.eq.${code.toUpperCase()}`)
        .limit(1)
        .maybeSingle()
    : { data: null };

  let result: ScanResult;
  if (!product) {
    result = { kind: 'unknown_code' };
  } else {
    const line = pack.order.lines.find((l) => l.sku === product.sku);
    if (!line) {
      result = { kind: 'not_in_order', sku: product.sku };
      const lookalikes = pack.products.filter((p) => product.variant_group && p.variantGroup === product.variant_group && pack.order.lines.some((l) => l.sku === p.sku));
      const { decision } = evaluateStored(pack);
      await recordMismatch(pack, user, decision, null, 'barcode', {
        pairs: lookalikes.map((p) => [p.sku, product.sku] as [string, string]),
        wrongScanSku: product.sku,
      });
    } else if (pack.scans.filter((s) => s === product.sku).length >= line.qty) {
      result = { kind: 'already_counted', sku: product.sku };
    } else {
      const { error } = await db.from('pack_scans').insert({ warehouse_id: user.warehouseId, order_id: pack.orderId, code, sku: product.sku });
      if (error) return fail('failed', 500);
      result = { kind: 'counted', sku: product.sku };
    }
  }

  const fresh = (await loadPackContext({ id: orderId }, user.warehouseId))!;
  const { decision } = evaluateStored(fresh);
  return NextResponse.json({ result, decision, scans: fresh.scans });
}
