import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { fail, guard, LEAD_ROLES } from '@/lib/api/http';
import { summaryAudioUrl } from '@/lib/voice/tts';

const Body = z.object({ escalationId: z.uuid() });

/** The Norwegian spoken summary of an escalation: generated once, cached, signed URL. */
export async function POST(req: NextRequest) {
  const g = await guard(req, LEAD_ROLES, Body);
  if (!g.ok) return g.res;
  const audio = await summaryAudioUrl(g.body.escalationId, g.user.warehouseId);
  if (!audio) return fail('tts_unavailable', 503);
  return NextResponse.json(audio, { headers: { 'cache-control': 'no-store' } });
}
