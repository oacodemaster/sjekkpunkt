import { expect, type Page } from '@playwright/test';
import { DEMO_SCRIPT } from '../../lib/demo/script';

// The scripted run from brief section 10, step by step with what the stage must show. Shared by
// demo.spec.ts (projector, director keys) and stage.spec.ts (after a reset, projector and phone).

export type Stage = 'projector' | 'phone';
const shots = process.env.DEMO_SHOTS; // set to a folder to save a screenshot per step

/** Moves one step with the stage's own controls and waits until the step has run. */
export async function next(page: Page, stage: Stage, id: string) {
  if (stage === 'projector') await page.keyboard.press('ArrowRight');
  else await page.getByRole('button', { name: 'Neste steg' }).click();
  await expect(page.getByTestId(stage === 'projector' ? 'director-step' : 'mobile-step')).toContainText(id);
  // The step has finished running when the busy mark is gone.
  await expect(page.getByTestId('step-running')).toHaveCount(0);
  if (shots) {
    await page.waitForTimeout(700); // let smooth scrolling and the caption typewriter settle
    await page.screenshot({ path: `${shots}/${stage}-${id}.png` });
  }
}

/** On a phone the stage shows either the handheld or Holio; checks which one the step chose. */
async function shows(page: Page, stage: Stage, half: 'phone' | 'office') {
  if (stage !== 'phone') return;
  await expect(page.getByRole('tab', { name: half === 'phone' ? /^Håndholdt/ : 'Holio WMS' })).toHaveAttribute('aria-selected', 'true');
}

/** Opens /demo at START with the director bar (projector) or the phone bar ready. */
export async function openDemo(page: Page, stage: Stage) {
  await page.goto('/demo');
  if (stage === 'projector') {
    await page.keyboard.press('d');
    await expect(page.getByTestId('director-step')).toHaveText('START');
  } else {
    await expect(page.getByTestId('mobile-step')).toContainText('START');
  }
}

/** All 22 steps, PACK-01 to LOOP-04, from START. */
export async function runScript(page: Page, stage: Stage) {
  expect(DEMO_SCRIPT.map((s) => s.id)).toEqual([
    ...['PACK-01', 'PACK-02', 'PACK-03', 'PACK-04', 'PACK-05', 'PACK-06', 'PACK-07'],
    ...['RET-01', 'RET-02', 'RET-03', 'RET-04', 'RET-05', 'RET-06', 'RET-07', 'RET-08', 'RET-09', 'RET-10', 'RET-11'],
    ...['LOOP-01', 'LOOP-02', 'LOOP-03', 'LOOP-04'],
  ]);

  // Scene 1: packing in Polish. The black hoodie is caught, then the right box verifies.
  await next(page, stage, 'PACK-01');
  await expect(page.getByTestId('station-pack')).toHaveAttribute('aria-current', 'true');
  await expect(page.getByRole('heading', { name: 'Ordre #2207' })).toBeVisible();
  const hoodies = page.getByTestId('insights').locator('li', { hasText: 'Hettegenser' });
  await expect(hoodies).toContainText('1');

  await next(page, stage, 'PACK-02');
  await expect(page.getByTestId('lang-chip')).toHaveText('PL');
  await next(page, stage, 'PACK-03');
  await expect(page.getByRole('button', { name: 'Sprawdź', exact: true })).toBeVisible();

  await next(page, stage, 'PACK-04');
  await expect(page.getByTestId('verdict')).toHaveAttribute('data-status', 'MISMATCH');
  await expect(page.getByTestId('verdict')).toContainText('Zły towar');
  await expect(page.locator('[data-testid=pack-photo] [data-tone=bad]')).toHaveCount(1);
  await expect(page.getByTestId('event-log')).toContainText('Ordre 2207: feil stoppet før forsegling');
  await expect(hoodies).toContainText('2'); // caught_at_packing counted for the pair

  await next(page, stage, 'PACK-05');
  await next(page, stage, 'PACK-06');
  await expect(page.getByTestId('verdict')).toHaveAttribute('data-status', 'VERIFIED');
  await next(page, stage, 'PACK-07');
  await expect(page.getByTestId('verdict')).toContainText('2 z 2');
  await expect(page.getByText('Zdjęcie dowodowe zapisane')).toBeVisible();
  await expect(page.getByTestId('event-log')).toContainText('Ordre 2207 verifisert med kamera, 2 av 2 varer');
  await shows(page, stage, 'phone');

  // Scene 2: returns in Ukrainian.
  await next(page, stage, 'RET-01');
  await expect(page.getByTestId('station-return')).toHaveAttribute('aria-current', 'true');
  await expect(page.getByText('Manuelt bekreftet, størrelse ikke lest').first()).toBeVisible();
  await expect(page.getByTestId('lang-chip')).toHaveText('NB');

  await next(page, stage, 'RET-02');
  await expect(page.getByTestId('lang-chip')).toHaveText('UK');

  await next(page, stage, 'RET-03');
  await expect(page.getByRole('button', { name: /^Етикетка/ })).toHaveAttribute('aria-current', 'step');

  await next(page, stage, 'RET-04');
  await expect(page.getByText('Розмір: M')).toBeVisible();

  await next(page, stage, 'RET-05');
  await expect(page.getByText('Доставлено не той товар')).toBeVisible();
  await expect(page.getByText('Імовірна помилка пакування')).toBeVisible();

  await next(page, stage, 'RET-06');
  await next(page, stage, 'RET-07');
  await expect(page.getByTestId('grade')).toHaveText('A');
  await expect(page.getByTestId('shelf')).toHaveText('C-14-2');
  await expect(page.getByTestId('refund')).toHaveText('1 499 kr');

  await next(page, stage, 'RET-08');
  await next(page, stage, 'RET-09');
  await expect(page.getByText('Підозріла записка клієнта')).toBeVisible();
  await expect(page.getByTestId('refund')).toHaveText('1 499 kr');
  await expect(page.getByTestId('lead-panel')).toContainText('Mistenkelig kundelapp');

  await next(page, stage, 'RET-10');
  await shows(page, stage, 'office');
  const record = page.getByTestId('return-record');
  await expect(record).toBeVisible();
  await expect(record).toContainText('C-14-2');
  await expect(record).toContainText('1 499 kr');
  await expect(record).toContainText('Mistenkelig kundelapp');
  await expect(record).toContainText('JK-SHELL-L +1');
  await expect(record).toContainText('JK-SHELL-M -1');
  await expect(page.getByTestId('event-log')).toContainText('Retur 1043 bekreftet');
  // The third shell-jacket mix-up in 7 days creates the packing alert (the loop).
  await expect(page.getByTestId('insights')).toContainText('Pakkevarsel aktivt: etikettfoto kreves');

  await next(page, stage, 'RET-11');
  await expect(page.getByTestId('lead-panel')).toBeVisible();
  await expect(page.getByTestId('lead-panel')).toContainText('Kundens lapp ber om 5000 kroner');

  // Scene 3: the loop closes. The next shell jacket at packing needs its size label.
  await next(page, stage, 'LOOP-01');
  await expect(page.getByTestId('insights')).toBeVisible();
  await expect(page.getByTestId('event-log')).toContainText('Pakkevarsel: Skalljakke M/L forvekslet 3 ganger siste 7 dager');
  await next(page, stage, 'LOOP-02');
  await shows(page, stage, 'phone');
  await expect(page.getByTestId('station-pack')).toHaveAttribute('aria-current', 'true');
  await expect(page.getByTestId('lang-chip')).toHaveText('PL');
  await expect(page.getByRole('heading', { name: /#2311/ })).toBeVisible();
  await expect(page.getByTestId('alert-banner')).toBeVisible();
  await expect(page.getByTestId('verdict')).toHaveAttribute('data-status', 'NEEDS_LABEL_PHOTO');
  await next(page, stage, 'LOOP-03');
  await expect(page.getByTestId('verdict')).toHaveAttribute('data-status', 'VERIFIED');
  await expect(page.locator('[data-testid=pack-photo] [data-tone=ok]')).toHaveCount(1);
  await next(page, stage, 'LOOP-04');
  await expect(page.getByTestId('event-log')).toContainText('Ordre 2311 verifisert med kamera, 1 av 1 varer');
}
