/**
 * A real app screen in a plain graphite handheld frame (sp-device), for pages about the app (the
 * landing page). `top` cuts the frame off at the bottom edge of its card, like a device peeking
 * up; `wide` is a desk screen (team lead) instead of a handheld. The image is a screenshot of the
 * live station, never a drawing (docs/landing-copy.md, section 10).
 */
export function DeviceShot({
  src,
  alt,
  width,
  height,
  priority = false,
  variant = 'handheld',
  className = '',
  narrow,
}: {
  src: string;
  alt: string;
  width: number;
  height: number;
  priority?: boolean;
  variant?: 'handheld' | 'top' | 'wide';
  className?: string;
  /** a crop for screens under 640px, where the full desk screen would be too small to read */
  narrow?: { src: string; width: number; height: number };
}) {
  return (
    <figure className={`sp-device sp-device--${variant} ${className}`}>
      {/* Pre-sized WebP screenshots (a picture, so a phone can get a narrower crop); the hero one is the LCP image. */}
      <picture>
        {narrow && <source media="(max-width: 639px)" srcSet={narrow.src} width={narrow.width} height={narrow.height} />}
        <img
          src={src}
          alt={alt}
          width={width}
          height={height}
          loading={priority ? 'eager' : 'lazy'}
          fetchPriority={priority ? 'high' : 'auto'}
          decoding={priority ? 'sync' : 'async'}
        />
      </picture>
    </figure>
  );
}
