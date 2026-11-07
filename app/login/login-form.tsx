'use client';

import { useActionState } from 'react';
import { signIn, type SignInState } from '@/lib/auth/actions';

const ERRORS: Record<string, string> = {
  invalid: 'Feil e-post eller passord · Wrong email or password',
  noProfile: 'Brukeren har ingen rolle ennå · This user has no role yet',
};

export function LoginForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState<SignInState, FormData>(signIn, {});

  return (
    <form action={action} className="mt-6 flex flex-col gap-4">
      {next && <input type="hidden" name="next" value={next} />}
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium text-muted">E-post · Email</span>
        <input
          name="email"
          type="email"
          autoComplete="username"
          required
          className="min-h-14 rounded-xl border-2 border-gray-300 px-4 text-lg"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium text-muted">Passord · Password</span>
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="min-h-14 rounded-xl border-2 border-gray-300 px-4 text-lg"
        />
      </label>
      {state.error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-bad">
          {ERRORS[state.error] ?? state.error}
        </p>
      )}
      <button type="submit" disabled={pending} className="btn-primary">
        {pending ? '…' : 'Logg inn'}
      </button>
    </form>
  );
}
