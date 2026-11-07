import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { fail, guard, LEAD_ROLES, sqlError } from '@/lib/api/http';
import { pairLabelNb, sortedPair } from '@/lib/engine/catalog';
import { toProduct } from '@/lib/db/common';
import { createAdminClient } from '@/lib/supabase/admin';

const Sku = z.string().trim().min(1).max(64);
const Body = z.object({ skuA: Sku, skuB: Sku, note: z.string().trim().max(200).optional() });

/**
 * A manual pack alert for a SKU pair: the packing station then needs a label photo or a barcode
 * for those SKUs (P4), exactly like an automatic alert.
 */
export async function POST(req: NextRequest) {
  const g = await guard(req, LEAD_ROLES, Body);
  if (!g.ok) return g.res;
  const { user, body } = g;
  if (body.skuA === body.skuB) return fail('same_sku', 422);

  const db = createAdminClient();
  const { data: rows } = await db.from('products').select('*').eq('warehouse_id', user.warehouseId).in('sku', [body.skuA, body.skuB]);
  if ((rows ?? []).length !== 2) return fail('unknown_sku', 422);
  const products = (rows ?? []).map(toProduct);
  const [a, b] = sortedPair(body.skuA, body.skuB);
  const label = pairLabelNb([a, b], products);
  const reasonNb = `Manuelt varsel: ${label}${body.note ? `. ${body.note}` : ''}`;

  const { data, error } = await db.rpc('create_manual_alert', {
    p: {
      warehouse_id: user.warehouseId,
      sku_a: a,
      sku_b: b,
      reason_nb: reasonNb,
      user_id: user.userId,
      audit: { summary_nb: `Pakkevarsel opprettet av teamleder: ${label}`, summary_en: `Packing alert created by team lead: ${a} / ${b}` },
    },
  });
  if (error) {
    if (sqlError(error.message, ['already_active'])) return fail('already_active', 409);
    console.error('[lead] create alert failed:', error.message);
    return fail('failed', 500);
  }
  return NextResponse.json({ ok: true, id: (data as { id: string }).id, reasonNb });
}
