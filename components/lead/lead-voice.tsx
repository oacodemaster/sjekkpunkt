'use client';

import { useState } from 'react';
import { useTool, VoiceDock } from '@/components/voice/voice-dock';
import type { Lang } from '@/lib/engine/types';
import { useLatest } from '@/lib/hooks/use-latest';
import type { LeadCard } from '@/lib/lead/types';
import { LEAD_FIRST_MESSAGES } from '@/lib/voice/agent-config';
import { escalationResult, LeadToolParams, leadToolError, listResult } from '@/lib/voice/lead-tools';

const NB_ONLY: readonly Lang[] = ['nb'];

/**
 * The lead assistant (Norwegian). It explains the cases on screen; no tool changes data, so it
 * cannot resolve anything. Must sit inside a ConversationProvider.
 */
export function LeadVoice({
  cards,
  focusId,
  setFocusId,
  talk,
  setTalk,
  handsFree,
  setHandsFree,
}: {
  cards: LeadCard[];
  focusId: string | null;
  setFocusId: (id: string) => void;
  talk: boolean;
  setTalk: (v: boolean) => void;
  handsFree: boolean;
  setHandsFree: (v: boolean) => void;
}) {
  const [lang, setLang] = useState<Lang>('nb');
  const cardsRef = useLatest(cards);
  const focusRef = useLatest(focusId);

  const show = (k: number) => {
    const c = cardsRef.current[k];
    setFocusId(c.id);
    document.getElementById(`esc-${c.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  useTool('list_escalations', () => listResult(cardsRef.current, new Date()));

  useTool('get_escalation', (raw) => {
    const p = LeadToolParams.get_escalation.safeParse(raw ?? {});
    if (!p.success) return leadToolError('bad_parameters');
    const list = cardsRef.current;
    if (!list.length) return leadToolError('no_open_cases', 'There are no open cases.');
    const k = p.data.number ? p.data.number - 1 : Math.max(0, list.findIndex((c) => c.id === focusRef.current));
    if (!list[k]) return leadToolError('no_such_case', `There are ${list.length} open cases.`);
    return escalationResult(list[k], k + 1, new Date());
  });

  useTool('show_escalation', (raw) => {
    const p = LeadToolParams.show_escalation.safeParse(raw);
    if (!p.success) return leadToolError('bad_parameters');
    const k = p.data.number - 1;
    if (!cardsRef.current[k]) return leadToolError('no_such_case', `There are ${cardsRef.current.length} open cases.`);
    show(k);
    return JSON.stringify({ ok: true, shown: p.data.number });
  });

  return (
    <VoiceDock
      station="lead"
      dynamicVariables={{ open_count: String(cards.length) }}
      firstMessage={(l) => LEAD_FIRST_MESSAGES[l].replace('{{open_count}}', String(cards.length))}
      lang={lang}
      onLangChange={setLang}
      talk={talk}
      setTalk={setTalk}
      handsFree={handsFree}
      setHandsFree={setHandsFree}
      languages={NB_ONLY}
      desk
    />
  );
}
