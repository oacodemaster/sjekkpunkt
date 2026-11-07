'use client';

import type { Box2d } from '@/lib/engine/types';

export type BoxTone = 'ok' | 'bad' | 'warn';
export interface PhotoBox {
  box: Box2d;
  tone: BoxTone;
  label?: string;
}

const BORDER: Record<BoxTone, string> = { ok: 'border-ok', bad: 'border-bad', warn: 'border-warn' };
const CHIP: Record<BoxTone, string> = { ok: 'bg-ok', bad: 'bg-bad', warn: 'bg-warn' };

/**
 * A photo with the model's boxes drawn on it (normalized [ymin, xmin, ymax, xmax] in 0-1000).
 * The wrapper shrink-wraps the image, so the percentage boxes always line up with it.
 */
export function PhotoWithBoxes({ url, boxes, alt, onLoad, testId }: { url: string | null; boxes: PhotoBox[]; alt: string; onLoad?: () => void; testId?: string }) {
  if (!url) return null;
  return (
    <div className="relative mx-auto w-fit max-w-full overflow-hidden rounded-xl bg-slate-100" data-testid={testId}>
      {/* eslint-disable-next-line @next/next/no-img-element -- signed URLs and local illustrations */}
      <img src={url} alt={alt} className="block max-h-64 w-auto max-w-full" onLoad={onLoad} />
      {boxes
        .filter(({ box }) => box[2] > box[0] && box[3] > box[1])
        .map(({ box, tone, label }, k) => (
          <div
            key={k}
            className={`absolute rounded-md border-4 ${BORDER[tone]}`}
            style={{ top: `${box[0] / 10}%`, left: `${box[1] / 10}%`, height: `${(box[2] - box[0]) / 10}%`, width: `${(box[3] - box[1]) / 10}%` }}
            data-tone={tone}
          >
            {label && <span className={`absolute left-0 top-0 rounded-br-md px-1.5 text-xs font-bold text-white ${CHIP[tone]}`}>{label}</span>}
          </div>
        ))}
    </div>
  );
}
