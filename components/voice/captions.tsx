'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Lang } from '@/lib/engine/types';
import { useLatest } from '@/lib/hooks/use-latest';
import { t } from '@/lib/i18n/strings';

// Captions for every agent and worker turn (addendum section 8): the line as spoken, and under
// it a Norwegian or English line translated on the server. Plain text only, never HTML.

export interface Caption {
  id: number;
  role: 'agent' | 'worker';
  text: string;
  /** language the line was spoken in, when known (agent lines); worker lines are auto-detected */
  lang: Lang | null;
  translation?: string | null;
  pending?: boolean;
}

export type CaptionTarget = 'nb' | 'en';
const MAX_LINES = 30;

export function useCaptions(target: CaptionTarget) {
  const [lines, setLines] = useState<Caption[]>([]);
  const nextId = useRef(1);
  const targetRef = useLatest(target);

  const translateLine = useCallback(async (id: number, text: string, from: Lang | null, to: CaptionTarget) => {
    if (from === to) {
      setLines((ls) => ls.map((l) => (l.id === id ? { ...l, translation: null, pending: false } : l)));
      return;
    }
    let out: string | null = null;
    try {
      const res = await fetch('/api/translate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text, from, to }),
      });
      if (res.ok) out = ((await res.json()) as { text: string }).text;
    } catch {
      out = null;
    }
    // A line already in the target language needs no second line.
    const same = out !== null && out.trim().toLowerCase() === text.trim().toLowerCase();
    setLines((ls) => ls.map((l) => (l.id === id ? { ...l, translation: same ? null : out, pending: false } : l)));
  }, []);

  const add = useCallback(
    (role: Caption['role'], text: string, lang: Lang | null) => {
      const clean = text.trim();
      // Speech to text sometimes returns only "..." for noise: nothing to caption.
      if (!/\p{L}/u.test(clean)) return;
      const id = nextId.current++;
      setLines((ls) => [...ls.slice(-(MAX_LINES - 1)), { id, role, text: clean, lang, pending: true }]);
      void translateLine(id, clean, lang, targetRef.current);
    },
    [targetRef, translateLine],
  );

  // Switching NB/EN retranslates what is on screen.
  const lastTarget = useRef(target);
  useEffect(() => {
    if (lastTarget.current === target) return;
    lastTarget.current = target;
    setLines((ls) => {
      for (const l of ls) void translateLine(l.id, l.text, l.lang, target);
      return ls.map((l) => ({ ...l, pending: true, translation: undefined }));
    });
  }, [target, translateLine]);

  return { lines, add, clear: () => setLines([]) };
}

export function CaptionList({ lines, lang, max = 3 }: { lines: Caption[]; lang: Lang; max?: number }) {
  const shown = lines.slice(-max);
  if (!shown.length) return null;
  return (
    <ol className="flex flex-col gap-2" aria-live="polite" data-testid="captions">
      {shown.map((l) => (
        <li key={l.id} className={`rounded-xl px-3 py-2 ${l.role === 'agent' ? 'bg-slate-100' : 'ml-6 bg-blue-50'}`}>
          <p className="text-base leading-snug">{l.text}</p>
          {l.pending ? (
            <p className="text-sm italic text-muted">{t('translating', lang)}</p>
          ) : (
            l.translation && <p className="text-sm leading-snug text-muted">{l.translation}</p>
          )}
        </li>
      ))}
    </ol>
  );
}
