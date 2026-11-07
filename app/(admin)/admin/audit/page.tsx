import Link from 'next/link';
import { Card } from '@/components/desk-shell';
import { requireRole } from '@/lib/auth/dal';
import { createClient } from '@/lib/supabase/server';

// Audit log viewer (addendum section 7). Admin-only: raw events with payloads. The log is
// append-only; this page only reads. Actors appear only where the event recorded one
// (approvals, overrides, manual confirms, admin changes, devices at the stations).

const PAGE = 100;
const STATIONS: Record<string, string> = { pack: 'Pakking', return: 'Retur', lead: 'Teamleder', admin: 'Admin', system: 'System' };
const DATE = /^\d{4}-\d{2}-\d{2}$/;

type Search = { station?: string; type?: string; q?: string; from?: string; to?: string; page?: string };

export default async function AuditPage({ searchParams }: PageProps<'/admin/audit'>) {
  await requireRole(['admin']);
  const sp = (await searchParams) as Search;
  const station = sp.station && STATIONS[sp.station] ? sp.station : '';
  const type = typeof sp.type === 'string' && /^[A-Z_]{2,60}$/.test(sp.type) ? sp.type : '';
  const q = typeof sp.q === 'string' ? sp.q.trim().slice(0, 60) : '';
  const from = typeof sp.from === 'string' && DATE.test(sp.from) ? sp.from : '';
  const to = typeof sp.to === 'string' && DATE.test(sp.to) ? sp.to : '';
  const page = Math.max(0, Math.min(1000, Number.parseInt(sp.page ?? '0', 10) || 0));

  const supabase = await createClient();
  let query = supabase
    .from('audit_events')
    .select('id, at, station, type, ref_type, ref_label, summary_nb, summary_en, actor_user, actor_device, payload', { count: 'exact' })
    .order('at', { ascending: false })
    .range(page * PAGE, page * PAGE + PAGE - 1);
  if (station) query = query.eq('station', station);
  if (type) query = query.eq('type', type);
  if (q) query = query.ilike('ref_label', `%${q.replace(/[%_]/g, '')}%`);
  if (from) query = query.gte('at', new Date(`${from}T00:00:00+01:00`).toISOString());
  if (to) query = query.lt('at', new Date(new Date(`${to}T00:00:00+01:00`).getTime() + 86_400_000).toISOString());

  const [{ data: events, count, error }, { data: typeRows }, { data: profiles }, { data: devices }] = await Promise.all([
    query,
    supabase.from('audit_events').select('type').order('at', { ascending: false }).limit(2000),
    supabase.from('profiles').select('user_id, display_name, role'),
    supabase.from('devices').select('id, label'),
  ]);
  if (error) throw new Error(`audit: ${error.message}`);
  const types = [...new Set((typeRows ?? []).map((r) => r.type as string))].sort();
  const person = new Map((profiles ?? []).map((p) => [p.user_id as string, `${p.display_name} (${p.role})`]));
  const device = new Map((devices ?? []).map((d) => [d.id as string, d.label as string]));
  const total = count ?? 0;
  const link = (p: number) => {
    const u = new URLSearchParams(Object.entries({ station, type, q, from, to }).filter(([, v]) => v) as [string, string][]);
    if (p) u.set('page', String(p));
    return `/admin/audit${u.size ? `?${u}` : ''}`;
  };
  const field = 'sp-input sp-input--desk';

  return (
    <>
      <h1 className="type-title m-0">Revisjonslogg</h1>
      <form className="flex flex-wrap items-end gap-3" data-testid="audit-filters">
        <label className="flex flex-col gap-1 text-[15px]">
          Stasjon
          <select name="station" defaultValue={station} className={field}>
            <option value="">Alle</option>
            {Object.entries(STATIONS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[15px]">
          Hendelse
          <select name="type" defaultValue={type} className={field}>
            <option value="">Alle</option>
            {types.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[15px]">
          Referanse
          <input name="q" defaultValue={q} placeholder="1043, JK-SHELL-L …" className={`${field} w-44`} />
        </label>
        <label className="flex flex-col gap-1 text-[15px]">
          Fra
          <input type="date" name="from" defaultValue={from} className={field} />
        </label>
        <label className="flex flex-col gap-1 text-[15px]">
          Til
          <input type="date" name="to" defaultValue={to} className={field} />
        </label>
        <button className="sp-btn sp-btn--primary sp-btn--desk">Filtrer</button>
        <Link href="/admin/audit" className="sp-link pb-3">
          Nullstill
        </Link>
      </form>

      <Card title={`${total} hendelser`}>
        <table className="sp-table" data-testid="audit-table">
          <thead>
            <tr>
              <th>Tid</th>
              <th>Stasjon</th>
              <th>Hendelse</th>
              <th>Ref.</th>
              <th>Hva skjedde</th>
              <th>Utført av</th>
            </tr>
          </thead>
          <tbody>
            {(events ?? []).map((e) => (
              <tr key={e.id} data-type={e.type}>
                <td className="type-code-dense whitespace-nowrap">
                  {new Date(e.at).toLocaleString('nb-NO', { timeZone: 'Europe/Oslo', dateStyle: 'short', timeStyle: 'medium' })}
                </td>
                <td>{STATIONS[e.station] ?? e.station}</td>
                <td className="type-code-dense">{e.type}</td>
                <td className="type-code-dense">{e.ref_label ?? '—'}</td>
                <td>
                  <details>
                    <summary className="cursor-pointer" title={e.summary_en}>
                      {e.summary_nb}
                    </summary>
                    {e.payload ? (
                      <pre className="sp-pre mt-1">{JSON.stringify(e.payload, null, 2)}</pre>
                    ) : (
                      <p className="mt-1 text-[15px] text-ink-2">Ingen detaljer.</p>
                    )}
                  </details>
                </td>
                <td>{e.actor_user ? (person.get(e.actor_user) ?? 'ukjent bruker') : e.actor_device ? (device.get(e.actor_device) ?? 'ukjent enhet') : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-4 flex items-center justify-between text-[15px]">
          {page > 0 ? <Link href={link(page - 1)} className="sp-link">← Nyere</Link> : <span />}
          <span className="text-ink-2">
            Side {page + 1} av {Math.max(1, Math.ceil(total / PAGE))}
          </span>
          {(page + 1) * PAGE < total ? <Link href={link(page + 1)} className="sp-link">Eldre →</Link> : <span />}
        </div>
      </Card>
    </>
  );
}
