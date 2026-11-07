import { expect, test } from '@playwright/test';
import { t } from '../../lib/i18n/strings';
import { login, sql } from './helpers';

// Voice on returns (M3). Voice is optional: these tests check the parts that must hold without
// a microphone (tap-only fallback), the token route's role checks, and server-side note
// translation. The local server runs with TRANSLATE_MOCK=echo, so translations are "[nb] <text>".

const uk = 'uk' as const;
const local = !process.env.E2E_BASE_URL;

test.skip(!!process.env.E2E_BASE_URL && process.env.E2E_RESET_DB !== '1', 'set E2E_RESET_DB=1 to run against a deployment');

test('mic denied leaves tap-only mode with a clear message, and taps still work', async ({ page }) => {
  // No microphone permission granted: getUserMedia is refused.
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      throw new DOMException('denied', 'NotAllowedError');
    };
  });
  await login(page, 'returns');
  await page.getByRole('button', { name: 'device-03' }).click();
  await expect(page).toHaveURL(/\/return$/);
  await page.goto('/return/1050');
  await expect(page.getByText(t('tapOnlyHint', uk))).toBeVisible();
  await page.getByTestId('voice-start').click();
  await expect(page.getByText(t('micDenied', uk))).toBeVisible();
  await expect(page.getByTestId('voice-dock')).toHaveAttribute('data-voice', 'mic_denied');

  // The station still works by taps.
  await page.getByRole('button', { name: t('startInspection', uk) }).click();
  await page.getByRole('button', { name: new RegExp(`^${t('stepFront', uk)}`) }).click();
  await page.getByRole('button', { name: t('takePhoto', uk), exact: true }).click();
  const vision = page.waitForResponse((r) => r.url().endsWith('/api/vision'), { timeout: 20_000 });
  await page.getByTestId('photo-file').setInputFiles('tests/e2e/fixtures/ret-1043-front.jpg');
  expect((await vision).status()).toBe(200);
  await expect(page.getByText(t('photoOk', uk))).toBeVisible();
});

test('voice token: only the station roles get one, with keyterms from the database', async ({ page, browser }) => {
  await login(page, 'returns');
  const ok = await page.request.post('/api/voice/token', { data: { station: 'return' } });
  expect(ok.status()).toBe(200);
  const body = (await ok.json()) as { token: string; keyterms: string[] };
  expect(body.token.length).toBeGreaterThan(20);
  expect(body.keyterms).toContain('C-14-2');
  expect(body.keyterms.length).toBeLessThanOrEqual(50);
  expect(JSON.stringify(body)).not.toContain(process.env.ELEVENLABS_API_KEY!.slice(0, 12));
  expect((await page.request.post('/api/voice/token', { data: { station: 'lead' } })).status()).toBe(403);
  expect((await page.request.post('/api/voice/token', { data: { station: 'nope' } })).status()).toBe(400);

  const packer = await browser.newPage();
  await login(packer, 'packer');
  expect((await packer.request.post('/api/voice/token', { data: { station: 'return' } })).status()).toBe(403);
  await packer.close();

  const anon = await browser.newPage();
  expect((await anon.request.post('/api/voice/token', { data: { station: 'return' } })).status()).toBe(401);
  await anon.close();
});

test('a spoken worker note is stored as spoken, with a Norwegian line from the server', async ({ page }) => {
  test.skip(!local, 'needs the local server with TRANSLATE_MOCK=echo');
  await login(page, 'returns');
  const [{ id }] = await sql<{ id: string }>(
    `select ri.id from return_items ri join returns r on r.id = ri.return_id where r.ext_id = '1053' and ri.item_index = 0`,
  );
  const note = 'Невелика пляма на лівому рукаві';
  const res = await page.request.post(`/api/returns/items/${id}/evaluate`, {
    data: { worker: { stains: 'minor' }, workerNoteOriginal: note, lang: 'uk' },
  });
  expect(res.status()).toBe(200);
  const [row] = await sql<{ worker_note_original: string; worker_note_lang: string; worker_note_nb: string }>(
    `select worker_note_original, worker_note_lang, worker_note_nb from inspections where return_item_id = $1`,
    [id],
  );
  expect(row).toEqual({ worker_note_original: note, worker_note_lang: 'uk', worker_note_nb: `[nb] ${note}` });

  // Captions use the same route; packers get it too (packing captions, M4).
  const tr = await page.request.post('/api/translate', { data: { text: 'Grad A. Hylle C-14-2.', from: 'nb', to: 'en' } });
  expect(await tr.json()).toEqual({ text: '[en] Grad A. Hylle C-14-2.' });
  const same = await page.request.post('/api/translate', { data: { text: 'Grad A.', from: 'nb', to: 'nb' } });
  expect(await same.json()).toEqual({ text: 'Grad A.' });
});

