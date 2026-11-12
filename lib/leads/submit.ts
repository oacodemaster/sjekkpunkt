import 'server-only';
import { escapeHtml, leadsNotifyTo, sendEmail } from '@/lib/email/resend';
import { LANDING } from '@/lib/landing/copy';
import { clientIp, limitLead } from '@/lib/limits/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { checkLead, firstName, isTestAddress, leadInput, type FormError, type Lead, type LeadField, type LeadState } from './schema';
import { checkFormToken, issueFormToken } from './token';

/**
 * One submission of the landing page form (landing page brief, section 9), in this order:
 * 1. the rate limit (per visitor and in total, every attempt counts, fails closed);
 * 2. the honeypot: a filled `website` field gets the thank-you page and nothing is stored;
 * 3. the signed time the form was shown: under three seconds is "too quick";
 * 4. zod, the same rules the form checks in the browser;
 * 5. one SQL function stores the lead (service role only);
 * 6. the email to the owner. If it fails or no key is set, the lead is still stored and the
 *    visitor still sees the thank-you page; the failure is logged.
 */
export async function submitLead(form: FormData, headers: Headers, attempt: number): Promise<LeadState> {
  const token = issueFormToken();
  const values = leadInput(form);
  const error = (formError: FormError | undefined, fields: LeadField[] = []): LeadState => ({ status: 'error', token, fields, form: formError, values, attempt });

  const limit = await limitLead(clientIp(headers));
  if (!limit.ok) return error('rateLimited');

  const honeypot = form.get('website');
  if (typeof honeypot === 'string' && honeypot.trim() !== '') {
    return { status: 'sent', token, firstName: firstName(values.name) };
  }

  const t = checkFormToken(form.get('t'));
  if (t === 'too_fast') return error('tooFast');
  if (t === 'invalid') return error('failed');

  const checked = checkLead(values);
  if (!checked.ok) return error(undefined, checked.fields);
  const lead = checked.lead;

  const db = createAdminClient();
  const { data: id, error: dbError } = await db.rpc('insert_lead', {
    p: {
      name: lead.name,
      email: lead.email,
      company: lead.company,
      role: lead.role ?? '',
      orders_per_day: lead.volume ?? '',
      interest: lead.interest ?? '',
      message: lead.message ?? '',
      lang: lead.lang,
    },
  });
  if (dbError || typeof id !== 'string') {
    console.error('[leads] insert failed:', dbError?.message ?? 'no id');
    return error('failed');
  }

  // Test addresses (example.com, .test) are stored but never emailed, so e2e runs send nothing.
  if (!isTestAddress(lead.email)) {
    const sent = await sendEmail({ to: leadsNotifyTo(), subject: `Ny henvendelse fra ${lead.name} (${lead.company})`, html: leadEmailHtml(lead), replyTo: lead.email });
    if (sent) {
      const { error: nErr } = await db.rpc('lead_notified', { p: { id } });
      if (nErr) console.error('[leads] lead_notified failed:', nErr.message);
    } else {
      console.error('[leads] the email about lead', id, 'was not sent; the lead is stored');
    }
  }

  return { status: 'sent', token, firstName: firstName(lead.name) };
}

/** The owner's notification, in Norwegian, with the visitor's own words escaped. */
export function leadEmailHtml(lead: Lead): string {
  const nb = LANDING.nb.form;
  const rows: [string, string | undefined][] = [
    [nb.labels.name, lead.name],
    [nb.labels.email, lead.email],
    [nb.labels.company, lead.company],
    [nb.labels.role, lead.role && nb.roles[lead.role]],
    [nb.labels.volume, lead.volume && nb.volumes[lead.volume]],
    [nb.labels.interest, lead.interest && nb.interests[lead.interest]],
    [nb.labels.message, lead.message],
    ['Språk på siden', lead.lang === 'nb' ? 'Norsk' : 'Engelsk'],
  ];
  const tr = rows
    .filter(([, v]) => !!v)
    .map(
      ([k, v]) =>
        `<tr><td style="padding:6px 14px 6px 0;color:#4b5563;font:14px/1.5 sans-serif;vertical-align:top;white-space:nowrap">${escapeHtml(k)}</td><td style="padding:6px 0;color:#111827;font:14px/1.5 sans-serif;white-space:pre-wrap">${escapeHtml(v!)}</td></tr>`,
    )
    .join('');
  return `<div style="font-family:sans-serif;max-width:560px;color:#111827"><h2 style="margin:0 0 14px;font-size:18px">Ny henvendelse fra Sjekkpunkt-siden</h2><table style="border-collapse:collapse">${tr}</table><p style="margin:16px 0 0;font:13px sans-serif;color:#4b5563">Svar på denne e-posten for å svare ${escapeHtml(lead.name)} direkte. Lovet svartid: én arbeidsdag.</p></div>`;
}
