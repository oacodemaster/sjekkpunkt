'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ADMIN_ERROR_NB, send } from './api';

/** Two taps on purpose: the first arms the button, the second resets. No browser dialog. */
export function DemoResetButton() {
  const router = useRouter();
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function reset() {
    setBusy(true);
    setMsg(null);
    const r = await send<{ photos: number; summaries: number; failed: number }>('POST', '/api/admin/demo-reset', { confirm: true });
    setBusy(false);
    setArmed(false);
    setMsg(
      r.ok
        ? `Demodata er tilbakestilt. ${r.photos} bilder og ${r.summaries} opplesninger slettet${r.failed ? `, ${r.failed} filer feilet` : ''}.`
        : (ADMIN_ERROR_NB[r.error] ?? ADMIN_ERROR_NB.failed),
    );
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      {armed ? (
        <>
          <button className="btn bg-bad text-white" disabled={busy} onClick={reset}>
            {busy ? 'Tilbakestiller…' : 'Ja, tilbakestill alt'}
          </button>
          <button className="btn-secondary" disabled={busy} onClick={() => setArmed(false)}>
            Avbryt
          </button>
        </>
      ) : (
        <button className="btn-secondary" onClick={() => (setArmed(true), setMsg(null))}>
          Tilbakestill demodata
        </button>
      )}
      {msg && (
        <span role="status" data-testid="demo-reset-status">
          {msg}
        </span>
      )}
    </div>
  );
}
