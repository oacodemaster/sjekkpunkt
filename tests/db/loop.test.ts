import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { pairLabelNb } from '@/lib/engine/catalog';
import { PRODUCTS } from '@/lib/demo/seed';
import { anonClient, signedIn, withPg, type Role } from './helpers';

// M5: the loop in the database (auto alerts), the lead functions, and the live feed channel.
// Trigger tests run inside a transaction that is rolled back, so the shared data is unchanged.

const WH = '00000000-0000-4000-8000-000000000001';
const roles: Role[] = ['packer', 'returns', 'lead', 'admin'];
const clients = {} as Record<Role, SupabaseClient>;

beforeAll(async () => {
  for (const r of roles) clients[r] = await signedIn(r);
});
afterAll(async () => {
  for (const r of roles) await clients[r]?.auth.signOut();
});

async function inRollback<T>(fn: (q: (sql: string, params?: unknown[]) => Promise<Record<string, unknown>[]>) => Promise<T>): Promise<T> {
  return withPg(async (c) => {
    await c.query('begin');
    try {
      return await fn(async (sql, params) => (await c.query(sql, params)).rows);
    } finally {
      await c.query('rollback');
    }
  });
}

const insertEvent = (ago: string) =>
  `insert into public.confusion_events (warehouse_id, sku_a, sku_b, kind, at) values ('${WH}', 'CA-BLACK', 'CA-NAVY', 'caught_at_packing', now() - interval '${ago}')`;
const activeAlerts = `select reason_nb, origin from public.pack_alerts where sku_a = 'CA-BLACK' and sku_b = 'CA-NAVY' and active`;

describe('auto pack alerts (the loop, brief tests 8 and 9 in SQL)', () => {
  it('the third event for a pair within 7 days opens one alert, with an audit row', async () => {
    await inRollback(async (q) => {
      await q(insertEvent('3 days'));
      await q(insertEvent('1 day'));
      expect(await q(activeAlerts)).toEqual([]);
      await q(insertEvent('1 minute'));
      expect(await q(activeAlerts)).toEqual([{ reason_nb: 'Caps sort/marineblå forvekslet 3 ganger siste 7 dager', origin: 'auto' }]);
      const audit = await q(`select station, summary_nb from public.audit_events where type = 'PACK_ALERT_CREATED' and ref_label = 'CA-BLACK/CA-NAVY'`);
      expect(audit).toEqual([{ station: 'system', summary_nb: 'Pakkevarsel: Caps sort/marineblå forvekslet 3 ganger siste 7 dager' }]);
      // A fourth event does not open a second alert.
      await q(insertEvent('30 seconds'));
      expect(await q(activeAlerts)).toHaveLength(1);
    });
  });

  it('two events plus one 8 days old open no alert', async () => {
    await inRollback(async (q) => {
      await q(insertEvent('8 days'));
      await q(insertEvent('2 days'));
      await q(insertEvent('1 minute'));
      expect(await q(activeAlerts)).toEqual([]);
    });
  });

  it('follows the threshold setting', async () => {
    await inRollback(async (q) => {
      await q(`update public.settings set value = '2'::jsonb where warehouse_id = '${WH}' and key = 'confusion_threshold'`);
      await q(insertEvent('2 days'));
      await q(insertEvent('1 minute'));
      expect(await q(activeAlerts)).toHaveLength(1);
    });
  });

  it('the SQL pair label matches the engine for every variant pair in the seed', async () => {
    const groups = new Map<string, string[]>();
    for (const p of PRODUCTS) if (p.variantGroup) groups.set(p.variantGroup, [...(groups.get(p.variantGroup) ?? []), p.sku]);
    const pairs: [string, string][] = [];
    for (const skus of groups.values()) for (let i = 0; i < skus.length; i++) for (let j = i + 1; j < skus.length; j++) pairs.push([skus[i], skus[j]].sort() as [string, string]);
    pairs.push(['HD-NAVY-M', 'JK-SHELL-L']);
    expect(pairs.length).toBeGreaterThan(5);
    await withPg(async (c) => {
      for (const [a, b] of pairs) {
        const { rows } = await c.query('select app.pair_label_nb($1, $2) as label', [a, b]);
        expect(rows[0].label, `${a} / ${b}`).toBe(pairLabelNb([a, b], PRODUCTS));
      }
    });
  });
});

describe('lead functions are server-only (M5)', () => {
  it('no signed-in role can call them directly', async () => {
    const p = { warehouse_id: WH, escalation_id: '00000000-0000-4000-8000-000000000099', id: '00000000-0000-4000-8000-000000000099' };
    for (const role of roles) {
      for (const fn of ['resolve_escalation', 'decide_stock_adjustment', 'create_manual_alert', 'clear_pack_alert']) {
        const r = await clients[role].rpc(fn, { p });
        expect(r.error, `${role} ${fn}`).not.toBeNull();
        expect(r.error!.message).toMatch(/permission denied|not find|does not exist/i);
      }
    }
    expect((await anonClient().rpc('resolve_escalation', { p })).error).not.toBeNull();
  });
});

describe('live feed channel (Realtime, private)', () => {
  async function join(c: SupabaseClient, topic: string): Promise<string> {
    await c.realtime.setAuth();
    return new Promise((resolve) => {
      const ch = c.channel(topic, { config: { private: true } });
      const done = (s: string) => {
        void c.removeChannel(ch);
        resolve(s);
      };
      const timer = setTimeout(() => done('TIMED_OUT'), 10_000);
      ch.subscribe((status) => {
        if (status === 'SUBSCRIBED' || status === 'CHANNEL_ERROR') {
          clearTimeout(timer);
          done(status);
        }
      });
    });
  }

  it('only leads and admins of the warehouse can join its feed', async () => {
    expect(await join(clients.lead, `feed:${WH}`)).toBe('SUBSCRIBED');
    expect(await join(clients.admin, `feed:${WH}`)).toBe('SUBSCRIBED');
    expect(await join(clients.packer, `feed:${WH}`)).toBe('CHANNEL_ERROR');
    expect(await join(clients.returns, `feed:${WH}`)).toBe('CHANNEL_ERROR');
    expect(await join(clients.lead, 'feed:00000000-0000-4000-8000-0000000000ff')).toBe('CHANNEL_ERROR');
  });
});
