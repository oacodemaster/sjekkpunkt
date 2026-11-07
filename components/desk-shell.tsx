import Link from 'next/link';
import type { ReactNode } from 'react';
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

/** Desktop / tablet shell for the lead console, insights, admin and the Holio mock. */
export function DeskShell({ user, children }: { user: CurrentUser; children: ReactNode }) {
  return (
    <div className="flex flex-1 flex-col bg-slate-50">
      <header className="flex flex-wrap items-center gap-x-6 gap-y-2 bg-frame px-6 py-3 text-white">
        <Link href="/" className="text-xl font-bold tracking-tight">
          Sjekkpunkt
        </Link>
        <nav className="flex flex-wrap gap-1 text-base">
          {NAV.filter((n) => n.roles.includes(user.role)).map((n) => (
            <Link key={n.href} href={n.href} className="rounded-lg px-3 py-1.5 hover:bg-white/10">
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-3 text-sm text-slate-300">
          <span>
            {user.displayName} · {user.role}
          </span>
          <form action={signOut}>
            <button className="underline">Logg ut</button>
          </form>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 p-6">{children}</main>
    </div>
  );
}

export function Card({ title, children, className = '' }: { title: string; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-slate-200 bg-white p-5 shadow-sm ${className}`}>
      <h2 className="mb-3 text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}

export function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="text-sm text-muted">{label}</div>
      <div className="mt-1 text-4xl font-bold tabular-nums">{value}</div>
    </div>
  );
}
