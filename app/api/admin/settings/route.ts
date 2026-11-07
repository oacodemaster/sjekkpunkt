import { NextResponse, type NextRequest } from 'next/server';
import { ADMIN_ROLES, fail, guard } from '@/lib/api/http';
import { settingsPatchSchema } from '@/lib/admin/schemas';
import { createAdminClient } from '@/lib/supabase/admin';
import { syncGradingGuide, type KbSyncResult } from '@/lib/voice/kb';

/**
 * Change any subset of the admin settings (addendum section 7). Values are range-checked by zod;
 * the SQL function writes only what changed, with one audit row. A new grading guide is pushed
 * to the voice agents' knowledge base; a failed push keeps the saved text and says so.
 */
export async function PATCH(req: NextRequest) {
  const g = await guard(req, ADMIN_ROLES, settingsPatchSchema);
  if (!g.ok) return g.res;
  const { user, body } = g;
  const db = createAdminClient();

  const { data, error } = await db.rpc('admin_update_settings', { p: { warehouse_id: user.warehouseId, user_id: user.userId, values: body } });
  if (error) {
    console.error('[admin] settings failed:', error.message);
    return fail('failed', 500);
  }
  const changed = (data as { changed: string[] }).changed;

  let kb: KbSyncResult | null = null;
  if (changed.includes('grading_guide') && body.grading_guide) {
    kb = await syncGradingGuide(body.grading_guide);
    await db.from('audit_events').insert({
      warehouse_id: user.warehouseId,
      station: 'admin',
      type: kb.ok ? 'GRADING_GUIDE_SYNCED' : 'GRADING_GUIDE_SYNC_FAILED',
      ref_type: 'settings',
      ref_label: 'grading_guide',
      summary_nb: kb.ok ? 'Vurderingsveiledning sendt til stemmeassistentene' : 'Vurderingsveiledning ble lagret, men ikke sendt til stemmeassistentene',
      summary_en: kb.ok ? 'Grading guide sent to the voice agents' : 'Grading guide saved but not sent to the voice agents',
      actor_user: user.userId,
      payload: kb,
    });
  }
  return NextResponse.json({ ok: true, changed, kb });
}
