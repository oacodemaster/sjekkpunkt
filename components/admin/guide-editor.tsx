'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ADMIN_ERROR_NB, send } from './api';

const KB_NB: Record<string, string> = {
  not_configured: 'Stemmetjenesten er ikke satt opp på serveren.',
  not_found: 'Fant ikke kunnskapsbasen. Kjør pnpm voice:setup én gang.',
  failed: 'ElevenLabs svarte ikke. Lagre på nytt for å prøve igjen.',
};

/** The grading guide: what workers and the voice assistants go by. Saved to settings, then pushed to the agents. */
export function GuideEditor({ initial }: { initial: string }) {
  const router = useRouter();
  const [text, setText] = useState(initial);
  const [state, setState] = useState<{ kind: 'idle' | 'saving' | 'saved' | 'warn' | 'error'; text?: string }>({ kind: 'idle' });

  const save = async () => {
    setState({ kind: 'saving' });
    const r = await send<{ changed: string[]; kb: { ok: boolean; error?: string } | null }>('PATCH', '/api/admin/settings', { grading_guide: text });
    if (!r.ok) return setState({ kind: 'error', text: r.error === 'invalid_body' ? 'Veiledningen må ha mellom 50 og 8000 tegn.' : (ADMIN_ERROR_NB[r.error] ?? ADMIN_ERROR_NB.failed) });
    if (!r.changed.length) setState({ kind: 'saved', text: 'Ingen endringer.' });
    else if (r.kb?.ok) setState({ kind: 'saved', text: 'Lagret og sendt til stemmeassistentene.' });
    else setState({ kind: 'warn', text: `Lagret, men ikke sendt til stemmeassistentene. ${KB_NB[r.kb?.error ?? 'failed'] ?? ''}` });
    router.refresh();
  };

  return (
    <div className="flex flex-col gap-3">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={24}
        spellCheck={false}
        className="w-full rounded-xl border border-slate-300 p-4 font-mono text-sm leading-relaxed"
        aria-label="Vurderingsveiledning"
        data-testid="guide-text"
      />
      <div className="flex flex-wrap items-center gap-4">
        <button className="btn-primary" onClick={() => void save()} disabled={state.kind === 'saving' || text === initial}>
          {state.kind === 'saving' ? 'Lagrer…' : 'Lagre og send til assistentene'}
        </button>
        <span className="text-sm text-muted tabular-nums">{text.trim().length} / 8000 tegn</span>
        {state.text && (
          <span role="status" data-testid="guide-status" className={state.kind === 'error' ? 'text-bad' : state.kind === 'warn' ? 'text-warn' : 'text-ok'}>
            {state.text}
          </span>
        )}
      </div>
    </div>
  );
}
