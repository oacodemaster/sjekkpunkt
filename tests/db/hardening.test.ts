import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { anonClient, signedIn, visible, withPg, type Role } from './helpers';

// M8: rate-limit and spend functions. Changes run inside a transaction that is rolled back.

const WH = '00000000-0000-4000-8000-000000000001';
const roles: Role[] = ['packer', 'returns', 'lead', 'admin'];
const clients = {} as Record<Role, SupabaseClient>;
const FNS: [string, Record<string, unknown>][] = [
  ['api_gate', { p: { warehouse_id: WH, checks: [] } }],
  ['record_spend', { p: { warehouse_id: WH, provider: 'vision', ore: 1, cap_ore: 100 } }],
  ['purge_rate_limit_hits', {}],
];

beforeAll(async () => {
  for (const r of roles) clients[r] = await signedIn(r);
});
afterAll(async () => {
  for (const r of roles) await clients[r]?.auth.signOut();
});

type Q = (sql: string, params?: unknown[]) => Promise<Record<string, unknown>[]>;
async function inRollback<T>(fn: (q: Q) => Promise<T>): Promise<T> {
  return withPg(async (c) => {
    await c.query('begin');
    try {
      return await fn(async (sql, params) => (await c.query(sql, params)).rows);
    } finally {
      await c.query('rollback');
    }
  });
}
const call = (q: Q, fn: string, p: unknown) => q(`select public.${fn}($1::jsonb) as r`, [JSON.stringify(p)]).then((rows) => rows[0].r as Record<string, unknown>);

describe('limits are server-only (M8)', () => {
  it('no signed-in role can call the gate, spend or purge functions', async () => {
    for (const role of roles) {
      for (const [fn, args] of FNS) {
        const r = await clients[role].rpc(fn, args);
        expect(r.error, `${role} ${fn}`).not.toBeNull();
      }
    }
    for (const [fn, args] of FNS) expect((await anonClient().rpc(fn, args)).error, `anon ${fn}`).not.toBeNull();
  });

  it('spend is visible to leads and admins only, and nobody can write it', async () => {
    await inRollback(async (q) => {
      await call(q, 'record_spend', { warehouse_id: WH, provider: 'vision', ore: 5, cap_ore: 100_000 });
    });
    expect(await visible(clients.packer, 'spend_daily')).toBe(0);
    expect(await visible(clients.returns, 'spend_daily')).toBe(0);
    for (const role of roles) {
      const w = await clients[role].from('spend_daily').insert({ warehouse_id: WH, day: '2026-01-01', provider: 'vision', cost_ore: 1 }).select();
      expect(w.error, role).not.toBeNull();
    }
  });

  it('spend has no user or device column, and the rate-limit table is out of reach', async () => {
    const cols = await withPg((c) =>
      c.query(`select column_name from information_schema.columns where table_schema = 'public' and table_name = 'spend_daily'`).then((r) => r.rows.map((x) => x.column_name as string)),
    );
    expect(cols.sort()).toEqual(['calls', 'cap_reached_at', 'cost_ore', 'day', 'provider', 'warehouse_id']);
    for (const role of roles) {
      const r = await clients[role].schema('app').from('rate_limit_hits').select('*').limit(1);
      expect(r.error, role).not.toBeNull();
    }
  });
});

describe('api_gate', () => {
  it('counts per window and refuses over the limit with a retry time', async () => {
    await inRollback(async (q) => {
      const checks = [{ key: 'test-key-a', window: 60, limit: 2 }];
      const r1 = await call(q, 'api_gate', { warehouse_id: WH, checks });
      const r2 = await call(q, 'api_gate', { warehouse_id: WH, checks });
      const r3 = await call(q, 'api_gate', { warehouse_id: WH, checks });
      expect([r1.ok, r2.ok, r3.ok]).toEqual([true, true, false]);
      expect(r3.retry_after).toBeGreaterThan(0);
      expect(r3.retry_after).toBeLessThanOrEqual(60);
      // Another key has its own counter.
      expect((await call(q, 'api_gate', { warehouse_id: WH, checks: [{ key: 'test-key-b', window: 60, limit: 2 }] })).ok).toBe(true);
    });
  });

  it("reports today's spend for the provider", async () => {
    await inRollback(async (q) => {
      await q(`delete from spend_daily where warehouse_id = $1 and day = app.oslo_today()`, [WH]);
      await call(q, 'record_spend', { warehouse_id: WH, provider: 'vision', ore: 120, cap_ore: 100_000 });
      await call(q, 'record_spend', { warehouse_id: WH, provider: 'elevenlabs', ore: 300, cap_ore: 100_000 });
      const r = await call(q, 'api_gate', { warehouse_id: WH, provider: 'vision', checks: [] });
      expect(r).toMatchObject({ ok: true, spent_ore: 120 });
    });
  });
});

describe('record_spend', () => {
  it('adds up the day and audits the first time the cap is reached, once', async () => {
    await inRollback(async (q) => {
      await q(`delete from spend_daily where warehouse_id = $1 and day = app.oslo_today()`, [WH]);
      await call(q, 'record_spend', { warehouse_id: WH, provider: 'vision', ore: 60, cap_ore: 100 });
      expect(await q(`select 1 from audit_events where type = 'SPEND_CAP_REACHED' and at > now() - interval '1 second'`)).toHaveLength(0);
      const r = await call(q, 'record_spend', { warehouse_id: WH, provider: 'vision', ore: 60, cap_ore: 100 });
      expect(r.cost_ore).toBe(120);
      await call(q, 'record_spend', { warehouse_id: WH, provider: 'vision', ore: 60, cap_ore: 100 });
      const audit = await q(`select station, ref_label, actor_user, payload from audit_events where type = 'SPEND_CAP_REACHED' and at >= now()`);
      expect(audit).toHaveLength(1);
      expect(audit[0]).toMatchObject({ station: 'system', ref_label: 'vision', actor_user: null });
      const [row] = await q(`select calls, cap_reached_at is not null as reached from spend_daily where warehouse_id = $1 and day = app.oslo_today() and provider = 'vision'`, [WH]);
      expect(row).toEqual({ calls: 3, reached: true });
    });
  });
});
