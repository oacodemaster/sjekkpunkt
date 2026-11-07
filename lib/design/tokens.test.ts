import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildTokensCss, contrast, resolveColor, type DesignTokens } from './tokens';

const tokens = JSON.parse(readFileSync('design/tokens.json', 'utf8')) as DesignTokens;

describe('design tokens', () => {
  it('app/tokens.css is generated from design/tokens.json (run pnpm design:tokens)', () => {
    expect(readFileSync('app/tokens.css', 'utf8')).toBe(buildTokensCss(tokens));
  });

  it('the spacing scale is Tailwind’s numeric scale (space-N = N × 4px)', () => {
    for (const s of tokens.spacing.tokens) {
      const n = Number(s.name.replace('space-', ''));
      expect(s.value, s.name).toBe(`${n * 4}px`);
    }
  });

  it('the status colours replace the brief’s (#16a34a, #d97706, #dc2626 are gone)', () => {
    expect([resolveColor(tokens, 'ok'), resolveColor(tokens, 'warn'), resolveColor(tokens, 'stop')]).toEqual(['#15803d', '#b45309', '#b91c1c']);
    const css = readFileSync('app/globals.css', 'utf8') + readFileSync('app/ui.css', 'utf8');
    for (const old of ['#16a34a', '#d97706', '#dc2626', '#1d4ed8', '#0f172a']) expect(css).not.toContain(old);
  });

  // Pairs the app uses, with the WCAG minimum each needs: 4.5 for text, 3 for large text
  // (24px, or 18.7px bold), controls, focus rings and bounding boxes.
  const PAIRS: [fg: string, bg: string, min: number][] = [
    ['ink', 'surface', 4.5],
    ['ink', 'surface-2', 4.5],
    ['ink-2', 'surface', 4.5],
    ['ink-2', 'surface-2', 4.5],
    ['surface', 'ink', 4.5], // primary button, grade badge, push-to-talk
    ['surface', 'ok', 4.5], // verdict banners: 18px instruction text on the fill
    ['surface', 'warn', 4.5],
    ['surface', 'stop', 4.5],
    ['ok', 'ok-soft', 4.5], // chips
    ['warn', 'warn-soft', 4.5],
    ['stop', 'stop-soft', 4.5],
    ['ok', 'surface', 4.5], // chip text on white, line borders
    ['stop', 'surface', 4.5],
    ['ink-on-dark', 'frame', 4.5],
    ['ink-on-dark', 'frame-2', 4.5],
    ['ink-on-dark', 'stage', 4.5],
    ['ink-2-on-dark', 'frame', 4.5],
    ['ink-2-on-dark', 'frame-2', 4.5],
    ['ink-2-on-dark', 'stage', 4.5], // photo meta row
    ['brand', 'frame', 3], // focus ring and highlight on dark
    ['brand-ink', 'brand', 4.5], // lime button
    ['brand-ink', 'brand-hover', 4.5],
    ['ink-on-dark', 'brand-wash', 4.5],
    ['brand', 'brand-wash', 3],
    ['ok-on-dark', 'frame', 4.5],
    ['warn-on-dark', 'frame', 4.5],
    ['stop-on-dark', 'frame', 4.5],
    ['box-present', 'stage', 3], // bounding boxes on the photo stage
    ['box-unexpected', 'stage', 3],
    ['warn-on-dark', 'stage', 3], // the uncertain box
    ['ink', 'box-present', 4.5], // tag text on a box
    ['ink', 'box-unexpected', 4.5],
    ['ink', 'warn-on-dark', 4.5],
    ['focus', 'surface', 3],
    ['focus-on-dark', 'frame', 3],
    ['ink-2', 'surface', 3], // input borders
  ];
  it.each(PAIRS)('%s on %s reaches %d:1', (fg, bg, min) => {
    expect(contrast(resolveColor(tokens, fg), resolveColor(tokens, bg))).toBeGreaterThanOrEqual(min);
  });

  it('the lime is never readable on white (why it stays off the stations)', () => {
    expect(contrast(resolveColor(tokens, 'brand'), resolveColor(tokens, 'surface'))).toBeLessThan(1.5);
  });
});
