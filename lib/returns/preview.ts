// Client-side preview for one return item: the same engine and the same photo selection
// the server uses on confirm (R16), so the preview matches what will be committed.

import { evaluateReturn } from '@/lib/engine/returns';
import type { ReturnDecision } from '@/lib/engine/types';
import { buildFindings } from './findings';
import type { ReturnItemState, ReturnView } from './types';

export function previewItem(view: ReturnView, item: ReturnItemState, now: Date): { decision: ReturnDecision; retakes: number } {
  const confidenceMin = view.settings.returnConfidenceMin ?? 0.7;
  const findings = buildFindings(item.photos, confidenceMin);
  const decision = evaluateReturn(view.ret, view.order, view.packEvidence?.check ?? null, findings, item.worker, {
    products: view.products,
    now,
    itemIndex: item.index,
    settings: view.settings,
  });
  return { decision, retakes: findings.retakes ?? 0 };
}

const DAY = 24 * 60 * 60 * 1000;

/** Whole days from shipping to the return registration (R14 compares this to the window). */
export function lateDays(shippedAt?: string, registeredAt?: string): number | null {
  if (!shippedAt || !registeredAt) return null;
  return Math.floor((new Date(registeredAt).getTime() - new Date(shippedAt).getTime()) / DAY);
}
