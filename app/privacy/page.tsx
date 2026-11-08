import Link from 'next/link';
import { getCurrentUser, HOME } from '@/lib/auth/dal';
import type { Lang } from '@/lib/engine/types';
import { PRIVACY } from '@/lib/i18n/privacy-strings';
import { requestLang } from '@/lib/i18n/server';
import { LANG_NAMES } from '@/lib/i18n/strings';
import { acknowledgePrivacy } from '@/lib/privacy/actions';
import { privacySettings } from '@/lib/privacy/server';
import { Banner, Button, ButtonLink } from '@/components/ui';
import { SignedOutShell } from '@/components/ui/signed-out-shell';

/**
 * Worker information (addendum section 10) in every enabled language: what is captured, what is
 * not, how long photos are kept, who to ask. Shown on first launch (after the language picker)
 * and reachable from the handheld menu and the start page. The button acknowledges reading; it
 * is not consent.
 */
export default async function PrivacyPage({ searchParams }: PageProps<'/privacy'>) {
  const user = await getCurrentUser();
  const sp = await searchParams;
  const { languages, retentionDays } = await privacySettings(user?.warehouseId);
  // ?lang= from the chips here, else the switcher's choice, the worker's language, the browser's.
  const lang: Lang = await requestLang(languages, sp.lang);
  const text = PRIVACY[lang];
  const fill = (s: string) => s.replace('{days}', String(retentionDays));
  const first = sp.first === '1' && !!user && !user.privacyInfoReadAt;
  const readOn = user?.privacyInfoReadAt
    ? text.readOn.replace('{date}', new Date(user.privacyInfoReadAt).toLocaleDateString(lang === 'en' ? 'en-GB' : lang === 'nb' ? 'nb-NO' : lang, { timeZone: 'Europe/Oslo' }))
    : null;

  const section = (title: string, items: string[], testId: string) => (
    <section data-testid={testId} className="flex flex-col gap-2">
      <h2 className="m-0 text-[20px] font-bold leading-[26px]">{title}</h2>
      <ul className="type-body m-0 flex list-disc flex-col gap-1.5 pl-6">
        {items.map((i) => (
          <li key={i}>{fill(i)}</li>
        ))}
      </ul>
    </section>
  );

  return (
    <SignedOutShell wide lang={lang}>
      {!first && (
        <nav className="flex flex-wrap gap-2" aria-label="Språk · Language">
          {languages.map((l) => (
            <Link key={l} href={`/privacy?lang=${l}`} lang={l} aria-current={l === lang ? 'page' : undefined} className="sp-toggle min-h-target-handheld text-[16px]">
              {LANG_NAMES[l]}
            </Link>
          ))}
        </nav>
      )}
      <h1 className="type-title m-0">{text.title}</h1>
      <p className="type-body m-0">{text.intro}</p>
      {section(text.capturedTitle, text.captured, 'privacy-captured')}
      {section(text.notTitle, text.not, 'privacy-not')}
      {section(text.keptTitle, text.kept, 'privacy-kept')}
      {section(text.askTitle, text.ask, 'privacy-ask')}
      <Banner icon="mic">{text.tapsOnly}</Banner>

      {user && !user.privacyInfoReadAt ? (
        <form action={acknowledgePrivacy}>
          <Button type="submit" block icon="ok">
            {text.readButton}
          </Button>
        </form>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3">
          {readOn && <span className="text-[16px] text-ink-2">{readOn}</span>}
          <ButtonLink href={user ? HOME[user.role] : '/'} variant="quiet">
            {text.back}
          </ButtonLink>
        </div>
      )}
    </SignedOutShell>
  );
}
