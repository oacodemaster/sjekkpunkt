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
    <main className="flex flex-1 items-center justify-center bg-frame p-4">
      <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-xl">
        <h1 className="text-2xl font-bold">{t('pickDevice', user.lang)}</h1>
        <p className="mt-1 text-muted">{t('pickDeviceHelp', user.lang)}</p>
        <form action={setDevice} className="mt-6 grid grid-cols-2 gap-3">
          {typeof next === 'string' && <input type="hidden" name="next" value={next} />}
          {(devices ?? []).map((d) => (
            <button
              key={d.label}
              name="label"
              value={d.label}
              className={d.label === current ? 'btn-primary' : 'btn-secondary'}
            >
              {d.label}
            </button>
          ))}
        </form>
      </div>
    </main>
  );
}
