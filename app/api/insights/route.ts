import { NextResponse } from 'next/server';
import { fail, LEAD_ROLES } from '@/lib/api/http';
import { authorize } from '@/lib/auth/dal';
import { loadInsights } from '@/lib/data/insights';
import { rangeSchema } from '@/lib/insights/compute';
import { createClient } from '@/lib/supabase/server';

/** Aggregates from the anonymous insights views (addendum section 6). Never per worker. */
export async function GET(req: Request) {
  const auth = await authorize(LEAD_ROLES);
  if (!auth.ok) return fail(auth.status === 401 ? 'unauthenticated' : 'forbidden', auth.status);
  const range = rangeSchema.safeParse(new URL(req.url).searchParams.get('range') ?? '7d');
  if (!range.success) return fail('invalid_range');
  const report = await loadInsights(await createClient(), auth.user.warehouseId, range.data);
  return NextResponse.json(report, { headers: { 'cache-control': 'no-store' } });
}
