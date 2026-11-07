import { expect, test, type Page } from '@playwright/test';
import pg from 'pg';
import { t } from '../../lib/i18n/strings';

// Live-mode return with mocked vision (addendum section 11). The local server runs with
// VISION_MOCK=fixtures (see playwright.config.ts), so the vision route answers from the
// demo fixtures and everything else is real: storage, API routes, engine rerun, SQL commit.
// The database is reset to seed first (tests/e2e/global-setup.ts).

const uk = 'uk' as const;
const pw = (role: string) => process.env[`SEED_PASSWORD_${role.toUpperCase()}`]!;
const fixture = (name: string) => `tests/e2e/fixtures/${name}.jpg`;

async function sql<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> {
  const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  try {
    return (await c.query(text, params)).rows as T[];
  } finally {
    await c.end();
  }
}

async function login(page: Page, role: string) {
  await page.goto('/login');
  await page.getByLabel(/E-post/).fill(`${role}@sjekkpunkt.test`);
  await page.getByLabel(/Passord/).fill(pw(role));
  await page.getByRole('button', { name: 'Logg inn' }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'));
}

async function photo(page: Page, step: string, file: string) {
  await page.getByRole('button', { name: new RegExp(`^${step}`) }).click();
  const take = page.getByRole('button', { name: t('takePhoto', uk), exact: true });
  await take.click();
  const vision = page.waitForResponse((r) => r.url().endsWith('/api/vision'), { timeout: 20_000 });
  await page.getByTestId('photo-file').setInputFiles(fixture(file));
  await vision;
  await expect(page.getByText(t('checking', uk))).toBeHidden();
}

// Against a deployment it uses real vision and needs the explicit reset opt-in.
test.skip(!!process.env.E2E_BASE_URL && process.env.E2E_RESET_DB !== '1', 'set E2E_RESET_DB=1 to run against a deployment');

test('return 1043 end to end: photos, preview, server confirm ignoring client fields, Holio record', async ({ page, browser }) => {
  await login(page, 'returns');
  await page.getByRole('button', { name: 'device-03' }).click();
  await expect(page).toHaveURL(/\/return$/);

  // Scan by number (R1)
  await page.getByPlaceholder(t('returnNumber', uk)).fill('RET-1043');
  await page.getByRole('button', { name: t('open', uk) }).click();
  await expect(page).toHaveURL(/\/return\/1043$/);
  await expect(page.getByText(t('evidenceManual', uk))).toBeVisible();
  await page.getByRole('button', { name: t('startInspection', uk) }).click();

  // Guided photos: front, label, customer note
  await photo(page, t('stepFront', uk), 'ret-1043-front');
  await photo(page, t('stepLabel', uk), 'ret-1043-label');
  await expect(page.getByText(`${t('size', uk)}: M`)).toBeVisible();
  await photo(page, t('stepNote', uk), 'ret-1043-note');

  // Findings: wrong item, likely packing error
  await page.getByRole('button', { name: t('next', uk), exact: true }).click();
  await expect(page.getByText(t('wrongItemDelivered', uk))).toBeVisible();
  await expect(page.getByText(t('causeWarehouse', uk))).toBeVisible();
  await page.getByRole('button', { name: t('next', uk), exact: true }).click();

  // Decision preview: A, C-14-2, 1 499 kr, stock correction, suspicious note
  await expect(page.getByTestId('grade')).toHaveText('A');
  await expect(page.getByTestId('shelf')).toHaveText('C-14-2');
  await expect(page.getByTestId('refund')).toHaveText('1 499 kr');
  await expect(page.getByText(t('suspiciousNote', uk))).toBeVisible();

  // Tamper with the confirm request: the server must ignore every decision field (R16).
  await page.route('**/api/returns/items/*/confirm', (route) =>
    route.continue({ postData: JSON.stringify({ refund_nok: 5000, refundNok: 5000, grade: 'D', locationCode: 'X-KASS' }) }),
  );
  await page.getByRole('button', { name: t('confirmReturn', uk) }).click();
  await expect(page.getByRole('heading', { name: t('returnConfirmed', uk) })).toBeVisible();

  const [d] = await sql<{ grade: string; location_code: string; refund_nok: number; cause: string; flags: string[]; engine_version: string; decided_by: string | null }>(
    `select d.grade, d.location_code, d.refund_nok, d.cause, d.flags, d.engine_version, d.decided_by
       from decisions d join return_items ri on ri.id = d.return_item_id join returns r on r.id = ri.return_id
      where r.ext_id = '1043'`,
  );
  expect(d).toMatchObject({ grade: 'A', location_code: 'C-14-2', refund_nok: 1499, cause: 'likely_warehouse_error', decided_by: null });
  expect(d.flags.sort()).toEqual(['suspicious_note', 'wrong_item']);
  expect(d.engine_version).toBe('1.1.0');

  const stock = await sql<{ sku: string; delta: number; status: string }>(
    `select sku, delta, status from stock_adjustments where source_type = 'return_item' order by delta desc`,
  );
  expect(stock).toEqual([
    { sku: 'JK-SHELL-L', delta: 1, status: 'proposed' },
    { sku: 'JK-SHELL-M', delta: -1, status: 'proposed' },
  ]);
  const esc = await sql<{ reason: string; summary_nb: string }>(`select reason, summary_nb from escalations where reason = 'suspicious_note'`);
  expect(esc).toHaveLength(1);
  expect(esc[0].summary_nb).toContain('5000 kroner');
  const [{ n }] = await sql<{ n: number }>(`select count(*)::int as n from confusion_events where sku_a = 'JK-SHELL-L' and sku_b = 'JK-SHELL-M'`);
  expect(n).toBe(3);
  const types = (await sql<{ type: string }>(`select type from integration_events where type like 'return.%' order by created_at`)).map((r) => r.type);
  expect(types).toEqual(['return.item.decided', 'return.confirmed']);
  const [{ status }] = await sql<{ status: string }>(`select status from returns where ext_id = '1043'`);
  expect(status).toBe('confirmed');

  // A second confirm is refused.
  const item = await sql<{ id: string }>(`select ri.id from return_items ri join returns r on r.id = ri.return_id where r.ext_id = '1043'`);
  const again = await page.request.post(`/api/returns/items/${item[0].id}/confirm`, { data: {} });
  expect(again.status()).toBe(409);

  // The lead sees the record in the Holio mock.
  const lead = await browser.newPage();
  await login(lead, 'lead');
  await lead.goto('/holio/returns/1043');
  await expect(lead.getByText('Bekreftet', { exact: true })).toBeVisible();
  await expect(lead.getByText('C-14-2', { exact: true })).toBeVisible();
  await expect(lead.getByText('Mistenkelig kundelapp')).toBeVisible();
  await expect(lead.getByText('Sannsynlig pakkefeil')).toBeVisible();
  await expect(lead.getByText('return.confirmed', { exact: false }).first()).toBeVisible();
  await lead.close();
});

test('an unknown parcel becomes an escalation and a packer cannot use the returns API', async ({ page }) => {
  await login(page, 'returns');
  await page.getByRole('button', { name: 'device-03' }).click();
  await page.getByPlaceholder(t('returnNumber', uk)).fill('9999');
  await page.getByRole('button', { name: t('open', uk) }).click();
  await expect(page.getByText(t('unknownParcel', uk))).toBeVisible();
  const [{ n }] = await sql<{ n: number }>(`select count(*)::int as n from escalations where reason = 'unknown_return' and status = 'open'`);
  expect(n).toBeGreaterThanOrEqual(1);

  const packer = await page.context().browser()!.newPage();
  await login(packer, 'packer');
  const scan = await packer.request.post('/api/returns/scan', { data: { code: '1043' } });
  expect(scan.status()).toBe(403);
  const vision = await packer.request.post('/api/vision', { data: { photoId: crypto.randomUUID(), purpose: 'label' } });
  expect(vision.status()).toBe(403);
  await packer.close();
});
