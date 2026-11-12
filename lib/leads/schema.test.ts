import { describe, expect, it, vi } from 'vitest';
import { checkLead, firstName, isTestAddress, leadInput } from './schema';

vi.mock('server-only', () => ({}));

const valid = { name: 'Kari Nordmann', email: 'kari@lager.no', company: 'Lager AS', role: '', volume: '', interest: '', message: '', lang: 'nb' };

describe('lead form validation (landing page brief, section 9)', () => {
  it('needs name, a real email and company; the rest is optional', () => {
    expect(checkLead(valid)).toMatchObject({ ok: true, lead: { name: 'Kari Nordmann', email: 'kari@lager.no', company: 'Lager AS', lang: 'nb' } });
    const r = checkLead({ ...valid, role: 'it', volume: '200_500', interest: 'both', message: ' Hettegensere i M og L. ' });
    expect(r).toMatchObject({ ok: true, lead: { role: 'it', volume: '200_500', interest: 'both', message: 'Hettegensere i M og L.' } });
  });

  it('names every bad field, in form order', () => {
    expect(checkLead({ ...valid, name: ' ', email: 'kari@', company: '' })).toEqual({ ok: false, fields: ['name', 'email', 'company'] });
    expect(checkLead({ ...valid, email: 'not an email' })).toEqual({ ok: false, fields: ['email'] });
  });

  it('refuses values outside the lists and overlong text', () => {
    expect(checkLead({ ...valid, role: 'ceo', volume: '1000', interest: 'everything' })).toEqual({ ok: false, fields: ['role', 'volume', 'interest'] });
    expect(checkLead({ ...valid, message: 'x'.repeat(2001) })).toEqual({ ok: false, fields: ['message'] });
    expect(checkLead({ ...valid, name: 'x'.repeat(121) })).toEqual({ ok: false, fields: ['name'] });
    expect(checkLead({ ...valid, lang: 'pl' })).toMatchObject({ ok: false });
  });

  it('reads FormData as strings and defaults the language to Norwegian', () => {
    const f = new FormData();
    f.set('name', 'Ola');
    f.set('email', 'ola@firma.no');
    f.set('lang', 'xx');
    f.set('company', new Blob(['x']));
    expect(leadInput(f)).toMatchObject({ name: 'Ola', email: 'ola@firma.no', company: '', lang: 'nb' });
  });

  it('greets by first name and never emails test addresses', () => {
    expect(firstName('  Kari  Nordmann ')).toBe('Kari');
    expect(isTestAddress('e2e@example.com')).toBe(true);
    expect(isTestAddress('a@sjekkpunkt.test')).toBe(true);
    expect(isTestAddress('kari@lager.no')).toBe(false);
    expect(isTestAddress('kari@example.no')).toBe(false);
  });
});

describe('the signed time to submit', () => {
  it('refuses a form sent under three seconds, a forged time and an old tab', async () => {
    process.env.SUPABASE_SECRET_KEY ||= 'test-secret';
    const { checkFormToken, issueFormToken, MIN_FILL_MS, MAX_AGE_MS } = await import('./token');
    const t0 = 1_800_000_000_000;
    const token = issueFormToken(t0);
    expect(checkFormToken(token, t0 + 500)).toBe('too_fast');
    expect(checkFormToken(token, t0 + MIN_FILL_MS)).toBe('ok');
    expect(checkFormToken(token, t0 + MAX_AGE_MS + 1)).toBe('invalid');
    // Moving the time back to look patient breaks the signature.
    const [, mac] = token.split('.');
    expect(checkFormToken(`${t0 - 60_000}.${mac}`, t0 + 500)).toBe('invalid');
    expect(checkFormToken(undefined)).toBe('invalid');
    expect(checkFormToken('garbage')).toBe('invalid');
  });
});
