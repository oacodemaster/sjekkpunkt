import { expect, test, type Page } from '@playwright/test';
import { login, resetDb, sql } from './helpers';

// M7: admin (settings, products, reference photos, CSV import, grading guide, audit, retention)
// and the worker's first launch (language, privacy information). Resets the data before and after;
// the profile changes are restored in afterAll (the seed does not touch profiles).

test.skip(!!process.env.E2E_BASE_URL && process.env.E2E_RESET_DB !== '1', 'set E2E_RESET_DB=1 to run against a deployment');
const shots = process.env.ADMIN_SHOTS; // set to a folder to save screenshots
test.describe.configure({ mode: 'serial' });
/**
 * The reset keeps the catalogue (admin edits and reference photos survive it, M9), so the product
 * this spec creates is removed by hand, before (a failed earlier run) and after.
 */
async function removeTestProduct() {
  await sql(`delete from photos where entity_type = 'product' and entity_id in (select id from products where sku = 'TS-WHITE-XL')`);
  await sql(`delete from products where sku = 'TS-WHITE-XL'`);
  await sql(`delete from locations l where code = 'E-18-2' and not exists (select 1 from products p where p.location_code = l.code)`);
}
test.beforeAll(async () => {
  await resetDb();
  await removeTestProduct();
});
test.afterAll(async () => {
  await resetDb();
  await removeTestProduct();
  await sql(
    `update profiles p set preferred_lang = 'pl', privacy_info_read_at = coalesce(privacy_info_read_at, now())
       from auth.users u where u.id = p.user_id and u.email = 'packer@sjekkpunkt.test'`,
  );
});

const desk = { viewport: { width: 1280, height: 900 }, isMobile: false, hasTouch: false, deviceScaleFactor: 1 } as const;

test.describe('admin', () => {
  test.use(desk);

  test('roles: only admins use the admin routes; the cron route needs its secret', async ({ browser, request }) => {
    for (const role of ['packer', 'returns', 'lead']) {
      const p = await browser.newPage();
      await login(p, role);
      expect((await p.request.patch('/api/admin/settings', { data: { max_retakes: 3 } })).status(), role).toBe(403);
      expect((await p.request.post('/api/admin/products', { data: {} })).status(), role).toBe(403);
      expect((await p.request.post('/api/admin/import', { data: { kind: 'orders', csv: 'x' } })).status(), role).toBe(403);
      expect((await p.request.post('/api/admin/retention')).status(), role).toBe(403);
      await p.close();
    }
    expect((await request.get('/api/cron/retention')).status()).toBe(401);
    expect((await request.get('/api/cron/retention', { headers: { authorization: 'Bearer wrong' } })).status()).toBe(401);
  });

  test('settings: a change is validated, saved, audited and used (insights cost, languages)', async ({ page }) => {
    await login(page, 'admin');
    expect((await page.request.patch('/api/admin/settings', { data: { pack_confidence_min: 0.1 } })).status()).toBe(400);

    const form = page.getByTestId('settings-form');
    await form.locator('input[name="wrong_parcel_cost_nok"]').fill('500');
    await form.locator('input[name="lang-lt"]').uncheck();
    await form.getByRole('button', { name: 'Lagre innstillinger' }).click();
    await expect(page.getByTestId('settings-status')).toHaveText('Lagret: enabled_languages, wrong_parcel_cost_nok');
    if (shots) await page.screenshot({ path: `${shots}/admin-settings.png`, fullPage: true });

    await page.goto('/insights?range=30d');
    await expect(page.getByTestId('near-misses')).toContainText('Estimat: 4 × 500 kr');
    await page.goto('/privacy');
    await expect(page.getByRole('link', { name: 'Lietuvių' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Polski' })).toBeVisible();

    await page.goto('/admin/audit?type=SETTINGS_UPDATED');
    const row = page.getByTestId('audit-table').locator('tbody tr').first();
    await expect(row).toContainText('Innstillinger endret: enabled_languages, wrong_parcel_cost_nok');
    await expect(row).toContainText('Admin (admin)');
  });

  test('products: create, edit, add and remove a reference photo', async ({ page }) => {
    await login(page, 'admin');
    await page.goto('/admin/products/new');
    const form = page.getByTestId('product-form');
    await form.locator('input[name="sku"]').fill('ts-white-xl'); // upper-cased by the form
    await form.locator('input[name="name_nb"]').fill('T-skjorte, hvit, XL');
    await form.locator('input[name="name_en"]').fill('T-shirt, white, XL');
    await form.locator('input[name="color"]').fill('white');
    await form.locator('input[name="size"]').fill('XL');
    await form.locator('input[name="price_nok"]').fill('199');
    await form.locator('input[name="location_code"]').fill('E-18-2');
    await form.locator('input[name="variant_group"]').fill('tee-white');
    await form.getByRole('button', { name: 'Opprett vare' }).click();
    await page.waitForURL(/\/admin\/products\/TS-WHITE-XL$/);

    await page.getByTestId('product-form').locator('input[name="price_nok"]').fill('229');
    await page.getByRole('button', { name: 'Lagre endringer' }).click();
    await expect(page.getByTestId('product-status')).toHaveText('Lagret.');
    expect(await sql(`select price_nok, location_code from products where sku = 'TS-WHITE-XL'`)).toEqual([{ price_nok: 229, location_code: 'E-18-2' }]);

    // A taken barcode is refused with a clear message.
    const [{ barcode }] = await sql<{ barcode: string }>(`select barcode from products where sku = 'HD-NAVY-M'`);
    await page.getByTestId('product-form').locator('input[name="barcode"]').fill(barcode);
    await page.getByRole('button', { name: 'Lagre endringer' }).click();
    await expect(page.getByTestId('product-status')).toHaveText('Strekkoden brukes av en annen vare.');

    const upload = page.waitForResponse((r) => r.url().includes('/photos') && r.request().method() === 'POST');
    await page.getByTestId('reference-file').setInputFiles('tests/e2e/fixtures/ret-1043-front.jpg');
    expect((await upload).status()).toBe(201);
    await expect(page.getByTestId('reference-photos').getByRole('img')).toHaveCount(1);
    const [stored] = await sql<{ paths: string[] }>(`select reference_photo_paths as paths from products where sku = 'TS-WHITE-XL'`);
    expect(stored.paths).toHaveLength(1);
    if (shots) await page.screenshot({ path: `${shots}/admin-product.png`, fullPage: true });

    await page.getByTestId('reference-photos').getByRole('button', { name: 'Fjern' }).click();
    await expect(page.getByTestId('reference-photos').getByRole('img')).toHaveCount(0);
    expect(await sql(`select reference_photo_paths as paths from products where sku = 'TS-WHITE-XL'`)).toEqual([{ paths: [] }]);
    expect(
      await sql(`select storage_path from photos where purpose = 'reference' and entity_id = (select id from products where sku = 'TS-WHITE-XL')`),
    ).toEqual([{ storage_path: null }]);
  });

  test('CSV import: errors by line and nothing written, then a clean file imports', async ({ page }) => {
    await login(page, 'admin');
    await page.goto('/admin/import');
    await page.locator('select[name="kind"]').selectOption('orders');
    const bad = 'order,customer_ref,sku,qty,price_nok\n3001,Testkunde 3001,HD-NAVY-M,1,599\n3001,Testkunde 3001,NO-SUCH-SKU,1,\n2207,Testkunde X,SK-WOOL-40,0,\n';
    await page.getByTestId('import-file').setInputFiles({ name: 'bad.csv', mimeType: 'text/csv', buffer: Buffer.from(bad) });
    await page.getByRole('button', { name: 'Sjekk filen' }).click();
    await expect(page.getByTestId('import-issues')).toContainText('Linje 4 · qty: For lav eller for kort.');

    const dbBad = bad.replace('2207,Testkunde X,SK-WOOL-40,0,', '2207,Testkunde X,SK-WOOL-40,1,');
    await page.getByTestId('import-file').setInputFiles({ name: 'bad2.csv', mimeType: 'text/csv', buffer: Buffer.from(dbBad) });
    await page.getByRole('button', { name: 'Sjekk filen' }).click();
    await expect(page.getByTestId('import-issues')).toContainText('Linje 3 · sku: Ukjent SKU.');
    await expect(page.getByTestId('import-issues')).toContainText('Linje 4 · order: Ordren finnes allerede.');
    expect(await sql(`select ext_id from orders where ext_id = '3001'`)).toEqual([]);

    const good = 'order;customer_ref;sku;qty;price_nok\n3001;Testkunde 3001;HD-NAVY-M;1;599\n3001;Testkunde 3001;SK-WOOL-40;2;\n3002;Testkunde 3002;JK-SHELL-L;1;1499\n';
    await page.getByTestId('import-file').setInputFiles({ name: 'ordrer.csv', mimeType: 'text/csv', buffer: Buffer.from(good) });
    await page.getByRole('button', { name: 'Sjekk filen' }).click();
    await expect(page.getByTestId('import-ready')).toHaveText('Filen er i orden: 2 ordrer med 3 linjer. Trykk Importer for å lagre.');
    await page.getByRole('button', { name: 'Importer' }).click();
    await expect(page.getByTestId('import-done')).toHaveText('Importert: 2 ordrer med 3 linjer.');
    expect(await sql(`select o.ext_id, count(*)::int as lines from orders o join order_lines l on l.order_id = o.id where o.ext_id in ('3001','3002') group by o.ext_id order by o.ext_id`)).toEqual([
      { ext_id: '3001', lines: 2 },
      { ext_id: '3002', lines: 1 },
    ]);
    await expect(page.getByText('Import: 2 ordrer med 3 linjer')).toBeVisible();
  });

  test('retention: expired photos are deleted on demand and the run is logged', async ({ page }) => {
    await sql(
      `insert into photos (warehouse_id, storage_path, purpose, entity_type, entity_id, expires_at)
       values ('00000000-0000-4000-8000-000000000001', 'e2e/expired.jpg', 'front', 'return_item', gen_random_uuid(), now() - interval '1 hour')`,
    );
    await login(page, 'admin');
    await expect(page.getByTestId('retention')).toContainText('Utløpt, venter på sletting1');
    await page.getByRole('button', { name: 'Slett utløpte bilder nå' }).click();
    await expect(page.getByTestId('retention-status')).toHaveText('1 bilder slettet.');
    expect(await sql(`select storage_path from photos where storage_path = 'e2e/expired.jpg'`)).toEqual([]);
    await expect(page.getByTestId('retention')).toContainText('Sletting: 1 utløpte bilder slettet');
  });

  test('grading guide: saved and pushed to the agents, then restored', async ({ page }) => {
    test.skip(!!process.env.E2E_BASE_URL && process.env.E2E_KB !== '1', 'pushes to the live ElevenLabs knowledge base; set E2E_KB=1');
    await login(page, 'admin');
    await page.goto('/admin/guide');
    const box = page.getByTestId('guide-text');
    const original = await box.inputValue();
    await box.fill(`${original}\n\nTest line from the e2e run.`);
    await page.getByRole('button', { name: 'Lagre og send til assistentene' }).click();
    await expect(page.getByTestId('guide-status')).toHaveText('Lagret og sendt til stemmeassistentene.', { timeout: 20_000 });
    await box.fill(original);
    await page.getByRole('button', { name: 'Lagre og send til assistentene' }).click();
    await expect(page.getByTestId('guide-status')).toHaveText('Lagret og sendt til stemmeassistentene.', { timeout: 20_000 });
    const synced = await sql(`select type from audit_events where type like 'GRADING_GUIDE%' order by at`);
    expect(synced).toEqual([{ type: 'GRADING_GUIDE_SYNCED' }, { type: 'GRADING_GUIDE_SYNCED' }]);
  });
});

async function pickDevice(page: Page) {
  await page.getByRole('button', { name: 'device-07' }).click();
}

test('first launch: language, then the privacy information, then the station', async ({ page }) => {
  await sql(`update profiles p set privacy_info_read_at = null from auth.users u where u.id = p.user_id and u.email = 'packer@sjekkpunkt.test'`);
  await login(page, 'packer');
  await pickDevice(page);
  await page.waitForURL(/\/welcome$/);
  // The settings test turned Lithuanian off: only enabled languages are offered.
  await expect(page.getByTestId('language-picker').getByRole('button')).toHaveCount(5);
  await expect(page.getByRole('button', { name: 'Lietuvių' })).toHaveCount(0);
  await page.getByRole('button', { name: 'English' }).click();

  await page.waitForURL(/\/privacy\?first=1$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('How Sjekkpunkt uses information about you');
  await expect(page.getByTestId('privacy-kept')).toContainText('Photos are deleted automatically after 30 days.');
  await expect(page.getByTestId('privacy-not')).toContainText('No background recording.');
  // A station is not reachable before the information was read.
  await page.goto('/pack');
  await page.waitForURL(/\/welcome$/);
  await page.goto('/privacy?first=1');
  if (shots) await page.screenshot({ path: `${shots}/privacy-first-launch.png`, fullPage: true });
  await page.getByRole('button', { name: 'I have read this' }).click();
  await page.waitForURL(/\/pack$/);
  await expect(page.getByRole('heading', { name: 'Orders to pack' })).toBeVisible();

  const [p] = await sql<{ preferred_lang: string; read: boolean }>(
    `select preferred_lang, privacy_info_read_at is not null as read from profiles p join auth.users u on u.id = p.user_id where u.email = 'packer@sjekkpunkt.test'`,
  );
  expect(p).toEqual({ preferred_lang: 'en', read: true });

  // Reachable from the menu afterwards, with the date it was read.
  await page.getByTestId('privacy-link').click();
  await expect(page.getByText(/^Read \d/)).toBeVisible();
});

test('the public privacy page works in every language without signing in', async ({ page }) => {
  for (const [lang, title] of [
    ['nb', 'Slik bruker Sjekkpunkt opplysninger om deg'],
    ['uk', 'Як Sjekkpunkt використовує інформацію про вас'],
    ['ro', 'Cum folosește Sjekkpunkt informațiile despre tine'],
    ['lt', 'Slik bruker Sjekkpunkt opplysninger om deg'], // turned off in the settings test: falls back to Norwegian
  ]) {
    await page.goto(`/privacy?lang=${lang}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(title);
  }
  await expect(page.getByRole('button', { name: /Jeg har lest|Am citit/ })).toHaveCount(0);
});
