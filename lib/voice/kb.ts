import 'server-only';
import { KNOWLEDGE_BASE_NAME } from './agent-config';

const BASE = 'https://api.elevenlabs.io';

export type KbSyncResult = { ok: true; documentId: string } | { ok: false; error: 'not_configured' | 'not_found' | 'failed' };

/**
 * Pushes the grading guide from admin settings to the agents' knowledge base. The returns coach
 * and the lead assistant point at one text document (attached by `pnpm voice:setup`), so the
 * content is updated in place (PATCH /v1/convai/knowledge-base/{id} with `content`, checked
 * against the ElevenLabs API reference on 2026-11-07) and the agents need no change.
 */
export async function syncGradingGuide(text: string): Promise<KbSyncResult> {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) return { ok: false, error: 'not_configured' };
  const call = (method: string, path: string, body?: unknown) =>
    fetch(`${BASE}${path}`, {
      method,
      headers: { 'xi-api-key': key, ...(body ? { 'content-type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(10_000),
    });
  try {
    const list = await call('GET', `/v1/convai/knowledge-base?search=${encodeURIComponent(KNOWLEDGE_BASE_NAME)}`);
    if (!list.ok) throw new Error(`list ${list.status}`);
    const { documents } = (await list.json()) as { documents?: { id: string; name: string }[] };
    const doc = documents?.find((d) => d.name === KNOWLEDGE_BASE_NAME);
    // No document means the agents were never set up; creating one here would attach to nothing.
    if (!doc) return { ok: false, error: 'not_found' };
    const res = await call('PATCH', `/v1/convai/knowledge-base/${doc.id}`, { content: text });
    if (!res.ok) throw new Error(`patch ${res.status}: ${(await res.text()).slice(0, 300)}`);
    return { ok: true, documentId: doc.id };
  } catch (e) {
    console.error('[admin] grading guide sync failed:', e instanceof Error ? e.message : e);
    return { ok: false, error: 'failed' };
  }
}
