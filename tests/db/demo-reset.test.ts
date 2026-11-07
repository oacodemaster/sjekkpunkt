import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { anonClient, signedIn, withPg, type Role } from './helpers';

// M9: the demo reset. admin_demo_reset runs the generated seed (app.reset_to_seed) and writes its
// audit row in one transaction. Runs inside a transaction that is rolled back.

const WH = '00000000-0000-4000-8000-000000000001';
const roles: Role[] = ['packer', 'returns', 'lead', 'admin'];
const clients = {} as Record<Role, SupabaseClient>;

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
const one = async (q: Q, sql: string, params?: unknown[]) => (await q(sql, params))[0];

describe('demo reset is server-only (M9)', () => {
  it('no signed-in role, not even admin, and no visitor can call it directly', async () => {
    for (const role of roles) {
      const r = await clients[role].rpc('admin_demo_reset', { p: { warehouse_id: WH } });
      expect(r.error, role).not.toBeNull();
      expect(r.error!.message).toMatch(/permission denied|not find|does not exist/i);
    }
    expect((await anonClient().rpc('admin_demo_reset', { p: { warehouse_id: WH } })).error).not.toBeNull();
  });

  it('only the service role may run it, and nobody but the owner runs the seed function itself', async () => {
    const r = await withPg((c) =>
      c.query(`select
        has_function_privilege('service_role', 'public.admin_demo_reset(jsonb)', 'execute') as svc,
        has_function_privilege('authenticated', 'public.admin_demo_reset(jsonb)', 'execute') as auth,
        has_function_privilege('anon', 'public.admin_demo_reset(jsonb)', 'execute') as anon,
        has_function_privilege('service_role', 'app.reset_to_seed()', 'execute') as seed_svc,
        has_function_privilege('authenticated', 'app.reset_to_seed()', 'execute') as seed_auth`),
    );
    expect(r.rows[0]).toEqual({ svc: true, auth: false, anon: false, seed_svc: false, seed_auth: false });
  });
});

describe('admin_demo_reset', () => {
  it('puts the data back to seed, keeps users and devices, and logs who reset', async () => {
    await inRollback(async (q) => {
      const admin = (await one(q, `select id from auth.users where email = 'admin@sjekkpunkt.test'`)).id as string;
      const seedOrders = Number((await one(q, 'select count(*) from public.orders')).count);
      const profiles = Number((await one(q, 'select count(*) from public.profiles')).count);
      const devices = Number((await one(q, 'select count(*) from public.devices')).count);

      // What a stage rehearsal leaves behind: a decided return, a stored photo, a changed setting.
      await q(`update public.returns set status = 'confirmed' where ext_id = '1043'`);
      const order = (await one(q, `select id from public.orders where ext_id = '2207'`)).id;
      await q(`insert into public.photos (warehouse_id, storage_path, purpose, entity_type, entity_id) values ($1, 'test/demo-reset.jpg', 'pack_check', 'order', $2)`, [WH, order]);
      await q(`update public.settings set value = '9'::jsonb where key = 'max_retakes'`);
      await q(`update public.settings set value = '"changed guide"'::jsonb where key = 'grading_guide'`);

      const r = (await one(q, 'select public.admin_demo_reset($1::jsonb) as r', [JSON.stringify({ warehouse_id: WH, user_id: admin })])).r as {
        photos: string[];
        audio: string[];
        grading_guide: string | null;
      };
      // Every stored file is listed for deletion (the seed has no photos or summaries).
      const objects = await q(`select bucket_id, name from storage.objects where bucket_id in ('photos', 'audio') order by name`);
      expect(r.photos).toEqual(objects.filter((o) => o.bucket_id === 'photos').map((o) => o.name));
      expect(r.audio).toEqual(objects.filter((o) => o.bucket_id === 'audio').map((o) => o.name));
      expect(r.grading_guide).toMatch(/^SJEKKPUNKT GRADING GUIDE/);

      expect((await one(q, `select status from public.returns where ext_id = '1043'`)).status).toBe('pending');
      expect(Number((await one(q, 'select count(*) from public.orders')).count)).toBe(seedOrders);
      expect(Number((await one(q, 'select count(*) from public.photos')).count)).toBe(0);
      expect((await one(q, `select value from public.settings where key = 'max_retakes'`)).value).not.toBe(9);
      expect(Number((await one(q, 'select count(*) from public.profiles')).count)).toBe(profiles);
      expect(Number((await one(q, 'select count(*) from public.devices')).count)).toBe(devices);

      const log = await q(`select type, station, actor_user from public.audit_events order by at, created_at`);
      expect(log.map((e) => e.type)).toEqual(['SEED_LOADED', 'DEMO_RESET']);
      expect(log[1]).toMatchObject({ station: 'admin', actor_user: admin });

      // A second reset right after leaves the guide alone.
      const again = (await one(q, 'select public.admin_demo_reset($1::jsonb) as r', [JSON.stringify({ warehouse_id: WH, user_id: admin })])).r as typeof r;
      expect(again.grading_guide).toBeNull();
    });
  });

  it('refuses a call without a warehouse', async () => {
    await inRollback(async (q) => {
      await expect(q(`select public.admin_demo_reset('{}'::jsonb)`)).rejects.toThrow(/invalid_body/);
    });
  });
});
