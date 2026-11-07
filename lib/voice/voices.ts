// Voices and models for speech the app or its scripts generate outside a conversation: the lead's
// spoken summaries (lib/voice/tts.ts) and the pre-generated demo lines (scripts/generate-audio.mjs).
// No imports, so a plain Node script can read it. The coach voice lives in agent-config.ts.

/** Daniel, "Steady Broadcaster" (premade): a different voice from the coaches, as the brief asks. Premade voices retire 2026-12-31: swap with the coach voice. */
export const LEAD_VOICE_ID = 'onwK4e9ZLuTAKqWW03F9';
/** Checked against GET /v1/models on 2026-11-07: covers Norwegian ("no"), Polish and Ukrainian. */
export const SUMMARY_TTS_MODEL = 'eleven_v4';
