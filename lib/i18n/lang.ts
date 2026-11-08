// Which language a page speaks. Pure, so the server helpers, the switcher and tests share it.
// Order: ?lang=, the signed-in worker's preferred_lang (the switcher writes it, and it must beat a
// cookie left on a shared handheld by the previous worker), the switcher's cookie (visitors),
// the browser's Accept-Language, then Norwegian.

import type { Lang } from '@/lib/engine/types';

export const LANG_COOKIE = 'sp_lang';
/** A year: the choice belongs to the device, like the device label. */
export const LANG_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

const ALL: readonly Lang[] = ['nb', 'en', 'pl', 'uk', 'ro', 'lt'];
export const isLang = (v: unknown): v is Lang => typeof v === 'string' && (ALL as readonly string[]).includes(v);

/** Norwegian browsers send no, nn or nb; all three get Bokmål. */
const ALIAS: Record<string, Lang> = { no: 'nb', nn: 'nb', nb: 'nb' };

/** The best match from an Accept-Language header, by q-value, among `allowed`. */
export function fromAcceptLanguage(header: string | null | undefined, allowed: readonly Lang[]): Lang | null {
  if (!header) return null;
  const ranked = header
    .split(',')
    .map((part) => {
      const [tag, ...params] = part.trim().split(';');
      const q = params.map((p) => p.trim()).find((p) => p.startsWith('q='));
      return { base: tag.trim().toLowerCase().split('-')[0], q: q ? Number(q.slice(2)) || 0 : 1 };
    })
    .filter((x) => x.base && x.q > 0)
    .sort((a, b) => b.q - a.q);
  for (const { base } of ranked) {
    const l = ALIAS[base] ?? (isLang(base) ? base : null);
    if (l && allowed.includes(l)) return l;
  }
  return null;
}

export function pickLang(
  allowed: readonly Lang[],
  { asked, cookie, profile, acceptLanguage }: { asked?: unknown; cookie?: unknown; profile?: Lang | null; acceptLanguage?: string | null },
): Lang {
  for (const c of [asked, profile, cookie]) if (isLang(c) && allowed.includes(c)) return c;
  return fromAcceptLanguage(acceptLanguage, allowed) ?? (allowed.includes('nb') ? 'nb' : allowed[0] ?? 'nb');
}
