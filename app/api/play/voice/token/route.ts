import { NextResponse, type NextRequest } from 'next/server';
import { fail } from '@/lib/api/http';
import { WAREHOUSE_ID } from '@/lib/demo/seed';
import { clientIp, limitPlayVoice, limitResponse } from '@/lib/limits/server';
import { COST_ORE } from '@/lib/limits/policy';
import { PLAY_KEYTERMS } from '@/lib/play/keyterms';
import { agentIdFor, mintConversationToken } from '@/lib/voice/server';
import { paidDemoOn } from '@/lib/demo/flags';

/**
 * Conversation token for the practice demo (/play), which has no login. It talks to the packing
 * coach, whose tools act only on the visitor's on-screen box (nothing in the database).
 * Guarded instead of authenticated:
 * - only when DEMO_ENABLED=true;
 * - only from a page on this site (Sec-Fetch-Site same-origin, or a matching Origin), so another
 *   site cannot spend the budget from its visitors' browsers;
 * - per visitor (hashed IP) and total rate limits, then the daily ElevenLabs cap (fails closed).
 */
export async function POST(req: NextRequest) {
  if (!paidDemoOn()) return fail('not_found', 404);
  if (!sameOrigin(req)) return fail('forbidden', 403);

  const agentId = agentIdFor('pack');
  if (!agentId) return fail('voice_not_configured', 503);
  const limit = await limitPlayVoice(WAREHOUSE_ID, clientIp(req.headers));
  if (!limit.ok) return limitResponse(limit);

  const token = await mintConversationToken(agentId);
  if (!token) return fail('voice_unavailable', 502);
  await limit.record(COST_ORE.voiceSession);
  return NextResponse.json({ token, keyterms: PLAY_KEYTERMS }, { headers: { 'cache-control': 'no-store' } });
}

function sameOrigin(req: NextRequest): boolean {
  const site = req.headers.get('sec-fetch-site');
  if (site) return site === 'same-origin';
  const origin = req.headers.get('origin');
  return !!origin && origin === req.nextUrl.origin;
}

