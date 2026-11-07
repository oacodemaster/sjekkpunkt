import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import { defineConfig } from 'vitest/config';

config({ path: '.env.local', quiet: true });

// Database tests run against the hosted dev project (no Docker on the build Mac).
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./', import.meta.url)) },
  },
  test: {
    include: ['tests/db/**/*.test.ts'],
    environment: 'node',
    testTimeout: 30000,
    fileParallelism: false,
  },
});
