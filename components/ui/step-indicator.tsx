import type { ReactNode } from 'react';
import { Icon } from './icon';

export interface Step {
  key: string;
  label: string;
  optional?: string;
  done: boolean;
}

/**
 * The photo steps of a return as wrapping chips, with «Bilde 2 av 4» above. Done steps show a
 * tick, the current step is filled graphite, upcoming steps are outlined; chips wrap instead of
 * shrinking. The design system makes them read-only on the handheld; here they stay buttons
 * (with `onSelect`) because the station has always let the worker jump to a step, and the e2e
 * tests do. The number is hidden from the accessible name, which starts with the label.
 */
export function StepIndicator({ count, label, steps, current, onSelect, disabled }: { count: ReactNode; label: string; steps: Step[]; current: string; onSelect?: (key: string) => void; disabled?: boolean }) {
  return (
    <nav className="sp-steps" aria-label={label}>
      <span className="sp-steps__count">{count}</span>
      <ol className="sp-steps__list">
        {steps.map((s, i) => {
          const isCurrent = s.key === current;
          const cls = `sp-step ${isCurrent ? 'sp-step--current' : s.done ? 'sp-step--done' : ''}`;
          const inner = (
            <>
              <span className="sp-step__n" aria-hidden>
                {s.done && !isCurrent ? <Icon name="tick" /> : i + 1}
              </span>
              <span>
                {s.label}
                {s.optional && <span className="sp-step__opt"> · {s.optional}</span>}
              </span>
            </>
          );
          return (
            <li key={s.key} className="flex">
              {onSelect ? (
                <button type="button" className={`${cls} min-h-target-handheld cursor-pointer text-left`} aria-current={isCurrent ? 'step' : undefined} onClick={() => onSelect(s.key)} disabled={disabled}>
                  {inner}
                </button>
              ) : (
                <span className={cls} aria-current={isCurrent ? 'step' : undefined}>
                  {inner}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
