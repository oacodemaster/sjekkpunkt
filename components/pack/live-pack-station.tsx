'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ConversationProvider } from '@elevenlabs/react';
import { useVoiceLink, type VoiceLink } from '@/components/voice/voice-dock';
import { packCaptureEarcon, scanEarcon } from '@/lib/audio/earcons';
import { playEarcon } from '@/lib/audio/player';
import type { Lang } from '@/lib/engine/types';
import { livePackPort } from '@/lib/pack/live-port';
import type { PackView } from '@/lib/pack/types';
import { captureResult } from '@/lib/voice/pack-tools';
import { PackStationView } from './pack-station';
import { PackVoice } from './pack-voice';
import { usePackStation, type PackStation } from './use-pack-station';

/**
 * Earcons for taps and voice tool calls alike: alert when a photo or scan shows a wrong item.
 * The chime for a passed check plays when the decision turns VERIFIED, whichever way it did.
 */
function withEarcons(station: PackStation): PackStation {
  const { actions } = station;
  return {
    ...station,
    actions: {
      ...actions,
      capture: async (target, image) => {
        const res = await actions.capture(target, image);
        if (packCaptureEarcon(res) === 'alert') playEarcon('alert');
        return res;
      },
      scan: async (code) => {
        const res = await actions.scan(code);
        const e = scanEarcon(res);
        if (e) playEarcon(e);
        return res;
      },
    },
  };
}

/**
 * Taps go to the agent as "[screen]" updates, so the coach knows what happened without asking.
 * Photo results and the seal are turns the coach answers; scans and the manual reason are
 * silent context. Tool calls use the unwrapped actions, so nothing is reported twice.
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
        // A turn the coach answers: a check result is what the worker needs to hear (brief PACK-05).
        voice.say(`[screen] The worker took the ${kind} photo by tapping. Result: ${captureResult(view, kind, res, new Date())}`);
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

export function LivePackStation({ view, lang, languages }: { view: PackView; lang: Lang; languages?: readonly Lang[] }) {
  const [talk, setTalk] = useState(false);
  const [handsFree, setHandsFree] = useState(false);
  return (
    // Push-to-talk: the mic is muted unless the button is held or hands-free is on.
    <ConversationProvider isMuted={!(talk || handsFree)}>
      <StationWithVoice view={view} lang={lang} languages={languages} talk={talk} setTalk={setTalk} handsFree={handsFree} setHandsFree={setHandsFree} />
    </ConversationProvider>
  );
}

function StationWithVoice({
  view,
  lang,
  languages,
  ...mic
}: {
  view: PackView;
  lang: Lang;
  languages?: readonly Lang[];
  talk: boolean;
  setTalk: (v: boolean) => void;
  handsFree: boolean;
  setHandsFree: (v: boolean) => void;
}) {
  const router = useRouter();
  const port = useMemo(() => livePackPort(), []);
  const raw = usePackStation(view, port);
  const station = withEarcons(raw);
  const [uiLang, setUiLang] = useState<Lang>(lang);
  // The header's language switcher changes the worker's language: follow it without a reload.
  const [fromHeader, setFromHeader] = useState<Lang>(lang);
  if (lang !== fromHeader) {
    setFromHeader(lang);
    setUiLang(lang);
  }
  const voice = useVoiceLink();
  const status = raw.decision.status;
  const lastStatus = useRef(status);
  useEffect(() => {
    if (status === 'VERIFIED' && lastStatus.current !== 'VERIFIED') playEarcon('chime');
    lastStatus.current = status;
  }, [status]);

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
        dock={<PackVoice station={station} lang={uiLang} onLangChange={setUiLang} languages={languages} {...mic} />}
      />
    </>
  );
}
