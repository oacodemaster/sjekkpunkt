import { Card } from '@/components/desk-shell';
import { requireRole } from '@/lib/auth/dal';
import { ENGINE_VERSION } from '@/lib/engine/constants';
import { createClient } from '@/lib/supabase/server';

export default async function AdminPage() {
  await requireRole(['admin']);
  const supabase = await createClient();
  const [{ data: settings }, { data: profiles }, { count: auditCount }] = await Promise.all([
    supabase.from('settings').select('key, value').order('key'),
    supabase.from('profiles').select('display_name, role, preferred_lang').order('role'),
    supabase.from('audit_events').select('*', { count: 'exact', head: true }),
  ]);

  return (
    <>
      <h1 className="text-3xl font-bold">Admin</h1>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Innstillinger">
          <table className="w-full text-left text-base">
            <tbody>
              {(settings ?? []).map((s) => (
                <tr key={s.key} className="border-t">
                  <td className="py-2 font-mono text-sm">{s.key}</td>
                  <td className="py-2 font-mono text-sm">{JSON.stringify(s.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <Card title="Brukere">
          <table className="w-full text-left text-base">
            <tbody>
              {(profiles ?? []).map((p, i) => (
                <tr key={i} className="border-t">
                  <td className="py-2">{p.display_name}</td>
                  <td>{p.role}</td>
                  <td className="uppercase">{p.preferred_lang}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-4 text-sm text-muted">
            Regelmotor v{ENGINE_VERSION} · {auditCount ?? 0} hendelser i revisjonsloggen
          </p>
        </Card>
      </div>
      <p className="text-sm text-muted">Redigering, import, revisjonslogg og sletting kommer i M7.</p>
    </>
  );
}
