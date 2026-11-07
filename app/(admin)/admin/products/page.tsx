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
        <h1 className="text-3xl font-bold">Varer</h1>
        <div className="flex gap-3">
          <form className="flex gap-2" role="search">
            <input name="q" defaultValue={q} placeholder="Søk SKU, navn, strekkode" className="w-72 rounded-lg border border-slate-300 px-3 py-2 text-base" aria-label="Søk" />
            <button className="rounded-lg bg-white px-4 py-2 ring-1 ring-slate-300">Søk</button>
          </form>
          <Link href="/admin/products/new" className="rounded-lg bg-accent px-4 py-2 font-semibold text-white">
            Ny vare
          </Link>
        </div>
      </div>
      <Card title={`${products?.length ?? 0} varer${q ? ` som passer «${q}»` : ''}`}>
        <table className="w-full text-left text-base" data-testid="products">
          <thead className="text-sm text-muted">
            <tr>
              <th className="py-1">SKU</th>
              <th>Navn</th>
              <th>Hylle</th>
              <th>Variantgruppe</th>
              <th className="text-right">Pris</th>
              <th className="text-right">Bilder</th>
            </tr>
          </thead>
          <tbody>
            {(products ?? []).map((p) => (
              <tr key={p.sku} className="border-t">
                <td className="py-2 font-mono">
                  <Link href={`/admin/products/${encodeURIComponent(p.sku)}`} className="text-accent underline">
                    {p.sku}
                  </Link>
                </td>
                <td>{p.name_nb}</td>
                <td className="font-mono text-sm">{p.location_code}</td>
                <td className="text-sm text-muted">{p.variant_group ?? '—'}</td>
                <td className="text-right tabular-nums">{p.price_nok.toLocaleString('nb-NO')} kr</td>
                <td className="text-right tabular-nums">{(p.reference_photo_paths ?? []).length || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}
