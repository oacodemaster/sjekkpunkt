import { GuideEditor } from '@/components/admin/guide-editor';
import { Card } from '@/components/desk-shell';
import { readSettings } from '@/lib/admin/settings';
import { requireRole } from '@/lib/auth/dal';
import { createClient } from '@/lib/supabase/server';

export default async function GuidePage() {
  await requireRole(['admin']);
  const supabase = await createClient();
  const { data: rows } = await supabase.from('settings').select('key, value');
  const settings = readSettings((rows ?? []) as { key: string; value: unknown }[]);
  const { data: last } = await supabase
    .from('audit_events')
    .select('at, type')
    .in('type', ['GRADING_GUIDE_SYNCED', 'GRADING_GUIDE_SYNC_FAILED'])
    .order('at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return (
    <>
      <h1 className="type-title m-0">Vurderingsveiledning</h1>
      <Card title="Veiledning for grad, hylle og refusjon">
        <p className="mb-3 text-[15px] text-ink-2">
          Teksten er kunnskapsbasen til retur-assistenten og teamleder-assistenten. Når du lagrer, sendes den til ElevenLabs med en gang. Regelmotoren bestemmer fortsatt grad og refusjon;
          veiledningen styrer hva assistentene forklarer.
        </p>
        <GuideEditor initial={settings.grading_guide} />
        {last && (
          <p className="mt-3 text-[15px] text-ink-2">
            Sist {last.type === 'GRADING_GUIDE_SYNCED' ? 'sendt' : 'forsøkt sendt (feilet)'}{' '}
            {new Date(last.at).toLocaleString('nb-NO', { timeZone: 'Europe/Oslo', dateStyle: 'short', timeStyle: 'short' })}.
          </p>
        )}
      </Card>
    </>
  );
}
