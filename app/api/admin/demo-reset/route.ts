import { NextResponse } from 'next/server';
import { z } from 'zod';
import { ADMIN_ROLES, fail, guard, sqlError } from '@/lib/api/http';
import { createAdminClient } from '@/lib/supabase/admin';
import { syncGradingGuide } from '@/lib/voice/kb';
import { paidDemoOn } from '@/lib/demo/flags';

// Demo reset (addendum section 6): admin only, and only where DEMO_ENABLED=true. Runs the seed
// (app.reset_to_seed, generated from lib/demo/seed.ts) through admin_demo_reset, which writes the
// audit row in the same transaction, then deletes the stored photos and spoken summaries the
// reset left without a row, and pushes the seed's grading guide to the voice agents if an admin
// had changed it (the same sync as /admin/guide). The in-browser demo (/demo) needs no reset; this brings the live
// stations, the lead console and Holio back to the start of the scripted run.

const Body = z.object({ confirm: z.literal(true) });
const CHUNK = 100;

export async function POST(req: Request) {
  const g = await guard(req, ADMIN_ROLES, Body);
  if (!g.ok) return g.res;
  if (!paidDemoOn()) return fail('demo_disabled', 404);

  const db = createAdminClient();
  const { data, error } = await db.rpc('admin_demo_reset', { p: { warehouse_id: g.user.warehouseId, user_id: g.user.userId } });
  if (error) {
    console.error('[admin] demo reset failed:', error.message);
    return fail(sqlError(error.message, ['seed_not_loaded']) ?? 'failed', 500);
  }
  const files = data as { photos: string[]; audio: string[]; grading_guide: string | null };

  // The rows are gone either way; a file that fails to delete is logged, not fatal.
  let failed = 0;
  for (const [bucket, paths] of [['photos', files.photos], ['audio', files.audio]] as const) {
    for (let i = 0; i < paths.length; i += CHUNK) {
      const { error: rmErr } = await db.storage.from(bucket).remove(paths.slice(i, i + CHUNK));
      if (rmErr) {
        failed += Math.min(CHUNK, paths.length - i);
        console.error(`[admin] demo reset: removing ${bucket} files failed:`, rmErr.message);
      }
    }
  }

  if (files.grading_guide) {
    const kb = await syncGradingGuide(files.grading_guide);
    await db.from('audit_events').insert({
      warehouse_id: g.user.warehouseId,
      station: 'admin',
      type: kb.ok ? 'GRADING_GUIDE_SYNCED' : 'GRADING_GUIDE_SYNC_FAILED',
      ref_type: 'settings',
      ref_label: 'grading_guide',
      summary_nb: kb.ok ? 'Vurderingsveiledning fra startdata sendt til stemmeassistentene' : 'Vurderingsveiledning fra startdata ble ikke sendt til stemmeassistentene',
      summary_en: kb.ok ? 'Seed grading guide sent to the voice agents' : 'Seed grading guide not sent to the voice agents',
      actor_user: g.user.userId,
      payload: kb,
    });
  }
  return NextResponse.json({ ok: true, photos: files.photos.length, summaries: files.audio.length, failed, guideSynced: files.grading_guide !== null });
}
