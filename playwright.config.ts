import { config } from 'dotenv';
import { defineConfig, devices } from '@playwright/test';

config({ path: '.env.local', quiet: true });

// E2E_BASE_URL=https://... runs against a deployment; otherwise a local production server.
const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:3100';

export default defineConfig({
  testDir: 'tests/e2e',
  globalSetup: './tests/e2e/global-setup.ts',
  timeout: 30_000,
  fullyParallel: false,
  workers: 1, // specs share the hosted dev database
  reporter: 'list',
  use: { baseURL, trace: 'retain-on-failure' },
  projects: [{ name: 'handheld', use: { ...devices['Pixel 7'] } }],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: 'pnpm build && pnpm start -p 3100',
        url: baseURL,
        reuseExistingServer: true,
        timeout: 180_000,
        // Live mode with mocked vision and translation (addendum section 11). Both are refused
        // when VERCEL_ENV=production.
        env: { VISION_MOCK: 'fixtures', TRANSLATE_MOCK: 'echo', TTS_MOCK: 'silent' },
      },
});
