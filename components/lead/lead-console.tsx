'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ConversationProvider } from '@elevenlabs/react';
import { useVoiceLink } from '@/components/voice/voice-dock';
import { REASON_NB } from '@/lib/lead/plan';
import type { LeadCard, LeadConsoleData } from '@/lib/lead/types';
import { EscalationCard, postJson, type ResolveBody } from './escalation-card';
import { LeadVoice } from './lead-voice';
import { LiveFeed, PackAlerts, StockAdjustments } from './side-panels';
import { useLiveFeed } from './use-live-feed';

function Stat({ label, value, testId }: { label: string; value: number; testId: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-sm text-muted">{label}</div>
      <div className="mt-1 text-4xl font-bold tabular-nums" data-testid={testId}>
        {value}
      </div>
    </div>
  );
}

/** Team lead console: escalations, stock corrections, pack alerts, the live feed and the lead assistant. */
export function LeadConsole({ data }: { data: LeadConsoleData }) {
  const [talk, setTalk] = useState(false);
  const [handsFree, setHandsFree] = useState(false);
  return (
    // Push-to-talk: the mic is muted unless the button is held or hands-free is on.
    <ConversationProvider isMuted={!(talk || handsFree)}>
      <Console data={data} talk={talk} setTalk={setTalk} handsFree={handsFree} setHandsFree={setHandsFree} />
    </ConversationProvider>
  );
}

function Console({
  data,
  ...mic
}: {
  data: LeadConsoleData;
  talk: boolean;
  setTalk: (v: boolean) => void;
  handsFree: boolean;
  setHandsFree: (v: boolean) => void;
}) {
  const router = useRouter();
  const voice = useVoiceLink();
  const [focusId, setFocusId] = useState<string | null>(data.open[0]?.id ?? null);

  // New events from either station refresh the console (debounced), so new cases appear live.
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refresh = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => router.refresh(), 600);
  }, [router]);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);
  const feed = useLiveFeed(data.warehouseId, data.feed, refresh);

  const resolve = async (card: LeadCard, body: ResolveBody): Promise<string | null> => {
    const r = await postJson(`/api/lead/escalations/${card.id}/resolve`, body);
    if (!r.ok) return r.error;
    voice.context(`[screen] The lead resolved the case ${card.refLabel} (${REASON_NB[card.reason] ?? card.reason}): ${body.action}.`);
    router.refresh();
    return null;
  };

  const proposed = data.adjustments.filter((a) => a.status === 'proposed').length;
  const activeAlerts = data.alerts.filter((a) => a.active).length;

  return (
    <>
      <h1 className="text-3xl font-bold">Teamleder</h1>
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Åpne saker" value={data.open.length} testId="stat-open" />
        <Stat label="Lagerkorreksjoner" value={proposed} testId="stat-adjustments" />
        <Stat label="Aktive pakkevarsler" value={activeAlerts} testId="stat-alerts" />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <section className="flex min-w-0 flex-col gap-3">
          <h2 className="text-xl font-semibold">Eskaleringer</h2>
          <ul className="flex flex-col gap-4" data-testid="escalations">
            {data.open.map((c, k) => (
              <EscalationCard key={c.id} card={c} number={k + 1} focused={focusId === c.id} locations={data.locations} onFocus={() => setFocusId(c.id)} onResolve={resolve} />
            ))}
            {data.open.length === 0 && <li className="rounded-2xl bg-white p-6 text-center text-muted shadow-sm">Ingen åpne saker.</li>}
          </ul>
          {data.resolved.length > 0 && (
            <details className="mt-2">
              <summary className="cursor-pointer text-base font-semibold text-muted">Behandlet nylig ({data.resolved.length})</summary>
              <ul className="mt-3 flex flex-col gap-3" data-testid="resolved">
                {data.resolved.map((c) => (
                  <EscalationCard key={c.id} card={c} number={0} focused={false} locations={data.locations} onFocus={() => {}} onResolve={resolve} />
                ))}
              </ul>
            </details>
          )}
        </section>

        <aside className="flex flex-col gap-4">
          <LiveFeed events={feed.events} state={feed.state} />
          <PackAlerts alerts={data.alerts} products={data.products} windowDays={data.windowDays} onDone={() => router.refresh()} />
          <StockAdjustments items={data.adjustments} onDone={() => router.refresh()} />
        </aside>
      </div>

      <div className="sticky bottom-0 -mx-6 mt-auto">
        <LeadVoice cards={data.open} focusId={focusId} setFocusId={setFocusId} {...mic} />
      </div>
    </>
  );
}
