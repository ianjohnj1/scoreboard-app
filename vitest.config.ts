import { defineConfig } from 'vitest/config';

// Separate from vite.config.ts on purpose: the app config has no reason to
// know about the test runner, and vitest doesn't need the dev server's port
// or React plugin to run plain TypeScript unit tests.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
