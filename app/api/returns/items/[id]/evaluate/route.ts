import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { fail, guard, RETURN_ROLES } from '@/lib/api/http';
import { LANGS } from '@/lib/i18n/strings';
import { evaluateItem, loadItemContext } from '@/lib/returns/server';
import { createAdminClient } from '@/lib/supabase/admin';

const severity = z.enum(['none', 'minor', 'major']);
const Body = z.object({
  worker: z
    .object({
      damage: severity.optional(),
      stains: severity.optional(),
      tagsAttached: z.boolean().optional(),
      unusable: z.boolean().optional(),
    })
    .default({}),
  workerNoteOriginal: z.string().trim().max(1000).optional(),
  lang: z.enum(LANGS as [string, ...string[]]).optional(),
});

/**
 * Stores the worker's condition input and returns the server's preview decision.
 * Never commits anything: grade, shelf and refund are written only by /confirm (R16).
 */
export async function POST(req: NextRequest, ctx: RouteContext<'/api/returns/items/[id]/evaluate'>) {
  const g = await guard(req, RETURN_ROLES, Body);
  if (!g.ok) return g.res;
  const { user, body } = g;
  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success) return fail('not_found', 404);

  const before = await loadItemContext(id, user.warehouseId);
  if (!before) return fail('not_found', 404);
  if (before.item.status === 'decided') return fail('already_decided', 409);

  const note = body.workerNoteOriginal ?? before.workerNote.original;
  const lang = body.lang ?? before.workerNote.lang ?? user.lang;
  const db = createAdminClient();
  const { error } = await db.from('inspections').upsert(
    {
      warehouse_id: user.warehouseId,
      return_item_id: id,
      condition: { worker: body.worker },
      worker_note_original: note ?? null,
      worker_note_lang: note ? lang : null,
      // Notes in other languages are translated server-side in M3 (/api/translate).
      worker_note_nb: note && lang === 'nb' ? note : before.workerNote.nb,
    },
    { onConflict: 'return_item_id' },
  );
  if (error) return fail('failed', 500);

  const after = await loadItemContext(id, user.warehouseId);
  const { decision } = evaluateItem(after!);
  await db
    .from('inspections')
    .update({ customer_note_text: decision.customerNoteText, suspicious_note: decision.suspiciousNote })
    .eq('return_item_id', id);

  return NextResponse.json({ decision });
}
