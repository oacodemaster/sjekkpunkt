import type { ConditionFields, Grade, ReturnInspection, Severity, WorkerInput } from './types';

/**
 * R5. Grade is computed from fields, never taken from the model's opinion.
 * Brief section 6, plus "missing packaging = B" from the grading guide (Appendix B).
 */
export function computeGrade(f: ConditionFields): Grade {
  if (f.unusable) return 'D';
  if (f.damage === 'major' || f.stains === 'major') return 'C';
  if (
    f.damage === 'minor' ||
    f.stains === 'minor' ||
    f.tagsAttached === false ||
    f.packaging === 'missing'
  )
    return 'B';
  return 'A';
}

const SEVERITY_RANK: Record<Severity, number> = { none: 0, minor: 1, major: 2 };
const PACKAGING_RANK = { original: 0, opened: 1, missing: 2 } as const;

export function worse(a: Severity, b: Severity | undefined): Severity {
  if (!b) return a;
  return SEVERITY_RANK[b] > SEVERITY_RANK[a] ? b : a;
}

/**
 * Merge model findings from every photo, then apply worker input.
 * Worker input overrides upward only: a worker-reported stain always counts,
 * and nothing the model sees can make the item better than the worker said.
 */
export function mergeCondition(
  inspections: ReturnInspection[],
  worker: WorkerInput,
): ConditionFields {
  let damage: Severity = 'none';
  let stains: Severity = 'none';
  let tagsAttached: boolean | 'unknown' = 'unknown';
  let packaging: ConditionFields['packaging'] = 'original';
  let sawPackaging = false;

  for (const i of inspections) {
    if (i.facePresent) continue;
    damage = worse(damage, i.condition.damage);
    stains = worse(stains, i.condition.stains);
    if (i.condition.tagsAttached === false) tagsAttached = false;
    else if (i.condition.tagsAttached === true && tagsAttached === 'unknown') tagsAttached = true;
    if (!sawPackaging || PACKAGING_RANK[i.condition.packaging] > PACKAGING_RANK[packaging]) {
      packaging = i.condition.packaging;
      sawPackaging = true;
    }
  }

  damage = worse(damage, worker.damage);
  stains = worse(stains, worker.stains);
  if (worker.tagsAttached === false) tagsAttached = false;

  return { damage, stains, tagsAttached, packaging, unusable: worker.unusable === true };
}
