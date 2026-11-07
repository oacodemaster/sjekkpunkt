import { pairKey, pairLabelNb, sortedPair } from './catalog';
import { withDefaults, type EngineSettings } from './constants';
import type { ConfusionEvent, PackAlert, Product } from './types';

const DAY_MS = 24 * 60 * 60 * 1000;

export function confusionEvent(
  a: string,
  b: string,
  kind: ConfusionEvent['kind'],
  now: Date,
): ConfusionEvent {
  return { skuPair: sortedPair(a, b), kind, at: now.toISOString() };
}

export function countInWindow(
  events: ConfusionEvent[],
  pair: [string, string],
  now: Date,
  windowDays: number,
): number {
  const key = pairKey(sortedPair(...pair));
  const from = now.getTime() - windowDays * DAY_MS;
  return events.filter((e) => {
    const t = new Date(e.at).getTime();
    return pairKey(sortedPair(...e.skuPair)) === key && t > from && t <= now.getTime();
  }).length;
}

export function activeAlertFor(alerts: PackAlert[], sku: string): PackAlert | undefined {
  return alerts.find((a) => a.active && (a.skuPair[0] === sku || a.skuPair[1] === sku));
}

/**
 * The loop: add the event, count events for the same sorted pair inside the window,
 * and create a REQUIRE_LABEL_PHOTO alert when the threshold is reached and none is active.
 */
export function recordConfusion(
  events: ConfusionEvent[],
  alerts: PackAlert[],
  e: ConfusionEvent,
  now: Date,
  products: Product[] = [],
  settings?: Partial<EngineSettings>,
): { events: ConfusionEvent[]; alerts: PackAlert[]; newAlert?: PackAlert; count: number } {
  const s = withDefaults(settings);
  const pair = sortedPair(...e.skuPair);
  const nextEvents = [...events, { ...e, skuPair: pair }];
  const count = countInWindow(nextEvents, pair, now, s.confusionWindowDays);
  const hasActive = alerts.some((a) => a.active && pairKey(a.skuPair) === pairKey(pair));

  if (count >= s.confusionThreshold && !hasActive) {
    const newAlert: PackAlert = {
      skuPair: pair,
      rule: 'REQUIRE_LABEL_PHOTO',
      reasonNb: `${pairLabelNb(pair, products)} forvekslet ${count} ganger siste ${s.confusionWindowDays} dager`,
      createdAt: now.toISOString(),
      active: true,
      origin: 'auto',
    };
    return { events: nextEvents, alerts: [...alerts, newAlert], newAlert, count };
  }
  return { events: nextEvents, alerts, count };
}
