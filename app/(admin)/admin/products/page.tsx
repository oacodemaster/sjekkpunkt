import Link from 'next/link';
import { Card } from '@/components/desk-shell';
import { requireRole } from '@/lib/auth/dal';
import { createClient } from '@/lib/supabase/server';

export default async function ProductsPage({ searchParams }: PageProps<'/admin/products'>) {
  await requireRole(['admin']);
  const raw = (await searchParams).q;
  const q = typeof raw === 'string' ? raw.trim().slice(0, 60) : '';
  const supabase = await createClient();
  let query = supabase.from('products').select('sku, name_nb, category, size, price_nok, location_code, variant_group, barcode, reference_photo_paths').order('sku');
  if (q) {
    const like = `%${q.replace(/[%_,()]/g, ' ')}%`;
    query = query.or(`sku.ilike.${like},name_nb.ilike.${like},barcode.ilike.${like},variant_group.ilike.${like}`);
  }
  const { data: products } = await query.limit(300);

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="type-title m-0">Varer</h1>
        <div className="flex gap-3">
          <form className="flex gap-2" role="search">
            <input name="q" defaultValue={q} placeholder="Søk SKU, navn, strekkode" className="w-72 sp-input sp-input--desk" aria-label="Søk" />
            <button className="sp-btn sp-btn--secondary sp-btn--desk">Søk</button>
          </form>
          <Link href="/admin/products/new" className="sp-btn sp-btn--primary sp-btn--desk">
            Ny vare
          </Link>
        </div>
      </div>
      <Card title={`${products?.length ?? 0} varer${q ? ` som passer «${q}»` : ''}`}>
        <table className="sp-table" data-testid="products">
          <thead>
            <tr>
              <th>SKU</th>
              <th>Navn</th>
              <th>Hylle</th>
              <th>Variantgruppe</th>
              <th className="text-right">Pris</th>
              <th className="text-right">Bilder</th>
            </tr>
          </thead>
          <tbody>
            {(products ?? []).map((p) => (
              <tr key={p.sku}>
                <td className="sp-mono">
                  <Link href={`/admin/products/${encodeURIComponent(p.sku)}`} className="sp-link">
                    {p.sku}
                  </Link>
                </td>
                <td>{p.name_nb}</td>
                <td className="type-code-dense">{p.location_code}</td>
                <td className="text-ink-2">{p.variant_group ?? '—'}</td>
                <td className="type-code-dense text-right">{p.price_nok.toLocaleString('nb-NO')} kr</td>
                <td className="type-code-dense text-right">{(p.reference_photo_paths ?? []).length || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}
