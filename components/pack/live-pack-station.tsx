'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ConversationProvider } from '@elevenlabs/react';
import { useVoiceLink, type VoiceLink } from '@/components/voice/voice-dock';
import type { Lang } from '@/lib/engine/types';
import { livePackPort } from '@/lib/pack/live-port';
import type { PackView } from '@/lib/pack/types';
import { captureResult } from '@/lib/voice/pack-tools';
import { PackStationView } from './pack-station';
import { PackVoice } from './pack-voice';
import { usePackStation, type PackStation } from './use-pack-station';

/**
 * Taps go to the agent as "[screen]" updates, so the coach knows what happened without asking.
 * Tool calls use the unwrapped actions, so nothing is reported twice.
 */
function withTapUpdates(station: PackStation, voice: VoiceLink): PackStation {
  const { actions, view } = station;
  return {
    ...station,
    actions: {
      ...actions,
      capture: async (target, image) => {
        const res = await actions.capture(target, image);
        const kind = target.purpose === 'pack_check' ? 'box' : 'label';
        voice.context(`[screen] The worker took the ${kind} photo by tapping. Result: ${captureResult(view, kind, res, new Date())}`);
        return res;
      },
      scan: async (code) => {
        const res = await actions.scan(code);
        voice.context(`[screen] The worker scanned a barcode. Result: ${res.kind}${'sku' in res ? ` (${res.sku})` : ''}.`);
        return res;
      },
      chooseManual: async (reason) => {
        await actions.chooseManual(reason);
        if (reason) voice.context(`[screen] The worker chose to confirm by hand (reason: ${reason}). The seal button is ready.`);
      },
      seal: async () => {
        const res = await actions.seal();
        if (res.ok) voice.say(`[screen] The worker sealed order ${view.order.id} (${res.committed.status}). The order is done.`);
        return res;
      },
    },
  };
}

export function LivePackStation({ view, lang }: { view: PackView; lang: Lang }) {
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
  view: PackView;
  lang: Lang;
  talk: boolean;
  setTalk: (v: boolean) => void;
  handsFree: boolean;
  setHandsFree: (v: boolean) => void;
}) {
  const router = useRouter();
  const port = useMemo(() => livePackPort(), []);
  const station = usePackStation(view, port);
  const [uiLang, setUiLang] = useState<Lang>(lang);
  const voice = useVoiceLink();

  return (
    <>
      <PackStationView
        station={withTapUpdates(station, voice)}
        lang={uiLang}
        captureMode="camera"
        onBackToQueue={() => {
          router.push('/pack');
          router.refresh();
        }}
      />
      <PackVoice station={station} lang={uiLang} onLangChange={setUiLang} {...mic} />
    </>
  );
}
