import { expect, test, type Browser, type Page } from '@playwright/test';
import { readdirSync } from 'node:fs';
import { t } from '../../lib/i18n/strings';
import { confirmReturn1043, login, sql } from './helpers';
import { openDemo, runScript } from './demo-run';

// M9 stage readiness: an admin resets the data from /admin, the live stage run works after it
// (return 1043 at the returns bench), a second reset brings it back to the start (the catalogue and
// its reference photos stay), and the full
// scripted demo runs end to end on the projector and on a phone. Against a deployment the live
// return uses real vision (a few calls), like returns.spec.ts with E2E_RESET_DB=1.

const demoOn = process.env.NEXT_PUBLIC_DEMO_ENABLED === 'true';
const projector = { viewport: { width: 1440, height: 900 }, isMobile: false, hasTouch: false, deviceScaleFactor: 1 };

async function resetFromAdmin(browser: Browser) {
  const ctx = await browser.newContext(projector);
  const page = await ctx.newPage();
  await login(page, 'admin');
  await page.goto('/admin');
  await page.getByRole('button', { name: 'Tilbakestill demodata' }).click();
  const reset = page.waitForResponse((r) => r.url().endsWith('/api/admin/demo-reset'), { timeout: 30_000 });
  await page.getByRole('button', { name: 'Ja, tilbakestill alt' }).click();
  expect((await reset).status()).toBe(200);
  await expect(page.getByTestId('demo-reset-status')).toContainText('Demodata er tilbakestilt');
  await ctx.close();
}

/** The audit trail of the last reset: the seed row, then the admin's reset row. */
async function lastReset() {
  return sql<{ type: string; actor: string | null }>(
    `select a.type, u.email as actor from audit_events a left join auth.users u on u.id = a.actor_user order by a.at, a.created_at limit 2`,
  );
}

/** CSP violations and failed same-origin audio requests during a run. */
function watch(page: Page) {
  const problems: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' && /Content Security Policy|Refused to/i.test(m.text())) problems.push(m.text());
  });
  page.on('response', (r) => {
    if (r.url().includes('/audio/') && r.status() >= 400) problems.push(`${r.status()} ${r.url()}`);
  });
  return problems;
}

test.describe('stage readiness (M9)', () => {
  test.skip(!demoOn, 'demo disabled');

  test('reset from /admin, a live return, reset again, then the scripted demo on the projector', async ({ browser }) => {
    test.setTimeout(240_000);

    // 1. Reset: back to seed, with the admin on the audit row. A product edit made for a prop
    // survives it (restored afterwards, so a real edit is never lost).
    const [{ name_nb: before }] = await sql<{ name_nb: string }>(`select name_nb from products where sku = 'HD-NAVY-M'`);
    await sql(`update products set name_nb = $1 where sku = 'HD-NAVY-M'`, [`${before} (stage spec)`]);
    try {
      await resetFromAdmin(browser);
      expect(await sql(`select name_nb from products where sku = 'HD-NAVY-M'`)).toEqual([{ name_nb: `${before} (stage spec)` }]);
    } finally {
      await sql(`update products set name_nb = $1 where sku = 'HD-NAVY-M'`, [before]);
    }
    expect(await lastReset()).toEqual([
      { type: 'SEED_LOADED', actor: null },
      { type: 'DEMO_RESET', actor: 'admin@sjekkpunkt.test' },
    ]);

    // 2. The live stage run works on the reset data: return 1043 at the bench, confirmed.
    const worker = await browser.newContext();
    await confirmReturn1043(await worker.newPage());
    await worker.close();
    expect((await sql<{ status: string }>(`select status from returns where ext_id = '1043'`))[0].status).not.toBe('pending');
    expect((await sql<{ n: number }>(`select count(*)::int as n from pack_alerts where active`))[0].n).toBeGreaterThan(0);

    // 3. Reset again: 1043 is waiting at the bench, the alert and the escalation are gone.
    await resetFromAdmin(browser);
    expect((await sql<{ status: string }>(`select status from returns where ext_id = '1043'`))[0].status).toBe('pending');
    expect((await sql<{ n: number }>(`select count(*)::int as n from pack_alerts`))[0].n).toBe(0);
    expect((await sql<{ n: number }>(`select count(*)::int as n from escalations`))[0].n).toBe(0);
    // Only product reference photos survive a reset (the catalogue is kept).
    expect((await sql<{ n: number }>(`select count(*)::int as n from photos where purpose <> 'reference'`))[0].n).toBe(0);
    const again = await browser.newContext();
    const bench = await again.newPage();
    await login(bench, 'returns');
    await bench.getByRole('button', { name: 'device-03' }).click();
    await bench.getByPlaceholder(t('returnNumber', 'uk')).fill('1043');
    await bench.getByRole('button', { name: t('open', 'uk') }).click();
    await expect(bench.getByRole('button', { name: t('startInspection', 'uk') })).toBeVisible();
    await again.close();

    // 4. The full scripted demo on a 1440x900 projector, with its pre-generated audio.
    const stage = await browser.newContext(projector);
    const page = await stage.newPage();
    const problems = watch(page);
    await openDemo(page, 'projector');
    await runScript(page, 'projector');
    expect(problems).toEqual([]);
    await stage.close();
  });

  test('the scripted demo runs end to end on a phone with the bottom bar', async ({ page }) => {
    test.setTimeout(120_000);
    const problems = watch(page);
    await openDemo(page, 'phone');
    // No sideways scrolling on a phone.
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await runScript(page, 'phone');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    // Back, then the director menu: jump to scene 2 and reset.
    await page.getByRole('button', { name: 'Forrige steg' }).click();
    await expect(page.getByTestId('mobile-step')).toContainText('LOOP-03');
    await page.getByRole('button', { name: 'Regi' }).click();
    await page.getByRole('button', { name: '2 Retur' }).click();
    await expect(page.getByTestId('mobile-step')).toContainText('RET-01');
    await page.getByRole('button', { name: 'Nullstill' }).click();
    await expect(page.getByTestId('mobile-step')).toContainText('START');
    await expect(page.getByTestId('event-log')).not.toContainText('2207');
    expect(problems).toEqual([]);
  });

  test('the audio the demo plays is served from this origin', async ({ page }) => {
    const files = readdirSync('public/audio').filter((f) => f.endsWith('.mp3'));
    expect(files.length).toBe(17); // 5 earcons, 12 voice lines
    for (const f of files) {
      const res = await page.request.get(`/audio/${f}`);
      expect(res.status(), f).toBe(200);
      expect(res.headers()['content-type'], f).toBe('audio/mpeg');
    }
  });

  test('the voice line plays when the operator moves to a spoken step', async ({ browser }) => {
    const ctx = await browser.newContext(projector);
    const page = await ctx.newPage();
    await openDemo(page, 'projector');
    await page.keyboard.press('ArrowRight');
    // "lyd" = the file played; "tekst" would mean caption only (a missing file or a blocked play).
    await expect(page.getByTestId('director-audio')).toHaveText('lyd', { timeout: 10_000 });
    await page.keyboard.press('m');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await expect(page.getByTestId('director-step')).toHaveText('PACK-03');
    await expect(page.getByTestId('director-audio')).toHaveText('tekst');
    await ctx.close();
  });
});
