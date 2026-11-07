// Admin validation (M7), shared by the admin forms and the API routes. Pure: no React, Next or Supabase.

import { z } from 'zod';
import { LANGS } from '@/lib/i18n/strings';
import type { Lang } from '@/lib/engine/types';

const int = (min: number, max: number) => z.number().int().min(min).max(max);

/** Every setting an admin may change, with the range that keeps the engine sane. */
export const settingsSchema = z.object({
  pack_confidence_min: z.number().min(0.5).max(0.99),
  return_confidence_min: z.number().min(0.5).max(0.99),
  confusion_threshold: int(2, 10),
  confusion_window_days: int(1, 90),
  max_retakes: int(1, 5),
  return_window_days: int(7, 365),
  photo_retention_days: int(1, 365),
  wrong_parcel_cost_nok: int(0, 10_000),
  enabled_languages: z
    .array(z.enum(LANGS as [Lang, ...Lang[]]))
    .min(1)
    .refine((ls) => ls.includes('nb'), { message: 'nb_required' })
    .transform((ls) => LANGS.filter((l) => ls.includes(l))),
  daily_spend_cap_nok: z.object({ vision: int(0, 100_000), elevenlabs: int(0, 100_000) }),
  grading_guide: z.string().trim().min(50).max(8_000),
});
export type AdminSettings = z.output<typeof settingsSchema>;
export type SettingKey = keyof AdminSettings;
export const SETTING_KEYS = Object.keys(settingsSchema.shape) as SettingKey[];

/** A PATCH changes any subset. Unknown keys are dropped by zod, never written. */
export const settingsPatchSchema = settingsSchema.partial().refine((p) => Object.keys(p).length > 0, { message: 'empty' });

// ---------- products ----------

const sku = z
  .string()
  .trim()
  .regex(/^[A-Z0-9][A-Z0-9-]{1,39}$/, 'sku_format');
const optText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((s) => (s === '' ? null : s))
    .nullable()
    .optional();

export const productSchema = z.object({
  sku,
  name_nb: z.string().trim().min(2).max(120),
  name_en: z.string().trim().min(2).max(120),
  category: z.enum(['apparel', 'accessory']),
  color: z.string().trim().min(1).max(40),
  size: optText(20),
  price_nok: int(0, 1_000_000),
  location_code: z.string().trim().min(1).max(20),
  variant_group: optText(60),
  barcode: z
    .string()
    .trim()
    .regex(/^(\d{8}|\d{12,14})?$/, 'barcode_format')
    .transform((s) => (s === '' ? null : s))
    .nullable()
    .optional(),
});
export type ProductInput = z.output<typeof productSchema>;

/** Errors the product SQL functions raise, passed through to the form. */
export const PRODUCT_ERRORS = ['sku_exists', 'sku_taken', 'barcode_taken', 'not_stock_location', 'not_found', 'too_many_photos'];

// ---------- CSV import rows ----------

export const IMPORT_KINDS = ['products', 'orders', 'returns'] as const;
export type ImportKind = (typeof IMPORT_KINDS)[number];

/** Columns per kind, in the order the template shows them. */
export const IMPORT_COLUMNS: Record<ImportKind, readonly string[]> = {
  products: ['sku', 'name_nb', 'name_en', 'category', 'color', 'size', 'price_nok', 'location_code', 'variant_group', 'barcode'],
  orders: ['order', 'customer_ref', 'sku', 'qty', 'price_nok'],
  returns: ['return', 'order', 'customer_reason_nb', 'sku', 'qty', 'registered_at'],
};
export const IMPORT_REQUIRED: Record<ImportKind, readonly string[]> = {
  products: ['sku', 'name_nb', 'name_en', 'category', 'color', 'price_nok', 'location_code'],
  orders: ['order', 'customer_ref', 'sku', 'qty'],
  returns: ['return', 'order', 'customer_reason_nb', 'sku'],
};

const ext = z.string().trim().regex(/^[A-Za-z0-9-]{1,30}$/, 'id_format');
const numFromText = (min: number, max: number) =>
  z
    .string()
    .trim()
    .regex(/^\d+$/, 'number_format')
    .transform(Number)
    .pipe(int(min, max));

export const importRowSchemas = {
  products: z.object({
    ...productSchema.shape,
    price_nok: numFromText(0, 1_000_000),
  }),
  orders: z.object({
    order: ext,
    customer_ref: z.string().trim().min(1).max(120),
    sku,
    qty: numFromText(1, 99),
    price_nok: z
      .string()
      .trim()
      .optional()
      .transform((s) => (s ? s : undefined))
      .pipe(numFromText(0, 1_000_000).optional()),
  }),
  returns: z.object({
    return: ext,
    order: ext,
    customer_reason_nb: z.string().trim().min(1).max(200),
    sku,
    qty: z
      .string()
      .trim()
      .optional()
      .transform((s) => (s ? s : '1'))
      .pipe(numFromText(1, 99)),
    registered_at: z
      .string()
      .trim()
      .optional()
      .transform((s) => (s ? s : undefined))
      .pipe(z.iso.datetime({ offset: true }).or(z.iso.date()).optional()),
  }),
} satisfies Record<ImportKind, z.ZodType>;

export type ImportRow<K extends ImportKind> = z.output<(typeof importRowSchemas)[K]>;
