import { RetentionButton } from '@/components/admin/retention-button';
import { SettingsForm } from '@/components/admin/settings-form';
import { Card } from '@/components/desk-shell';
import { retentionStatus } from '@/lib/admin/retention';
import { readSettings } from '@/lib/admin/settings';
import { requireRole } from '@/lib/auth/dal';
import { ENGINE_VERSION } from '@/lib/engine/constants';
import { spendStatus } from '@/lib/limits/server';
import { createClient } from '@/lib/supabase/server';

const when = (iso: string) => new Date(iso).toLocaleString('nb-NO', { timeZone: 'Europe/Oslo', dateStyle: 'short', timeStyle: 'short' });
const nok = (ore: number) => (ore / 100).toLocaleString('nb-NO', { maximumFractionDigits: 2 });
const ROLE_NB: Record<string, string> = { packer: 'Pakker', returns: 'Retur', lead: 'Teamleder', admin: 'Admin' };

export default async function AdminPage() {
  const user = await requireRole(['admin']);
  const supabase = await createClient();
  const [{ data: rows }, { data: profiles }, retention, spend] = await Promise.all([
    supabase.from('settings').select('key, value'),
    supabase.from('profiles').select('display_name, role, preferred_lang, privacy_info_read_at').order('role'),
    retentionStatus(user.warehouseId),
    spendStatus(user.warehouseId),
  ]);
  const settings = readSettings((rows ?? []) as { key: string; value: unknown }[]);

  return (
    <>
      <h1 className="text-3xl font-bold">Admin</h1>
      <Card title="Innstillinger">
        <SettingsForm initial={settings} />
      </Card>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Sletting av bilder">
          <dl className="grid grid-cols-2 gap-3 text-base" data-testid="retention">
            <div>
              <dt className="text-sm text-muted">Lagrede bilder</dt>
              <dd className="text-2xl font-bold tabular-nums">{retention.stored}</dd>
            </div>
            <div>
              <dt className="text-sm text-muted">Utløpt, venter på sletting</dt>
              <dd className="text-2xl font-bold tabular-nums">{retention.expiredWaiting}</dd>
            </div>
            <div>
              <dt className="text-sm text-muted">Neste utløper</dt>
              <dd>{retention.nextExpiry ? when(retention.nextExpiry) : '—'}</dd>
            </div>
            <div>
              <dt className="text-sm text-muted">Siste kjøring</dt>
              <dd>{retention.lastRun ? `${when(retention.lastRun.at)} · ${retention.lastRun.summary}` : 'Ikke kjørt ennå'}</dd>
            </div>
          </dl>
          <p className="mt-3 text-sm text-muted">
            Bilder slettes etter {settings.photo_retention_days} dager. Jobben kjører hver natt (Vercel Cron) og kan kjøres nå. Referansebilder av varer slettes ikke.
          </p>
          <div className="mt-3">
            <RetentionButton />
          </div>
        </Card>
        <Card title="Kostnad i dag (estimat)">
          <dl className="grid grid-cols-2 gap-3 text-base" data-testid="spend">
            {[
              { s: spend.vision, label: 'Gemini: bilder og oversettelse' },
              { s: spend.elevenlabs, label: 'ElevenLabs: stemme og opplesning' },
            ].map(({ s, label }) => (
              <div key={s.provider} data-provider={s.provider} data-capped={s.capped}>
                <dt className="text-sm text-muted">{label}</dt>
                <dd className={`text-2xl font-bold tabular-nums ${s.capped ? 'text-bad' : ''}`}>
                  {nok(s.spentOre)} / {nok(s.capOre)} kr
                </dd>
                <dd className="text-sm text-muted">
                  {s.calls} kall{s.capped ? ' · grensen er nådd, stasjonene bruker trykk' : ''}
                </dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 text-sm text-muted">
            Grove estimater per kall, ikke en faktura. Når grensen er nådd slår stasjonene av bildeanalyse eller stemme til midnatt og viser det til de ansatte. Grensene endres under Innstillinger. Ingen tall per ansatt.
          </p>
        </Card>
        <Card title="Brukere">
          <table className="w-full text-left text-base">
            <thead className="text-sm text-muted">
              <tr>
                <th className="py-1">Navn</th>
                <th>Rolle</th>
                <th>Språk</th>
                <th>Personvern lest</th>
              </tr>
            </thead>
            <tbody>
              {(profiles ?? []).map((p, i) => (
                <tr key={i} className="border-t">
                  <td className="py-2">{p.display_name}</td>
                  <td>{ROLE_NB[p.role] ?? p.role}</td>
                  <td className="uppercase">{p.preferred_lang}</td>
                  <td className="text-sm">{p.privacy_info_read_at ? when(p.privacy_info_read_at) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-4 text-sm text-muted">Regelmotor v{ENGINE_VERSION}</p>
        </Card>
      </div>
    </>
  );
}
