import Link from 'next/link';
import type { ReactNode } from 'react';

// Holio WMS (mock). A different product on purpose: it must not use any Sjekkpunkt token for
// colour or type (design system brand book), so the jury sees two systems. system-ui and a plain
// grey-blue, styles under .holio in app/ui.css. Not Holio's real visual identity.

export function HolioBar({ title, link }: { title: ReactNode; link?: { href: string; label: string } }) {
  return (
    <div className="holio-bar">
      <h1>{title}</h1>
      {link && <Link href={link.href}>{link.label}</Link>}
    </div>
  );
}

export function HolioCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="holio-card">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

/** A JSON payload as Holio would receive it. */
export function HolioPayload({ value }: { value: unknown }) {
  return <pre className="holio-pre">{JSON.stringify(value, null, 2)}</pre>;
}
