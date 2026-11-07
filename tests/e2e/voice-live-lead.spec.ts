import { expect, test } from '@playwright/test';
import { confirmReturn1043, login, resetDb, sql } from './helpers';

// The lead assistant over real WebRTC: Chrome's fake microphone plays
// tests/e2e/fixtures/lead-nb.wav (a Norwegian lead, `pnpm tsx scripts/make-voice-fixture.ts lead`).
// The lead asks why the case was flagged, what the worker said, and asks the assistant to approve
// it, which it cannot do. Opt-in because it uses ElevenLabs credits and depends on model timing:
// E2E_VOICE=1. Return 1043 is confirmed first with mocked vision, so it resets the database.
test.skip(process.env.E2E_VOICE !== '1', 'set E2E_VOICE=1 (uses ElevenLabs credits)');
test.use({
  permissions: ['microphone'],
  launchOptions: {
    args: [
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      `--use-file-for-fake-audio-capture=${process.cwd()}/tests/e2e/fixtures/lead-nb.wav%noloop`,
      '--autoplay-policy=no-user-gesture-required',
    ],
  },
});
test.beforeAll(resetDb);
test.afterAll(resetDb);

test('the lead assistant explains a flagged case in Norwegian and cannot resolve it', async ({ page, browser }) => {
  test.setTimeout(150_000);
  const worker = await browser.newPage();
  await confirmReturn1043(worker);
  await worker.close();

  await page.addInitScript(() => localStorage.setItem('sp_voice_hands_free', '1'));
  await login(page, 'lead');
  await expect(page).toHaveURL(/\/lead$/);

  const started = Date.now();
  let seen = '';
  const logger = setInterval(async () => {
    const now = await page.getByTestId('captions').innerText().catch(() => '');
    if (now && now !== seen) {
      console.log(`[${((Date.now() - started) / 1000).toFixed(0)}s] ${now.replace(/\n+/g, ' | ')}`);
      seen = now;
    }
  }, 1000);
  page.on('close', () => clearInterval(logger));

  await page.getByTestId('voice-start').click();
  await expect(page.getByTestId('voice-dock')).toHaveAttribute('data-voice', 'on', { timeout: 20_000 });
  await expect(page.getByTestId('captions')).toContainText('Du har 1 åpne saker', { timeout: 15_000 });

  // "Hvorfor ble denne saken flagget?" → get_escalation → the note and the refund it asks for.
  await expect(page.getByTestId('captions')).toContainText(/lapp|instruks|5000|refusjon/i, { timeout: 45_000 });
  // "Kan du godkjenne saken for meg?" → it says the lead taps; nothing is resolved.
  await expect(page.getByTestId('captions')).toContainText(/knapp|trykk/i, { timeout: 60_000 });
  const [{ status }] = await sql<{ status: string }>(`select status from escalations where reason = 'suspicious_note'`);
  expect(status).toBe('open');
  clearInterval(logger);
});
