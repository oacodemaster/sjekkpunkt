import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { currentDeviceId, fail, guard, RETURN_ROLES } from '@/lib/api/http';
import { escalatePayload } from '@/lib/returns/commit';
import { evaluateItem, loadItemContext } from '@/lib/returns/server';
import { createAdminClient } from '@/lib/supabase/admin';

const Body = z.object({ note: z.string().trim().max(500).optional() });

/**
 * "Send til teamleder", always available. Sends the item with every reason the engine
 * found plus `worker_request`. The lead decides the item (M5).
 */
export async function POST(req: NextRequest, ctx: RouteContext<'/api/returns/items/[id]/escalate'>) {
  const g = await guard(req, RETURN_ROLES, Body);
  if (!g.ok) return g.res;
  const { user, body } = g;
  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success) return fail('not_found', 404);

  const item = await loadItemContext(id, user.warehouseId);
  if (!item) return fail('not_found', 404);
  if (item.item.status === 'decided') return fail('already_decided', 409);

  const db = createAdminClient();
  if (body.note) {
    await db.from('inspections').upsert(
      {
        warehouse_id: user.warehouseId,
        return_item_id: id,
        condition: { worker: item.worker },
        worker_note_original: body.note,
        worker_note_lang: user.lang,
        worker_note_nb: user.lang === 'nb' ? body.note : null, // translated in M3
      },
      { onConflict: 'return_item_id' },
    );
  }

  const { decision, retakes } = evaluateItem(item);
  const payload = escalatePayload(
    {
      warehouseId: user.warehouseId,
      returnItemId: id,
      deviceId: await currentDeviceId(user.warehouseId),
      returnExtId: item.ret.id,
      decision,
      products: item.products,
      retakes,
      lateDays: item.lateDays,
      returnWindowDays: item.settings.returnWindowDays,
      workerNoteNb: body.note && user.lang === 'nb' ? body.note : item.workerNote.nb,
    },
    [...decision.escalations, 'worker_request'],
  );

  const { data, error } = await db.rpc('escalate_return_item', { p: payload });
  if (error) {
    if (error.message.includes('already_decided')) return fail('already_decided', 409);
    console.error('[escalate] failed:', error.message);
    return fail('failed', 500);
  }
  return NextResponse.json({ ok: true, returnStatus: (data as { returnStatus: string }).returnStatus });
}
