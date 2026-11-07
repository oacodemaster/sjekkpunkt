import { NextResponse } from 'next/server';
import { ADMIN_ROLES, fail } from '@/lib/api/http';
import { runRetention } from '@/lib/admin/retention';
import { authorize } from '@/lib/auth/dal';

/** "Slett utløpte bilder nå": the same job as the daily cron, for the admin's warehouse. */
export async function POST() {
  const auth = await authorize(ADMIN_ROLES);
  if (!auth.ok) return fail(auth.status === 401 ? 'unauthenticated' : 'forbidden', auth.status);
  try {
    const [r] = await runRetention({ trigger: 'admin', warehouseId: auth.user.warehouseId, userId: auth.user.userId });
    return NextResponse.json({ ok: true, deleted: r?.deleted ?? 0, failed: r?.failed ?? 0 });
  } catch (e) {
    console.error('[admin] retention failed:', e instanceof Error ? e.message : e);
    return fail('failed', 500);
  }
}
