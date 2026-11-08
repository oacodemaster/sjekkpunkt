'use server';

import { cookies } from 'next/headers';
import { getCurrentUser } from '@/lib/auth/dal';
import { enabledLanguages } from '@/lib/privacy/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isLang, LANG_COOKIE, LANG_COOKIE_MAX_AGE } from './lang';

/**
 * The language switcher (header, start page, guide, practice demo). Remembered on the device in a
 * cookie; for a signed-in user it is also their preferred_lang, so the voice coach and the
 * stations start in it. A worker can only pick a language the admin has enabled.
 * Only the caller's own profile row is written.
 */
export async function switchLanguage(lang: unknown): Promise<{ ok: boolean }> {
  if (!isLang(lang)) return { ok: false };
  const user = await getCurrentUser();
  if (user) {
    const enabled = await enabledLanguages(user.warehouseId);
    if (!enabled.includes(lang)) return { ok: false };
    const { error } = await createAdminClient().from('profiles').update({ preferred_lang: lang }).eq('user_id', user.userId);
    if (error) {
      console.error('[i18n] profile language:', error.message);
      return { ok: false };
    }
  }
  (await cookies()).set(LANG_COOKIE, lang, { path: '/', maxAge: LANG_COOKIE_MAX_AGE, sameSite: 'lax', httpOnly: true, secure: process.env.NODE_ENV === 'production' });
  return { ok: true };
}
