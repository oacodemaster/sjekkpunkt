import { expect, test } from '@playwright/test';
import { DEMO_SCRIPT } from '../../lib/demo/script';
import { next, openDemo, runScript } from './demo-run';

// The scripted demo, scene 1 (PACK-01..PACK-07), scene 2 (RET-01..RET-11) and scene 3
// (LOOP-01..LOOP-04), driven with the director keys on a 1440x900 projector layout. No login, no
// keys, no database: the demo adapters. tests/e2e/stage.spec.ts runs it after a reset from /admin.

test.use({ viewport: { width: 1440, height: 900 }, isMobile: false, hasTouch: false, deviceScaleFactor: 1 });

test('scenes 1, 2 and 3 run end to end with the director keys, back, scene jumps and reset', async ({ page }) => {
  test.skip(process.env.NEXT_PUBLIC_DEMO_ENABLED !== 'true', 'demo disabled');
  await openDemo(page, 'projector');
  await runScript(page, 'projector');
  const record = page.getByTestId('return-record');

  // Back one step replays deterministically; R resets to seed and the run works again.
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByTestId('director-step')).toHaveText('LOOP-03');
  await expect(page.getByTestId('verdict')).toHaveAttribute('data-status', 'VERIFIED');
  await expect(record).toContainText('C-14-2');

  // 2 jumps to the start of the returns scene, 3 to the loop (replayed from seed both ways).
  await page.keyboard.press('2');
  await expect(page.getByTestId('director-step')).toHaveText('RET-01');
  await expect(page.getByTestId('station-return')).toHaveAttribute('aria-current', 'true');
  await expect(record).not.toContainText('C-14-2');
  await page.keyboard.press('3');
  await expect(page.getByTestId('director-step')).toHaveText('LOOP-01');
  await expect(page.getByTestId('insights')).toContainText('Pakkevarsel aktivt: etikettfoto kreves');

  await page.keyboard.press('r');
  await expect(page.getByTestId('director-step')).toHaveText('START');
  await expect(page.getByTestId('event-log')).not.toContainText('bekreftet');
  await expect(page.getByTestId('event-log')).not.toContainText('2207');
  await next(page, 'projector', 'PACK-01');
  await expect(page.getByTestId('lang-chip')).toHaveText('NB');
  await expect(page.getByTestId('station-pack')).toHaveAttribute('aria-current', 'true');
  await expect(page.getByTestId('insights').locator('li', { hasText: 'Hettegenser' })).toContainText('1');
});

test('the director bar shows progress, the scene and the next line', async ({ page }) => {
  test.skip(process.env.NEXT_PUBLIC_DEMO_ENABLED !== 'true', 'demo disabled');
  await openDemo(page, 'projector');
  const bar = page.getByTestId('director');
  await expect(bar).toContainText(`0/${DEMO_SCRIPT.length}`);
  await expect(bar).toContainText('Neste: PACK-01 · Coach (NB): Hei! Ordre 2207 er klar til pakking.');
  await next(page, 'projector', 'PACK-01');
  await expect(bar).toContainText(`1/${DEMO_SCRIPT.length}`);
  await expect(bar).toContainText('Scene 1 · Pakking');
  await expect(bar).toContainText('Neste: PACK-02 · Medarbeider (PL)');
  // D hides it (the default on stage); the stage keeps working.
  await page.keyboard.press('d');
  await expect(bar).toBeHidden();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByTestId('lang-chip')).toHaveText('PL');
});
