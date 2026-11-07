import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { fail, guard, PACK_ROLES } from '@/lib/api/http';
import { evaluateStored, loadPackContext } from '@/lib/pack/server';

const Body = z.object({});

/** P1-P9 on the stored photos, scans and alerts of the order. A preview: never writes. */
export async function POST(req: NextRequest, ctx: RouteContext<'/api/pack/[orderId]/check'>) {
  const g = await guard(req, PACK_ROLES, Body);
  if (!g.ok) return g.res;
  const { orderId } = await ctx.params;
  if (!z.uuid().safeParse(orderId).success) return fail('not_found', 404);
  const pack = await loadPackContext({ id: orderId }, g.user.warehouseId);
  if (!pack) return fail('not_found', 404);
  const { decision, inputs } = evaluateStored(pack);
  return NextResponse.json({ decision, retakes: inputs.retakes, sealed: pack.order.status !== 'picked' });
}
