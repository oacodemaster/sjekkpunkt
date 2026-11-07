import 'server-only';
import { createHash } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';

// Spoken Norwegian lead summaries (addendum sections 6 and 8). Generated on the server with
// ElevenLabs Text to Speech the first time a lead presses play, cached in the private "audio"
// bucket, and served by short-lived signed URL. The path carries a hash of the text, so the same
// summary is never generated twice and a changed summary gets new audio.
// Checked against GET /v1/models and a live call on 2026-11-07: eleven_v4 speaks Norwegian ("no").

/** Daniel, "Steady Broadcaster" (premade): a different voice from the coaches, as the brief asks. Premade voices retire 2026-12-31: swap with the coach voice. */
export const LEAD_VOICE_ID = 'onwK4e9ZLuTAKqWW03F9';
export const SUMMARY_TTS_MODEL = 'eleven_v4';
const SIGNED_SECONDS = 300;

/** 0.3 s of silence (MP3), for e2e runs with TTS_MOCK=silent. */
const SILENT_MP3 = 'SUQzBAAAAAAAIlRTU0UAAAAOAAADTGF2ZjYzLjEuMTAyAAAAAAAAAAAAAAD/83DAAAAAAAAAAAAASW5mbwAAAA8AAAAOAAAGbQAsLCwsLCwsPDw8PDw8PE1NTU1NTU1dXV1dXV1dbW1tbW1tbX19fX19fX2Ojo6Ojo6Onp6enp6enp6urq6urq6uvr6+vr6+vs/Pz8/Pz8/f39/f39/f7+/v7+/v7/////////8AAAAATGF2YzYzLjEuAAAAAAAAAAAAAAAAJANpAAAAAAAABm2qeuX/AAAAAAAAAAAAAAAAAP/zQMQAAAADSAAAAABMQU1FNC4wVVVVVVVVVVVVVVVVTEFNRTQuMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//NCxFsAAANIAAAAAFVVVVVVVVVVVVVVVVVVVVVVVVVVTEFNRTQuMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//NAxKQAAANIAAAAAFVVVVVVVVVVVVVVVVVVVVVVVVVMQU1FNC4wVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVX/80LEowAAA0gAAAAAVVVVVVVVVVVVVVVVVVVVVVVVVVVMQU1FNC4wVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVX/80DEpAAAA0gAAAAAVVVVVVVVVVVVVVVVVVVVVVVVVUxBTUU0LjBVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVf/zQsSjAAADSAAAAABVVVVVVVVVVVVVVVVVVVVVVVVVVUxBTUU0LjBVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVf/zQMSkAAADSAAAAABVVVVVVVVVVVVVVVVVVVVVVVVVTEFNRTQuMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//NCxKMAAANIAAAAAFVVVVVVVVVVVVVVVVVVVVVVVVVVTEFNRTQuMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//NAxKQAAANIAAAAAFVVVVVVVVVVVVVVVVVVVVVVVVVMQU1FNC4wVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVX/80LEowAAA0gAAAAAVVVVVVVVVVVVVVVVVVVVVVVVVVVMQU1FNC4wVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVX/80DEpAAAA0gAAAAAVVVVVVVVVVVVVVVVVVVVVVVVVUxBTUU0LjBVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVf/zQsSjAAADSAAAAABVVVVVVVVVVVVVVVVVVVVVVVVVVUxBTUU0LjBVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVf/zQMSkAAADSAAAAABVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//NCxKMAAANIAAAAAFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV';

function mocked(): boolean {
  if (process.env.TTS_MOCK !== 'silent') return false;
  if (process.env.VERCEL_ENV === 'production') throw new Error('TTS_MOCK must never be enabled in production');
  return true;
}

export function summaryAudioPath(warehouseId: string, escalationId: string, text: string): string {
  const hash = createHash('sha256').update(text).digest('hex').slice(0, 12);
  return `summaries/${warehouseId}/${escalationId}-${hash}.mp3`;
}

async function synthesize(text: string): Promise<Buffer | null> {
  if (mocked()) return Buffer.from(SILENT_MP3, 'base64');
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${LEAD_VOICE_ID}?output_format=mp3_44100_64`, {
      method: 'POST',
      headers: { 'xi-api-key': key, 'content-type': 'application/json' },
      body: JSON.stringify({ text, model_id: SUMMARY_TTS_MODEL, language_code: 'no' }),
      signal: AbortSignal.timeout(20_000),
      cache: 'no-store',
    });
    if (!res.ok) {
      console.error('[tts] failed:', res.status, (await res.text()).slice(0, 300));
      return null;
    }
    return Buffer.from(await res.arrayBuffer());
  } catch (err) {
    console.error('[tts] failed:', (err as Error)?.message);
    return null;
  }
}

/**
 * Signed URL for the spoken summary of one escalation, generating and caching it on first use.
 * Returns null when the escalation has no summary or speech is unavailable.
 */
export async function summaryAudioUrl(escalationId: string, warehouseId: string): Promise<{ url: string; cached: boolean } | null> {
  const db = createAdminClient();
  const { data: esc } = await db
    .from('escalations')
    .select('summary_nb, summary_audio_path')
    .eq('id', escalationId)
    .eq('warehouse_id', warehouseId)
    .maybeSingle();
  const text = esc?.summary_nb?.trim();
  if (!text) return null;
  const path = summaryAudioPath(warehouseId, escalationId, text);
  const bucket = db.storage.from('audio');

  let cached = esc!.summary_audio_path === path;
  if (cached) {
    const { data } = await bucket.createSignedUrl(path, SIGNED_SECONDS);
    if (data?.signedUrl) return { url: data.signedUrl, cached: true };
    cached = false; // the row points at a file that is gone: make it again
  }

  const audio = await synthesize(text);
  if (!audio) return null;
  const { error } = await bucket.upload(path, audio, { contentType: 'audio/mpeg', upsert: true });
  if (error) {
    console.error('[tts] upload failed:', error.message);
    return null;
  }
  await db.from('escalations').update({ summary_audio_path: path }).eq('id', escalationId);
  const { data } = await bucket.createSignedUrl(path, SIGNED_SECONDS);
  return data?.signedUrl ? { url: data.signedUrl, cached: false } : null;
}
