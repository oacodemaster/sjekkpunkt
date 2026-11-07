import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { fail, guard, LEAD_ROLES, sqlError } from '@/lib/api/http';
import { pairLabelNb } from '@/lib/engine/catalog';
import { toProduct } from '@/lib/db/common';
import { createAdminClient } from '@/lib/supabase/admin';

const Body = z.object({});

/** Clear an active pack alert. A new one opens if the pair reaches the threshold again. */
export async function POST(req: NextRequest, ctx: RouteContext<'/api/lead/alerts/[id]/clear'>) {
  const g = await guard(req, LEAD_ROLES, Body);
  if (!g.ok) return g.res;
  const { user } = g;
  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success) return fail('not_found', 404);

  const db = createAdminClient();
  const { data: alert } = await db.from('pack_alerts').select('sku_a, sku_b, active').eq('id', id).eq('warehouse_id', user.warehouseId).maybeSingle();
  if (!alert) return fail('not_found', 404);
  if (!alert.active) return fail('already_cleared', 409);
  const { data: rows } = await db.from('products').select('*').in('sku', [alert.sku_a, alert.sku_b]);
  const label = pairLabelNb([alert.sku_a, alert.sku_b], (rows ?? []).map(toProduct));

  const { error } = await db.rpc('clear_pack_alert', {
    p: {
      warehouse_id: user.warehouseId,
      id,
      user_id: user.userId,
      audit: { summary_nb: `Pakkevarsel fjernet av teamleder: ${label}`, summary_en: `Packing alert cleared by team lead: ${alert.sku_a} / ${alert.sku_b}` },
    },
  });
  if (error) {
    const code = sqlError(error.message, ['already_cleared', 'alert_not_found']);
    if (code === 'already_cleared') return fail(code, 409);
    if (code) return fail('not_found', 404);
    console.error('[lead] clear alert failed:', error.message);
    return fail('failed', 500);
  }
  return NextResponse.json({ ok: true });
}
