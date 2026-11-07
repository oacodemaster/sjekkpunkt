import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ImportIssue, ImportPlan } from './csv';

/** Database checks for a valid file, reported by line like the file checks. */
export async function checkAgainstDb(db: SupabaseClient, warehouseId: string, plan: ImportPlan): Promise<ImportIssue[]> {
  const issues: ImportIssue[] = [];

  if (plan.kind === 'products') {
    const codes = [...new Set(plan.products.map((p) => p.location_code))];
    const barcodes = plan.products.map((p) => p.barcode).filter((b): b is string => !!b);
    const [{ data: locs }, { data: taken }] = await Promise.all([
      db.from('locations').select('code, kind').in('code', codes),
      barcodes.length ? db.from('products').select('sku, barcode').in('barcode', barcodes) : Promise.resolve({ data: [] as { sku: string; barcode: string }[] }),
    ]);
    const kind = new Map((locs ?? []).map((l) => [l.code as string, l.kind as string]));
    const owner = new Map((taken ?? []).map((t) => [t.barcode as string, t.sku as string]));
    const inFile = new Map<string, string>();
    for (const p of plan.products) {
      const k = kind.get(p.location_code);
      if (k && k !== 'stock') issues.push({ line: p.line, column: 'location_code', code: 'not_stock_location' });
      if (p.barcode) {
        const o = owner.get(p.barcode);
        if ((o && o !== p.sku) || (inFile.has(p.barcode) && inFile.get(p.barcode) !== p.sku)) issues.push({ line: p.line, column: 'barcode', code: 'barcode_taken' });
        inFile.set(p.barcode, p.sku);
      }
    }
    return issues;
  }

  if (plan.kind === 'orders') {
    const skus = [...new Set(plan.orders.flatMap((o) => o.lines.map((l) => l.sku)))];
    const [{ data: prods }, { data: existing }] = await Promise.all([
      db.from('products').select('sku').eq('warehouse_id', warehouseId).in('sku', skus),
      db.from('orders').select('ext_id').in('ext_id', plan.orders.map((o) => o.ext_id)),
    ]);
    const known = new Set((prods ?? []).map((p) => p.sku as string));
    const taken = new Set((existing ?? []).map((o) => o.ext_id as string));
    for (const o of plan.orders) {
      if (taken.has(o.ext_id)) issues.push({ line: o.line, column: 'order', code: 'order_exists' });
      for (const l of o.lines) if (!known.has(l.sku)) issues.push({ line: l.line, column: 'sku', code: 'unknown_sku' });
    }
    return issues;
  }

  const orderIds = [...new Set(plan.returns.map((r) => r.order_ext_id))];
  const [{ data: orders }, { data: existing }] = await Promise.all([
    db.from('orders').select('ext_id, order_lines(sku)').eq('warehouse_id', warehouseId).in('ext_id', orderIds),
    db.from('returns').select('ext_id').in('ext_id', plan.returns.map((r) => r.ext_id)),
  ]);
  const lines = new Map((orders ?? []).map((o) => [o.ext_id as string, new Set(((o.order_lines ?? []) as { sku: string }[]).map((l) => l.sku))]));
  const taken = new Set((existing ?? []).map((r) => r.ext_id as string));
  for (const r of plan.returns) {
    if (taken.has(r.ext_id)) issues.push({ line: r.line, column: 'return', code: 'return_exists' });
    const skus = lines.get(r.order_ext_id);
    if (!skus) issues.push({ line: r.line, column: 'order', code: 'unknown_order' });
    else for (const it of r.items) if (!skus.has(it.sku)) issues.push({ line: it.line, column: 'sku', code: 'sku_not_in_order' });
  }
  return issues;
}

/** What a dry run reports: how many rows of each kind would be written. */
export function planSummary(plan: ImportPlan): { entities: number; lines: number } {
  if (plan.kind === 'products') return { entities: plan.products.length, lines: plan.products.length };
  if (plan.kind === 'orders') return { entities: plan.orders.length, lines: plan.orders.reduce((n, o) => n + o.lines.length, 0) };
  return { entities: plan.returns.length, lines: plan.returns.reduce((n, r) => n + r.items.length, 0) };
}
