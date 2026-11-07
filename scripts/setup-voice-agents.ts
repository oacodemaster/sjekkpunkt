// Creates or updates the ElevenAgents returns coach from lib/voice/agent-config.ts.
//   pnpm voice:setup
// Idempotent: tools, the knowledge base text and the agent are found by name and updated.
// Prints ELEVENLABS_AGENT_ID_RETURNS for .env.local and Vercel. The key stays on this machine.

import { config } from 'dotenv';
import { AGENT_NAMES, GRADING_GUIDE, KNOWLEDGE_BASE_NAME, RETURNS_TOOLS, returnsAgentBody } from '../lib/voice/agent-config';

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

async function upsertTools(): Promise<string[]> {
  const { tools } = await api<{ tools: ToolRow[] }>('GET', '/v1/convai/tools');
  const ids: string[] = [];
  for (const t of RETURNS_TOOLS) {
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

async function upsertKnowledgeBase(): Promise<{ id: string; name: string }> {
  const list = await api<{ documents: { id: string; name: string }[] }>(
    'GET',
    `/v1/convai/knowledge-base?search=${encodeURIComponent(KNOWLEDGE_BASE_NAME)}`,
  );
  const hit = list.documents?.find((d) => d.name === KNOWLEDGE_BASE_NAME);
  if (hit) {
    console.log(`knowledge base: reusing ${hit.id}`);
    return { id: hit.id, name: hit.name };
  }
  const doc = await api<{ id: string }>('POST', '/v1/convai/knowledge-base/text', { text: GRADING_GUIDE, name: KNOWLEDGE_BASE_NAME });
  console.log(`knowledge base: created ${doc.id}`);
  return { id: doc.id, name: KNOWLEDGE_BASE_NAME };
}

async function main() {
  const toolIds = await upsertTools();
  const kb = await upsertKnowledgeBase();
  const body = returnsAgentBody(toolIds, kb);

  let agentId = process.env.ELEVENLABS_AGENT_ID_RETURNS;
  if (!agentId) {
    const list = await api<{ agents: { agent_id: string; name: string }[] }>('GET', `/v1/convai/agents?search=${encodeURIComponent(AGENT_NAMES.return)}`);
    agentId = list.agents?.find((a) => a.name === AGENT_NAMES.return)?.agent_id;
  }
  if (agentId) {
    await api('PATCH', `/v1/convai/agents/${agentId}`, body);
    console.log(`agent: updated ${agentId}`);
  } else {
    const created = await api<{ agent_id: string }>('POST', '/v1/convai/agents/create', body);
    agentId = created.agent_id;
    console.log(`agent: created ${agentId}`);
  }
  console.log(`\nELEVENLABS_AGENT_ID_RETURNS=${agentId}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
