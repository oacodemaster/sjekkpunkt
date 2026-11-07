// pnpm design:tokens: writes app/tokens.css from design/tokens.json (the Sjekkpunkt design system).
// Copy a new tokens.json from the design system into design/, then run this. `--check` only
// reports whether app/tokens.css is current (the unit test does the same).

import { readFileSync, writeFileSync } from 'node:fs';
import { buildTokensCss, type DesignTokens } from '../lib/design/tokens';

const SOURCE = 'design/tokens.json';
const TARGET = 'app/tokens.css';

const css = buildTokensCss(JSON.parse(readFileSync(SOURCE, 'utf8')) as DesignTokens);
let current = '';
try {
  current = readFileSync(TARGET, 'utf8');
} catch {
  /* first run */
}

if (process.argv.includes('--check')) {
  if (current !== css) {
    console.error(`${TARGET} is out of date. Run pnpm design:tokens.`);
    process.exit(1);
  }
  console.log(`${TARGET} is current.`);
} else if (current === css) {
  console.log(`${TARGET} is current.`);
} else {
  writeFileSync(TARGET, css);
  console.log(`Wrote ${TARGET} from ${SOURCE}.`);
}
