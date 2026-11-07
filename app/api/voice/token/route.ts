import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { fail, guard } from '@/lib/api/http';
import { agentIdFor, keytermsFor, mintConversationToken, STATION_ROLES } from '@/lib/voice/server';

const Body = z.object({ station: z.enum(['return', 'pack', 'lead']) });

/**
 * Mints a short-lived ElevenLabs conversation token (WebRTC) for the station's agent. The agent
 * requires a token (auth enabled), so the agent id alone cannot start a conversation.
 * Returns only the token and the speech-to-text keyterms. Rate limits and spend caps come in M8.
 */
export async function POST(req: NextRequest) {
  const g = await guard(req, ['packer', 'returns', 'lead', 'admin'], Body);
  if (!g.ok) return g.res;
  const { user, body } = g;
  if (!STATION_ROLES[body.station].includes(user.role)) return fail('forbidden', 403);

  const agentId = agentIdFor(body.station);
  if (!agentId) return fail('voice_not_configured', 503);

  const [token, keyterms] = await Promise.all([mintConversationToken(agentId), keytermsFor(user.warehouseId)]);
  if (!token) return fail('voice_unavailable', 502);
  return NextResponse.json({ token, keyterms }, { headers: { 'cache-control': 'no-store' } });
}
