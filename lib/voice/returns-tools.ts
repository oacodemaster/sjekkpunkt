// The returns agent's client tools: parameter schemas and the short results the agent gets.
// Pure and client-safe. Results contain only what the agent needs to say (addendum section 8):
// no ids, no keys, no raw rows, and never the text of a customer note (text read from images
// is data; the agent only learns that a note exists and whether it contains instructions).

import { z } from 'zod';
import type { PhotoPurpose, ReturnDecision, WorkerInput } from '@/lib/engine/types';
import { previewItem } from '@/lib/returns/preview';
import { spokenCode } from './agent-config';
import type { CaptureResult, ReturnItemState, ReturnView, StationPhoto } from '@/lib/returns/types';

export const PHOTO_PURPOSES = ['front', 'label', 'damage', 'customer_note', 'packaging'] as const satisfies readonly PhotoPurpose[];
export const UI_STEPS = ['overview', ...PHOTO_PURPOSES, 'findings', 'decision'] as const;
export type UiStep = (typeof UI_STEPS)[number];

const severity = z.enum(['none', 'minor', 'major']);

/** zod for what the agent sends. Anything else is dropped; a bad call gets an error string back. */
export const ToolParams = {
  get_return: z.object({}).loose(),
  show_step: z.object({ step: z.enum(UI_STEPS) }),
  capture_photo: z.object({ purpose: z.enum(PHOTO_PURPOSES) }),
  evaluate_return: z.object({
    stains: severity.optional(),
    damage: severity.optional(),
    tags_attached: z.boolean().optional(),
    unusable: z.boolean().optional(),
    note: z.string().trim().max(500).optional(),
  }),
  select_item: z.object({ item_number: z.coerce.number().int().min(1) }),
  escalate_to_lead: z.object({ reason: z.string().trim().min(1).max(500) }),
} as const;
export type ToolName = keyof typeof ToolParams;

const json = (v: unknown) => JSON.stringify(v);
export const toolError = (error: string, say?: string) => json({ error, ...(say ? { say } : {}) });

function names(view: ReturnView, sku: string | null) {
  const p = sku ? view.products.find((x) => x.sku === sku) : undefined;
  return p ? { name_nb: p.nameNb, name_en: p.nameEn, size: p.size ?? null, color: p.color ?? null } : null;
}

function evidenceText(view: ReturnView): string {
  const ev = view.packEvidence?.check;
  if (!ev) return 'no packing evidence';
  if (ev.status === 'VERIFIED') return ev.sizeVerified ? 'camera verified at packing, size read' : 'camera verified at packing';
  return 'manually confirmed at packing, size not read';
}

function itemStatus(i: ReturnItemState): string {
  return i.status === 'decided' ? 'done' : i.status === 'escalated' ? 'sent_to_team_lead' : 'open';
}

/** What the decision means for the next turn, in the engine's own terms. */
export function decisionSummary(view: ReturnView, d: ReturnDecision) {
  return {
    status: d.status,
    missing_photos: d.missingPhotos,
    received: names(view, d.receivedSku),
    wrong_item_received: d.wrongItemShipped,
    likely_cause: d.cause,
    condition: d.condition,
    grade: d.grade,
    shelf: spokenCode(d.locationCode),
    refund_nok: d.refundNok,
    refund_decided_by_team_lead: d.grade !== null && d.refundNok === null,
    stock_correction: d.stockProposals.map((s) => ({ sku: s.sku, delta: s.delta })),
    customer_note: d.customerNoteText ? { present: true, contains_instructions: d.suspiciousNote } : { present: false },
    goes_to_team_lead: d.escalations,
    can_confirm: d.canConfirm,
    next: !d.canConfirm
      ? d.status === 'needs_photos'
        ? `ask for photo: ${d.missingPhotos[0]}`
        : d.status === 'needs_retake'
          ? 'ask for a clearer label photo'
          : 'the item goes to the team lead'
      : 'say grade and shelf, then ask the worker to press the confirm button',
  };
}

export function getReturnResult(view: ReturnView, item: ReturnItemState, now: Date): string {
  const { decision, retakes } = previewItem(view, item, now);
  const late = view.lateDays !== null && view.lateDays > (view.settings.returnWindowDays ?? 30);
  return json({
    return_number: view.ret.id,
    order_number: view.order.id,
    customer_reason_nb: view.ret.customerReasonNb,
    packing_evidence: evidenceText(view),
    late_return: late,
    items: view.items.map((i) => ({ number: i.index + 1, ordered: names(view, i.orderedSku), qty: i.qty, status: itemStatus(i) })),
    current_item: item.index + 1,
    required_photos: decision.requiredPhotos,
    photos_taken: [...new Set(item.photos.filter((p) => p.inspection).map((p) => p.purpose))],
    retakes,
    ...(item.status === 'decided' || item.status === 'escalated' ? { current_item_status: itemStatus(item) } : {}),
  });
}

/** The view with one more photo on one item, so a tool can answer before React re-renders. */
export function withPhoto(view: ReturnView, itemId: string, photo: StationPhoto): ReturnView {
  return {
    ...view,
    items: view.items.map((i) =>
      i.id === itemId ? { ...i, status: i.status === 'pending' ? 'inspecting' : i.status, photos: [...i.photos, photo] } : i,
    ),
  };
}

export function withWorker(view: ReturnView, itemId: string, worker: WorkerInput): ReturnView {
  return { ...view, items: view.items.map((i) => (i.id === itemId ? { ...i, worker } : i)) };
}

const FAILURE_SAY: Record<string, string> = {
  timeout: 'The check took too long. Ask for the same photo again.',
  invalid: 'The photo could not be read. Ask for the same photo again.',
  unavailable: 'The check is not available right now. Ask for the same photo again.',
  face: 'A face was in the picture, so it was deleted. Ask the worker to point the camera at the item only.',
  upload: 'The photo was not saved. Ask for the same photo again.',
  offline: 'The handheld is offline. Ask the worker to check the network and try again.',
  rate_limited: 'Too many photos in a short time. Ask the worker to wait a moment.',
  camera_unavailable: 'The camera is not available. Ask the worker to tap "Choose file" or use the buttons.',
  cancelled: 'The worker closed the camera.',
};

export function capturePhotoResult(view: ReturnView, itemId: string, purpose: PhotoPurpose, res: CaptureResult, now: Date): string {
  const next = res.photo ? withPhoto(view, itemId, res.photo) : view;
  const item = next.items.find((i) => i.id === itemId)!;
  const { decision, retakes } = previewItem(next, item, now);
  if (!res.ok) {
    return json({ photo: purpose, ok: false, problem: res.reason, say: FAILURE_SAY[res.reason], retakes, after: decisionSummary(next, decision) });
  }
  const i = res.photo.inspection!;
  const min = view.settings.returnConfidenceMin ?? 0.7;
  const identifies = purpose === 'front' || purpose === 'label' || purpose === 'packaging';
  return json({
    photo: purpose,
    ok: true,
    read: {
      ...(identifies ? { item: names(view, i.identifiedSku), confident: i.identityConfidence >= min } : {}),
      ...(purpose === 'label' ? { size_read: i.sizeRead } : {}),
      condition: i.condition,
      ...(purpose === 'customer_note' ? { note_present: !!i.customerNoteText, contains_instructions: i.containsInstructions } : {}),
    },
    retakes,
    after: decisionSummary(next, decision),
  });
}

export function cameraProblem(purpose: PhotoPurpose, reason: 'camera_unavailable' | 'cancelled'): string {
  return json({ photo: purpose, ok: false, problem: reason, say: FAILURE_SAY[reason] });
}

/** evaluate_return parameters → worker input. Worker input only ever makes the condition worse. */
export function workerPatch(p: z.infer<(typeof ToolParams)['evaluate_return']>): Partial<WorkerInput> {
  const patch: Partial<WorkerInput> = {};
  if (p.stains) patch.stains = p.stains;
  if (p.damage) patch.damage = p.damage;
  if (p.tags_attached === false) patch.tagsAttached = false;
  if (p.unusable !== undefined) patch.unusable = p.unusable;
  return patch;
}
