'use server';

import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { clientIp, limitQuickSignIn } from '@/lib/limits/server';
import { DEVICE_COOKIE, HOME, type AppRole } from './dal';
import { QUICK_DEVICE, QUICK_ROLES, SEED_USERS } from './demo-users';

export interface SignInState {
  error?: string;
}

const SignIn = z.object({
  email: z.email(),
  password: z.string().min(1),
  next: z.string().optional(),
});

/** Only same-site relative paths, never protocol-relative or absolute URLs. */
function safeNext(next: string | undefined): string | null {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return null;
  return next;
}

export async function signIn(_prev: SignInState, formData: FormData): Promise<SignInState> {
  const parsed = SignIn.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
    next: formData.get('next') || undefined,
  });
  if (!parsed.success) return { error: 'invalid' };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });
  if (error || !data.user) return { error: 'invalid' };

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('user_id', data.user.id)
    .maybeSingle();
  if (!profile) {
    await supabase.auth.signOut();
    return { error: 'noProfile' };
  }

  const role = profile.role as AppRole;
  const target = safeNext(parsed.data.next) ?? HOME[role];
  const hasDevice = !!(await cookies()).get(DEVICE_COOKIE)?.value;
  if (!hasDevice && (role === 'packer' || role === 'returns')) {
    redirect(`/device?next=${encodeURIComponent(target)}`);
  }
  redirect(target);
}

const QuickSignIn = z.object({ role: z.enum(QUICK_ROLES), next: z.string().optional() });

/**
 * One-tap demo sign-in (DEMO_ENABLED=true only): signs in as the role's test user with the
 * password from the server's environment, so the visitor never types one. Packer, returns and
 * lead only, never admin. Next.js checks that a server action comes from this site's own pages
 * (Origin against Host); on top of that it is rate limited per visitor and in total.
 */
export async function quickSignIn(_prev: SignInState, formData: FormData): Promise<SignInState> {
  if (process.env.DEMO_ENABLED !== 'true') return { error: 'quickOff' };
  const parsed = QuickSignIn.safeParse({ role: formData.get('role'), next: formData.get('next') || undefined });
  if (!parsed.success) return { error: 'quickOff' };
  const { role } = parsed.data;
  const user = SEED_USERS.find((u) => u.role === role)!;
  const password = process.env[`SEED_PASSWORD_${role.toUpperCase()}`];
  if (!password) return { error: 'quickOff' };

  const limit = await limitQuickSignIn(clientIp(await headers()));
  if (!limit.ok) return { error: 'quickBusy' };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email: user.email, password });
  if (error) {
    console.error('[auth] quick sign-in failed:', role, error.message);
    return { error: 'quickOff' };
  }

  const jar = await cookies();
  const device = QUICK_DEVICE[role];
  if (device && !jar.get(DEVICE_COOKIE)?.value) {
    jar.set(DEVICE_COOKIE, device, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 60 * 60 * 24 * 365, path: '/' });
  }
  redirect(safeNext(parsed.data.next) ?? HOME[role]);
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/login');
}

const DeviceForm = z.object({ label: z.string().min(1).max(64), next: z.string().optional() });

export async function setDevice(formData: FormData) {
  const parsed = DeviceForm.safeParse({ label: formData.get('label'), next: formData.get('next') || undefined });
  if (!parsed.success) redirect('/device');

  const supabase = await createClient();
  const { data: device } = await supabase.from('devices').select('label').eq('label', parsed.data.label).maybeSingle();
  if (!device) redirect('/device');

  (await cookies()).set(DEVICE_COOKIE, device.label, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 60 * 24 * 365,
    path: '/',
  });
  redirect(safeNext(parsed.data.next) ?? '/');
}
