import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { withDefaults, type EngineSettings } from '@/lib/engine/constants';
import { evaluateReturn } from '@/lib/engine/returns';
import type {
  Order,
  PackCheck,
  PhotoPurpose,
  Product,
  ReturnCase,
  ReturnDecision,
  ReturnInspection,
  WorkerInput,
} from '@/lib/engine/types';
import { createAdminClient } from '@/lib/supabase/admin';
import { buildFindings, type PhotoRecord } from './findings';
import { lateDays } from './preview';

export { lateDays };
import type { CommittedDecision, ReturnItemState, ReturnView, StationPhoto } from './types';

// Loads returns data with the service client and maps it to engine types. Callers have
// already checked the user's role; every query is also scoped to the user's warehouse.

const SIGNED_URL_SECONDS = 300;

export interface AppSettings extends EngineSettings {
  photoRetentionDays: number;
}

const SETTING_KEYS: Record<string, keyof AppSettings> = {
  pack_confidence_min: 'packConfidenceMin',
  return_confidence_min: 'returnConfidenceMin',
  confusion_threshold: 'confusionThreshold',
  confusion_window_days: 'confusionWindowDays',
  max_retakes: 'maxRetakes',
  return_window_days: 'returnWindowDays',
  photo_retention_days: 'photoRetentionDays',
};

export async function loadSettings(db: SupabaseClient, warehouseId: string): Promise<AppSettings> {
  const { data } = await db.from('settings').select('key, value').eq('warehouse_id', warehouseId);
  const s: Partial<AppSettings> = {};
  for (const row of data ?? []) {
    const k = SETTING_KEYS[row.key];
    if (k && typeof row.value === 'number') s[k] = row.value;
  }
  return { photoRetentionDays: 30, ...withDefaults(s), ...s } as AppSettings;
}

type Row = Record<string, unknown>;

function toProduct(p: Row): Product {
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

function toOrder(o: Row, lines: Row[]): Order {
  return {
    id: o.ext_id as string,
    customerRef: o.customer_ref as string,
    status: o.status as Order['status'],
    shippedAt: (o.shipped_at as string | null) ?? undefined,
    lines: lines.map((l) => ({ sku: l.sku as string, qty: l.qty as number, priceNok: l.price_nok as number })),
  };
}

/** Latest committed packing evidence for the order (VERIFIED or MANUAL_CONFIRM). */
async function loadPackEvidence(db: SupabaseClient, orderId: string, orderExt: string): Promise<{ check: PackCheck; photoPath: string | null } | null> {
  const { data } = await db
    .from('pack_checks')
    .select('id, status, method, size_verified, confidence, photo_ref, created_at, devices(label), photos:evidence_photo_id(storage_path)')
    .eq('order_id', orderId)
    .in('status', ['VERIFIED', 'MANUAL_CONFIRM'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  const device = Array.isArray(data.devices) ? data.devices[0] : data.devices;
  const photo = Array.isArray(data.photos) ? data.photos[0] : data.photos;
  return {
    check: {
      id: data.id,
      orderId: orderExt,
      status: data.status,
      method: data.method,
      photoRef: data.photo_ref ?? '',
      sizeVerified: data.size_verified,
      confidence: Number(data.confidence),
      deviceId: (device as Row | null)?.label as string ?? '',
      at: data.created_at,
    },
    photoPath: (photo as Row | null)?.storage_path as string | null ?? null,
  };
}

/** Photos of an item with their latest vision result, oldest first. */
async function loadItemPhotos(db: SupabaseClient, itemIds: string[]): Promise<Map<string, (PhotoRecord & { storagePath: string | null; model?: string })[]>> {
  const out = new Map<string, (PhotoRecord & { storagePath: string | null; model?: string })[]>();
  if (!itemIds.length) return out;
  const { data } = await db
    .from('photos')
    .select('id, entity_id, purpose, storage_path, faces_discarded, created_at, vision_results(model, schema_valid, output, created_at)')
    .eq('entity_type', 'return_item')
    .in('entity_id', itemIds)
    .order('created_at', { ascending: true });
  for (const p of data ?? []) {
    const results = ((p.vision_results as Row[] | null) ?? []).sort((a, b) =>
      String(b.created_at).localeCompare(String(a.created_at)),
    );
    const vr = results[0];
    // Photos uploaded but never analysed are not findings yet.
    if (!vr && !p.faces_discarded) continue;
    const inspection = vr?.schema_valid ? ((vr.output as Row)?.inspection as ReturnInspection) ?? null : null;
    const list = out.get(p.entity_id) ?? [];
    list.push({
      photoId: p.id,
      purpose: p.purpose as PhotoPurpose,
      takenAt: p.created_at,
      inspection,
      facesDiscarded: p.faces_discarded,
      storagePath: p.storage_path,
      model: vr?.model as string | undefined,
    });
    out.set(p.entity_id, list);
  }
  return out;
}

export async function signedPhotoUrls(paths: (string | null)[]): Promise<Map<string, string>> {
  const real = [...new Set(paths.filter((p): p is string => !!p))];
  const map = new Map<string, string>();
  if (!real.length) return map;
  const { data } = await createAdminClient().storage.from('photos').createSignedUrls(real, SIGNED_URL_SECONDS);
  for (const s of data ?? []) if (s.path && s.signedUrl) map.set(s.path, s.signedUrl);
  return map;
}

function workerFrom(condition: unknown): WorkerInput {
  const w = (condition as { worker?: WorkerInput } | null)?.worker;
  return w && typeof w === 'object' ? w : {};
}

export interface ItemContext {
  warehouseId: string;
  item: { id: string; index: number; orderedSku: string; qty: number; status: string; returnId: string };
  ret: ReturnCase;
  returnUuid: string;
  order: Order;
  orderUuid: string;
  packEvidence: PackCheck | null;
  products: (Product & { referencePhotoPaths: string[] })[];
  settings: AppSettings;
  photos: (PhotoRecord & { storagePath: string | null; model?: string })[];
  worker: WorkerInput;
  workerNote: { original: string | null; lang: string | null; nb: string | null };
  lateDays: number | null;
}

/** Everything the engine needs for one item, read fresh from the database (R16). */
export async function loadItemContext(itemId: string, warehouseId: string): Promise<ItemContext | null> {
  const db = createAdminClient();
  const { data: item } = await db
    .from('return_items')
    .select('id, item_index, ordered_sku, qty, status, return_id')
    .eq('id', itemId)
    .eq('warehouse_id', warehouseId)
    .maybeSingle();
  if (!item) return null;

  const { data: r } = await db
    .from('returns')
    .select('id, ext_id, customer_reason_nb, registered_at, status, order_id, return_items(item_index, ordered_sku, qty)')
    .eq('id', item.return_id)
    .single();
  const { data: o } = await db
    .from('orders')
    .select('id, ext_id, customer_ref, status, shipped_at, order_lines(sku, qty, price_nok)')
    .eq('id', r!.order_id)
    .single();

  const items = ((r!.return_items as Row[]) ?? []).sort((a, b) => (a.item_index as number) - (b.item_index as number));
  const ret: ReturnCase = {
    id: r!.ext_id,
    orderId: o!.ext_id,
    customerReasonNb: r!.customer_reason_nb ?? '',
    items: items.map((i) => ({ orderedSku: i.ordered_sku as string, qty: i.qty as number })),
    status: r!.status,
    registeredAt: r!.registered_at ?? undefined,
  };
  const order = toOrder(o!, (o!.order_lines as Row[]) ?? []);

  const [settings, products, evidence, photos, { data: insp }] = await Promise.all([
    loadSettings(db, warehouseId),
    loadCandidates(db, warehouseId, ret.items.map((i) => i.orderedSku)),
    loadPackEvidence(db, o!.id, o!.ext_id),
    loadItemPhotos(db, [item.id]),
    db.from('inspections').select('condition, worker_note_original, worker_note_lang, worker_note_nb').eq('return_item_id', item.id).maybeSingle(),
  ]);

  return {
    warehouseId,
    item: { id: item.id, index: item.item_index, orderedSku: item.ordered_sku, qty: item.qty, status: item.status, returnId: item.return_id },
    ret,
    returnUuid: r!.id,
    order,
    orderUuid: o!.id,
    packEvidence: evidence?.check ?? null,
    products,
    settings,
    photos: photos.get(item.id) ?? [],
    worker: workerFrom(insp?.condition),
    workerNote: { original: insp?.worker_note_original ?? null, lang: insp?.worker_note_lang ?? null, nb: insp?.worker_note_nb ?? null },
    lateDays: lateDays(order.shippedAt, ret.registeredAt),
  };
}


/** The engine run the server trusts: stored photos, stored worker input, stored settings. */
export function evaluateItem(ctx: ItemContext, now = new Date()): { decision: ReturnDecision; retakes: number } {
  const findings = buildFindings(ctx.photos, ctx.settings.returnConfidenceMin);
  const worker: WorkerInput = { ...ctx.worker, noteNb: ctx.workerNote.nb ?? undefined };
  const decision = evaluateReturn(ctx.ret, ctx.order, ctx.packEvidence, findings, worker, {
    products: ctx.products,
    now,
    itemIndex: ctx.item.index,
    settings: ctx.settings,
  });
  return { decision, retakes: findings.retakes ?? 0 };
}

/** The full returns-station view for one return, by its external number. */
export async function loadReturnView(extId: string, warehouseId: string): Promise<ReturnView | null> {
  const db = createAdminClient();
  const { data: r } = await db
    .from('returns')
    .select('id, ext_id, customer_reason_nb, registered_at, status, order_id, return_items(id, item_index, ordered_sku, qty, status, received_sku)')
    .eq('warehouse_id', warehouseId)
    .eq('ext_id', extId)
    .maybeSingle();
  if (!r) return null;
  const { data: o } = await db
    .from('orders')
    .select('id, ext_id, customer_ref, status, shipped_at, order_lines(sku, qty, price_nok)')
    .eq('id', r.order_id)
    .single();

  const rows = ((r.return_items as Row[]) ?? []).sort((a, b) => (a.item_index as number) - (b.item_index as number));
  const itemIds = rows.map((i) => i.id as string);
  const ret: ReturnCase = {
    id: r.ext_id,
    orderId: o!.ext_id,
    customerReasonNb: r.customer_reason_nb ?? '',
    items: rows.map((i) => ({ orderedSku: i.ordered_sku as string, qty: i.qty as number })),
    status: r.status,
    registeredAt: r.registered_at ?? undefined,
  };
  const order = toOrder(o!, (o!.order_lines as Row[]) ?? []);

  const [settings, products, evidence, photos, { data: inspections }, { data: decisions }] = await Promise.all([
    loadSettings(db, warehouseId),
    loadCandidates(db, warehouseId, ret.items.map((i) => i.orderedSku)),
    loadPackEvidence(db, o!.id, o!.ext_id),
    loadItemPhotos(db, itemIds),
    db.from('inspections').select('return_item_id, condition').in('return_item_id', itemIds),
    db.from('decisions').select('return_item_id, grade, location_code, refund_nok, cause, flags, decided_at').in('return_item_id', itemIds).order('decided_at', { ascending: false }),
  ]);

  const allPhotos = [...photos.values()].flat();
  const urls = await signedPhotoUrls([...allPhotos.map((p) => p.storagePath), evidence?.photoPath ?? null]);

  const items: ReturnItemState[] = rows.map((row) => {
    const id = row.id as string;
    const d = (decisions ?? []).find((x) => x.return_item_id === id);
    const committed: CommittedDecision | null = d
      ? { grade: d.grade, locationCode: d.location_code, refundNok: d.refund_nok, cause: d.cause, flags: d.flags ?? [], receivedSku: (row.received_sku as string | null) ?? null, decidedAt: d.decided_at }
      : null;
    return {
      id,
      index: row.item_index as number,
      orderedSku: row.ordered_sku as string,
      qty: row.qty as number,
      status: row.status as ReturnItemState['status'],
      photos: (photos.get(id) ?? []).map(
        (p): StationPhoto => ({
          photoId: p.photoId,
          purpose: p.purpose,
          url: p.storagePath ? (urls.get(p.storagePath) ?? null) : null,
          takenAt: p.takenAt,
          inspection: p.inspection,
          facesDiscarded: p.facesDiscarded,
          model: p.model,
        }),
      ),
      worker: workerFrom((inspections ?? []).find((x) => x.return_item_id === id)?.condition),
      committed,
    };
  });

  const evidencePhoto = evidence
    ? evidence.photoPath
      ? (urls.get(evidence.photoPath) ?? null)
      : evidence.check.photoRef.endsWith('.svg')
        ? `/demo/${evidence.check.photoRef}`
        : null
    : null;

  return {
    ret,
    returnKey: r.id,
    status: r.status,
    order,
    items,
    packEvidence: evidence ? { check: evidence.check, photoUrl: evidencePhoto } : null,
    products: products.map((p): Product => ({
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
    })),
    settings,
    lateDays: lateDays(order.shippedAt, ret.registeredAt),
  };
}
