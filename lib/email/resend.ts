import 'server-only';

// Email through Resend's REST API, as forsterk.no sends its form email (../forsterk/lib/email/
// resend.ts): one server-side fetch, no SDK, so the browser never talks to Resend and the CSP is
// unchanged. Returns true when Resend accepted the message; any failure is logged and returns
// false, and the caller carries on (a lead is stored whether or not the email goes out).

const ENDPOINT = 'https://api.resend.com/emails';

/** The owner's inbox for new leads (landing page brief, section 9). */
export const leadsNotifyTo = () => process.env.LEADS_NOTIFY_TO || 'odin@reachamplified.com';
/** A sender on the domain forsterk.no already sends from with Resend. */
const from = () => process.env.LEADS_FROM_EMAIL || 'Sjekkpunkt <noreply@web.forsterk.no>';

export async function sendEmail({ to, subject, html, replyTo }: { to: string; subject: string; html: string; replyTo?: string }): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn('[email] RESEND_API_KEY is not set; the email was not sent.');
    return false;
  }
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from: from(), to, subject, html, ...(replyTo ? { reply_to: replyTo } : {}) }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) {
      console.error('[email] Resend answered', res.status);
      return false;
    }
    return true;
  } catch (e) {
    console.error('[email] sending failed:', e instanceof Error ? e.name : 'error');
    return false;
  }
}

export const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
