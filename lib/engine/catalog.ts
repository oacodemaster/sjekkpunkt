import { sizeRank } from './constants';
import type { Product } from './types';

export function productMap(products: Product[]): Map<string, Product> {
  return new Map(products.map((p) => [p.sku, p]));
}

export function sortedPair(a: string, b: string): [string, string] {
  return a <= b ? [a, b] : [b, a];
}

export function pairKey(pair: [string, string]): string {
  return `${pair[0]}|${pair[1]}`;
}

/** True when the product's variant group contains another size: the size label matters. */
export function isSizeVariant(p: Product, products: Product[]): boolean {
  if (!p.variantGroup || !p.size) return false;
  return products.some(
    (o) => o.sku !== p.sku && o.variantGroup === p.variantGroup && o.size && o.size !== p.size,
  );
}

/** Same variant group, same colour, given size. Used to resolve a label read like "M". */
export function siblingBySize(p: Product, size: string, products: Product[]): Product | undefined {
  if (p.size?.toUpperCase() === size.toUpperCase()) return p;
  return products.find(
    (o) =>
      o.variantGroup !== undefined &&
      o.variantGroup === p.variantGroup &&
      o.color === p.color &&
      o.size?.toUpperCase() === size.toUpperCase(),
  );
}

function baseName(p: Product): string {
  return p.nameNb.split(',')[0].trim();
}

/** "Skalljakke M/L", "Hettegenser marineblå/sort", or "A / B" for unrelated products. */
export function pairLabelNb(pair: [string, string], products: Product[]): string {
  const m = productMap(products);
  const a = m.get(pair[0]);
  const b = m.get(pair[1]);
  if (!a || !b) return `${pair[0]} / ${pair[1]}`;
  if (baseName(a) === baseName(b)) {
    if (a.size && b.size && a.size !== b.size) {
      const [s1, s2] = [a.size, b.size].sort((x, y) => sizeRank(x) - sizeRank(y));
      return `${baseName(a)} ${s1}/${s2}`;
    }
    const colorA = a.nameNb.split(',')[1]?.trim() ?? a.color;
    const colorB = b.nameNb.split(',')[1]?.trim() ?? b.color;
    return `${baseName(a)} ${colorA}/${colorB}`;
  }
  return `${a.nameNb} / ${b.nameNb}`;
}
