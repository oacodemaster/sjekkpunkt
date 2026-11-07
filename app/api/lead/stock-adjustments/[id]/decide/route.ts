import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { fail, guard, LEAD_ROLES, sqlError } from '@/lib/api/http';
import { createAdminClient } from '@/lib/supabase/admin';

const Body = z.object({ decision: z.enum(['approve', 'reject']) });

const REASON_NB: Record<string, string> = {
  wrong_item_not_shipped: 'bestilt vare ble aldri sendt',
  wrong_item_shipped: 'feil vare ble sendt',
};

/** Approve or reject a proposed stock correction (R10 needs a human tap). */
export async function POST(req: NextRequest, ctx: RouteContext<'/api/lead/stock-adjustments/[id]/decide'>) {
  const g = await guard(req, LEAD_ROLES, Body);
  if (!g.ok) return g.res;
  const { user, body } = g;
  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success) return fail('not_found', 404);

  const db = createAdminClient();
  const { data: adj } = await db
    .from('stock_adjustments')
    .select('id, sku, delta, reason, source_type, source_id, status')
    .eq('id', id)
    .eq('warehouse_id', user.warehouseId)
    .maybeSingle();
  if (!adj) return fail('not_found', 404);
  if (adj.status !== 'proposed') return fail('already_decided', 409);

  const approve = body.decision === 'approve';
  const delta = `${adj.delta > 0 ? '+' : ''}${adj.delta}`;
  const why = REASON_NB[adj.reason] ?? adj.reason;
  const { error } = await db.rpc('decide_stock_adjustment', {
    p: {
      warehouse_id: user.warehouseId,
      id,
      user_id: user.userId,
      decision: approve ? 'approved' : 'rejected',
      // What Holio would receive, in Holio's vocabulary.
      event: { sku: adj.sku, endring: adj.delta, aarsak: adj.reason, kilde: adj.source_type, kildeId: adj.source_id },
      audit: {
        summary_nb: `Lagerkorreksjon ${adj.sku} ${delta} ${approve ? 'godkjent' : 'avvist'} av teamleder (${why})`,
        summary_en: `Stock correction ${adj.sku} ${delta} ${approve ? 'approved' : 'rejected'} by team lead (${adj.reason})`,
      },
    },
  });
  if (error) {
    const code = sqlError(error.message, ['already_decided', 'adjustment_not_found']);
    if (code === 'already_decided') return fail(code, 409);
    if (code) return fail('not_found', 404);
    console.error('[lead] stock decision failed:', error.message);
    return fail('failed', 500);
  }
  return NextResponse.json({ ok: true, status: approve ? 'approved' : 'rejected' });
}
