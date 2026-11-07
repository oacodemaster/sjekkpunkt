import { expect, test, type Page } from '@playwright/test';
import { t } from '../../lib/i18n/strings';
import { login, sql } from './helpers';

// Live-mode packing with mocked vision (addendum section 11). The local server runs with
// VISION_MOCK=fixtures: order 2207's first overview photo has the black hoodie and later ones the
// right box; order 2311's jacket shows no size. Everything else is real: storage, API routes,
// engine rerun on seal, SQL commit. The packer test user speaks Polish.

const pl = 'pl' as const;
const PHOTO = 'tests/e2e/fixtures/ret-1043-front.jpg'; // any JPEG: the mock answers by order

test.skip(!!process.env.E2E_BASE_URL, 'needs the local server with VISION_MOCK=fixtures');

const shots = process.env.PACK_SHOTS; // set to a folder to save a full-page screenshot at key states
async function shot(page: Page, name: string) {
  if (shots) await page.screenshot({ path: `${shots}/${name}.png`, fullPage: true });
}

async function asPacker(page: Page) {
  await login(page, 'packer');
  await page.getByRole('button', { name: 'device-01' }).click();
  await expect(page).toHaveURL(/\/pack$/);
}

/** The station's camera opens on the button; headless Chrome has no camera, so the file input takes the photo. */
async function photo(page: Page, button: string) {
  await page.getByRole('button', { name: button, exact: true }).click();
  const vision = page.waitForResponse((r) => r.url().endsWith('/api/vision'), { timeout: 20_000 });
  await page.getByTestId('photo-file').setInputFiles(PHOTO);
  expect((await vision).status()).toBe(200);
  await expect(page.getByText(t('checking', pl))).toBeHidden();
}

test('order 2207: wrong hoodie caught, right box verified, seal ignores client fields, Holio record', async ({ page, browser }) => {
  await asPacker(page);
  await page.getByRole('link', { name: /#2207/ }).click();
  await expect(page).toHaveURL(/\/pack\/2207$/);
  await expect(page.getByText(t('packStart', pl))).toBeVisible();

  // P1: the black hoodie is a wrong item. Red box, banner, the navy hoodie is missing.
  await photo(page, t('check', pl));
  await expect(page.getByTestId('verdict')).toHaveAttribute('data-status', 'MISMATCH');
  await expect(page.getByTestId('unexpected')).toContainText('Hoodie, black, M');
  await expect(page.locator('[data-testid=pack-line][data-sku=HD-NAVY-M]')).toHaveAttribute('data-state', 'missing');
  await expect(page.locator('[data-testid=pack-photo] [data-tone=bad]')).toHaveCount(1);
  await expect(page.getByTestId('seal')).toHaveCount(0);
  await shot(page, 'pack-2207-mismatch');

  const nearMiss = await sql<{ status: string; method: string }>(
    `select pc.status, pc.method from pack_checks pc join orders o on o.id = pc.order_id where o.ext_id = '2207'`,
  );
  expect(nearMiss).toEqual([{ status: 'MISMATCH', method: 'camera' }]);
  const pairs = await sql<{ sku_a: string; sku_b: string; kind: string }>(`select sku_a, sku_b, kind from confusion_events where source_type = 'order'`);
  expect(pairs).toEqual([{ sku_a: 'HD-BLACK-M', sku_b: 'HD-NAVY-M', kind: 'caught_at_packing' }]);

  // The packer swaps the hoodie: two of two, evidence photo, ready to seal.
  await photo(page, t('checkAgain', pl));
  await expect(page.getByTestId('verdict')).toHaveAttribute('data-status', 'VERIFIED');
  await expect(page.getByTestId('verdict')).toContainText(`2 ${t('of', pl)} 2`);
  await expect(page.getByText(t('evidenceSaved', pl))).toBeVisible();
  await expect(page.getByTestId('retakes')).toContainText('1');
  await shot(page, 'pack-2207-verified');

  // Tamper with the seal request: only manualReason is read, and the engine refuses it here (R16).
  await page.route('**/api/pack/*/seal', (route) =>
    route.continue({ postData: JSON.stringify({ manualReason: 'other', status: 'MANUAL_CONFIRM', method: 'barcode', size_verified: false, confidence: 0.1 }) }),
  );
  await page.getByTestId('seal').click();
  await expect(page.getByRole('heading', { name: t('sealed', pl) })).toBeVisible();

  const [check] = await sql<{ status: string; method: string; size_verified: boolean; manual_reason: string | null; evidence: boolean; engine_version: string }>(
    `select pc.status, pc.method, pc.size_verified, pc.manual_reason, pc.evidence_photo_id is not null as evidence, pc.engine_version
       from pack_checks pc join orders o on o.id = pc.order_id where o.ext_id = '2207' and pc.status <> 'MISMATCH'`,
  );
  expect(check).toEqual({ status: 'VERIFIED', method: 'camera', size_verified: true, manual_reason: null, evidence: true, engine_version: '1.1.0' });
  const [{ status }] = await sql<{ status: string }>(`select status from orders where ext_id = '2207'`);
  expect(status).toBe('packed');
  const audit = await sql<{ type: string; actor_user: string | null; actor_device: string | null }>(
    `select type, actor_user, actor_device from audit_events where station = 'pack' and ref_label = '2207' order by at`,
  );
  expect(audit.map((a) => a.type)).toEqual(['PACK_MISMATCH', 'PACK_VERIFIED']);
  expect(audit[1].actor_user).toBeNull(); // a verified seal is the device's, not the person's
  expect(audit[1].actor_device).not.toBeNull();
  const [ev] = await sql<{ payload: { ordre: string; status: string; pakkebevis: string | null } }>(`select payload from integration_events where type = 'pack.verified'`);
  expect(ev.payload).toMatchObject({ ordre: '2207', status: 'VERIFIED' });
  expect(ev.payload.pakkebevis).toBeTruthy();

  // Sealing twice is refused, and so is another photo.
  const [{ id }] = await sql<{ id: string }>(`select id from orders where ext_id = '2207'`);
  expect((await page.request.post(`/api/pack/${id}/seal`, { data: {} })).status()).toBe(409);
  expect((await page.request.post('/api/photos/upload-url', { data: { purpose: 'pack_check', entityType: 'order', entityId: id } })).status()).toBe(409);

  // The lead sees the packing evidence in the Holio mock.
  const lead = await browser.newPage();
  await login(lead, 'lead');
  await lead.goto('/holio/orders/2207');
  await expect(lead.getByText('Verifisert', { exact: true })).toBeVisible();
  await expect(lead.getByText('Feil stoppet', { exact: true })).toBeVisible();
  await expect(lead.getByText('pack.verified', { exact: false }).first()).toBeVisible();
  await lead.close();
});

test('order 2311: size not read, retakes, wrong barcode, manual confirm with a reason', async ({ page }) => {
  await asPacker(page);
  await page.goto('/pack/2311');

  // P3: a size-variant jacket with no size read needs the label.
  await photo(page, t('check', pl));
  await expect(page.getByTestId('verdict')).toHaveAttribute('data-status', 'NEEDS_LABEL_PHOTO');
  await expect(page.getByText(t('needsLabel', pl))).toBeVisible();
  await expect(page.getByTestId('manual-confirm')).toHaveCount(0);
  await shot(page, 'pack-2311-needs-label');

  // A product that is not in the order, scanned by barcode: a caught wrong item, not counted.
  const [beanie] = await sql<{ barcode: string }>(`select barcode from products where sku = 'CP-BEANIE'`);
  await page.getByRole('button', { name: t('barcode', pl), exact: true }).click();
  await page.getByPlaceholder(t('barcodePlaceholder', pl)).fill(beanie.barcode);
  await page.getByTestId('barcode-scanner').getByRole('button', { name: 'OK', exact: true }).click();
  await expect(page.getByText(t('scanNotInOrder', pl))).toBeVisible();
  const caught = await sql<{ method: string }>(`select pc.method from pack_checks pc join orders o on o.id = pc.order_id where o.ext_id = '2311'`);
  expect(caught).toEqual([{ method: 'barcode' }]);
  await page.getByTestId('barcode-scanner').getByRole('button', { name: t('done', pl), exact: true }).click();

  // P8: after MAX_RETAKES the packer may confirm by hand, with a reason.
  await photo(page, t('checkAgain', pl));
  await photo(page, t('checkAgain', pl));
  await expect(page.getByTestId('retakes')).toContainText('2');
  await page.getByTestId('manual-confirm').getByRole('button', { name: t('reasonGlare', pl) }).click();
  await expect(page.getByTestId('verdict')).toHaveAttribute('data-status', 'MANUAL_CONFIRM');
  await shot(page, 'pack-2311-manual');
  await page.getByTestId('seal').click();
  await expect(page.getByRole('heading', { name: t('sealed', pl) })).toBeVisible();

  const [check] = await sql<{ status: string; method: string; manual_reason: string; size_verified: boolean }>(
    `select pc.status, pc.method, pc.manual_reason, pc.size_verified from pack_checks pc join orders o on o.id = pc.order_id
      where o.ext_id = '2311' and pc.status = 'MANUAL_CONFIRM'`,
  );
  expect(check).toEqual({ status: 'MANUAL_CONFIRM', method: 'manual', manual_reason: 'glare', size_verified: false });
  // A manual confirm records who confirmed (addendum section 4).
  const [a] = await sql<{ actor_user: string | null }>(`select actor_user from audit_events where type = 'PACK_MANUAL_CONFIRM' and ref_label = '2311'`);
  expect(a.actor_user).not.toBeNull();
  const [{ n }] = await sql<{ n: number }>(`select count(*)::int as n from integration_events where type = 'pack.manual_confirm' and payload->>'ordre' = '2311'`);
  expect(n).toBe(1);
});

test('barcodes verify an order without a photo; scans count up to the quantity; roles are enforced', async ({ page, browser }) => {
  await asPacker(page);
  const [order] = await sql<{ id: string; ext_id: string }>(
    `select o.id, o.ext_id from orders o where o.status = 'picked' and o.ext_id not in ('2207', '2311')
      and exists (select 1 from order_lines l where l.order_id = o.id and l.qty = 2) order by o.ext_id limit 1`,
  );
  const lines = await sql<{ sku: string; qty: number; barcode: string }>(
    `select l.sku, l.qty, p.barcode from order_lines l join products p on p.sku = l.sku where l.order_id = $1`,
    [order.id],
  );

  // Not ready before anything is checked.
  expect((await page.request.post(`/api/pack/${order.id}/seal`, { data: {} })).status()).toBe(409);
  // Manual confirm is refused without retakes (P8).
  expect((await page.request.post(`/api/pack/${order.id}/manual`, { data: { reason: 'polybag' } })).status()).toBe(409);

  for (const l of lines) {
    for (let k = 0; k < l.qty; k++) {
      const r = await page.request.post(`/api/pack/${order.id}/barcode`, { data: { code: l.barcode } });
      expect((await r.json()).result).toEqual({ kind: 'counted', sku: l.sku });
    }
  }
  const again = await page.request.post(`/api/pack/${order.id}/barcode`, { data: { code: lines[0].barcode } });
  expect((await again.json()).result).toEqual({ kind: 'already_counted', sku: lines[0].sku });
  const unknown = await page.request.post(`/api/pack/${order.id}/barcode`, { data: { code: '0000000000000' } });
  expect((await unknown.json()).result).toEqual({ kind: 'unknown_code' });

  const check = await (await page.request.post(`/api/pack/${order.id}/check`, { data: {} })).json();
  expect(check.decision).toMatchObject({ status: 'VERIFIED', method: 'barcode', canSeal: true });
  const seal = await page.request.post(`/api/pack/${order.id}/seal`, { data: {} });
  expect(seal.status()).toBe(200);
  expect((await seal.json()).committed).toMatchObject({ status: 'VERIFIED', method: 'barcode', evidencePhotoId: null });

  // A returns worker cannot use the packing routes; a packer cannot upload return photos.
  const returns = await browser.newPage();
  await login(returns, 'returns');
  expect((await returns.request.post(`/api/pack/${order.id}/check`, { data: {} })).status()).toBe(403);
  expect((await returns.request.post('/api/photos/upload-url', { data: { purpose: 'pack_check', entityType: 'order', entityId: order.id } })).status()).toBe(403);
  await returns.close();
  const [item] = await sql<{ id: string }>(`select id from return_items limit 1`);
  expect((await page.request.post('/api/photos/upload-url', { data: { purpose: 'front', entityType: 'return_item', entityId: item.id } })).status()).toBe(403);
});
