import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { fail, guard, LEAD_ROLES } from '@/lib/api/http';
import { limitCall, limitResponse } from '@/lib/limits/server';
import { summaryAudioUrl } from '@/lib/voice/tts';

const Body = z.object({ escalationId: z.uuid() });

/** The Norwegian spoken summary of an escalation: generated once, cached, signed URL. */
export async function POST(req: NextRequest) {
  const g = await guard(req, LEAD_ROLES, Body);
  if (!g.ok) return g.res;
  const limit = await limitCall(g.user, 'tts');
  if (!limit.ok && limit.reason === 'rate_limited') return limitResponse(limit);
  // Over today's ElevenLabs budget, audio already made still plays; nothing new is generated.
  const audio = await summaryAudioUrl(g.body.escalationId, g.user.warehouseId, limit.ok ? limit.record : null);
  if (!audio) return fail(limit.ok ? 'tts_unavailable' : 'spend_cap', 503);
  return NextResponse.json(audio, { headers: { 'cache-control': 'no-store' } });
}
