import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import pg from 'pg';

export type Role = 'packer' | 'returns' | 'lead' | 'admin';

const url = () => process.env.NEXT_PUBLIC_SUPABASE_URL!;
const opts = { auth: { persistSession: false, autoRefreshToken: false } };

export function anonClient(): SupabaseClient {
  return createClient(url(), process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, opts);
}

export function serviceClient(): SupabaseClient {
  return createClient(url(), process.env.SUPABASE_SECRET_KEY!, opts);
}

export async function signedIn(role: Role): Promise<SupabaseClient> {
  const c = anonClient();
  const { error } = await c.auth.signInWithPassword({
    email: `${role}@sjekkpunkt.test`,
    password: process.env[`SEED_PASSWORD_${role.toUpperCase()}`]!,
  });
  if (error) throw new Error(`sign-in ${role}: ${error.message}`);
  return c;
}

export async function withPg<T>(fn: (c: pg.Client) => Promise<T>): Promise<T> {
  const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  try {
    return await fn(c);
  } finally {
    await c.end();
  }
}

/** Row count visible to this client, or -1 if the query errored (no grant). */
export async function visible(c: SupabaseClient, table: string): Promise<number> {
  const { count, error } = await c.from(table).select('*', { count: 'exact', head: true });
  return error ? -1 : (count ?? 0);
}
