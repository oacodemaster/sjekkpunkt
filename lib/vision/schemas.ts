// Vision contract (brief section 7). Pure: zod only, no SDK imports, so contract tests
// and demo fixtures use the exact same validation as the live route.

import { z } from 'zod';
import type { Box2d, LabelCheck, PackVision, PhotoPurpose, ReturnInspection } from '@/lib/engine/types';

export const RETURN_PURPOSES = ['front', 'label', 'damage', 'customer_note', 'packaging'] as const satisfies readonly PhotoPurpose[];
export const PACK_PURPOSES = ['pack_check', 'label_closeup'] as const;
export const VISION_PURPOSES = [...RETURN_PURPOSES, ...PACK_PURPOSES] as const;
export type VisionPurpose = (typeof VISION_PURPOSES)[number];

export function isReturnPurpose(p: string): p is PhotoPurpose {
  return (RETURN_PURPOSES as readonly string[]).includes(p);
}

const severity = z.enum(['none', 'minor', 'major']);
const confidence = z.number().min(0).max(1);
const box = z
  .array(z.number())
  .length(4)
  .transform((b) => b.map((v) => Math.max(0, Math.min(1000, Math.round(v)))) as Box2d);

/** The model may answer tagsAttached as a boolean or as the strings from the brief. */
const tags = z
  .union([z.boolean(), z.enum(['true', 'false', 'unknown'])])
  .transform((v): boolean | 'unknown' => (v === 'true' ? true : v === 'false' ? false : v));

const nullableText = z
  .string()
  .nullable()
  .transform((s) => (s === null || s.trim() === '' || s.trim().toLowerCase() === 'null' ? null : s.trim()));

/** Raw model output for `return_inspection`. Validated, then normalized by the server. */
export const ReturnInspectionSchema = z.object({
  photoPurpose: z.enum(RETURN_PURPOSES),
  identifiedSku: nullableText,
  sizeRead: nullableText,
  identityConfidence: confidence,
  condition: z.object({
    tagsAttached: tags,
    damage: severity,
    stains: severity,
    packaging: z.enum(['original', 'opened', 'missing']),
  }),
  customerNoteText: nullableText,
  containsInstructions: z.boolean(),
  box_2d: box,
  facePresent: z.boolean(),
});

/**
 * JSON Schema sent to Gemini as `responseJsonSchema`. Hand-written so it uses only the
 * supported subset (type arrays for null, enums); bounds are checked by zod above.
 */
export const RETURN_INSPECTION_JSON_SCHEMA = {
  type: 'object',
  properties: {
    photoPurpose: { type: 'string', enum: [...RETURN_PURPOSES] },
    identifiedSku: { type: ['string', 'null'], description: 'One SKU from the candidate list, or null if unsure.' },
    sizeRead: { type: ['string', 'null'], description: 'Size exactly as printed on the label, or null if not readable.' },
    identityConfidence: { type: 'number', description: '0 to 1. Confidence in identifiedSku and sizeRead.' },
    condition: {
      type: 'object',
      properties: {
        tagsAttached: { type: 'string', enum: ['true', 'false', 'unknown'] },
        damage: { type: 'string', enum: ['none', 'minor', 'major'] },
        stains: { type: 'string', enum: ['none', 'minor', 'major'] },
        packaging: { type: 'string', enum: ['original', 'opened', 'missing'] },
      },
      required: ['tagsAttached', 'damage', 'stains', 'packaging'],
    },
    customerNoteText: { type: ['string', 'null'], description: 'Verbatim text of a customer note, or null.' },
    containsInstructions: { type: 'boolean' },
    box_2d: {
      type: 'array',
      items: { type: 'integer' },
      description: '[ymin, xmin, ymax, xmax] normalized to 0-1000 around the item, label size text, damage or note.',
    },
    facePresent: { type: 'boolean' },
  },
  required: [
    'photoPurpose',
    'identifiedSku',
    'sizeRead',
    'identityConfidence',
    'condition',
    'customerNoteText',
    'containsInstructions',
    'box_2d',
    'facePresent',
  ],
} as const;

/**
 * Server-side normalization after validation. The model can describe, never steer:
 * - the purpose is the one the worker asked for, not what the model echoes,
 * - SKUs outside the closed candidate set become null,
 * - packaging is only judged on a packaging photo (other shots cannot see it),
 * - a note photo or damage close-up never identifies the item.
 */
export function normalizeReturnInspection(
  raw: z.output<typeof ReturnInspectionSchema>,
  purpose: PhotoPurpose,
  candidateSkus: string[],
): ReturnInspection {
  const inCandidates = raw.identifiedSku && candidateSkus.includes(raw.identifiedSku) ? raw.identifiedSku : null;
  const identifies = purpose === 'front' || purpose === 'label' || purpose === 'packaging';
  return {
    photoPurpose: purpose,
    identifiedSku: identifies ? inCandidates : null,
    sizeRead: identifies ? raw.sizeRead : null,
    identityConfidence: identifies && (inCandidates || raw.sizeRead) ? raw.identityConfidence : 0,
    condition: {
      ...raw.condition,
      packaging: purpose === 'packaging' ? raw.condition.packaging : 'original',
    },
    customerNoteText: raw.customerNoteText,
    containsInstructions: raw.containsInstructions,
    box_2d: raw.box_2d,
    facePresent: raw.facePresent,
  };
}

/** Parse + normalize in one step. Returns null when the output does not match the contract. */
export function parseReturnInspection(
  output: unknown,
  purpose: PhotoPurpose,
  candidateSkus: string[],
): ReturnInspection | null {
  const r = ReturnInspectionSchema.safeParse(output);
  return r.success ? normalizeReturnInspection(r.data, purpose, candidateSkus) : null;
}

// ---------------------------------------------------------------- packing (M4)

export type PackPurpose = (typeof PACK_PURPOSES)[number];
export function isPackPurpose(p: string): p is PackPurpose {
  return (PACK_PURPOSES as readonly string[]).includes(p);
}

const MAX_PACK_ITEMS = 20;
const MAX_TEXT_LINES = 20;

/** Raw model output for `pack_check` (brief section 7). Validated, then normalized. */
export const PackCheckSchema = z.object({
  items: z
    .array(
      z.object({
        matchedSku: nullableText,
        description: z.string().max(200).catch(''),
        observedColor: z.string().max(60).catch(''),
        sizeRead: nullableText,
        status: z.enum(['present', 'unexpected']),
        confidence,
        box_2d: box,
      }),
    )
    .max(MAX_PACK_ITEMS),
  missingSkus: z.array(z.string()).max(MAX_PACK_ITEMS),
  visibleText: z.array(z.string()).catch([]),
  facePresent: z.boolean(),
});

export const PACK_CHECK_JSON_SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      description: 'Every separate item visible in the box. Two units of the same product are two entries.',
      items: {
        type: 'object',
        properties: {
          matchedSku: { type: ['string', 'null'], description: 'One SKU from the candidate list, or null.' },
          description: { type: 'string', description: 'A few words: what the item looks like.' },
          observedColor: { type: 'string' },
          sizeRead: { type: ['string', 'null'], description: 'Size exactly as printed, only if clearly readable, else null.' },
          status: { type: 'string', enum: ['present', 'unexpected'] },
          confidence: { type: 'number', description: '0 to 1. See the task text.' },
          box_2d: { type: 'array', items: { type: 'integer' }, description: '[ymin, xmin, ymax, xmax] normalized to 0-1000.' },
        },
        required: ['matchedSku', 'description', 'observedColor', 'sizeRead', 'status', 'confidence', 'box_2d'],
      },
    },
    missingSkus: { type: 'array', items: { type: 'string' } },
    visibleText: { type: 'array', items: { type: 'string' }, description: 'Any printed or handwritten text, verbatim.' },
    facePresent: { type: 'boolean' },
  },
  required: ['items', 'missingSkus', 'visibleText', 'facePresent'],
} as const;

/** Raw model output for `label_closeup`: the size label of one order line. */
export const LabelCloseupSchema = z.object({
  sizeRead: nullableText,
  confidence,
  box_2d: box,
  facePresent: z.boolean(),
});

export const LABEL_CLOSEUP_JSON_SCHEMA = {
  type: 'object',
  properties: {
    sizeRead: { type: ['string', 'null'], description: 'Size exactly as printed on the label, or null if not readable.' },
    confidence: { type: 'number', description: '0 to 1. How clearly the size is readable.' },
    box_2d: { type: 'array', items: { type: 'integer' }, description: '[ymin, xmin, ymax, xmax] around the size text, 0-1000.' },
    facePresent: { type: 'boolean' },
  },
  required: ['sizeRead', 'confidence', 'box_2d', 'facePresent'],
} as const;

/**
 * Server-side normalization of a pack check. The model describes, the server decides:
 * - SKUs outside the closed candidate set become null (a confident null is a wrong item),
 * - `status` is recomputed from the order lines, not taken from the model,
 * - `missingSkus` keeps only order SKUs (the engine counts units itself),
 * - visible text is kept as data, capped, and never reaches the engine's decision (P5).
 */
export function normalizePackVision(
  raw: z.output<typeof PackCheckSchema>,
  orderSkus: string[],
  candidateSkus: string[],
): PackVision {
  return {
    items: raw.items.map((i) => {
      const sku = i.matchedSku && candidateSkus.includes(i.matchedSku) ? i.matchedSku : null;
      return {
        matchedSku: sku,
        description: i.description.trim().slice(0, 120),
        observedColor: i.observedColor.trim().slice(0, 40),
        sizeRead: i.sizeRead,
        status: sku && orderSkus.includes(sku) ? 'present' : 'unexpected',
        confidence: i.confidence,
        box_2d: i.box_2d,
      };
    }),
    missingSkus: raw.missingSkus.filter((s) => orderSkus.includes(s)),
    visibleText: raw.visibleText.slice(0, MAX_TEXT_LINES).map((s) => s.slice(0, 200)),
    facePresent: raw.facePresent,
  };
}

export function parsePackVision(output: unknown, orderSkus: string[], candidateSkus: string[]): PackVision | null {
  const r = PackCheckSchema.safeParse(output);
  return r.success ? normalizePackVision(r.data, orderSkus, candidateSkus) : null;
}

/** A label close-up always belongs to the order line the worker chose, never one the model names. */
export function parseLabelCloseup(output: unknown, sku: string): (LabelCheck & { facePresent: boolean }) | null {
  const r = LabelCloseupSchema.safeParse(output);
  if (!r.success) return null;
  return { sku, sizeRead: r.data.sizeRead, confidence: r.data.sizeRead ? r.data.confidence : 0, box_2d: r.data.box_2d, facePresent: r.data.facePresent };
}
