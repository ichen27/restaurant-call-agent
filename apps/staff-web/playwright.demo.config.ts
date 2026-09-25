import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './e2e',
  testMatch: 'demo.spec.ts',
  workers: 1,
  retries: 0,
  use: { baseURL: 'http://127.0.0.1:43179', trace: 'retain-on-failure' },
  webServer: {
    command: 'PORT=43179 npm --prefix ../.. run demo',
    url: 'http://127.0.0.1:43179/health',
    reuseExistingServer: false,
    timeout: 120000
  }
});
