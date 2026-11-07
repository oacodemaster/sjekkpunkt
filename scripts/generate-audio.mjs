// Generates the demo's audio once (brief appendix C): earcons with ElevenLabs Sound Effects and
// one voice line per scripted agent and team-lead step with Text to Speech. Files go to
// public/audio and are skipped if they exist; demo mode only plays them and never calls an API.
//
//   pnpm audio:generate            make what is missing
//   pnpm audio:generate --check    list missing and stale files, call nothing
//
// To remake a file (for example after a native speaker fixes a line), delete it and run again.
// The key (ELEVENLABS_API_KEY from .env.local) is used only here, never in the app.
// Endpoints, fields and model ids checked against the ElevenLabs docs on 2026-11-07:
//   POST /v1/sound-generation  { text, duration_seconds (0.5-30), prompt_influence, model_id }
//     eleven_text_to_sound_v3 (v2 is the default but deprecated, removed 2027-03-01)
//   POST /v1/text-to-speech/{voice_id}  { text, model_id, language_code }
//     eleven_v4: covers Norwegian ("no"), Polish and Ukrainian (GET /v1/models)

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { config } from 'dotenv';
import { DEMO_SCRIPT } from '../lib/demo/script.ts';
import { EARCONS, SFX_MODEL, earconFile, earconKey, lineKey, voiceLines } from '../lib/demo/audio.ts';
import { COACH_VOICE_ID, EL_LANG } from '../lib/voice/agent-config.ts';
import { LEAD_VOICE_ID, SUMMARY_TTS_MODEL } from '../lib/voice/voices.ts';

config({ path: '.env.local', quiet: true });

const API = 'https://api.elevenlabs.io/v1';
const TTS_MODEL = SUMMARY_TTS_MODEL;
const OUT = new URL('../public/audio/', import.meta.url);
const MANIFEST = new URL('manifest.json', OUT);
const check = process.argv.includes('--check');

const manifest = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, 'utf8')) : {};

const jobs = [
  ...Object.keys(EARCONS).map((name) => ({
    file: earconFile(name),
    key: earconKey(name, SFX_MODEL),
    what: `earcon ${name} (${EARCONS[name].use})`,
    url: `${API}/sound-generation?output_format=mp3_44100_128`,
    body: { text: EARCONS[name].prompt, duration_seconds: EARCONS[name].seconds, prompt_influence: 0.5, model_id: SFX_MODEL },
  })),
  ...voiceLines(DEMO_SCRIPT).map((l) => {
    const voiceId = l.voice === 'lead' ? LEAD_VOICE_ID : COACH_VOICE_ID;
    return {
      file: l.file,
      key: lineKey(l, voiceId, TTS_MODEL),
      what: `${l.id} (${l.voice}, ${l.lang})`,
      url: `${API}/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
      body: { text: l.text, model_id: TTS_MODEL, language_code: EL_LANG[l.lang] },
    };
  }),
];

const missing = jobs.filter((j) => !existsSync(new URL(j.file, OUT)));
const stale = jobs.filter((j) => existsSync(new URL(j.file, OUT)) && manifest[j.file] !== j.key);
for (const j of stale) console.warn(`stale: ${j.file} was made from an older line or prompt; delete it to remake it`);

if (check) {
  for (const j of missing) console.log(`missing: ${j.file}`);
  console.log(`${jobs.length - missing.length}/${jobs.length} files present, ${stale.length} stale`);
  process.exit(missing.length || stale.length ? 1 : 0);
}

if (missing.length === 0) {
  console.log(`all ${jobs.length} files present; nothing to generate`);
  process.exit(0);
}

const key = process.env.ELEVENLABS_API_KEY;
if (!key) {
  console.error('ELEVENLABS_API_KEY is not set (.env.local)');
  process.exit(1);
}
mkdirSync(OUT, { recursive: true });

let failed = 0;
for (const j of missing) {
  const res = await fetch(j.url, {
    method: 'POST',
    headers: { 'xi-api-key': key, 'content-type': 'application/json', accept: 'audio/mpeg' },
    body: JSON.stringify(j.body),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) {
    failed++;
    console.error(`failed: ${j.what}: ${res.status} ${(await res.text()).slice(0, 300)}`);
    continue;
  }
  const bytes = Buffer.from(await res.arrayBuffer());
  writeFileSync(new URL(j.file, OUT), bytes);
  manifest[j.file] = j.key;
  console.log(`made ${j.file}: ${j.what}, ${Math.round(bytes.length / 1024)} KB`);
}

const sorted = Object.fromEntries(Object.entries(manifest).sort(([a], [b]) => a.localeCompare(b)));
writeFileSync(MANIFEST, `${JSON.stringify(sorted, null, 2)}\n`);
process.exit(failed ? 1 : 0);
