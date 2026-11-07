// Single source of seed data. Demo mode loads it into memory; scripts/build-seed.ts
// turns it into supabase/seed.sql with timestamps shifted relative to now().
// All customer data is synthetic.

import type {
  Cause,
  ConfusionEvent,
  Grade,
  Order,
  PackCheck,
  Product,
  ReturnCase,
  ReturnFlag,
} from '@/lib/engine/types';

/** The fixed clock demo mode runs on. Seed times are written relative to this. */
export const DEMO_NOW = '2026-11-07T10:00:00+01:00';
export const WAREHOUSE_ID = '00000000-0000-4000-8000-000000000001';
export const WAREHOUSE_NAME = 'Demo-lager Oslo';

const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (d: number, hour = 12, minute = 0) => {
  const t = new Date(new Date(DEMO_NOW).getTime() - d * DAY);
  t.setUTCHours(hour - 1, minute, 0, 0); // hour given in Oslo winter time (UTC+1)
  return t.toISOString();
};

// ---------- Locations ----------

export interface SeedLocation {
  code: string;
  kind: 'stock' | 'outlet' | 'repair' | 'scrap';
}

// ---------- Products: brief section 5, then 33 extras ----------

const BRIEF_PRODUCTS: Product[] = [
  { sku: 'HD-NAVY-M', nameNb: 'Hettegenser, marineblå, M', nameEn: 'Hoodie, navy, M', category: 'apparel', color: 'navy', size: 'M', priceNok: 599, location: 'A-03-2', variantGroup: 'hoodie-basic' },
  { sku: 'HD-BLACK-M', nameNb: 'Hettegenser, sort, M', nameEn: 'Hoodie, black, M', category: 'apparel', color: 'black', size: 'M', priceNok: 599, location: 'A-03-1', variantGroup: 'hoodie-basic' },
  { sku: 'SK-WOOL-40', nameNb: 'Ullsokker, grå, 40–42', nameEn: 'Wool socks, grey, 40–42', category: 'accessory', color: 'grey', size: '40-42', priceNok: 149, location: 'A-05-1' },
  { sku: 'JK-SHELL-M', nameNb: 'Skalljakke, grønn, M', nameEn: 'Shell jacket, green, M', category: 'apparel', color: 'green', size: 'M', priceNok: 1499, location: 'C-14-2', variantGroup: 'shell-green' },
  { sku: 'JK-SHELL-L', nameNb: 'Skalljakke, grønn, L', nameEn: 'Shell jacket, green, L', category: 'apparel', color: 'green', size: 'L', priceNok: 1499, location: 'C-14-3', variantGroup: 'shell-green' },
  { sku: 'CP-BEANIE', nameNb: 'Lue, oransje', nameEn: 'Beanie, orange', category: 'accessory', color: 'orange', priceNok: 249, location: 'A-06-4' },
];

type P = Omit<Product, 'location'> & { location?: string };
const EXTRA_PRODUCTS_RAW: P[] = [
  { sku: 'TS-WHITE-S', nameNb: 'T-skjorte, hvit, S', nameEn: 'T-shirt, white, S', category: 'apparel', color: 'white', size: 'S', priceNok: 199, variantGroup: 'tee-white' },
  { sku: 'TS-WHITE-M', nameNb: 'T-skjorte, hvit, M', nameEn: 'T-shirt, white, M', category: 'apparel', color: 'white', size: 'M', priceNok: 199, variantGroup: 'tee-white' },
  { sku: 'TS-WHITE-L', nameNb: 'T-skjorte, hvit, L', nameEn: 'T-shirt, white, L', category: 'apparel', color: 'white', size: 'L', priceNok: 199, variantGroup: 'tee-white' },
  { sku: 'TS-BLACK-M', nameNb: 'T-skjorte, sort, M', nameEn: 'T-shirt, black, M', category: 'apparel', color: 'black', size: 'M', priceNok: 199, variantGroup: 'tee-black' },
  { sku: 'TS-BLACK-L', nameNb: 'T-skjorte, sort, L', nameEn: 'T-shirt, black, L', category: 'apparel', color: 'black', size: 'L', priceNok: 199, variantGroup: 'tee-black' },
  { sku: 'JN-BLUE-30', nameNb: 'Jeans, blå, 30/32', nameEn: 'Jeans, blue, 30/32', category: 'apparel', color: 'blue', size: '30/32', priceNok: 899, variantGroup: 'jeans-blue' },
  { sku: 'JN-BLUE-32', nameNb: 'Jeans, blå, 32/32', nameEn: 'Jeans, blue, 32/32', category: 'apparel', color: 'blue', size: '32/32', priceNok: 899, variantGroup: 'jeans-blue' },
  { sku: 'JN-BLUE-34', nameNb: 'Jeans, blå, 34/32', nameEn: 'Jeans, blue, 34/32', category: 'apparel', color: 'blue', size: '34/32', priceNok: 899, variantGroup: 'jeans-blue' },
  { sku: 'FL-GREY-M', nameNb: 'Fleecejakke, grå, M', nameEn: 'Fleece jacket, grey, M', category: 'apparel', color: 'grey', size: 'M', priceNok: 799, variantGroup: 'fleece-grey' },
  { sku: 'FL-GREY-L', nameNb: 'Fleecejakke, grå, L', nameEn: 'Fleece jacket, grey, L', category: 'apparel', color: 'grey', size: 'L', priceNok: 799, variantGroup: 'fleece-grey' },
  { sku: 'RJ-YELLOW-M', nameNb: 'Regnjakke, gul, M', nameEn: 'Rain jacket, yellow, M', category: 'apparel', color: 'yellow', size: 'M', priceNok: 1199, variantGroup: 'rain-yellow' },
  { sku: 'RJ-YELLOW-L', nameNb: 'Regnjakke, gul, L', nameEn: 'Rain jacket, yellow, L', category: 'apparel', color: 'yellow', size: 'L', priceNok: 1199, variantGroup: 'rain-yellow' },
  { sku: 'KN-NATURAL-M', nameNb: 'Ullgenser, naturhvit, M', nameEn: 'Wool sweater, off-white, M', category: 'apparel', color: 'off-white', size: 'M', priceNok: 1299, variantGroup: 'knit-natural' },
  { sku: 'KN-NATURAL-L', nameNb: 'Ullgenser, naturhvit, L', nameEn: 'Wool sweater, off-white, L', category: 'apparel', color: 'off-white', size: 'L', priceNok: 1299, variantGroup: 'knit-natural' },
  { sku: 'TI-BLACK-S', nameNb: 'Løpetights, sort, S', nameEn: 'Running tights, black, S', category: 'apparel', color: 'black', size: 'S', priceNok: 549, variantGroup: 'tights-black' },
  { sku: 'TI-BLACK-M', nameNb: 'Løpetights, sort, M', nameEn: 'Running tights, black, M', category: 'apparel', color: 'black', size: 'M', priceNok: 549, variantGroup: 'tights-black' },
  { sku: 'JG-GREY-M', nameNb: 'Joggebukse, grå, M', nameEn: 'Joggers, grey, M', category: 'apparel', color: 'grey', size: 'M', priceNok: 499, variantGroup: 'jogger-grey' },
  { sku: 'JG-GREY-L', nameNb: 'Joggebukse, grå, L', nameEn: 'Joggers, grey, L', category: 'apparel', color: 'grey', size: 'L', priceNok: 499, variantGroup: 'jogger-grey' },
  { sku: 'SH-LBLUE-M', nameNb: 'Skjorte, lyseblå, M', nameEn: 'Shirt, light blue, M', category: 'apparel', color: 'light blue', size: 'M', priceNok: 699, variantGroup: 'shirt-oxford' },
  { sku: 'SH-WHITE-M', nameNb: 'Skjorte, hvit, M', nameEn: 'Shirt, white, M', category: 'apparel', color: 'white', size: 'M', priceNok: 699, variantGroup: 'shirt-oxford' },
  { sku: 'DV-BLACK-M', nameNb: 'Dunvest, sort, M', nameEn: 'Down vest, black, M', category: 'apparel', color: 'black', size: 'M', priceNok: 1099 },
  { sku: 'MT-GREY', nameNb: 'Votter, grå', nameEn: 'Mittens, grey', category: 'accessory', color: 'grey', priceNok: 299 },
  { sku: 'SC-RED', nameNb: 'Skjerf, rødt', nameEn: 'Scarf, red', category: 'accessory', color: 'red', priceNok: 349 },
  { sku: 'CA-BLACK', nameNb: 'Caps, sort', nameEn: 'Cap, black', category: 'accessory', color: 'black', priceNok: 279, variantGroup: 'cap-basic' },
  { sku: 'CA-NAVY', nameNb: 'Caps, marineblå', nameEn: 'Cap, navy', category: 'accessory', color: 'navy', priceNok: 279, variantGroup: 'cap-basic' },
  { sku: 'BH-BEIGE', nameNb: 'Bøttehatt, beige', nameEn: 'Bucket hat, beige', category: 'accessory', color: 'beige', priceNok: 299 },
  { sku: 'BP-GREEN-20', nameNb: 'Ryggsekk 20 l, grønn', nameEn: 'Backpack 20 l, green', category: 'accessory', color: 'green', priceNok: 899 },
  { sku: 'WB-STEEL', nameNb: 'Drikkeflaske, stål', nameEn: 'Water bottle, steel', category: 'accessory', color: 'steel', priceNok: 249 },
  { sku: 'HL-BLACK', nameNb: 'Hodelykt, sort', nameEn: 'Headlamp, black', category: 'accessory', color: 'black', priceNok: 449 },
  { sku: 'SK-WOOL-36', nameNb: 'Ullsokker, grå, 36–39', nameEn: 'Wool socks, grey, 36–39', category: 'accessory', color: 'grey', size: '36-39', priceNok: 149 },
  { sku: 'SK-RUN-40', nameNb: 'Løpesokker, hvit, 40–42', nameEn: 'Running socks, white, 40–42', category: 'accessory', color: 'white', size: '40-42', priceNok: 129 },
  { sku: 'GL-BLACK-M', nameNb: 'Hansker, sort, M', nameEn: 'Gloves, black, M', category: 'accessory', color: 'black', size: 'M', priceNok: 399, variantGroup: 'gloves-black' },
  { sku: 'GL-BLACK-L', nameNb: 'Hansker, sort, L', nameEn: 'Gloves, black, L', category: 'accessory', color: 'black', size: 'L', priceNok: 399, variantGroup: 'gloves-black' },
];

const EXTRA_PRODUCTS: Product[] = EXTRA_PRODUCTS_RAW.map((p, i) => ({
  ...p,
  location: p.location ?? `${p.category === 'apparel' ? 'D' : 'E'}-${String(10 + Math.floor(i / 4)).padStart(2, '0')}-${(i % 4) + 1}`,
}));

function ean(i: number): string {
  const base = `7090042${String(100000 + i).slice(1)}`; // 12 digits
  const sum = [...base].reduce((s, d, k) => s + Number(d) * (k % 2 ? 3 : 1), 0);
  return base + ((10 - (sum % 10)) % 10);
}

export const PRODUCTS: Product[] = [...BRIEF_PRODUCTS, ...EXTRA_PRODUCTS].map((p, i) => ({
  ...p,
  barcode: ean(i + 1),
}));

export const LOCATIONS: SeedLocation[] = [
  ...[...new Set(PRODUCTS.map((p) => p.location))].sort().map((code) => ({ code, kind: 'stock' as const })),
  { code: 'B-OUT-1', kind: 'outlet' },
  { code: 'R-REP-1', kind: 'repair' },
  { code: 'X-KASS', kind: 'scrap' },
];

export const DEVICES = ['device-01', 'device-03', 'device-07', 'device-12', 'lead-tablet'];

// ---------- Deterministic generator ----------

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(2026);
const pick = <T,>(xs: T[]): T => xs[Math.floor(rnd() * xs.length)];
const price = (sku: string) => PRODUCTS.find((p) => p.sku === sku)!.priceNok;
const line = (sku: string, qty = 1) => ({ sku, qty, priceNok: price(sku) });

// ---------- Orders ----------

const BRIEF_ORDERS: Order[] = [
  { id: '2207', customerRef: 'Testkunde 2207', lines: [line('HD-NAVY-M'), line('SK-WOOL-40')], status: 'picked' },
  { id: '1043', customerRef: 'Testkunde 1043', lines: [line('JK-SHELL-L')], status: 'shipped', shippedAt: '2026-10-29T14:00:00+01:00' },
  { id: '2311', customerRef: 'Testkunde 2311', lines: [line('JK-SHELL-L')], status: 'picked' },
];

const extraSkus = EXTRA_PRODUCTS.map((p) => p.sku).concat(['HD-NAVY-M', 'HD-BLACK-M', 'CP-BEANIE', 'SK-WOOL-40', 'JK-SHELL-M']);

const EXTRA_ORDERS: Order[] = Array.from({ length: 37 }, (_, i) => {
  const id = String(2400 + i * 7);
  const nLines = i % 5 === 0 ? 3 : i % 3 === 0 ? 2 : 1;
  const skus = new Set<string>();
  while (skus.size < nLines) skus.add(pick(extraSkus));
  const lines = [...skus].map((sku, k) => line(sku, k === 0 && i % 6 === 2 ? 2 : 1)); // some qty 2
  const shipped = i >= 12; // first 12 are waiting to be packed
  return {
    id,
    customerRef: `Testkunde ${id}`,
    lines,
    status: shipped ? 'shipped' : 'picked',
    shippedAt: shipped ? daysAgo(2 + ((i * 7) % 50), 13, (i * 7) % 60) : undefined,
  } satisfies Order;
});

export const ORDERS: Order[] = [...BRIEF_ORDERS, ...EXTRA_ORDERS];

// ---------- Pack checks (evidence for shipped orders) ----------

export const PACK_CHECKS: PackCheck[] = [
  { id: 'PC-1043', orderId: '1043', status: 'MANUAL_CONFIRM', method: 'manual', photoRef: 'pack-1043.svg', sizeVerified: false, confidence: 0.62, deviceId: 'device-03', at: '2026-10-29T13:12:00+01:00' },
  ...EXTRA_ORDERS.filter((o) => o.status === 'shipped').map((o, i): PackCheck => {
    const manual = i % 6 === 4;
    return {
      id: `PC-${o.id}`,
      orderId: o.id,
      status: manual ? 'MANUAL_CONFIRM' : 'VERIFIED',
      method: manual ? 'manual' : i % 7 === 3 ? 'barcode' : 'camera',
      photoRef: `pack-${o.id}.jpg`,
      sizeVerified: !manual && i % 3 !== 1,
      confidence: manual ? 0.55 + (i % 3) * 0.05 : 0.86 + (i % 10) / 100,
      deviceId: pick(['device-01', 'device-03', 'device-07']),
      at: new Date(new Date(o.shippedAt!).getTime() - 40 * 60 * 1000).toISOString(),
    };
  }),
];

// ---------- Returns ----------

export interface PastDecision {
  returnId: string;
  itemIndex: number;
  receivedSku: string;
  grade: Grade;
  locationCode: string;
  refundNok: number | null;
  cause: Cause;
  flags: ReturnFlag[];
  decidedAt: string;
}

const BRIEF_RETURN: ReturnCase = {
  id: '1043',
  orderId: '1043',
  customerReasonNb: 'Fikk feil størrelse',
  items: [{ orderedSku: 'JK-SHELL-L', qty: 1 }],
  status: 'pending',
  registeredAt: '2026-11-04T19:20:00+01:00',
};

const shippedExtra = EXTRA_ORDERS.filter((o) => o.status === 'shipped');

/** 14 more returns: 4 pending (one multi-item, one late) and 10 decided across all grades/causes. */
const RETURN_SPECS: {
  reason: string;
  status: ReturnCase['status'];
  decided?: { grade: Grade; cause: Cause; wrongSku?: boolean; flags?: ReturnFlag[] };
  lateDays?: number;
  multi?: boolean;
}[] = [
  { reason: 'Passet ikke', status: 'pending' },
  { reason: 'Angret kjøp', status: 'pending' },
  { reason: 'Feil farge', status: 'pending', lateDays: 38 },
  { reason: 'For liten', status: 'pending', multi: true },
  { reason: 'For stor', status: 'confirmed', decided: { grade: 'A', cause: 'customer_side' } },
  { reason: 'Angret kjøp', status: 'confirmed', decided: { grade: 'A', cause: 'customer_side' } },
  { reason: 'Fikk feil størrelse', status: 'confirmed', decided: { grade: 'A', cause: 'likely_warehouse_error', wrongSku: true, flags: ['wrong_item'] } },
  { reason: 'Kvalitet ikke som forventet', status: 'confirmed', decided: { grade: 'B', cause: 'customer_side' } },
  { reason: 'Passet ikke', status: 'confirmed', decided: { grade: 'B', cause: 'customer_side' } },
  { reason: 'Skadet ved levering', status: 'confirmed', decided: { grade: 'C', cause: 'transit_damage', flags: ['carrier_claim'] } },
  { reason: 'Ødelagt glidelås', status: 'confirmed', decided: { grade: 'C', cause: 'customer_side' } },
  { reason: 'Fikk feil vare', status: 'confirmed', decided: { grade: 'A', cause: 'inconclusive', wrongSku: true, flags: ['wrong_item'] } },
  { reason: 'Flekker', status: 'confirmed', decided: { grade: 'D', cause: 'customer_side' } },
  { reason: 'Fikk feil vare', status: 'confirmed', decided: { grade: 'B', cause: 'unknown', wrongSku: true, flags: ['wrong_item'] } },
];

const SHELF: Record<Grade, string> = { A: '', B: 'B-OUT-1', C: 'R-REP-1', D: 'X-KASS' };

function sibling(sku: string): string | undefined {
  const p = PRODUCTS.find((x) => x.sku === sku)!;
  return PRODUCTS.find((x) => x.sku !== sku && x.variantGroup && x.variantGroup === p.variantGroup)?.sku;
}

export const RETURNS: ReturnCase[] = [BRIEF_RETURN];
export const PAST_DECISIONS: PastDecision[] = [];
const PAST_CONFUSION: ConfusionEvent[] = [];

const nowMs = new Date(DEMO_NOW).getTime();
const used = new Set<string>();

RETURN_SPECS.forEach((spec, k) => {
  // Oldest shipments first, so decided and late returns have room in the past.
  const order = [...shippedExtra]
    .sort((a, b) => new Date(a.shippedAt!).getTime() - new Date(b.shippedAt!).getTime())
    .find((o) => {
      if (used.has(o.id)) return false;
      const age = (nowMs - new Date(o.shippedAt!).getTime()) / DAY;
      if (spec.multi && o.lines.length < 2) return false;
      if (spec.decided?.wrongSku && !sibling(o.lines[0].sku)) return false;
      if (spec.lateDays) return age > spec.lateDays + 2;
      if (spec.decided) return age > 6 && age < 40;
      return age < 12; // pending returns are recent
    });
  if (!order) throw new Error(`No order fits return spec ${k}`);
  used.add(order.id);

  const id = String(1050 + k * 3);
  const items = (spec.multi ? order.lines : order.lines.slice(0, 1)).map((l) => ({ orderedSku: l.sku, qty: 1 }));
  const shippedMs = new Date(order.shippedAt!).getTime();
  const registeredMs = Math.min(shippedMs + (spec.lateDays ?? 2 + (k % 3)) * DAY, nowMs - 6 * 60 * 60 * 1000);
  const registeredAt = new Date(registeredMs).toISOString();
  RETURNS.push({ id, orderId: order.id, customerReasonNb: spec.reason, items, status: spec.status, registeredAt });

  if (spec.decided) {
    const ordered = items[0].orderedSku;
    const received = spec.decided.wrongSku ? sibling(ordered)! : ordered;
    const lineValue = price(ordered);
    const g = spec.decided.grade;
    const refund =
      g === 'A' || g === 'B' || spec.decided.cause === 'likely_warehouse_error' || spec.decided.cause === 'transit_damage'
        ? lineValue
        : null;
    const decidedAt = new Date(Math.min(registeredMs + 2 * DAY, nowMs - DAY)).toISOString();
    PAST_DECISIONS.push({
      returnId: id,
      itemIndex: 0,
      receivedSku: received,
      grade: g,
      locationCode: g === 'A' ? PRODUCTS.find((p) => p.sku === received)!.location : SHELF[g],
      refundNok: refund,
      cause: spec.decided.cause,
      flags: spec.decided.flags ?? [],
      decidedAt,
    });
    if (received !== ordered) {
      PAST_CONFUSION.push({ skuPair: [ordered, received].sort() as [string, string], kind: 'found_at_returns', at: decidedAt });
    }
  }
});

// ---------- Loop state: brief section 5, plus older events for the 30-day view ----------

export const CONFUSION_EVENTS: ConfusionEvent[] = [
  { skuPair: ['JK-SHELL-L', 'JK-SHELL-M'], kind: 'found_at_returns', at: '2026-11-03T10:40:00+01:00' },
  { skuPair: ['JK-SHELL-L', 'JK-SHELL-M'], kind: 'found_at_returns', at: '2026-11-05T14:05:00+01:00' },
  { skuPair: ['HD-BLACK-M', 'HD-NAVY-M'], kind: 'caught_at_packing', at: '2026-11-04T09:15:00+01:00' },
  { skuPair: ['TS-WHITE-L', 'TS-WHITE-M'], kind: 'caught_at_packing', at: daysAgo(12, 9, 30) },
  { skuPair: ['JN-BLUE-30', 'JN-BLUE-32'], kind: 'found_at_returns', at: daysAgo(18, 11, 5) },
  { skuPair: ['JN-BLUE-30', 'JN-BLUE-32'], kind: 'caught_at_packing', at: daysAgo(21, 15, 45) },
  { skuPair: ['CA-BLACK', 'CA-NAVY'], kind: 'caught_at_packing', at: daysAgo(25, 10, 10) },
  ...PAST_CONFUSION,
];

// ---------- Insights history (M6): near-misses and the events Holio would have received ----------

/**
 * Wrong parcels stopped at packing before they were sealed: one MISMATCH check per order, a few
 * minutes before its seal (like record_pack_mismatch). Kept out of PACK_CHECKS, which demo mode
 * reads as packing evidence.
 */
export const NEAR_MISSES: PackCheck[] = [3, 10, 17, 26].map((age) => {
  const seal = PACK_CHECKS.filter((c) => c.id !== 'PC-1043' && c.status === 'VERIFIED')
    .map((c) => ({ c, d: Math.abs((nowMs - new Date(c.at).getTime()) / DAY - age) }))
    .sort((a, b) => a.d - b.d)[0].c;
  return {
    ...seal,
    id: `NM-${seal.orderId}`,
    status: 'MISMATCH',
    method: 'camera',
    photoRef: `pack-${seal.orderId}-mismatch.jpg`,
    sizeVerified: false,
    at: new Date(new Date(seal.at).getTime() - 4 * 60 * 1000).toISOString(),
  };
});

export interface SeedIntegrationEvent {
  type: 'pack.verified' | 'pack.manual_confirm' | 'return.item.decided' | 'return.confirmed';
  at: string;
  payload: Record<string, unknown>;
}

/** Same payload shapes as the live commits (lib/pack/commit.ts, lib/returns/commit.ts, the SQL functions). */
export const INTEGRATION_EVENTS: SeedIntegrationEvent[] = [
  ...PACK_CHECKS.map((c): SeedIntegrationEvent => {
    const o = ORDERS.find((x) => x.id === c.orderId)!;
    const manual = c.status === 'MANUAL_CONFIRM';
    return {
      type: manual ? 'pack.manual_confirm' : 'pack.verified',
      at: c.at,
      payload: {
        ordre: o.id,
        kunde: o.customerRef,
        status: c.status,
        metode: c.method ?? 'camera',
        storrelseLest: c.sizeVerified,
        sikkerhet: Number(c.confidence.toFixed(3)),
        linjer: o.lines.map((l) => ({ sku: l.sku, antall: l.qty, sett: l.qty, storrelseLest: c.sizeVerified, metode: manual ? 'manual' : (c.method ?? 'camera') })),
        pakkebevis: null,
        bilder: [],
        manuellGrunn: null,
        motorversjon: 'seed',
      },
    };
  }),
  ...PAST_DECISIONS.flatMap((d): SeedIntegrationEvent[] => {
    const r = RETURNS.find((x) => x.id === d.returnId)!;
    const item = r.items[d.itemIndex];
    const vare = {
      bestiltSku: item.orderedSku,
      mottattSku: d.receivedSku,
      grad: d.grade,
      lokasjon: d.locationCode,
      refusjonNok: d.refundNok,
      sannsynligAarsak: d.cause,
      flagg: d.flags,
    };
    const head = { retur: r.id, ordre: r.orderId, returaarsak: r.customerReasonNb };
    return [
      { type: 'return.item.decided', at: d.decidedAt, payload: { ...head, ...vare, tilstand: null, merknad: null, kundelapp: null, bilder: [], lagerkorreksjon: [], motorversjon: 'seed' } },
      ...(r.status === 'confirmed' ? [{ type: 'return.confirmed' as const, at: new Date(new Date(d.decidedAt).getTime() + 1000).toISOString(), payload: { ...head, varer: [vare] } }] : []),
    ];
  }),
].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());

export const SEED = {
  demoNow: DEMO_NOW,
  warehouseId: WAREHOUSE_ID,
  products: PRODUCTS,
  locations: LOCATIONS,
  devices: DEVICES,
  orders: ORDERS,
  packChecks: PACK_CHECKS,
  returns: RETURNS,
  pastDecisions: PAST_DECISIONS,
  confusionEvents: CONFUSION_EVENTS,
  nearMisses: NEAR_MISSES,
  integrationEvents: INTEGRATION_EVENTS,
  packAlerts: [] as const,
};
