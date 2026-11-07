import type { ReactNode } from 'react';

/** A headline number on a desk screen: label, then the figure in mono. Counts items, never people. */
export function Stat({ label, value, testId }: { label: string; value: ReactNode; testId?: string }) {
  return (
    <div className="sp-stat">
      <div className="sp-stat__label">{label}</div>
      <div className="sp-stat__value" data-testid={testId}>
        {value}
      </div>
    </div>
  );
}
