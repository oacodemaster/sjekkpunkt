import { Card, Stat } from '@/components/desk-shell';
import { requireRole } from '@/lib/auth/dal';
import { createClient } from '@/lib/supabase/server';

export default async function LeadPage() {
  await requireRole(['lead', 'admin']);
  const supabase = await createClient();
  const head = { count: 'exact' as const, head: true };
  const [esc, adj, alerts, log] = await Promise.all([
    supabase.from('escalations').select('*', head).eq('status', 'open'),
    supabase.from('stock_adjustments').select('*', head).eq('status', 'proposed'),
    supabase.from('pack_alerts').select('*', head).eq('active', true),
    supabase.from('audit_log').select('at, station, type, ref_label, summary_nb').order('at', { ascending: false }).limit(10),
  ]);

  return (
    <>
      <h1 className="text-3xl font-bold">Teamleder</h1>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Stat label="Åpne eskaleringer" value={esc.count ?? 0} />
        <Stat label="Lagerjusteringer til godkjenning" value={adj.count ?? 0} />
        <Stat label="Aktive pakkevarsler" value={alerts.count ?? 0} />
      </div>
      <Card title="Hendelseslogg">
        <ul className="divide-y">
          {(log.data ?? []).map((e, i) => (
            <li key={i} className="flex gap-4 py-2 text-base">
              <time className="w-40 shrink-0 font-mono text-sm text-muted">
                {new Date(e.at).toLocaleString('nb-NO', { timeZone: 'Europe/Oslo' })}
              </time>
              <span className="w-16 shrink-0 text-sm uppercase text-muted">{e.station}</span>
              <span>{e.summary_nb}</span>
            </li>
          ))}
        </ul>
      </Card>
      <p className="text-sm text-muted">Eskaleringskø, overstyring og godkjenninger kommer i M5.</p>
    </>
  );
}
