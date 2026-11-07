// View and port types for the packing station. Client-safe (no server imports).
// Both the live adapter (API routes) and the demo adapter (in-memory) implement PackPort.

import type { EngineSettings } from '@/lib/engine/constants';
import type { LabelCheck, ManualReason, Order, PackAlert, PackDecision, PackMethod, PackVision, Product } from '@/lib/engine/types';
import type { CaptureFailure } from '@/lib/returns/types';

export type PackPurpose = 'pack_check' | 'label_closeup';

export interface PackPhoto {
  photoId: string;
  purpose: PackPurpose;
  /** the order line a label close-up was taken for */
  sku: string | null;
  /** short-lived signed URL (live) or an illustration path (demo); null once discarded */
  url: string | null;
  takenAt: string;
  /** overview result; null when vision timed out, failed validation, or the photo was discarded */
  vision: PackVision | null;
  label: LabelCheck | null;
  facesDiscarded: boolean;
  model?: string;
}

export interface PackCommitted {
  status: 'VERIFIED' | 'MANUAL_CONFIRM';
  method: PackMethod;
  sizeVerified: boolean;
  manualReason: ManualReason | null;
  evidencePhotoId: string | null;
  sealedAt: string;
}

/** Everything the packing station needs to show and preview one order. */
export interface PackView {
  order: Order;
  /** database id of the order (uuid live, ext id in demo) */
  orderKey: string;
  /** order lines and their variant siblings (the closed set the engine and vision use) */
  products: Product[];
  settings: Partial<EngineSettings>;
  /** active pack alerts touching an SKU in this order (P4) */
  alerts: PackAlert[];
  photos: PackPhoto[];
  /** one SKU per counted barcode scan (P7) */
  scans: string[];
  committed: PackCommitted | null;
}

export type PackCaptureResult =
  | { ok: true; photo: PackPhoto; decision?: PackDecision }
  | { ok: false; reason: CaptureFailure | 'already_sealed'; photo?: PackPhoto; decision?: PackDecision };

export type ScanResult =
  | { kind: 'counted'; sku: string }
  | { kind: 'already_counted'; sku: string }
  | { kind: 'not_in_order'; sku: string }
  | { kind: 'unknown_code' }
  | { kind: 'error'; error: 'offline' | 'failed' | 'already_sealed' };

export type SealResult =
  | { ok: true; decision: PackDecision; committed: PackCommitted }
  | { ok: false; error: 'not_ready' | 'already_sealed' | 'offline' | 'failed'; decision?: PackDecision };

export interface PackPort {
  mode: 'live' | 'demo';
  /** `image` is the downscaled, EXIF-free JPEG; demo mode passes null and uses fixtures */
  capture(orderKey: string, purpose: PackPurpose, image: Blob | null, sku?: string): Promise<PackCaptureResult>;
  /** A barcode (or SKU) typed or read by the camera. The server decides whether it counts. */
  scan(orderKey: string, code: string): Promise<ScanResult>;
  /** Server preview of a manual confirm with this reason (P8). Never commits. */
  manual(orderKey: string, reason: ManualReason): Promise<PackDecision | null>;
  /** Commits VERIFIED or MANUAL_CONFIRM. The server reruns the engine; only the reason is sent. */
  seal(orderKey: string, manualReason?: ManualReason): Promise<SealResult>;
}
