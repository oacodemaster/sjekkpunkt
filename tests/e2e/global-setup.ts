import { readFileSync } from 'node:fs';
import pg from 'pg';

/** Reset the hosted dev database to seed before a local e2e run (specs mutate it). */
export default async function globalSetup() {
  // Behind a deployment only with an explicit opt-in (E2E_RESET_DB=1): it truncates the data.
  if (process.env.E2E_BASE_URL && process.env.E2E_RESET_DB !== '1') return;
  const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  try {
    await c.query(readFileSync('supabase/seed.sql', 'utf8'));
  } finally {
    await c.end();
  }
}
