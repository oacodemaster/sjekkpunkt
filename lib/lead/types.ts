// View types for the lead console. Client-safe (no server imports).

import type { Cause, Grade } from '@/lib/engine/types';

export type LeadAction = 'approve' | 'override' | 'reject';
export type EscalationEntity = 'return_item' | 'return' | 'order' | 'parcel';

export interface LeadDecisionView {
  grade: Grade;
  locationCode: string;
  refundNok: number | null;
  cause: Cause | null;
  flags: string[];
  isOverride: boolean;
  overrideReason: string | null;
}

export interface LeadPhoto {
  photoId: string;
  purpose: string;
  url: string | null;
  model: string | null;
  /** identity or label confidence from the model (0-1), when the photo identified something */
  confidence: number | null;
  sizeRead: string | null;
  facesDiscarded: boolean;
}

export interface LeadItemView {
  id: string;
  returnExt: string;
  orderExt: string;
  orderedSku: string;
  orderedName: string;
  receivedSku: string | null;
  receivedName: string | null;
  status: 'pending' | 'inspecting' | 'decided' | 'escalated';
  lineValueNok: number;
  /** the latest stored decision, null while the item is undecided */
  decision: LeadDecisionView | null;
  /** what the engine proposes from the stored photos and worker input (server rerun) */
  proposal: { grade: Grade | null; locationCode: string | null; refundNok: number | null; cause: Cause | null };
  photos: LeadPhoto[];
  workerNote: { original: string; lang: string | null; nb: string | null } | null;
  suspiciousNote: boolean;
  packEvidence: { status: string; sizeVerified: boolean; photoUrl: string | null } | null;
}

export interface LeadOrderView {
  orderExt: string;
  status: string;
  method: string;
  manualReason: string | null;
  sizeVerified: boolean;
  photoUrl: string | null;
}

export interface LeadCard {
  id: string;
  reason: string;
  entityType: EscalationEntity;
  /** "Retur 1043", "Ordre 2311", "Pakke XYZ" */
  refLabel: string;
  /** a Holio mock record for this card, when there is one */
  href: string | null;
  summaryNb: string;
  createdAt: string;
  status: 'open' | 'resolved';
  resolution: { action?: LeadAction; note?: string; grade?: string; locationCode?: string; refundNok?: number; isOverride?: boolean } | null;
  resolvedAt: string | null;
  hasAudio: boolean;
  /** which actions make sense for this card right now */
  actions: { approve: boolean; override: boolean; reject: boolean; refundRequired: boolean };
  item?: LeadItemView;
  order?: LeadOrderView;
}

export interface StockAdjustmentView {
  id: string;
  sku: string;
  name: string;
  delta: number;
  reason: string;
  sourceLabel: string | null;
  status: 'proposed' | 'approved' | 'rejected';
  createdAt: string;
  decidedAt: string | null;
}

export interface PackAlertView {
  id: string;
  skuA: string;
  skuB: string;
  label: string;
  reasonNb: string;
  origin: 'auto' | 'manual';
  active: boolean;
  /** mix-ups of the pair inside the confusion window */
  count: number;
  createdAt: string;
  clearedAt: string | null;
}

export interface FeedEvent {
  id: string;
  at: string;
  station: string;
  type: string;
  ref_label: string | null;
  summary_nb: string;
  summary_en: string;
}

export interface LeadConsoleData {
  warehouseId: string;
  open: LeadCard[];
  resolved: LeadCard[];
  adjustments: StockAdjustmentView[];
  alerts: PackAlertView[];
  feed: FeedEvent[];
  locations: { code: string; kind: string }[];
  products: { sku: string; name: string; variantGroup: string | null }[];
  windowDays: number;
}
