// Which earcon a live station plays (brief appendix C): chime when a check passes, alert when it
// fails, done when a return is confirmed. The tool tick lives in the voice dock. Pure, so tested.

import type { EarconName } from '@/lib/demo/audio';
import type { PackCaptureResult, ScanResult } from '@/lib/pack/types';
import type { ConfirmResult } from '@/lib/returns/types';
import type { ReturnFlag } from '@/lib/engine/types';

export function packCaptureEarcon(res: PackCaptureResult): EarconName | null {
  if (res.decision?.status === 'VERIFIED') return 'chime';
  if (res.decision?.status === 'MISMATCH') return 'alert';
  return null;
}

export function scanEarcon(res: ScanResult): EarconName | null {
  return res.kind === 'not_in_order' ? 'alert' : null;
}

export const confirmEarcon = (res: ConfirmResult): EarconName | null => (res.ok ? 'done' : null);

/** A photo that raised a new red flag on the item (wrong item, a suspicious note) fails the check. */
const FAILING: ReturnFlag[] = ['wrong_item', 'suspicious_note'];
export function returnFlagEarcon(before: ReturnFlag[], after: ReturnFlag[]): EarconName | null {
  return after.some((f) => FAILING.includes(f) && !before.includes(f)) ? 'alert' : null;
}
