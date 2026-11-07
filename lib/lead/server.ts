import 'server-only';
import { pairLabelNb } from '@/lib/engine/catalog';
import { countInWindow } from '@/lib/engine/loop';
import type { Cause, ConfusionEvent, Grade, Product, ReturnInspection } from '@/lib/engine/types';
import { loadSettings, signedPhotoUrls, toProduct, type Row } from '@/lib/db/common';
import { evaluateItem, loadItemContext, type ItemContext } from '@/lib/returns/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { availableActions, type ItemState } from './plan';
import type { EscalationEntity, FeedEvent, LeadCard, LeadConsoleData, LeadDecisionView, LeadItemView, LeadOrderView, PackAlertView, StockAdjustmentView } from './types';

// Reads for the lead console with the service client. Callers have checked the role (lead or
// admin); every query is scoped to the user's warehouse.

const RESOLVED_SHOWN = 10;

async function latestDecision(itemId: string): Promise<(LeadDecisionView & { receivedSku: string | null }) | null> {
  const db = createAdminClient();
  const [{ data: d }, { data: item }] = await Promise.all([
    db.from('decisions').select('grade, location_code, refund_nok, cause, flags, is_override, override_reason').eq('return_item_id', itemId).order('decided_at', { ascending: false }).limit(1).maybeSingle(),
    db.from('return_items').select('received_sku').eq('id', itemId).maybeSingle(),
  ]);
  if (!d) return null;
  return {
    grade: d.grade as Grade,
    locationCode: d.location_code,
    refundNok: d.refund_nok,
    cause: d.cause as Cause | null,
    flags: d.flags ?? [],
    isOverride: d.is_override,
    overrideReason: d.override_reason,
    receivedSku: item?.received_sku ?? null,
  };
}

/** The item behind a card: stored decision and the server's engine rerun (R16). */
export async function loadItemState(itemId: string, warehouseId: string): Promise<{ ctx: ItemContext; state: ItemState } | null> {
  const ctx = await loadItemContext(itemId, warehouseId);
  if (!ctx) return null;
  const [decided, { decision }] = await Promise.all([latestDecision(itemId), Promise.resolve(evaluateItem(ctx))]);
  return { ctx, state: { decided, proposal: decision } };
}

const nameOf = (products: Product[], sku: string | null) => (sku ? (products.find((p) => p.sku === sku)?.nameNb ?? sku) : null);

async function itemView(ctx: ItemContext, state: ItemState): Promise<LeadItemView> {
  const urls = await signedPhotoUrls(ctx.photos.map((p) => p.storagePath));
  const p = state.proposal;
  const db = createAdminClient();
  const { data: evidence } = await db
    .from('pack_checks')
    .select('status, size_verified, photo_ref, photos:evidence_photo_id(storage_path)')
    .eq('order_id', ctx.orderUuid)
    .in('status', ['VERIFIED', 'MANUAL_CONFIRM'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  const evPhoto = evidence ? (Array.isArray(evidence.photos) ? evidence.photos[0] : evidence.photos) as Row | null : null;
  const evPath = (evPhoto?.storage_path as string | null) ?? null;
  const evUrls = evPath ? await signedPhotoUrls([evPath]) : new Map<string, string>();
  const decided = state.decided;
  const receivedSku = decided?.receivedSku ?? p.receivedSku;
  return {
    id: ctx.item.id,
    returnExt: ctx.ret.id,
    orderExt: ctx.order.id,
    orderedSku: ctx.item.orderedSku,
    orderedName: nameOf(ctx.products, ctx.item.orderedSku)!,
    receivedSku,
    receivedName: nameOf(ctx.products, receivedSku),
    status: ctx.item.status as LeadItemView['status'],
    lineValueNok: p.lineValueNok,
    decision: decided ? { grade: decided.grade, locationCode: decided.locationCode, refundNok: decided.refundNok, cause: decided.cause, flags: decided.flags, isOverride: decided.isOverride, overrideReason: decided.overrideReason } : null,
    proposal: { grade: p.grade, locationCode: p.locationCode, refundNok: p.refundNok, cause: p.cause },
    photos: ctx.photos.map((ph) => {
      const i = ph.inspection as ReturnInspection | null;
      return {
        photoId: ph.photoId,
        purpose: ph.purpose,
        url: ph.storagePath ? (urls.get(ph.storagePath) ?? null) : null,
        model: ph.model ?? null,
        confidence: i && (i.identifiedSku || i.sizeRead) ? i.identityConfidence : null,
        sizeRead: i?.sizeRead ?? null,
        facesDiscarded: ph.facesDiscarded,
      };
    }),
    workerNote: ctx.workerNote.original ? { original: ctx.workerNote.original, lang: ctx.workerNote.lang, nb: ctx.workerNote.nb } : null,
    suspiciousNote: p.suspiciousNote,
    packEvidence: evidence
      ? {
          status: evidence.status,
          sizeVerified: evidence.size_verified,
          photoUrl: evPath ? (evUrls.get(evPath) ?? null) : evidence.photo_ref?.endsWith('.svg') ? `/demo/${evidence.photo_ref}` : null,
        }
      : null,
  };
}

async function orderView(orderId: string): Promise<LeadOrderView | null> {
  const db = createAdminClient();
  const { data: o } = await db.from('orders').select('ext_id').eq('id', orderId).maybeSingle();
  if (!o) return null;
  const { data: c } = await db
    .from('pack_checks')
    .select('status, method, manual_reason, size_verified, photos:evidence_photo_id(storage_path)')
    .eq('order_id', orderId)
    .in('status', ['VERIFIED', 'MANUAL_CONFIRM'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  const photo = c ? ((Array.isArray(c.photos) ? c.photos[0] : c.photos) as Row | null) : null;
  const path = (photo?.storage_path as string | null) ?? null;
  const urls = path ? await signedPhotoUrls([path]) : new Map<string, string>();
  return {
    orderExt: o.ext_id,
    status: c?.status ?? 'picked',
    method: c?.method ?? '',
    manualReason: c?.manual_reason ?? null,
    sizeVerified: c?.size_verified ?? false,
    photoUrl: path ? (urls.get(path) ?? null) : null,
  };
}

type EscRow = {
  id: string;
  entity_type: EscalationEntity;
  entity_id: string | null;
  reason: string;
  summary_nb: string | null;
  summary_audio_path: string | null;
  status: 'open' | 'resolved';
  resolution: LeadCard['resolution'] & { scannedCode?: string };
  created_at: string;
  resolved_at: string | null;
};

/** One card. `full` loads photos, decisions and the engine rerun (open cards). */
export async function loadCard(e: EscRow, warehouseId: string, full: boolean): Promise<LeadCard> {
  const base: LeadCard = {
    id: e.id,
    reason: e.reason,
    entityType: e.entity_type,
    refLabel: e.entity_type === 'parcel' ? `Pakke ${e.resolution?.scannedCode ?? ''}`.trim() : '',
    href: null,
    summaryNb: e.summary_nb ?? '',
    createdAt: e.created_at,
    status: e.status,
    resolution: e.status === 'resolved' ? e.resolution : null,
    resolvedAt: e.resolved_at,
    hasAudio: !!e.summary_audio_path,
    actions: availableActions(e.entity_type),
  };
  const db = createAdminClient();
  if (e.entity_type === 'return_item' && e.entity_id) {
    if (!full) {
      const { data } = await db.from('return_items').select('returns(ext_id)').eq('id', e.entity_id).maybeSingle();
      const r = data ? ((Array.isArray(data.returns) ? data.returns[0] : data.returns) as Row | null) : null;
      const ext = (r?.ext_id as string) ?? '';
      return { ...base, refLabel: `Retur ${ext}`, href: ext ? `/holio/returns/${ext}` : null };
    }
    const loaded = await loadItemState(e.entity_id, warehouseId);
    if (!loaded) return base;
    const item = await itemView(loaded.ctx, loaded.state);
    return {
      ...base,
      refLabel: `Retur ${item.returnExt}`,
      href: `/holio/returns/${item.returnExt}`,
      actions: availableActions('return_item', loaded.state),
      item,
    };
  }
  if (e.entity_type === 'return' && e.entity_id) {
    const { data } = await db.from('returns').select('ext_id').eq('id', e.entity_id).maybeSingle();
    return { ...base, refLabel: `Retur ${data?.ext_id ?? ''}`, href: data ? `/holio/returns/${data.ext_id}` : null };
  }
  if (e.entity_type === 'order' && e.entity_id) {
    const order = full ? await orderView(e.entity_id) : null;
    const ext = order?.orderExt ?? (await db.from('orders').select('ext_id').eq('id', e.entity_id).maybeSingle()).data?.ext_id ?? '';
    return { ...base, refLabel: `Ordre ${ext}`, href: ext ? `/holio/orders/${ext}` : null, order: order ?? undefined };
  }
  return base;
}

const ESC_COLUMNS = 'id, entity_type, entity_id, reason, summary_nb, summary_audio_path, status, resolution, created_at, resolved_at';

export async function loadEscalationRow(id: string, warehouseId: string): Promise<EscRow | null> {
  const { data } = await createAdminClient().from('escalations').select(ESC_COLUMNS).eq('id', id).eq('warehouse_id', warehouseId).maybeSingle();
  return (data as EscRow | null) ?? null;
}

export async function loadOpenCards(warehouseId: string): Promise<LeadCard[]> {
  const { data } = await createAdminClient()
    .from('escalations')
    .select(ESC_COLUMNS)
    .eq('warehouse_id', warehouseId)
    .eq('status', 'open')
    .order('created_at', { ascending: false })
    .limit(50);
  return Promise.all(((data ?? []) as EscRow[]).map((e) => loadCard(e, warehouseId, true)));
}

export async function loadLeadConsole(warehouseId: string): Promise<LeadConsoleData> {
  const db = createAdminClient();
  const settings = await loadSettings(db, warehouseId);
  const since = new Date(Date.now() - settings.confusionWindowDays * 24 * 60 * 60 * 1000).toISOString();
  const [open, { data: resolvedRows }, { data: adj }, { data: alerts }, { data: events }, { data: feed }, { data: locs }, { data: products }] = await Promise.all([
    loadOpenCards(warehouseId),
    db.from('escalations').select(ESC_COLUMNS).eq('warehouse_id', warehouseId).eq('status', 'resolved').order('resolved_at', { ascending: false }).limit(RESOLVED_SHOWN),
    db.from('stock_adjustments').select('id, sku, delta, reason, source_type, source_id, status, created_at, decided_at').eq('warehouse_id', warehouseId).order('created_at', { ascending: false }).limit(30),
    db.from('pack_alerts').select('id, sku_a, sku_b, reason_nb, origin, active, created_at, cleared_at').eq('warehouse_id', warehouseId).order('created_at', { ascending: false }).limit(30),
    db.from('confusion_events').select('sku_a, sku_b, kind, at').eq('warehouse_id', warehouseId).gte('at', since),
    db.from('audit_events').select('id, at, station, type, ref_label, summary_nb, summary_en').eq('warehouse_id', warehouseId).order('at', { ascending: false }).limit(25),
    db.from('locations').select('code, kind').eq('warehouse_id', warehouseId).order('code'),
    db.from('products').select('*').eq('warehouse_id', warehouseId).order('sku'),
  ]);
  const catalog = (products ?? []).map(toProduct);
  const resolved = await Promise.all(((resolvedRows ?? []) as EscRow[]).map((e) => loadCard(e, warehouseId, false)));

  // Source labels for stock adjustments: the return the item belongs to.
  const itemIds = [...new Set((adj ?? []).filter((a) => a.source_type === 'return_item' && a.source_id).map((a) => a.source_id as string))];
  const { data: items } = itemIds.length ? await db.from('return_items').select('id, returns(ext_id)').in('id', itemIds) : { data: [] };
  const retOf = new Map<string, string>(
    (items ?? []).map((i) => {
      const r = (Array.isArray(i.returns) ? i.returns[0] : i.returns) as Row | null;
      return [i.id as string, (r?.ext_id as string) ?? ''];
    }),
  );

  const now = new Date();
  const confusion: ConfusionEvent[] = (events ?? []).map((e) => ({ skuPair: [e.sku_a, e.sku_b], kind: e.kind, at: e.at }));

  return {
    warehouseId,
    open,
    resolved,
    adjustments: (adj ?? []).map(
      (a): StockAdjustmentView => ({
        id: a.id,
        sku: a.sku,
        name: nameOf(catalog, a.sku) ?? a.sku,
        delta: a.delta,
        reason: a.reason,
        sourceLabel: a.source_type === 'return_item' && a.source_id ? `Retur ${retOf.get(a.source_id) ?? ''}` : null,
        status: a.status,
        createdAt: a.created_at,
        decidedAt: a.decided_at,
      }),
    ),
    alerts: (alerts ?? []).map(
      (a): PackAlertView => ({
        id: a.id,
        skuA: a.sku_a,
        skuB: a.sku_b,
        label: pairLabelNb([a.sku_a, a.sku_b], catalog),
        reasonNb: a.reason_nb,
        origin: a.origin,
        active: a.active,
        count: countInWindow(confusion, [a.sku_a, a.sku_b], now, settings.confusionWindowDays),
        createdAt: a.created_at,
        clearedAt: a.cleared_at,
      }),
    ),
    feed: (feed ?? []) as FeedEvent[],
    locations: locs ?? [],
    products: catalog.map((p) => ({ sku: p.sku, name: p.nameNb, variantGroup: p.variantGroup ?? null })),
    windowDays: settings.confusionWindowDays,
  };
}
