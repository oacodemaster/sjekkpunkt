import { Card } from '@/components/desk-shell';
import { requireRole } from '@/lib/auth/dal';
import { createClient } from '@/lib/supabase/server';

/** Mock of how a Holio WMS return list would look. Not Holio's visual identity. */
export default async function HolioMockPage() {
  await requireRole(['lead', 'admin']);
  const supabase = await createClient();
  const { data: returns } = await supabase
    .from('returns')
    .select('ext_id, customer_reason_nb, status, orders(ext_id)')
    .order('registered_at', { ascending: false })
    .limit(20);

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
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {(returns ?? []).map((r) => {
              const o = Array.isArray(r.orders) ? r.orders[0] : r.orders;
              return (
                <tr key={r.ext_id} className="border-t">
                  <td className="py-2 font-mono">{r.ext_id}</td>
                  <td className="font-mono">{o?.ext_id}</td>
                  <td>{r.customer_reason_nb}</td>
                  <td>{r.status}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
      <p className="text-sm text-muted">Returkort med Tilstand, Grad, Bilder og integrasjonshendelser kommer i M2 og M6.</p>
    </>
  );
}
