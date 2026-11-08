import { expect, test } from '@playwright/test';

// The practice demo's coach over real WebRTC, with no login: Chrome's fake microphone plays
// tests/e2e/fixtures/packer-nb.wav (a Norwegian packer: "what should I pack?", then "check the
// box"). The box on screen holds a black hoodie where the order says navy, so the coach must run
// check_box on the on-screen box and the screen must show the mismatch.
// Opt-in because it uses ElevenLabs credits and depends on model timing: E2E_VOICE=1.
test.skip(process.env.E2E_VOICE !== '1', 'set E2E_VOICE=1 (uses ElevenLabs credits)');
test.use({
  locale: 'en-GB',
  permissions: ['microphone'],
  launchOptions: {
    args: [
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      `--use-file-for-fake-audio-capture=${process.cwd()}/tests/e2e/fixtures/packer-nb.wav%noloop`,
      '--autoplay-policy=no-user-gesture-required',
    ],
  },
});

test('a visitor talks to the practice coach, which checks the on-screen box and reports the wrong item', async ({ page }) => {
  test.setTimeout(150_000);
  await page.addInitScript(() => localStorage.setItem('sp_voice_hands_free', '1'));
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (e) => console.error(`CSP violation: ${e.violatedDirective} ${e.blockedURI}`));
  });
  const violations: string[] = [];
  page.on('console', (m) => /CSP violation|Content Security Policy/.test(m.text()) && violations.push(m.text()));

  await page.goto('/play?lang=en');
  await page.locator('[data-testid=parcel][data-order="4102"]').click();
  await page.locator('[data-testid=shelf-item][data-sku="HD-BLACK-M"]').click();
  await page.locator('[data-testid=shelf-item][data-sku="SK-WOOL-40"]').click();

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
  await expect(page.getByTestId('captions')).toContainText('Order 4102', { timeout: 15_000 });
  // The visitor speaks Norwegian: the coach switches and the screen follows.
  await expect(page.getByTestId('voice-lang')).toHaveValue('nb', { timeout: 45_000 });
  // "Sjekk esken" → check_box on the on-screen box: the black hoodie is stopped.
  await expect(page.getByTestId('play-bench')).toHaveAttribute('data-status', 'MISMATCH', { timeout: 60_000 });
  await expect(page.locator('[data-testid=box-unit][data-sku="HD-BLACK-M"]')).toHaveAttribute('data-tone', 'bad');
  // The coach says so (any agent line after the check).
  const before = (await page.getByTestId('captions').innerText()).length;
  await expect.poll(async () => (await page.getByTestId('captions').innerText()).length, { timeout: 20_000 }).toBeGreaterThan(before);
  expect(violations).toEqual([]);
  clearInterval(logger);
});
