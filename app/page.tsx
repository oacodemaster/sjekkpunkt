import Link from 'next/link';
import { redirect } from 'next/navigation';
import { HeroVideo } from '@/components/hero-video';
import { LanguageSwitcher } from '@/components/language-switcher';
import { ButtonLink, Wordmark } from '@/components/ui';
import { getCurrentUser, HOME } from '@/lib/auth/dal';
import { requestLang } from '@/lib/i18n/server';
import { t, type StringKey } from '@/lib/i18n/strings';
import { imageOf, PLAY_PARCELS } from '@/lib/play/catalog';

export default async function Home() {
  const user = await getCurrentUser();
  if (user) redirect(HOME[user.role]);
  const demo = process.env.NEXT_PUBLIC_DEMO_ENABLED === 'true';
  // The visitor's language (?lang=, the sp_lang cookie, the browser); English stays underneath
  // as on the design system's front page, unless the page already is English.
  const lang = await requestLang();

  return (
    <div className="fp sp-dark" lang={lang}>
      <header className="fp-top">
        <Wordmark surface="dark" size={40} nameSize={28} />
        <LanguageSwitcher lang={lang} />
      </header>
      <main className="fp-main">
        <div>
          <h1 className="fp-h1">{t('tagline', lang)}</h1>
          {lang !== 'en' && (
            <p className="fp-en" lang="en">
              {t('tagline', 'en')}
            </p>
          )}
          <p className="fp-how">{t('frontHow', lang)}</p>
          <div className="fp-actions">
            {demo ? (
              <>
                <ButtonLink href="/play" variant="brand" iconAfter="arrow-right" testId="start-play">
                  {t('playTitle', lang)}
                </ButtonLink>
                <ButtonLink href="/login" variant="on-dark">
                  {t('signIn', lang)}
                </ButtonLink>
              </>
            ) : (
              <ButtonLink href="/login" variant="brand" iconAfter="arrow-right">
                {t('signIn', lang)}
              </ButtonLink>
            )}
            <ButtonLink href="/guide" variant="on-dark">
              {t('howItWorks', lang)}
            </ButtonLink>
          </div>
          {demo && (
            <section className="fp-try" aria-labelledby="fp-try">
              <p className="fp-try__label" id="fp-try">
                {t('tryNoLogin', lang)}
              </p>
              <ul className="fp-try__list">
                {PLAY_PARCELS.map((p) => (
                  <li key={p.order.id}>
                    <Link href={`/play?parcel=${p.order.id}`} className="fp-try__item" data-testid="try-parcel">
                      {/* eslint-disable-next-line @next/next/no-img-element -- a 512px sample photo from public/sample */}
                      <img src={imageOf(p.order.lines[0].sku)} alt="" width={80} height={80} />
                      <span>{t(`lesson_${p.lesson}` as StringKey, lang)}</span>
                      <span className="fp-try__n">#{p.order.id}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <p className="m-0 flex flex-wrap gap-x-6">
            {demo && (
              <Link className="fp-privacy" href="/demo">
                {t('scriptedDemo', lang)}
              </Link>
            )}
            <Link className="fp-privacy" href={`/privacy?lang=${lang}`}>
              {t('privacy', lang)}
            </Link>
          </p>
        </div>

        <figure className="fp-figure">
          <HeroVideo label={t('heroVideo', lang)} />
        </figure>
      </main>
      <footer className="fp-foot">
        <span>Varer, ikke folk. Ingen statistikk per ansatt.</span>
        <span lang="en">Items, not people.</span>
      </footer>
    </div>
  );
}
