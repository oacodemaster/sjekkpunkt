'use client';

import { sleep, useTool, VoiceDock, waitFor } from '@/components/voice/voice-dock';
import type { Lang } from '@/lib/engine/types';
import { useLatest } from '@/lib/hooks/use-latest';
import { PACK_FIRST_MESSAGES } from '@/lib/voice/agent-config';
import { cameraProblem, captureResult, getOrderResult, toolError, ToolParams } from '@/lib/voice/pack-tools';
import type { PackCameraTarget, PackStation } from './use-pack-station';

const sameTarget = (a: PackCameraTarget | null, b: PackCameraTarget) =>
  !!a && a.purpose === b.purpose && (a.purpose === 'pack_check' || (b.purpose === 'label_closeup' && a.sku === b.sku));

/**
 * Voice coach for the packing station. Must sit inside a ConversationProvider. The agent can open
 * the camera and take the photos the worker asks for; sealing, barcode scans and manual confirms
 * stay taps.
 */
export function PackVoice({
  station,
  lang,
  onLangChange,
  talk,
  setTalk,
  handsFree,
  setHandsFree,
}: {
  station: PackStation;
  lang: Lang;
  onLangChange: (l: Lang) => void;
  talk: boolean;
  setTalk: (v: boolean) => void;
  handsFree: boolean;
  setHandsFree: (v: boolean) => void;
}) {
  const stationRef = useLatest(station);

  const lineSku = (n: number | undefined) => (n ? stationRef.current.view.order.lines[n - 1]?.sku : undefined);
  const sealed = () => stationRef.current.sealed;

  /** Opens the camera on the target if needed, gives the worker a visible 2-1 to aim, then shoots. */
  async function shoot(target: PackCameraTarget, kind: 'box' | 'label'): Promise<string> {
    const s = stationRef.current;
    const onTarget = sameTarget(s.camera, target);
    const aimed = onTarget && s.cameraControl.current?.state === 'live';
    if (!onTarget) s.actions.openCamera(target);
    const ctrl = await waitFor(() => {
      const c = stationRef.current.cameraControl.current;
      return c && c.state !== 'starting' ? c : null;
    }, 8000);
    if (!ctrl) return cameraProblem(kind, stationRef.current.camera ? 'camera_unavailable' : 'cancelled');
    if (ctrl.state !== 'live') return cameraProblem(kind, 'camera_unavailable');
    if (!aimed) {
      for (const n of [2, 1]) {
        stationRef.current.actions.setCountdown(n);
        await sleep(800);
      }
      stationRef.current.actions.setCountdown(null);
    }
    const live = stationRef.current.cameraControl.current;
    if (!live) return cameraProblem(kind, 'cancelled');
    const jpeg = await live.shoot();
    if (!jpeg) return cameraProblem(kind, 'camera_unavailable');
    const cur = stationRef.current;
    const res = await cur.actions.capture(target, jpeg);
    return captureResult(cur.view, kind, res, new Date());
  }

  // ---------- client tools (names and parameters: lib/voice/agent-config.ts PACK_TOOLS) ----------

  useTool('get_order', () => getOrderResult(stationRef.current.view, new Date()));

  useTool('show_pack_step', (raw) => {
    const p = ToolParams.show_pack_step.safeParse(raw);
    if (!p.success) return toolError('bad_parameters');
    if (sealed()) return toolError('sealed', 'This order is already sealed.');
    const s = stationRef.current;
    if (p.data.step === 'order') s.actions.closeCamera();
    else if (p.data.step === 'box_photo') s.actions.openCamera({ purpose: 'pack_check' });
    else {
      const sku = lineSku(p.data.line_number);
      if (!sku) return toolError('no_such_line', `The order has ${s.view.order.lines.length} lines.`);
      s.actions.openCamera({ purpose: 'label_closeup', sku });
    }
    return JSON.stringify({ ok: true, step: p.data.step });
  });

  useTool('check_box', async () => {
    if (sealed()) return toolError('sealed', 'This order is already sealed.');
    return shoot({ purpose: 'pack_check' }, 'box');
  });

  useTool('check_label', async (raw) => {
    const p = ToolParams.check_label.safeParse(raw);
    if (!p.success) return toolError('bad_parameters');
    if (sealed()) return toolError('sealed', 'This order is already sealed.');
    const sku = lineSku(p.data.line_number);
    if (!sku) return toolError('no_such_line', `The order has ${stationRef.current.view.order.lines.length} lines.`);
    return shoot({ purpose: 'label_closeup', sku }, 'label');
  });

  return (
    <VoiceDock
      station="pack"
      dynamicVariables={{ order_number: station.view.order.id }}
      firstMessage={(l) => PACK_FIRST_MESSAGES[l].replace('{{order_number}}', station.view.order.id)}
      lang={lang}
      onLangChange={onLangChange}
      talk={talk}
      setTalk={setTalk}
      handsFree={handsFree}
      setHandsFree={setHandsFree}
    />
  );
}
