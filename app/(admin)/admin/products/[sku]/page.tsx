import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ProductForm, ReferencePhotos } from '@/components/admin/product-form';
import { Card } from '@/components/desk-shell';
import { requireRole } from '@/lib/auth/dal';
import { signedPhotoUrls } from '@/lib/db/common';
import { createClient } from '@/lib/supabase/server';
import { productFormOptions } from '../options';

export default async function ProductPage({ params }: PageProps<'/admin/products/[sku]'>) {
  await requireRole(['admin']);
  const sku = decodeURIComponent((await params).sku);
  const supabase = await createClient();
  const { data: p } = await supabase.from('products').select('*').eq('sku', sku).maybeSingle();
  if (!p) notFound();
  const [{ locations, groups }, { data: photoRows }] = await Promise.all([
    productFormOptions(),
    supabase.from('photos').select('id, storage_path').eq('entity_type', 'product').eq('entity_id', p.id).eq('purpose', 'reference').not('storage_path', 'is', null),
  ]);
  // In the product's order (the first path is the one vision sends).
  const order = (p.reference_photo_paths ?? []) as string[];
  const rows = ((photoRows ?? []) as { id: string; storage_path: string }[]).sort((a, b) => order.indexOf(a.storage_path) - order.indexOf(b.storage_path));
  const urls = await signedPhotoUrls(rows.map((r) => r.storage_path));

  return (
    <>
      <div className="flex items-baseline justify-between">
        <h1 className="type-title m-0">
          {p.name_nb} <span className="type-code text-ink-2">{p.sku}</span>
        </h1>
        <Link href="/admin/products" className="sp-link">
          Alle varer
        </Link>
      </div>
      <Card title="Vare">
        <ProductForm
          mode="edit"
          locations={locations}
          groups={groups}
          initial={{
            sku: p.sku,
            name_nb: p.name_nb,
            name_en: p.name_en,
            category: p.category,
            color: p.color,
            size: p.size ?? '',
            price_nok: p.price_nok,
            location_code: p.location_code,
            variant_group: p.variant_group ?? '',
            barcode: p.barcode ?? '',
          }}
        />
      </Card>
      <Card title="Referansebilder">
        <ReferencePhotos sku={p.sku} photos={rows.map((r) => ({ id: r.id, url: urls.get(r.storage_path) ?? null }))} />
      </Card>
    </>
  );
}
