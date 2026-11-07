import 'server-only';
import { readSettings } from '@/lib/admin/settings';
import type { Lang } from '@/lib/engine/types';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * The settings the worker information needs (enabled languages, photo retention). Read with the
 * service client because /privacy is also public; only these two values leave this function.
 * Without a warehouse (signed out) the MVP's single warehouse is used.
 */
export async function privacySettings(warehouseId?: string): Promise<{ languages: Lang[]; retentionDays: number }> {
  let q = createAdminClient().from('settings').select('key, value, warehouse_id').in('key', ['enabled_languages', 'photo_retention_days']);
  if (warehouseId) q = q.eq('warehouse_id', warehouseId);
  const { data } = await q.order('warehouse_id').limit(2);
  const s = readSettings((data ?? []) as { key: string; value: unknown }[]);
  return { languages: s.enabled_languages, retentionDays: s.photo_retention_days };
}

export async function enabledLanguages(warehouseId: string): Promise<Lang[]> {
  return (await privacySettings(warehouseId)).languages;
}
