import { DeskNav } from '@/components/desk-nav';
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
      <DeskNav items={SECTIONS} label="Admin" exact={['/admin']} className="sp-desk-nav -mb-2 border-b-2 border-line" />
      {children}
    </DeskShell>
  );
}
