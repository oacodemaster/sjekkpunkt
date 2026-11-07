import { NextResponse } from 'next/server';
import { z } from 'zod';
import { currentDeviceId, guard, RETURN_ROLES } from '@/lib/api/http';
import { lateDays, loadSettings } from '@/lib/returns/server';
import { unknownReturnSummaryNb } from '@/lib/returns/summary';
import { createAdminClient } from '@/lib/supabase/admin';

const Body = z.object({ code: z.string().trim().min(1).max(64) });

/** Same normalization as the engine's resolveScan (R13): "RET-1043", "retur 1043", "1043". */
function normalizeReturnCode(code: string): string {
  return code.trim().toUpperCase().replace(/^(RET|RETUR|R)[-\s:]*/, '');
}

/**
 * Finds a return by QR or number (R1). An unknown parcel becomes an `unknown_return`
 * escalation (R13). A late return is escalated at scan time, never rejected (R14).
 */
export async function POST(req: Request) {
  const g = await guard(req, RETURN_ROLES, Body);
  if (!g.ok) return g.res;
  const { user, body } = g;
  const db = createAdminClient();
  const device = await currentDeviceId(user.warehouseId);
  const norm = normalizeReturnCode(body.code);

  const { data: ret } = norm
    ? await db
        .from('returns')
        .select('id, ext_id, status, registered_at, orders(shipped_at)')
        .eq('warehouse_id', user.warehouseId)
        .eq('ext_id', norm)
        .maybeSingle()
    : { data: null };

  if (!ret) {
    const code = body.code.slice(0, 64);
    await db.from('escalations').insert({
      warehouse_id: user.warehouseId,
      entity_type: 'parcel',
      reason: 'unknown_return',
      summary_nb: unknownReturnSummaryNb(code),
      resolution: { scannedCode: code },
    });
    await db.from('audit_events').insert({
      warehouse_id: user.warehouseId,
      station: 'return',
      type: 'UNKNOWN_RETURN_SCANNED',
      ref_label: code,
      summary_nb: `Ukjent pakke skannet (${code}), sendt til teamleder`,
      summary_en: `Unknown parcel scanned (${code}), sent to team lead`,
      actor_device: device,
    });
    return NextResponse.json({ kind: 'unknown', code });
  }

  const order = Array.isArray(ret.orders) ? ret.orders[0] : ret.orders;
  const settings = await loadSettings(db, user.warehouseId);
  const days = lateDays(order?.shipped_at ?? undefined, ret.registered_at ?? undefined);
  const late = days !== null && days > settings.returnWindowDays;

  if (late) {
    const { data: open } = await db
      .from('escalations')
      .select('id')
      .eq('entity_type', 'return')
      .eq('entity_id', ret.id)
      .eq('reason', 'late_return')
      .eq('status', 'open')
      .limit(1);
    if (!open?.length) {
      await db.from('escalations').insert({
        warehouse_id: user.warehouseId,
        entity_type: 'return',
        entity_id: ret.id,
        reason: 'late_return',
        summary_nb: `Retur ${ret.ext_id} ble registrert ${days} dager etter sending, over returfristen på ${settings.returnWindowDays} dager. Den trenger din vurdering.`,
      });
    }
  }

  if (ret.status === 'pending') {
    await db.from('returns').update({ status: 'inspecting' }).eq('id', ret.id).eq('status', 'pending');
  }
  await db.from('audit_events').insert({
    warehouse_id: user.warehouseId,
    station: 'return',
    type: 'RETURN_SCANNED',
    ref_type: 'return',
    ref_id: ret.id,
    ref_label: ret.ext_id,
    summary_nb: `Retur ${ret.ext_id} skannet${late ? ' (for sent, sendt til teamleder)' : ''}`,
    summary_en: `Return ${ret.ext_id} scanned${late ? ' (late, sent to team lead)' : ''}`,
    actor_device: device,
  });

  return NextResponse.json({ kind: 'found', extId: ret.ext_id, late, lateDays: days });
}
