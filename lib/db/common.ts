import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { withDefaults, type EngineSettings } from '@/lib/engine/constants';
import type { Order, PackAlert, Product } from '@/lib/engine/types';
import { createAdminClient } from '@/lib/supabase/admin';

// Shared reads for the station routes (service client; callers have checked the role and
// scope every query to the user's warehouse).

const SIGNED_URL_SECONDS = 300;

export interface AppSettings extends EngineSettings {
  photoRetentionDays: number;
  /** Insights: the estimated cost of one wrong parcel (addendum section 7, default 340 kr). */
  wrongParcelCostNok: number;
}

const SETTING_KEYS: Record<string, keyof AppSettings> = {
  pack_confidence_min: 'packConfidenceMin',
  return_confidence_min: 'returnConfidenceMin',
  confusion_threshold: 'confusionThreshold',
  confusion_window_days: 'confusionWindowDays',
  max_retakes: 'maxRetakes',
  return_window_days: 'returnWindowDays',
  photo_retention_days: 'photoRetentionDays',
  wrong_parcel_cost_nok: 'wrongParcelCostNok',
};

export async function loadSettings(db: SupabaseClient, warehouseId: string): Promise<AppSettings> {
  const { data } = await db.from('settings').select('key, value').eq('warehouse_id', warehouseId);
  const s: Partial<AppSettings> = {};
  for (const row of data ?? []) {
    const k = SETTING_KEYS[row.key];
    if (k && typeof row.value === 'number') s[k] = row.value;
  }
  return { photoRetentionDays: 30, wrongParcelCostNok: 340, ...withDefaults(s), ...s } as AppSettings;
}

export type Row = Record<string, unknown>;

export function toProduct(p: Row): Product {
  return {
    sku: p.sku as string,
    nameNb: p.name_nb as string,
    nameEn: p.name_en as string,
    category: p.category as Product['category'],
    color: p.color as string,
    size: (p.size as string | null) ?? undefined,
    priceNok: p.price_nok as number,
    location: p.location_code as string,
    variantGroup: (p.variant_group as string | null) ?? undefined,
    barcode: (p.barcode as string | null) ?? undefined,
  };
}

/** Ordered SKUs plus every product in their variant groups (the closed set for vision). */
export async function loadCandidates(db: SupabaseClient, warehouseId: string, skus: string[]): Promise<(Product & { referencePhotoPaths: string[] })[]> {
  const { data: base } = await db.from('products').select('*').eq('warehouse_id', warehouseId).in('sku', skus);
  const groups = [...new Set((base ?? []).map((p) => p.variant_group).filter(Boolean))] as string[];
  const { data: siblings } = groups.length
    ? await db.from('products').select('*').eq('warehouse_id', warehouseId).in('variant_group', groups)
    : { data: [] };
  const all = new Map<string, Row>();
  for (const p of [...(base ?? []), ...(siblings ?? [])]) all.set(p.sku, p);
  return [...all.values()].map((p) => ({ ...toProduct(p), referencePhotoPaths: (p.reference_photo_paths as string[]) ?? [] }));
}

export async function signedPhotoUrls(paths: (string | null)[]): Promise<Map<string, string>> {
  const real = [...new Set(paths.filter((p): p is string => !!p))];
  const map = new Map<string, string>();
  if (!real.length) return map;
  const { data } = await createAdminClient().storage.from('photos').createSignedUrls(real, SIGNED_URL_SECONDS);
  for (const s of data ?? []) if (s.path && s.signedUrl) map.set(s.path, s.signedUrl);
  return map;
}


export function toOrder(o: Row, lines: Row[]): Order {
  return {
    id: o.ext_id as string,
    customerRef: o.customer_ref as string,
    status: o.status as Order['status'],
    shippedAt: (o.shipped_at as string | null) ?? undefined,
    lines: lines.map((l) => ({ sku: l.sku as string, qty: l.qty as number, priceNok: l.price_nok as number })),
  };
}

/** Active pack alerts that touch any of the SKUs (P4). */
export async function loadActiveAlerts(db: SupabaseClient, warehouseId: string, skus: string[]): Promise<PackAlert[]> {
  if (!skus.length) return [];
  const list = skus.map((s) => `"${s.replace(/"/g, '')}"`).join(',');
  const { data } = await db
    .from('pack_alerts')
    .select('sku_a, sku_b, reason_nb, created_at, origin, active')
    .eq('warehouse_id', warehouseId)
    .eq('active', true)
    .or(`sku_a.in.(${list}),sku_b.in.(${list})`);
  return (data ?? []).map((a) => ({
    skuPair: [a.sku_a, a.sku_b] as [string, string],
    reasonNb: a.reason_nb,
    createdAt: a.created_at,
    rule: 'REQUIRE_LABEL_PHOTO' as const,
    active: a.active,
    origin: a.origin as PackAlert['origin'],
  }));
}

/** Strips the server-only reference photo paths from catalogue rows sent to the browser. */
export function publicProduct(p: Product & { referencePhotoPaths?: string[] }): Product {
  return {
    sku: p.sku,
    nameNb: p.nameNb,
    nameEn: p.nameEn,
    category: p.category,
    color: p.color,
    size: p.size,
    priceNok: p.priceNok,
    location: p.location,
    variantGroup: p.variantGroup,
    barcode: p.barcode,
  };
}
