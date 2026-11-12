import { notFound } from 'next/navigation';
import { DemoStage } from '@/components/demo/demo-stage';
import { scriptedDemoOn } from '@/lib/demo/flags';
import { isLang } from '@/lib/i18n/lang';

// The scripted demo (stage fallback). Same station UI and engine as live mode, on the
// demo adapter: in-memory seed, scripted vision fixtures, no keys and no database. It makes no
// paid call, so it is on with the free flag, whatever DEMO_ENABLED says (lib/demo/flags.ts).
// ?lang=en holds the stations in one language for the whole run (the worker's lines stay as
// scripted); the landing page's screenshots are taken that way.
export default async function DemoPage({ searchParams }: PageProps<'/demo'>) {
  if (!scriptedDemoOn()) notFound();
  const { lang } = await searchParams;
  return <DemoStage stationLang={isLang(lang) ? lang : undefined} />;
}
