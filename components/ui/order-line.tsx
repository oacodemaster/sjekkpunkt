import type { HTMLAttributes, ReactNode } from 'react';

export type LineState = 'idle' | 'ok' | 'missing' | 'stop' | 'warn';

/**
 * One line of an order at packing: name, SKU, quantity («0 av 1» outlined, «1 av 1» filled when
 * counted), an optional reference thumbnail, and a foot with buttons (before the check) or status
 * chips (after). A missing line gets the dashed red outline: it has no box on the photo.
 */
export function OrderLine({
  name,
  sku,
  qty,
  qtyDone,
  qtyLabel,
  state = 'idle',
  thumb,
  foot,
  qtyTestId,
  ...rest
}: {
  name: ReactNode;
  sku: string;
  qty: ReactNode;
  qtyDone?: boolean;
  qtyLabel?: string;
  state?: LineState;
  /** CSS background for the 56px thumbnail (url and position), or nothing */
  thumb?: { url: string; position?: string } | null;
  foot?: ReactNode;
  qtyTestId?: string;
} & HTMLAttributes<HTMLLIElement>) {
  return (
    <li className={`sp-line ${state === 'idle' ? '' : `sp-line--${state}`} ${thumb ? '' : 'sp-line--nothumb'}`} {...rest}>
      {thumb && <span className="sp-line__thumb" style={{ backgroundImage: `url(${thumb.url})`, backgroundPosition: thumb.position ?? 'center' }} aria-hidden />}
      <span className="min-w-0">
        <span className="sp-line__name">{name}</span>
        <br />
        <span className="sp-line__sku">{sku}</span>
      </span>
      <span className={`sp-qty ${qtyDone ? 'sp-qty--done' : ''}`} aria-label={qtyLabel} data-testid={qtyTestId}>
        {qty}
      </span>
      {foot && <span className="sp-line__foot">{foot}</span>}
    </li>
  );
}
