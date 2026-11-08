'use client';

import { useActionState } from 'react';
import { Banner, Button, type IconName } from '@/components/ui';
import { quickSignIn, type SignInState } from '@/lib/auth/actions';
import type { QuickRole } from '@/lib/auth/demo-users';

const ROLES: { role: QuickRole; label: string; icon: IconName }[] = [
  { role: 'packer', label: 'Pakker · Packer', icon: 'box' },
  { role: 'returns', label: 'Retur · Returns', icon: 'label' },
  { role: 'lead', label: 'Teamleder · Team lead', icon: 'tick' },
];

const ERRORS: Record<string, string> = {
  quickOff: 'Demo-innlogging er ikke tilgjengelig nå · Demo sign-in is not available right now',
  quickBusy: 'For mange innlogginger. Prøv igjen om et minutt · Too many sign-ins. Try again in a minute',
};

/** One tap per role, no password (DEMO_ENABLED only; never admin). */
export function QuickSignIn({ roles, next }: { roles: QuickRole[]; next?: string }) {
  const [state, action, pending] = useActionState<SignInState, FormData>(quickSignIn, {});

  return (
    <form action={action} className="flex flex-col gap-3" aria-labelledby="quick-title">
      <h2 id="quick-title" className="type-label m-0 text-ink-2">
        Prøv som · Try as
      </h2>
      {next && <input type="hidden" name="next" value={next} />}
      {ROLES.filter((r) => roles.includes(r.role)).map((r) => (
        <Button key={r.role} type="submit" name="role" value={r.role} block icon={r.icon} iconAfter="arrow-right" disabled={pending} data-testid={`quick-${r.role}`}>
          {r.label}
        </Button>
      ))}
      {state.error && (
        <Banner tone="error" role="alert">
          {ERRORS[state.error] ?? state.error}
        </Banner>
      )}
    </form>
  );
}
