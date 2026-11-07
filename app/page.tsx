import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser, HOME } from '@/lib/auth/dal';

export default async function Home() {
  const user = await getCurrentUser();
  if (user) redirect(HOME[user.role]);
  const demo = process.env.NEXT_PUBLIC_DEMO_ENABLED === 'true';

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-8 bg-frame p-6 text-white">
      <div className="text-center">
        <h1 className="text-5xl font-bold tracking-tight">Sjekkpunkt</h1>
        <p className="mt-3 text-xl text-slate-300">Every item checked on the way out and on the way back.</p>
      </div>
      <div className="flex w-full max-w-sm flex-col gap-3">
        <Link href="/login" className="btn-primary">
          Logg inn
        </Link>
        {demo && (
          <Link href="/demo" className="btn border-2 border-slate-500 text-white">
            Demo
          </Link>
        )}
        <Link href="/privacy" className="text-center text-slate-400 underline">
          Personvern · Privacy
        </Link>
      </div>
    </main>
  );
}
