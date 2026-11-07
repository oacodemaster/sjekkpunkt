import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { anonClient, signedIn, withPg, type Role } from './helpers';

// M7: the admin SQL functions. Changes run inside a transaction that is rolled back.

const WH = '00000000-0000-4000-8000-000000000001';
const roles: Role[] = ['packer', 'returns', 'lead', 'admin'];
const clients = {} as Record<Role, SupabaseClient>;
const FNS = ['admin_update_settings', 'admin_save_product', 'admin_add_reference_photo', 'admin_remove_reference_photo', 'admin_import', 'record_retention_run'];

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
const adminId = (q: Q) => q(`select id from auth.users where email = 'admin@sjekkpunkt.test'`).then((r) => r[0].id as string);

describe('admin functions are server-only (M7)', () => {
  it('no signed-in role, not even admin, can call them directly', async () => {
    for (const role of roles) {
      for (const fn of FNS) {
        const r = await clients[role].rpc(fn, { p: { warehouse_id: WH } });
        expect(r.error, `${role} ${fn}`).not.toBeNull();
        expect(r.error!.message).toMatch(/permission denied|not find|does not exist/i);
      }
    }
    expect((await anonClient().rpc('admin_update_settings', { p: { warehouse_id: WH } })).error).not.toBeNull();
  });

  it('workers and leads cannot write settings or products through the Data API', async () => {
    for (const role of roles) {
      const s = await clients[role].from('settings').update({ value: 99 }).eq('key', 'max_retakes').select();
      expect(s.error ?? (s.data?.length ? 'wrote' : null), role).not.toBeNull();
      const p = await clients[role].from('products').update({ price_nok: 1 }).eq('sku', 'HD-NAVY-M').select();
      expect(p.error ?? (p.data?.length ? 'wrote' : null), role).not.toBeNull();
    }
  });
});

describe('admin_update_settings', () => {
  it('writes only changed keys, audits the admin, and moves photo expiry with the retention setting', async () => {
    await inRollback(async (q) => {
      const user = await adminId(q);
      const [photo] = await q(
        `insert into photos (warehouse_id, storage_path, purpose, entity_type, entity_id, created_at, expires_at)
         values ($1, 'x/test.jpg', 'front', 'return_item', gen_random_uuid(), now() - interval '10 days', now() + interval '20 days') returning id`,
        [WH],
      );
      const [ref] = await q(
        `insert into photos (warehouse_id, storage_path, purpose, entity_type, entity_id, expires_at)
         values ($1, 'x/ref.jpg', 'reference', 'product', gen_random_uuid(), null) returning id`,
        [WH],
      );
      const r = await call(q, 'admin_update_settings', { warehouse_id: WH, user_id: user, values: { max_retakes: 2, photo_retention_days: 7 } });
      expect(r.changed).toEqual(['photo_retention_days']); // max_retakes was already 2

      const [p] = await q(`select expires_at < now() as expired from photos where id = $1`, [photo.id]);
      expect(p.expired).toBe(true); // created 10 days ago, now kept 7 days
      const [rp] = await q(`select expires_at from photos where id = $1`, [ref.id]);
      expect(rp.expires_at).toBeNull();

      const [a] = await q(`select station, type, actor_user, ref_label, payload from audit_events where type = 'SETTINGS_UPDATED' order by at desc limit 1`);
      expect(a).toMatchObject({ station: 'admin', actor_user: user, ref_label: 'photo_retention_days' });
      expect((a.payload as { changed: Record<string, { from: number; to: number }> }).changed.photo_retention_days).toEqual({ from: 30, to: 7 });

      const again = await call(q, 'admin_update_settings', { warehouse_id: WH, user_id: user, values: { photo_retention_days: 7 } });
      expect(again.changed).toEqual([]);
    });
  });

  it('the pack alert trigger uses a changed threshold', async () => {
    await inRollback(async (q) => {
      await call(q, 'admin_update_settings', { warehouse_id: WH, user_id: await adminId(q), values: { confusion_threshold: 2 } });
      await q(`insert into confusion_events (warehouse_id, sku_a, sku_b, kind) values ($1, 'CA-BLACK', 'CA-NAVY', 'caught_at_packing')`, [WH]);
      const alerts = await q(`select origin from pack_alerts where sku_a = 'CA-BLACK' and sku_b = 'CA-NAVY' and active`);
      expect(alerts).toEqual([]); // the seeded CA event is 25 days old, outside the 7-day window
      await q(`insert into confusion_events (warehouse_id, sku_a, sku_b, kind) values ($1, 'CA-BLACK', 'CA-NAVY', 'caught_at_packing')`, [WH]);
      expect(await q(`select origin from pack_alerts where sku_a = 'CA-BLACK' and sku_b = 'CA-NAVY' and active`)).toEqual([{ origin: 'auto' }]);
    });
  });
});

describe('admin_save_product', () => {
  const product = { sku: 'TS-WHITE-XL', name_nb: 'T-skjorte, hvit, XL', name_en: 'T-shirt, white, XL', category: 'apparel', color: 'white', size: 'XL', price_nok: 199, location_code: 'Z-99-1', variant_group: 'tee-white', barcode: '7090000009991' };

  it('creates with a new stock shelf, refuses duplicates and taken barcodes, and audits', async () => {
    await inRollback(async (q) => {
      const user = await adminId(q);
      await call(q, 'admin_save_product', { warehouse_id: WH, user_id: user, mode: 'create', product });
      expect(await q(`select kind from locations where code = 'Z-99-1'`)).toEqual([{ kind: 'stock' }]);
      await q('savepoint s');
      await expect(call(q, 'admin_save_product', { warehouse_id: WH, user_id: user, mode: 'create', product })).rejects.toThrow(/sku_exists/);
      await q('rollback to savepoint s');
      const [a] = await q(`select type, ref_label, actor_user from audit_events where type = 'PRODUCT_CREATED'`);
      expect(a).toEqual({ type: 'PRODUCT_CREATED', ref_label: 'TS-WHITE-XL', actor_user: user });
    });
    await inRollback(async (q) => {
      const [{ barcode }] = await q(`select barcode from products where sku = 'HD-NAVY-M'`);
      await expect(call(q, 'admin_save_product', { warehouse_id: WH, mode: 'create', product: { ...product, barcode } })).rejects.toThrow(/barcode_taken/);
    });
    await inRollback(async (q) => {
      await expect(call(q, 'admin_save_product', { warehouse_id: WH, mode: 'update', product: { ...product, sku: 'HD-NAVY-M', location_code: 'B-OUT-1' } })).rejects.toThrow(
        /not_stock_location/,
      );
    });
  });
});

describe('admin_import', () => {
  it('is all or nothing: one bad order rolls back the whole file', async () => {
    await inRollback(async (q) => {
      const plan = {
        kind: 'orders',
        orders: [
          { ext_id: 'T-1', customer_ref: 'Test', lines: [{ sku: 'HD-NAVY-M', qty: 1 }] },
          { ext_id: 'T-2', customer_ref: 'Test', lines: [{ sku: 'NO-SUCH-SKU', qty: 1 }] },
        ],
      };
      await q('savepoint s');
      await expect(call(q, 'admin_import', { warehouse_id: WH, kind: 'orders', plan })).rejects.toThrow(/unknown_sku: NO-SUCH-SKU/);
      await q('rollback to savepoint s');
      expect(await q(`select ext_id from orders where ext_id like 'T-%'`)).toEqual([]);
    });
  });

  it('imports orders (price from the product when missing) and returns against them', async () => {
    await inRollback(async (q) => {
      const user = await adminId(q);
      const o = await call(q, 'admin_import', {
        warehouse_id: WH,
        user_id: user,
        kind: 'orders',
        plan: { kind: 'orders', orders: [{ ext_id: 'T-1', customer_ref: 'Test', lines: [{ sku: 'HD-NAVY-M', qty: 2 }, { sku: 'SK-WOOL-40', qty: 1, price_nok: 100 }] }] },
      });
      expect(o).toEqual({ created: 1, updated: 0, lines: 2 });
      expect(await q(`select l.sku, l.qty, l.price_nok, o.status from order_lines l join orders o on o.id = l.order_id where o.ext_id = 'T-1' order by l.sku`)).toEqual([
        { sku: 'HD-NAVY-M', qty: 2, price_nok: 599, status: 'picked' },
        { sku: 'SK-WOOL-40', qty: 1, price_nok: 100, status: 'picked' },
      ]);
      const r = await call(q, 'admin_import', {
        warehouse_id: WH,
        user_id: user,
        kind: 'returns',
        plan: { kind: 'returns', returns: [{ ext_id: 'TR-1', order_ext_id: 'T-1', customer_reason_nb: 'For stor', items: [{ sku: 'HD-NAVY-M', qty: 1 }] }] },
      });
      expect(r).toEqual({ created: 1, updated: 0, lines: 1 });
      expect(await q(`select type, ref_label, actor_user from audit_events where type = 'CSV_IMPORT' order by at`)).toEqual([
        { type: 'CSV_IMPORT', ref_label: 'orders', actor_user: user },
        { type: 'CSV_IMPORT', ref_label: 'returns', actor_user: user },
      ]);
    });
  });
});

describe('record_retention_run', () => {
  it('clears deleted paths, keeps the photo rows, and logs a system run without a person', async () => {
    await inRollback(async (q) => {
      const [p] = await q(
        `insert into photos (warehouse_id, storage_path, purpose, entity_type, entity_id, expires_at)
         values ($1, 'x/old.jpg', 'front', 'return_item', gen_random_uuid(), now() - interval '1 day') returning id`,
        [WH],
      );
      const r = await call(q, 'record_retention_run', { warehouse_id: WH, deleted_ids: [p.id], failed: 0, trigger: 'cron' });
      expect(r).toEqual({ deleted: 1, failed: 0 });
      expect(await q(`select storage_path from photos where id = $1`, [p.id])).toEqual([{ storage_path: null }]);
      const [a] = await q(`select station, actor_user, summary_nb from audit_events where type = 'RETENTION_RUN'`);
      expect(a).toEqual({ station: 'system', actor_user: null, summary_nb: 'Sletting: 1 utløpte bilder slettet' });
    });
  });
});
