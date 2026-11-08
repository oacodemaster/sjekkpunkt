// PackPort for the practice demo: the on-screen box instead of a camera, the engine in the
// browser instead of the API. Nothing is stored and nothing leaves the page.

import { productMap } from '@/lib/engine/catalog';
import type { ManualReason } from '@/lib/engine/types';
import { evaluateOrder } from '@/lib/pack/inputs';
import type { PackCaptureResult, PackPhoto, PackPort, PackView, ScanResult, SealResult } from '@/lib/pack/types';
import { boxSignature, boxVision, labelRead, type BoxUnit } from './camera';

/** Long enough to read "Sjekker…", short enough not to bore. */
export const PLAY_CHECK_MS = 700;

export type PlayPort = PackPort & {
  /** The screen's current box and view; the port reads them when a check runs (tap or voice). */
  sync: (box: BoxUnit[], view: PackView) => void;
};

export function createPlayPort({
  initialView,
  onOverview,
  delayMs = PLAY_CHECK_MS,
}: {
  initialView: PackView;
  /** told the box fingerprint at each overview check, so the screen knows when the box changed */
  onOverview?: (signature: string) => void;
  delayMs?: number;
}): PlayPort {
  let n = 0;
  let current = { box: [] as BoxUnit[], view: initialView };
  const getBox = () => current.box;
  const getView = () => current.view;
  const wait = () => new Promise((r) => setTimeout(r, delayMs));

  return {
    sync: (box, view) => {
      current = { box, view };
    },
    mode: 'demo',
    async capture(_orderKey, purpose, _image, sku): Promise<PackCaptureResult> {
      const view = getView();
      if (view.committed) return { ok: false, reason: 'already_sealed' };
      const box = getBox();
      await wait();
      const photo: PackPhoto = {
        photoId: `play-${Date.now()}-${++n}`,
        purpose,
        sku: purpose === 'label_closeup' ? (sku ?? null) : null,
        url: null,
        takenAt: new Date().toISOString(),
        vision: purpose === 'pack_check' ? boxVision(box, view.order, view.products) : null,
        label: purpose === 'label_closeup' && sku ? labelRead(box, sku, view.order, view.products) : null,
        facesDiscarded: false,
        model: 'practice',
      };
      if (purpose === 'pack_check') onOverview?.(boxSignature(box));
      const { decision } = evaluateOrder({ ...view, photos: [...view.photos, photo] }, new Date());
      return { ok: true, photo, decision };
    },

    async scan(_orderKey, code): Promise<ScanResult> {
      const view = getView();
      if (view.committed) return { kind: 'error', error: 'already_sealed' };
      const p = [...productMap(view.products).values()].find((x) => x.barcode === code.trim() || x.sku === code.trim().toUpperCase());
      if (!p) return { kind: 'unknown_code' };
      const line = view.order.lines.find((l) => l.sku === p.sku);
      if (!line) return { kind: 'not_in_order', sku: p.sku };
      if (view.scans.filter((s) => s === p.sku).length >= line.qty) return { kind: 'already_counted', sku: p.sku };
      return { kind: 'counted', sku: p.sku };
    },

    async manual(_orderKey, reason: ManualReason) {
      return evaluateOrder(getView(), new Date(), reason).decision;
    },

    async seal(_orderKey, manualReason): Promise<SealResult> {
      const view = getView();
      if (view.committed) return { ok: false, error: 'already_sealed' };
      const { decision, inputs } = evaluateOrder(view, new Date(), manualReason);
      if (!decision.canSeal) return { ok: false, error: 'not_ready', decision };
      return {
        ok: true,
        decision,
        committed: {
          status: decision.status === 'MANUAL_CONFIRM' ? 'MANUAL_CONFIRM' : 'VERIFIED',
          method: decision.method,
          sizeVerified: decision.sizeVerified,
          manualReason: decision.status === 'MANUAL_CONFIRM' ? (manualReason ?? null) : null,
          evidencePhotoId: decision.status === 'VERIFIED' ? (inputs.overview?.photoId ?? null) : null,
          sealedAt: new Date().toISOString(),
        },
      };
    },
  };
}
