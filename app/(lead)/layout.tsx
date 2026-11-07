import { DeskShell } from '@/components/desk-shell';
import { requireRole } from '@/lib/auth/dal';

export default async function LeadLayout({ children }: LayoutProps<'/'>) {
  const user = await requireRole(['lead', 'admin']);
  return <DeskShell user={user}>{children}</DeskShell>;
}
