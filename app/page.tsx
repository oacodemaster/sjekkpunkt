import type { Metadata } from 'next';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { LandingPage } from '@/components/landing/landing-page';
import { getCurrentUser, HOME } from '@/lib/auth/dal';
import { fromAcceptLanguage, isLang, LANG_COOKIE } from '@/lib/i18n/lang';
import { LANGS } from '@/lib/i18n/strings';
import { landingMetadata } from '@/lib/landing/metadata';

export const metadata: Metadata = landingMetadata('nb');

/**
 * The landing page in Norwegian (docs/landing-page-brief.md). A signed-in user goes to their
 * station, as before. A visitor whose language (the switcher's cookie, else the browser) is one
 * of the app's other languages gets the English page at /en: the buyer reads nb or en
 * (docs/decisions.md). ?lang=nb, which the NB link uses, always stays here.
 */
export default async function Home({ searchParams }: PageProps<'/'>) {
  const user = await getCurrentUser();
  if (user) redirect(HOME[user.role]);
  const { lang } = await searchParams;
  if (lang !== 'nb') {
    const [jar, h] = await Promise.all([cookies(), headers()]);
    const cookie = jar.get(LANG_COOKIE)?.value;
    const wanted = isLang(lang) ? lang : isLang(cookie) ? cookie : fromAcceptLanguage(h.get('accept-language'), LANGS);
    if (wanted && wanted !== 'nb') redirect('/en');
  }
  return <LandingPage lang="nb" />;
}
