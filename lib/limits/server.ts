import 'server-only';
import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { SETTING_DEFAULTS } from '@/lib/admin/settings';
import { settingsSchema } from '@/lib/admin/schemas';
import { getDeviceLabel, type CurrentUser } from '@/lib/auth/dal';
import { createAdminClient } from '@/lib/supabase/admin';
import { overCap, PLAY_VOICE_LIMITS, RATE_LIMITS, ROUTE_PROVIDER, type LimitedRoute, type Provider } from './policy';

// Server side of rate limits and spend caps (M8). Counters live in Postgres (api_gate,
// record_spend) because serverless instances share no memory. A database error fails open with a
// log line: the route itself will fail on the same database a moment later anyway.

export type LimitResult =
  | { ok: true; record: (ore: number) => Promise<void> }
  | { ok: false; reason: 'rate_limited'; retryAfter: number }
  | { ok: false; reason: 'spend_cap' };

const hash = (s: string) => createHash('sha256').update(s).digest('hex');

async function capOre(warehouseId: string, provider: Provider): Promise<number> {
  const { data } = await createAdminClient()
    .from('settings')
    .select('value')
    .eq('warehouse_id', warehouseId)
    .eq('key', 'daily_spend_cap_nok')
    .maybeSingle();
  const parsed = settingsSchema.shape.daily_spend_cap_nok.safeParse(data?.value);
  const caps = parsed.success ? parsed.data : SETTING_DEFAULTS.daily_spend_cap_nok;
  return caps[provider] * 100;
}

function recorder(warehouseId: string, provider: Provider, cap: number) {
  return async (ore: number) => {
    if (!(ore > 0)) return;
    const { error } = await createAdminClient().rpc('record_spend', {
      p: { warehouse_id: warehouseId, provider, ore: Math.round(ore), cap_ore: cap },
    });
    if (error) console.error('[limits] record_spend failed:', error.message);
  };
}

/**
 * Counts one call against the route's windows (per user, and per device on a handheld) and
 * checks today's spend for the route's provider. Call it after authorize(), before the paid call;
 * then `record(ore)` the estimated cost once the call has run.
 */
export async function limitCall(user: CurrentUser, route: LimitedRoute): Promise<LimitResult> {
  const provider = ROUTE_PROVIDER[route];
  const device = await getDeviceLabel();
  const checks = RATE_LIMITS[route].flatMap((w) => [
    { key: hash(`${route}|u|${user.userId}|${w.window}`), window: w.window, limit: w.limit },
    ...(device ? [{ key: hash(`${route}|d|${user.warehouseId}|${device}|${w.window}`), window: w.window, limit: w.limit }] : []),
  ]);
  const [gate, cap] = await Promise.all([
    createAdminClient().rpc('api_gate', { p: { warehouse_id: user.warehouseId, provider, checks } }),
    capOre(user.warehouseId, provider),
  ]);
  if (gate.error) {
    console.error('[limits] api_gate failed:', gate.error.message);
    return { ok: true, record: recorder(user.warehouseId, provider, cap) };
  }
  const g = gate.data as { ok: boolean; retry_after: number; spent_ore: number };
  if (!g.ok) return { ok: false, reason: 'rate_limited', retryAfter: g.retry_after };
  if (overCap(g.spent_ore, cap / 100)) return { ok: false, reason: 'spend_cap' };
  return { ok: true, record: recorder(user.warehouseId, provider, cap) };
}

/**
 * limitCall for the public practice demo, which has no user: counted per visitor (a hash of the
 * IP, never stored in clear) and in total, then today's ElevenLabs spend for the warehouse.
 */
export async function limitPlayVoice(warehouseId: string, visitor: string): Promise<LimitResult> {
  const provider: Provider = 'elevenlabs';
  const checks = [
    ...PLAY_VOICE_LIMITS.perVisitor.map((w) => ({ key: hash(`play_voice|v|${visitor}|${w.window}`), window: w.window, limit: w.limit })),
    ...PLAY_VOICE_LIMITS.total.map((w) => ({ key: hash(`play_voice|all|${w.window}`), window: w.window, limit: w.limit })),
  ];
  const [gate, cap] = await Promise.all([createAdminClient().rpc('api_gate', { p: { warehouse_id: warehouseId, provider, checks } }), capOre(warehouseId, provider)]);
  // Unlike the signed-in routes this fails closed: a public route must not spend without a count.
  if (gate.error) {
    console.error('[limits] api_gate failed:', gate.error.message);
    return { ok: false, reason: 'rate_limited', retryAfter: 60 };
  }
  const g = gate.data as { ok: boolean; retry_after: number; spent_ore: number };
  if (!g.ok) return { ok: false, reason: 'rate_limited', retryAfter: g.retry_after };
  if (overCap(g.spent_ore, cap / 100)) return { ok: false, reason: 'spend_cap' };
  return { ok: true, record: recorder(warehouseId, provider, cap) };
}

/** Spend check without a rate limit, for paid calls made inside other routes (note translation). */
export async function spendGate(warehouseId: string, provider: Provider): Promise<LimitResult> {
  const [{ data, error }, cap] = await Promise.all([
    createAdminClient()
      .from('spend_daily')
      .select('cost_ore')
      .eq('warehouse_id', warehouseId)
      .eq('provider', provider)
      .eq('day', osloToday())
      .maybeSingle(),
    capOre(warehouseId, provider),
  ]);
  if (error) console.error('[limits] spend read failed:', error.message);
  if (overCap(Number(data?.cost_ore ?? 0), cap / 100)) return { ok: false, reason: 'spend_cap' };
  return { ok: true, record: recorder(warehouseId, provider, cap) };
}

/** The standard refusal: 429 with Retry-After, or 503 when today's budget is spent. */
export function limitResponse(r: Exclude<LimitResult, { ok: true }>): NextResponse {
  if (r.reason === 'rate_limited') {
    return NextResponse.json(
      { error: 'rate_limited', retryAfter: r.retryAfter },
      { status: 429, headers: { 'retry-after': String(r.retryAfter), 'cache-control': 'no-store' } },
    );
  }
  return NextResponse.json({ error: 'spend_cap' }, { status: 503, headers: { 'cache-control': 'no-store' } });
}

/** YYYY-MM-DD in Oslo, the same day as app.oslo_today() in SQL. */
export function osloToday(now = new Date()): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Oslo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

export interface SpendStatus {
  provider: Provider;
  spentOre: number;
  capOre: number;
  calls: number;
  capped: boolean;
}

/** Today's spend per provider, for the admin card and the station banner. */
export async function spendStatus(warehouseId: string): Promise<Record<Provider, SpendStatus>> {
  const providers: Provider[] = ['vision', 'elevenlabs'];
  const [{ data }, ...caps] = await Promise.all([
    createAdminClient().from('spend_daily').select('provider, cost_ore, calls').eq('warehouse_id', warehouseId).eq('day', osloToday()),
    ...providers.map((p) => capOre(warehouseId, p)),
  ]);
  const out = {} as Record<Provider, SpendStatus>;
  providers.forEach((p, i) => {
    const row = (data ?? []).find((r) => r.provider === p);
    const spentOre = Number(row?.cost_ore ?? 0);
    out[p] = { provider: p, spentOre, capOre: caps[i], calls: row?.calls ?? 0, capped: overCap(spentOre, caps[i] / 100) };
  });
  return out;
}
