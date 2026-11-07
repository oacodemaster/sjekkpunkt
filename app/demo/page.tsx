import { notFound } from 'next/navigation';
import { DemoStage } from '@/components/demo/demo-stage';

// The scripted demo (stage fallback). Same station UI and engine as live mode, on the
// demo adapter: in-memory seed, scripted vision fixtures, no keys and no database.
export default function DemoPage() {
  if (process.env.NEXT_PUBLIC_DEMO_ENABLED !== 'true') notFound();
  return <DemoStage />;
}
