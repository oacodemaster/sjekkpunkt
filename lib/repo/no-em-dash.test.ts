import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// The project never contains an em dash (U+2014): not in copy, code, comments, SQL, config or
// docs (docs/landing-page-brief.md, section 3). Written as a code point so this file passes too.
const EM_DASH = String.fromCodePoint(0x2014);

// `next dev` owns the block between these markers in AGENTS.md and rewrites it whenever the text
// differs from its own (node_modules/next/dist/server/lib/generate-agent-files.js), em dashes
// included. Only that block is skipped; the rest of AGENTS.md is checked (docs/decisions.md).
const MANAGED_BLOCKS: Record<string, [start: string, end: string]> = {
  'AGENTS.md': ['<!-- BEGIN:nextjs-agent-rules -->', '<!-- END:nextjs-agent-rules -->'],
};

function withoutManagedBlock(file: string, text: string): string {
  const markers = MANAGED_BLOCKS[file];
  if (!markers) return text;
  const start = text.indexOf(markers[0]);
  const end = text.indexOf(markers[1], start);
  if (start === -1 || end === -1) return text;
  // Keep the newlines so line numbers after the block stay right.
  return text.slice(0, start) + text.slice(start, end).replace(/[^\n]/g, '') + text.slice(end);
}

describe('no em dashes', () => {
  it('no tracked text file contains U+2014 (rewrite the sentence with a comma, colon, full stop or parentheses)', () => {
    const files = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
      .split('\0')
      .filter(Boolean);
    expect(files.length).toBeGreaterThan(100);

    const hits: string[] = [];
    for (const file of files) {
      let buf: Buffer;
      try {
        buf = readFileSync(file);
      } catch {
        continue; // deleted in the working tree but still in the index
      }
      if (buf.includes(0)) continue; // binary
      const text = withoutManagedBlock(file, buf.toString('utf8'));
      if (!text.includes(EM_DASH)) continue;
      text.split('\n').forEach((line, i) => {
        if (line.includes(EM_DASH)) hits.push(`${file}:${i + 1}: ${line.trim().slice(0, 120)}`);
      });
    }
    expect(hits, `Em dash (U+2014) found:\n${hits.join('\n')}`).toEqual([]);
  });
});
