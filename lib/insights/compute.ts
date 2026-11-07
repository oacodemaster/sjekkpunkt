// Insights aggregation (addendum section 7). Pure: the server feeds it rows from the anonymous
// insights_* views, the tests feed it seed rows. Nothing here knows about users or devices.

import { z } from 'zod';
import { pairLabelNb, sortedPair } from '@/lib/engine/catalog';
import type { Cause, Grade, Product } from '@/lib/engine/types';

export const RANGES = { '7d': 7, '30d': 30 } as const;
export type InsightsRange = keyof typeof RANGES;
export const rangeSchema = z.enum(['7d', '30d']);

export const DEFAULT_WRONG_PARCEL_COST_NOK = 340;

const DAY = 24 * 60 * 60 * 1000;

export const GRADES: Grade[] = ['A', 'B', 'C', 'D'];
export const CAUSES: Cause[] = ['likely_warehouse_error', 'customer_side', 'inconclusive', 'unknown', 'transit_damage'];

export const CAUSE_NB: Record<Cause, string> = {
  likely_warehouse_error: 'Sannsynlig pakkefeil',
  customer_side: 'Kundens side',
  inconclusive: 'Uklar',
  unknown: 'Ukjent',
  transit_damage: 'Transportskade',
};
export const CATEGORY_NB: Record<string, string> = { apparel: 'Klær', accessory: 'Tilbehør' };

// ---------- input rows (column names as the views return them) ----------

export interface InsightsRows {
  confusion: { sku_a: string; sku_b: string; kind: 'caught_at_packing' | 'found_at_returns'; at: string }[];
  alerts: { sku_a: string; sku_b: string; origin: 'auto' | 'manual'; active: boolean }[];
  packChecks: { order_id: string; status: string; method: string; created_at: string }[];
  returns: { ordered_sku: string; category: string; customer_reason_nb: string | null; registered_at: string }[];
  decisions: { grade: Grade; cause: Cause | null; item_value_nok: number | null; decided_at: string }[];
  products: Product[];
}

// ---------- report ----------

const count = z.number().int().nonnegative();
const nok = z.number().int().nonnegative();
const reasonCounts = z.array(z.object({ reason: z.string(), count }));

export const insightsReportSchema = z.object({
  range: rangeSchema,
  days: z.number().int().positive(),
  generatedAt: z.string(),
  mixups: z.array(
    z.object({
      skuA: z.string(),
      skuB: z.string(),
      label: z.string(),
      last7: count,
      last30: count,
      caughtAtPacking: count,
      foundAtReturns: count,
      alert: z.enum(['auto', 'manual']).nullable(),
    }),
  ),
  returnReasons: z.object({
    total: count,
    bySku: z.array(z.object({ sku: z.string(), name: z.string(), total: count, reasons: reasonCounts })),
    byCategory: z.array(z.object({ category: z.string(), label: z.string(), total: count, reasons: reasonCounts })),
  }),
  grades: z.object({
    decided: count,
    byGrade: z.array(z.object({ grade: z.enum(['A', 'B', 'C', 'D']), count, valueNok: nok })),
    resoldNok: nok,
    repaired: z.object({ count, valueNok: nok }),
    scrapped: z.object({ count, valueNok: nok }),
  }),
  causes: z.array(z.object({ cause: z.enum(CAUSES as [Cause, ...Cause[]]), label: z.string(), count })),
  nearMisses: z.object({
    caught: count,
    sealed: count,
    costPerParcelNok: nok,
    estimatedSavedNok: nok,
    sealedBy: z.object({ camera: count, barcode: count, manual: count }),
  }),
});
export type InsightsReport = z.infer<typeof insightsReportSchema>;

/** Same window as the engine's countInWindow: now − days < t ≤ now. */
function inWindow(iso: string, nowMs: number, days: number): boolean {
  const t = new Date(iso).getTime();
  return t > nowMs - days * DAY && t <= nowMs;
}

function tally(values: string[]): { reason: string; count: number }[] {
  const m = new Map<string, number>();
  for (const v of values) m.set(v, (m.get(v) ?? 0) + 1);
  return [...m.entries()].map(([reason, n]) => ({ reason, count: n })).sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason, 'nb'));
}

export function computeInsights(
  rows: InsightsRows,
  opts: { range: InsightsRange; now: Date; wrongParcelCostNok?: number; topSkus?: number },
): InsightsReport {
  const days = RANGES[opts.range];
  const nowMs = opts.now.getTime();
  const within = (iso: string) => inWindow(iso, nowMs, days);
  const names = new Map(rows.products.map((p) => [p.sku, p.nameNb]));

  // SKU-pair mix-ups: always both windows (the spec asks for 7 and 30 days side by side).
  const pairs = new Map<string, InsightsReport['mixups'][number]>();
  const pairRow = (a: string, b: string) => {
    const [skuA, skuB] = sortedPair(a, b);
    const key = `${skuA}|${skuB}`;
    let row = pairs.get(key);
    if (!row) {
      row = { skuA, skuB, label: pairLabelNb([skuA, skuB], rows.products), last7: 0, last30: 0, caughtAtPacking: 0, foundAtReturns: 0, alert: null };
      pairs.set(key, row);
    }
    return row;
  };
  for (const e of rows.confusion) {
    const in30 = inWindow(e.at, nowMs, 30);
    if (!in30) continue;
    const row = pairRow(e.sku_a, e.sku_b);
    row.last30 += 1;
    if (inWindow(e.at, nowMs, 7)) row.last7 += 1;
    if (within(e.at)) row[e.kind === 'caught_at_packing' ? 'caughtAtPacking' : 'foundAtReturns'] += 1;
  }
  for (const a of rows.alerts) if (a.active) pairRow(a.sku_a, a.sku_b).alert = a.origin;
  const mixups = [...pairs.values()].sort(
    (x, y) => Number(!!y.alert) - Number(!!x.alert) || y.last7 - x.last7 || y.last30 - x.last30 || x.label.localeCompare(y.label, 'nb'),
  );

  // Return reasons per SKU and per category (registered inside the range).
  const returns = rows.returns.filter((r) => within(r.registered_at));
  const reasonOf = (r: (typeof returns)[number]) => r.customer_reason_nb?.trim() || 'Ingen årsak oppgitt';
  const group = (key: (r: (typeof returns)[number]) => string) => {
    const m = new Map<string, string[]>();
    for (const r of returns) m.set(key(r), [...(m.get(key(r)) ?? []), reasonOf(r)]);
    return [...m.entries()].map(([k, reasons]) => ({ k, total: reasons.length, reasons: tally(reasons) })).sort((a, b) => b.total - a.total || a.k.localeCompare(b.k));
  };
  const bySku = group((r) => r.ordered_sku)
    .slice(0, opts.topSkus ?? 8)
    .map(({ k, total, reasons }) => ({ sku: k, name: names.get(k) ?? k, total, reasons }));
  const byCategory = group((r) => r.category).map(({ k, total, reasons }) => ({ category: k, label: CATEGORY_NB[k] ?? k, total, reasons }));

  // Grades and value recovered (decided inside the range; latest decision per item, from the view).
  const decisions = rows.decisions.filter((d) => within(d.decided_at));
  const byGrade = GRADES.map((grade) => {
    const ds = decisions.filter((d) => d.grade === grade);
    return { grade, count: ds.length, valueNok: ds.reduce((s, d) => s + (d.item_value_nok ?? 0), 0) };
  });
  const g = Object.fromEntries(byGrade.map((x) => [x.grade, x])) as Record<Grade, (typeof byGrade)[number]>;

  const causes = CAUSES.map((cause) => ({ cause, label: CAUSE_NB[cause], count: decisions.filter((d) => d.cause === cause).length }));

  // Near-misses: parcels stopped at packing (one MISMATCH check per order, see record_pack_mismatch).
  const checks = rows.packChecks.filter((c) => within(c.created_at));
  const caught = new Set(checks.filter((c) => c.status === 'MISMATCH').map((c) => c.order_id)).size;
  const sealedChecks = checks.filter((c) => c.status === 'VERIFIED' || c.status === 'MANUAL_CONFIRM');
  const cost = Math.max(0, Math.round(opts.wrongParcelCostNok ?? DEFAULT_WRONG_PARCEL_COST_NOK));

  return {
    range: opts.range,
    days,
    generatedAt: opts.now.toISOString(),
    mixups,
    returnReasons: { total: returns.length, bySku, byCategory },
    grades: {
      decided: decisions.length,
      byGrade,
      resoldNok: g.A.valueNok + g.B.valueNok,
      repaired: { count: g.C.count, valueNok: g.C.valueNok },
      scrapped: { count: g.D.count, valueNok: g.D.valueNok },
    },
    causes,
    nearMisses: {
      caught,
      sealed: sealedChecks.length,
      costPerParcelNok: cost,
      estimatedSavedNok: caught * cost,
      sealedBy: {
        camera: sealedChecks.filter((c) => c.status === 'VERIFIED' && c.method === 'camera').length,
        barcode: sealedChecks.filter((c) => c.status === 'VERIFIED' && c.method === 'barcode').length,
        manual: sealedChecks.filter((c) => c.status === 'MANUAL_CONFIRM').length,
      },
    },
  };
}
