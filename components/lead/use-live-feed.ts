'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import type { FeedEvent } from '@/lib/lead/types';
import { createClient } from '@/lib/supabase/client';

export type FeedState = 'connecting' | 'live' | 'off';

/**
 * The live feed: audit rows broadcast by the database to the private channel feed:<warehouse>
 * (reduced rows: no payload, no device, no user). Only leads and admins of the warehouse may join
 * (RLS on realtime.messages). `onEvent` runs for every new event, so the console can refresh.
 */
export function useLiveFeed(warehouseId: string, initial: FeedEvent[], onEvent: () => void) {
  const [live, setLive] = useState<FeedEvent[]>([]);
  const [state, setState] = useState<FeedState>('connecting');
  const onEventRef = useRef(onEvent);
  useEffect(() => {
    onEventRef.current = onEvent;
  });

  useEffect(() => {
    const supabase = createClient();
    let channel: RealtimeChannel | null = null;
    let cancelled = false;
    void (async () => {
      await supabase.realtime.setAuth();
      if (cancelled) return;
      channel = supabase
        .channel(`feed:${warehouseId}`, { config: { private: true } })
        .on('broadcast', { event: 'audit' }, (msg) => {
          const e = msg.payload as FeedEvent;
          if (!e?.id) return;
          setLive((prev) => [e, ...prev.filter((x) => x.id !== e.id)].slice(0, 40));
          onEventRef.current();
        })
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') setState('live');
          else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') setState('off');
        });
    })();
    return () => {
      cancelled = true;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [warehouseId]);

  // Server rows (after a refresh) and broadcast rows, newest first, each once.
  const events = useMemo(() => {
    const byId = new Map<string, FeedEvent>();
    for (const e of [...live, ...initial]) if (!byId.has(e.id)) byId.set(e.id, e);
    return [...byId.values()].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 30);
  }, [live, initial]);

  return { events, state };
}
