import type { HTMLAttributes, ReactNode } from 'react';

/**
 * A bordered block of facts about one thing. `proposal` (dashed ink-2, eyebrow «Motorens
 * forslag») for anything the engine or model proposes; the solid primary commit button sits under
 * it. `desk` adds the raised shadow on lead and admin screens. No coloured left-border accents.
 */
export function Card({
  eyebrow,
  title,
  proposal,
  desk,
  as: Tag = 'section',
  className = '',
  children,
  ...rest
}: {
  eyebrow?: ReactNode;
  title?: ReactNode;
  proposal?: boolean;
  desk?: boolean;
  as?: 'section' | 'div' | 'li' | 'article';
  className?: string;
  children?: ReactNode;
} & Omit<HTMLAttributes<HTMLElement>, 'title'>) {
  return (
    <Tag className={`sp-card ${proposal ? 'sp-card--proposal' : ''} ${desk ? 'sp-card--desk' : ''} ${className}`} {...rest}>
      {eyebrow && <div className="sp-card__eyebrow">{eyebrow}</div>}
      {title && <h3 className="sp-card__title">{title}</h3>}
      {children}
    </Tag>
  );
}

/** Label and value pairs inside a card. */
export function Kv({ items, className = '' }: { items: [ReactNode, ReactNode, string?][]; className?: string }) {
  return (
    <dl className={`sp-kv ${className}`}>
      {items.map(([k, v, cls], i) => (
        <div key={i} className="contents">
          <dt>{k}</dt>
          <dd className={cls}>{v}</dd>
        </div>
      ))}
    </dl>
  );
}
