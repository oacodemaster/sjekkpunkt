// Turns the photos taken for one return item into engine findings. Pure, so the server
// (confirm rerun, R16), the live preview and demo mode all pick photos the same way.

import type { PhotoPurpose, ReturnFindings, ReturnInspection } from '@/lib/engine/types';

export interface PhotoRecord {
  photoId: string;
  purpose: PhotoPurpose;
  takenAt: string;
  /** null when vision timed out, failed validation, or the photo was discarded */
  inspection: ReturnInspection | null;
  facesDiscarded: boolean;
}

const IDENTITY: PhotoPurpose[] = ['front', 'label', 'packaging'];

/**
 * - A retake replaces the earlier photo of the same purpose: the latest usable photo per
 *   purpose counts, so one blurry shot cannot stick to the item.
 * - Retakes (R9) are counted per photo type: unconfident identity shots of the same type,
 *   minus the first. Three blurry labels = two retakes = escalate (MAX_RETAKES 2).
 * - Photos with a face never count; repeated faces are counted for the escalation.
 */
export function buildFindings(photos: PhotoRecord[], confidenceMin: number): ReturnFindings {
  const sorted = [...photos].sort((a, b) => a.takenAt.localeCompare(b.takenAt));
  const latest = new Map<PhotoPurpose, ReturnInspection>();
  const weak = new Map<PhotoPurpose, number>();
  let faceDiscards = 0;

  for (const p of sorted) {
    if (p.facesDiscarded || p.inspection?.facePresent) {
      faceDiscards++;
      continue;
    }
    if (IDENTITY.includes(p.purpose)) {
      const i = p.inspection;
      const confident = !!i && i.identityConfidence >= confidenceMin && (!!i.identifiedSku || !!i.sizeRead);
      if (!confident) weak.set(p.purpose, (weak.get(p.purpose) ?? 0) + 1);
    }
    if (p.inspection) latest.set(p.purpose, p.inspection);
  }

  return {
    inspections: [...latest.values()],
    retakes: Math.max(0, ...[...weak.values()].map((n) => n - 1)),
    faceDiscards,
  };
}
