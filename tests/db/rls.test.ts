import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { anonClient, serviceClient, signedIn, visible, withPg, type Role } from './helpers';

const roles: Role[] = ['packer', 'returns', 'lead', 'admin'];
const clients = {} as Record<Role, SupabaseClient>;

beforeAll(async () => {
  for (const r of roles) clients[r] = await signedIn(r);
});
afterAll(async () => {
  for (const r of roles) await clients[r]?.auth.signOut();
});

// > 0 means "can read rows", 0 means "no rows visible", -1 means "no grant at all".
const matrix: Record<string, Record<Role, 'rows' | 'none'>> = {
  products: { packer: 'rows', returns: 'rows', lead: 'rows', admin: 'rows' },
  orders: { packer: 'rows', returns: 'rows', lead: 'rows', admin: 'rows' },
  pack_checks: { packer: 'rows', returns: 'rows', lead: 'rows', admin: 'rows' },
  settings: { packer: 'rows', returns: 'rows', lead: 'rows', admin: 'rows' },
  returns: { packer: 'none', returns: 'rows', lead: 'rows', admin: 'rows' },
  decisions: { packer: 'none', returns: 'rows', lead: 'rows', admin: 'rows' },
  confusion_events: { packer: 'none', returns: 'none', lead: 'rows', admin: 'rows' },
  audit_events: { packer: 'none', returns: 'none', lead: 'none', admin: 'rows' },
  audit_log: { packer: 'none', returns: 'none', lead: 'rows', admin: 'rows' },
  insights_decisions: { packer: 'none', returns: 'rows', lead: 'rows', admin: 'rows' },
  insights_confusion: { packer: 'none', returns: 'none', lead: 'rows', admin: 'rows' },
};

describe('RLS read matrix', () => {
  for (const [table, expected] of Object.entries(matrix)) {
    for (const role of roles) {
      it(`${role} ${expected[role] === 'rows' ? 'can' : 'cannot'} read ${table}`, async () => {
        const n = await visible(clients[role], table);
        if (expected[role] === 'rows') expect(n).toBeGreaterThan(0);
        else expect(n).toBeLessThanOrEqual(0);
      });
    }
  }

  it('a user sees only their own profile unless lead or admin', async () => {
    expect(await visible(clients.packer, 'profiles')).toBe(1);
    expect(await visible(clients.returns, 'profiles')).toBe(1);
    expect(await visible(clients.lead, 'profiles')).toBeGreaterThanOrEqual(4);
  });

  it('anonymous visitors read nothing', async () => {
    const anon = anonClient();
    for (const t of ['products', 'orders', 'returns', 'audit_log', 'profiles', 'settings']) {
      expect(await visible(anon, t)).toBeLessThanOrEqual(0);
    }
  });
});

describe('no writes through the Data API', () => {
  it('no role can insert, update or delete with a user token', async () => {
    for (const role of roles) {
      const c = clients[role];
      const ins = await c.from('audit_events').insert({
        warehouse_id: '00000000-0000-4000-8000-000000000001', station: 'system', type: 'X', summary_nb: 'x', summary_en: 'x',
      });
      expect(ins.error, `${role} insert audit_events`).not.toBeNull();

      const upd = await c.from('decisions').update({ refund_nok: 5000 }).neq('grade', 'Z').select();
      expect(upd.error ?? (upd.data?.length === 0 ? 'no rows' : null), `${role} update decisions`).not.toBeNull();

      const del = await c.from('products').delete().eq('sku', 'CP-BEANIE').select();
      expect(del.error ?? (del.data?.length === 0 ? 'no rows' : null), `${role} delete products`).not.toBeNull();

      const prof = await c.from('profiles').update({ role: 'admin' }).neq('role', 'x').select();
      expect(prof.error ?? (prof.data?.length === 0 ? 'no rows' : null), `${role} self-promote`).not.toBeNull();
    }
    const { count } = await serviceClient().from('products').select('*', { count: 'exact', head: true }).eq('sku', 'CP-BEANIE');
    expect(count).toBe(1);
  });
});

describe('audit_events is append-only', () => {
  it('even the service role cannot update or delete audit events', async () => {
    const svc = serviceClient();
    const upd = await svc.from('audit_events').update({ summary_nb: 'tampered' }).neq('type', '').select();
    expect(upd.error).not.toBeNull();
    const del = await svc.from('audit_events').delete().neq('type', '').select();
    expect(del.error).not.toBeNull();
  });

  it('the database owner is blocked by the trigger', async () => {
    await withPg(async (c) => {
      await expect(c.query(`update public.audit_events set summary_nb = 'x'`)).rejects.toThrow(/append-only/);
      await expect(c.query(`delete from public.audit_events`)).rejects.toThrow(/append-only/);
    });
  });
});
