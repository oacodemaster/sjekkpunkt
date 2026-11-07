import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { COACH_VOICE_ID } from '@/lib/voice/agent-config';
import { LEAD_VOICE_ID, SUMMARY_TTS_MODEL } from '@/lib/voice/voices';
import { EARCONS, SFX_MODEL, earconFile, earconKey, lineKey, voiceLines, type EarconName } from './audio';
import { DEMO_SCRIPT } from './script';

// The demo plays files from public/audio (made once by scripts/generate-audio.mjs). A changed
// line, prompt, voice or model must be regenerated, or the stage would say something else.
const dir = new URL('../../public/audio/', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('manifest.json', dir), 'utf8')) as Record<string, string>;

describe('demo audio', () => {
  it('has every earcon, made from the current prompt', () => {
    for (const name of Object.keys(EARCONS) as EarconName[]) {
      expect(existsSync(new URL(earconFile(name), dir)), earconFile(name)).toBe(true);
      expect(manifest[earconFile(name)], `${earconFile(name)} is stale: delete it and run pnpm audio:generate`).toBe(earconKey(name, SFX_MODEL));
      expect(EARCONS[name].seconds).toBeGreaterThanOrEqual(0.5);
    }
  });

  it('has a voice file for every agent and lead line, made from the current text and voice', () => {
    const lines = voiceLines(DEMO_SCRIPT);
    expect(lines.map((l) => l.id)).toEqual(DEMO_SCRIPT.filter((s) => s.line && s.speaker !== 'worker').map((s) => s.id));
    for (const l of lines) {
      const voice = l.voice === 'lead' ? LEAD_VOICE_ID : COACH_VOICE_ID;
      expect(existsSync(new URL(l.file, dir)), l.file).toBe(true);
      expect(manifest[l.file], `${l.file} is stale: delete it and run pnpm audio:generate`).toBe(lineKey(l, voice, SUMMARY_TTS_MODEL));
    }
  });

  it('never makes worker lines (the team speaks them on stage) and uses the lead voice only for RET-11', () => {
    const lines = voiceLines(DEMO_SCRIPT);
    expect(lines.some((l) => DEMO_SCRIPT.find((s) => s.id === l.id)?.speaker === 'worker')).toBe(false);
    expect(lines.filter((l) => l.voice === 'lead').map((l) => l.id)).toEqual(['RET-11']);
  });

  it('reads shelf codes as words, never "C dash 14 dash 2"', () => {
    for (const l of voiceLines(DEMO_SCRIPT)) expect(l.text, l.id).not.toMatch(/[A-Z]-\d+-\d+/);
  });
});
