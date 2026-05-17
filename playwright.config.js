import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30 * 1000,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:1420',
    headless: true,
    viewport: { width: 1280, height: 800 },
  },
  webServer: {
    command: 'npm run dev',
    port: 1420,
    timeout: 60 * 1000,
    reuseExistingServer: true,
  },
});
