import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { runRetention } from '@/lib/admin/retention';

/**
 * Daily photo retention, called by Vercel Cron (vercel.json) with `Authorization: Bearer
 * <CRON_SECRET>` (checked against the Vercel docs on 2026-11-07). Without the secret set, the
 * route refuses every call, so it can never be triggered from outside.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const got = req.headers.get('authorization') ?? '';
  const want = `Bearer ${secret}`;
  if (!secret || got.length !== want.length || !timingSafeEqual(Buffer.from(got), Buffer.from(want))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  try {
    const results = await runRetention({ trigger: 'cron' });
    return NextResponse.json({ ok: true, results });
  } catch (e) {
    console.error('[cron] retention failed:', e instanceof Error ? e.message : e);
    return NextResponse.json({ error: 'failed' }, { status: 500 });
  }
}
