import { expect, test, type Page } from '@playwright/test';

const pw = (role: string) => process.env[`SEED_PASSWORD_${role.toUpperCase()}`]!;

async function login(page: Page, role: string) {
  await page.goto('/login');
  await page.getByLabel(/E-post/).fill(`${role}@sjekkpunkt.test`);
  await page.getByLabel(/Passord/).fill(pw(role));
  await page.getByRole('button', { name: 'Logg inn' }).click();
}

test('signed-out visitors are sent to login', async ({ page }) => {
  await page.goto('/pack');
  await expect(page).toHaveURL(/\/login\?next=%2Fpack/);
  const api = await page.request.get('/api/health');
  expect(api.ok()).toBe(true);
});

test('wrong password shows an error', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel(/E-post/).fill('packer@sjekkpunkt.test');
  await page.getByLabel(/Passord/).fill('wrong-password');
  await page.getByRole('button', { name: 'Logg inn' }).click();
  await expect(page.getByText('Wrong email or password')).toBeVisible();
});

test('packer picks a device, lands on the pack queue in Polish, and cannot open lead pages', async ({ page }) => {
  await login(page, 'packer');
  await expect(page).toHaveURL(/\/device/);
  await page.getByRole('button', { name: 'device-07' }).click();
  await expect(page).toHaveURL(/\/pack$/);
  await expect(page.getByRole('heading', { name: 'Zamówienia do spakowania' })).toBeVisible();
  await expect(page.getByText('#2207')).toBeVisible();
  await expect(page.getByText('#2311')).toBeVisible();
  await expect(page.getByText('device-07')).toBeVisible();

  await page.goto('/lead');
  await expect(page).toHaveURL(/\/pack$/);
  await page.goto('/return');
  await expect(page).toHaveURL(/\/pack$/);
});

test('returns worker lands on the return queue in Ukrainian with return 1043', async ({ page }) => {
  await login(page, 'returns');
  await page.getByRole('button', { name: 'device-03' }).click();
  await expect(page).toHaveURL(/\/return$/);
  await expect(page.getByRole('heading', { name: 'Повернення на перевірку' })).toBeVisible();
  await expect(page.getByText('#1043')).toBeVisible();
  await page.goto('/admin');
  await expect(page).toHaveURL(/\/return$/);
});

test('lead lands on the lead console and sees the audit log and insights', async ({ page }) => {
  await login(page, 'lead');
  await expect(page).toHaveURL(/\/lead$/);
  await expect(page.getByRole('heading', { name: 'Teamleder' })).toBeVisible();
  await expect(page.getByText('Demodata lastet inn')).toBeVisible();
  await page.goto('/insights');
  await expect(page.getByText('JK-SHELL-L / JK-SHELL-M')).toBeVisible();
  await expect(page.getByText('Ingen statistikk per ansatt')).toBeVisible();
  await page.goto('/admin');
  await expect(page).toHaveURL(/\/lead$/);
});

test('admin lands on admin and sees settings and users', async ({ page }) => {
  await login(page, 'admin');
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByTestId('settings-form').locator('input[name="return_window_days"]')).toHaveValue('30');
  await expect(page.getByRole('cell', { name: 'Teamleder' }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Logg ut' }).click();
  await expect(page).toHaveURL(/\/login/);
});
