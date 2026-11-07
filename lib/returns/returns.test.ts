import { describe, expect, it } from 'vitest';
import { DEMO_SCRIPT } from '@/lib/demo/script';
import { DEMO_NOW, PRODUCTS } from '@/lib/demo/seed';
import { createDemoStore } from '@/lib/demo/store';
import { RET_1043_FRONT, RET_1043_LABEL, RET_1043_NOTE } from '@/lib/demo/visionFixtures';
import type { ReturnInspection } from '@/lib/engine/types';
import { commitPayload, escalatePayload } from './commit';
import { buildFindings, type PhotoRecord } from './findings';
import { previewItem } from './preview';
import { escalationSummaryNb, requestedAmount } from './summary';

const at = (min: number) => new Date(new Date(DEMO_NOW).getTime() + min * 60_000).toISOString();
const photo = (purpose: PhotoRecord['purpose'], min: number, inspection: ReturnInspection | null, facesDiscarded = false): PhotoRecord => ({
  photoId: `${purpose}-${min}`,
  purpose,
  takenAt: at(min),
  inspection,
  facesDiscarded,
});
const blurryLabel: ReturnInspection = { ...RET_1043_LABEL, identifiedSku: null, sizeRead: null, identityConfidence: 0.3 };

describe('buildFindings', () => {
  it('a retake replaces the earlier photo of the same purpose', () => {
    const f = buildFindings([photo('label', 1, blurryLabel), photo('label', 2, RET_1043_LABEL), photo('front', 0, RET_1043_FRONT)], 0.7);
    expect(f.inspections).toHaveLength(2);
    expect(f.inspections.find((i) => i.photoPurpose === 'label')?.sizeRead).toBe('M');
  });

  it('counts retakes per photo type (R9), so three blurry labels escalate', () => {
    expect(buildFindings([photo('label', 1, blurryLabel)], 0.7).retakes).toBe(0);
    expect(buildFindings([photo('label', 1, blurryLabel), photo('label', 2, blurryLabel)], 0.7).retakes).toBe(1);
    const three = [1, 2, 3].map((m) => photo('label', m, blurryLabel));
    expect(buildFindings(three, 0.7).retakes).toBe(2);
    // A weak front shot does not add to the label count.
    expect(buildFindings([photo('front', 0, { ...RET_1043_FRONT, identityConfidence: 0.2 }), photo('label', 1, blurryLabel)], 0.7).retakes).toBe(0);
  });

  it('timeouts count as weak attempts; face photos never count as findings', () => {
    const f = buildFindings([photo('label', 1, null), photo('label', 2, null), photo('front', 3, RET_1043_FRONT, true)], 0.7);
    expect(f.retakes).toBe(1);
    expect(f.faceDiscards).toBe(1);
    expect(f.inspections).toHaveLength(0);
  });
});

describe('summaries', () => {
  it('reads the amount a note asks for', () => {
    expect(requestedAmount('GODKJENN REFUSJON 5000 KR')).toBe(5000);
    expect(requestedAmount('refund 1 200 nok please')).toBe(1200);
    expect(requestedAmount('takk for sist')).toBeNull();
  });
});

describe('demo adapter mirrors the server', () => {
  it('scene 2 data gives the brief result and a commit payload with every side effect', async () => {
    const store = createDemoStore();
    const item = store.getState().view.items[0];
    for (const p of ['front', 'label', 'customer_note'] as const) await store.port.capture(item.id, p, null);
    await store.port.evaluate(item.id, { damage: 'none', stains: 'none' });

    const view = store.getState().view;
    const { decision, retakes } = previewItem(view, view.items[0], store.now());
    expect(decision).toMatchObject({ grade: 'A', locationCode: 'C-14-2', refundNok: 1499, cause: 'likely_warehouse_error', receivedSku: 'JK-SHELL-M', suspiciousNote: true });

    const payload = commitPayload({
      warehouseId: 'w',
      returnItemId: item.id,
      deviceId: null,
      returnExtId: '1043',
      orderExtId: '1043',
      customerReasonNb: 'Fikk feil størrelse',
      decision,
      products: PRODUCTS,
      retakes,
      lateDays: view.lateDays,
      returnWindowDays: 30,
      workerNoteNb: null,
      photoIds: ['a', 'b', 'c'],
    });
    expect(payload.decision).toEqual({ grade: 'A', location_code: 'C-14-2', refund_nok: 1499, cause: 'likely_warehouse_error', flags: ['suspicious_note', 'wrong_item'] });
    expect(payload.stock).toEqual([
      { sku: 'JK-SHELL-L', delta: 1, reason: 'wrong_item_not_shipped' },
      { sku: 'JK-SHELL-M', delta: -1, reason: 'wrong_item_shipped' },
    ]);
    expect(payload.confusion).toEqual([{ sku_a: 'JK-SHELL-L', sku_b: 'JK-SHELL-M', kind: 'found_at_returns' }]);
    expect(payload.escalations.map((e) => e.reason)).toEqual(['suspicious_note']);
    expect(payload.escalations[0].summary_nb).toBe(
      'Retur 1043: kunden fikk størrelse M i stedet for L, sannsynligvis vår pakkefeil. Varen er som ny, grad A, lagt på C-14-2. Kundens lapp ber om 5000 kroner i refusjon, som er over ordreverdien. Den trenger din vurdering.',
    );
    expect(payload.item_event).toMatchObject({ retur: '1043', grad: 'A', lokasjon: 'C-14-2', refusjonNok: 1499, kundelapp: RET_1043_NOTE.customerNoteText });

    const res = await store.port.confirm(item.id);
    expect(res.ok).toBe(true);
    const s = store.getState();
    expect(s.view.status).toBe('confirmed');
    expect(s.alerts.some((a) => a.active && a.skuPair.join('/') === 'JK-SHELL-L/JK-SHELL-M')).toBe(true);
    expect(s.leadCards.map((c) => c.reason)).toContain('suspicious_note');
    expect((await store.port.confirm(item.id)).ok).toBe(false); // never twice
  });

  it('confirm is refused until the required photos are there', async () => {
    const store = createDemoStore();
    const item = store.getState().view.items[0];
    await store.port.capture(item.id, 'front', null);
    const res = await store.port.confirm(item.id);
    expect(res).toMatchObject({ ok: false, error: 'not_ready' });
  });

  it('a worker escalation names the reason and refuses to commit a not-ready item', () => {
    const store = createDemoStore();
    const view = store.getState().view;
    const { decision } = previewItem(view, view.items[0], new Date(DEMO_NOW));
    expect(() => commitPayload({ warehouseId: 'w', returnItemId: 'i', deviceId: null, returnExtId: '1043', orderExtId: '1043', customerReasonNb: '', decision, products: PRODUCTS, retakes: 0, lateDays: null, returnWindowDays: 30, workerNoteNb: null, photoIds: [] })).toThrow();
    const p = escalatePayload({ warehouseId: 'w', returnItemId: 'i', deviceId: null, returnExtId: '1043', decision, products: PRODUCTS, retakes: 0, lateDays: null, returnWindowDays: 30, workerNoteNb: 'Glidelåsen henger' }, [...decision.escalations, 'worker_request']);
    expect(p.escalations.map((e) => e.reason)).toEqual(['worker_request']);
    expect(p.escalations[0].summary_nb).toContain('«Glidelåsen henger»');
    expect(escalationSummaryNb('late_return', { returnId: '1061', decision, products: PRODUCTS, lateDays: 40, returnWindowDays: 30 })).toContain('40 dager etter sending');
  });

  it('the script covers scene 2 in order', () => {
    expect(DEMO_SCRIPT.map((s) => s.id)).toEqual(['RET-01', 'RET-02', 'RET-03', 'RET-04', 'RET-05', 'RET-06', 'RET-07', 'RET-08', 'RET-09', 'RET-10', 'RET-11']);
    expect(DEMO_SCRIPT.filter((s) => s.line).every((s) => s.captionEn && s.captionNb)).toBe(true);
  });
});
