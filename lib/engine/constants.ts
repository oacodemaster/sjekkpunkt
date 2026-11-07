// Engine constants. Admin settings can override the thresholds at runtime
// (see EngineSettings); these are the defaults from the demo brief section 6.

export const ENGINE_VERSION = '1.1.0';

export const PACK_CONFIDENCE_MIN = 0.8;
export const RETURN_CONFIDENCE_MIN = 0.7;
export const CONFUSION_THRESHOLD = 3; // events per SKU pair
export const CONFUSION_WINDOW_DAYS = 7;
export const MAX_RETAKES = 2;
export const RETURN_WINDOW_DAYS = 30;
export const VISION_TIMEOUT_MS = 8000; // P9

export const SPECIAL_LOCATIONS = {
  outlet: 'B-OUT-1',
  repair: 'R-REP-1',
  scrap: 'X-KASS',
} as const;

export interface EngineSettings {
  packConfidenceMin: number;
  returnConfidenceMin: number;
  confusionThreshold: number;
  confusionWindowDays: number;
  maxRetakes: number;
  returnWindowDays: number;
}

export const DEFAULT_SETTINGS: EngineSettings = {
  packConfidenceMin: PACK_CONFIDENCE_MIN,
  returnConfidenceMin: RETURN_CONFIDENCE_MIN,
  confusionThreshold: CONFUSION_THRESHOLD,
  confusionWindowDays: CONFUSION_WINDOW_DAYS,
  maxRetakes: MAX_RETAKES,
  returnWindowDays: RETURN_WINDOW_DAYS,
};

export function withDefaults(s?: Partial<EngineSettings>): EngineSettings {
  return { ...DEFAULT_SETTINGS, ...s };
}

const SIZE_ORDER = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'];

/** Sort key for sizes: letter sizes in garment order, numeric sizes by first number. */
export function sizeRank(size: string | undefined): number {
  if (!size) return Number.MAX_SAFE_INTEGER;
  const i = SIZE_ORDER.indexOf(size.toUpperCase());
  if (i >= 0) return i;
  const n = parseFloat(size);
  return Number.isNaN(n) ? Number.MAX_SAFE_INTEGER - 1 : 100 + n;
}
