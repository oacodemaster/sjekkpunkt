import { redirect } from 'next/navigation';
import { getCurrentUser, HOME } from '@/lib/auth/dal';
import { LoginForm } from './login-form';

export default async function LoginPage({ searchParams }: PageProps<'/login'>) {
  const user = await getCurrentUser();
  if (user) redirect(HOME[user.role]);
  const { next } = await searchParams;

  return (
    <main className="flex flex-1 items-center justify-center bg-frame p-4">
      <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-xl">
        <h1 className="text-3xl font-bold tracking-tight">Sjekkpunkt</h1>
        <p className="mt-1 text-muted">Logg inn · Sign in</p>
        <LoginForm next={typeof next === 'string' ? next : undefined} />
      </div>
    </main>
  );
}
