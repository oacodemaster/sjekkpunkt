'use client';

import { useEffect, useRef } from 'react';
import { prefersReducedMotion } from '@/components/ui/motion';

/**
 * The front page's launch video (public/video, made with /brag from the live demo). It starts
 * muted and loops; the native controls let a visitor turn the sound on (the coach's Polish lines).
 * Under reduced motion it never starts by itself: the poster stands, and play is one tap away.
 */
export function HeroVideo({ label }: { label: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = ref.current;
    if (!v || prefersReducedMotion()) return;
    v.muted = true; // set as a property: browsers only autoplay muted media
    v.play().catch(() => {}); // blocked autoplay leaves the poster and the controls
  }, []);
  return (
    <video
      ref={ref}
      className="fp-video"
      src="/video/sjekkpunkt.mp4"
      poster="/video/sjekkpunkt-poster.jpg"
      width={1920}
      height={1080}
      muted
      loop
      playsInline
      controls
      preload="metadata"
      aria-label={label}
      data-testid="hero-video"
    />
  );
}
