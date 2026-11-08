// The practice demo's "camera": turns what the visitor put in the on-screen box into the same
// vision result the live model returns, so the real engine decides. Pure.
//
// It sees what a camera from above would see, no more:
// - colour and kind: a black hoodie is not the navy one (wrong item, P1);
// - sock sizes, printed on the band (a wrong size is a mismatch);
// - not garment sizes, which sit on a label inside: an M and an L of the same garment look the
//   same from above, so the engine asks for a label close-up (P3, P4), and the close-up shows
//   the real size.

import { productMap } from '@/lib/engine/catalog';
import type { Box2d, LabelCheck, Order, PackVision, PackVisionItem, Product } from '@/lib/engine/types';
import { PLAY_IMAGE } from './catalog';

export interface BoxUnit {
  /** one physical item in the box */
  uid: string;
  sku: string;
}

const CONFIDENCE = 0.94;

/** The size is readable from above (printed on a sock band), not on an inside label. */
const sizeOnTop = (p: Product | undefined) => !!p?.size && p.category === 'accessory';

/** What the camera takes a unit for: the ordered SKU it cannot tell apart from, or itself. */
export function seenAs(sku: string, order: Order): { sku: string; inOrder: boolean } {
  if (order.lines.some((l) => l.sku === sku)) return { sku, inOrder: true };
  const look = PLAY_IMAGE[sku];
  const twin = look ? order.lines.find((l) => PLAY_IMAGE[l.sku] === look) : undefined;
  return twin ? { sku: twin.sku, inOrder: true } : { sku, inOrder: false };
}

/** Cells of a grid inside the box, in the engine's 0-1000 [ymin, xmin, ymax, xmax]. */
export function boxGrid(n: number): Box2d[] {
  if (n === 0) return [];
  const cols = Math.ceil(Math.sqrt(n));
  const rows = Math.ceil(n / cols);
  const [top, left, size] = [180, 180, 640];
  const w = size / cols;
  const h = size / rows;
  return Array.from({ length: n }, (_, i) => {
    const r = Math.floor(i / cols);
    const c = i % cols;
    return [Math.round(top + r * h), Math.round(left + c * w), Math.round(top + (r + 1) * h), Math.round(left + (c + 1) * w)] as Box2d;
  });
}

export function boxVision(units: BoxUnit[], order: Order, products: Product[]): PackVision {
  const pm = productMap(products);
  const grid = boxGrid(units.length);
  const items: PackVisionItem[] = units.map((u, i) => {
    const p = pm.get(u.sku);
    const seen = seenAs(u.sku, order);
    return {
      matchedSku: seen.sku,
      description: p ? p.nameEn.toLowerCase() : 'item',
      observedColor: p?.color ?? 'unknown',
      sizeRead: sizeOnTop(p) ? p!.size! : null,
      status: seen.inOrder ? 'present' : 'unexpected',
      confidence: CONFIDENCE,
      box_2d: grid[i],
    };
  });
  const counted = (sku: string) => items.filter((i) => i.matchedSku === sku).length;
  return {
    items,
    missingSkus: order.lines.filter((l) => counted(l.sku) < l.qty).map((l) => l.sku),
    visibleText: [],
    facePresent: false,
  };
}

/**
 * A size label close-up for one order line. With several units on the line, the one with the
 * wrong size is the one that matters, so it is the one read. Nothing on the line: nothing to read.
 */
export function labelRead(units: BoxUnit[], lineSku: string, order: Order, products: Product[]): LabelCheck {
  const pm = productMap(products);
  const ordered = pm.get(lineSku);
  const onLine = units.map((u) => pm.get(u.sku)).filter((p): p is Product => !!p && seenAs(p.sku, order).sku === lineSku);
  if (!ordered?.size || onLine.length === 0) return { sku: lineSku, sizeRead: null, confidence: 0.3, box_2d: [380, 380, 620, 620] };
  const wrong = onLine.find((p) => p.size && p.size !== ordered.size);
  return { sku: lineSku, sizeRead: (wrong ?? onLine[0]).size ?? null, confidence: 0.96, box_2d: [380, 380, 620, 620] };
}

/** Order-insensitive fingerprint of the box, to tell whether it changed since the last check. */
export const boxSignature = (units: BoxUnit[]) =>
  units
    .map((u) => u.sku)
    .sort()
    .join(',');
