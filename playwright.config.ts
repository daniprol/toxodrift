import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  use: { baseURL: 'http://127.0.0.1:4317', trace: 'retain-on-failure' },
  webServer: [
    {
      command: 'pnpm dev --port 4317 --strictPort',
      url: 'http://127.0.0.1:4317',
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'pnpm build:server && pnpm start:server',
      url: 'http://127.0.0.1:2568/health',
      env: { PORT: '2568', ALLOWED_ORIGINS: 'http://127.0.0.1:4317', DATABASE_PATH: ':memory:' },
      reuseExistingServer: false,
    },
  ],
});
