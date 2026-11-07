import 'server-only';
import { loadActiveAlerts, loadCandidates, loadSettings, publicProduct, signedPhotoUrls, toOrder, type AppSettings, type Row } from '@/lib/db/common';
import type { LabelCheck, ManualReason, Order, PackAlert, PackVision, Product } from '@/lib/engine/types';
import { createAdminClient } from '@/lib/supabase/admin';
import { evaluateOrder } from './inputs';
import type { PackCommitted, PackPhoto, PackPurpose, PackView } from './types';

// Loads packing data with the service client and maps it to engine types. Callers have already
// checked the user's role; every query is also scoped to the user's warehouse.

export interface StoredPackPhoto extends PackPhoto {
  storagePath: string | null;
}

export interface PackContext {
  warehouseId: string;
  orderId: string;
  order: Order;
  products: (Product & { referencePhotoPaths: string[] })[];
  settings: AppSettings;
  alerts: PackAlert[];
  photos: StoredPackPhoto[];
  scans: string[];
  committed: PackCommitted | null;
}

/** Overview and label photos of an order with their latest vision result, oldest first. */
async function loadPhotos(orderId: string): Promise<StoredPackPhoto[]> {
  const { data } = await createAdminClient()
    .from('photos')
    .select('id, purpose, storage_path, faces_discarded, created_at, vision_results(model, schema_valid, output, created_at)')
    .eq('entity_type', 'order')
    .eq('entity_id', orderId)
    .in('purpose', ['pack_check', 'label_closeup'])
    .order('created_at', { ascending: true });
  const out: StoredPackPhoto[] = [];
  for (const p of data ?? []) {
    const vr = ((p.vision_results as Row[] | null) ?? []).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0];
    // Photos uploaded but never analysed are not findings yet.
    if (!vr && !p.faces_discarded) continue;
    const output = (vr?.output ?? {}) as { pack?: PackVision; label?: LabelCheck; sku?: string };
    out.push({
      photoId: p.id,
      purpose: p.purpose as PackPurpose,
      sku: output.label?.sku ?? output.sku ?? null,
      url: null,
      takenAt: p.created_at,
      vision: vr?.schema_valid && p.purpose === 'pack_check' ? (output.pack ?? null) : null,
      label: vr?.schema_valid && p.purpose === 'label_closeup' ? (output.label ?? null) : null,
      facesDiscarded: p.faces_discarded,
      model: vr?.model as string | undefined,
      storagePath: p.storage_path,
    });
  }
  return out;
}

async function loadCommitted(orderId: string): Promise<PackCommitted | null> {
  const { data } = await createAdminClient()
    .from('pack_checks')
    .select('status, method, size_verified, manual_reason, evidence_photo_id, created_at')
    .eq('order_id', orderId)
    .in('status', ['VERIFIED', 'MANUAL_CONFIRM'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data
    ? {
        status: data.status,
        method: data.method,
        sizeVerified: data.size_verified,
        manualReason: data.manual_reason,
        evidencePhotoId: data.evidence_photo_id,
        sealedAt: data.created_at,
      }
    : null;
}

/** Everything the engine needs for one order, read fresh from the database (R16). */
export async function loadPackContext(by: { id: string } | { ext: string }, warehouseId: string): Promise<PackContext | null> {
  const db = createAdminClient();
  let q = db.from('orders').select('id, ext_id, customer_ref, status, shipped_at, order_lines(sku, qty, price_nok)').eq('warehouse_id', warehouseId);
  q = 'id' in by ? q.eq('id', by.id) : q.eq('ext_id', by.ext);
  const { data: o } = await q.maybeSingle();
  if (!o) return null;
  const order = toOrder(o, (o.order_lines as Row[]) ?? []);
  const skus = order.lines.map((l) => l.sku);

  const [settings, products, alerts, photos, { data: scans }, committed] = await Promise.all([
    loadSettings(db, warehouseId),
    loadCandidates(db, warehouseId, skus),
    loadActiveAlerts(db, warehouseId, skus),
    loadPhotos(o.id),
    db.from('pack_scans').select('sku, created_at').eq('order_id', o.id).order('created_at'),
    loadCommitted(o.id),
  ]);
  return {
    warehouseId,
    orderId: o.id,
    order,
    products,
    settings,
    alerts,
    photos,
    scans: (scans ?? []).map((s) => s.sku),
    committed,
  };
}

/** The engine run the server trusts: stored photos, scans, alerts and settings. */
export function evaluateStored(ctx: PackContext, now = new Date(), manualReason?: ManualReason) {
  return evaluateOrder(ctx, now, manualReason);
}

/** Signed URLs for display. Discarded photos have none. */
export async function withUrls(photos: StoredPackPhoto[]): Promise<PackPhoto[]> {
  const urls = await signedPhotoUrls(photos.map((p) => p.storagePath));
  return photos.map(({ storagePath, ...p }) => ({ ...p, url: storagePath ? (urls.get(storagePath) ?? null) : null }));
}

/** The packing-station view for one order, by its external number. */
export async function loadPackView(ext: string, warehouseId: string): Promise<PackView | null> {
  const ctx = await loadPackContext({ ext }, warehouseId);
  if (!ctx) return null;
  return {
    order: ctx.order,
    orderKey: ctx.orderId,
    products: ctx.products.map(publicProduct),
    settings: ctx.settings,
    alerts: ctx.alerts,
    photos: await withUrls(ctx.photos),
    scans: ctx.scans,
    committed: ctx.committed,
  };
}

/** One photo for the station, with its signed URL. */
export async function stationPhoto(p: StoredPackPhoto): Promise<PackPhoto> {
  return (await withUrls([p]))[0];
}
