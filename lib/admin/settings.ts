import 'server-only';
import { DEFAULT_SETTINGS } from '@/lib/engine/constants';
import { LANGS } from '@/lib/i18n/strings';
import { GRADING_GUIDE } from '@/lib/voice/agent-config';
import { settingsSchema, type AdminSettings, type SettingKey } from './schemas';

// Defaults and reading of stored settings. Server-side (the default guide comes with the agent config).

export const SETTING_DEFAULTS: AdminSettings = {
  pack_confidence_min: DEFAULT_SETTINGS.packConfidenceMin,
  return_confidence_min: DEFAULT_SETTINGS.returnConfidenceMin,
  confusion_threshold: DEFAULT_SETTINGS.confusionThreshold,
  confusion_window_days: DEFAULT_SETTINGS.confusionWindowDays,
  max_retakes: DEFAULT_SETTINGS.maxRetakes,
  return_window_days: DEFAULT_SETTINGS.returnWindowDays,
  photo_retention_days: 30,
  wrong_parcel_cost_nok: 340,
  enabled_languages: [...LANGS],
  daily_spend_cap_nok: { vision: 200, elevenlabs: 300 },
  grading_guide: GRADING_GUIDE,
};

/** Stored rows → settings, falling back per key to the default when a row is missing or invalid. */
export function readSettings(rows: { key: string; value: unknown }[]): AdminSettings {
  const out = { ...SETTING_DEFAULTS } as Record<string, unknown>;
  for (const r of rows) {
    const field = settingsSchema.shape[r.key as SettingKey];
    if (!field) continue;
    const parsed = field.safeParse(r.value);
    if (parsed.success) out[r.key] = parsed.data;
  }
  return out as AdminSettings;
}

