import 'server-only';
import type { AppRole } from '@/lib/auth/dal';
import { createAdminClient } from '@/lib/supabase/admin';

// Server side of voice: which agent serves which station, minting conversation tokens, and the
// speech-to-text keyterms. The ElevenLabs key never leaves the server.

export type VoiceStation = 'return' | 'pack' | 'lead';

export const STATION_ROLES: Record<VoiceStation, AppRole[]> = {
  return: ['returns', 'lead', 'admin'],
  pack: ['packer', 'lead', 'admin'],
  lead: ['lead', 'admin'],
};

const AGENT_ENV: Record<VoiceStation, string> = {
  return: 'ELEVENLABS_AGENT_ID_RETURNS',
  pack: 'ELEVENLABS_AGENT_ID_PACK',
  lead: 'ELEVENLABS_AGENT_ID_LEAD',
};

export function agentIdFor(station: VoiceStation): string | null {
  return process.env[AGENT_ENV[station]] || null;
}

/** GET /v1/convai/conversation/token (WebRTC). Checked against the docs on 2026-11-07. */
export async function mintConversationToken(agentId: string): Promise<string | null> {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch(`https://api.elevenlabs.io/v1/convai/conversation/token?agent_id=${encodeURIComponent(agentId)}`, {
      headers: { 'xi-api-key': key },
      signal: AbortSignal.timeout(5000),
      cache: 'no-store',
    });
    if (!res.ok) {
      console.error('[voice] token mint failed:', res.status, (await res.text()).slice(0, 300));
      return null;
    }
    const body = (await res.json()) as { token?: string };
    return body.token ?? null;
  } catch (err) {
    console.error('[voice] token mint failed:', (err as Error)?.message);
    return null;
  }
}

/** The ASR keyword override takes at most 50 entries. */
export const MAX_KEYTERMS = 50;
const FIXED = ['Sjekk', 'Bekreft', 'Sjekkpunkt'];

/**
 * Keyterms for speech to text (addendum section 8): location codes and product names from the
 * database. Location codes first (short and the hardest to hear right), then names.
 */
export async function keytermsFor(warehouseId: string): Promise<string[]> {
  const db = createAdminClient();
  const [{ data: locs }, { data: products }] = await Promise.all([
    db.from('locations').select('code').eq('warehouse_id', warehouseId).order('code'),
    db.from('products').select('name_nb').eq('warehouse_id', warehouseId).order('sku'),
  ]);
  const terms = [...FIXED, ...(locs ?? []).map((l) => l.code), ...(products ?? []).map((p) => p.name_nb)];
  const seen = new Set<string>();
  return terms
    .map((s) => (s ?? '').trim())
    .filter((s) => s && s.length <= 50 && !seen.has(s.toLowerCase()) && seen.add(s.toLowerCase()))
    .slice(0, MAX_KEYTERMS);
}
