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
  const { data: orders } = await supabase
    .from('orders')
    .select('ext_id, customer_ref, status, pack_checks(status, method, size_verified, created_at)')
    .in('status', ['picked', 'packed'])
    .order('ext_id')
    .limit(30);
  const { data: returns } = await supabase
    .from('returns')
    .select('ext_id, customer_reason_nb, status, orders(ext_id), return_items(item_index, decisions(grade, location_code, decided_at))')
    .order('registered_at', { ascending: false })
    .limit(30);

  return (
    <>
      <div className="flex items-baseline justify-between">
        <h1 className="text-3xl font-bold">Holio WMS (mock)</h1>
        <Link href="/holio/events" className="underline">
          Integrasjonshendelser
        </Link>
      </div>
      <Card title="Ordrer til pakking">
        <table className="w-full text-left text-base" data-testid="holio-orders">
          <thead className="text-sm text-muted">
            <tr>
              <th className="py-1">Ordre</th>
              <th>Kunde</th>
              <th>Status</th>
              <th>Pakkebevis</th>
            </tr>
          </thead>
          <tbody>
            {(orders ?? []).map((o) => {
              const checks = [...(o.pack_checks ?? [])].sort((a, b) => b.created_at.localeCompare(a.created_at));
              const sealed = checks.find((c) => c.status === 'VERIFIED' || c.status === 'MANUAL_CONFIRM');
              const caught = checks.some((c) => c.status === 'MISMATCH');
              return (
                <tr key={o.ext_id} className="border-t">
                  <td className="py-2 font-mono">
                    <Link href={`/holio/orders/${o.ext_id}`} className="text-accent underline">
                      {o.ext_id}
                    </Link>
                  </td>
                  <td>{o.customer_ref}</td>
                  <td>{o.status === 'packed' ? 'Pakket' : 'Plukket'}</td>
                  <td>
                    {sealed ? (sealed.status === 'VERIFIED' ? `Verifisert (${sealed.method === 'barcode' ? 'strekkode' : 'kamera'})` : 'Manuelt bekreftet') : '—'}
                    {caught && <span className="ml-2 rounded-full bg-red-50 px-2 py-0.5 text-sm font-semibold text-bad">feil stoppet</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
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
