import Link from 'next/link';
import { Card } from '@/components/desk-shell';
import { requireRole } from '@/lib/auth/dal';
import { createClient } from '@/lib/supabase/server';

const STATUS_NB: Record<string, string> = {
  pending: 'Venter',
  inspecting: 'Under kontroll',
  awaiting_confirm: 'Venter på bekreftelse',
  confirmed: 'Bekreftet',
  escalated: 'Hos teamleder',
};

/** Mock of how a Holio WMS return list would look. Not Holio's visual identity. */
export default async function HolioMockPage() {
  await requireRole(['lead', 'admin']);
  const supabase = await createClient();
  const { data: returns } = await supabase
    .from('returns')
    .select('ext_id, customer_reason_nb, status, orders(ext_id), return_items(item_index, decisions(grade, location_code, decided_at))')
    .order('registered_at', { ascending: false })
    .limit(30);

  return (
    <>
      <h1 className="text-3xl font-bold">Holio WMS (mock)</h1>
      <Card title="Returer">
        <table className="w-full text-left text-base">
          <thead className="text-sm text-muted">
            <tr>
              <th className="py-1">Retur</th>
              <th>Ordre</th>
              <th>Returårsak</th>
              <th>Lokasjon</th>
              <th>Grad</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {(returns ?? []).map((r) => {
              const o = Array.isArray(r.orders) ? r.orders[0] : r.orders;
              const latest = (r.return_items ?? [])
                .sort((a, b) => a.item_index - b.item_index)
                .map((i) => [...(i.decisions ?? [])].sort((a, b) => b.decided_at.localeCompare(a.decided_at))[0])
                .filter(Boolean);
              return (
                <tr key={r.ext_id} className="border-t">
                  <td className="py-2 font-mono">
                    <Link href={`/holio/returns/${r.ext_id}`} className="text-accent underline">
                      {r.ext_id}
                    </Link>
                  </td>
                  <td className="font-mono">{o?.ext_id}</td>
                  <td>{r.customer_reason_nb}</td>
                  <td className="font-mono">{latest.map((d) => d.location_code).join(', ') || '—'}</td>
                  <td>{latest.map((d) => d.grade).join(', ') || '—'}</td>
                  <td>{STATUS_NB[r.status] ?? r.status}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </>
  );
}
