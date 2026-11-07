import { requireRole } from '@/lib/auth/dal';
import { t } from '@/lib/i18n/strings';
import { createClient } from '@/lib/supabase/server';

export default async function PackQueuePage() {
  const user = await requireRole(['packer', 'lead', 'admin']);
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
    <section className="flex flex-1 flex-col gap-4 p-4">
      <h1 className="text-2xl font-bold">{t('ordersToPack', user.lang)}</h1>
      <ul className="flex flex-col gap-3">
        {(orders ?? []).map((o) => {
          const lines = o.order_lines ?? [];
          const units = lines.reduce((n, l) => n + l.qty, 0);
          const alerted = lines.some((l) => alertSkus.has(l.sku));
          return (
            <li key={o.ext_id} className="rounded-2xl border-2 border-gray-200 p-4">
              <div className="flex items-baseline justify-between">
                <span className="text-2xl font-bold">#{o.ext_id}</span>
                <span className="text-muted">
                  {units} {t('items', user.lang)}
                </span>
              </div>
              <ul className="mt-2 text-base text-gray-700">
                {lines.map((l) => {
                  const p = Array.isArray(l.products) ? l.products[0] : l.products;
                  return (
                    <li key={l.sku}>
                      {l.qty > 1 && <strong>{l.qty} × </strong>}
                      {user.lang === 'nb' ? p?.name_nb : p?.name_en}
                    </li>
                  );
                })}
              </ul>
              {alerted && (
                <p className="mt-2 rounded-lg bg-amber-50 px-3 py-1 font-semibold text-warn">{t('showLabel', user.lang)}</p>
              )}
            </li>
          );
        })}
      </ul>
      <p className="mt-auto text-center text-sm text-muted">{t('comingNext', user.lang)}: kamera · camera check (M4)</p>
    </section>
  );
}
