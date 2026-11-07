import { redirect } from 'next/navigation';
import { LivePackStation } from '@/components/pack/live-pack-station';
import { requireRole } from '@/lib/auth/dal';
import { loadPackView } from '@/lib/pack/server';

export default async function PackOrderPage({ params }: PageProps<'/pack/[ext]'>) {
  const user = await requireRole(['packer', 'lead', 'admin']);
  const { ext } = await params;
  const id = decodeURIComponent(ext);
  const view = await loadPackView(id, user.warehouseId);
  if (!view) redirect(`/pack?missing=${encodeURIComponent(id)}`);
  return <LivePackStation view={view} lang={user.lang} />;
}
