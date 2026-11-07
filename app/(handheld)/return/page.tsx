import Link from 'next/link';
import { ScanForm } from '@/components/returns/scan-form';
import { StatusChip } from '@/components/ui';
import { requireRole } from '@/lib/auth/dal';
import { t } from '@/lib/i18n/strings';
import { createClient } from '@/lib/supabase/server';

export default async function ReturnQueuePage() {
  const user = await requireRole(['returns', 'lead', 'admin']);
  const supabase = await createClient();
  const { data: returns } = await supabase
    .from('returns')
    .select('ext_id, customer_reason_nb, registered_at, status, return_items(ordered_sku, qty)')
    .in('status', ['pending', 'inspecting', 'awaiting_confirm'])
    .order('registered_at', { ascending: true });

  return (
    <section className="flex flex-1 flex-col gap-6 p-4">
      <ScanForm lang={user.lang} />
      <div className="flex flex-col gap-3">
        <h1 className="type-title m-0">{t('returnsToInspect', user.lang)}</h1>
        <ul className="m-0 flex list-none flex-col gap-3 p-0">
          {(returns ?? []).map((r) => (
            <li key={r.ext_id}>
              <Link href={`/return/${r.ext_id}`} className="sp-row">
                <span className="flex items-baseline justify-between gap-3">
                  <span className="type-code-lg">#{r.ext_id}</span>
                  <span className="type-body text-ink-2">
                    <span className="sp-mono">{(r.return_items ?? []).reduce((n, i) => n + i.qty, 0)}</span> {t('items', user.lang)}
                  </span>
                </span>
                <span className="type-body">«{r.customer_reason_nb}»</span>
                <span className="sp-line__sku">{(r.return_items ?? []).map((i) => i.ordered_sku).join(' · ')}</span>
                {r.status === 'inspecting' && (
                  <span>
                    <StatusChip tone="info" icon="camera">
                      {t('inspecting', user.lang)}
                    </StatusChip>
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
