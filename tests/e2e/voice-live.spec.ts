import { expect, test } from '@playwright/test';
import { t } from '../../lib/i18n/strings';
import { login, sql } from './helpers';

// A real conversation over WebRTC: Chrome's fake microphone plays tests/e2e/fixtures/worker-nb.wav
// (Norwegian worker, from scripts/make-voice-fixture.ts) and its fake camera feeds the photo.
// Opt-in because it uses ElevenLabs credits and depends on model timing: E2E_VOICE=1.
test.skip(process.env.E2E_VOICE !== '1', 'set E2E_VOICE=1 (uses ElevenLabs credits)');
test.use({
  permissions: ['microphone', 'camera'],
  launchOptions: {
    args: [
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      `--use-file-for-fake-audio-capture=${process.cwd()}/tests/e2e/fixtures/worker-nb.wav%noloop`,
      '--autoplay-policy=no-user-gesture-required',
    ],
  },
});

test('the coach switches to the worker’s language, flips the screen and takes the photo it asked for', async ({ page }) => {
  test.setTimeout(150_000);
  await page.addInitScript(() => localStorage.setItem('sp_voice_hands_free', '1'));
  await login(page, 'returns');
  await page.getByRole('button', { name: 'device-03' }).click();
  await expect(page).toHaveURL(/\/return$/);
  await page.goto('/return/1056');

  // Log the conversation as it happens, to read timing problems from the test output.
  const started = Date.now();
  let seen = '';
  const logger = setInterval(async () => {
    const now = await page.getByTestId('captions').innerText().catch(() => '');
    if (now && now !== seen) {
      console.log(`[${((Date.now() - started) / 1000).toFixed(0)}s] ${now.replace(/\n+/g, ' | ')}`);
      seen = now;
    }
  }, 1000);
  test.info().annotations.push({ type: 'cleanup', description: 'caption logger' });
  page.on('close', () => clearInterval(logger));

  await page.getByTestId('voice-start').click();
  await expect(page.getByTestId('voice-dock')).toHaveAttribute('data-voice', 'on', { timeout: 20_000 });
  // First message in the profile language (Ukrainian), with a translation line under it.
  await expect(page.getByTestId('captions')).toContainText('Повернення 1056', { timeout: 15_000 });

  // The worker speaks Norwegian: the agent switches language and the screen follows.
  await expect(page.getByTestId('voice-lang')).toHaveValue('nb', { timeout: 45_000 });
  await expect(page.getByText(t('tapOnlyHint', 'nb'))).toBeHidden();

  // "Ja, jeg er klar. Ta bildet nå." → capture_photo through the fake camera and mocked vision.
  await expect(page.getByText(t('photoOk', 'nb'))).toBeVisible({ timeout: 60_000 });
  const rows = await sql<{ purpose: string }>(
    `select p.purpose from photos p join return_items ri on ri.id = p.entity_id join returns r on r.id = ri.return_id where r.ext_id = '1056'`,
  );
  expect(rows.map((r) => r.purpose)).toContain('front');

  clearInterval(logger);
});

test('push-to-talk: nothing the worker says is heard until the button is held', async ({ page }) => {
  test.setTimeout(150_000);
  await page.addInitScript(() => localStorage.setItem('sp_voice_hands_free', '0'));
  await login(page, 'returns');
  await page.getByRole('button', { name: 'device-03' }).click();
  await expect(page).toHaveURL(/\/return$/);
  await page.goto('/return/1059');

  await page.getByTestId('voice-start').click();
  await expect(page.getByTestId('voice-dock')).toHaveAttribute('data-voice', 'on', { timeout: 20_000 });
  await expect(page.getByTestId('captions')).toContainText('Повернення 1059', { timeout: 15_000 });

  // The fixture's first two Norwegian lines play while the button is up: the mic is muted.
  await page.waitForTimeout(38_000);
  await expect(page.getByTestId('captions')).not.toContainText(/norsk|klar/i);
  await expect(page.getByTestId('voice-lang')).toHaveValue('uk');

  // Hold the button through the third line: now it is heard.
  const ptt = page.getByTestId('push-to-talk');
  await ptt.hover();
  await page.mouse.down();
  await expect(ptt).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('captions')).toContainText(/klar/i, { timeout: 30_000 });
  await page.mouse.up();
});
