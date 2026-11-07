import { describe, expect, it } from 'vitest';
import { LABEL_2311, PACK_2207_RIGHT, PACK_2207_WRONG, PACK_2311_OVERVIEW, packMockVision } from '@/lib/demo/visionFixtures';
import { DEMO_NOW, ORDERS, PRODUCTS } from '@/lib/demo/seed';
import { createDemoStore, demoPackView } from '@/lib/demo/store';
import type { PackAlert, PackVision } from '@/lib/engine/types';
import { manualOnAlertSummaryNb, mismatchPayload, sealPayload } from './commit';
import { evaluateOrder, linesNeedingLabel, packInputs, unitCount } from './inputs';
import type { PackPhoto, PackView } from './types';

const now = new Date(DEMO_NOW);
let clock = 0;
const at = () => new Date(now.getTime() + ++clock * 1000).toISOString();

const overview = (vision: PackVision | null, extra: Partial<PackPhoto> = {}): PackPhoto => ({
  photoId: `p${clock}`,
  purpose: 'pack_check',
  sku: null,
  url: null,
  takenAt: at(),
  vision,
  label: null,
  facesDiscarded: false,
  ...extra,
});
const label = (l: typeof LABEL_2311 | null, sku = 'JK-SHELL-L'): PackPhoto => ({ ...overview(null), purpose: 'label_closeup', sku, label: l });

const view = (orderId: string, photos: PackPhoto[] = [], extra: Partial<PackView> = {}): PackView => ({ ...demoPackView(orderId), photos, ...extra });

const shellAlert: PackAlert = {
  skuPair: ['JK-SHELL-L', 'JK-SHELL-M'],
  reasonNb: 'Skalljakke M/L forvekslet 3 ganger siste 7 dager',
  createdAt: now.toISOString(),
  rule: 'REQUIRE_LABEL_PHOTO',
  active: true,
  origin: 'auto',
};

describe('pack inputs: which photos count', () => {
  it('the latest overview decides: a wrong box, then the right one, verifies', () => {
    const { decision, inputs } = evaluateOrder(view('2207', [overview(PACK_2207_WRONG), overview(PACK_2207_RIGHT)]), now);
    expect(decision.status).toBe('VERIFIED');
    expect(inputs.retakes).toBe(1);
    expect(unitCount(decision)).toEqual({ seen: 2, ordered: 2 });
  });

  it('a failed retake after a good photo is a timeout, never a verify (P9)', () => {
    const { decision, inputs } = evaluateOrder(view('2207', [overview(PACK_2207_RIGHT), overview(null)]), now);
    expect(inputs.visionTimedOut).toBe(true);
    expect(decision.status).toBe('RETAKE');
    expect(decision.canSeal).toBe(false);
  });

  it('photos with a face never count, not even as retakes', () => {
    const face = overview({ ...PACK_2207_RIGHT, facePresent: true });
    const discarded = overview(null, { facesDiscarded: true });
    const i = packInputs([overview(PACK_2207_WRONG), face, discarded]);
    expect(i.vision).toBe(PACK_2207_WRONG);
    expect(i.retakes).toBe(0);
    expect(i.faceDiscards).toBe(2);
  });

  it('three photos are two retakes and open manual confirm (P8), labels included', () => {
    const v = view('2311', [overview(PACK_2311_OVERVIEW), label(null), overview(PACK_2311_OVERVIEW)]);
    const { decision, inputs } = evaluateOrder(v, now);
    expect(inputs.retakes).toBe(2);
    expect(decision.status).toBe('NEEDS_LABEL_PHOTO');
    expect(decision.canManualConfirm).toBe(true);
    expect(evaluateOrder(v, now, 'glare').decision.status).toBe('MANUAL_CONFIRM');
  });

  it('a label close-up with the right size verifies a size-variant line', () => {
    const before = view('2311', [overview(PACK_2311_OVERVIEW)]);
    expect(linesNeedingLabel(before, evaluateOrder(before, now).decision)).toEqual(['JK-SHELL-L']);
    const after = view('2311', [overview(PACK_2311_OVERVIEW), label(LABEL_2311)]);
    const { decision } = evaluateOrder(after, now);
    expect(decision.status).toBe('VERIFIED');
    expect(decision.sizeVerified).toBe(true);
  });

  it('an active alert needs a label until it shows the size, or a barcode scan (P4, P7)', () => {
    const v = view('2311', [overview({ ...PACK_2311_OVERVIEW, items: [{ ...PACK_2311_OVERVIEW.items[0], sizeRead: 'L' }] })], { alerts: [shellAlert] });
    const d = evaluateOrder(v, now).decision;
    expect(d.status).toBe('NEEDS_LABEL_PHOTO');
    expect(d.messageKey).toBe('packAlertNeedsLabel');
    expect(linesNeedingLabel(v, d)).toEqual(['JK-SHELL-L']);
    const scanned = { ...v, scans: ['JK-SHELL-L'] };
    expect(evaluateOrder(scanned, now).decision.status).toBe('VERIFIED');
  });

  it('barcodes alone can verify every line without a photo (P7)', () => {
    const d = evaluateOrder(view('2207', [], { scans: ['HD-NAVY-M', 'SK-WOOL-40'] }), now).decision;
    expect(d.status).toBe('VERIFIED');
    expect(d.method).toBe('barcode');
  });

  it('a qty 2 order with one item in the box is blocked (acceptance checklist)', () => {
    const order = ORDERS.find((o) => o.lines.some((l) => l.qty === 2))!;
    const one = packMockVision('x', 0, order.lines.map((l) => ({ ...l, qty: 1 })), PRODUCTS);
    const d = evaluateOrder({ ...view(order.id), photos: [overview(one)] }, now).decision;
    expect(d.status).toBe('MISMATCH');
    expect(d.canSeal).toBe(false);
    expect(d.lines.find((l) => l.ordered === 2)).toMatchObject({ state: 'missing', diff: 1 });
  });
});

describe('pack commit payloads', () => {
  const wrong = evaluateOrder(view('2207', [overview(PACK_2207_WRONG)]), now).decision;
  const right = evaluateOrder(view('2207', [overview(PACK_2207_WRONG), overview(PACK_2207_RIGHT)]), now).decision;
  const base = { warehouseId: 'w', orderId: 'o', orderExt: '2207', customerRef: 'Testkunde 2207', deviceId: 'd', userId: 'u', products: PRODUCTS, evidencePhotoId: 'ph', photoIds: ['ph'] };

  it('a mismatch names what is wrong and counts each SKU pair once', () => {
    const p = mismatchPayload({ ...base, decision: wrong, method: 'camera', photoId: 'ph', extraPairs: [['HD-NAVY-M', 'HD-BLACK-M']] });
    expect(p.confusion).toEqual([{ sku_a: 'HD-BLACK-M', sku_b: 'HD-NAVY-M' }]);
    expect(p.audit.summary_nb).toContain('Hettegenser, sort, M er ikke i ordren');
    expect(p.audit.summary_nb).toContain('mangler 1 × Hettegenser, marineblå, M');
    expect(JSON.stringify(p.line_results)).not.toContain('hooded'); // no model free text stored as results
  });

  it('a verified seal records the device, never the person', () => {
    const p = sealPayload({ ...base, decision: right, manualReason: null });
    expect(p).toMatchObject({ status: 'VERIFIED', method: 'camera', user_id: null, manual_reason: null, evidence_photo_id: 'ph' });
    expect(p.event).toMatchObject({ ordre: '2207', status: 'VERIFIED', storrelseLest: true, pakkebevis: 'ph' });
    expect(p.audit.summary_nb).toBe('Ordre 2207 verifisert med kamera, 2 av 2 varer, bevisfoto lagret');
  });

  it('a manual confirm records who confirmed and why, and tells the lead when an alert is active', () => {
    const v = view('2311', [overview(PACK_2311_OVERVIEW), overview(PACK_2311_OVERVIEW), overview(PACK_2311_OVERVIEW)], { alerts: [shellAlert] });
    const d = evaluateOrder(v, now, 'polybag').decision;
    const p = sealPayload({ ...base, orderExt: '2311', decision: d, manualReason: 'polybag' });
    expect(p).toMatchObject({ status: 'MANUAL_CONFIRM', method: 'manual', user_id: 'u', manual_reason: 'polybag' });
    expect(p.escalations).toEqual([{ reason: 'manual_confirm_on_alert', summary_nb: manualOnAlertSummaryNb('2311', d, PRODUCTS, 'polybag') }]);
    expect(p.escalations[0].summary_nb).toContain('Skalljakke, grønn, L har aktivt pakkevarsel');
  });

  it('refuses to build a seal for a box that cannot be sealed', () => {
    expect(() => sealPayload({ ...base, decision: wrong, manualReason: null })).toThrow();
  });
});

describe('demo adapter: scene 1', () => {
  it('a wrong box logs a caught mix-up once per pair; the right box verifies and seals', async () => {
    const store = createDemoStore();
    const before = store.getState().confusion.length;
    const first = await store.packPort.capture('2207', 'pack_check', null);
    expect(first.decision?.status).toBe('MISMATCH');
    expect(store.getState().confusion.length).toBe(before + 1);
    expect(store.getState().events[0].type).toBe('PACK_MISMATCH');
    // Scanning the black hoodie's barcode is the same pair for the same order: not counted again.
    const black = PRODUCTS.find((p) => p.sku === 'HD-BLACK-M')!;
    expect(await store.packPort.scan('2207', black.barcode!)).toEqual({ kind: 'not_in_order', sku: 'HD-BLACK-M' });
    expect(store.getState().confusion.length).toBe(before + 1);

    const second = await store.packPort.capture('2207', 'pack_check', null);
    expect(second.decision?.status).toBe('VERIFIED');
    const sealed = await store.packPort.seal('2207');
    expect(sealed.ok).toBe(true);
    expect(store.getState().packView.committed).toMatchObject({ status: 'VERIFIED', method: 'camera' });
    expect(await store.packPort.seal('2207')).toEqual({ ok: false, error: 'already_sealed' });
  });
});
