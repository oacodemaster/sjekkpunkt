'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { Lang } from '@/lib/engine/types';
import { switchLanguage } from '@/lib/i18n/actions';
import { LANG_NAMES, LANGS, t } from '@/lib/i18n/strings';

/**
 * One switcher everywhere: the handheld header, the front page, the guide and the practice demo.
 * It looks like the design system's language chip (the two-letter code in mono, 56px hit area);
 * a native select lies over it, so a handheld opens its own big picker. The choice is stored on
 * the device (cookie) and, when signed in, as the worker's language; then the page re-renders.
 * On a dark page (`.sp-dark`) the chip turns light by itself.
 */
export function LanguageSwitcher({
  lang,
  languages = LANGS,
  onChange,
}: {
  lang: Lang;
  languages?: readonly Lang[];
  /** told at once, before the server answers (a station switches its screen without waiting) */
  onChange?: (l: Lang) => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  if (languages.length < 2) return null;

  return (
    <span className="sp-hit sp-langpick" title={LANG_NAMES[lang]} aria-busy={pending || undefined}>
      <span className="sp-lang" aria-hidden>
        {lang.toUpperCase()}
      </span>
      <select
        value={lang}
        disabled={pending}
        aria-label={t('language', lang)}
        onChange={(e) => {
          const next = e.target.value as Lang;
          onChange?.(next);
          start(async () => {
            await switchLanguage(next);
            router.refresh();
          });
        }}
        data-testid="language-switcher"
      >
        {languages.map((l) => (
          <option key={l} value={l} lang={l}>
            {LANG_NAMES[l]}
          </option>
        ))}
      </select>
    </span>
  );
}
