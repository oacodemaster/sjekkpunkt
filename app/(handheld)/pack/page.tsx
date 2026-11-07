import Link from 'next/link';
import { OrderForm } from '@/components/pack/order-form';
import { Banner, StatusChip } from '@/components/ui';
import { requireRole } from '@/lib/auth/dal';
import { t } from '@/lib/i18n/strings';
import { createClient } from '@/lib/supabase/server';

export default async function PackQueuePage({ searchParams }: PageProps<'/pack'>) {
  const user = await requireRole(['packer', 'lead', 'admin']);
  const { missing } = await searchParams;
  const supabase = await createClient();
  const [{ data: orders }, { data: alerts }] = await Promise.all([
    supabase
      .from('orders')
      .select('ext_id, customer_ref, order_lines(sku, qty, products(name_nb, name_en))')
      .eq('status', 'picked')
      .order('ext_id'),
    supabase.from('pack_alerts').select('sku_a, sku_b, reason_nb').eq('active', true),
  ]);
  const alertSkus = new Set((alerts ?? []).flatMap((a) => [a.sku_a, a.sku_b]));

  return (
    <section className="flex flex-1 flex-col gap-6 p-4">
      <OrderForm lang={user.lang} />
      {missing && (
        <Banner tone="warn" role="alert">
          {t('noOrder', user.lang)} (<span className="sp-mono">{String(missing).slice(0, 20)}</span>)
        </Banner>
      )}
      <div className="flex flex-col gap-3">
        <h1 className="type-title m-0">{t('ordersToPack', user.lang)}</h1>
        <ul className="m-0 flex list-none flex-col gap-3 p-0">
          {(orders ?? []).map((o) => {
            const lines = o.order_lines ?? [];
            const units = lines.reduce((n, l) => n + l.qty, 0);
            const alerted = lines.some((l) => alertSkus.has(l.sku));
            return (
              <li key={o.ext_id}>
                <Link href={`/pack/${o.ext_id}`} className="sp-row">
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="type-code-lg">#{o.ext_id}</span>
                    <span className="type-body text-ink-2">
                      <span className="sp-mono">{units}</span> {t('items', user.lang)}
                    </span>
                  </span>
                  <ul className="type-body m-0 list-none p-0 text-ink-2">
                    {lines.map((l) => {
                      const p = Array.isArray(l.products) ? l.products[0] : l.products;
                      return (
                        <li key={l.sku}>
                          {l.qty > 1 && <strong className="sp-mono text-ink">{l.qty} × </strong>}
                          {user.lang === 'nb' ? p?.name_nb : p?.name_en}
                        </li>
                      );
                    })}
                  </ul>
                  {alerted && (
                    <span>
                      <StatusChip tone="warn">{t('showLabel', user.lang)}</StatusChip>
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
