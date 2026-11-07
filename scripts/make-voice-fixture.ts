// Builds the Norwegian "worker" tracks for Chrome's fake microphone in the opt-in live voice
// tests (E2E_VOICE=1). Speech from ElevenLabs Text to Speech in a voice that is not the coach's,
// laid on a timeline with silence while the coach talks.
//   pnpm tsx scripts/make-voice-fixture.ts          -> tests/e2e/fixtures/worker-nb.wav (returns)
//   pnpm tsx scripts/make-voice-fixture.ts pack     -> tests/e2e/fixtures/packer-nb.wav (packing)
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { config } from 'dotenv';

config({ path: '.env.local', quiet: true });
const KEY = process.env.ELEVENLABS_API_KEY!;
const WORKER_VOICE = 'JBFqnCBsd6RMkjVDRZzb'; // George (the coach is River)

// [seconds of silence before the line, line]
const TIMELINES: Record<string, { out: string; lines: [number, string][] }> = {
  return: {
    out: 'tests/e2e/fixtures/worker-nb.wav',
    lines: [
      [8, 'Hei. Kan du snakke norsk? Hva er denne returen, og hva skal jeg gjøre?'],
      [18, 'Ja, jeg er klar. Ta bildet nå.'],
      // Said again in case the first one landed while the coach was still talking.
      [14, 'Jeg er klar. Ta bildet av forsiden nå.'],
    ],
  },
  pack: {
    out: 'tests/e2e/fixtures/packer-nb.wav',
    lines: [
      [8, 'Hei. Kan du snakke norsk? Hva skal jeg pakke?'],
      [18, 'Alt ligger i esken nå. Sjekk esken.'],
      [14, 'Jeg er klar. Sjekk esken nå.'],
    ],
  },
};
const variant = TIMELINES[process.argv[2] ?? 'return'];
if (!variant) throw new Error(`unknown variant ${process.argv[2]}`);
const TIMELINE = variant.lines;
const TAIL_SILENCE = 20;

async function tts(text: string, out: string) {
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${WORKER_VOICE}?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: { 'xi-api-key': KEY, 'content-type': 'application/json' },
    body: JSON.stringify({ text, model_id: 'eleven_v4_turbo', language_code: 'no' }),
  });
  if (!res.ok) throw new Error(`TTS ${res.status}: ${await res.text()}`);
  writeFileSync(out, Buffer.from(await res.arrayBuffer()));
}

async function main() {
  const dir = mkdtempSync(join(tmpdir(), 'voice-fixture-'));
  const ff = (...args: string[]) => execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...args]);
  const silence = (s: number, name: string) => {
    const f = join(dir, `${name}.wav`);
    ff('-f', 'lavfi', '-i', 'anullsrc=r=16000:cl=mono', '-t', String(s), '-c:a', 'pcm_s16le', f);
    return f;
  };
  const parts: string[] = [];
  for (const [i, [pause, line]] of TIMELINE.entries()) {
    parts.push(silence(pause, `s${i}`));
    const mp3 = join(dir, `l${i}.mp3`);
    await tts(line, mp3);
    const wav = join(dir, `l${i}.wav`);
    ff('-i', mp3, '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', wav);
    parts.push(wav);
  }
  parts.push(silence(TAIL_SILENCE, 'tail'));
  const list = join(dir, 'list.txt');
  writeFileSync(list, parts.map((p) => `file '${p}'`).join('\n'));
  ff('-f', 'concat', '-safe', '0', '-i', list, '-c:a', 'pcm_s16le', variant.out);
  console.log(`wrote ${variant.out}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
