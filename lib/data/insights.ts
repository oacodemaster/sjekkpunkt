import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

/** SKU-pair mix-ups inside a window, read from the anonymous insights view. */
export async function confusionPairs(supabase: SupabaseClient, days: number) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const { data } = await supabase.from('insights_confusion').select('sku_a, sku_b, kind').gte('at', since);
  const pairs = new Map<string, number>();
  for (const e of data ?? []) {
    const key = `${e.sku_a} / ${e.sku_b}`;
    pairs.set(key, (pairs.get(key) ?? 0) + 1);
  }
  return [...pairs.entries()].sort((a, b) => b[1] - a[1]);
}
