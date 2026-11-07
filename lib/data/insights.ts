import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { loadSettings, toProduct } from '@/lib/db/common';
import { computeInsights, insightsReportSchema, RANGES, type InsightsRange, type InsightsReport, type InsightsRows } from '@/lib/insights/compute';

const DAY = 24 * 60 * 60 * 1000;

/**
 * Insights for the lead console and `GET /api/insights`. Reads only the anonymous insights_*
 * views (plus the catalogue for names and the cost setting) with the caller's own client, so
 * RLS scopes every row to their warehouse and role.
 */
export async function loadInsights(supabase: SupabaseClient, warehouseId: string, range: InsightsRange, now = new Date()): Promise<InsightsReport> {
  const since = (days: number) => new Date(now.getTime() - days * DAY).toISOString();
  const rangeSince = since(RANGES[range]);
  const must = <T,>(label: string, r: { data: T[] | null; error: { message: string } | null }): T[] => {
    if (r.error) throw new Error(`insights: ${label}: ${r.error.message}`);
    return r.data ?? [];
  };

  const [confusion, alerts, packChecks, returns, decisions, products, settings] = await Promise.all([
    supabase.from('insights_confusion').select('sku_a, sku_b, kind, at').gt('at', since(30)),
    supabase.from('insights_alerts').select('sku_a, sku_b, origin, active').eq('active', true),
    supabase.from('insights_pack_checks').select('order_id, status, method, created_at').gt('created_at', rangeSince),
    supabase.from('insights_returns').select('ordered_sku, category, customer_reason_nb, registered_at').gt('registered_at', rangeSince),
    supabase.from('insights_decisions').select('grade, cause, item_value_nok, decided_at').gt('decided_at', rangeSince),
    supabase.from('products').select('*'),
    loadSettings(supabase, warehouseId),
  ]);

  const rows: InsightsRows = {
    confusion: must('confusion', confusion) as InsightsRows['confusion'],
    alerts: must('alerts', alerts) as InsightsRows['alerts'],
    packChecks: must('pack checks', packChecks) as InsightsRows['packChecks'],
    returns: must('returns', returns) as InsightsRows['returns'],
    decisions: must('decisions', decisions) as InsightsRows['decisions'],
    products: must('products', products).map(toProduct),
  };
  return insightsReportSchema.parse(computeInsights(rows, { range, now, wrongParcelCostNok: settings.wrongParcelCostNok }));
}
