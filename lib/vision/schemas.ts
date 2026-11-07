// Vision contract (brief section 7). Pure: zod only, no SDK imports, so contract tests
// and demo fixtures use the exact same validation as the live route.

import { z } from 'zod';
import type { Box2d, PhotoPurpose, ReturnInspection } from '@/lib/engine/types';

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
