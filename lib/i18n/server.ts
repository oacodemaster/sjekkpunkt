import 'server-only';
import { cookies, headers } from 'next/headers';
import { getCurrentUser } from '@/lib/auth/dal';
import type { Lang } from '@/lib/engine/types';
import { LANG_COOKIE, pickLang } from './lang';
import { LANGS } from './strings';

/**
 * The language for this request among `allowed`: ?lang=, the signed-in user's preferred_lang, the
 * switcher's cookie, Accept-Language, then Norwegian (lib/i18n/lang.ts).
 */
export async function requestLang(allowed: readonly Lang[] = LANGS, asked?: unknown): Promise<Lang> {
  const [jar, h, user] = await Promise.all([cookies(), headers(), getCurrentUser()]);
  return pickLang(allowed, { asked, cookie: jar.get(LANG_COOKIE)?.value, profile: user?.lang ?? null, acceptLanguage: h.get('accept-language') });
}
