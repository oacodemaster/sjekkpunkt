import { notFound } from 'next/navigation';
import { LiveReturnStation } from '@/components/returns/live-return-station';
import { requireRole } from '@/lib/auth/dal';
import { enabledLanguages } from '@/lib/privacy/server';
import { loadReturnView } from '@/lib/returns/server';

export default async function ReturnInspectionPage({ params }: PageProps<'/return/[ext]'>) {
  const user = await requireRole(['returns', 'lead', 'admin']);
  const { ext } = await params;
  const [view, languages] = await Promise.all([loadReturnView(decodeURIComponent(ext), user.warehouseId), enabledLanguages(user.warehouseId)]);
  if (!view) notFound();
  return <LiveReturnStation view={view} lang={user.lang} languages={languages} />;
}
