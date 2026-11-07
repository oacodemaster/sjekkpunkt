import { expect, test } from '@playwright/test';
import { t } from '../../lib/i18n/strings';
import { login, resetDb } from './helpers';

// The packing coach answers a check the worker made by tapping, without being spoken to: the
// tapped photo result is a turn it answers (brief PACK-05), not silent context. Real WebRTC, the
// talk button stays up (push-to-talk), so the coach hears nothing from the worker; vision is mocked
// (the first check of 2207 shows the black hoodie). Opt-in: E2E_VOICE=1 (uses ElevenLabs credits).
test.skip(process.env.E2E_VOICE !== '1', 'set E2E_VOICE=1 (uses ElevenLabs credits)');
test.skip(!!process.env.E2E_BASE_URL, 'needs mocked vision (local server)');
test.use({
  permissions: ['microphone', 'camera'],
  launchOptions: { args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] },
});
test.afterAll(resetDb);

const pl = 'pl' as const;

test('a tapped check gets a spoken answer from the coach', async ({ page }) => {
  test.setTimeout(120_000);
  await resetDb();
  await login(page, 'packer');
  await page.getByRole('button', { name: 'device-01' }).click();
  await expect(page).toHaveURL(/\/pack$/);
  await page.goto('/pack/2207');

  const agentLines = page.locator('[data-testid=captions] li[data-role=agent]');
  const workerLines = page.locator('[data-testid=captions] li[data-role=worker]');
  await page.getByTestId('voice-start').click();
  await expect(page.getByTestId('voice-dock')).toHaveAttribute('data-voice', 'on', { timeout: 20_000 });
  await expect(page.getByTestId('captions')).toContainText('2207', { timeout: 15_000 });
  // Let the greeting finish, then count what the coach has said so far.
  await page.waitForTimeout(6_000);
  const lastAgent = async () => (await agentLines.last().innerText().catch(() => '')).split('\n')[0];
  const before = await lastAgent();

  await page.getByRole('button', { name: t('check', pl), exact: true }).click();
  const vision = page.waitForResponse((r) => r.url().endsWith('/api/vision'), { timeout: 20_000 });
  await page.getByTestId('photo-file').setInputFiles('tests/e2e/fixtures/ret-1043-front.jpg');
  expect((await vision).status()).toBe(200);
  await expect(page.getByTestId('verdict')).toHaveAttribute('data-status', 'MISMATCH');

  // The coach speaks up about the result on its own.
  await expect.poll(lastAgent, { timeout: 30_000 }).not.toBe(before);
  const said = await lastAgent();
  console.log(`coach after the tap: ${said}`);
  expect(said).not.toMatch(/\[screen\]/);
  // Nothing came from the worker: the [screen] turn is never shown as a worker line.
  expect(await workerLines.count()).toBe(0);
});
