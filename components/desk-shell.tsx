import type { ReactNode } from 'react';
import { Wordmark } from '@/components/ui';
import { DeskNav } from '@/components/desk-nav';
import { signOut } from '@/lib/auth/actions';
import type { CurrentUser } from '@/lib/auth/dal';

const NAV = [
  { href: '/lead', label: 'Teamleder', roles: ['lead', 'admin'] },
  { href: '/insights', label: 'Innsikt', roles: ['lead', 'admin'] },
  { href: '/holio', label: 'Holio WMS (mock)', roles: ['lead', 'admin'] },
  { href: '/admin', label: 'Admin', roles: ['admin'] },
  { href: '/pack', label: 'Pakking', roles: ['lead', 'admin'] },
  { href: '/return', label: 'Retur', roles: ['lead', 'admin'] },
];

/**
 * Desktop / tablet shell for the lead console, insights, admin and the Holio mock: a white
 * header (the lime only inside the mark), surface-2 ground, raised white cards, ink buttons.
 */
export function DeskShell({ user, children }: { user: CurrentUser; children: ReactNode }) {
  return (
    <div className="sp-light flex flex-1 flex-col bg-surface-2 text-ink">
      <header className="sp-desk-header">
        <Wordmark surface="light" size={28} nameSize={19} />
        <DeskNav items={NAV.filter((n) => n.roles.includes(user.role)).map(({ href, label }) => ({ href, label }))} />
        <div className="ml-auto flex items-center gap-3 text-[15px] text-ink-2">
          <span>
            {user.displayName} · {user.role}
          </span>
          <form action={signOut}>
            <button className="sp-btn sp-btn--quiet sp-btn--desk">Logg ut</button>
          </form>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 p-4 sm:p-8">{children}</main>
    </div>
  );
}

/** A desk panel: white, raised, with a desk-title heading. */
export function Card({ title, children, className = '', aside }: { title: string; children: ReactNode; className?: string; aside?: ReactNode }) {
  return (
    <section className={`sp-card sp-card--desk gap-4 p-5 ${className}`}>
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="type-desk-title m-0">{title}</h2>
        {aside && <span className="ml-auto">{aside}</span>}
      </div>
      <div className="type-dense min-w-0">{children}</div>
    </section>
  );
}

export { Stat } from '@/components/ui/stat';
