'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ConversationProvider } from '@elevenlabs/react';
import { EmptyState } from '@/components/ui';
import { Stat } from '@/components/ui/stat';
import { useVoiceLink } from '@/components/voice/voice-dock';
import { REASON_NB } from '@/lib/lead/plan';
import type { LeadCard, LeadConsoleData } from '@/lib/lead/types';
import { EscalationCard, postJson, type ResolveBody } from './escalation-card';
import { LeadVoice } from './lead-voice';
import { LiveFeed, PackAlerts, StockAdjustments } from './side-panels';
import { useLiveFeed } from './use-live-feed';

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
      <h1 className="type-title m-0">Teamleder</h1>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label="Åpne saker" value={data.open.length} testId="stat-open" />
        <Stat label="Lagerkorreksjoner" value={proposed} testId="stat-adjustments" />
        <Stat label="Aktive pakkevarsler" value={activeAlerts} testId="stat-alerts" />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <section className="flex min-w-0 flex-col gap-3">
          <h2 className="type-desk-title m-0">Eskaleringer</h2>
          <ul className="m-0 flex list-none flex-col gap-4 p-0" data-testid="escalations">
            {data.open.map((c, k) => (
              <EscalationCard key={c.id} card={c} number={k + 1} focused={focusId === c.id} locations={data.locations} onFocus={() => setFocusId(c.id)} onResolve={resolve} />
            ))}
            {data.open.length === 0 && (
              <li>
                <EmptyState title="Ingen åpne saker." text="Nye eskaleringer fra stasjonene kommer hit." />
              </li>
            )}
          </ul>
          {data.resolved.length > 0 && (
            <details className="mt-2">
              <summary className="type-dense-strong flex min-h-target-desk cursor-pointer items-center text-ink-2">Behandlet nylig ({data.resolved.length})</summary>
              <ul className="m-0 mt-3 flex list-none flex-col gap-3 p-0" data-testid="resolved">
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

      <div className="sticky bottom-0 z-10 -mx-4 mt-auto border-t-2 border-line bg-surface px-4 py-3 sm:-mx-8 sm:px-8">
        <LeadVoice cards={data.open} focusId={focusId} setFocusId={setFocusId} {...mic} />
      </div>
    </>
  );
}
