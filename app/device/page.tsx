import { Button } from '@/components/ui';
import { SignedOutShell } from '@/components/ui/signed-out-shell';
import { setDevice } from '@/lib/auth/actions';
import { getDeviceLabel, requireRole } from '@/lib/auth/dal';
import { t } from '@/lib/i18n/strings';
import { createClient } from '@/lib/supabase/server';

export default async function DevicePage({ searchParams }: PageProps<'/device'>) {
  const user = await requireRole(['packer', 'returns', 'lead', 'admin']);
  const { next } = await searchParams;
  const current = await getDeviceLabel();
  const supabase = await createClient();
  const { data: devices } = await supabase.from('devices').select('label').order('label');

  return (
    <SignedOutShell lang={user.lang}>
      <div className="flex flex-col gap-2">
        <h1 className="type-title m-0">{t('pickDevice', user.lang)}</h1>
        <p className="type-body m-0 text-ink-2">{t('pickDeviceHelp', user.lang)}</p>
      </div>
      <form action={setDevice} className="grid grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-3">
        {typeof next === 'string' && <input type="hidden" name="next" value={next} />}
        {(devices ?? []).map((d) => (
          <Button key={d.label} type="submit" name="label" value={d.label} variant={d.label === current ? 'primary' : 'secondary'} icon="device" aria-current={d.label === current ? 'true' : undefined}>
            <span className="sp-mono">{d.label}</span>
          </Button>
        ))}
      </form>
    </SignedOutShell>
  );
}
