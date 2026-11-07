import { expect, test } from '@playwright/test';
import { confirmReturn1043, login, resetDb } from './helpers';

// M6: insights panels from the anonymous views and the integration events in the Holio mock.
// Reads the seed, then runs return 1043 to see the loop land in both. Resets before and after.

test.skip(!!process.env.E2E_BASE_URL && process.env.E2E_RESET_DB !== '1', 'set E2E_RESET_DB=1 to run against a deployment');
test.use({ viewport: { width: 1280, height: 900 }, isMobile: false, hasTouch: false, deviceScaleFactor: 1 });
const shots = process.env.INSIGHTS_SHOTS; // set to a folder to save screenshots
test.describe.configure({ mode: 'serial' });
test.beforeAll(resetDb);
test.afterAll(resetDb);

test('roles: only leads and admins read insights', async ({ browser }) => {
  for (const role of ['packer', 'returns']) {
    const p = await browser.newPage();
    await login(p, role);
    expect((await p.request.get('/api/insights?range=7d')).status()).toBe(403);
    await p.close();
  }
  const lead = await browser.newPage();
  await login(lead, 'lead');
  expect((await lead.request.get('/api/insights?range=1y')).status()).toBe(400);
  const res = await lead.request.get('/api/insights?range=30d');
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body).toMatchObject({ range: '30d', days: 30, nearMisses: { caught: 4, costPerParcelNok: 340, estimatedSavedNok: 1360 } });
  expect(JSON.stringify(body).toLowerCase()).not.toMatch(/device|actor|user/);
  await lead.close();
});

test('the insights page shows every panel from seed, for 7 and 30 days', async ({ page }) => {
  await login(page, 'lead');
  await page.goto('/insights');
  await expect(page.getByRole('heading', { name: 'Innsikt' })).toBeVisible();
  const shell = page.getByTestId('mixups').getByRole('row').filter({ hasText: 'Skalljakke M/L' });
  await expect(shell.getByRole('cell').nth(1)).toHaveText('2');
  await expect(page.getByTestId('near-misses')).toContainText('Estimat: 1 × 340 kr');
  await expect(page.getByTestId('no-per-worker')).toHaveText('Ingen statistikk per ansatt · No per-employee statistics');

  await page.getByTestId('range').getByRole('link', { name: '30 dager' }).click();
  await expect(page).toHaveURL(/range=30d/);
  await expect(page.getByTestId('near-misses')).toContainText('Estimat: 4 × 340 kr');
  await expect(page.getByTestId('grades').getByRole('listitem')).toHaveCount(4);
  await expect(page.getByTestId('causes')).toContainText('Transportskade');
  await expect(page.getByTestId('reasons-category')).toContainText('Klær');
  await expect(page.getByTestId('reasons-sku').getByRole('row').first()).toBeVisible();
  if (shots) await page.screenshot({ path: `${shots}/insights-30d.png`, fullPage: true });
});

test('the Holio mock lists integration events and filters by type', async ({ page }) => {
  await login(page, 'lead');
  await page.goto('/holio');
  await page.getByRole('link', { name: 'Integrasjonshendelser' }).click();
  await expect(page).toHaveURL(/\/holio\/events$/);
  const list = page.getByTestId('integration-events');
  await expect(list.getByRole('listitem').first()).toBeVisible();
  await page.getByRole('link', { name: 'return.confirmed', exact: true }).click();
  await expect(page).toHaveURL(/type=return\.confirmed/);
  const types = await list.getByRole('listitem').evaluateAll((els) => [...new Set(els.map((e) => e.getAttribute('data-type')))]);
  expect(types).toEqual(['return.confirmed']);
});

test('return 1043 shows up in insights (alert) and as Holio events', async ({ page, browser }) => {
  const worker = await browser.newPage();
  await confirmReturn1043(worker);
  await worker.close();

  await login(page, 'lead');
  await page.goto('/insights');
  const shell = page.getByTestId('mixups').getByRole('row').filter({ hasText: 'Skalljakke M/L' });
  await expect(shell.getByRole('cell').nth(1)).toHaveText('3');
  await expect(shell).toContainText('Pakkevarsel aktivt');
  await expect(page.getByTestId('mixups').getByRole('row').nth(1)).toContainText('Skalljakke M/L'); // alerts sort first
  if (shots) await page.screenshot({ path: `${shots}/insights-after-1043.png`, fullPage: true });

  await page.goto('/holio/events?type=return.item.decided');
  const first = page.getByTestId('integration-events').getByRole('listitem').first();
  await expect(first).toContainText('Retur 1043');
  await first.locator('summary').click();
  await expect(first.locator('pre')).toContainText('"sannsynligAarsak": "likely_warehouse_error"');
  if (shots) await page.screenshot({ path: `${shots}/holio-events.png`, fullPage: true });
});
