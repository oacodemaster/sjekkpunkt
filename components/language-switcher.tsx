'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { Lang } from '@/lib/engine/types';
import { switchLanguage } from '@/lib/i18n/actions';
import { LANG_NAMES, LANGS, t } from '@/lib/i18n/strings';

/**
 * One switcher everywhere: the handheld header, the start page, the guide and the practice demo.
 * A native select, so a handheld opens its own big picker. The choice is stored on the device
 * (cookie) and, when signed in, as the worker's language; then the page re-renders in it.
 */
export function LanguageSwitcher({
  lang,
  languages = LANGS,
  tone = 'light',
  onChange,
}: {
  lang: Lang;
  languages?: readonly Lang[];
  tone?: 'light' | 'dark';
  /** told at once, before the server answers (a station switches its screen without waiting) */
  onChange?: (l: Lang) => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  if (languages.length < 2) return null;

  return (
    <label className="relative inline-flex items-center" title={t('language', lang)}>
      <span className="sr-only">{t('language', lang)}</span>
      <span aria-hidden className={`pointer-events-none absolute left-3 text-sm ${tone === 'dark' ? 'text-slate-300' : 'text-slate-500'}`}>
        🌐
      </span>
      <select
        value={lang}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.value as Lang;
          onChange?.(next);
          start(async () => {
            await switchLanguage(next);
            router.refresh();
          });
        }}
        className={`min-h-9 appearance-none rounded-full py-1 pl-8 pr-3 text-sm font-semibold ${
          tone === 'dark' ? 'bg-white/10 text-white ring-1 ring-white/20' : 'bg-slate-100 text-slate-900'
        } ${pending ? 'opacity-60' : ''}`}
        data-testid="language-switcher"
      >
        {languages.map((l) => (
          <option key={l} value={l} lang={l} className="text-slate-900">
            {LANG_NAMES[l]}
          </option>
        ))}
      </select>
    </label>
  );
}
