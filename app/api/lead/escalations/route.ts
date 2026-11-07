import { NextResponse } from 'next/server';
import { fail, LEAD_ROLES } from '@/lib/api/http';
import { authorize } from '@/lib/auth/dal';
import { loadOpenCards } from '@/lib/lead/server';

/** Open escalations with photos, model output, worker notes and what the engine proposes. */
export async function GET() {
  const auth = await authorize(LEAD_ROLES);
  if (!auth.ok) return fail(auth.status === 401 ? 'unauthenticated' : 'forbidden', auth.status);
  const open = await loadOpenCards(auth.user.warehouseId);
  return NextResponse.json({ open }, { headers: { 'cache-control': 'no-store' } });
}
