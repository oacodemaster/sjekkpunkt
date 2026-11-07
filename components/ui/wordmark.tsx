import Link from 'next/link';

// Mark A «Ut av esken» from the design system (public/brand/*.svg, copied, never redrawn).
// mark-a-on-light: graphite tile, lime glyph, for white surfaces. mark-a: lime tile, for frame.
// The name is set live in Golos Text 800.

export function Mark({ surface, size = 24, alt = '' }: { surface: 'light' | 'dark'; size?: number; alt?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- a 400-byte SVG, no optimisation needed
    <img src={surface === 'light' ? '/brand/mark-a-on-light.svg' : '/brand/mark-a.svg'} width={size} height={size} alt={alt} />
  );
}

/** The mark plus the name; the whole lockup links to /. */
export function Wordmark({ surface, size = 40, nameSize = 30, href = '/', className = '' }: { surface: 'light' | 'dark'; size?: number; nameSize?: number; href?: string | null; className?: string }) {
  const inner = (
    <>
      <Mark surface={surface} size={size} />
      <span style={{ fontSize: nameSize, lineHeight: 1.1 }}>Sjekkpunkt</span>
    </>
  );
  const cls = `sp-wordmark ${surface === 'dark' ? 'text-ink-on-dark' : 'text-ink'} ${className}`;
  return href ? (
    <Link href={href} className={cls}>
      {inner}
    </Link>
  ) : (
    <span className={cls}>{inner}</span>
  );
}
