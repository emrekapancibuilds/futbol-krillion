import { defineConfig } from '@playwright/test';
export default defineConfig({ testDir: './tests/browser', fullyParallel: false, workers: 1, timeout: 45000,
  use: { baseURL: 'http://localhost:3100', browserName: 'chromium', headless: true, trace: 'retain-on-failure' },
  reporter: [['list']],
  webServer: { env: { FK_DISABLE_BUILD_CACHE: 'true' }, command: 'npm run dev -- --webpack --port 3100', url: 'http://localhost:3100', reuseExistingServer: process.env.FK_E2E_REUSE_SERVER === 'true', timeout: 120000 },
});
