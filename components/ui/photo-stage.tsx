import type { ReactNode } from 'react';
import type { Box2d } from '@/lib/engine/types';
import { Icon, type IconName } from './icon';

/** present: in the order (green); unexpected: not in the order (red); uncertain: the model is not sure (amber). */
export type BoxKind = 'present' | 'unexpected' | 'uncertain';
export interface StageBox {
  box: Box2d;
  kind: BoxKind;
  /** the tag on the box: the item, «Ikke i ordren», «Størrelse M» */
  label?: string;
  icon?: IconName;
  /** e2e hook, kept from the old overlay */
  tone?: string;
}

const ICON: Record<BoxKind, IconName> = { present: 'ok', unexpected: 'stop', uncertain: 'warn' };

/**
 * A photo on the untinted `stage`, with the model's boxes (box_2d [ymin, xmin, ymax, xmax] on a
 * 0 to 1000 scale, straight to percentages). Never tinted, never near the brand lime.
 * The frame shrink-wraps the image, so the boxes line up whatever the photo's shape.
 */
export function PhotoStage({
  url,
  alt,
  boxes = [],
  meta,
  onLoad,
  testId,
  maxHeight = 320,
}: {
  url: string | null;
  alt: string;
  boxes?: StageBox[];
  meta?: [ReactNode, ReactNode?];
  onLoad?: () => void;
  testId?: string;
  maxHeight?: number;
}) {
  if (!url) return null;
  return (
    <figure className="sp-stage m-0" data-testid={testId}>
      <div className="relative mx-auto w-fit max-w-full">
        {/* eslint-disable-next-line @next/next/no-img-element -- signed URLs and local illustrations */}
        <img src={url} alt={alt} className="block w-auto max-w-full rounded-[4px]" style={{ maxHeight }} onLoad={onLoad} />
        {boxes
          .filter(({ box }) => box[2] > box[0] && box[3] > box[1])
          .map(({ box, kind, label, icon, tone }, k) => (
            <div
              key={k}
              className={`sp-bbox ${kind === 'present' ? '' : `sp-bbox--${kind}`} ${box[1] > 500 ? 'sp-bbox--tag-right' : ''}`}
              style={{ top: `${box[0] / 10}%`, left: `${box[1] / 10}%`, height: `${(box[2] - box[0]) / 10}%`, width: `${(box[3] - box[1]) / 10}%` }}
              data-tone={tone ?? kind}
            >
              {label && (
                <span className="sp-bbox__tag">
                  <Icon name={icon ?? ICON[kind]} />
                  {label}
                </span>
              )}
            </div>
          ))}
      </div>
      {meta && (
        <figcaption className="sp-stage__meta">
          <span>{meta[0]}</span>
          {meta[1] !== undefined && <span>{meta[1]}</span>}
        </figcaption>
      )}
    </figure>
  );
}
