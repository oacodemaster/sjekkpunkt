import { expect, test, type Page } from '@playwright/test';

// The scripted demo, scene 1 (PACK-01..PACK-07), scene 2 (RET-01..RET-11) and scene 3
// (LOOP-01..LOOP-04), driven with the director keys on a 1440x900 projector layout. No login, no keys, no database: the demo adapters.

test.use({ viewport: { width: 1440, height: 900 }, isMobile: false, hasTouch: false, deviceScaleFactor: 1 });

const shots = process.env.DEMO_SHOTS; // set to a folder to save a screenshot per step

async function next(page: Page, id: string) {
  await page.keyboard.press('ArrowRight');
  await expect(page.getByTestId('director-step')).toHaveText(id);
  if (shots) {
    await page.waitForTimeout(700); // let smooth scrolling and the caption typewriter settle
    await page.screenshot({ path: `${shots}/${id}.png` });
  }
}

test('scenes 1, 2 and 3 run end to end with the director keys, back, and reset', async ({ page }) => {
  test.skip(process.env.NEXT_PUBLIC_DEMO_ENABLED !== 'true', 'demo disabled');
  await page.goto('/demo');
  await page.keyboard.press('d');
  await expect(page.getByTestId('director-step')).toHaveText('START');

  // Scene 1: packing in Polish. The black hoodie is caught, then the right box verifies.
  await next(page, 'PACK-01');
  await expect(page.getByTestId('station-pack')).toHaveAttribute('aria-current', 'true');
  await expect(page.getByRole('heading', { name: 'Ordre #2207' })).toBeVisible();
  const hoodies = page.getByTestId('insights').locator('li', { hasText: 'Hettegenser' });
  await expect(hoodies).toContainText('1');

  await next(page, 'PACK-02');
  await expect(page.getByTestId('lang-chip')).toHaveText('PL');
  await next(page, 'PACK-03');
  await expect(page.getByRole('button', { name: 'Sprawdź', exact: true })).toBeVisible();

  await next(page, 'PACK-04');
  await expect(page.getByTestId('verdict')).toHaveAttribute('data-status', 'MISMATCH');
  await expect(page.getByTestId('verdict')).toContainText('Zły towar');
  await expect(page.locator('[data-testid=pack-photo] [data-tone=bad]')).toHaveCount(1);
  await expect(page.getByTestId('event-log')).toContainText('Ordre 2207: feil stoppet før forsegling');
  await expect(hoodies).toContainText('2'); // caught_at_packing counted for the pair

  await next(page, 'PACK-05');
  await next(page, 'PACK-06');
  await expect(page.getByTestId('verdict')).toHaveAttribute('data-status', 'VERIFIED');
  await next(page, 'PACK-07');
  await expect(page.getByTestId('verdict')).toContainText('2 z 2');
  await expect(page.getByText('Zdjęcie dowodowe zapisane')).toBeVisible();
  await expect(page.getByTestId('event-log')).toContainText('Ordre 2207 verifisert med kamera, 2 av 2 varer');

  // Scene 2: returns in Ukrainian.
  await next(page, 'RET-01');
  await expect(page.getByTestId('station-return')).toHaveAttribute('aria-current', 'true');
  await expect(page.getByText('Manuelt bekreftet, størrelse ikke lest').first()).toBeVisible();
  await expect(page.getByTestId('lang-chip')).toHaveText('NB');

  await next(page, 'RET-02');
  await expect(page.getByTestId('lang-chip')).toHaveText('UK');

  await next(page, 'RET-03');
  await expect(page.getByRole('button', { name: /^Етикетка/ })).toHaveAttribute('aria-current', 'step');

  await next(page, 'RET-04');
  await expect(page.getByText('Розмір: M')).toBeVisible();

  await next(page, 'RET-05');
  await expect(page.getByText('Доставлено не той товар')).toBeVisible();
  await expect(page.getByText('Імовірна помилка пакування')).toBeVisible();

  await next(page, 'RET-06');
  await next(page, 'RET-07');
  await expect(page.getByTestId('grade')).toHaveText('A');
  await expect(page.getByTestId('shelf')).toHaveText('C-14-2');
  await expect(page.getByTestId('refund')).toHaveText('1 499 kr');

  await next(page, 'RET-08');
  await next(page, 'RET-09');
  await expect(page.getByText('Підозріла записка клієнта')).toBeVisible();
  await expect(page.getByTestId('refund')).toHaveText('1 499 kr');
  await expect(page.getByTestId('lead-panel')).toContainText('Mistenkelig kundelapp');

  await next(page, 'RET-10');
  const record = page.getByTestId('return-record');
  await expect(record).toContainText('C-14-2');
  await expect(record).toContainText('1 499 kr');
  await expect(record).toContainText('Mistenkelig kundelapp');
  await expect(record).toContainText('JK-SHELL-L +1');
  await expect(record).toContainText('JK-SHELL-M -1');
  await expect(page.getByTestId('event-log')).toContainText('Retur 1043 bekreftet');
  // The third shell-jacket mix-up in 7 days creates the packing alert (the loop).
  await expect(page.getByTestId('insights')).toContainText('Pakkevarsel aktivt: etikettfoto kreves');

  await next(page, 'RET-11');
  await expect(page.getByTestId('lead-panel')).toContainText('Kundens lapp ber om 5000 kroner');

  // Scene 3: the loop closes. The next shell jacket at packing needs its size label.
  await next(page, 'LOOP-01');
  await expect(page.getByTestId('event-log')).toContainText('Pakkevarsel: Skalljakke M/L forvekslet 3 ganger siste 7 dager');
  await next(page, 'LOOP-02');
  await expect(page.getByTestId('station-pack')).toHaveAttribute('aria-current', 'true');
  await expect(page.getByTestId('lang-chip')).toHaveText('PL');
  await expect(page.getByRole('heading', { name: /#2311/ })).toBeVisible();
  await expect(page.getByTestId('alert-banner')).toBeVisible();
  await expect(page.getByTestId('verdict')).toHaveAttribute('data-status', 'NEEDS_LABEL_PHOTO');
  await next(page, 'LOOP-03');
  await expect(page.getByTestId('verdict')).toHaveAttribute('data-status', 'VERIFIED');
  await expect(page.locator('[data-testid=pack-photo] [data-tone=ok]')).toHaveCount(1);
  await next(page, 'LOOP-04');
  await expect(page.getByTestId('event-log')).toContainText('Ordre 2311 verifisert med kamera, 1 av 1 varer');

  // Back one step replays deterministically; R resets to seed and the run works again.
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByTestId('director-step')).toHaveText('LOOP-03');
  await expect(page.getByTestId('verdict')).toHaveAttribute('data-status', 'VERIFIED');
  await expect(record).toContainText('C-14-2');
  await page.keyboard.press('r');
  await expect(page.getByTestId('director-step')).toHaveText('START');
  await expect(page.getByTestId('event-log')).not.toContainText('bekreftet');
  await expect(page.getByTestId('event-log')).not.toContainText('2207');
  await next(page, 'PACK-01');
  await expect(page.getByTestId('lang-chip')).toHaveText('NB');
  await expect(page.getByTestId('station-pack')).toHaveAttribute('aria-current', 'true');
  await expect(hoodies).toContainText('1');
});
