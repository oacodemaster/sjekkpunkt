'use client';

import { useActionState } from 'react';
import { Banner, Button, Field } from '@/components/ui';
import { signIn, type SignInState } from '@/lib/auth/actions';

const ERRORS: Record<string, string> = {
  invalid: 'Feil e-post eller passord · Wrong email or password',
  noProfile: 'Brukeren har ingen rolle ennå · This user has no role yet',
};

/** `secondary` when the demo's one-tap buttons sit above it, so they keep the main action. */
export function LoginForm({ next, secondary }: { next?: string; secondary?: boolean }) {
  const [state, action, pending] = useActionState<SignInState, FormData>(signIn, {});

  return (
    <form action={action} className="flex flex-col gap-4">
      {next && <input type="hidden" name="next" value={next} />}
      <Field id="email" label="E-post · Email" name="email" type="email" autoComplete="username" required />
      <Field id="password" label="Passord · Password" name="password" type="password" autoComplete="current-password" required />
      {state.error && (
        <Banner tone="error" role="alert">
          {ERRORS[state.error] ?? state.error}
        </Banner>
      )}
      <Button type="submit" block disabled={pending} variant={secondary ? 'secondary' : 'primary'}>
        {pending ? '…' : 'Logg inn'}
      </Button>
    </form>
  );
}
