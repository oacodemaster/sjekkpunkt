import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { fail, guard, PACK_ROLES } from '@/lib/api/http';
import { evaluateStored, loadPackContext } from '@/lib/pack/server';

const Body = z.object({ reason: z.enum(['polybag', 'glare', 'other']) });

/**
 * Manual confirm with a reason (P8): the server's preview. The engine allows it only after
 * MAX_RETAKES and never on a MISMATCH. The seal itself is /seal with the same reason.
 */
export async function POST(req: NextRequest, ctx: RouteContext<'/api/pack/[orderId]/manual'>) {
  const g = await guard(req, PACK_ROLES, Body);
  if (!g.ok) return g.res;
  const { orderId } = await ctx.params;
  if (!z.uuid().safeParse(orderId).success) return fail('not_found', 404);
  const pack = await loadPackContext({ id: orderId }, g.user.warehouseId);
  if (!pack) return fail('not_found', 404);
  if (pack.order.status !== 'picked') return fail('already_sealed', 409);
  const { decision } = evaluateStored(pack, new Date(), g.body.reason);
  if (decision.status !== 'MANUAL_CONFIRM') return fail('not_allowed', 409, { decision });
  return NextResponse.json({ decision });
}
