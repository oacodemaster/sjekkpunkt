import 'server-only';
import { cache } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { Lang } from '@/lib/engine/types';
import { createClient } from '@/lib/supabase/server';

export type AppRole = 'packer' | 'returns' | 'lead' | 'admin';

export interface CurrentUser {
  userId: string;
  email: string | null;
  role: AppRole;
  lang: Lang;
  displayName: string | null;
  warehouseId: string;
  privacyInfoReadAt: string | null;
}

export const DEVICE_COOKIE = 'sp_device';

/** Where each role lands after login. */
export const HOME: Record<AppRole, string> = {
  packer: '/pack',
  returns: '/return',
  lead: '/lead',
  admin: '/admin',
};

/** Verified user + profile, once per request. Returns null when signed out or without a profile. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, preferred_lang, display_name, warehouse_id, privacy_info_read_at')
    .eq('user_id', claims.sub)
    .maybeSingle();
  if (!profile) return null;

  return {
    userId: claims.sub,
    email: (claims.email as string | undefined) ?? null,
    role: profile.role as AppRole,
    lang: profile.preferred_lang as Lang,
    displayName: profile.display_name,
    warehouseId: profile.warehouse_id,
    privacyInfoReadAt: profile.privacy_info_read_at,
  };
});

/** For pages and layouts: redirect when signed out or when the role is not allowed. */
export async function requireRole(roles: AppRole[]): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (!roles.includes(user.role)) redirect(HOME[user.role]);
  return user;
}

/** For route handlers: a typed result instead of a redirect. */
export async function authorize(
  roles: AppRole[],
): Promise<{ ok: true; user: CurrentUser } | { ok: false; status: 401 | 403 }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, status: 401 };
  if (!roles.includes(user.role)) return { ok: false, status: 403 };
  return { ok: true, user };
}

export async function getDeviceLabel(): Promise<string | null> {
  return (await cookies()).get(DEVICE_COOKIE)?.value ?? null;
}
