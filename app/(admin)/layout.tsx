import Link from 'next/link';
import { DeskShell } from '@/components/desk-shell';
import { requireRole } from '@/lib/auth/dal';

const SECTIONS = [
  { href: '/admin', label: 'Innstillinger' },
  { href: '/admin/products', label: 'Varer' },
  { href: '/admin/import', label: 'Import' },
  { href: '/admin/guide', label: 'Vurderingsveiledning' },
  { href: '/admin/audit', label: 'Revisjonslogg' },
];

export default async function AdminLayout({ children }: LayoutProps<'/'>) {
  const user = await requireRole(['admin']);
  return (
    <DeskShell user={user}>
      <nav className="-mb-2 flex flex-wrap gap-2" aria-label="Admin">
        {SECTIONS.map((s) => (
          <Link key={s.href} href={s.href} className="rounded-full bg-white px-4 py-1.5 text-base font-semibold ring-1 ring-slate-300 hover:bg-slate-100">
            {s.label}
          </Link>
        ))}
      </nav>
      {children}
    </DeskShell>
  );
}
