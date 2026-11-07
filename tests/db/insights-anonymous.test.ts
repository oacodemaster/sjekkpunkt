import { describe, expect, it } from 'vitest';
import { withPg } from './helpers';

// Addendum section 4: insights read from views with no user or device columns.
const FORBIDDEN = ['actor_user', 'decided_by', 'device_id', 'actor_device', 'resolved_by', 'cleared_by', 'user_id'];

describe('insights views are anonymous', () => {
  it('no insights_* view exposes a user or device column', async () => {
    const rows = await withPg(async (c) =>
      (
        await c.query<{ table_name: string; column_name: string }>(
          `select table_name, column_name from information_schema.columns
           where table_schema = 'public' and table_name like 'insights\\_%'`,
        )
      ).rows,
    );
    const views = new Set(rows.map((r) => r.table_name));
    expect([...views].sort()).toEqual(['insights_alerts', 'insights_confusion', 'insights_decisions', 'insights_pack_checks', 'insights_returns']);
    const leaks = rows.filter((r) => FORBIDDEN.includes(r.column_name));
    expect(leaks).toEqual([]);
  });

  it('the lead audit view carries no raw payload', async () => {
    const cols = await withPg(async (c) =>
      (
        await c.query<{ column_name: string }>(
          `select column_name from information_schema.columns where table_schema = 'public' and table_name = 'audit_log'`,
        )
      ).rows.map((r) => r.column_name),
    );
    expect(cols).not.toContain('payload');
  });
});
