import 'server-only';
import { NextResponse } from 'next/server';
import type { z } from 'zod';
import { authorize, getDeviceLabel, type AppRole, type CurrentUser } from '@/lib/auth/dal';
import { createAdminClient } from '@/lib/supabase/admin';

export function fail(error: string, status = 400, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ error, ...extra }, { status });
}

/** Role check + zod body parse. Unknown fields are dropped by the schema, never trusted. */
export async function guard<S extends z.ZodType>(
  req: Request,
  roles: AppRole[],
  schema: S,
): Promise<{ ok: true; user: CurrentUser; body: z.output<S> } | { ok: false; res: NextResponse }> {
  const auth = await authorize(roles);
  if (!auth.ok) return { ok: false, res: fail(auth.status === 401 ? 'unauthenticated' : 'forbidden', auth.status) };
  let raw: unknown = {};
  try {
    const text = await req.text();
    raw = text ? JSON.parse(text) : {};
  } catch {
    return { ok: false, res: fail('invalid_json') };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return { ok: false, res: fail('invalid_body', 400, { issues: parsed.error.issues.map((i) => i.path.join('.')) }) };
  return { ok: true, user: auth.user, body: parsed.data };
}

/** The device row for the handheld's label cookie (audit actor is the device, not the person). */
export async function currentDeviceId(warehouseId: string): Promise<string | null> {
  const label = await getDeviceLabel();
  if (!label) return null;
  const { data } = await createAdminClient()
    .from('devices')
    .select('id')
    .eq('warehouse_id', warehouseId)
    .eq('label', label)
    .maybeSingle();
  return data?.id ?? null;
}

export const RETURN_ROLES: AppRole[] = ['returns', 'lead', 'admin'];
export const PACK_ROLES: AppRole[] = ['packer', 'lead', 'admin'];
export const LEAD_ROLES: AppRole[] = ['lead', 'admin'];

/** Maps a raised SQL exception (`raise exception 'already_resolved'`) to its code, or null. */
export function sqlError(message: string | undefined, codes: string[]): string | null {
  return codes.find((c) => message?.includes(c)) ?? null;
}
