import { readFileSync } from 'node:fs';
import pg from 'pg';

/** Reset the hosted dev database to seed before a local e2e run (specs mutate it). */
export default async function globalSetup() {
  // Public-page specs (landing) need neither: E2E_NO_DB=1 skips the database here.
  if (process.env.E2E_NO_DB === '1') return;
  const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  try {
    // Behind a deployment only with an explicit opt-in (E2E_RESET_DB=1): it truncates the data.
    if (!process.env.E2E_BASE_URL || process.env.E2E_RESET_DB === '1') {
      await c.query(readFileSync('supabase/seed.sql', 'utf8'));
    }
    // The station specs start at the station: the test workers have already read the privacy
    // information (tests/e2e/admin.spec.ts walks through the first launch itself).
    await c.query(
      `update profiles set privacy_info_read_at = coalesce(privacy_info_read_at, now())
        where user_id in (select id from auth.users where email like '%@sjekkpunkt.test')`,
    );
  } finally {
    await c.end();
  }
}
