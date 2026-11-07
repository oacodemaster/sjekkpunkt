import { LeadConsole } from '@/components/lead/lead-console';
import { requireRole } from '@/lib/auth/dal';
import { loadLeadConsole } from '@/lib/lead/server';

export default async function LeadPage() {
  const user = await requireRole(['lead', 'admin']);
  const data = await loadLeadConsole(user.warehouseId);
  return <LeadConsole data={data} />;
}
