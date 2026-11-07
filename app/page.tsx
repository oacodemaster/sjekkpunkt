import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ButtonLink, Wordmark } from '@/components/ui';
import { getCurrentUser, HOME } from '@/lib/auth/dal';

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

  return (
    <div className="fp sp-dark">
      <header className="fp-top">
        <Wordmark surface="dark" size={40} nameSize={28} />
      </header>
      <main className="fp-main">
        <div>
          <h1 className="fp-h1">Hver vare sjekket, på vei ut og på vei tilbake.</h1>
          <p className="fp-en" lang="en">
            Every item checked on the way out and on the way back.
          </p>
          <p className="fp-how">Kameraet sjekker esken før den forsegles. Ved returbenken vurderer stemmeassistenten varen sammen med deg, på ditt språk.</p>
          <div className="fp-actions">
            <ButtonLink href="/login" variant="brand" iconAfter="arrow-right">
              Logg inn
            </ButtonLink>
            {demo && (
              <ButtonLink href="/demo" variant="on-dark">
                Se demoen
              </ButtonLink>
            )}
          </div>
          <Link className="fp-privacy" href="/privacy">
            Personvern · Privacy
          </Link>
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
