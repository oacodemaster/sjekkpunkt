import { ImportForm } from '@/components/admin/import-form';
import { Card } from '@/components/desk-shell';
import { requireRole } from '@/lib/auth/dal';
import { createClient } from '@/lib/supabase/server';

export default async function ImportPage() {
  await requireRole(['admin']);
  const supabase = await createClient();
  const { data: recent } = await supabase.from('audit_events').select('id, at, summary_nb').eq('type', 'CSV_IMPORT').order('at', { ascending: false }).limit(5);

  return (
    <>
      <h1 className="text-3xl font-bold">Import</h1>
      <Card title="CSV-import av varer, ordrer og returer">
        <ImportForm />
      </Card>
      {(recent ?? []).length > 0 && (
        <Card title="Siste importer">
          <ul className="flex flex-col gap-1 text-base">
            {(recent ?? []).map((r) => (
              <li key={r.id}>
                <span className="font-mono text-sm text-muted">{new Date(r.at).toLocaleString('nb-NO', { timeZone: 'Europe/Oslo', dateStyle: 'short', timeStyle: 'short' })}</span> {r.summary_nb}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
