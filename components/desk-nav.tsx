'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/** Desk navigation; the current section is marked (aria-current) with an ink underline. */
export function DeskNav({ items, label = 'Hovedmeny', exact = [], className = 'sp-desk-nav' }: { items: { href: string; label: string }[]; label?: string; exact?: string[]; className?: string }) {
  const path = usePathname();
  const current = (href: string) => path === href || (!exact.includes(href) && path.startsWith(`${href}/`));
  return (
    <nav className={className} aria-label={label}>
      {items.map((n) => (
        <Link key={n.href} href={n.href} aria-current={current(n.href) ? 'page' : undefined}>
          {n.label}
        </Link>
      ))}
    </nav>
  );
}
