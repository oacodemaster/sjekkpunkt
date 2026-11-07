import type { InputHTMLAttributes, ReactNode } from 'react';
import { Icon } from './icon';

/**
 * A 56px text field with its label above (or `srLabel` when the screen already says what it is).
 * `mono` for order, return, SKU and barcode numbers. `action` sits beside the field and drops
 * below it when space runs out; its text never shrinks.
 */
export function Field({
  id,
  label,
  srLabel,
  help,
  error,
  mono,
  desk,
  action,
  className = '',
  ...input
}: {
  id: string;
  label: ReactNode;
  srLabel?: boolean;
  help?: ReactNode;
  error?: ReactNode;
  mono?: boolean;
  desk?: boolean;
  action?: ReactNode;
  className?: string;
} & InputHTMLAttributes<HTMLInputElement>) {
  const control = (
    <input
      id={id}
      className={`sp-input ${mono ? 'sp-input--mono' : ''} ${desk ? 'sp-input--desk' : ''}`}
      aria-invalid={error ? true : undefined}
      aria-describedby={error ? `${id}-error` : help ? `${id}-help` : undefined}
      {...input}
    />
  );
  return (
    <div className={`sp-field ${className}`}>
      <label className={srLabel ? 'sp-sr' : 'sp-field__label'} htmlFor={id}>
        {label}
      </label>
      {action ? (
        <div className="sp-field__row">
          {control}
          {action}
        </div>
      ) : (
        control
      )}
      {help && !error && (
        <span className="sp-field__help" id={`${id}-help`}>
          {help}
        </span>
      )}
      {error && (
        <span className="sp-field__error" id={`${id}-error`}>
          <Icon name="stop" />
          {error}
        </span>
      )}
    </div>
  );
}
