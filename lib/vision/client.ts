import 'server-only';
import { GoogleGenAI, MediaResolution, ThinkingLevel } from '@google/genai';
import { VISION_TIMEOUT_MS } from '@/lib/engine/constants';
import type { PhotoPurpose, ReturnInspection } from '@/lib/engine/types';
import { RET_1043_FRONT, RET_1043_LABEL, RET_1043_NOTE } from '@/lib/demo/visionFixtures';
import { returnTaskText, VISION_SYSTEM_PROMPT, type VisionTaskContext } from './prompts';
import { parseReturnInspection, RETURN_INSPECTION_JSON_SCHEMA } from './schemas';

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

export interface VisionRequest {
  purpose: PhotoPurpose;
  image: VisionImage;
  references: { sku: string; image: VisionImage }[];
  task: VisionTaskContext;
  /** RETURN_CONFIDENCE_MIN from settings: below it, the strong model gets one try. */
  confidenceMin: number;
  budgetMs?: number;
}

export interface VisionAttempt {
  model: string;
  latencyMs: number;
  schemaValid: boolean;
  error?: 'timeout' | 'invalid' | 'api';
  output?: unknown;
}

export type VisionResult =
  | { ok: true; inspection: ReturnInspection; model: string; latencyMs: number; attempts: VisionAttempt[] }
  | { ok: false; reason: 'timeout' | 'invalid' | 'unavailable'; latencyMs: number; attempts: VisionAttempt[] };

/** Fixture mode for end-to-end tests ("live mode with mocked vision", addendum section 11). */
export function visionMockEnabled(): boolean {
  if (process.env.VISION_MOCK !== 'fixtures') return false;
  if (process.env.VERCEL_ENV === 'production') {
    throw new Error('VISION_MOCK must never be enabled in production');
  }
  return true;
}

let client: GoogleGenAI | null = null;
function gemini(): GoogleGenAI {
  if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is not set');
  client ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  return client;
}

async function attempt(
  model: string,
  req: VisionRequest,
  timeoutMs: number,
): Promise<{ attempt: VisionAttempt; inspection: ReturnInspection | null }> {
  const started = Date.now();
  const parts = [
    ...req.references.flatMap((r) => [
      { text: `Reference photo: ${r.sku}` },
      { inlineData: { mimeType: r.image.mimeType, data: r.image.data.toString('base64') } },
    ]),
    { inlineData: { mimeType: req.image.mimeType, data: req.image.data.toString('base64') } },
    { text: returnTaskText(req.task) },
  ];
  const detail = req.purpose === 'label' || req.purpose === 'customer_note';
  try {
    const res = await gemini().models.generateContent({
      model,
      contents: [{ role: 'user', parts }],
      config: {
        systemInstruction: VISION_SYSTEM_PROMPT,
        responseMimeType: 'application/json',
        responseJsonSchema: RETURN_INSPECTION_JSON_SCHEMA,
        // Both models accept MINIMAL; it keeps latency inside the 8 s budget.
        thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
        mediaResolution: detail ? MediaResolution.MEDIA_RESOLUTION_HIGH : MediaResolution.MEDIA_RESOLUTION_MEDIUM,
        maxOutputTokens: 2048,
        abortSignal: AbortSignal.timeout(timeoutMs),
      },
    });
    const latencyMs = Date.now() - started;
    let output: unknown;
    try {
      output = JSON.parse(res.text ?? '');
    } catch {
      return { attempt: { model, latencyMs, schemaValid: false, error: 'invalid' }, inspection: null };
    }
    const candidateSkus = req.task.candidates.map((p) => p.sku);
    const inspection = parseReturnInspection(output, req.purpose, candidateSkus);
    return {
      attempt: { model, latencyMs, schemaValid: !!inspection, error: inspection ? undefined : 'invalid', output },
      inspection,
    };
  } catch (err) {
    const latencyMs = Date.now() - started;
    const name = (err as Error)?.name;
    const timeout = name === 'TimeoutError' || name === 'AbortError';
    if (!timeout) console.error(`[vision] ${model} failed:`, (err as Error)?.message);
    return { attempt: { model, latencyMs, schemaValid: false, error: timeout ? 'timeout' : 'api' }, inspection: null };
  }
}

function mockInspection(purpose: PhotoPurpose): ReturnInspection {
  const generic: ReturnInspection = {
    ...RET_1043_FRONT,
    photoPurpose: purpose,
    identifiedSku: null,
    sizeRead: null,
    identityConfidence: 0,
  };
  switch (purpose) {
    case 'front':
      return RET_1043_FRONT;
    case 'label':
      return RET_1043_LABEL;
    case 'customer_note':
      return RET_1043_NOTE;
    default:
      return generic;
  }
}

/**
 * Fast model first. Label photos, and any identity read below the confidence threshold,
 * get one strong-model try; the strong answer wins when valid, otherwise the fast one stands.
 * Invalid JSON gets one retry. Everything stays inside the 8 s budget (P9); on timeout the
 * caller asks for a retake and nothing is auto-verified.
 */
export async function inspectReturnPhoto(req: VisionRequest): Promise<VisionResult> {
  const started = Date.now();
  if (visionMockEnabled()) {
    const inspection = mockInspection(req.purpose);
    return { ok: true, inspection, model: 'fixture', latencyMs: 0, attempts: [{ model: 'fixture', latencyMs: 0, schemaValid: true, output: inspection }] };
  }

  const budget = req.budgetMs ?? VISION_TIMEOUT_MS;
  const remaining = () => budget - (Date.now() - started);
  const attempts: VisionAttempt[] = [];
  const identifies = req.purpose === 'front' || req.purpose === 'label' || req.purpose === 'packaging';

  let best: { model: string; inspection: ReturnInspection } | null = null;

  const fastBudget = () => Math.min(remaining(), FAST_ATTEMPT_MAX_MS);
  let r = await attempt(FAST_MODEL, req, fastBudget());
  attempts.push(r.attempt);
  if (!r.inspection && r.attempt.error === 'invalid' && remaining() > MIN_ATTEMPT_MS * 2) {
    r = await attempt(FAST_MODEL, req, Math.min(fastBudget(), remaining() - MIN_ATTEMPT_MS));
    attempts.push(r.attempt);
  }
  if (r.inspection) best = { model: FAST_MODEL, inspection: r.inspection };

  const weak = !best || (identifies && best.inspection.identityConfidence < req.confidenceMin);
  const wantsStrong = (req.purpose === 'label' || weak) && STRONG_MODEL !== FAST_MODEL;
  if (wantsStrong && !best?.inspection.facePresent && remaining() > MIN_ATTEMPT_MS) {
    const s = await attempt(STRONG_MODEL, req, remaining());
    attempts.push(s.attempt);
    if (s.inspection) best = { model: STRONG_MODEL, inspection: s.inspection };
  }

  const latencyMs = Date.now() - started;
  if (best) return { ok: true, inspection: best.inspection, model: best.model, latencyMs, attempts };
  const reason = attempts.some((a) => a.error === 'timeout')
    ? 'timeout'
    : attempts.some((a) => a.error === 'invalid')
      ? 'invalid'
      : 'unavailable';
  return { ok: false, reason, latencyMs, attempts };
}
