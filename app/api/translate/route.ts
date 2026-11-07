import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { fail, guard } from '@/lib/api/http';
import type { Lang } from '@/lib/engine/types';
import { LANGS } from '@/lib/i18n/strings';
import { limitCall, limitResponse } from '@/lib/limits/server';
import { COST_ORE } from '@/lib/limits/policy';
import { translate } from '@/lib/translate/server';

const Body = z.object({
  text: z.string().trim().min(1).max(1000),
  from: z.enum(LANGS as [Lang, ...Lang[]]).nullable().optional(),
  to: z.enum(['nb', 'en']).default('nb'),
});

/**
 * Translate a worker note or a caption line on the server (addendum section 6).
 * Packers get it too: the packing station shows the same captions from M4.
 */
export async function POST(req: NextRequest) {
  const g = await guard(req, ['packer', 'returns', 'lead', 'admin'], Body);
  if (!g.ok) return g.res;
  const { text, from, to } = g.body;
  const limit = await limitCall(g.user, 'translate');
  if (!limit.ok) return limitResponse(limit);
  const r = await translate(text, from ?? null, to);
  if (r.ok && r.model !== 'cache' && r.model !== 'none' && r.model !== 'mock') await limit.record(COST_ORE.translate);
  if (!r.ok) return fail(r.reason, r.reason === 'timeout' ? 504 : 502);
  return NextResponse.json({ text: r.text });
}
