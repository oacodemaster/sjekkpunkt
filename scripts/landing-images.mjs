// Crops the landing page screenshots and writes them as WebP in public/landing/<lang>/.
// Input: the PNGs from tests/e2e/landing-shots.spec.ts (LANDING_SHOTS=<dir>).
// Needs ffmpeg and cwebp (Homebrew). Usage: node scripts/landing-images.mjs <dir>
//
// Sizes match SIZE in components/landing/landing-page.tsx. A screen that is a composite (the hero)
// stacks the top of the station with its pinned bottom button, which is what a phone shows.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const src = process.argv[2];
if (!src || !existsSync(src)) throw new Error('usage: node scripts/landing-images.mjs <LANDING_SHOTS dir>');
const W = 824;
const STEP_H = 880;
const tmp = join(src, '_tmp');
mkdirSync(tmp, { recursive: true });

const height = (f) => Number(execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=height', '-of', 'csv=p=0', f]).toString().trim());
const ff = (args) => execFileSync('ffmpeg', ['-v', 'error', '-y', ...args]);
const webp = (png, out, q = 82) => execFileSync('cwebp', ['-quiet', '-q', String(q), '-m', '6', png, '-o', out]);

/** Rows y..y+h; pads with white below when the screen is shorter. */
function crop(inp, out, y, h) {
  const avail = height(inp) - y;
  const take = Math.min(h, avail);
  ff(['-i', inp, '-vf', `crop=${W}:${take}:0:${y},pad=${W}:${h}:0:0:white`, '-frames:v', '1', out]);
}

/** The top `top` rows plus the bottom `bottom` rows (the pinned thumb-zone button). */
function topAndBottom(inp, out, top, bottom) {
  const H = height(inp);
  ff(['-i', inp, '-filter_complex', `[0]split[a][b];[a]crop=${W}:${top}:0:0[t];[b]crop=${W}:${bottom}:0:${H - bottom}[u];[t][u]vstack`, '-frames:v', '1', out]);
}

const plan = {
  hero: (i, o) => topAndBottom(i, o, 1176, 160),
  'pack-order': (i, o) => crop(i, o, 0, STEP_H),
  'pack-box': (i, o) => crop(i, o, 236, STEP_H),
  'pack-ok': (i, o) => crop(i, o, 0, STEP_H),
  'ret-load': (i, o) => crop(i, o, 0, STEP_H),
  'ret-photos': (i, o) => crop(i, o, 760, STEP_H),
  'ret-decision': (i, o) => crop(i, o, 0, STEP_H),
  'loop-alert': (i, o) => crop(i, o, 0, STEP_H),
};

for (const lang of ['nb', 'en']) {
  const outDir = join('public', 'landing', lang);
  mkdirSync(outDir, { recursive: true });
  for (const [name, fn] of Object.entries(plan)) {
    const png = join(tmp, `${lang}-${name}.png`);
    fn(join(src, lang, `${name}.png`), png);
    webp(png, join(outDir, `${name}.webp`));
  }
  // The packing check starts in Norwegian on both pages (the packer switches to Polish), so its
  // placeholder is the Norwegian order screen.
  const poster = join(tmp, 'poster.png');
  crop(join(src, 'nb', 'pack-order.png'), poster, 0, 1100);
  webp(poster, join(outDir, 'demo-poster.webp'));
  // The team lead's screens are Norwegian only. Only the mix-up table, and for phones its left part (pair, 7 and 30 days), which stays legible.
  const lead = join(src, 'lead-insights.png');
  if (existsSync(lead)) {
    webp(lead, join(outDir, 'lead-insights.webp'), 80);
    const narrow = join(tmp, 'lead-narrow.png');
    ff(['-i', lead, '-vf', 'crop=760:ih:0:0', '-frames:v', '1', narrow]);
    webp(narrow, join(outDir, 'lead-insights-narrow.webp'), 80);
  }
}
rmSync(tmp, { recursive: true });
console.log('public/landing written');
