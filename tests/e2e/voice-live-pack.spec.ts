import { expect, test } from '@playwright/test';
import { t } from '../../lib/i18n/strings';
import { login, sql } from './helpers';

// The packing coach over real WebRTC: Chrome's fake microphone plays
// tests/e2e/fixtures/packer-nb.wav (a Norwegian packer, `pnpm tsx scripts/make-voice-fixture.ts pack`)
// and its fake camera feeds the box photo; vision is mocked (VISION_MOCK=fixtures).
// Opt-in because it uses ElevenLabs credits and depends on model timing: E2E_VOICE=1.
test.skip(process.env.E2E_VOICE !== '1', 'set E2E_VOICE=1 (uses ElevenLabs credits)');
test.use({
  permissions: ['microphone', 'camera'],
  launchOptions: {
    args: [
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      `--use-file-for-fake-audio-capture=${process.cwd()}/tests/e2e/fixtures/packer-nb.wav%noloop`,
      '--autoplay-policy=no-user-gesture-required',
    ],
  },
});

test('the packing coach greets in Polish, switches to Norwegian and checks the box it was asked to', async ({ page }) => {
  test.setTimeout(150_000);
  await page.addInitScript(() => localStorage.setItem('sp_voice_hands_free', '1'));
  await login(page, 'packer');
  await page.getByRole('button', { name: 'device-01' }).click();
  await expect(page).toHaveURL(/\/pack$/);
  await page.goto('/pack/2407');

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
  // First message in the packer's profile language (Polish).
  await expect(page.getByTestId('captions')).toContainText('Zamówienie 2407', { timeout: 15_000 });

  // The packer speaks Norwegian: the coach switches and the screen follows.
  await expect(page.getByTestId('voice-lang')).toHaveValue('nb', { timeout: 45_000 });

  // "Sjekk esken" → check_box through the fake camera; the mock sees the cap: one of one.
  await expect(page.getByTestId('verdict')).toHaveAttribute('data-status', 'VERIFIED', { timeout: 60_000 });
  await expect(page.getByTestId('verdict')).toContainText(`1 ${t('of', 'nb')} 1`);
  const rows = await sql<{ purpose: string }>(
    `select p.purpose from photos p join orders o on o.id = p.entity_id where p.entity_type = 'order' and o.ext_id = '2407'`,
  );
  expect(rows.map((r) => r.purpose)).toContain('pack_check');
  // The coach never seals: the order is still waiting for the worker's tap.
  const [{ status }] = await sql<{ status: string }>(`select status from orders where ext_id = '2407'`);
  expect(status).toBe('picked');
  clearInterval(logger);
});
