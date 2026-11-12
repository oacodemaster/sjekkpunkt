'use client';

import dynamic from 'next/dynamic';
import { useEffect, useRef, useState } from 'react';
import type { LandingCopy, LandingLang } from '@/lib/landing/copy';

// The station, the engine and the demo store are loaded only when the section comes near the
// screen, so they never slow the hero (landing page brief, section 7). Until then a still of the
// same station holds the space, so nothing jumps when the live one arrives.
const PackingDemo = dynamic(() => import('./packing-demo'), { ssr: false, loading: () => null });

export function PackingDemoLazy({ lang, copy, poster }: { lang: LandingLang; copy: LandingCopy['try']; poster: { src: string; alt: string } }) {
  const ref = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || near) return;
    const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && setNear(true), { rootMargin: '600px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, [near]);

  return (
    <div ref={ref} className="lp-demo-slot">
      {near ? (
        <PackingDemo lang={lang} copy={copy} />
      ) : (
        <div className="lp-demo" aria-busy="true">
          <div className="lp-demo__panel">
            <p className="lp-demo__progress sp-mono">{copy.progress.replace('{n}', '1').replace('{total}', String(copy.stepTitles.length))}</p>
            <h3 className="lp-demo__title">{copy.stepTitles[0]}</h3>
            <p className="lp-demo__say">{copy.loading}</p>
          </div>
          <div className="sp-device lp-demo__device">
            <div className="lp-demo__screen">
              {/* eslint-disable-next-line @next/next/no-img-element -- a still of the station, sized, lazy */}
              <img src={poster.src} alt={poster.alt} width={824} height={1100} loading="lazy" decoding="async" className="block h-auto w-full" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
