import Link from 'next/link';
import { getCurrentUser, HOME } from '@/lib/auth/dal';
import type { Lang } from '@/lib/engine/types';
import { PRIVACY } from '@/lib/i18n/privacy-strings';
import { LANG_NAMES } from '@/lib/i18n/strings';
import { acknowledgePrivacy } from '@/lib/privacy/actions';
import { privacySettings } from '@/lib/privacy/server';

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
  const asked = typeof sp.lang === 'string' ? (sp.lang as Lang) : null;
  const lang: Lang = asked && languages.includes(asked) ? asked : user && languages.includes(user.lang) ? user.lang : 'nb';
  const text = PRIVACY[lang];
  const fill = (s: string) => s.replace('{days}', String(retentionDays));
  const first = sp.first === '1' && !!user && !user.privacyInfoReadAt;
  const readOn = user?.privacyInfoReadAt
    ? text.readOn.replace('{date}', new Date(user.privacyInfoReadAt).toLocaleDateString(lang === 'en' ? 'en-GB' : lang === 'nb' ? 'nb-NO' : lang, { timeZone: 'Europe/Oslo' }))
    : null;

  const section = (title: string, items: string[], testId: string) => (
    <section data-testid={testId}>
      <h2 className="text-xl font-semibold">{title}</h2>
      <ul className="mt-2 list-disc space-y-1.5 pl-6">
        {items.map((i) => (
          <li key={i}>{fill(i)}</li>
        ))}
      </ul>
    </section>
  );

  return (
    <main className="flex flex-1 justify-center bg-frame sm:py-6" lang={lang}>
      <div className="flex w-full max-w-md flex-col gap-5 bg-white p-6 text-lg sm:rounded-[2rem] sm:shadow-2xl">
        {!first && (
          <nav className="flex flex-wrap gap-1.5 text-sm" aria-label="Språk · Language">
            {languages.map((l) => (
              <Link
                key={l}
                href={`/privacy?lang=${l}`}
                lang={l}
                aria-current={l === lang ? 'page' : undefined}
                className={`rounded-full px-3 py-1 ${l === lang ? 'bg-frame text-white' : 'bg-slate-100'}`}
              >
                {LANG_NAMES[l]}
              </Link>
            ))}
          </nav>
        )}
        <h1 className="text-3xl font-bold leading-tight">{text.title}</h1>
        <p>{text.intro}</p>
        {section(text.capturedTitle, text.captured, 'privacy-captured')}
        {section(text.notTitle, text.not, 'privacy-not')}
        {section(text.keptTitle, text.kept, 'privacy-kept')}
        {section(text.askTitle, text.ask, 'privacy-ask')}
        <p className="rounded-xl bg-slate-100 p-3 font-semibold">{text.tapsOnly}</p>

        {user && !user.privacyInfoReadAt ? (
          <form action={acknowledgePrivacy}>
            <button className="btn-primary w-full">{text.readButton}</button>
          </form>
        ) : (
          <div className="flex items-center justify-between gap-3">
            {readOn && <span className="text-base text-muted">{readOn}</span>}
            <Link href={user ? HOME[user.role] : '/'} className="text-accent underline">
              {text.back}
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}
