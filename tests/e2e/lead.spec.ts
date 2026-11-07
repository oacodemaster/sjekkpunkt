import { expect, test } from '@playwright/test';
import { confirmReturn1043, login, resetDb, sql } from './helpers';

// M5: the loop and the lead console, in live mode with mocked vision and silent TTS
// (playwright.config.ts). The spec changes shared rows, so it resets the database before and after.

test.skip(!!process.env.E2E_BASE_URL && process.env.E2E_RESET_DB !== '1', 'set E2E_RESET_DB=1 to run against a deployment');
// The lead console runs on a tablet or desktop.
test.use({ viewport: { width: 1280, height: 900 }, isMobile: false, hasTouch: false, deviceScaleFactor: 1 });
const shots = process.env.LEAD_SHOTS; // set to a folder to save screenshots
test.describe.configure({ mode: 'serial' });
test.beforeAll(resetDb);
test.afterAll(resetDb);

const uid = async (role: string) => (await sql<{ id: string }>(`select id from auth.users where email = $1`, [`${role}@sjekkpunkt.test`]))[0].id;

test('the third mix-up opens a pack alert, and the next packing of that SKU needs its label', async ({ browser }) => {
  const worker = await browser.newPage();
  await confirmReturn1043(worker);
  await worker.close();

  const alerts = await sql<{ sku_a: string; sku_b: string; reason_nb: string; origin: string }>(`select sku_a, sku_b, reason_nb, origin from pack_alerts where active`);
  expect(alerts).toEqual([{ sku_a: 'JK-SHELL-L', sku_b: 'JK-SHELL-M', reason_nb: 'Skalljakke M/L forvekslet 3 ganger siste 7 dager', origin: 'auto' }]);
  const [audit] = await sql<{ summary_nb: string; station: string }>(`select summary_nb, station from audit_events where type = 'PACK_ALERT_CREATED'`);
  expect(audit).toEqual({ summary_nb: 'Pakkevarsel: Skalljakke M/L forvekslet 3 ganger siste 7 dager', station: 'system' });

  // Alert enforcement at packing (P4): order 2311 is the L jacket.
  const packer = await browser.newPage();
  await login(packer, 'packer');
  await packer.getByRole('button', { name: 'device-07' }).click();
  await packer.waitForURL(/\/pack$/);
  await packer.goto('/pack/2311');
  await expect(packer.getByTestId('alert-banner')).toBeVisible();
  await packer.close();
});

test('roles: only leads may use the lead routes', async ({ browser }) => {
  for (const role of ['packer', 'returns']) {
    const p = await browser.newPage();
    await login(p, role);
    expect((await p.request.get('/api/lead/escalations')).status()).toBe(403);
    expect((await p.request.post(`/api/lead/escalations/${crypto.randomUUID()}/resolve`, { data: { action: 'approve' } })).status()).toBe(403);
    expect((await p.request.post(`/api/lead/stock-adjustments/${crypto.randomUUID()}/decide`, { data: { decision: 'approve' } })).status()).toBe(403);
    expect((await p.request.post('/api/lead/alerts', { data: { skuA: 'HD-NAVY-M', skuB: 'HD-BLACK-M' } })).status()).toBe(403);
    expect((await p.request.post('/api/tts/summary', { data: { escalationId: crypto.randomUUID() } })).status()).toBe(403);
    await p.close();
  }
});

test('the lead resolves escalations, approves stock corrections and manages alerts; every action is audited', async ({ page, browser }) => {
  const leadId = await uid('lead');
  const [item] = await sql<{ id: string }>(`select ri.id from return_items ri join returns r on r.id = ri.return_id where r.ext_id = '1043'`);
  // A second open case on the same item, to check the refund cap through the API.
  await sql(
    `insert into escalations (warehouse_id, entity_type, entity_id, reason, summary_nb)
     select warehouse_id, 'return_item', id, 'worker_request', 'Retur 1043: testsak.' from return_items where id = $1`,
    [item.id],
  );

  await login(page, 'lead');
  await expect(page).toHaveURL(/\/lead$/);
  await expect(page.getByTestId('stat-open')).toHaveText('2');
  await expect(page.getByTestId('stat-adjustments')).toHaveText('2');
  await expect(page.getByTestId('stat-alerts')).toHaveText('1');
  await expect(page.getByTestId('feed-state')).toHaveAttribute('data-state', 'live', { timeout: 15_000 });

  if (shots) await page.screenshot({ path: `${shots}/lead-console.png`, fullPage: true });
  const card = page.locator('[data-testid=escalation-card][data-reason=suspicious_note]');
  await expect(card).toContainText('Kundens lapp ber om 5000 kroner');
  await expect(card).toContainText('Inneholder instruksjoner, lest som tekst');
  await expect(card.getByTestId('card-decision')).toContainText('C-14-2');
  await expect(card.locator('img')).toHaveCount(4); // front, label, note + packing evidence

  // Spoken summary: generated once, then served from the cache.
  const first = page.waitForResponse((r) => r.url().endsWith('/api/tts/summary'));
  await card.getByTestId('play-summary').click();
  expect(await (await first).json()).toMatchObject({ cached: false });
  const [{ summary_audio_path }] = await sql<{ summary_audio_path: string }>(`select summary_audio_path from escalations where reason = 'suspicious_note'`);
  expect(summary_audio_path).toMatch(/^summaries\/.+\.mp3$/);
  const [esc] = await sql<{ id: string }>(`select id from escalations where reason = 'suspicious_note'`);
  expect(await (await page.request.post('/api/tts/summary', { data: { escalationId: esc.id } })).json()).toMatchObject({ cached: true });

  // R15 through the API: a reason is required, client fields are dropped, the refund is capped.
  const [extra] = await sql<{ id: string }>(`select id from escalations where reason = 'worker_request'`);
  const noReason = await page.request.post(`/api/lead/escalations/${extra.id}/resolve`, { data: { action: 'override', refundNok: 1000 } });
  expect(noReason.status()).toBe(422);
  expect(await noReason.json()).toMatchObject({ error: 'reason_required' });
  const capped = await page.request.post(`/api/lead/escalations/${extra.id}/resolve`, {
    data: { action: 'override', refundNok: 5000, reason: 'Kunden ringte', decided_by: 'someone-else', is_override: false },
  });
  expect(capped.status()).toBe(200);
  const [c] = await sql<{ refund_nok: number; is_override: boolean; decided_by: string; override_reason: string }>(
    `select refund_nok, is_override, decided_by, override_reason from decisions where return_item_id = $1 order by decided_at desc limit 1`,
    [item.id],
  );
  expect(c).toEqual({ refund_nok: 1499, is_override: true, decided_by: leadId, override_reason: 'Kunden ringte' });
  expect((await page.request.post(`/api/lead/escalations/${extra.id}/resolve`, { data: { action: 'approve' } })).status()).toBe(409);

  // Override in the UI: grade B, the shelf follows the grade, 900 kr.
  await page.reload();
  await card.getByRole('button', { name: 'Overstyr' }).click();
  await card.locator('select[name=grade]').selectOption('B');
  await card.locator('input[name=refund]').fill('900');
  await card.locator('input[name=reason]').fill('Merke på ermet');
  if (shots) await card.screenshot({ path: `${shots}/lead-override.png` });
  await card.getByRole('button', { name: 'Lagre overstyring' }).click();
  await expect(page.getByTestId('stat-open')).toHaveText('0');
  const [o] = await sql<{ grade: string; location_code: string; refund_nok: number; is_override: boolean }>(
    `select grade, location_code, refund_nok, is_override from decisions where return_item_id = $1 order by decided_at desc limit 1`,
    [item.id],
  );
  expect(o).toEqual({ grade: 'B', location_code: 'B-OUT-1', refund_nok: 900, is_override: true });
  const [ev] = await sql<{ payload: Record<string, unknown> }>(`select payload from integration_events where type = 'return.item.decided' order by created_at desc limit 1`);
  expect(ev.payload).toMatchObject({ grad: 'B', lokasjon: 'B-OUT-1', refusjonNok: 900, overstyrt: true, besluttetAv: 'teamleder' });

  // The live feed shows events from the stations without a reload: an unknown parcel arrives.
  const worker = await browser.newPage();
  await login(worker, 'returns');
  await worker.getByRole('button', { name: 'device-03' }).click();
  await worker.waitForURL(/\/return$/);
  expect((await worker.request.post('/api/returns/scan', { data: { code: 'PKG-777' } })).status()).toBe(200);
  await worker.close();
  await expect(page.getByTestId('live-feed')).toContainText('Ukjent pakke skannet (PKG-777)', { timeout: 15_000 });
  const parcel = page.locator('[data-testid=escalation-card][data-reason=unknown_return]');
  await expect(parcel).toContainText('Pakke PKG-777', { timeout: 15_000 });
  await parcel.getByRole('button', { name: 'Avvis', exact: true }).click();
  await parcel.locator('input[name=reason]').fill('Ikke vår pakke, sendt tilbake');
  await parcel.getByRole('button', { name: 'Avvis', exact: true }).last().click();
  await expect(page.getByTestId('stat-open')).toHaveText('0');

  // Stock corrections: approve one, reject the other.
  const adjustments = page.getByTestId('stock-adjustment');
  await adjustments.filter({ hasText: '+1' }).getByRole('button', { name: 'Godkjenn' }).click();
  await expect(page.getByTestId('stat-adjustments')).toHaveText('1');
  await adjustments.getByRole('button', { name: 'Avvis' }).click();
  await expect(page.getByTestId('stat-adjustments')).toHaveText('0');
  const stock = await sql<{ sku: string; status: string; decided_by: string }>(`select sku, status, decided_by from stock_adjustments order by sku`);
  expect(stock).toEqual([
    { sku: 'JK-SHELL-L', status: 'approved', decided_by: leadId },
    { sku: 'JK-SHELL-M', status: 'rejected', decided_by: leadId },
  ]);
  const approvedEvents = await sql<{ payload: { sku: string; endring: number } }>(`select payload from integration_events where type = 'stock.adjustment.approved'`);
  expect(approvedEvents.map((e) => [e.payload.sku, e.payload.endring])).toEqual([['JK-SHELL-L', 1]]);

  // Alerts: clear the automatic one, create a manual one for the hoodies.
  await page.getByTestId('pack-alert').filter({ hasText: 'Skalljakke M/L' }).getByRole('button', { name: 'Fjern' }).click();
  await expect(page.getByTestId('stat-alerts')).toHaveText('0');
  await page.getByLabel('Vare 1').selectOption('HD-NAVY-M');
  await page.getByLabel('Vare 2').selectOption('HD-BLACK-M');
  await page.getByRole('button', { name: 'Opprett varsel' }).click();
  await expect(page.getByTestId('pack-alert')).toContainText('Hettegenser sort/marineblå');
  expect((await page.request.post('/api/lead/alerts', { data: { skuA: 'HD-BLACK-M', skuB: 'HD-NAVY-M' } })).status()).toBe(409);
  const alertRows = await sql<{ sku_a: string; active: boolean; origin: string; cleared_by: string | null }>(`select sku_a, active, origin, cleared_by from pack_alerts order by created_at`);
  expect(alertRows).toEqual([
    { sku_a: 'JK-SHELL-L', active: false, origin: 'auto', cleared_by: leadId },
    { sku_a: 'HD-BLACK-M', active: true, origin: 'manual', cleared_by: null },
  ]);

  if (shots) await page.screenshot({ path: `${shots}/lead-after.png`, fullPage: true });
  // Every lead action is in the audit log, with the lead as actor.
  const audit = await sql<{ type: string; actor_user: string | null }>(`select type, actor_user from audit_events where station = 'lead' order by at`);
  expect(audit.map((a) => a.type)).toEqual([
    'ESCALATION_OVERRIDDEN',
    'ESCALATION_OVERRIDDEN',
    'ESCALATION_REJECTED',
    'STOCK_ADJUSTMENT_APPROVED',
    'STOCK_ADJUSTMENT_REJECTED',
    'PACK_ALERT_CLEARED',
    'PACK_ALERT_CREATED',
  ]);
  expect(audit.every((a) => a.actor_user === leadId)).toBe(true);

  // The manual alert is enforced at packing like an automatic one: 2207 has the navy hoodie.
  const packer = await browser.newPage();
  await login(packer, 'packer');
  await packer.getByRole('button', { name: 'device-07' }).click();
  await packer.waitForURL(/\/pack$/);
  await packer.goto('/pack/2207');
  await expect(packer.getByTestId('alert-banner')).toBeVisible();
  await packer.close();
});
