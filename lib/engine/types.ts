// Domain types shared by the client, the server and demo mode.
// This module must stay free of React, Next.js and Supabase imports.

export type Lang = 'nb' | 'en' | 'pl' | 'uk' | 'ro' | 'lt';
export type Station = 'pack' | 'return';
export type Severity = 'none' | 'minor' | 'major';
export type Grade = 'A' | 'B' | 'C' | 'D';
/** Normalized [ymin, xmin, ymax, xmax] in 0-1000 (Gemini box_2d convention). */
export type Box2d = [number, number, number, number];

export interface Product {
  sku: string;
  nameNb: string;
  nameEn: string;
  category: 'apparel' | 'accessory';
  color: string;
  size?: string;
  priceNok: number;
  location: string;
  variantGroup?: string;
  barcode?: string;
}

export interface OrderLine {
  sku: string;
  qty: number;
  priceNok: number;
}

export interface Order {
  id: string;
  customerRef: string;
  lines: OrderLine[];
  status: 'picked' | 'packed' | 'shipped' | 'returned_partial';
  shippedAt?: string;
}

// ---------- Packing ----------

export type PackStatus = 'VERIFIED' | 'MISMATCH' | 'NEEDS_LABEL_PHOTO' | 'MANUAL_CONFIRM';
/** RETAKE is a preview-only status (timeout, face in frame). It is never stored. */
export type PackDecisionStatus = PackStatus | 'RETAKE';
export type PackMethod = 'camera' | 'barcode' | 'manual';
export type ManualReason = 'polybag' | 'glare' | 'other';

export interface PackCheck {
  id: string;
  orderId: string;
  status: PackStatus;
  method?: PackMethod;
  photoRef: string;
  sizeVerified: boolean;
  confidence: number;
  deviceId: string;
  at: string;
}

/** Output of the `pack_check` vision purpose (brief section 7). */
export interface PackVisionItem {
  matchedSku: string | null;
  description: string;
  observedColor: string;
  sizeRead: string | null;
  status: 'present' | 'unexpected';
  confidence: number;
  box_2d: Box2d;
}

export interface PackVision {
  items: PackVisionItem[];
  missingSkus: string[];
  visibleText: string[];
  facePresent: boolean;
}

/** A label close-up taken for one order line (purpose `label_closeup`). */
export interface LabelCheck {
  sku: string;
  sizeRead: string | null;
  confidence: number;
  box_2d?: Box2d;
}

export interface PackContext {
  products: Product[];
  now: Date;
  /** One entry per barcode scan; a SKU scanned twice counts as two units (P7). */
  barcodeScans?: string[];
  labelChecks?: LabelCheck[];
  retakes?: number;
  visionTimedOut?: boolean;
  manualReason?: ManualReason;
  settings?: Partial<import('./constants').EngineSettings>;
}

export type PackLineState = 'present' | 'missing' | 'extra';

export interface PackLineResult {
  sku: string;
  ordered: number;
  seen: number;
  state: PackLineState;
  /** units missing (state missing) or extra (state extra) */
  diff: number;
  sizeVerified: boolean;
  method: PackMethod;
  confidence: number;
  boxes: Box2d[];
  alertActive: boolean;
  /** label close-up read a different size than ordered */
  labelSizeMismatch?: string;
}

export interface PackUnexpected {
  sku: string | null;
  description: string;
  confidence: number;
  box_2d: Box2d;
}

export type PackMessageKey =
  | 'packMismatch'
  | 'packVerified'
  | 'packNeedsLabel'
  | 'packAlertNeedsLabel'
  | 'packManualConfirmed'
  | 'visionTimeout'
  | 'faceInFrame';

export interface PackDecision {
  status: PackDecisionStatus;
  lines: PackLineResult[];
  unexpected: PackUnexpected[];
  messageKey: PackMessageKey;
  confusionEvents: ConfusionEvent[];
  canSeal: boolean;
  canManualConfirm: boolean;
  sizeVerified: boolean;
  confidence: number;
  method: PackMethod;
  escalations: EscalationReason[];
  engineVersion: string;
}

// ---------- Returns ----------

export type PhotoPurpose = 'front' | 'label' | 'damage' | 'customer_note' | 'packaging';

export interface ReturnItemRef {
  orderedSku: string;
  qty: number;
}

export interface ReturnCase {
  id: string;
  orderId: string;
  customerReasonNb: string;
  items: ReturnItemRef[];
  status: 'pending' | 'inspecting' | 'awaiting_confirm' | 'confirmed' | 'escalated';
  registeredAt?: string;
}

export interface ConditionFields {
  tagsAttached: boolean | 'unknown';
  damage: Severity;
  stains: Severity;
  packaging: 'original' | 'opened' | 'missing';
  unusable: boolean;
}

/** Output of the `return_inspection` vision purpose (brief section 7). */
export interface ReturnInspection {
  photoPurpose: PhotoPurpose;
  identifiedSku: string | null;
  sizeRead: string | null;
  identityConfidence: number;
  condition: {
    tagsAttached: boolean | 'unknown';
    damage: Severity;
    stains: Severity;
    packaging: 'original' | 'opened' | 'missing';
  };
  customerNoteText: string | null;
  containsInstructions: boolean;
  box_2d: Box2d;
  facePresent: boolean;
}

export interface ReturnFindings {
  inspections: ReturnInspection[];
  retakes?: number;
  faceDiscards?: number;
}

/** What the worker reported (tap or voice). Only ever makes the condition worse. */
export interface WorkerInput {
  damage?: Severity;
  stains?: Severity;
  tagsAttached?: boolean;
  unusable?: boolean;
  /** Norwegian translation of the worker's note, stored as text only. */
  noteNb?: string;
}

export type Cause =
  | 'likely_warehouse_error'
  | 'inconclusive'
  | 'unknown'
  | 'customer_side'
  | 'transit_damage';

export interface StockProposal {
  sku: string;
  delta: number;
  reason: 'wrong_item_not_shipped' | 'wrong_item_shipped';
}

export type ReturnItemStatus = 'needs_photos' | 'needs_retake' | 'escalated' | 'ready';

export type ReturnFlag = 'suspicious_note' | 'wrong_item' | 'late_return' | 'carrier_claim';

export interface ReturnDecision {
  status: ReturnItemStatus;
  requiredPhotos: PhotoPurpose[];
  missingPhotos: PhotoPurpose[];
  orderedSku: string;
  receivedSku: string | null;
  identityConfidence: number;
  wrongItemShipped: boolean;
  cause: Cause | null;
  condition: ConditionFields;
  grade: Grade | null;
  locationCode: string | null;
  lineValueNok: number;
  /** null = the team lead decides the refund */
  refundNok: number | null;
  stockProposals: StockProposal[];
  customerNoteText: string | null;
  suspiciousNote: boolean;
  flags: ReturnFlag[];
  escalations: EscalationReason[];
  confusionEvents: ConfusionEvent[];
  canConfirm: boolean;
  engineVersion: string;
}

export interface ReturnContext {
  products: Product[];
  now: Date;
  /** index into ret.items, default 0 (R12: each item is decided on its own) */
  itemIndex?: number;
  settings?: Partial<import('./constants').EngineSettings>;
}

// ---------- Loop ----------

export interface ConfusionEvent {
  skuPair: [string, string]; // sorted
  kind: 'caught_at_packing' | 'found_at_returns';
  at: string;
}

export interface PackAlert {
  skuPair: [string, string];
  reasonNb: string;
  createdAt: string;
  rule: 'REQUIRE_LABEL_PHOTO';
  active: boolean;
  origin: 'auto' | 'manual';
}

// ---------- Escalations and audit ----------

export const ESCALATION_REASONS = [
  'suspicious_note',
  'low_confidence_after_retakes',
  'wrong_item_inconclusive',
  'customer_caused_damage',
  'unknown_return',
  'late_return',
  'manual_confirm_on_alert',
  'face_in_frame_repeated',
] as const;
export type EscalationReason = (typeof ESCALATION_REASONS)[number];

export interface AuditEvent {
  at: string;
  station: Station | 'lead' | 'admin';
  type: string;
  refId: string;
  summaryNb: string;
  summaryEn: string;
  actor: string;
}
