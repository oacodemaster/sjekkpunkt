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


/** Resets the hosted dev database to seed (specs that change shared rows reset before and after). */
export async function resetDb() {
  const { readFileSync } = await import('node:fs');
  await sql(readFileSync('supabase/seed.sql', 'utf8'));
}

/**
 * Return 1043 through the returns station in Ukrainian, with mocked vision: front, label (M),
 * the injection note, then confirm. Leaves a suspicious_note escalation, two stock proposals and
 * the third shell-jacket mix-up (which opens the pack alert).
 */
export async function confirmReturn1043(page: Page) {
  const { t } = await import('../../lib/i18n/strings');
  const { expect } = await import('@playwright/test');
  const uk = 'uk' as const;
  await login(page, 'returns');
  await page.getByRole('button', { name: 'device-03' }).click();
  await page.getByPlaceholder(t('returnNumber', uk)).fill('1043');
  await page.getByRole('button', { name: t('open', uk) }).click();
  await page.getByRole('button', { name: t('startInspection', uk) }).click();
  for (const [step, file] of [['stepFront', 'ret-1043-front'], ['stepLabel', 'ret-1043-label'], ['stepNote', 'ret-1043-note']] as const) {
    await page.getByRole('button', { name: new RegExp(`^${t(step, uk)}`) }).click();
    await page.getByRole('button', { name: t('takePhoto', uk), exact: true }).click();
    const vision = page.waitForResponse((r) => r.url().endsWith('/api/vision'), { timeout: 20_000 });
    await page.getByTestId('photo-file').setInputFiles(`tests/e2e/fixtures/${file}.jpg`);
    await vision;
    await expect(page.getByText(t('checking', uk))).toBeHidden();
  }
  await page.getByRole('button', { name: t('next', uk), exact: true }).click();
  await page.getByRole('button', { name: t('next', uk), exact: true }).click();
  await expect(page.getByTestId('grade')).toHaveText('A');
  await page.getByRole('button', { name: t('confirmReturn', uk) }).click();
  await expect(page.getByRole('heading', { name: t('returnConfirmed', uk) })).toBeVisible();
}
