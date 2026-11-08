import Link from 'next/link';
import { LanguageSwitcher } from '@/components/language-switcher';
import { Wordmark } from '@/components/ui';
import type { Lang } from '@/lib/engine/types';
import { t } from '@/lib/i18n/strings';

/** Top bar of the public pages (the guide and the practice demo): mark, two links, language. */
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
  return (
    <header className="sp-pub-header">
      <div className="sp-pub-header__in">
        <Wordmark surface="light" size={28} nameSize={19} className="mr-auto min-h-12" />
        <nav className="sp-pub-nav" aria-label="Sjekkpunkt">
          <Link href="/guide" aria-current={current === 'guide' ? 'page' : undefined}>
            {t('howItWorks', lang)}
          </Link>
          {demo && (
            <Link href="/play" aria-current={current === 'play' ? 'page' : undefined}>
              {t('playTitle', lang)}
            </Link>
          )}
        </nav>
        <LanguageSwitcher lang={lang} languages={languages} onChange={onLangChange} />
      </div>
    </header>
  );
}
