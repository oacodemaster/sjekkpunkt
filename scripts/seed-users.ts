// Creates (or updates) one test user per role with a profile row.
// Passwords come from .env.local (SEED_PASSWORD_<ROLE>). Run: pnpm db:users

import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { WAREHOUSE_ID } from '../lib/demo/seed';

config({ path: '.env.local', quiet: true });

export const SEED_USERS = [
  { role: 'packer', email: 'packer@sjekkpunkt.test', lang: 'pl', name: 'Pakker 1' },
  { role: 'returns', email: 'returns@sjekkpunkt.test', lang: 'uk', name: 'Retur 1' },
  { role: 'lead', email: 'lead@sjekkpunkt.test', lang: 'nb', name: 'Teamleder' },
  { role: 'admin', email: 'admin@sjekkpunkt.test', lang: 'nb', name: 'Admin' },
] as const;

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const secret = process.env.SUPABASE_SECRET_KEY!;
  const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });

  const { data: list, error: listErr } = await admin.auth.admin.listUsers({ perPage: 200 });
  if (listErr) throw listErr;

  for (const u of SEED_USERS) {
    const password = process.env[`SEED_PASSWORD_${u.role.toUpperCase()}`];
    if (!password) throw new Error(`Missing SEED_PASSWORD_${u.role.toUpperCase()}`);

    let userId = list.users.find((x) => x.email === u.email)?.id;
    if (userId) {
      const { error } = await admin.auth.admin.updateUserById(userId, { password, email_confirm: true });
      if (error) throw error;
    } else {
      const { data, error } = await admin.auth.admin.createUser({ email: u.email, password, email_confirm: true });
      if (error) throw error;
      userId = data.user.id;
    }

    const { error: pErr } = await admin.from('profiles').upsert(
      { user_id: userId, warehouse_id: WAREHOUSE_ID, role: u.role, preferred_lang: u.lang, display_name: u.name },
      { onConflict: 'user_id' },
    );
    if (pErr) throw pErr;
    console.log(`ok  ${u.role.padEnd(8)} ${u.email}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
