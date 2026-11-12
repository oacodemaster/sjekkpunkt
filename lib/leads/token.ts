import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';

// The time the form was shown, signed, so the server can tell how long the visitor took. A bot
// that posts at once is refused with "too quick"; a bot that forges the time has no key. The key is
// derived from the Supabase secret key with its own label, so no new secret is needed and the
// derived key is useless for anything else.

/** A person needs at least this long to fill in name, email and company. */
export const MIN_FILL_MS = 3_000;
/** An open tab older than this gets a fresh token on the next try. */
export const MAX_AGE_MS = 24 * 60 * 60 * 1000;

function key(): string {
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!secret) throw new Error('SUPABASE_SECRET_KEY is not set');
  return createHmac('sha256', secret).update('sjekkpunkt:lead-form:v1').digest('hex');
}

const sign = (ms: number) => createHmac('sha256', key()).update(String(ms)).digest('base64url');

export function issueFormToken(now = Date.now()): string {
  return `${now}.${sign(now)}`;
}

export type TokenCheck = 'ok' | 'too_fast' | 'invalid';

export function checkFormToken(token: unknown, now = Date.now()): TokenCheck {
  if (typeof token !== 'string') return 'invalid';
  const [ms, mac] = token.split('.');
  const issued = Number(ms);
  if (!Number.isSafeInteger(issued) || !mac) return 'invalid';
  const want = Buffer.from(sign(issued));
  const got = Buffer.from(mac);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return 'invalid';
  const age = now - issued;
  if (age < MIN_FILL_MS) return 'too_fast';
  if (age > MAX_AGE_MS) return 'invalid';
  return 'ok';
}
