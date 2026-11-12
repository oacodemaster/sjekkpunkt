import Link from 'next/link';
import { headers } from 'next/headers';
import { DeviceShot, Icon, Wordmark } from '@/components/ui';
import { CONTACT_EMAIL, LANDING, landingPath, type LandingLang } from '@/lib/landing/copy';
import { SITE_URL } from '@/lib/landing/site';
import { issueFormToken } from '@/lib/leads/token';
import { LeadForm } from './lead-form';
import { PackingDemoLazy } from './packing-demo-lazy';

/** Screenshot sizes in pixels (2x): tests/e2e/landing-shots.spec.ts, then scripts/landing-images.mjs. */
const SIZE = {
  hero: [824, 1336],
  step: [824, 880],
  lead: [1498, 776],
  leadNarrow: [760, 776],
  poster: [824, 1100],
} as const;

/**
 * The landing page (docs/landing-page-brief.md, copy in docs/landing-copy.md): one dark page on
 * the Sjekkpunkt design system. The lime brand is the primary button and the eyebrow dot, nothing
 * else (docs/decisions.md). Every image is a screen of the real app. Server-rendered; only the
 * packing check (lazy) and the form are client components, and neither calls a paid API.
 */
export async function LandingPage({ lang }: { lang: LandingLang }) {
  const c = LANDING[lang];
  const a = c.anchors;
  const nonce = (await headers()).get('x-nonce') ?? undefined;
  const privacyHref = `/privacy?lang=${lang}#${lang === 'nb' ? 'henvendelser' : 'contact-form'}`;
  const home = lang === 'nb' ? '/?lang=nb' : '/en';

  const jsonLd = [
    {
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      name: 'Sjekkpunkt',
      url: `${SITE_URL}${landingPath(lang)}`,
      description: c.meta.description,
      inLanguage: lang === 'nb' ? 'nb-NO' : 'en',
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Android (Chrome)',
      image: `${SITE_URL}/og/sjekkpunkt-${lang}.png`,
      creator: { '@id': 'https://forsterk.no/#organization' },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      '@id': 'https://forsterk.no/#organization',
      name: 'Forsterk',
      url: 'https://forsterk.no',
      email: CONTACT_EMAIL,
    },
  ];

  return (
    <div className="lp sp-dark" lang={lang}>
      {/* JSON-LD for search engines: our own constants, with < escaped, so it cannot close the tag. */}
      {/* eslint-disable-next-line react/no-danger -- a data block, not markup; see the line above */}
      <script type="application/ld+json" nonce={nonce} dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />
      <a href="#main" className="lp-skip">
        {c.nav.skip}
      </a>

      <header className="lp-header">
        <div className="lp-wrap lp-header__in">
          <Wordmark surface="dark" size={32} nameSize={22} href={home} className="lp-header__mark" />
          <nav className="lp-nav" aria-label={c.nav.menu}>
            <a href={`#${a.how}`}>{c.nav.how}</a>
            <a href={`#${a.try}`}>{c.nav.try}</a>
            <a href={`#${a.faq}`}>{c.nav.faq}</a>
          </nav>
          <nav className="lp-lang" aria-label={c.nav.langLabel}>
            <Link href="/?lang=nb" hrefLang="nb" lang="nb" aria-current={lang === 'nb' ? 'page' : undefined} data-testid="lang-nb">
              <span aria-hidden>NB</span>
              <span className="sp-sr">Norsk</span>
            </Link>
            <Link href="/en" hrefLang="en" lang="en" aria-current={lang === 'en' ? 'page' : undefined} data-testid="lang-en">
              <span aria-hidden>EN</span>
              <span className="sp-sr">English</span>
            </Link>
          </nav>
          <Link href="/login" className="lp-signin">
            {c.nav.signIn}
          </Link>
          <a href={`#${a.form}`} className="sp-btn sp-btn--brand lp-header__cta">
            {c.nav.cta}
          </a>
        </div>
      </header>

      <main id="main" tabIndex={-1}>
        {/* Hero */}
        <section className="lp-hero" aria-labelledby="lp-h1">
          <div className="lp-wrap lp-hero__grid">
            <div className="lp-hero__text">
              <p className="lp-eyebrow">{c.hero.eyebrow}</p>
              <h1 className="lp-h1" id="lp-h1">
                {c.hero.h1}
              </h1>
              <p className="lp-lead">{c.hero.lead}</p>
              <div className="lp-actions">
                <a href={`#${a.form}`} className="sp-btn sp-btn--brand" data-testid="hero-cta">
                  {c.hero.cta}
                  <Icon name="arrow-right" />
                </a>
                <a href={`#${a.how}`} className="sp-btn sp-btn--on-dark">
                  {c.hero.secondary}
                </a>
              </div>
              <ul className="lp-facts">
                {c.hero.facts.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            </div>
            <DeviceShot src={`/landing/${lang}/hero.webp`} alt={c.hero.imageAlt} width={SIZE.hero[0]} height={SIZE.hero[1]} priority className="lp-hero__device" />
          </div>
        </section>

        {/* The problem */}
        <section className="lp-section" id={a.problem} aria-labelledby="lp-problem">
          <div className="lp-wrap">
            <p className="lp-kicker">{c.problem.kicker}</p>
            <h2 className="lp-h2" id="lp-problem">
              {c.problem.h2}
            </h2>
            <p className="lp-scene">{c.problem.scene}</p>
            <ul className="lp-cards">
              {c.problem.cards.map((card) => (
                <li key={card.title} className="lp-card">
                  <h3>{card.title}</h3>
                  <p>{card.text}</p>
                </li>
              ))}
            </ul>
            <aside className="lp-example" aria-label={c.problem.exampleTitle}>
              <strong>{c.problem.exampleTitle}</strong> {c.problem.exampleText}
            </aside>
          </div>
        </section>

        {/* How it works */}
        <section className="lp-section" id={a.how} aria-labelledby="lp-how">
          <div className="lp-wrap">
            <p className="lp-kicker">{c.how.kicker}</p>
            <h2 className="lp-h2" id="lp-how">
              {c.how.h2}
            </h2>
            <p className="lp-intro">{c.how.lead}</p>
            {[c.how.packing, c.how.returns].map((flow) => (
              <div key={flow.title} className="lp-flow">
                <h3 className="lp-flow__title">{flow.title}</h3>
                <ol className="lp-steps">
                  {flow.steps.map((s, i) => (
                    <li key={s.title} className="lp-step">
                      <div className="lp-step__text">
                        <span className="lp-step__n sp-mono" aria-hidden>
                          {String(i + 1).padStart(2, '0')}
                        </span>
                        <h4>{s.title}</h4>
                        <p>{s.text}</p>
                      </div>
                      <DeviceShot src={s.shot.src} alt={s.shot.alt} width={SIZE.step[0]} height={SIZE.step[1]} variant="top" className="lp-step__shot" />
                    </li>
                  ))}
                </ol>
              </div>
            ))}
            <div className="lp-pair">
              <div className="lp-step lp-step--loop">
                <div className="lp-step__text">
                  <h3 className="lp-flow__title">{c.how.loop.title}</h3>
                  <p>{c.how.loop.text}</p>
                </div>
                <DeviceShot src={c.how.loop.shot.src} alt={c.how.loop.shot.alt} width={SIZE.step[0]} height={SIZE.step[1]} variant="top" className="lp-step__shot" />
              </div>
              <div className="lp-step lp-step--lead">
                <div className="lp-step__text">
                  <h3 className="lp-flow__title">{c.how.teamLead.title}</h3>
                  <p>{c.how.teamLead.text}</p>
                </div>
                <DeviceShot
                  src={c.how.teamLead.shot.src}
                  narrow={{ src: c.how.teamLead.shot.src.replace('.webp', '-narrow.webp'), width: SIZE.leadNarrow[0], height: SIZE.leadNarrow[1] }}
                  alt={c.how.teamLead.shot.alt}
                  width={SIZE.lead[0]}
                  height={SIZE.lead[1]}
                  variant="wide"
                  className="lp-step__shot"
                />
              </div>
            </div>
          </div>
        </section>

        {/* Try it */}
        <section className="lp-section" id={a.try} aria-labelledby="lp-try">
          <div className="lp-wrap">
            <p className="lp-kicker">{c.try.kicker}</p>
            <h2 className="lp-h2" id="lp-try">
              {c.try.h2}
            </h2>
            <p className="lp-intro">{c.try.lead}</p>
            <PackingDemoLazy lang={lang} copy={c.try} poster={{ src: c.how.packing.steps[0].shot.src.replace('pack-order', 'demo-poster'), alt: c.how.packing.steps[0].shot.alt }} />
            <p className="lp-more">
              <Link href="/demo" className="lp-arrow-link">
                {c.try.fullDemo}
                <Icon name="arrow-right" />
              </Link>
            </p>
          </div>
        </section>

        {/* Watch it */}
        <section className="lp-section" id={a.watch} aria-labelledby="lp-watch">
          <div className="lp-wrap">
            <p className="lp-kicker">{c.watch.kicker}</p>
            <h2 className="lp-h2" id="lp-watch">
              {c.watch.h2}
            </h2>
            <p className="lp-intro">{c.watch.lead}</p>
            <video className="lp-video" controls preload="none" playsInline poster="/video/sjekkpunkt-poster.jpg" width={1920} height={1080} aria-label={c.watch.videoLabel} data-testid="watch-video">
              <source src="/video/sjekkpunkt.mp4" type="video/mp4" />
            </video>
          </div>
        </section>

        {/* Built for the warehouse floor */}
        <section className="lp-section" id={a.floor} aria-labelledby="lp-floor">
          <div className="lp-wrap">
            <p className="lp-kicker">{c.floor.kicker}</p>
            <h2 className="lp-h2" id="lp-floor">
              {c.floor.h2}
            </h2>
            <ul className="lp-points">
              {c.floor.points.map((p, i) => (
                <li key={p.title} className="lp-point">
                  <span className="lp-step__n sp-mono" aria-hidden>
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <h3>{p.title}</h3>
                  <p>{p.text}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* The pilot */}
        <section className="lp-section" id={a.pilot} aria-labelledby="lp-pilot">
          <div className="lp-wrap lp-pilot">
            <div>
              <p className="lp-kicker">{c.pilot.kicker}</p>
              <h2 className="lp-h2" id="lp-pilot">
                {c.pilot.h2}
              </h2>
              <p className="lp-intro">{c.pilot.lead}</p>
              <a href={`#${a.form}`} className="sp-btn sp-btn--brand lp-pilot__cta">
                {c.pilot.cta}
                <Icon name="arrow-right" />
              </a>
            </div>
            <dl className="lp-terms">
              {c.pilot.items.map((it) => (
                <div key={it.title} className="lp-terms__row">
                  <dt>{it.title}</dt>
                  <dd>{it.text}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        {/* Questions */}
        <section className="lp-section" id={a.faq} aria-labelledby="lp-faq">
          <div className="lp-wrap lp-faq-wrap">
            <div>
              <p className="lp-kicker">{c.faq.kicker}</p>
              <h2 className="lp-h2" id="lp-faq">
                {c.faq.h2}
              </h2>
            </div>
            <div className="lp-faq">
              {c.faq.items.map((q) => (
                <details key={q.q} className="lp-faq__item">
                  <summary>
                    <span>{q.q}</span>
                    <span className="lp-faq__sign" aria-hidden />
                  </summary>
                  <p>{q.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* The form */}
        <section className="lp-section" id={a.form} aria-labelledby="lp-form">
          <div className="lp-wrap lp-contact">
            <div>
              <p className="lp-kicker">{c.form.kicker}</p>
              <h2 className="lp-h2" id="lp-form">
                {c.form.h2}
              </h2>
              <p className="lp-intro">{c.form.lead}</p>
              <p className="lp-contact__mail">
                <a href={`mailto:${CONTACT_EMAIL}`} className="sp-link">
                  {CONTACT_EMAIL}
                </a>
              </p>
            </div>
            <LeadForm lang={lang} copy={c.form} token={issueFormToken()} links={{ privacy: privacyHref, try: `#${a.try}`, demo: '/demo' }} />
          </div>
        </section>
      </main>

      <footer className="lp-footer">
        <div className="lp-wrap lp-footer__in">
          <div className="lp-footer__brand">
            <Wordmark surface="dark" size={28} nameSize={19} href={home} />
            <p>{c.footer.motto}</p>
          </div>
          <p className="lp-footer__by">
            {c.footer.builtBy}{' '}
            <a href="https://forsterk.no" className="sp-link" data-testid="forsterk-credit">
              Forsterk
            </a>
          </p>
          <ul className="lp-footer__links">
            <li>
              <Link href={`/privacy?lang=${lang}`}>{c.footer.privacy}</Link>
            </li>
            <li>
              <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
            </li>
            <li>
              <Link href="/login">{c.footer.signIn}</Link>
            </li>
          </ul>
        </div>
      </footer>
    </div>
  );
}
