// The landing page form (landing page brief, section 9). Pure: the form checks a submission with
// it in the browser before sending, and the server checks it again before storing anything.

import { z } from 'zod';

export const LEAD_ROLES = ['warehouse_manager', 'logistics_manager', 'owner', 'it', 'other'] as const;
export const LEAD_VOLUMES = ['lt50', '50_200', '200_500', '500_2000', 'gt2000'] as const;
export const LEAD_INTERESTS = ['packing', 'returns', 'both'] as const;
export type LeadLang = 'nb' | 'en';

/** A lead is deleted this many days after it came in (the retention job, docs/decisions.md). */
export const LEAD_RETENTION_DAYS = 365;

/** Form field names. `website` is the honeypot, `t` the signed time the form was shown. */
export const LEAD_FIELDS = ['name', 'email', 'company', 'role', 'volume', 'interest', 'message'] as const;
export type LeadField = (typeof LEAD_FIELDS)[number];

const blankToUndefined = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : v);

export const leadSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().max(254).pipe(z.email()),
  company: z.string().trim().min(1).max(160),
  role: z.preprocess(blankToUndefined, z.enum(LEAD_ROLES).optional()),
  volume: z.preprocess(blankToUndefined, z.enum(LEAD_VOLUMES).optional()),
  interest: z.preprocess(blankToUndefined, z.enum(LEAD_INTERESTS).optional()),
  message: z.preprocess(blankToUndefined, z.string().trim().max(2000).optional()),
  lang: z.enum(['nb', 'en']),
});
export type Lead = z.infer<typeof leadSchema>;

/** The form's fields as plain strings (FormData values that are files count as empty). */
export function leadInput(form: FormData): Record<LeadField | 'lang', string> {
  const get = (k: string) => {
    const v = form.get(k);
    return typeof v === 'string' ? v : '';
  };
  return {
    name: get('name'),
    email: get('email'),
    company: get('company'),
    role: get('role'),
    volume: get('volume'),
    interest: get('interest'),
    message: get('message'),
    lang: get('lang') === 'en' ? 'en' : 'nb',
  };
}

/** The fields with a problem, in form order (the first one gets the focus). */
export function checkLead(input: Record<string, string>): { ok: true; lead: Lead } | { ok: false; fields: LeadField[] } {
  const r = leadSchema.safeParse(input);
  if (r.success) return { ok: true, lead: r.data };
  const bad = new Set(r.error.issues.map((i) => String(i.path[0])));
  return { ok: false, fields: LEAD_FIELDS.filter((f) => bad.has(f)) };
}

export type FormError = 'tooFast' | 'rateLimited' | 'failed';

/** What the server action answers; `token` is a fresh signed start time for the next try. */
export type LeadState =
  | { status: 'idle'; token: string }
  | { status: 'error'; token: string; fields: LeadField[]; form?: FormError; values: Record<string, string>; attempt: number }
  | { status: 'sent'; token: string; firstName: string };

/** "Kari Nordmann" → "Kari", for the thank-you line. */
export const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? '';

/** Addresses on reserved test domains never get an email (e2e runs store a lead but send nothing). */
export function isTestAddress(email: string): boolean {
  const domain = email.trim().toLowerCase().split('@')[1] ?? '';
  return /(^|\.)(example\.(com|org|net)|test|invalid|example|localhost)$/.test(domain);
}
