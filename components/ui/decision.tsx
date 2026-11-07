import type { ReactNode } from 'react';

// Grade and shelf on the returns decision screen: verdicts too, but graphite, never verdict colours.

export const GRADE_WORD_NB: Record<string, string> = { A: 'Som ny', B: 'Outlet', C: 'Reparasjon', D: 'Kassert' };

/**
 * The grade as a large graphite letter with its meaning in words. All grades share one style:
 * grades are not good or bad. `letterTestId` keeps the e2e hook on the letter itself.
 */
export function GradeBadge({ grade, kicker, word, desk, letterTestId }: { grade: string; kicker: ReactNode; word?: ReactNode; desk?: boolean; letterTestId?: string }) {
  return (
    <div className={`sp-grade ${desk ? 'sp-grade--desk' : ''}`}>
      <span className="sp-grade__letter" data-testid={letterTestId}>
        {grade}
      </span>
      <span className="sp-grade__label">
        <span className="sp-grade__kicker">{kicker}</span>
        {word && <span className="sp-grade__word">{word}</span>}
      </span>
    </div>
  );
}

/** Where the item goes, 64 to 72px mono on a label-like plate. The code never wraps or shrinks below 64px. */
export function ShelfCode({ label, code, note, codeTestId, className = '' }: { label: ReactNode; code: string; note?: ReactNode; codeTestId?: string; className?: string }) {
  return (
    <div className={`sp-shelf ${className}`}>
      <span className="sp-shelf__label">{label}</span>
      <span className="sp-shelf__code" data-testid={codeTestId}>
        {code}
      </span>
      {note && <span className="sp-shelf__note">{note}</span>}
    </div>
  );
}
