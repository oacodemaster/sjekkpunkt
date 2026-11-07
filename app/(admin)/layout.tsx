import { DeskShell } from '@/components/desk-shell';
import { requireRole } from '@/lib/auth/dal';

export default async function AdminLayout({ children }: LayoutProps<'/'>) {
  const user = await requireRole(['admin']);
  return <DeskShell user={user}>{children}</DeskShell>;
}
