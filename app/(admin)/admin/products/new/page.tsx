import Link from 'next/link';
import { ProductForm } from '@/components/admin/product-form';
import { Card } from '@/components/desk-shell';
import { requireRole } from '@/lib/auth/dal';
import { productFormOptions } from '../options';

export default async function NewProductPage() {
  await requireRole(['admin']);
  const { locations, groups } = await productFormOptions();
  return (
    <>
      <div className="flex items-baseline justify-between">
        <h1 className="type-title m-0">Ny vare</h1>
        <Link href="/admin/products" className="sp-link">
          Alle varer
        </Link>
      </div>
      <Card title="Vare">
        <ProductForm
          mode="create"
          locations={locations}
          groups={groups}
          initial={{ sku: '', name_nb: '', name_en: '', category: 'apparel', color: '', size: '', price_nok: 0, location_code: '', variant_group: '', barcode: '' }}
        />
      </Card>
      <p className="text-[15px] text-ink-2">Referansebilder kan legges til når varen er opprettet.</p>
    </>
  );
}
