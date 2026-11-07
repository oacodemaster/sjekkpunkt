import 'server-only';
import { createClient } from '@/lib/supabase/server';

/** Stock shelves and variant groups for the product form's suggestions. */
export async function productFormOptions(): Promise<{ locations: string[]; groups: string[] }> {
  const supabase = await createClient();
  const [{ data: locs }, { data: prods }] = await Promise.all([
    supabase.from('locations').select('code').eq('kind', 'stock').order('code'),
    supabase.from('products').select('variant_group').not('variant_group', 'is', null),
  ]);
  return {
    locations: (locs ?? []).map((l) => l.code as string),
    groups: [...new Set((prods ?? []).map((p) => p.variant_group as string))].sort(),
  };
}
