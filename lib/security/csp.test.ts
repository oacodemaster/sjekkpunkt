import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildCsp, makeNonce, SECURITY_HEADERS } from './csp';
import { COST_ORE, overCap, RATE_LIMITS, ROUTE_PROVIDER, visionCostOre } from '@/lib/limits/policy';

const SUPABASE = 'https://grhbliltfyopdovpsfqj.supabase.co';
const directive = (csp: string, name: string) =>
  csp
    .split(';')
    .map((d) => d.trim())
    .find((d) => d.startsWith(`${name} `))
    ?.split(' ')
    .slice(1) ?? [];

describe('content security policy (M8)', () => {
  const nonce = makeNonce();
  const prod = buildCsp({ nonce, dev: false, supabaseUrl: SUPABASE });

  it('runs only our own scripts and the nonced inline ones', () => {
    expect(directive(prod, 'script-src')).toEqual(["'self'", `'nonce-${nonce}'`]);
    expect(prod).not.toContain('unsafe-eval');
    expect(directive(prod, 'script-src')).not.toContain("'unsafe-inline'");
    expect(directive(prod, 'script-src').some((s) => s === 'blob:' || s === 'data:' || s.includes('*'))).toBe(false);
  });

  it('allows eval in development only', () => {
    expect(directive(buildCsp({ nonce, dev: true, supabaseUrl: SUPABASE }), 'script-src')).toContain("'unsafe-eval'");
  });

  it('cannot be framed, posts forms only to itself, loads no plugins', () => {
    expect(directive(prod, 'frame-ancestors')).toEqual(["'none'"]);
    expect(directive(prod, 'object-src')).toEqual(["'none'"]);
    expect(directive(prod, 'form-action')).toEqual(["'self'"]);
    expect(directive(prod, 'base-uri')).toEqual(["'self'"]);
    expect(prod).toContain('upgrade-insecure-requests');
  });

  it('connects only to this project, Supabase and ElevenLabs', () => {
    const connect = directive(prod, 'connect-src');
    expect(connect).toContain(SUPABASE);
    expect(connect).toContain('wss://grhbliltfyopdovpsfqj.supabase.co');
    expect(connect).toContain('wss://livekit.rtc.elevenlabs.io');
    for (const src of connect) expect(src === "'self'" || /^(https|wss):\/\/[a-z0-9.-]+$/.test(src), src).toBe(true);
    expect(connect.some((s) => s.includes('generativelanguage') || s.includes('googleapis'))).toBe(false); // vision is server-side only
  });

  it('nonces are fresh and long enough', () => {
    const a = makeNonce();
    expect(a).not.toBe(makeNonce());
    expect(atob(a)).toHaveLength(16);
  });

  it('sets the other security headers', () => {
    const h = Object.fromEntries(SECURITY_HEADERS.map((x) => [x.key, x.value]));
    expect(h['X-Content-Type-Options']).toBe('nosniff');
    expect(h['X-Frame-Options']).toBe('DENY');
    expect(h['Permissions-Policy']).toContain('camera=(self)');
    expect(h['Permissions-Policy']).toContain('microphone=(self)');
    expect(h['Permissions-Policy']).toContain('geolocation=()');
  });

  it('the self-hosted voice worklets match the installed @elevenlabs/client', () => {
    const require = createRequire(import.meta.url);
    // @elevenlabs/client is a dependency of @elevenlabs/react, so resolve it from there.
    const fromReact = createRequire(require.resolve('@elevenlabs/react'));
    for (const name of ['rawAudioProcessor', 'audioConcatProcessor']) {
      const ours = readFileSync(join(process.cwd(), 'public/elevenlabs', `${name}.js`), 'utf8');
      const theirs = readFileSync(fromReact.resolve(`@elevenlabs/client/worklets/${name}.js`), 'utf8');
      expect(ours, `${name}.js: copy it again from @elevenlabs/client/worklets`).toBe(theirs);
    }
  });
});

describe('rate limits and spend (M8)', () => {
  it('limits every paid route, per minute and per hour', () => {
    for (const route of ['vision', 'voice_token', 'translate', 'tts'] as const) {
      expect(RATE_LIMITS[route].map((w) => w.window)).toEqual([60, 3600]);
      expect(ROUTE_PROVIDER[route]).toMatch(/^(vision|elevenlabs)$/);
    }
  });

  it('prices a vision run by its attempts; fixtures are free', () => {
    const models = { fast: 'fast-m', strong: 'strong-m' };
    expect(visionCostOre([{ model: 'fast-m' }, { model: 'fast-m' }, { model: 'strong-m' }], models)).toBe(2 * COST_ORE.visionFast + COST_ORE.visionStrong);
    expect(visionCostOre([{ model: 'fixture' }], models)).toBe(0);
  });

  it('caps at the limit, and a cap of 0 turns the provider off', () => {
    expect(overCap(19_999, 200)).toBe(false);
    expect(overCap(20_000, 200)).toBe(true);
    expect(overCap(0, 0)).toBe(true);
  });
});
