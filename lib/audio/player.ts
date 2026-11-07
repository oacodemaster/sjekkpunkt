// Plays the files in public/audio (same origin, so the CSP's default-src 'self' covers them).
// Browser only. Missing or blocked files never throw: the demo must not break because of a sound
// (brief section 10), and live stations treat earcons as decoration.

import type { EarconName } from '@/lib/demo/audio';

const cache = new Map<string, HTMLAudioElement>();
const missing = new Set<string>();
let voice: HTMLAudioElement | null = null;

function element(src: string): HTMLAudioElement | null {
  if (typeof Audio === 'undefined') return null;
  let a = cache.get(src);
  if (!a) {
    a = new Audio(src);
    a.preload = 'auto';
    a.addEventListener('error', () => missing.add(src));
    cache.set(src, a);
  }
  return a;
}

/** Starts loading files so the first play on stage has no gap. */
export function preloadAudio(srcs: string[]) {
  for (const s of srcs) element(s)?.load();
}

export const earconSrc = (name: EarconName) => `/audio/${name}.mp3`;

/** A short sound. Several may overlap (a shutter right before an alert). On a handheld the device volume is the mute. */
export function playEarcon(name: EarconName, muted = false) {
  if (muted) return;
  const src = earconSrc(name);
  const base = element(src);
  if (!base || missing.has(src)) return;
  const a = base.readyState >= 2 ? (base.cloneNode(true) as HTMLAudioElement) : base;
  a.volume = name === 'tool' ? 0.5 : 0.9;
  a.play().catch(() => {});
}

/**
 * A spoken line. Stops the line before it, so pressing "next" never talks over itself.
 * Resolves true when the file plays, false when it is missing, blocked or muted.
 */
export function playLine(src: string, muted: boolean): Promise<boolean> {
  stopLine();
  if (muted) return Promise.resolve(false);
  const a = element(src);
  if (!a || missing.has(src)) return Promise.resolve(false);
  voice = a;
  a.currentTime = 0;
  return a.play().then(
    () => true,
    () => false,
  );
}

export function stopLine() {
  if (voice) {
    voice.pause();
    voice.currentTime = 0;
    voice = null;
  }
}
