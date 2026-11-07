// The packing agent's client tools: parameter schemas and the short results the agent gets.
// Pure and client-safe. Results contain only what the agent needs to say (addendum section 8):
// catalogue names, counts and what the rule engine decided. Never text read from the photo
// (P5: labels and packing slips are data) and never the model's free-text descriptions.

import { z } from 'zod';
import { productMap } from '@/lib/engine/catalog';
import type { PackDecision, Product } from '@/lib/engine/types';
import { evaluateOrder, linesNeedingLabel, unitCount } from '@/lib/pack/inputs';
import type { PackCaptureResult, PackPhoto, PackView } from '@/lib/pack/types';

export const ToolParams = {
  get_order: z.object({}).loose(),
  show_pack_step: z.object({ step: z.enum(['order', 'box_photo', 'label']), line_number: z.coerce.number().int().min(1).optional() }),
  check_box: z.object({}).loose(),
  check_label: z.object({ line_number: z.coerce.number().int().min(1) }),
} as const;
export type PackToolName = keyof typeof ToolParams;

const json = (v: unknown) => JSON.stringify(v);
export const toolError = (error: string, say?: string) => json({ error, ...(say ? { say } : {}) });

function names(pm: Map<string, Product>, sku: string | null) {
  const p = sku ? pm.get(sku) : undefined;
  return p ? { name_nb: p.nameNb, name_en: p.nameEn, size: p.size ?? null, color: p.color } : null;
}

/** A short colour word from the model, letters only, for an item that is not in the catalogue. */
const safeColor = (c: string) => c.replace(/[^\p{L} -]/gu, '').trim().slice(0, 20) || null;

const NEXT: Record<PackDecision['status'], string> = {
  MISMATCH: 'say what is wrong item by item, ask the worker to fix the box and say check again',
  NEEDS_LABEL_PHOTO: 'ask for a close-up of the size label of the first line in label_needed_for (show_pack_step label, then check_label)',
  RETAKE: 'ask for a new photo of the box',
  VERIFIED: 'say the count and ask the worker to press the green ready to seal button',
  MANUAL_CONFIRM: 'ask the worker to press the green ready to seal button',
};

/** What the decision means for the next turn, in the engine's own terms. */
export function packSummary(view: Pick<PackView, 'order' | 'products' | 'photos' | 'alerts' | 'settings'>, d: PackDecision, photoTaken = true) {
  const pm = productMap(view.products);
  const lineNo = new Map(view.order.lines.map((l, k) => [l.sku, k + 1]));
  const needLabel = linesNeedingLabel(view, d);
  const { seen, ordered } = unitCount(d);
  const vision = [...view.photos].reverse().find((p) => p.purpose === 'pack_check' && p.vision)?.vision;
  return {
    status: photoTaken || d.lines.some((l) => l.method === 'barcode') ? d.status : 'NOT_CHECKED_YET',
    count: { seen, ordered },
    lines: d.lines.map((l) => ({
      line_number: lineNo.get(l.sku),
      item: names(pm, l.sku),
      ordered: l.ordered,
      seen: l.seen,
      state: l.labelSizeMismatch ? 'wrong_size' : l.state,
      ...(l.labelSizeMismatch ? { label_size: l.labelSizeMismatch } : {}),
      size_verified: l.sizeVerified,
      by_barcode: l.method === 'barcode',
      alert: l.alertActive,
    })),
    wrong_items: d.unexpected.map((u) => {
      const item = names(pm, u.sku);
      if (item) return item;
      const i = vision?.items.find((x) => x.box_2d.join() === u.box_2d.join());
      return { name_nb: null, name_en: null, color: i ? safeColor(i.observedColor) : null };
    }),
    label_needed_for: needLabel.map((sku) => ({ line_number: lineNo.get(sku), item: names(pm, sku) })),
    alert: d.lines.some((l) => l.alertActive),
    can_seal: d.canSeal,
    can_manual_confirm: d.canManualConfirm,
    evidence_photo_saved: d.status === 'VERIFIED' && !!vision,
    next: photoTaken ? NEXT[d.status] : 'ask the worker to put everything in the box and say check',
  };
}

export function getOrderResult(view: PackView, now: Date): string {
  const { decision, inputs } = evaluateOrder(view, now);
  return json({
    order_number: view.order.id,
    sealed: view.committed !== null,
    photos_taken: inputs.photosTaken,
    retakes: inputs.retakes,
    ...packSummary(view, decision, inputs.photosTaken > 0),
  });
}

/** The view with one more photo, so a tool can answer before React re-renders. */
export function withPhoto(view: PackView, photo: PackPhoto): PackView {
  return { ...view, photos: [...view.photos, photo] };
}

const FAILURE_SAY: Record<string, string> = {
  timeout: 'The check took too long. Ask for the same photo again, or suggest scanning the barcodes.',
  invalid: 'The photo could not be read. Ask for the same photo again.',
  unavailable: 'The check is not available right now. Ask for the same photo again, or suggest scanning the barcodes.',
  face: 'A face was in the picture, so it was deleted. Ask the worker to point the camera at the box only.',
  upload: 'The photo was not saved. Ask for the same photo again.',
  offline: 'The handheld is offline. Ask the worker to check the network and try again.',
  rate_limited: 'Too many photos in a short time. Ask the worker to wait a moment.',
  already_sealed: 'This order is already sealed.',
  camera_unavailable: 'The camera is not available. Ask the worker to use the buttons.',
  cancelled: 'The worker closed the camera.',
};

export function captureResult(view: PackView, kind: 'box' | 'label', res: PackCaptureResult, now: Date): string {
  const next = res.photo ? withPhoto(view, res.photo) : view;
  const { decision, inputs } = evaluateOrder(next, now);
  const after = packSummary(next, decision, inputs.photosTaken > 0);
  if (!res.ok) return json({ photo: kind, ok: false, problem: res.reason, say: FAILURE_SAY[res.reason], retakes: inputs.retakes, after });
  const l = res.photo.label;
  return json({
    photo: kind,
    ok: true,
    ...(kind === 'label' && l ? { size_read: l.sizeRead, readable: !!l.sizeRead } : {}),
    retakes: inputs.retakes,
    after,
  });
}

export function cameraProblem(kind: 'box' | 'label', reason: 'camera_unavailable' | 'cancelled'): string {
  return json({ photo: kind, ok: false, problem: reason, say: FAILURE_SAY[reason] });
}
