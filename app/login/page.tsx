import { redirect } from 'next/navigation';
import { SignedOutShell } from '@/components/ui/signed-out-shell';
import { getCurrentUser, HOME } from '@/lib/auth/dal';
import { LoginForm } from './login-form';

export default async function LoginPage({ searchParams }: PageProps<'/login'>) {
  const user = await getCurrentUser();
  if (user) redirect(HOME[user.role]);
  const { next } = await searchParams;

  return (
    <SignedOutShell>
      <h1 className="type-title m-0">Logg inn · Sign in</h1>
      <LoginForm next={typeof next === 'string' ? next : undefined} />
    </SignedOutShell>
  );
}
