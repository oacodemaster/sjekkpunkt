import { describe, expect, it } from 'vitest';
import { evaluateOrder } from '@/lib/pack/inputs';
import type { PackPhoto, PackView } from '@/lib/pack/types';
import { parcelById, PLAY_IMAGE, PLAY_PARCELS, PLAY_PRODUCTS } from './catalog';
import { boxSignature, boxVision, labelRead, type BoxUnit } from './camera';
import { createPlayPort } from './port';

const viewOf = (id: string): PackView => {
  const p = parcelById(id)!;
  return { order: p.order, orderKey: id, products: PLAY_PRODUCTS, settings: {}, alerts: p.alerts, photos: [], scans: [], committed: null };
};
const units = (...skus: string[]): BoxUnit[] => skus.map((sku, i) => ({ uid: String(i), sku }));

/** Runs the port like the screen does: one overview, then label close-ups for the given lines. */
async function pack(id: string, box: BoxUnit[], labels: string[] = []) {
  let view = viewOf(id);
  const port = createPlayPort({ initialView: view, delayMs: 0 });
  port.sync(box, view);
  const shots: (['pack_check'] | ['label_closeup', string])[] = [['pack_check'], ...labels.map((s) => ['label_closeup', s] as ['label_closeup', string])];
  for (const [purpose, sku] of shots) {
    const res = await port.capture(id, purpose, null, sku);
    if (!res.ok) throw new Error(res.reason);
    view = { ...view, photos: [...view.photos, res.photo as PackPhoto] };
    port.sync(box, view);
    await new Promise((r) => setTimeout(r, 2)); // distinct takenAt
  }
  return { view, port, decision: evaluateOrder(view, new Date()).decision };
}

describe('practice catalogue', () => {
  it('has a photo for every shelf item and every order line', () => {
    for (const p of PLAY_PARCELS) {
      for (const sku of [...p.shelf, ...p.order.lines.map((l) => l.sku)]) {
        expect(PLAY_IMAGE[sku], sku).toBeTruthy();
        expect(PLAY_PRODUCTS.some((x) => x.sku === sku), sku).toBe(true);
      }
      for (const l of p.order.lines) expect(p.shelf, p.order.id).toContain(l.sku);
    }
  });
});

describe('practice camera + engine', () => {
  it('verifies an easy parcel packed right', async () => {
    const { decision } = await pack('4101', units('CP-BEANIE', 'SC-RED'));
    expect(decision.status).toBe('VERIFIED');
    expect(decision.canSeal).toBe(true);
  });

  it('stops a black hoodie in a navy order and logs the mix-up', async () => {
    const { decision } = await pack('4102', units('HD-BLACK-M', 'SK-WOOL-40'));
    expect(decision.status).toBe('MISMATCH');
    expect(decision.unexpected.map((u) => u.sku)).toEqual(['HD-BLACK-M']);
    expect(decision.confusionEvents.map((e) => e.skuPair)).toEqual([['HD-BLACK-M', 'HD-NAVY-M']]);
  });

  it('reads the sock size off the band', async () => {
    const { decision } = await pack('4102', units('HD-NAVY-M', 'SK-WOOL-36'));
    expect(decision.status).toBe('MISMATCH');
    expect(decision.lines.find((l) => l.sku === 'SK-WOOL-40')?.labelSizeMismatch).toBe('36-39');
  });

  it('cannot see a T-shirt size from above, the label close-up can', async () => {
    const box = units('TS-WHITE-M', 'TS-WHITE-L', 'CA-BLACK');
    expect((await pack('4103', box)).decision.status).toBe('NEEDS_LABEL_PHOTO');
    expect(labelRead(box, 'TS-WHITE-M', parcelById('4103')!.order, PLAY_PRODUCTS).sizeRead).toBe('L');
    const { decision } = await pack('4103', box, ['TS-WHITE-M']);
    expect(decision.status).toBe('MISMATCH');
    expect(decision.confusionEvents.map((e) => e.skuPair)).toEqual([['TS-WHITE-L', 'TS-WHITE-M']]);
  });

  it('verifies the right sizes after the label close-up', async () => {
    const { decision } = await pack('4103', units('TS-WHITE-M', 'TS-WHITE-M', 'CA-BLACK'), ['TS-WHITE-M']);
    expect(decision.status).toBe('VERIFIED');
  });

  it('needs the label for an item with an active pack alert, even when it is right', async () => {
    expect((await pack('4104', units('JK-SHELL-L'))).decision.messageKey).toBe('packAlertNeedsLabel');
    expect((await pack('4104', units('JK-SHELL-L'), ['JK-SHELL-L'])).decision.status).toBe('VERIFIED');
  });

  it('counts missing and extra units', async () => {
    const missing = await pack('4105', units('JN-BLUE-32', 'MT-GREY'));
    expect(missing.decision.lines.find((l) => l.sku === 'RJ-YELLOW-M')?.state).toBe('missing');
    const extra = await pack('4101', units('CP-BEANIE', 'SC-RED', 'SC-RED'));
    expect(extra.decision.status).toBe('MISMATCH');
  });

  it('will not seal a wrong box, and seals a right one', async () => {
    const wrong = await pack('4102', units('HD-BLACK-M', 'SK-WOOL-40'));
    expect(await wrong.port.seal('4102')).toMatchObject({ ok: false, error: 'not_ready' });
    const right = await pack('4101', units('CP-BEANIE', 'SC-RED'));
    expect(await right.port.seal('4101')).toMatchObject({ ok: true, committed: { status: 'VERIFIED' } });
  });

  it('puts every unit in its own cell and fingerprints the box order-free', () => {
    const v = boxVision(units('CP-BEANIE', 'SC-RED', 'MT-GREY'), parcelById('4101')!.order, PLAY_PRODUCTS);
    expect(new Set(v.items.map((i) => i.box_2d.join())).size).toBe(3);
    expect(boxSignature(units('A', 'B'))).toBe(boxSignature(units('B', 'A')));
  });
});
