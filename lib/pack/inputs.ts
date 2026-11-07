// Turns the photos and scans of one order into engine inputs. Pure, so the server (seal rerun,
// R16), the live preview and demo mode all pick photos and count retakes the same way.

import { isSizeVariant, productMap } from '@/lib/engine/catalog';
import { withDefaults } from '@/lib/engine/constants';
import { activeAlertFor } from '@/lib/engine/loop';
import { evaluatePack } from '@/lib/engine/pack';
import type { LabelCheck, ManualReason, PackDecision, PackVision } from '@/lib/engine/types';
import type { PackPhoto, PackView } from './types';

export interface PackInputs {
  vision: PackVision | null;
  visionTimedOut: boolean;
  labelChecks: LabelCheck[];
  retakes: number;
  faceDiscards: number;
  /** the overview photo the decision is based on (the evidence photo when it verifies) */
  overview: PackPhoto | null;
  photosTaken: number;
}

/**
 * - The latest overview photo decides; one that timed out or failed counts as a timeout (P9),
 *   so nothing earlier can verify the box after a failed retake.
 * - Label close-ups all count; the engine uses the latest per order line.
 * - Retakes (P8) are every analysed photo after the first, overview or label. Three photos =
 *   two retakes = manual confirm may be offered.
 * - Photos with a face never count (they are deleted at once).
 */
export function packInputs(photos: PackPhoto[]): PackInputs {
  const sorted = [...photos].sort((a, b) => a.takenAt.localeCompare(b.takenAt));
  const usable = sorted.filter((p) => !p.facesDiscarded && !p.vision?.facePresent);
  const overview = usable.filter((p) => p.purpose === 'pack_check').at(-1) ?? null;
  return {
    vision: overview?.vision ?? null,
    visionTimedOut: !!overview && !overview.vision,
    labelChecks: usable.filter((p) => p.purpose === 'label_closeup' && p.label).map((p) => p.label!),
    retakes: Math.max(0, usable.length - 1),
    faceDiscards: sorted.length - usable.length,
    overview,
    photosTaken: usable.length,
  };
}

/** The engine run for an order, from its photos and scans: the same on client, server and demo. */
export function evaluateOrder(view: Pick<PackView, 'order' | 'photos' | 'scans' | 'alerts' | 'products' | 'settings'>, now: Date, manualReason?: ManualReason) {
  const inputs = packInputs(view.photos);
  const decision = evaluatePack(view.order, inputs.vision, view.alerts, {
    products: view.products,
    now,
    barcodeScans: view.scans,
    labelChecks: inputs.labelChecks,
    retakes: inputs.retakes,
    visionTimedOut: inputs.visionTimedOut,
    manualReason,
    settings: view.settings,
  });
  return { decision, inputs };
}

/**
 * Order lines that still need a size label close-up (or a barcode scan): a line with an active
 * alert until a label shows the right size (P4), a size-variant line whose size was not read
 * (P3), or a present line the camera was unsure about.
 */
export function linesNeedingLabel(view: Pick<PackView, 'products' | 'photos' | 'alerts' | 'settings'>, decision: PackDecision): string[] {
  if (decision.status === 'MISMATCH' || decision.status === 'VERIFIED' || decision.status === 'MANUAL_CONFIRM') return [];
  const s = withDefaults(view.settings);
  const pm = productMap(view.products);
  const labels = packInputs(view.photos).labelChecks;
  return decision.lines
    .filter((l) => {
      if (l.method === 'barcode') return false;
      const p = pm.get(l.sku);
      const label = [...labels].reverse().find((c) => c.sku === l.sku);
      const labelOk = !!label && label.confidence >= s.packConfidenceMin && !!label.sizeRead && label.sizeRead.trim().toUpperCase() === p?.size?.trim().toUpperCase();
      if (activeAlertFor(view.alerts, l.sku)) return !labelOk;
      if (p && isSizeVariant(p, view.products) && !l.sizeVerified) return true;
      return l.state === 'present' && l.confidence < s.packConfidenceMin;
    })
    .map((l) => l.sku);
}

/** Units seen and ordered across all lines ("2 av 2"). Extras do not count as seen. */
export function unitCount(decision: PackDecision): { seen: number; ordered: number } {
  return decision.lines.reduce((n, l) => ({ seen: n.seen + Math.min(l.seen, l.ordered), ordered: n.ordered + l.ordered }), { seen: 0, ordered: 0 });
}
