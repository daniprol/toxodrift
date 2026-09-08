import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    include: ['tests/{unit,integration}/**/*.test.ts', 'server/tests/**/*.test.ts'],
    testTimeout: 30000,
  },
});
