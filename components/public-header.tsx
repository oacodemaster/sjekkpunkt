import Link from 'next/link';
import { LanguageSwitcher } from '@/components/language-switcher';
import type { Lang } from '@/lib/engine/types';
import { t } from '@/lib/i18n/strings';

/** Top bar of the public pages: the guide, the practice demo and the start page. */
export function PublicHeader({
  lang,
  languages,
  current,
  onLangChange,
}: {
  lang: Lang;
  languages?: readonly Lang[];
  current?: 'guide' | 'play';
  onLangChange?: (l: Lang) => void;
}) {
  const demo = process.env.NEXT_PUBLIC_DEMO_ENABLED === 'true';
  const link = (href: string, label: string, here: boolean) => (
    <Link
      href={href}
      aria-current={here ? 'page' : undefined}
      className={`whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-semibold ${here ? 'bg-white text-frame' : 'text-slate-200 hover:bg-white/10'}`}
    >
      {label}
    </Link>
  );
  return (
    <header className="sticky top-0 z-20 border-b border-white/10 bg-frame/95 text-white backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-2 gap-y-2 px-4 py-2.5">
        <Link href="/" className="mr-auto text-lg font-bold tracking-tight">
          Sjekkpunkt
        </Link>
        <nav className="flex items-center gap-1" aria-label="Sjekkpunkt">
          {link('/guide', t('howItWorks', lang), current === 'guide')}
          {demo && link('/play', t('playTitle', lang), current === 'play')}
        </nav>
        <LanguageSwitcher lang={lang} languages={languages} tone="dark" onChange={onLangChange} />
      </div>
    </header>
  );
}
