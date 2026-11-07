import 'server-only';
import { MediaResolution, ThinkingLevel } from '@google/genai';
import { gemini } from '@/lib/ai/gemini';
import { VISION_TIMEOUT_MS } from '@/lib/engine/constants';
import type { LabelCheck, PackVision, PhotoPurpose, ReturnInspection } from '@/lib/engine/types';
import { packMockLabel, packMockVision, RET_1043_FRONT, RET_1043_LABEL, RET_1043_NOTE } from '@/lib/demo/visionFixtures';
import { labelTaskText, packTaskText, returnTaskText, VISION_SYSTEM_PROMPT, type PackTaskContext, type VisionTaskContext } from './prompts';
import {
  LABEL_CLOSEUP_JSON_SCHEMA,
  PACK_CHECK_JSON_SCHEMA,
  parseLabelCloseup,
  parsePackVision,
  parseReturnInspection,
  RETURN_INSPECTION_JSON_SCHEMA,
} from './schemas';

// Two-stage vision (addendum section 9). Model ids checked against the Gemini docs and the
// key's model list on 2026-11-07; both are on the free tier. gemini-3.8-flash was tried as the
// strong model and did not answer within 30 s on the free tier. Override with env if they change.
export const FAST_MODEL = process.env.VISION_MODEL_FAST || 'gemini-3.5-flash-lite';
export const STRONG_MODEL = process.env.VISION_MODEL_STRONG || 'gemini-3.6-flash';

/** Leave this much of the budget unused rather than start a call that cannot finish. */
const MIN_ATTEMPT_MS = 1500;
/**
 * The fast model normally answers in 1.2-2.5 s. Under free-tier load it can hang; capping it
 * leaves the strong model (about 2 s) room inside the 8 s budget instead of timing out.
 */
const FAST_ATTEMPT_MAX_MS = 4500;

export interface VisionImage {
  data: Buffer;
  mimeType: string;
}

export interface VisionAttempt {
  model: string;
  latencyMs: number;
  schemaValid: boolean;
  error?: 'timeout' | 'invalid' | 'api';
  output?: unknown;
}

export type TwoStageResult<T> =
  | { ok: true; value: T; model: string; latencyMs: number; attempts: VisionAttempt[] }
  | { ok: false; reason: 'timeout' | 'invalid' | 'unavailable'; latencyMs: number; attempts: VisionAttempt[] };

/** Fixture mode for end-to-end tests ("live mode with mocked vision", addendum section 11). */
export function visionMockEnabled(): boolean {
  if (process.env.VISION_MOCK !== 'fixtures') return false;
  if (process.env.VERCEL_ENV === 'production') {
    throw new Error('VISION_MOCK must never be enabled in production');
  }
  return true;
}

type Part = { text: string } | { inlineData: { mimeType: string; data: string } };

interface TwoStageSpec<T> {
  parts: Part[];
  jsonSchema: object;
  parse: (output: unknown) => T | null;
  /** label and note photos get high media resolution */
  detail: boolean;
  /** true when the fast answer should get one strong-model try (also when there is none) */
  wantsStrong: (fast: T | null) => boolean;
  facePresent: (v: T) => boolean;
  budgetMs?: number;
}

async function attempt<T>(model: string, spec: TwoStageSpec<T>, timeoutMs: number): Promise<{ attempt: VisionAttempt; value: T | null }> {
  const started = Date.now();
  try {
    const res = await gemini().models.generateContent({
      model,
      contents: [{ role: 'user', parts: spec.parts }],
      config: {
        systemInstruction: VISION_SYSTEM_PROMPT,
        responseMimeType: 'application/json',
        responseJsonSchema: spec.jsonSchema,
        // Both models accept MINIMAL; it keeps latency inside the 8 s budget.
        thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
        mediaResolution: spec.detail ? MediaResolution.MEDIA_RESOLUTION_HIGH : MediaResolution.MEDIA_RESOLUTION_MEDIUM,
        maxOutputTokens: 2048,
        abortSignal: AbortSignal.timeout(timeoutMs),
      },
    });
    const latencyMs = Date.now() - started;
    let output: unknown;
    try {
      output = JSON.parse(res.text ?? '');
    } catch {
      return { attempt: { model, latencyMs, schemaValid: false, error: 'invalid' }, value: null };
    }
    const value = spec.parse(output);
    return { attempt: { model, latencyMs, schemaValid: !!value, error: value ? undefined : 'invalid', output }, value };
  } catch (err) {
    const latencyMs = Date.now() - started;
    const name = (err as Error)?.name;
    const timeout = name === 'TimeoutError' || name === 'AbortError';
    if (!timeout) console.error(`[vision] ${model} failed:`, (err as Error)?.message);
    return { attempt: { model, latencyMs, schemaValid: false, error: timeout ? 'timeout' : 'api' }, value: null };
  }
}

/**
 * Fast model first; invalid JSON gets one retry. When `wantsStrong` says so, one strong-model
 * try, whose answer wins when valid (otherwise the fast one stands). Everything stays inside
 * the 8 s budget (P9); on timeout the caller asks for a retake and nothing is auto-verified.
 */
async function twoStage<T>(spec: TwoStageSpec<T>): Promise<TwoStageResult<T>> {
  const started = Date.now();
  const budget = spec.budgetMs ?? VISION_TIMEOUT_MS;
  const remaining = () => budget - (Date.now() - started);
  const attempts: VisionAttempt[] = [];
  let best: { model: string; value: T } | null = null;

  const fastBudget = () => Math.min(remaining(), FAST_ATTEMPT_MAX_MS);
  let r = await attempt(FAST_MODEL, spec, fastBudget());
  attempts.push(r.attempt);
  if (!r.value && r.attempt.error === 'invalid' && remaining() > MIN_ATTEMPT_MS * 2) {
    r = await attempt(FAST_MODEL, spec, Math.min(fastBudget(), remaining() - MIN_ATTEMPT_MS));
    attempts.push(r.attempt);
  }
  if (r.value) best = { model: FAST_MODEL, value: r.value };

  const face = !!best && spec.facePresent(best.value);
  if (spec.wantsStrong(best?.value ?? null) && STRONG_MODEL !== FAST_MODEL && !face && remaining() > MIN_ATTEMPT_MS) {
    const s = await attempt(STRONG_MODEL, spec, remaining());
    attempts.push(s.attempt);
    if (s.value) best = { model: STRONG_MODEL, value: s.value };
  }

  const latencyMs = Date.now() - started;
  if (best) return { ok: true, value: best.value, model: best.model, latencyMs, attempts };
  const reason = attempts.some((a) => a.error === 'timeout')
    ? 'timeout'
    : attempts.some((a) => a.error === 'invalid')
      ? 'invalid'
      : 'unavailable';
  return { ok: false, reason, latencyMs, attempts };
}

function fixture<T>(value: T): TwoStageResult<T> {
  return { ok: true, value, model: 'fixture', latencyMs: 0, attempts: [{ model: 'fixture', latencyMs: 0, schemaValid: true, output: value }] };
}

const imagePart = (img: VisionImage): Part => ({ inlineData: { mimeType: img.mimeType, data: img.data.toString('base64') } });
const referenceParts = (refs: { sku: string; image: VisionImage }[]): Part[] =>
  refs.flatMap((r) => [{ text: `Reference photo: ${r.sku}` }, imagePart(r.image)]);

// ---------------------------------------------------------------- returns

export interface VisionRequest {
  purpose: PhotoPurpose;
  image: VisionImage;
  references: { sku: string; image: VisionImage }[];
  task: VisionTaskContext;
  /** RETURN_CONFIDENCE_MIN from settings: below it, the strong model gets one try. */
  confidenceMin: number;
  budgetMs?: number;
}

export type VisionResult =
  | { ok: true; inspection: ReturnInspection; model: string; latencyMs: number; attempts: VisionAttempt[] }
  | { ok: false; reason: 'timeout' | 'invalid' | 'unavailable'; latencyMs: number; attempts: VisionAttempt[] };

function mockInspection(purpose: PhotoPurpose): ReturnInspection {
  switch (purpose) {
    case 'front':
      return RET_1043_FRONT;
    case 'label':
      return RET_1043_LABEL;
    case 'customer_note':
      return RET_1043_NOTE;
    default:
      return { ...RET_1043_FRONT, photoPurpose: purpose, identifiedSku: null, sizeRead: null, identityConfidence: 0 };
  }
}

/** Label photos, and any identity read below the confidence threshold, get the strong model. */
export async function inspectReturnPhoto(req: VisionRequest): Promise<VisionResult> {
  const identifies = req.purpose === 'front' || req.purpose === 'label' || req.purpose === 'packaging';
  const candidateSkus = req.task.candidates.map((p) => p.sku);
  const r = visionMockEnabled()
    ? fixture(mockInspection(req.purpose))
    : await twoStage<ReturnInspection>({
        parts: [...referenceParts(req.references), imagePart(req.image), { text: returnTaskText(req.task) }],
        jsonSchema: RETURN_INSPECTION_JSON_SCHEMA,
        parse: (o) => parseReturnInspection(o, req.purpose, candidateSkus),
        detail: req.purpose === 'label' || req.purpose === 'customer_note',
        wantsStrong: (v) => req.purpose === 'label' || !v || (identifies && v.identityConfidence < req.confidenceMin),
        facePresent: (v) => v.facePresent,
        budgetMs: req.budgetMs,
      });
  return r.ok ? { ok: true, inspection: r.value, model: r.model, latencyMs: r.latencyMs, attempts: r.attempts } : r;
}

// ---------------------------------------------------------------- packing (M4)

export interface PackVisionRequest {
  image: VisionImage;
  references: { sku: string; image: VisionImage }[];
  task: PackTaskContext;
  /** PACK_CONFIDENCE_MIN from settings: any item below it gets the strong model. */
  confidenceMin: number;
  /** test fixtures only: which order and how many overview photos it already has */
  mock?: { orderExt: string; nth: number };
  budgetMs?: number;
}

/** An overview photo of the open box (`pack_check`). */
export async function inspectPackPhoto(req: PackVisionRequest): Promise<TwoStageResult<PackVision>> {
  const orderSkus = req.task.orderLines.map((l) => l.sku);
  const candidateSkus = req.task.candidates.map((p) => p.sku);
  if (visionMockEnabled()) {
    return fixture(packMockVision(req.mock?.orderExt ?? '', req.mock?.nth ?? 0, req.task.orderLines, req.task.candidates));
  }
  return twoStage<PackVision>({
    parts: [...referenceParts(req.references), imagePart(req.image), { text: packTaskText(req.task) }],
    jsonSchema: PACK_CHECK_JSON_SCHEMA,
    parse: (o) => parsePackVision(o, orderSkus, candidateSkus),
    detail: false,
    wantsStrong: (v) => !v || v.items.some((i) => i.confidence < req.confidenceMin),
    facePresent: (v) => v.facePresent,
    budgetMs: req.budgetMs,
  });
}

/** A close-up of one order line's size label (`label_closeup`). Always gets the strong model. */
export async function readLabelPhoto(
  req: PackVisionRequest & { sku: string },
): Promise<TwoStageResult<LabelCheck & { facePresent: boolean }>> {
  if (visionMockEnabled()) return fixture({ ...packMockLabel(req.sku, req.task.candidates), facePresent: false });
  return twoStage({
    parts: [...referenceParts(req.references), imagePart(req.image), { text: labelTaskText({ ...req.task, lineSku: req.sku }) }],
    jsonSchema: LABEL_CLOSEUP_JSON_SCHEMA,
    parse: (o) => parseLabelCloseup(o, req.sku),
    detail: true,
    wantsStrong: () => true,
    facePresent: (v) => v.facePresent,
    budgetMs: req.budgetMs,
  });
}
