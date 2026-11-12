import { Card } from '@/components/desk-shell';
import { requireRole } from '@/lib/auth/dal';
import { LANDING } from '@/lib/landing/copy';
import { LEAD_RETENTION_DAYS } from '@/lib/leads/schema';
import { createAdminClient } from '@/lib/supabase/admin';

// Leads from the landing page form (landing page brief, section 9). Admin only and read only: the
// table has no grant for signed-in users, so the page reads it with the service client after
// requireRole. Leads are not warehouse data; they belong to Forsterk, who answers them.

const nb = LANDING.nb.form;
const when = (iso: string) => new Date(iso).toLocaleString('nb-NO', { timeZone: 'Europe/Oslo', dateStyle: 'short', timeStyle: 'short' });

type Row = {
  id: string;
  created_at: string;
  name: string;
  email: string;
  company: string;
  role: keyof typeof nb.roles | null;
  orders_per_day: keyof typeof nb.volumes | null;
  interest: keyof typeof nb.interests | null;
  message: string | null;
  lang: 'nb' | 'en';
  notified_at: string | null;
};

export default async function LeadsPage() {
  await requireRole(['admin']);
  const { data, error } = await createAdminClient()
    .from('leads')
    .select('id, created_at, name, email, company, role, orders_per_day, interest, message, lang, notified_at')
    .order('created_at', { ascending: false })
    .limit(200);
  const rows = (data ?? []) as Row[];

  return (
    <div className="flex flex-col gap-4">
      <Card title={`Henvendelser fra forsiden (${rows.length})`}>
        <p className="m-0 mb-3 text-ink-2">
          Fra skjemaet «Be om en pilot». Slettes automatisk etter {LEAD_RETENTION_DAYS} dager. Nye henvendelser sendes også på e-post når e-post er satt opp.
        </p>
        {error && <p className="m-0 text-stop">Kunne ikke hente henvendelsene.</p>}
        {rows.length === 0 && !error ? (
          <p className="m-0">Ingen henvendelser ennå.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="sp-table" data-testid="leads-table">
              <thead>
                <tr>
                  <th>Mottatt</th>
                  <th>Navn og firma</th>
                  <th>Rolle</th>
                  <th>Ordrer per dag</th>
                  <th>Interesse</th>
                  <th>Melding</th>
                  <th>E-post sendt</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="sp-mono whitespace-nowrap">{when(r.created_at)}</td>
                    <td>
                      <div className="font-semibold">{r.name}</div>
                      <div>{r.company}</div>
                      <a className="sp-link" href={`mailto:${r.email}`}>
                        {r.email}
                      </a>
                      <span className="sp-mono ml-2 text-ink-2">{r.lang.toUpperCase()}</span>
                    </td>
                    <td>{r.role ? nb.roles[r.role] : '–'}</td>
                    <td>{r.orders_per_day ? nb.volumes[r.orders_per_day] : '–'}</td>
                    <td>{r.interest ? nb.interests[r.interest] : '–'}</td>
                    <td className="max-w-[28rem] whitespace-pre-wrap">{r.message ?? '–'}</td>
                    <td>{r.notified_at ? when(r.notified_at) : 'Nei'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
