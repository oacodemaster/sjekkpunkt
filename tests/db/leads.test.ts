import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { anonClient, serviceClient, signedIn, withPg, type Role } from './helpers';

// Landing page leads (landing page brief, section 9): RLS on, no grant for anon or authenticated,
// writes only through service-role functions. Changes run inside a transaction that is rolled back.

const roles: Role[] = ['packer', 'returns', 'lead', 'admin'];
const clients = {} as Record<Role, SupabaseClient>;
const LEAD = { name: 'Db Test', email: 'db@example.com', company: 'Test AS', role: 'it', orders_per_day: '50_200', interest: 'both', message: 'hei', lang: 'nb' };
const FNS: [string, Record<string, unknown>][] = [
  ['insert_lead', { p: LEAD }],
  ['lead_notified', { p: { id: '00000000-0000-4000-8000-000000000000' } }],
  ['purge_old_leads', { p: { days: 0 } }],
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

describe('leads are out of reach for visitors and staff', () => {
  it('anon and every signed-in role can neither read nor insert leads', async () => {
    for (const [who, c] of [['anon', anonClient()], ...roles.map((r) => [r, clients[r]])] as [string, SupabaseClient][]) {
      const read = await c.from('leads').select('id').limit(1);
      expect(read.error, `${who} read`).not.toBeNull();
      const write = await c.from('leads').insert({ name: 'x', email: 'x@example.com', company: 'x', lang: 'nb' }).select();
      expect(write.error, `${who} insert`).not.toBeNull();
    }
  });

  it('only the service role can call the lead functions', async () => {
    for (const [fn, args] of FNS) {
      expect((await anonClient().rpc(fn, args)).error, `anon ${fn}`).not.toBeNull();
      for (const role of roles) expect((await clients[role].rpc(fn, args)).error, `${role} ${fn}`).not.toBeNull();
    }
  });

  it('the service role stores a lead through insert_lead, and the table keeps no IP or device', async () => {
    const svc = serviceClient();
    const { data: id, error } = await svc.rpc('insert_lead', { p: { ...LEAD, email: 'Db@Example.com' } });
    expect(error).toBeNull();
    try {
      const { data } = await svc.from('leads').select('*').eq('id', id).single();
      expect(data).toMatchObject({ name: 'Db Test', email: 'db@example.com', company: 'Test AS', orders_per_day: '50_200', notified_at: null });
      const cols = Object.keys(data!);
      for (const c of cols) expect(c, 'no visitor identifiers').not.toMatch(/ip|agent|device|user/);
      expect((await svc.rpc('lead_notified', { p: { id } })).error).toBeNull();
      const { data: after } = await svc.from('leads').select('notified_at').eq('id', id).single();
      expect(after?.notified_at).not.toBeNull();
    } finally {
      await svc.from('leads').delete().eq('id', id);
    }
  });

  it('the table refuses values outside the form lists', async () => {
    const r = await serviceClient().rpc('insert_lead', { p: { ...LEAD, orders_per_day: '9000' } });
    expect(r.error).not.toBeNull();
  });

  it('purge_old_leads deletes leads older than the retention period only', async () => {
    await inRollback(async (q) => {
      await q(`insert into public.leads (name, email, company, lang, created_at) values ('Old', 'old@example.com', 'X', 'nb', now() - interval '400 days'), ('New', 'new@example.com', 'X', 'nb', now() - interval '10 days')`);
      const [{ r }] = await q(`select public.purge_old_leads('{"days": 365}'::jsonb) as r`);
      expect(r).toBeGreaterThanOrEqual(1);
      const left = await q(`select name from public.leads where email in ('old@example.com', 'new@example.com')`);
      expect(left.map((x) => x.name)).toEqual(['New']);
    });
  });

  it('no insights view reads the leads table', async () => {
    const rows = await withPg(async (c) =>
      (
        await c.query(
          `select distinct v.table_name from information_schema.view_table_usage v
            where v.view_schema = 'public' and v.table_name = 'leads'`,
        )
      ).rows,
    );
    expect(rows).toEqual([]);
  });
});
