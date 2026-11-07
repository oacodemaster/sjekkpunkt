import { describe, expect, it } from 'vitest';
import { CONFUSION_EVENTS, DEMO_NOW, NEAR_MISSES, PACK_CHECKS, PAST_DECISIONS, PRODUCTS, RETURNS } from '@/lib/demo/seed';
import { computeInsights, insightsReportSchema, type InsightsRows } from './compute';

const now = new Date(DEMO_NOW);
const product = (sku: string) => PRODUCTS.find((p) => p.sku === sku)!;

/** The seed as the insights views would return it (no user or device columns). */
function seedRows(over: Partial<InsightsRows> = {}): InsightsRows {
  return {
    confusion: CONFUSION_EVENTS.map((e) => ({ sku_a: e.skuPair[0], sku_b: e.skuPair[1], kind: e.kind, at: e.at })),
    alerts: [],
    packChecks: [...PACK_CHECKS, ...NEAR_MISSES].map((c) => ({ order_id: c.orderId, status: c.status, method: c.method ?? 'camera', created_at: c.at })),
    returns: RETURNS.flatMap((r) =>
      r.items.map((it) => ({ ordered_sku: it.orderedSku, category: product(it.orderedSku).category, customer_reason_nb: r.customerReasonNb, registered_at: r.registeredAt! })),
    ),
    decisions: PAST_DECISIONS.map((d) => ({ grade: d.grade, cause: d.cause, item_value_nok: product(d.receivedSku).priceNok, decided_at: d.decidedAt })),
    products: PRODUCTS,
    ...over,
  };
}

describe('insights', () => {
  it('counts SKU-pair mix-ups in both windows, with alert status first', () => {
    const r7 = computeInsights(seedRows(), { range: '7d', now });
    const shell = r7.mixups.find((m) => m.skuA === 'JK-SHELL-L' && m.skuB === 'JK-SHELL-M')!;
    expect(shell).toMatchObject({ label: 'Skalljakke M/L', last7: 2, foundAtReturns: 2, caughtAtPacking: 0, alert: null });
    const hoodie = r7.mixups.find((m) => m.skuA === 'HD-BLACK-M')!;
    expect(hoodie).toMatchObject({ last7: 1, caughtAtPacking: 1 });

    const withAlert = computeInsights(seedRows({ alerts: [{ sku_a: 'HD-BLACK-M', sku_b: 'HD-NAVY-M', origin: 'manual', active: true }] }), { range: '7d', now });
    expect(withAlert.mixups[0]).toMatchObject({ skuA: 'HD-BLACK-M', alert: 'manual' });
  });

  it('uses the engine window: now − days < t ≤ now', () => {
    const at = (ms: number) => new Date(now.getTime() - ms).toISOString();
    const day = 24 * 60 * 60 * 1000;
    const rows = seedRows({
      confusion: [
        { sku_a: 'HD-BLACK-M', sku_b: 'HD-NAVY-M', kind: 'caught_at_packing', at: at(7 * day) }, // edge: out of 7d
        { sku_a: 'HD-BLACK-M', sku_b: 'HD-NAVY-M', kind: 'caught_at_packing', at: at(7 * day - 1000) },
        { sku_a: 'HD-BLACK-M', sku_b: 'HD-NAVY-M', kind: 'caught_at_packing', at: at(-1000) }, // future: ignored
      ],
    });
    const [pair] = computeInsights(rows, { range: '7d', now }).mixups;
    expect(pair).toMatchObject({ last7: 1, last30: 2 });
  });

  it('counts each stopped parcel once and estimates the saving from the setting', () => {
    const r7 = computeInsights(seedRows(), { range: '7d', now });
    expect(r7.nearMisses).toMatchObject({ caught: 1, costPerParcelNok: 340, estimatedSavedNok: 340 });
    const r30 = computeInsights(seedRows(), { range: '30d', now, wrongParcelCostNok: 500 });
    expect(r30.nearMisses).toMatchObject({ caught: 4, estimatedSavedNok: 2000 });

    // A second MISMATCH row for the same order is still one parcel.
    const dup = seedRows();
    dup.packChecks.push({ ...dup.packChecks.find((c) => c.status === 'MISMATCH')! });
    expect(computeInsights(dup, { range: '30d', now }).nearMisses.caught).toBe(4);
  });

  it('splits value recovered by grade (A and B resold, C repaired, D scrapped)', () => {
    const r = computeInsights(seedRows(), { range: '30d', now });
    const inRange = PAST_DECISIONS.filter((d) => now.getTime() - new Date(d.decidedAt).getTime() < 30 * 24 * 60 * 60 * 1000);
    const value = (gs: string[]) => inRange.filter((d) => gs.includes(d.grade)).reduce((s, d) => s + product(d.receivedSku).priceNok, 0);
    expect(r.grades.decided).toBe(inRange.length);
    expect(r.grades.resoldNok).toBe(value(['A', 'B']));
    expect(r.grades.repaired.valueNok).toBe(value(['C']));
    expect(r.grades.scrapped).toEqual({ count: inRange.filter((d) => d.grade === 'D').length, valueNok: value(['D']) });
    expect(r.causes.reduce((s, c) => s + c.count, 0)).toBe(inRange.length);
  });

  it('groups return reasons per SKU and per category', () => {
    const r = computeInsights(seedRows(), { range: '30d', now });
    expect(r.returnReasons.byCategory.reduce((s, c) => s + c.total, 0)).toBe(r.returnReasons.total);
    for (const s of r.returnReasons.bySku) expect(s.reasons.reduce((n, x) => n + x.count, 0)).toBe(s.total);
    expect(r.returnReasons.byCategory.map((c) => c.label)).toContain('Klær');
  });

  it('produces a valid report with nothing per worker or device in it', () => {
    const r = computeInsights(seedRows(), { range: '30d', now });
    expect(insightsReportSchema.parse(r)).toEqual(r);
    const text = JSON.stringify(r);
    for (const leak of ['device', 'actor', 'user', 'decided_by', 'worker']) expect(text.toLowerCase()).not.toContain(leak);
  });
});
