import Link from 'next/link';
import { notFound } from 'next/navigation';

// The scripted demo (phone frame + mock back office + director bar) is built in M2 and M4
// on top of the same station UI, via the demo adapter. See docs/plan.md.
export default function DemoPage() {
  if (process.env.NEXT_PUBLIC_DEMO_ENABLED !== 'true') notFound();
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 bg-frame p-6 text-white">
      <h1 className="text-4xl font-bold">Sjekkpunkt · DEMO</h1>
      <p className="text-slate-300">Det skriptede demoløpet bygges i M2 (retur) og M4 (pakking).</p>
      <Link href="/" className="underline">
        Tilbake
      </Link>
    </main>
  );
}
