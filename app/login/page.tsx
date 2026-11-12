import { redirect } from 'next/navigation';
import { SignedOutShell } from '@/components/ui/signed-out-shell';
import { getCurrentUser, HOME } from '@/lib/auth/dal';
import { QUICK_ROLES } from '@/lib/auth/demo-users';
import { LoginForm } from './login-form';
import { QuickSignIn } from './quick-sign-in';
import { paidDemoOn } from '@/lib/demo/flags';

export default async function LoginPage({ searchParams }: PageProps<'/login'>) {
  const user = await getCurrentUser();
  if (user) redirect(HOME[user.role]);
  const { next } = await searchParams;
  const nextPath = typeof next === 'string' ? next : undefined;
  // One-tap role buttons for the demo, for each role whose password the server has; the email
  // form stays for admin and real accounts.
  const roles = paidDemoOn() ? QUICK_ROLES.filter((r) => !!process.env[`SEED_PASSWORD_${r.toUpperCase()}`]) : [];
  const quick = roles.length > 0;

  return (
    <SignedOutShell>
      <h1 className="type-title m-0">Logg inn · Sign in</h1>
      {quick && <QuickSignIn roles={roles} next={nextPath} />}
      {quick && (
        <p className="type-label m-0 border-t border-line pt-6 text-ink-2">
          Eller med e-post · Or with email
        </p>
      )}
      <LoginForm next={nextPath} secondary={quick} />
    </SignedOutShell>
  );
}
