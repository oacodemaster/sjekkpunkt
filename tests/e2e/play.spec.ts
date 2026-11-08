import { expect, test, type Page } from '@playwright/test';

// The practice demo (/play), the guide (/guide) and the language switcher, without a login.
// The engine runs in the browser on the practice camera; nothing touches the database.
// PLAY_SHOTS=<dir> saves screenshots.

const shots = process.env.PLAY_SHOTS;
const shot = async (page: Page, name: string) => {
  if (shots) await page.screenshot({ path: `${shots}/${name}.png`, fullPage: true });
};
const bench = (page: Page) => page.getByTestId('play-bench');
const shelf = (page: Page, sku: string) => page.locator(`[data-testid=shelf-item][data-sku="${sku}"]`);
const unit = (page: Page, sku: string) => page.locator(`[data-testid=box-unit][data-sku="${sku}"]`);

test('a wrong hoodie is stopped, swapped and sealed', async ({ page }) => {
  await page.goto('/play?lang=en');
  await expect(page.getByTestId('parcel')).toHaveCount(5);
  await shot(page, 'play-1-picker');
  await page.locator('[data-testid=parcel][data-order="4102"]').click();
  await shelf(page, 'HD-BLACK-M').click();
  await shelf(page, 'SK-WOOL-40').click();
  await page.getByTestId('play-check').click();
  await expect(bench(page)).toHaveAttribute('data-status', 'MISMATCH');
  await expect(page.getByTestId('verdict')).toContainText('Wrong item');
  await expect(unit(page, 'HD-BLACK-M')).toHaveAttribute('data-tone', 'bad');
  await expect(unit(page, 'SK-WOOL-40')).toHaveAttribute('data-tone', 'ok');
  await expect(page.getByTestId('mixups')).toContainText('1/3');
  await shot(page, 'play-2-wrong');

  // Changing the box hides the old verdict until it is checked again; no seal on a stale check.
  await unit(page, 'HD-BLACK-M').click();
  await expect(page.getByTestId('box-changed')).toBeVisible();
  await expect(page.getByTestId('play-seal')).toHaveCount(0);
  await shelf(page, 'HD-NAVY-M').click();
  await page.getByTestId('play-check').click();
  await expect(bench(page)).toHaveAttribute('data-status', 'VERIFIED');
  await page.getByTestId('play-seal').click();
  await expect(page.getByTestId('sealed')).toBeVisible();
  await shot(page, 'play-3-sealed');
});

test('a T-shirt size needs the label; three mix-ups raise a packing alert', async ({ page }) => {
  await page.goto('/play?lang=en');
  for (let round = 1; round <= 3; round++) {
    await page.locator('[data-testid=parcel][data-order="4103"]').click();
    for (const sku of ['TS-WHITE-M', 'TS-WHITE-L', 'CA-BLACK']) await shelf(page, sku).click();
    await page.getByTestId('play-check').click();
    await expect(bench(page)).toHaveAttribute('data-status', 'NEEDS_LABEL_PHOTO');
    await page.getByTestId('play-label').click();
    await expect(page.getByTestId('label-result')).toContainText('L');
    await expect(bench(page)).toHaveAttribute('data-status', 'MISMATCH');
    if (round === 1) await shot(page, 'play-4-label');
    await page.getByRole('button', { name: 'Pick another parcel' }).first().click();
  }
  await expect(page.getByTestId('new-alert')).toContainText('New packing alert');
  await expect(page.getByTestId('mixups')).toContainText('3/3');
  // The session's alert now applies to the parcel: right sizes still need the label shown.
  await page.locator('[data-testid=parcel][data-order="4103"]').click();
  await expect(page.getByTestId('alert-banner')).toBeVisible();
});

test('the language switcher changes the page and is remembered', async ({ page }) => {
  await page.goto('/play?lang=en');
  await page.locator('[data-testid=parcel][data-order="4101"]').click();
  await page.getByTestId('language-switcher').first().selectOption('pl');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Zamówienie #4101');
  // The screen switches at once; the choice is stored by a server action a moment later.
  await expect.poll(async () => (await page.context().cookies()).find((c) => c.name === 'sp_lang')?.value).toBe('pl');
  // Remembered on the device: the start page and the guide follow (the guide falls back to English).
  await page.goto('/');
  await expect(page.getByTestId('start-play')).toHaveText('Wypróbuj sam');
  await page.goto('/guide');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('How Sjekkpunkt works');
  await page.getByTestId('language-switcher').first().selectOption('nb');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Slik virker Sjekkpunkt');
  await shot(page, 'guide-nb');
});

test('the guide and the practice demo need no login and load their sample photos', async ({ page }) => {
  for (const path of ['/guide', '/play']) {
    const res = await page.goto(path);
    expect(res?.status(), path).toBe(200);
    await expect(page).toHaveURL(new RegExp(`${path}$`));
  }
  for (const src of ['/sample/scenes/packing.webp', '/sample/products/hoodie-navy.webp', '/sample/box-open.webp']) {
    const r = await page.request.get(src);
    expect(r.status(), src).toBe(200);
  }
});

test('a worker switches language in the handheld header; it becomes their language', async ({ page }) => {
  const { login, sql } = await import('./helpers');
  const lang = async () =>
    (await sql<{ preferred_lang: string }>(`select p.preferred_lang from profiles p join auth.users u on u.id = p.user_id where u.email = 'packer@sjekkpunkt.test'`))[0].preferred_lang;
  const before = await lang();
  const target = before === 'ro' ? 'lt' : 'ro';
  try {
    await login(page, 'packer');
    await page.goto('/device');
    await page.getByRole('button', { name: 'device-01' }).click();
    await page.waitForURL((u) => u.pathname === '/pack');
    await page.getByTestId('language-switcher').selectOption(target);
    await expect.poll(lang).toBe(target);
    await expect(page.getByTestId('language-switcher')).toHaveValue(target);
    await page.reload();
    await expect(page.getByTestId('language-switcher')).toHaveValue(target);
  } finally {
    await sql(`update profiles set preferred_lang = $1 where user_id = (select id from auth.users where email = 'packer@sjekkpunkt.test')`, [before]);
  }
});
