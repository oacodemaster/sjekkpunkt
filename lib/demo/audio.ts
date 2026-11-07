// The demo's audio files (brief appendix C), as data. scripts/generate-audio.mjs makes them once
// with ElevenLabs and stores them in public/audio; demo mode only plays them. No runtime imports,
// so the Node script can read this file.

import type { Earcon, DemoStep } from './script';

export type EarconName = Earcon | 'tool';

/** SFX v3: v2 is the API default but deprecated (removed 2027-03-01). */
export const SFX_MODEL = 'eleven_text_to_sound_v3';

/** Sound effect prompts. `seconds` must stay within the API's 0.5–30 s. */
export const EARCONS: Record<EarconName, { prompt: string; seconds: number; use: string }> = {
  chime: { prompt: 'Short soft two-note chime, positive confirmation, clean, 0.6 seconds', seconds: 0.6, use: 'check passed' },
  alert: { prompt: 'Short low double buzz, attention warning, not harsh, 0.8 seconds', seconds: 0.8, use: 'check failed' },
  shutter: { prompt: 'Soft camera shutter click with a subtle whoosh, 0.5 seconds', seconds: 0.5, use: 'photo taken' },
  done: { prompt: 'Gentle rising three-note completion jingle, 1 second', seconds: 1, use: 'return confirmed' },
  tool: { prompt: 'Very short, quiet, soft digital tick, a subtle interface blip, 0.5 seconds', seconds: 0.5, use: 'voice coach uses a tool' },
};

export const earconFile = (name: EarconName) => `${name}.mp3`;

export interface VoiceLine {
  id: string;
  file: string;
  text: string;
  lang: string;
  /** coach: the station coaches' voice; lead: the team lead summary voice */
  voice: 'coach' | 'lead';
}

/** Every scripted agent and team-lead line. Worker lines are spoken live by the team on stage. */
export function voiceLines(script: DemoStep[]): VoiceLine[] {
  return script
    .filter((s) => s.line && s.lang && (s.speaker === 'agent' || s.speaker === 'lead'))
    .map((s) => ({ id: s.id, file: `${s.id}.mp3`, text: s.spoken ?? s.line!, lang: s.lang!, voice: s.speaker === 'lead' ? 'lead' : 'coach' }));
}

/** What a voice file was made from. A changed line, voice or model means the file is stale. */
export const lineKey = (l: VoiceLine, voiceId: string, model: string) => JSON.stringify([l.text, l.lang, voiceId, model]);
export const earconKey = (name: EarconName, model: string) => JSON.stringify([EARCONS[name].prompt, EARCONS[name].seconds, model]);
