import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';

// Photo retention (addendum section 10): every photo gets expires_at = created_at +
// photo_retention_days; this job deletes the files that have expired and clears their paths.
// Product reference photos have no expiry. Runs daily from Vercel cron and on demand from admin.

const BATCH = 1_000; // photos per run and warehouse; a backlog is worked off on the next run
const CHUNK = 100; // paths per Storage remove call

export interface RetentionResult {
  warehouseId: string;
  deleted: number;
  failed: number;
}

export async function runRetention(opts: { trigger: 'cron' | 'admin'; warehouseId?: string; userId?: string; now?: Date }): Promise<RetentionResult[]> {
  const db = createAdminClient();
  const now = (opts.now ?? new Date()).toISOString();
  let wq = db.from('warehouses').select('id');
  if (opts.warehouseId) wq = wq.eq('id', opts.warehouseId);
  const { data: warehouses, error: wErr } = await wq;
  if (wErr) throw new Error(`retention: warehouses: ${wErr.message}`);

  const results: RetentionResult[] = [];
  for (const { id: warehouseId } of warehouses ?? []) {
    const { data: expired, error } = await db
      .from('photos')
      .select('id, storage_path')
      .eq('warehouse_id', warehouseId)
      .not('storage_path', 'is', null)
      .lte('expires_at', now)
      .order('expires_at')
      .limit(BATCH);
    if (error) throw new Error(`retention: photos: ${error.message}`);

    const deleted: string[] = [];
    let failed = 0;
    const rows = (expired ?? []) as { id: string; storage_path: string }[];
    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK);
      // A path whose upload never finished has no file; removing it is a no-op, not an error.
      const { error: rmErr } = await db.storage.from('photos').remove(chunk.map((r) => r.storage_path));
      if (rmErr) {
        console.error('[retention] storage remove failed:', rmErr.message);
        failed += chunk.length;
      } else deleted.push(...chunk.map((r) => r.id));
    }

    const { data, error: rpcErr } = await db.rpc('record_retention_run', {
      p: { warehouse_id: warehouseId, deleted_ids: deleted, failed, trigger: opts.trigger, user_id: opts.userId ?? null },
    });
    if (rpcErr) throw new Error(`retention: record: ${rpcErr.message}`);
    results.push({ warehouseId, ...(data as { deleted: number; failed: number }) });
  }
  return results;
}

export interface RetentionStatus {
  stored: number;
  expiredWaiting: number;
  nextExpiry: string | null;
  lastRun: { at: string; summary: string } | null;
}

export async function retentionStatus(warehouseId: string): Promise<RetentionStatus> {
  const db = createAdminClient();
  const now = new Date().toISOString();
  const base = () => db.from('photos').select('id', { count: 'exact', head: true }).eq('warehouse_id', warehouseId).not('storage_path', 'is', null);
  const [stored, waiting, next, last] = await Promise.all([
    base().neq('purpose', 'reference'),
    base().lte('expires_at', now),
    db
      .from('photos')
      .select('expires_at')
      .eq('warehouse_id', warehouseId)
      .not('storage_path', 'is', null)
      .gt('expires_at', now)
      .order('expires_at')
      .limit(1)
      .maybeSingle(),
    db.from('audit_events').select('at, summary_nb').eq('warehouse_id', warehouseId).eq('type', 'RETENTION_RUN').order('at', { ascending: false }).limit(1).maybeSingle(),
  ]);
  return {
    stored: stored.count ?? 0,
    expiredWaiting: waiting.count ?? 0,
    nextExpiry: (next.data?.expires_at as string | undefined) ?? null,
    lastRun: last.data ? { at: last.data.at as string, summary: last.data.summary_nb as string } : null,
  };
}
