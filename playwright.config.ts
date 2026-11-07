import { config } from 'dotenv';
import { defineConfig, devices } from '@playwright/test';

config({ path: '.env.local', quiet: true });

// E2E_BASE_URL=https://... runs against a deployment; otherwise a local production server.
const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:3100';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30_000,
  fullyParallel: false,
  reporter: 'list',
  use: { baseURL, trace: 'retain-on-failure' },
  projects: [{ name: 'handheld', use: { ...devices['Pixel 7'] } }],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : { command: 'pnpm build && pnpm start -p 3100', url: baseURL, reuseExistingServer: true, timeout: 180_000 },
});
