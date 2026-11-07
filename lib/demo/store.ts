// In-memory store for demo mode: the back office (event log, return record, insights,
// team lead) and the demo adapters of the packing and returns stations. Loaded from the same
// seed as the database; the same engine makes every decision.

import { pairKey, pairLabelNb, productMap, sortedPair } from '@/lib/engine/catalog';
import { DEFAULT_SETTINGS } from '@/lib/engine/constants';
import { recordConfusion } from '@/lib/engine/loop';
import type { ConfusionEvent, PackAlert, PhotoPurpose, ReturnDecision, ReturnInspection, WorkerInput } from '@/lib/engine/types';
import { mismatchLines, sealLines } from '@/lib/pack/commit';
import { evaluateOrder } from '@/lib/pack/inputs';
import type { PackPhoto, PackPort, PackView, ScanResult } from '@/lib/pack/types';
import { lateDays, previewItem } from '@/lib/returns/preview';
import { decidedAuditLines, escalationSummaryNb } from '@/lib/returns/summary';
import type { CaptureResult, CommittedDecision, ConfirmResult, EscalateResult, ReturnsPort, ReturnView, StationPhoto } from '@/lib/returns/types';
import { DEMO_NOW, ORDERS, PACK_CHECKS, PRODUCTS, RETURNS, CONFUSION_EVENTS } from './seed';
import { packMockLabel, packMockVision, PACK_2207_RIGHT, PACK_2207_WRONG, RET_1043_FRONT, RET_1043_LABEL, RET_1043_NOTE } from './visionFixtures';

export interface DemoEvent {
  id: number;
  at: string;
  station: 'pack' | 'return' | 'lead' | 'system';
  type: string;
  refId: string;
  summaryNb: string;
  summaryEn: string;
  actor: string;
}

export interface DemoLeadCard {
  id: string;
  returnId: string;
  reason: string;
  summaryNb: string;
  createdAt: string;
}

export interface DemoState {
  /** the packing station (scene 1) */
  packView: PackView;
  view: ReturnView;
  events: DemoEvent[];
  confusion: ConfusionEvent[];
  alerts: PackAlert[];
  leadCards: DemoLeadCard[];
  /** committed decisions per item id */
  decided: Record<string, { decision: ReturnDecision; committed: CommittedDecision }>;
}

export const DEMO_DEVICE = 'device-07';
const DEMO_RETURN = '1043';
export const DEMO_ORDER = '2207';

const pairKeyOf = (p: [string, string]) => pairKey(sortedPair(p[0], p[1]));

const FIXTURES: Partial<Record<PhotoPurpose, { inspection: ReturnInspection; url: string }>> = {
  front: { inspection: RET_1043_FRONT, url: '/demo/ret-1043-front.svg' },
  label: { inspection: RET_1043_LABEL, url: '/demo/ret-1043-label.svg' },
  customer_note: { inspection: RET_1043_NOTE, url: '/demo/ret-1043-note.svg' },
};

export function demoReturnView(): ReturnView {
  const ret = structuredClone(RETURNS.find((r) => r.id === DEMO_RETURN)!);
  const order = structuredClone(ORDERS.find((o) => o.id === ret.orderId)!);
  const check = structuredClone(PACK_CHECKS.find((p) => p.orderId === order.id)!);
  const pm = productMap(PRODUCTS);
  const groups = new Set(ret.items.map((i) => pm.get(i.orderedSku)?.variantGroup).filter(Boolean));
  return {
    ret,
    returnKey: ret.id,
    status: ret.status,
    order,
    items: ret.items.map((it, index) => ({
      id: `${ret.id}-${index}`,
      index,
      orderedSku: it.orderedSku,
      qty: it.qty,
      status: 'pending',
      photos: [],
      worker: {},
      committed: null,
    })),
    packEvidence: { check, photoUrl: `/demo/${check.photoRef}` },
    products: PRODUCTS.filter((p) => ret.items.some((i) => i.orderedSku === p.sku) || (p.variantGroup && groups.has(p.variantGroup))),
    settings: DEFAULT_SETTINGS,
    lateDays: lateDays(order.shippedAt, ret.registeredAt),
  };
}

/** An order on the packing station, with the active alerts that touch it (P4). */
export function demoPackView(orderId: string = DEMO_ORDER, alerts: PackAlert[] = []): PackView {
  const order = structuredClone(ORDERS.find((o) => o.id === orderId)!);
  const pm = productMap(PRODUCTS);
  const groups = new Set(order.lines.map((l) => pm.get(l.sku)?.variantGroup).filter(Boolean));
  const skus = new Set(order.lines.map((l) => l.sku));
  return {
    order,
    orderKey: order.id,
    products: PRODUCTS.filter((p) => skus.has(p.sku) || (p.variantGroup && groups.has(p.variantGroup))),
    settings: DEFAULT_SETTINGS,
    alerts: alerts.filter((a) => a.active && (skus.has(a.skuPair[0]) || skus.has(a.skuPair[1]))),
    photos: [],
    scans: [],
    committed: null,
  };
}

/** Illustrations that match the scripted pack fixtures (boxes line up with the drawings). */
function packIllustration(orderId: string, vision: PackPhoto['vision']): string | null {
  if (orderId === '2207') return vision === PACK_2207_WRONG ? '/demo/pack-2207-wrong.svg' : vision === PACK_2207_RIGHT ? '/demo/pack-2207-right.svg' : null;
  return null;
}

function initialState(): DemoState {
  return {
    packView: demoPackView(),
    view: demoReturnView(),
    events: [
      { id: 0, at: DEMO_NOW, station: 'system', type: 'DEMO_READY', refId: '', summaryNb: 'Demodata lastet inn', summaryEn: 'Demo data loaded', actor: 'system' },
    ],
    confusion: structuredClone(CONFUSION_EVENTS),
    alerts: [],
    leadCards: [],
    decided: {},
  };
}

/** A tiny external store (useSyncExternalStore) with a fixed demo clock. */
export function createDemoStore() {
  let state = initialState();
  let tick = 0;
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((l) => l());
  const set = (fn: (s: DemoState) => DemoState) => {
    state = fn(state);
    emit();
  };
  /** Demo time moves forward a few seconds per action, starting at DEMO_NOW. */
  const now = () => new Date(new Date(DEMO_NOW).getTime() + tick * 4000);
  const stamp = () => {
    tick++;
    return now().toISOString();
  };
  const log = (e: Omit<DemoEvent, 'id' | 'at' | 'actor'>) =>
    set((s) => ({ ...s, events: [{ ...e, id: s.events.length, at: stamp(), actor: DEMO_DEVICE }, ...s.events] }));

  // ---------- packing station (scene 1) ----------

  let captureDelayMs = 0;
  /** SKU pairs already counted for an order: each pair once per order, as on the server. */
  const countedPairs = new Set<string>();
  const nearMiss = new Set<string>();
  const patchPack = (fn: (v: PackView) => PackView) => set((s) => ({ ...s, packView: fn(s.packView) }));

  /** After every photo or scan: a caught wrong parcel is logged and counted, like record_pack_mismatch. */
  const afterPackChange = (wrongScanSku?: string) => {
    const v = state.packView;
    const { decision } = evaluateOrder(v, now());
    let confusion = state.confusion;
    let alerts = state.alerts;
    const newPairs: ConfusionEvent[] = [];
    const extra: ConfusionEvent[] = [];
    if (wrongScanSku) {
      const wrong = PRODUCTS.find((p) => p.sku === wrongScanSku);
      for (const l of v.order.lines) {
        const lp = PRODUCTS.find((p) => p.sku === l.sku);
        if (wrong?.variantGroup && lp?.variantGroup === wrong.variantGroup) {
          extra.push({ skuPair: [l.sku, wrong.sku].sort() as [string, string], kind: 'caught_at_packing', at: now().toISOString() });
        }
      }
    }
    if (decision.status !== 'MISMATCH' && !wrongScanSku) return;
    for (const e of [...decision.confusionEvents, ...extra]) {
      const key = `${v.order.id}|${pairKeyOf(e.skuPair)}`;
      if (countedPairs.has(key)) continue;
      countedPairs.add(key);
      const r = recordConfusion(confusion, alerts, e, now(), PRODUCTS, DEFAULT_SETTINGS);
      confusion = r.events;
      alerts = r.alerts;
      newPairs.push(e);
    }
    const first = !nearMiss.has(v.order.id);
    nearMiss.add(v.order.id);
    if (newPairs.length || first) {
      set((s) => ({ ...s, confusion, alerts }));
      const text = mismatchLines(v.order.id, decision, PRODUCTS, wrongScanSku);
      log({ station: 'pack', type: 'PACK_MISMATCH', refId: v.order.id, summaryNb: text.nb, summaryEn: text.en });
    }
  };

  const packPort: PackPort = {
    mode: 'demo',
    async capture(orderKey, purpose, _image, sku) {
      if (captureDelayMs) await new Promise((r) => setTimeout(r, captureDelayMs));
      const v = state.packView;
      const nth = v.photos.filter((p) => p.purpose === 'pack_check').length;
      const vision = purpose === 'pack_check' ? packMockVision(v.order.id, nth, v.order.lines, v.products) : null;
      const label = purpose === 'label_closeup' && sku ? packMockLabel(sku, v.products) : null;
      const photo: PackPhoto = {
        photoId: `demo-${purpose}-${tick}`,
        purpose,
        sku: sku ?? null,
        url: purpose === 'pack_check' ? packIllustration(v.order.id, vision) : null,
        takenAt: stamp(),
        vision,
        label,
        facesDiscarded: false,
        model: 'fixture',
      };
      patchPack((pv) => ({ ...pv, photos: [...pv.photos, photo] }));
      afterPackChange();
      const { decision } = evaluateOrder(state.packView, now());
      if (purpose === 'pack_check' && decision.status === 'VERIFIED') {
        const text = sealLines(orderKey, decision, null, true);
        log({ station: 'pack', type: 'PACK_CHECK_VERIFIED', refId: orderKey, summaryNb: text.nb, summaryEn: text.en });
      }
      return { ok: true, photo, decision };
    },
    async scan(_orderKey, code): Promise<ScanResult> {
      const v = state.packView;
      const c = code.trim().toUpperCase();
      const product = PRODUCTS.find((p) => p.barcode === c || p.sku === c);
      if (!product) return { kind: 'unknown_code' };
      const line = v.order.lines.find((l) => l.sku === product.sku);
      if (!line) {
        afterPackChange(product.sku);
        return { kind: 'not_in_order', sku: product.sku };
      }
      if (v.scans.filter((s) => s === product.sku).length >= line.qty) return { kind: 'already_counted', sku: product.sku };
      patchPack((pv) => ({ ...pv, scans: [...pv.scans, product.sku] }));
      return { kind: 'counted', sku: product.sku };
    },
    async manual(_orderKey, reason) {
      return evaluateOrder(state.packView, now(), reason).decision;
    },
    async seal(orderKey, manualReason) {
      // Same as the server: rerun the engine from stored state, ignore anything else.
      const v = state.packView;
      if (v.committed) return { ok: false, error: 'already_sealed' };
      const { decision, inputs } = evaluateOrder(v, now(), manualReason);
      if (!decision.canSeal) return { ok: false, error: 'not_ready', decision };
      const evidence = inputs.overview?.vision ? inputs.overview.photoId : null;
      const committed = {
        status: decision.status as 'VERIFIED' | 'MANUAL_CONFIRM',
        method: decision.method,
        sizeVerified: decision.sizeVerified,
        manualReason: decision.status === 'MANUAL_CONFIRM' ? (manualReason ?? null) : null,
        evidencePhotoId: evidence,
        sealedAt: stamp(),
      };
      patchPack((pv) => ({ ...pv, committed, order: { ...pv.order, status: 'packed' } }));
      const text = sealLines(orderKey, decision, manualReason ?? null, !!evidence);
      log({ station: 'pack', type: decision.status === 'VERIFIED' ? 'PACK_VERIFIED' : 'PACK_MANUAL_CONFIRM', refId: orderKey, summaryNb: text.nb, summaryEn: text.en });
      return { ok: true, decision, committed };
    },
  };

  // ---------- returns station (scene 2) ----------

  const itemOf = (id: string) => state.view.items.find((i) => i.id === id)!;
  const patchItem = (id: string, fn: (i: ReturnView['items'][number]) => ReturnView['items'][number]) =>
    set((s) => ({ ...s, view: { ...s.view, items: s.view.items.map((i) => (i.id === id ? fn(i) : i)) } }));

  const port: ReturnsPort = {
    mode: 'demo',
    async capture(itemId, purpose): Promise<CaptureResult> {
      const fx = FIXTURES[purpose] ?? { inspection: { ...RET_1043_FRONT, photoPurpose: purpose, identifiedSku: null, sizeRead: null, identityConfidence: 0 }, url: '/demo/ret-1043-front.svg' };
      const photo: StationPhoto = {
        photoId: `demo-${purpose}-${tick}`,
        purpose,
        url: fx.url,
        takenAt: stamp(),
        inspection: fx.inspection,
        facesDiscarded: false,
        model: 'fixture',
      };
      patchItem(itemId, (i) => ({ ...i, status: 'inspecting', photos: [...i.photos, photo] }));
      if (purpose === 'customer_note' && fx.inspection.containsInstructions) {
        log({ station: 'return', type: 'NOTE_FLAGGED', refId: DEMO_RETURN, summaryNb: `Retur ${DEMO_RETURN}: kundelapp med instruksjoner, lest som tekst`, summaryEn: `Return ${DEMO_RETURN}: customer note with instructions, read as text` });
      }
      return { ok: true, photo };
    },
    async evaluate(itemId, worker: WorkerInput) {
      patchItem(itemId, (i) => ({ ...i, worker }));
      return previewItem(state.view, itemOf(itemId), now()).decision;
    },
    async confirm(itemId): Promise<ConfirmResult> {
      // Same as the server: rerun the engine from stored state, ignore anything else.
      const item = itemOf(itemId);
      if (item.status === 'decided') return { ok: false, error: 'already_decided' };
      const { decision, retakes } = previewItem(state.view, item, now());
      if (!decision.canConfirm) return { ok: false, error: 'not_ready', decision };
      const at = stamp();
      const committed: CommittedDecision = {
        grade: decision.grade!,
        locationCode: decision.locationCode!,
        refundNok: decision.refundNok,
        cause: decision.cause,
        flags: decision.flags,
        receivedSku: decision.receivedSku,
        decidedAt: at,
      };

      let confusion = state.confusion;
      let alerts = state.alerts;
      const newEvents: Omit<DemoEvent, 'id' | 'at' | 'actor'>[] = [];
      for (const e of decision.confusionEvents) {
        const r = recordConfusion(confusion, alerts, e, now(), PRODUCTS, DEFAULT_SETTINGS);
        confusion = r.events;
        alerts = r.alerts;
        if (r.newAlert) {
          newEvents.push({
            station: 'system',
            type: 'PACK_ALERT_CREATED',
            refId: r.newAlert.skuPair.join('/'),
            summaryNb: `Pakkevarsel: ${r.newAlert.reasonNb}`,
            summaryEn: `Packing alert: ${pairLabelNb(r.newAlert.skuPair, PRODUCTS)} mixed up ${r.count} times in ${DEFAULT_SETTINGS.confusionWindowDays} days`,
          });
        }
      }

      const ctx = { returnId: DEMO_RETURN, decision, products: PRODUCTS, retakes, lateDays: state.view.lateDays ?? undefined, returnWindowDays: DEFAULT_SETTINGS.returnWindowDays };
      const cards: DemoLeadCard[] = decision.escalations
        .filter((reason) => !state.leadCards.some((c) => c.reason === reason))
        .map((reason) => ({ id: `${itemId}-${reason}`, returnId: DEMO_RETURN, reason, summaryNb: escalationSummaryNb(reason, ctx), createdAt: at }));

      const audit = decidedAuditLines(DEMO_RETURN, decision);
      const items = state.view.items.map((i) => (i.id === itemId ? { ...i, status: 'decided' as const, committed } : i));
      const allDone = items.every((i) => i.status === 'decided');
      set((s) => ({
        ...s,
        confusion,
        alerts,
        leadCards: [...cards, ...s.leadCards],
        decided: { ...s.decided, [itemId]: { decision, committed } },
        view: { ...s.view, items, status: allDone ? 'confirmed' : 'inspecting' },
      }));
      log({ station: 'return', type: 'RETURN_ITEM_DECIDED', refId: DEMO_RETURN, summaryNb: audit.nb, summaryEn: audit.en });
      for (const sp of decision.stockProposals) {
        log({ station: 'return', type: 'STOCK_ADJUSTMENT_PROPOSED', refId: sp.sku, summaryNb: `Lagerkorreksjon foreslått: ${sp.sku} ${sp.delta > 0 ? '+' : ''}${sp.delta}`, summaryEn: `Stock correction proposed: ${sp.sku} ${sp.delta > 0 ? '+' : ''}${sp.delta}` });
      }
      if (allDone) log({ station: 'return', type: 'RETURN_CONFIRMED', refId: DEMO_RETURN, summaryNb: `Retur ${DEMO_RETURN} bekreftet`, summaryEn: `Return ${DEMO_RETURN} confirmed` });
      newEvents.forEach(log);
      return { ok: true, decision, committed, returnStatus: allDone ? 'confirmed' : 'inspecting' };
    },
    async escalate(itemId): Promise<EscalateResult> {
      const item = itemOf(itemId);
      const { decision, retakes } = previewItem(state.view, item, now());
      const ctx = { returnId: DEMO_RETURN, decision, products: PRODUCTS, retakes };
      patchItem(itemId, (i) => ({ ...i, status: 'escalated' }));
      set((s) => ({
        ...s,
        view: { ...s.view, status: 'escalated' },
        leadCards: [{ id: `${itemId}-worker`, returnId: DEMO_RETURN, reason: 'worker_request', summaryNb: escalationSummaryNb('worker_request', ctx), createdAt: stamp() }, ...s.leadCards],
      }));
      log({ station: 'return', type: 'RETURN_ITEM_ESCALATED', refId: DEMO_RETURN, summaryNb: `Retur ${DEMO_RETURN} sendt til teamleder`, summaryEn: `Return ${DEMO_RETURN} sent to team lead` });
      return { ok: true, returnStatus: 'escalated' };
    },
  };

  return {
    port,
    packPort,
    /** "Sjekker…" for a moment on stage; 0 when replaying steps. */
    setCaptureDelay(ms: number) {
      captureDelayMs = ms;
    },
    now,
    getState: () => state,
    subscribe(l: () => void) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    log,
    /** Lead card shown at RET-09, before confirm, as in the brief's scripted run. */
    addLeadCard(reason: string, summaryNb: string) {
      if (state.leadCards.some((c) => c.reason === reason)) return;
      set((s) => ({ ...s, leadCards: [{ id: `pre-${reason}`, returnId: DEMO_RETURN, reason, summaryNb, createdAt: now().toISOString() }, ...s.leadCards] }));
    },
    reset() {
      state = initialState();
      tick = 0;
      countedPairs.clear();
      nearMiss.clear();
      emit();
    },
  };
}

export type DemoStore = ReturnType<typeof createDemoStore>;
