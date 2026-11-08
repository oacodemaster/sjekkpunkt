import { describe, expect, it } from 'vitest';
import { fromAcceptLanguage, pickLang } from './lang';
import { LANGS } from './strings';

describe('language choice', () => {
  it('reads Accept-Language by q-value and maps no/nn to Bokmål', () => {
    expect(fromAcceptLanguage('de-DE,de;q=0.9,pl;q=0.8,en;q=0.7', LANGS)).toBe('pl');
    expect(fromAcceptLanguage('nn-NO,nn;q=0.9', LANGS)).toBe('nb');
    expect(fromAcceptLanguage('en;q=0.2,uk;q=0.9', LANGS)).toBe('uk');
    expect(fromAcceptLanguage('fr,de', LANGS)).toBeNull();
    expect(fromAcceptLanguage('pl;q=0', LANGS)).toBeNull();
  });

  it('prefers ?lang=, then the worker profile, then the cookie, then the browser', () => {
    const base = { acceptLanguage: 'ro' };
    expect(pickLang(LANGS, { ...base, asked: 'lt', profile: 'uk', cookie: 'pl' })).toBe('lt');
    // a cookie left on a shared handheld must not beat the signed-in worker's own language
    expect(pickLang(LANGS, { ...base, profile: 'uk', cookie: 'pl' })).toBe('uk');
    expect(pickLang(LANGS, { ...base, cookie: 'pl' })).toBe('pl');
    expect(pickLang(LANGS, base)).toBe('ro');
    expect(pickLang(LANGS, {})).toBe('nb');
  });

  it('only returns an allowed language', () => {
    expect(pickLang(['nb', 'en'], { asked: 'pl', cookie: 'xx', acceptLanguage: 'uk' })).toBe('nb');
    expect(pickLang(['en', 'pl'], { asked: 'nb' })).toBe('en');
  });
});
