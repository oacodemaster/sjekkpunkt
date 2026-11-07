// The design system's twelve stroke icons (assets/Icons), paths copied exactly from the SVG files
// in design/icons/. 24px grid, 2px stroke, round caps; stroke is currentColor so they recolour.
// Status icons are shape-coded: ok circle with tick, warn triangle, stop octagon, info circle with i.

const PATHS = {
  ok: (
    <>
      <circle cx="12" cy="12" r="9.5" />
      <path d="M7.5 12.5l3 3 6-6.5" />
    </>
  ),
  warn: (
    <>
      <path d="M12 3.5L2.8 19.5h18.4z" />
      <path d="M12 10v4.5" />
      <path d="M12 17.2v.1" />
    </>
  ),
  stop: (
    <>
      <path d="M8.3 2.8h7.4l5.5 5.5v7.4l-5.5 5.5H8.3l-5.5-5.5V8.3z" />
      <path d="M8.5 8.5l7 7M15.5 8.5l-7 7" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9.5" />
      <path d="M12 11v6" />
      <path d="M12 7.6v.1" />
    </>
  ),
  mic: (
    <>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0" />
      <path d="M12 17.5V21" />
    </>
  ),
  'mic-off': (
    <>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0" />
      <path d="M12 17.5V21" />
      <path d="M4 4l16 16" />
    </>
  ),
  camera: (
    <>
      <path d="M3 8h4l2-3h6l2 3h4v11H3z" />
      <circle cx="12" cy="13" r="3.5" />
    </>
  ),
  barcode: <path d="M4 5v14M7 5v14M11 5v14M14 5v14M18 5v14M20.5 5v14" />,
  box: (
    <>
      <path d="M3.5 7.5L12 3.5l8.5 4v9L12 20.5l-8.5-4z" />
      <path d="M3.5 7.5L12 11.5l8.5-4M12 11.5v9" />
    </>
  ),
  label: (
    <>
      <path d="M4 4h9l7 7-9 9-7-7z" />
      <circle cx="8.5" cy="8.5" r="1.3" />
    </>
  ),
  'arrow-right': <path d="M4 12h15M13 6l6 6-6 6" />,
  device: (
    <>
      <rect x="6.5" y="2.5" width="11" height="19" rx="2" />
      <path d="M10 18.5h4" />
    </>
  ),
  /** The step indicator's tick (from the StepIndicator preview, not a separate icon file). */
  tick: <path d="M5 12.5l4.5 4.5L19 7.5" />,
} as const;

export type IconName = keyof typeof PATHS;

/** Decorative by default: the word next to it carries the meaning. */
export function Icon({ name, className = '', label }: { name: IconName; className?: string; label?: string }) {
  return (
    <svg className={`sp-icon ${className}`} viewBox="0 0 24 24" aria-hidden={label ? undefined : true} role={label ? 'img' : undefined} aria-label={label}>
      {PATHS[name]}
    </svg>
  );
}

export type Tone = 'ok' | 'warn' | 'stop';
/** Status is always colour, icon and word: the icon for each tone. */
export const TONE_ICON: Record<Tone | 'info', IconName> = { ok: 'ok', warn: 'warn', stop: 'stop', info: 'info' };
