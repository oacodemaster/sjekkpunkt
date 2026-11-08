import Link from 'next/link';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Icon, type IconName } from './icon';

export type ButtonVariant = 'primary' | 'secondary' | 'quiet' | 'destructive' | 'brand' | 'on-dark';

/**
 * A tap target with a word: 56px high on the handheld, 48px with `desk`. The label wraps and
 * never truncates; no fixed widths. primary is the one main action (commits are always primary);
 * brand and on-dark only on frame (front page, demo stage).
 */
export function buttonClass({ variant = 'primary', block, desk, className = '' }: { variant?: ButtonVariant; block?: boolean; desk?: boolean; className?: string }) {
  return ['sp-btn', `sp-btn--${variant}`, block && 'sp-btn--block', desk && 'sp-btn--desk', className].filter(Boolean).join(' ');
}

type Common = { variant?: ButtonVariant; block?: boolean; desk?: boolean; icon?: IconName; iconAfter?: IconName; children: ReactNode; className?: string };

export function Button({ variant, block, desk, icon, iconAfter, children, className, type = 'button', ...rest }: Common & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type={type} className={buttonClass({ variant, block, desk, className })} {...rest}>
      {icon && <Icon name={icon} />}
      {children}
      {iconAfter && <Icon name={iconAfter} />}
    </button>
  );
}

export function ButtonLink({ href, variant, block, desk, icon, iconAfter, children, className, testId }: Common & { href: string; testId?: string }) {
  return (
    <Link href={href} className={buttonClass({ variant, block, desk, className })} data-testid={testId}>
      {icon && <Icon name={icon} />}
      {children}
      {iconAfter && <Icon name={iconAfter} />}
    </Link>
  );
}
