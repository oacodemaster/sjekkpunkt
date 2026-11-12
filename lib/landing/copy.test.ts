import { describe, expect, it } from 'vitest';
import { LANDING, type LandingCopy } from './copy';
import { LEAD_PRIVACY } from './privacy';

// The landing copy (docs/landing-page-brief.md, section 5): no banned words, no stand-in dashes,
// the same shape in both languages, and every image a real screen under public/landing.

const strings = (v: unknown): string[] => (typeof v === 'string' ? [v] : Array.isArray(v) ? v.flatMap(strings) : v && typeof v === 'object' ? Object.values(v).flatMap(strings) : []);
const shape = (v: unknown): unknown => (Array.isArray(v) ? v.map(shape) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, shape(x)])) : typeof v);

const BANNED = [
  /revolusjonerende/i,
  /banebrytende/i,
  /sømløs/i,
  /innovativ/i,
  /neste generasjon/i,
  /\bløsning(en|er)?\b/i,
  /AI-drevet/i,
  /game-?changer/i,
  /seamless/i,
  /cutting-edge/i,
  /\bleverage\b/i,
  /\bunlock\b/i,
  /\bempower/i,
  /fast-paced/i,
];

describe('landing page copy', () => {
  const all = [...strings(LANDING), ...strings(LEAD_PRIVACY)];

  it('uses none of the banned words', () => {
    for (const s of all) for (const re of BANNED) expect(s, `${re} in «${s}»`).not.toMatch(re);
  });

  it('has no em dash and no stand-in dash', () => {
    for (const s of all) {
      expect(s).not.toContain('—');
      expect(s, s).not.toMatch(/ - | -- /);
    }
  });

  it('has the same shape in Norwegian and English', () => {
    expect(shape(LANDING.en)).toEqual(shape(LANDING.nb));
    expect(shape(LEAD_PRIVACY.en)).toEqual(shape(LEAD_PRIVACY.nb));
  });

  it('points every screenshot at its own language folder, and anchors are plain ids', () => {
    for (const lang of ['nb', 'en'] as const) {
      const c: LandingCopy = LANDING[lang];
      const shots = [...c.how.packing.steps, ...c.how.returns.steps, c.how.loop, c.how.teamLead].map((s) => s.shot);
      for (const s of shots) {
        expect(s.src).toMatch(new RegExp(`^/landing/${lang}/[a-z-]+\\.webp$`));
        expect(s.alt.length).toBeGreaterThan(20);
      }
      for (const a of Object.values(c.anchors)) expect(a).toMatch(/^[a-z-]+$/);
      expect(c.try.stepTitles).toHaveLength(6);
    }
  });

  it('makes no claim the copy doc rules out', () => {
    for (const s of all) {
      expect(s).not.toMatch(/iPhone|iOS/);
      expect(s).not.toMatch(/all data (stays|is) in the EU|alle data (blir|ligger) i EU/i);
      expect(s).not.toMatch(/\d+\s?%/);
    }
  });
});
