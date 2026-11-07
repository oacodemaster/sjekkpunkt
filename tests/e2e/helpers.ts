import type { Page } from '@playwright/test';
import pg from 'pg';

// Shared by the M3+ specs. (returns.spec.ts and auth.spec.ts keep their own copies.)

export const pw = (role: string) => process.env[`SEED_PASSWORD_${role.toUpperCase()}`]!;

export async function sql<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> {
  const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  try {
    return (await c.query(text, params)).rows as T[];
  } finally {
    await c.end();
  }
}

export async function login(page: Page, role: string) {
  await page.goto('/login');
  await page.getByLabel(/E-post/).fill(`${role}@sjekkpunkt.test`);
  await page.getByLabel(/Passord/).fill(pw(role));
  await page.getByRole('button', { name: 'Logg inn' }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'));
}

