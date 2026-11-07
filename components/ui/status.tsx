import type { HTMLAttributes, ReactNode } from 'react';
import { Icon, TONE_ICON, type IconName, type Tone } from './icon';

// Status is always colour, icon and word. ok green means matches, warn amber means do something,
// stop red means stop. Nothing else on a station uses these colours.

/** The hero of a station screen: one colour, one icon, one short word, one line on what to do. */
export function VerdictBanner({ tone, word, text, ...rest }: { tone: Tone; word: ReactNode; text?: ReactNode } & HTMLAttributes<HTMLDivElement>) {
  return (
    <div role="status" className={`sp-verdict sp-verdict--${tone}`} {...rest}>
      <Icon name={TONE_ICON[tone]} />
      <div className="sp-verdict__word">{word}</div>
      {text && <div className="sp-verdict__text">{text}</div>}
    </div>
  );
}

/** A short label with an icon that states one fact. Not a button. */
export function StatusChip({ tone, icon, desk, children, className = '', ...rest }: { tone?: Tone | 'info'; icon?: IconName; desk?: boolean; children: ReactNode; className?: string } & HTMLAttributes<HTMLSpanElement>) {
  const glyph = icon ?? (tone ? TONE_ICON[tone] : undefined);
  return (
    <span className={`sp-chip ${tone ? `sp-chip--${tone}` : ''} ${desk ? 'sp-chip--desk' : ''} ${className}`} {...rest}>
      {glyph && <Icon name={glyph} />}
      {children}
    </span>
  );
}

/**
 * A full-width message for conditions that last longer than one verdict. Voice and microphone
 * problems use the neutral info tone: voice is optional, so losing it is not an error.
 */
export function Banner({
  tone = 'info',
  title,
  icon,
  children,
  role = 'status',
  className = '',
  ...rest
}: { tone?: 'info' | 'warn' | 'error'; title?: ReactNode; icon?: IconName; children: ReactNode; className?: string } & HTMLAttributes<HTMLDivElement>) {
  const glyph = icon ?? (tone === 'warn' ? 'warn' : tone === 'error' ? 'stop' : 'info');
  return (
    <div role={role} className={`sp-banner ${tone === 'info' ? '' : `sp-banner--${tone}`} ${className}`} {...rest}>
      <Icon name={glyph} />
      <span className="min-w-0">
        {title && <span className="sp-banner__title">{title}</span>}
        {children}
      </span>
    </div>
  );
}

/** What a list says when it is empty, and what to do next. Solid border (dashed means proposed). */
export function EmptyState({ icon = 'ok', title, text, action, className = '' }: { icon?: IconName; title: ReactNode; text?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={`sp-empty ${className}`}>
      <span className="sp-empty__icon">
        <Icon name={icon} />
      </span>
      <span className="sp-empty__title">{title}</span>
      {text && <span className="sp-empty__text">{text}</span>}
      {action}
    </div>
  );
}
