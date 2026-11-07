// Creates or updates the ElevenAgents agents (returns coach, packing coach, lead assistant) from lib/voice/agent-config.ts.
//   pnpm voice:setup
// Idempotent: tools, the knowledge base text and the agents are found by name and updated.
// Prints ELEVENLABS_AGENT_ID_RETURNS, _PACK and _LEAD for .env.local and Vercel.
// The key stays on this machine.

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { AGENT_NAMES, AGENT_TOOLS, agentBody, GRADING_GUIDE, KNOWLEDGE_BASE_NAME, type AgentKind } from '../lib/voice/agent-config';

config({ path: '.env.local' });
const KEY = process.env.ELEVENLABS_API_KEY;
if (!KEY) throw new Error('ELEVENLABS_API_KEY missing in .env.local');
const BASE = 'https://api.elevenlabs.io';

async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'xi-api-key': KEY!, ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${text.slice(0, 1500)}`);
  return (text ? JSON.parse(text) : {}) as T;
}

type ToolRow = { id: string; tool_config: { name: string; type: string } };

async function upsertTools(defs: readonly { name: string }[]): Promise<string[]> {
  const { tools } = await api<{ tools: ToolRow[] }>('GET', '/v1/convai/tools');
  const ids: string[] = [];
  for (const t of defs) {
    const tool_config = { type: 'client', expects_response: true, ...t };
    const existing = tools.find((x) => x.tool_config?.type === 'client' && x.tool_config?.name === t.name);
    if (existing) {
      await api('PATCH', `/v1/convai/tools/${existing.id}`, { tool_config });
      ids.push(existing.id);
      console.log(`tool ${t.name}: updated ${existing.id}`);
    } else {
      const created = await api<{ id: string }>('POST', '/v1/convai/tools', { tool_config });
      ids.push(created.id);
      console.log(`tool ${t.name}: created ${created.id}`);
    }
  }
  return ids;
}

/** The guide an admin saved (settings.grading_guide), else the default from agent-config. */
async function currentGuide(): Promise<string> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secret) return GRADING_GUIDE;
  const db = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data } = await db.from('settings').select('value').eq('key', 'grading_guide').limit(1).maybeSingle();
  return typeof data?.value === 'string' && data.value.trim().length >= 50 ? data.value : GRADING_GUIDE;
}

async function upsertKnowledgeBase(): Promise<{ id: string; name: string }> {
  const text = await currentGuide();
  const list = await api<{ documents: { id: string; name: string }[] }>(
    'GET',
    `/v1/convai/knowledge-base?search=${encodeURIComponent(KNOWLEDGE_BASE_NAME)}`,
  );
  const hit = list.documents?.find((d) => d.name === KNOWLEDGE_BASE_NAME);
  if (hit) {
    // Content is updated in place, so the agents keep their link (same as the admin save).
    await api('PATCH', `/v1/convai/knowledge-base/${hit.id}`, { content: text });
    console.log(`knowledge base: updated ${hit.id}`);
    return { id: hit.id, name: hit.name };
  }
  const doc = await api<{ id: string }>('POST', '/v1/convai/knowledge-base/text', { text, name: KNOWLEDGE_BASE_NAME });
  console.log(`knowledge base: created ${doc.id}`);
  return { id: doc.id, name: KNOWLEDGE_BASE_NAME };
}

const ENV: Record<AgentKind, string> = { return: 'ELEVENLABS_AGENT_ID_RETURNS', pack: 'ELEVENLABS_AGENT_ID_PACK', lead: 'ELEVENLABS_AGENT_ID_LEAD' };

async function upsertAgent(kind: AgentKind, kb: { id: string; name: string } | null): Promise<string> {
  const toolIds = await upsertTools(AGENT_TOOLS[kind]);
  const body = agentBody(kind, toolIds, kb);
  let agentId = process.env[ENV[kind]];
  if (!agentId) {
    const list = await api<{ agents: { agent_id: string; name: string }[] }>('GET', `/v1/convai/agents?search=${encodeURIComponent(AGENT_NAMES[kind])}`);
    agentId = list.agents?.find((a) => a.name === AGENT_NAMES[kind])?.agent_id;
  }
  if (agentId) {
    await api('PATCH', `/v1/convai/agents/${agentId}`, body);
    console.log(`agent ${kind}: updated ${agentId}`);
  } else {
    const created = await api<{ agent_id: string }>('POST', '/v1/convai/agents/create', body);
    agentId = created.agent_id;
    console.log(`agent ${kind}: created ${agentId}`);
  }
  return agentId;
}

async function main() {
  // The grading guide is the knowledge base of the returns coach and the lead assistant.
  const kb = await upsertKnowledgeBase();
  const ids = { return: await upsertAgent('return', kb), pack: await upsertAgent('pack', null), lead: await upsertAgent('lead', kb) };
  console.log('');
  for (const k of ['return', 'pack', 'lead'] as const) console.log(`${ENV[k]}=${ids[k]}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
