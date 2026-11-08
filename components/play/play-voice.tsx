'use client';

import { useTool, VoiceDock } from '@/components/voice/voice-dock';
import type { PackStation } from '@/components/pack/use-pack-station';
import type { Lang } from '@/lib/engine/types';
import { useLatest } from '@/lib/hooks/use-latest';
import { PACK_FIRST_MESSAGES } from '@/lib/voice/agent-config';
import { captureResult, getOrderResult, toolError, ToolParams } from '@/lib/voice/pack-tools';

/**
 * The packing coach in the practice demo. Same agent and same tool names as the live station
 * (lib/voice/agent-config.ts PACK_TOOLS), but "the photo" is the box on screen: check_box and
 * check_label run the practice camera at once. Tool results are built by the same functions
 * as live, so the coach answers exactly as it would at a real bench.
 */
export function PlayVoice({
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
  const sealed = () => stationRef.current.sealed;
  const lineSku = (n: number | undefined) => (n ? stationRef.current.view.order.lines[n - 1]?.sku : undefined);

  useTool('get_order', () => getOrderResult(stationRef.current.view, new Date()));

  // Nothing to open in practice mode: the box and the order are always on screen.
  useTool('show_pack_step', (raw) => {
    const p = ToolParams.show_pack_step.safeParse(raw);
    if (!p.success) return toolError('bad_parameters');
    if (sealed()) return toolError('sealed', 'This order is already sealed.');
    if (p.data.step === 'label' && !lineSku(p.data.line_number)) return toolError('no_such_line', `The order has ${stationRef.current.view.order.lines.length} lines.`);
    return JSON.stringify({ ok: true, step: p.data.step });
  });

  useTool('check_box', async () => {
    if (sealed()) return toolError('sealed', 'This order is already sealed.');
    const cur = stationRef.current;
    const res = await cur.actions.capture({ purpose: 'pack_check' }, null);
    return captureResult(cur.view, 'box', res, new Date());
  });

  useTool('check_label', async (raw) => {
    const p = ToolParams.check_label.safeParse(raw);
    if (!p.success) return toolError('bad_parameters');
    if (sealed()) return toolError('sealed', 'This order is already sealed.');
    const sku = lineSku(p.data.line_number);
    if (!sku) return toolError('no_such_line', `The order has ${stationRef.current.view.order.lines.length} lines.`);
    const cur = stationRef.current;
    const res = await cur.actions.capture({ purpose: 'label_closeup', sku }, null);
    return captureResult(cur.view, 'label', res, new Date());
  });

  const id = station.view.order.id;
  return (
    <VoiceDock
      station="pack"
      tokenUrl="/api/play/voice/token"
      connectContext={`[screen] This is the public practice demo on a web page, not a real warehouse. There is no camera: the visitor taps items from a shelf on screen into a box on screen, and check_box and check_label check that box. Help them pack order ${id}. They may put a wrong item in on purpose to see what happens: say calmly what is wrong and how to fix it.`}
      dynamicVariables={{ order_number: id }}
      firstMessage={(l) => PACK_FIRST_MESSAGES[l].replace('{{order_number}}', id)}
      lang={lang}
      onLangChange={onLangChange}
      talk={talk}
      setTalk={setTalk}
      handsFree={handsFree}
      setHandsFree={setHandsFree}
    />
  );
}
