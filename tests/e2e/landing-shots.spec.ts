import { mkdirSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { login } from './helpers';
import { next } from './demo-run';

// The landing page's screens (docs/landing-copy.md, section 10): real stations with seed data, at
// a handheld width, in nb and en. Packing and returns come from the stations on the demo adapter
// (/demo?lang=, the same station components, the scripted vision fixtures, no database); the
// team lead's overview is the live /insights page, read only. Off unless LANDING_SHOTS=<dir>;
// scripts/landing-images.mjs crops the PNGs and writes the WebP files in public/landing/.
//
// Run it against a server without the global reset:
//   E2E_BASE_URL=http://localhost:3100 LANDING_SHOTS=<dir> npx playwright test landing-shots

const dir = process.env.LANDING_SHOTS;
test.skip(!dir, 'set LANDING_SHOTS=<dir> to capture the landing page screens');

const handheld = { viewport: { width: 412, height: 2400 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };

/** The station itself (no stage chrome around it), the whole height. */
async function station(page: Page, name: string) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(600); // images on the photo stage, the scroll into view
  const el = page.locator('.sp-handheld [data-pack-status], .sp-handheld [data-phase]').first();
  await el.screenshot({ path: `${dir}/${name}.png`, animations: 'disabled' });
}

for (const lang of ['nb', 'en'] as const) {
  test.describe(`stations, ${lang}`, () => {
    test.use(handheld);

    test(`packing and returns screens, ${lang}`, async ({ page }) => {
      mkdirSync(`${dir}/${lang}`, { recursive: true });
      await page.goto(`/demo?lang=${lang}`);
      await expect(page.getByTestId('mobile-step')).toContainText('START');

      for (const id of ['PACK-01', 'PACK-02', 'PACK-03']) await next(page, 'phone', id);
      await station(page, `${lang}/pack-order`);

      await next(page, 'phone', 'PACK-04');
      await next(page, 'phone', 'PACK-05');
      await expect(page.getByTestId('verdict')).toHaveAttribute('data-status', 'MISMATCH');
      await station(page, `${lang}/hero`);

      await next(page, 'phone', 'PACK-06');
      await next(page, 'phone', 'PACK-07');
      await expect(page.getByTestId('verdict')).toHaveAttribute('data-status', 'VERIFIED');
      await station(page, `${lang}/pack-box`);

      // The stations take taps on /demo too: seal the box for the third packing step.
      await page.getByTestId('seal').click();
      await expect(page.getByTestId('sealed')).toBeVisible();
      await station(page, `${lang}/pack-ok`);

      // Returns: scene 2 from its start.
      await page.getByRole('button', { name: 'Regi' }).click();
      await page.getByRole('button', { name: '2 Retur' }).click();
      await expect(page.getByTestId('mobile-step')).toContainText('RET-01');
      await expect(page.getByTestId('step-running')).toHaveCount(0);
      await page.getByRole('button', { name: 'Regi' }).click();
      await station(page, `${lang}/ret-load`);
      for (const id of ['RET-02', 'RET-03', 'RET-04', 'RET-05']) await next(page, 'phone', id);
      await station(page, `${lang}/ret-photos`);
      for (const id of ['RET-06', 'RET-07']) await next(page, 'phone', id);
      await station(page, `${lang}/ret-decision`);

      // The loop: scene 3, order 2311 with the packing alert.
      await page.getByRole('button', { name: 'Regi' }).click();
      await page.getByRole('button', { name: '3 Løkka lukkes' }).click();
      await expect(page.getByTestId('mobile-step')).toContainText('LOOP-01');
      await expect(page.getByTestId('step-running')).toHaveCount(0);
      await page.getByRole('button', { name: 'Regi' }).click();
      await next(page, 'phone', 'LOOP-02');
      await page.getByRole('tab', { name: /^Håndholdt/ }).click();
      await expect(page.getByTestId('alert-banner')).toBeVisible();
      await station(page, `${lang}/loop-alert`);
    });
  });
}

test.describe('team lead', () => {
  test.use({ viewport: { width: 1000, height: 700 }, deviceScaleFactor: 1.6, isMobile: false, hasTouch: false });

  test('the overview of mix-ups (Norwegian only, like the lead screens)', async ({ page }) => {
    await login(page, 'lead');
    await page.goto('/insights?range=30d');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(800);
    // Only the mix-up table: the cards above it hold seed amounts, which the page must not show as results.
    await page.locator('.sp-card', { hasText: 'Forvekslinger per SKU-par' }).screenshot({ path: `${dir}/lead-insights.png` });
  });
});

