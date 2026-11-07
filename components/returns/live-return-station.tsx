'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ConversationProvider } from '@elevenlabs/react';
import { confirmEarcon, returnFlagEarcon } from '@/lib/audio/earcons';
import { playEarcon } from '@/lib/audio/player';
import type { Lang, ReturnFlag } from '@/lib/engine/types';
import { livePort } from '@/lib/returns/live-port';
import type { ReturnView } from '@/lib/returns/types';
import { capturePhotoResult } from '@/lib/voice/returns-tools';
import { ReturnStationView } from './return-station';
import { ReturnVoice, useVoiceLink, type VoiceLink } from './return-voice';
import { useReturnStation, type ReturnStation } from './use-return-station';

/** Earcons for taps and voice tool calls alike: done when a return item is confirmed. */
function withEarcons(station: ReturnStation): ReturnStation {
  const { actions } = station;
  return {
    ...station,
    actions: {
      ...actions,
      confirm: async () => {
        const res = await actions.confirm();
        const e = confirmEarcon(res);
        if (e) playEarcon(e);
        return res;
      },
    },
  };
}

/**
 * Taps go to the agent as "[screen]" updates, so the coach knows what happened without
 * asking. Tool calls use the unwrapped actions, so nothing is reported twice.
 */
function withTapUpdates(station: ReturnStation, voice: VoiceLink): ReturnStation {
  const { actions, item, view } = station;
  const n = item.index + 1;
  return {
    ...station,
    actions: {
      ...actions,
      capture: async (purpose, image) => {
        const res = await actions.capture(purpose, image);
        // A turn the coach answers: it says what the photo showed and asks for the next one (brief RET-05).
        voice.say(`[screen] The worker took the ${purpose} photo of item ${n} by tapping. Result: ${capturePhotoResult(view, item.id, purpose, res, new Date())}`);
        return res;
      },
      setWorker: (patch) => {
        actions.setWorker(patch);
        voice.context(`[screen] The worker tapped condition for item ${n}: ${JSON.stringify(patch)}`);
      },
      confirm: async () => {
        const res = await actions.confirm();
        if (res.ok) {
          const c = res.committed;
          const open = view.items.filter((i) => i.id !== item.id && i.status !== 'decided' && i.status !== 'escalated').map((i) => i.index + 1);
          voice.say(
            `[screen] The worker pressed confirm for item ${n}. Saved: grade ${c.grade}, shelf ${c.locationCode}, refund ${c.refundNok === null ? 'decided by team lead' : `${c.refundNok} kr`}. ` +
              (open.length ? `Open items: ${open.join(', ')}.` : 'All items in this return are done.'),
          );
        }
        return res;
      },
      escalate: async (note, lang) => {
        const res = await actions.escalate(note, lang);
        if (res.ok) voice.context(`[screen] The worker sent item ${n} to the team lead by tapping.`);
        return res;
      },
      selectItem: (idx) => {
        actions.selectItem(idx);
        voice.context(`[screen] The worker switched to item ${idx + 1}.`);
      },
    },
  };
}

export function LiveReturnStation({ view, lang }: { view: ReturnView; lang: Lang }) {
  const [talk, setTalk] = useState(false);
  const [handsFree, setHandsFree] = useState(false);
  return (
    // Push-to-talk: the mic is muted unless the button is held or hands-free is on.
    <ConversationProvider isMuted={!(talk || handsFree)}>
      <StationWithVoice view={view} lang={lang} talk={talk} setTalk={setTalk} handsFree={handsFree} setHandsFree={setHandsFree} />
    </ConversationProvider>
  );
}

function StationWithVoice({
  view,
  lang,
  ...mic
}: {
  view: ReturnView;
  lang: Lang;
  talk: boolean;
  setTalk: (v: boolean) => void;
  handsFree: boolean;
  setHandsFree: (v: boolean) => void;
}) {
  const router = useRouter();
  const port = useMemo(() => livePort(), []);
  const raw = useReturnStation(view, port);
  const station = withEarcons(raw);
  const [uiLang, setUiLang] = useState<Lang>(lang);
  const voice = useVoiceLink();
  // Alert when a photo raises a new red flag on the item in front of the worker.
  const flags = raw.decision.flags.join(',');
  const seen = useRef<{ item: string; flags: ReturnFlag[] } | null>(null);
  useEffect(() => {
    const now = (flags ? flags.split(',') : []) as ReturnFlag[];
    const e = seen.current?.item === raw.item.id ? returnFlagEarcon(seen.current.flags, now) : null;
    if (e) playEarcon(e);
    seen.current = { item: raw.item.id, flags: now };
  }, [flags, raw.item.id]);

  return (
    <>
      <ReturnStationView
        station={withTapUpdates(station, voice)}
        lang={uiLang}
        captureMode="camera"
        onBackToQueue={() => {
          router.push('/return');
          router.refresh();
        }}
      />
      <ReturnVoice station={station} lang={uiLang} onLangChange={setUiLang} {...mic} />
    </>
  );
}
