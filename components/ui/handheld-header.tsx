import Link from 'next/link';
import type { ReactNode } from 'react';
import { Mark } from './wordmark';

/** The worker's language as a two-letter code; the visible pill is small, the hit area 56px high. */
export function LanguageChip({ code, name, label }: { code: string; name: string; label: string }) {
  return (
    <span className="sp-hit" title={name} aria-label={`${label}: ${name}`} role="img">
      <span className="sp-lang" aria-hidden>
        {code.toUpperCase()}
      </span>
    </span>
  );
}

/** The handheld's label in mono, linking to the device picker. It names a device, never a person. */
export function DeviceChip({ label, title }: { label: string; title: string }) {
  return (
    <Link href="/device" className="sp-hit" title={title}>
      <span className="sp-devicechip">{label}</span>
    </Link>
  );
}

/**
 * The top bar of both stations: mark, language chip, device chip, «i» for the privacy page and
 * sign out, each with a 56px hit area. Below 460px only the mark shows (still a link to /).
 * No worker name, avatar or count, ever.
 */
export function HandheldHeader({ lang, device, privacy, signOut }: { lang: ReactNode; device: ReactNode; privacy: { label: string }; signOut: ReactNode }) {
  return (
    <header className="sp-hh-header">
      <Link href="/" className="sp-hh-header__brand">
        <Mark surface="light" size={28} alt="Sjekkpunkt" />
        <span className="sp-hh-header__name" aria-hidden>
          Sjekkpunkt
        </span>
      </Link>
      {lang}
      {device}
      <Link href="/privacy" className="sp-hit" title={privacy.label} aria-label={privacy.label} data-testid="privacy-link">
        <span className="sp-infobtn" aria-hidden>
          i
        </span>
      </Link>
      {signOut}
    </header>
  );
}
