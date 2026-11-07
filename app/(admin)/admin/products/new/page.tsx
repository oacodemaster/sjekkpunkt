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
        <h1 className="text-3xl font-bold">Ny vare</h1>
        <Link href="/admin/products" className="underline">
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
      <p className="text-base text-muted">Referansebilder kan legges til når varen er opprettet.</p>
    </>
  );
}
