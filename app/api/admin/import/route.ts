import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { ADMIN_ROLES, fail, guard } from '@/lib/api/http';
import { checkImport } from '@/lib/admin/csv';
import { checkAgainstDb, planSummary } from '@/lib/admin/import-server';
import { IMPORT_KINDS } from '@/lib/admin/schemas';
import { createAdminClient } from '@/lib/supabase/admin';

const Body = z.object({
  kind: z.enum(IMPORT_KINDS),
  csv: z.string().min(1).max(1_000_000),
  dryRun: z.boolean().default(true),
  fileName: z.string().trim().max(200).optional(),
});

/**
 * CSV import of products, orders or returns (addendum section 6). Every row is checked first —
 * the file (columns, types, grouping) and then the database (unknown SKUs, existing orders) —
 * and problems come back by line. Nothing is written unless the whole file passes; then the
 * SQL function writes it in one transaction with one audit row. `dryRun` (the default) only checks.
 */
export async function POST(req: NextRequest) {
  const g = await guard(req, ADMIN_ROLES, Body);
  if (!g.ok) return g.res;
  const { user, body } = g;

  const check = checkImport(body.kind, body.csv);
  if (!check.plan) return NextResponse.json({ ok: false, error: 'invalid_rows', rows: check.rows, issues: check.issues }, { status: 422 });

  const db = createAdminClient();
  const dbIssues = await checkAgainstDb(db, user.warehouseId, check.plan);
  if (dbIssues.length) return NextResponse.json({ ok: false, error: 'invalid_rows', rows: check.rows, issues: dbIssues }, { status: 422 });

  const summary = planSummary(check.plan);
  if (body.dryRun) return NextResponse.json({ ok: true, dryRun: true, rows: check.rows, ...summary });

  const { data, error } = await db.rpc('admin_import', {
    p: { warehouse_id: user.warehouseId, user_id: user.userId, kind: body.kind, plan: check.plan, file_name: body.fileName ?? null },
  });
  if (error) {
    const m = error.message.match(/^(order_exists|return_exists|unknown_sku|unknown_order|sku_not_in_order|barcode_taken|not_stock_location|sku_taken)(?::\s*(.*))?/);
    if (m) return NextResponse.json({ ok: false, error: m[1], ref: m[2] ?? null }, { status: 409 });
    console.error('[admin] import failed:', error.message);
    return fail('failed', 500);
  }
  return NextResponse.json({ ok: true, dryRun: false, rows: check.rows, ...(data as object) });
}
