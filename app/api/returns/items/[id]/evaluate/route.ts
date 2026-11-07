import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { fail, guard, RETURN_ROLES } from '@/lib/api/http';
import type { Lang } from '@/lib/engine/types';
import { LANGS } from '@/lib/i18n/strings';
import { evaluateItem, loadItemContext } from '@/lib/returns/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { noteToNorwegian } from '@/lib/translate/server';

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
  lang: z.enum(LANGS as [Lang, ...Lang[]]).optional(),
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

  const changed = body.workerNoteOriginal !== undefined && body.workerNoteOriginal !== before.workerNote.original;
  const note = (body.workerNoteOriginal ?? before.workerNote.original) || null;
  const lang = (changed ? body.lang : before.workerNote.lang) ?? body.lang ?? user.lang;
  // The original stays as spoken; the Norwegian line is translated on the server (addendum 8).
  // If translation fails the note is kept and confirm or escalate try again.
  const noteNb = !note ? null : changed || !before.workerNote.nb ? await noteToNorwegian(note, lang as Lang) : before.workerNote.nb;
  const db = createAdminClient();
  const { error } = await db.from('inspections').upsert(
    {
      warehouse_id: user.warehouseId,
      return_item_id: id,
      condition: { worker: body.worker },
      worker_note_original: note,
      worker_note_lang: note ? lang : null,
      worker_note_nb: noteNb,
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
