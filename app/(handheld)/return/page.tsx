import { requireRole } from '@/lib/auth/dal';
import { t } from '@/lib/i18n/strings';
import { createClient } from '@/lib/supabase/server';

export default async function ReturnQueuePage() {
  const user = await requireRole(['returns', 'lead', 'admin']);
  const supabase = await createClient();
  const { data: returns } = await supabase
    .from('returns')
    .select('ext_id, customer_reason_nb, registered_at, return_items(ordered_sku, qty)')
    .in('status', ['pending', 'inspecting', 'awaiting_confirm'])
    .order('registered_at', { ascending: true });

  return (
    <section className="flex flex-1 flex-col gap-4 p-4">
      <button className="btn-primary text-xl" disabled>
        {t('scanReturn', user.lang)}
      </button>
      <h1 className="text-2xl font-bold">{t('returnsToInspect', user.lang)}</h1>
      <ul className="flex flex-col gap-3">
        {(returns ?? []).map((r) => (
          <li key={r.ext_id} className="rounded-2xl border-2 border-gray-200 p-4">
            <div className="flex items-baseline justify-between">
              <span className="text-2xl font-bold">#{r.ext_id}</span>
              <span className="text-muted">
                {(r.return_items ?? []).reduce((n, i) => n + i.qty, 0)} {t('items', user.lang)}
              </span>
            </div>
            <p className="mt-1 text-gray-700">“{r.customer_reason_nb}”</p>
            <p className="font-mono text-sm text-muted">{(r.return_items ?? []).map((i) => i.ordered_sku).join(' · ')}</p>
          </li>
        ))}
      </ul>
      <p className="mt-auto text-center text-sm text-muted">{t('comingNext', user.lang)}: inspeksjon · inspection (M2)</p>
    </section>
  );
}
