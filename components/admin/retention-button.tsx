'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ADMIN_ERROR_NB, send } from './api';

export function RetentionButton() {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        className="sp-btn sp-btn--secondary sp-btn--desk"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          const r = await send<{ deleted: number; failed: number }>('POST', '/api/admin/retention');
          setBusy(false);
          setMsg(r.ok ? `${r.deleted} bilder slettet${r.failed ? `, ${r.failed} feilet` : ''}.` : (ADMIN_ERROR_NB[r.error] ?? ADMIN_ERROR_NB.failed));
          router.refresh();
        }}
      >
        {busy ? 'Sletter…' : 'Slett utløpte bilder nå'}
      </button>
      {msg && (
        <span role="status" data-testid="retention-status">
          {msg}
        </span>
      )}
    </div>
  );
}
