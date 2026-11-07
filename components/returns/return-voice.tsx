'use client';

import { useRef } from 'react';
import type { Lang } from '@/lib/engine/types';
import { useLatest } from '@/lib/hooks/use-latest';
import { previewItem } from '@/lib/returns/preview';
import { FIRST_MESSAGES } from '@/lib/voice/agent-config';
import {
  cameraProblem,
  capturePhotoResult,
  decisionSummary,
  getReturnResult,
  PHOTO_PURPOSES,
  toolError,
  ToolParams,
  withWorker,
  workerPatch,
} from '@/lib/voice/returns-tools';
import { sleep, useTool, VoiceDock, waitFor } from '@/components/voice/voice-dock';
import type { ReturnStation } from './use-return-station';

export { useVoiceLink, type VoiceLink, type VoiceState } from '@/components/voice/voice-dock';

/**
 * Voice coach for the returns station. Must sit inside a ConversationProvider. Voice is an extra:
 * every step still has its button, and mic denial or an unavailable service leaves tap-only mode.
 */
export function ReturnVoice({
  station,
  lang,
  onLangChange,
  talk,
  setTalk,
  handsFree,
  setHandsFree,
}: {
  station: ReturnStation;
  /** the worker's current language: starts from preferred_lang, flips when the agent switches */
  lang: Lang;
  onLangChange: (l: Lang) => void;
  talk: boolean;
  setTalk: (v: boolean) => void;
  handsFree: boolean;
  setHandsFree: (v: boolean) => void;
}) {
  // Latest values for async tool handlers.
  const stationRef = useLatest(station);
  const langRef = useLatest(lang);
  const lastWorkerLine = useRef<string | null>(null);

  // ---------- client tools (names and parameters: lib/voice/agent-config.ts) ----------

  const itemDone = () => {
    const s = stationRef.current;
    return s.item.status === 'decided' || s.item.status === 'escalated';
  };

  useTool('get_return', () => {
    const s = stationRef.current;
    return getReturnResult(s.view, s.item, new Date());
  });

  useTool('show_step', (raw) => {
    const p = ToolParams.show_step.safeParse(raw);
    if (!p.success) return toolError('bad_parameters');
    const s = stationRef.current;
    const step = p.data.step;
    if ((PHOTO_PURPOSES as readonly string[]).includes(step)) {
      if (itemDone()) return toolError('item_done', 'This item is already done.');
      s.actions.selectStep(step as (typeof PHOTO_PURPOSES)[number]);
      s.actions.openCamera();
    } else {
      s.actions.closeCamera();
      s.actions.setPhase(step === 'overview' ? 'overview' : (step as 'findings' | 'decision'));
    }
    return JSON.stringify({ ok: true, step });
  });

  useTool('capture_photo', async (raw) => {
    const p = ToolParams.capture_photo.safeParse(raw);
    if (!p.success) return toolError('bad_parameters');
    if (itemDone()) return toolError('item_done', 'This item is already done.');
    const purpose = p.data.purpose;
    const s = stationRef.current;
    const onStep = s.cameraOpen && s.activeStep === purpose;
    const aimed = onStep && s.cameraControl.current?.state === 'live';
    if (!onStep) {
      s.actions.selectStep(purpose);
      s.actions.openCamera();
    }
    const ctrl = await waitFor(() => {
      const c = stationRef.current.cameraControl.current;
      return c && c.state !== 'starting' ? c : null;
    }, 8000);
    if (!ctrl) return cameraProblem(purpose, stationRef.current.cameraOpen ? 'camera_unavailable' : 'cancelled');
    if (ctrl.state !== 'live') return cameraProblem(purpose, 'camera_unavailable');
    // The camera just opened: give the worker a visible moment to aim before the shot.
    if (!aimed) {
      for (const n of [2, 1]) {
        stationRef.current.actions.setCountdown(n);
        await sleep(800);
      }
      stationRef.current.actions.setCountdown(null);
    }
    const live = stationRef.current.cameraControl.current;
    if (!live) return cameraProblem(purpose, 'cancelled');
    const jpeg = await live.shoot();
    if (!jpeg) return cameraProblem(purpose, 'camera_unavailable');
    const cur = stationRef.current;
    const res = await cur.actions.capture(purpose, jpeg);
    return capturePhotoResult(cur.view, cur.item.id, purpose, res, new Date());
  });

  useTool('evaluate_return', async (raw) => {
    const p = ToolParams.evaluate_return.safeParse(raw);
    if (!p.success) return toolError('bad_parameters');
    if (itemDone()) return toolError('item_done', 'This item is already done.');
    const s = stationRef.current;
    // The note is stored as the worker spoke it (speech to text), not as the agent paraphrased it.
    const text = p.data.note ? (lastWorkerLine.current ?? p.data.note) : undefined;
    const { worker, decision } = await s.actions.applyWorker(workerPatch(p.data), text ? { text, lang: langRef.current } : undefined);
    const cur = stationRef.current;
    cur.actions.closeCamera();
    cur.actions.setPhase('decision');
    const view = withWorker(cur.view, cur.item.id, worker);
    const item = view.items.find((i) => i.id === cur.item.id)!;
    return JSON.stringify(decisionSummary(view, decision ?? previewItem(view, item, new Date()).decision));
  });

  useTool('select_item', (raw) => {
    const p = ToolParams.select_item.safeParse(raw);
    if (!p.success) return toolError('bad_parameters');
    const s = stationRef.current;
    const idx = p.data.item_number - 1;
    const item = s.view.items[idx];
    if (!item) return toolError('no_such_item', `This return has ${s.view.items.length} items.`);
    s.actions.selectItem(idx);
    return getReturnResult(s.view, item, new Date());
  });

  useTool('escalate_to_lead', async (raw) => {
    const p = ToolParams.escalate_to_lead.safeParse(raw);
    if (!p.success) return toolError('bad_parameters');
    if (itemDone()) return toolError('item_done', 'This item is already done.');
    const res = await stationRef.current.actions.escalate(p.data.reason, langRef.current);
    return res.ok ? JSON.stringify({ sent_to_team_lead: true }) : toolError(res.error, 'It was not sent. Ask the worker to press "Send til teamleder".');
  });

  return (
    <VoiceDock
      station="return"
      dynamicVariables={{ return_number: station.view.ret.id }}
      firstMessage={(l) => FIRST_MESSAGES[l].replace('{{return_number}}', station.view.ret.id)}
      lang={lang}
      onLangChange={onLangChange}
      onWorkerLine={(text) => (lastWorkerLine.current = text)}
      talk={talk}
      setTalk={setTalk}
      handsFree={handsFree}
      setHandsFree={setHandsFree}
    />
  );
}
