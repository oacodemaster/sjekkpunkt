import { Card } from '@/components/desk-shell';
import { requireRole } from '@/lib/auth/dal';
import { confusionPairs } from '@/lib/data/insights';
import { createClient } from '@/lib/supabase/server';

export default async function InsightsPage() {
  await requireRole(['lead', 'admin']);
  const supabase = await createClient();
  const rows = await confusionPairs(supabase, 7);

  return (
    <>
      <h1 className="text-3xl font-bold">Innsikt</h1>
      <Card title="Forvekslinger siste 7 dager">
        <table className="w-full text-left">
          <tbody>
            {rows.map(([pair, n]) => (
              <tr key={pair} className="border-t">
                <td className="py-2 font-mono">{pair}</td>
                <td className="py-2 text-right text-2xl font-bold tabular-nums">{n}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <p className="text-sm text-muted">Flere paneler kommer i M6.</p>
      <footer className="mt-auto border-t pt-4 text-center font-semibold text-muted">
        Ingen statistikk per ansatt · No per-employee statistics
      </footer>
    </>
  );
}
