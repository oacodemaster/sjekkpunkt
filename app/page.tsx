import Link from 'next/link';
import { redirect } from 'next/navigation';
import { LanguageSwitcher } from '@/components/language-switcher';
import { ButtonLink, Wordmark } from '@/components/ui';
import { getCurrentUser, HOME } from '@/lib/auth/dal';
import { requestLang } from '@/lib/i18n/server';
import { t, type StringKey } from '@/lib/i18n/strings';
import { imageOf, PLAY_PARCELS } from '@/lib/play/catalog';

// The loop (design system «Forside»): packing, evidence photo, return, the mix-up counted per SKU
// pair, a label photo required at packing, and back. One lime highlight goes round per dur-loop.
const LOOP = [
  { nb: 'Pakking', en: 'Packing', x: 270, y: 55, delay: 0 },
  { nb: 'Bevisfoto', en: 'Evidence photo', x: 474, y: 204, delay: -7.2 },
  { nb: 'Retur', en: 'Return', x: 396, y: 444, delay: -5.4 },
  { nb: 'Forveksling telt per varepar', en: 'Mix-up counted per SKU pair', x: 144, y: 444, delay: -3.6 },
  { nb: 'Etikettfoto kreves ved pakking', en: 'Label photo required at packing', x: 66, y: 204, delay: -1.8 },
];
const CHEVRONS = [
  [396.4, 96.1, 36],
  [474.5, 336.4, 108],
  [270, 485, 180],
  [65.5, 336.4, 252],
  [143.6, 96.1, 324],
];

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

        <figure className="fp-figure" aria-label="Løkka: fra pakking til retur og tilbake">
          <div className="fp-loop">
            <svg viewBox="0 0 540 540" aria-hidden className="fp-ring">
              <circle className="fp-track" cx="270" cy="270" r="215" />
              <circle className="fp-glow" cx="270" cy="270" r="215" />
              {CHEVRONS.map(([x, y, r]) => (
                <path key={r} className="fp-chev" d="M-6 -7 L4 0 L-6 7" transform={`translate(${x} ${y}) rotate(${r})`} />
              ))}
            </svg>
            <ol className="fp-nodes">
              {LOOP.map((n, i) => (
                <li key={n.nb} className="fp-node" style={{ ['--x' as string]: `${(n.x / 540) * 100}%`, ['--y' as string]: `${(n.y / 540) * 100}%`, animationDelay: `${n.delay}s` }}>
                  <span className="fp-node__n">{i + 1}</span>
                  <span>
                    <span className="fp-node__nb">{n.nb}</span>
                    <span className="fp-node__en" lang="en">
                      {n.en}
                    </span>
                  </span>
                </li>
              ))}
            </ol>
            <div className="fp-core">
              <div className="fp-core__pair">Skalljakke M / L</div>
              <div className="fp-core__rule">3 forvekslinger på 7 dager, og pakking ber om etikettfoto</div>
            </div>
          </div>
        </figure>
      </main>
      <footer className="fp-foot">
        <span>Varer, ikke folk. Ingen statistikk per ansatt.</span>
        <span lang="en">Items, not people.</span>
      </footer>
    </div>
  );
}
