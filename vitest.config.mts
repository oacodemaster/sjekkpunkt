import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./', import.meta.url)) },
  },
  test: {
    // Unit tests are pure and run offline. Database tests live in tests/db and run via `pnpm test:db`.
    include: ['lib/**/*.test.ts'],
    environment: 'node',
  },
});
