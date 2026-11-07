// View and port types for the returns station. Client-safe (no server imports).
// Both the live adapter (API routes) and the demo adapter (in-memory) implement ReturnsPort.

import type { EngineSettings } from '@/lib/engine/constants';
import type {
  Lang,
  Order,
  PackCheck,
  PhotoPurpose,
  Product,
  ReturnCase,
  ReturnDecision,
  ReturnInspection,
  WorkerInput,
} from '@/lib/engine/types';

export interface WorkerNote {
  text: string;
  lang: Lang;
}

export type ReturnItemStatus = 'pending' | 'inspecting' | 'decided' | 'escalated';

export interface StationPhoto {
  photoId: string;
  purpose: PhotoPurpose;
  /** short-lived signed URL (live) or an illustration path (demo); null once discarded */
  url: string | null;
  takenAt: string;
  inspection: ReturnInspection | null;
  facesDiscarded: boolean;
  model?: string;
}

export interface CommittedDecision {
  grade: string;
  locationCode: string;
  refundNok: number | null;
  cause: string | null;
  flags: string[];
  receivedSku: string | null;
  decidedAt: string;
}

export interface ReturnItemState {
  id: string;
  index: number;
  orderedSku: string;
  qty: number;
  status: ReturnItemStatus;
  photos: StationPhoto[];
  worker: WorkerInput;
  committed: CommittedDecision | null;
}

export interface PackEvidenceView {
  check: PackCheck;
  /** signed URL for a stored evidence photo, or an illustration in public/demo */
  photoUrl: string | null;
}

/** Everything the returns station needs to show and preview one return. */
export interface ReturnView {
  ret: ReturnCase;
  /** database id of the return (uuid live, ext id in demo) */
  returnKey: string;
  status: ReturnCase['status'];
  order: Order;
  items: ReturnItemState[];
  packEvidence: PackEvidenceView | null;
  /** catalogue the engine needs for the preview: ordered SKUs and their variant siblings */
  products: Product[];
  settings: Partial<EngineSettings>;
  lateDays: number | null;
}

export type CaptureFailure = 'timeout' | 'invalid' | 'unavailable' | 'face' | 'upload' | 'offline' | 'rate_limited';

export type CaptureResult =
  | { ok: true; photo: StationPhoto }
  | { ok: false; reason: CaptureFailure; photo?: StationPhoto };

export type ConfirmResult =
  | { ok: true; decision: ReturnDecision; committed: CommittedDecision; returnStatus: ReturnCase['status'] }
  | { ok: false; error: 'not_ready' | 'already_decided' | 'offline' | 'failed'; decision?: ReturnDecision };

export type EscalateResult = { ok: true; returnStatus: ReturnCase['status'] } | { ok: false; error: 'offline' | 'failed' | 'already_decided' };

export interface ReturnsPort {
  mode: 'live' | 'demo';
  /** `image` is the downscaled, EXIF-free JPEG; demo mode passes null and uses fixtures */
  capture(itemId: string, purpose: PhotoPurpose, image: Blob | null): Promise<CaptureResult>;
  /**
   * Stores worker input and returns the server's preview (never commits). A note is stored as
   * spoken, in `lang`; the server adds the Norwegian translation.
   */
  evaluate(itemId: string, worker: WorkerInput, note?: WorkerNote): Promise<ReturnDecision | null>;
  confirm(itemId: string): Promise<ConfirmResult>;
  escalate(itemId: string, note?: string, lang?: Lang): Promise<EscalateResult>;
}
