import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Icon } from './icon';

export type OrbState = 'off' | 'connecting' | 'listening' | 'speaking';

/**
 * The voice coach's state as a 44px dot, always with its word. Graphite on stations, lime on the
 * demo stage (inside .sp-dark). Never a verdict colour. Under reduced motion the ring and bars
 * stand still; the word still changes.
 */
export function VoiceOrb({ state, label, className = '' }: { state: OrbState; label: ReactNode; className?: string }) {
  return (
    <span className={`sp-orb sp-orb--${state} ${className}`} role="status">
      <span className="sp-orb__dot">
        {state === 'speaking' ? (
          <span className="sp-bars" aria-hidden>
            <i />
            <i />
            <i />
          </span>
        ) : (
          <Icon name={state === 'off' ? 'mic-off' : 'mic'} />
        )}
      </span>
      {label}
    </span>
  );
}

/**
 * The large hold-to-speak button, full width, 76px. Held (aria-pressed) it inverts and says what
 * happens on release. It sits above the screen's main button, never instead of it.
 */
export function PushToTalk({ main, sub, pressed, ...rest }: { main: ReactNode; sub?: ReactNode; pressed: boolean } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" className="sp-ptt" aria-pressed={pressed} {...rest}>
      <Icon name="mic" />
      <span>
        <span className="sp-ptt__main">{main}</span>
        {sub && <span className="sp-ptt__sub">{sub}</span>}
      </span>
    </button>
  );
}

/**
 * One spoken line as a bubble: the original on top, the translation under it (16px italic with a
 * mono language tag), or «oversetter …» while it comes. Coach left on surface-2, worker right.
 */
export function CaptionPair({
  role,
  who,
  text,
  lang,
  translation,
  target,
  pending,
  pendingLabel,
  dim,
  className = '',
}: {
  role: 'agent' | 'worker';
  who?: ReactNode;
  text: ReactNode;
  lang?: string | null;
  translation?: ReactNode | null;
  target?: string;
  pending?: boolean;
  pendingLabel?: ReactNode;
  dim?: boolean;
  className?: string;
}) {
  return (
    <li className={`sp-cap ${role === 'worker' ? 'sp-cap--worker' : ''} ${dim ? 'opacity-80' : ''} ${className}`} data-role={role}>
      {who && <div className="sp-cap__who">{who}</div>}
      <div className="sp-cap__orig" lang={lang ?? undefined}>
        {text}
      </div>
      {(pending || translation) && (
        <div className="sp-cap__tr">
          {target && <span className="sp-cap__lang">{target.toUpperCase()}</span>}
          {pending ? <span className="sp-cap__pending">{pendingLabel}</span> : <span lang={target}>{translation}</span>}
        </div>
      )}
    </li>
  );
}
